import uuid
from datetime import datetime, date as py_date, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import cast, Date, func, text
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.models.booking import Booking, BookingStatus, Service, ServiceType
from app.models.vehicle import Vehicle
from app.models.user import User, UserRole
from app.core.limiter import limiter
from app.schemas.booking import BookingCreate, BookingLookup, BookingRead, StatusUpdate
from app.schemas.mechanic import AssignMechanicPayload
from app.core.security import get_current_user, get_optional_current_user, require_admin, hash_password
from app.utils.email import send_email
from app.utils.admin_notify import notify_admin
from app.utils.google_calendar import create_booking_event, delete_booking_event
from app.services.availability import (
    calculate_slot_availability,
    get_day_availability,
    find_alternative_slots,
    get_active_mechanics_for_slot,
)

router = APIRouter()


@router.get("/availability")
def check_availability(
    service_id: int = Query(..., description="ID of the service"),
    date: str = Query(..., description="Date in YYYY-MM-DD format"),
    db: Session = Depends(get_db)
):
    """
    FEATURE 1: Calculate real-time slot availability directly from the database.
    Dynamically marks slots as available, lead-time restricted, or full.
    """
    try:
        target_date = datetime.strptime(date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(
            status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")

    service = db.query(Service).filter(
        Service.id == service_id, Service.is_active == True).first()
    if not service:
        raise HTTPException(
            status_code=404, detail="Service not found or inactive")

    slots = get_day_availability(
        db, service_id=service_id, target_date=target_date)
    return {
        "service_id": service.id,
        "service_name": service.name,
        "service_type": service.service_type.value,
        "date": target_date.isoformat(),
        "slots": slots
    }


@router.post("/", response_model=BookingRead, status_code=201)
def create_booking(
    payload: BookingCreate,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_current_user),
):
    # 1. Resolve or create user (Guest Booking Support)
    user = None
    if current_user:
        # A logged-in user always books for themselves, whatever email is typed in the form.
        user = current_user
    elif payload.customer_email and payload.customer_email.strip():
        email_clean = payload.customer_email.strip().lower()
        user = db.query(User).filter(
            func.lower(User.email) == email_clean).first()
        if not user:
            random_pw = str(uuid.uuid4())
            user = User(
                full_name=(payload.customer_name or "Guest Customer").strip(),
                email=email_clean,
                phone=(payload.customer_phone or "").strip(),
                hashed_password=hash_password(random_pw),
                role=UserRole.CUSTOMER,
                is_active=True,
            )
            db.add(user)
            db.flush()
        else:
            if payload.customer_name and (not user.full_name or user.full_name == "Guest Customer"):
                user.full_name = payload.customer_name.strip()
            if payload.customer_phone and not user.phone:
                user.phone = payload.customer_phone.strip()
            db.flush()
    else:
        raise HTTPException(
            status_code=400,
            detail="Guest details required: customer_name, customer_email, customer_phone."
        )

    # 2. Resolve or create vehicle
    vehicle = None
    if payload.vehicle_registration and payload.vehicle_registration.strip():
        reg_clean = payload.vehicle_registration.strip().upper()
        vehicle = db.query(Vehicle).filter(func.upper(
            Vehicle.registration) == reg_clean).first()
        if not vehicle:
            vehicle = Vehicle(
                owner_id=user.id,
                make=(payload.vehicle_make or "Unknown").strip(),
                model=(payload.vehicle_model or "Unknown").strip(),
                year=payload.vehicle_year or datetime.now().year,
                registration=reg_clean,
                notes=payload.notes,
            )
            db.add(vehicle)
            db.flush()
        else:
            if vehicle.owner_id != user.id:
                vehicle.owner_id = user.id
                db.flush()
    elif payload.vehicle_id:
        vehicle = db.query(Vehicle).filter(
            Vehicle.id == payload.vehicle_id).first()
        if not vehicle:
            raise HTTPException(status_code=404, detail="Vehicle not found")
        if current_user and vehicle.owner_id != current_user.id:
            raise HTTPException(
                status_code=404, detail="Vehicle not found or does not belong to your account")
    else:
        raise HTTPException(
            status_code=400,
            detail="Vehicle details required: vehicle_make, vehicle_model, vehicle_year, vehicle_registration."
        )

    # 3. Validate service eligibility (FEATURE 3)
    service = db.query(Service).filter(
        Service.id == payload.service_id, Service.is_active == True).first()
    if not service:
        raise HTTPException(
            status_code=404, detail="Service not found or inactive")

    if service.service_type == ServiceType.ROADSIDE:
        raise HTTPException(
            status_code=400, detail="Roadside emergencies must be requested via the /emergency portal")

    if service.service_type == ServiceType.HOME and (not payload.address or not payload.address.strip()):
        raise HTTPException(
            status_code=400, detail="Home address is required for home service bookings")

    # 4. Concurrency Protection & Transaction Locking (FEATURE 1 & FEATURE 3)
    slot_iso = payload.scheduled_at.replace(microsecond=0).isoformat()
    lock_key = f"slot_{service.service_type.value}_{slot_iso}"
    try:
        db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:k))"), {
                   "k": lock_key})
    except Exception:
        pass

    # 5. Prevent accidental duplicate submissions (FEATURE 3)
    recent_dup = db.query(Booking).filter(
        Booking.customer_id == user.id,
        Booking.vehicle_id == vehicle.id,
        Booking.service_id == payload.service_id,
        Booking.scheduled_at == payload.scheduled_at,
        Booking.status != BookingStatus.CANCELLED
    ).first()
    if recent_dup:
        raise HTTPException(
            status_code=400, detail="You already have an active booking for this vehicle, service, and time.")

    # 6. Prevent conflicting bookings for the SAME vehicle and time (FEATURE 3)
    service_duration = service.duration_minutes or 60
    slot_end = payload.scheduled_at + timedelta(minutes=service_duration)

    vehicle_conflict = (
        db.query(Booking)
        .join(Service)
        .filter(
            Booking.vehicle_id == vehicle.id,
            Booking.status.in_([
                BookingStatus.PENDING,
                BookingStatus.CONFIRMED,
                BookingStatus.ASSIGNED,
                BookingStatus.IN_PROGRESS,
            ]),
            Booking.scheduled_at < slot_end,
            func.timezone('UTC', Booking.scheduled_at) + (func.coalesce(
                Service.duration_minutes, 60) * text("interval '1 minute'")) > payload.scheduled_at
        )
        .first()
    )
    if vehicle_conflict:
        raise HTTPException(
            status_code=409,
            detail=f"Conflicting booking: Vehicle is already scheduled for #{vehicle_conflict.id} ({vehicle_conflict.service.name}) during this time window."
        )

    # 7. Check active bookings for the same service on this vehicle (FEATURE 3)
    now_utc = datetime.now(timezone.utc)
    same_svc_active = db.query(Booking).filter(
        Booking.vehicle_id == vehicle.id,
        Booking.service_id == payload.service_id,
        Booking.status.in_(
            [BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.ASSIGNED]),
        Booking.scheduled_at >= now_utc
    ).first()
    if same_svc_active:
        raise HTTPException(
            status_code=409,
            detail=f"This vehicle already has an upcoming active booking for {service.name} on {same_svc_active.scheduled_at.strftime('%Y-%m-%d %H:%M UTC')}."
        )

    # 8. Daily 5-booking limit check
    target_date = payload.scheduled_at.date()
    daily_count = db.query(Booking).filter(
        Booking.customer_id == user.id,
        cast(Booking.scheduled_at, Date) == target_date,
        Booking.status != BookingStatus.CANCELLED
    ).count()

    if daily_count >= 5:
        raise HTTPException(
            status_code=400,
            detail="Daily booking limit reached (5). Please choose another day."
        )

    # 9. Slot capacity & lead time verification (FEATURE 1)
    slot_info = calculate_slot_availability(
        db=db,
        service=service,
        slot_start=payload.scheduled_at,
        slot_end=slot_end,
        now=now_utc
    )
    if not slot_info["is_available"]:
        alternatives = find_alternative_slots(
            db, service=service, from_date=target_date)
        alt_str = f" Suggested alternative times: {', '.join(alternatives[:3])}." if alternatives else ""
        raise HTTPException(
            status_code=409,
            detail=f"Requested appointment slot is unavailable: {slot_info['reason']}.{alt_str}"
        )

    # 10. Auto-assign mechanic for home service if available (FEATURE 2)
    assigned_mechanic_id = None
    if service.service_type == ServiceType.HOME:
        free_mechanic_ids = slot_info.get("available_mechanic_ids", [])
        if free_mechanic_ids:
            assigned_mechanic_id = free_mechanic_ids[0]

    initial_status = BookingStatus.ASSIGNED if assigned_mechanic_id else BookingStatus.PENDING

    booking = Booking(
        customer_id=user.id,
        vehicle_id=vehicle.id,
        service_id=payload.service_id,
        mechanic_id=assigned_mechanic_id,
        scheduled_at=payload.scheduled_at,
        address=payload.address,
        notes=payload.notes,
        status=initial_status
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)

    # 10b. Google Calendar event on the business calendar; the customer is invited by email.
    #      Best-effort: a calendar failure never fails the booking.
    event_id = create_booking_event(booking, user, service, vehicle)
    if event_id:
        booking.google_event_id = event_id
        db.commit()
        db.refresh(booking)

    # 10c. Tell staff when the customer left a note, so it is not missed.
    if booking.notes and booking.notes.strip():
        try:
            notify_admin(
                subject=f"Customer note on booking #{booking.id} - {service.name}",
                body=(
                    f"A customer left a note with their booking.\n\n"
                    f"Booking: #{booking.id} ({service.name})\n"
                    f"When: {booking.scheduled_at.strftime('%Y-%m-%d %H:%M UTC')}\n"
                    f"Customer: {user.full_name} | {user.phone} | {user.email}\n"
                    f"Vehicle: {vehicle.year} {vehicle.make} {vehicle.model} ({vehicle.registration})\n"
                    + (f"Address: {booking.address}\n" if booking.address else "")
                    + f"\nNote:\n{booking.notes.strip()}\n"
                ),
            )
        except Exception as notify_err:
            print(f"[ADMIN NOTIFY ERROR] {notify_err}")

    # 11. Confirmation email, sent AFTER the calendar step so it can say whether the
    #     event was added. Sent even if the calendar failed.
    try:
        recipient_email = user.email or payload.customer_email
        if recipient_email:
            sched_str = booking.scheduled_at.strftime('%Y-%m-%d %H:%M UTC')
            state = "confirmed" if initial_status == BookingStatus.ASSIGNED else "received"
            email_body = (
                f"Hello {user.full_name},\n\n"
                f"Your booking for {service.name} has been {state}.\n\n"
                f"Booking ID: #{booking.id}\n"
                f"Vehicle: {vehicle.year} {vehicle.make} {vehicle.model} ({vehicle.registration})\n"
                f"Scheduled Time: {sched_str}\n"
                f"Price: Rs. {service.base_price:.2f}\n"
            )
            if booking.address:
                email_body += f"Service Address: {booking.address}\n"
            if event_id:
                email_body += ("\nA Google Calendar invitation has also been sent to this "
                               "address - accept it to add the appointment to your calendar.\n")
            email_body += "\nThank you for choosing Car Assistance!\nCar Assistance Team"
            send_email(
                to_email=recipient_email,
                subject=f"Booking Confirmation #{booking.id} - Car Assistance",
                body=email_body,
            )
    except Exception as email_err:
        print(f"[BOOKING CONFIRMATION EMAIL ERROR] {email_err}")

    return (
        db.query(Booking)
        .options(
            joinedload(Booking.customer),
            joinedload(Booking.vehicle),
            joinedload(Booking.service),
            joinedload(Booking.mechanic)
        )
        .filter(Booking.id == booking.id)
        .first()
    )


def _remove_calendar_event(db: Session, booking: Booking) -> None:
    """Delete the Google Calendar event (guest gets a cancellation) once a booking is cancelled."""
    if booking.google_event_id and delete_booking_event(booking.google_event_id):
        booking.google_event_id = None
        db.commit()
        db.refresh(booking)


def _phone_key(phone: str | None) -> str:
    """Digits only, last 10 — so '+92 300 1234567' matches '0300-1234567'."""
    digits = "".join(ch for ch in (phone or "") if ch.isdigit())
    return digits[-10:]


@router.post("/lookup", response_model=list[BookingRead])
@limiter.limit("10/minute")
def lookup_my_bookings(
    request: Request,
    payload: BookingLookup,
    db: Session = Depends(get_db),
):
    """
    Guest-friendly 'My bookings'. Returns every booking (all services, dates,
    statuses incl. cancelled) for the customer whose email AND phone match.
    Same generic error for any mismatch, so it can't be used to probe emails.
    """
    email_clean = payload.email.strip().lower()
    user = db.query(User).filter(func.lower(User.email) == email_clean).first()

    phone_key = _phone_key(payload.phone)
    if (
        not user
        or len(phone_key) < 7
        or _phone_key(user.phone) != phone_key
    ):
        raise HTTPException(
            status_code=404, detail="No bookings found for these details.")

    return (
        db.query(Booking)
        .options(
            joinedload(Booking.customer),
            joinedload(Booking.vehicle),
            joinedload(Booking.service),
            joinedload(Booking.mechanic)
        )
        .filter(Booking.customer_id == user.id)
        .order_by(Booking.scheduled_at.desc())
        .all()
    )


@router.get("/my", response_model=list[BookingRead])
def get_my_bookings(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return (
        db.query(Booking)
        .options(
            joinedload(Booking.customer),
            joinedload(Booking.vehicle),
            joinedload(Booking.service),
            joinedload(Booking.mechanic)
        )
        .filter(Booking.customer_id == current_user.id)
        .order_by(Booking.scheduled_at.desc())
        .all()
    )


@router.get("/all", response_model=list[BookingRead])
def get_all_bookings(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    return (
        db.query(Booking)
        .options(
            joinedload(Booking.customer),
            joinedload(Booking.vehicle),
            joinedload(Booking.service),
            joinedload(Booking.mechanic)
        )
        .order_by(Booking.scheduled_at.desc())
        .all()
    )


_BOOKING_LOADERS = (
    joinedload(Booking.customer),
    joinedload(Booking.vehicle),
    joinedload(Booking.service),
    joinedload(Booking.mechanic),
)


@router.get("/{booking_id}", response_model=BookingRead)
def get_booking_by_id(
    booking_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Booking details for the owner (or an admin). Guests use POST /{id}/view."""
    query = db.query(Booking).options(*_BOOKING_LOADERS).filter(Booking.id == booking_id)
    if current_user.role != UserRole.ADMIN:
        query = query.filter(Booking.customer_id == current_user.id)

    booking = query.first()
    if not booking:
        raise HTTPException(
            status_code=404, detail="Booking not found or not authorized")
    return booking


@router.post("/{booking_id}/view", response_model=BookingRead)
@limiter.limit("20/minute")
def view_booking_as_guest(
    request: Request,
    booking_id: int,
    payload: BookingLookup,
    db: Session = Depends(get_db),
):
    """Guest booking details: the booking must belong to the customer whose email AND phone match."""
    email_clean = payload.email.strip().lower()
    user = db.query(User).filter(func.lower(User.email) == email_clean).first()
    phone_key = _phone_key(payload.phone)
    booking = None
    if user and len(phone_key) >= 7 and _phone_key(user.phone) == phone_key:
        booking = (
            db.query(Booking).options(*_BOOKING_LOADERS)
            .filter(Booking.id == booking_id, Booking.customer_id == user.id)
            .first()
        )
    if not booking:
        raise HTTPException(
            status_code=404, detail="Booking not found or not authorized")
    return booking


@router.patch("/{booking_id}/assign", response_model=BookingRead)
def assign_mechanic_to_booking(
    booking_id: int,
    payload: AssignMechanicPayload,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    FEATURE 2: Assign or reassign a mechanic to a booking.
    Prevents assigning one mechanic to overlapping appointments or breaks.
    Accounts for service duration and travel buffer.
    """
    booking = (
        db.query(Booking)
        .options(
            joinedload(Booking.customer),
            joinedload(Booking.vehicle),
            joinedload(Booking.service)
        )
        .filter(Booking.id == booking_id)
        .first()
    )
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    mechanic = db.query(User).filter(
        User.id == payload.mechanic_id,
        User.role == UserRole.MECHANIC,
        User.is_active == True
    ).first()
    if not mechanic:
        raise HTTPException(
            status_code=404, detail="Active mechanic not found")

    duration = booking.service.duration_minutes if booking.service else 60
    slot_start = booking.scheduled_at
    slot_end = booking.scheduled_at + timedelta(minutes=duration)
    is_home = booking.service and booking.service.service_type == ServiceType.HOME
    buffer_mins = 30 if is_home else 0

    available_mechs = get_active_mechanics_for_slot(
        db=db,
        slot_start=slot_start,
        slot_end=slot_end,
        travel_buffer_minutes=buffer_mins,
        exclude_booking_id=booking.id
    )

    if mechanic.id not in [m.id for m in available_mechs]:
        raise HTTPException(
            status_code=409,
            detail=f"Mechanic {mechanic.full_name} is unavailable at this time due to schedule, break, or overlapping appointment."
        )

    booking.mechanic_id = mechanic.id
    if booking.status in [BookingStatus.PENDING, BookingStatus.CONFIRMED]:
        booking.status = BookingStatus.ASSIGNED

    db.commit()
    db.refresh(booking)

    return (
        db.query(Booking)
        .options(
            joinedload(Booking.customer),
            joinedload(Booking.vehicle),
            joinedload(Booking.service),
            joinedload(Booking.mechanic)
        )
        .filter(Booking.id == booking.id)
        .first()
    )


@router.patch("/{booking_id}/cancel", response_model=BookingRead)
def cancel_booking(
    booking_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    Cancels a booking. Capacity is automatically restored upon cancellation.
    """
    query = db.query(Booking).filter(Booking.id == booking_id)
    if current_user.role != UserRole.ADMIN:
        query = query.filter(Booking.customer_id == current_user.id)

    booking = query.first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    booking.status = BookingStatus.CANCELLED
    db.commit()
    db.refresh(booking)

    _remove_calendar_event(db, booking)

    return (
        db.query(Booking)
        .options(
            joinedload(Booking.customer),
            joinedload(Booking.vehicle),
            joinedload(Booking.service),
            joinedload(Booking.mechanic)
        )
        .filter(Booking.id == booking.id)
        .first()
    )


@router.patch("/{booking_id}/status", response_model=BookingRead)
def update_status(booking_id: int, payload: StatusUpdate, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    booking = db.query(Booking).options(
        joinedload(Booking.customer),
        joinedload(Booking.vehicle),
        joinedload(Booking.service),
        joinedload(Booking.mechanic)
    ).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    booking.status = payload.status
    db.commit()
    db.refresh(booking)

    if payload.status.lower() == "cancelled":
        _remove_calendar_event(db, booking)

    # When booking status is updated to confirmed, notify the customer via email
    if payload.status.lower() == "confirmed":
        customer = booking.customer
        service = booking.service
        vehicle = booking.vehicle
        if customer and customer.email:
            subject = f"Your Car Assistance Booking #{booking.id} is Confirmed"
            service_name = service.name if service else "Service"
            vehicle_info = f"{vehicle.year} {vehicle.make} {vehicle.model} ({vehicle.registration})" if vehicle else "Vehicle"
            sched_str = booking.scheduled_at.strftime('%Y-%m-%d %H:%M UTC') if hasattr(
                booking.scheduled_at, 'strftime') else str(booking.scheduled_at)

            body = (
                f"Hello {customer.full_name},\n\n"
                f"Your booking #{booking.id} with Car Assistance has been confirmed!\n\n"
                f"Details:\n"
                f"- Service: {service_name}\n"
                f"- Vehicle: {vehicle_info}\n"
                f"- Scheduled Time: {sched_str}\n"
            )
            if booking.address:
                body += f"- Service Location: {booking.address}\n"
            body += (
                f"\nThank you for choosing Car Assistance.\n"
                f"If you have any questions, you can contact our dispatch team or use the AI assistant on our portal."
            )

            send_email(to_email=customer.email, subject=subject, body=body)

    return booking
