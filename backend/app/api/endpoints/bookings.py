from datetime import datetime, date as py_date, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import cast, Date, func, text
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.models.booking import Booking, BookingStatus, Service, ServiceType
from app.models.vehicle import Vehicle
from app.models.user import User, UserRole
from app.schemas.booking import BookingCreate, BookingRead, StatusUpdate
from app.schemas.mechanic import AssignMechanicPayload
from app.core.security import get_current_user, require_admin
from app.utils.email import send_email
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
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")

    service = db.query(Service).filter(Service.id == service_id, Service.is_active == True).first()
    if not service:
        raise HTTPException(status_code=404, detail="Service not found or inactive")

    slots = get_day_availability(db, service_id=service_id, target_date=target_date)
    return {
        "service_id": service.id,
        "service_name": service.name,
        "service_type": service.service_type.value,
        "date": target_date.isoformat(),
        "slots": slots
    }


@router.post("/", response_model=BookingRead, status_code=201)
def create_booking(payload: BookingCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    # 1. Validate ownership of the selected vehicle (FEATURE 3)
    vehicle = db.query(Vehicle).filter(
        Vehicle.id == payload.vehicle_id, Vehicle.owner_id == current_user.id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found or does not belong to your account")

    # 2. Validate service eligibility (FEATURE 3)
    service = db.query(Service).filter(
        Service.id == payload.service_id, Service.is_active == True).first()
    if not service:
        raise HTTPException(status_code=404, detail="Service not found or inactive")

    if service.service_type == ServiceType.ROADSIDE:
        raise HTTPException(status_code=400, detail="Roadside emergencies must be requested via the /emergency portal")

    if service.service_type == ServiceType.HOME and (not payload.address or not payload.address.strip()):
        raise HTTPException(status_code=400, detail="Home address is required for home service bookings")

    # 3. Concurrency Protection & Transaction Locking (FEATURE 1 & FEATURE 3)
    # Uses PostgreSQL advisory transaction lock on slot key to serialize simultaneous booking attempts on the same slot
    slot_iso = payload.scheduled_at.replace(microsecond=0).isoformat()
    lock_key = f"slot_{service.service_type.value}_{slot_iso}"
    try:
        db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:k))"), {"k": lock_key})
    except Exception:
        pass  # Fallback if dialect does not support pg advisory lock

    # 4. Prevent accidental duplicate submissions (FEATURE 3)
    # Check if exact duplicate was submitted recently
    recent_dup = db.query(Booking).filter(
        Booking.customer_id == current_user.id,
        Booking.vehicle_id == payload.vehicle_id,
        Booking.service_id == payload.service_id,
        Booking.scheduled_at == payload.scheduled_at,
        Booking.status != BookingStatus.CANCELLED
    ).first()
    if recent_dup:
        raise HTTPException(status_code=400, detail="You already have an active booking for this vehicle, service, and time.")

    # 5. Prevent conflicting bookings for the SAME vehicle and time (FEATURE 3)
    service_duration = service.duration_minutes or 60
    slot_end = payload.scheduled_at + timedelta(minutes=service_duration)

    vehicle_conflict = (
        db.query(Booking)
        .join(Service)
        .filter(
            Booking.vehicle_id == payload.vehicle_id,
            Booking.status.in_([
                BookingStatus.PENDING,
                BookingStatus.CONFIRMED,
                BookingStatus.ASSIGNED,
                BookingStatus.IN_PROGRESS,
            ]),
            Booking.scheduled_at < slot_end,
            func.timezone('UTC', Booking.scheduled_at) + (func.coalesce(Service.duration_minutes, 60) * text("interval '1 minute'")) > payload.scheduled_at
        )
        .first()
    )
    if vehicle_conflict:
        raise HTTPException(
            status_code=409,
            detail=f"Conflicting booking: Vehicle is already scheduled for #{vehicle_conflict.id} ({vehicle_conflict.service.name}) during this time window."
        )

    # 6. Check active bookings for the same service on this vehicle (FEATURE 3)
    now_utc = datetime.now(timezone.utc)
    same_svc_active = db.query(Booking).filter(
        Booking.vehicle_id == payload.vehicle_id,
        Booking.service_id == payload.service_id,
        Booking.status.in_([BookingStatus.PENDING, BookingStatus.CONFIRMED, BookingStatus.ASSIGNED]),
        Booking.scheduled_at >= now_utc
    ).first()
    if same_svc_active:
        raise HTTPException(
            status_code=409,
            detail=f"This vehicle already has an upcoming active booking for {service.name} on {same_svc_active.scheduled_at.strftime('%Y-%m-%d %H:%M UTC')}."
        )

    # 7. Daily 5-booking limit check
    target_date = payload.scheduled_at.date()
    daily_count = db.query(Booking).filter(
        Booking.customer_id == current_user.id,
        cast(Booking.scheduled_at, Date) == target_date,
        Booking.status != BookingStatus.CANCELLED
    ).count()

    if daily_count >= 5:
        raise HTTPException(
            status_code=400,
            detail="Daily booking limit reached (5). Please choose another day."
        )

    # 8. Slot capacity & lead time verification (FEATURE 1)
    slot_info = calculate_slot_availability(
        db=db,
        service=service,
        slot_start=payload.scheduled_at,
        slot_end=slot_end,
        now=now_utc
    )
    if not slot_info["is_available"]:
        alternatives = find_alternative_slots(db, service=service, from_date=target_date)
        alt_str = f" Suggested alternative times: {', '.join(alternatives[:3])}." if alternatives else ""
        raise HTTPException(
            status_code=409,
            detail=f"Requested appointment slot is unavailable: {slot_info['reason']}.{alt_str}"
        )

    # 9. Auto-assign mechanic for home service if available (FEATURE 2)
    assigned_mechanic_id = None
    if service.service_type == ServiceType.HOME:
        free_mechanic_ids = slot_info.get("available_mechanic_ids", [])
        if free_mechanic_ids:
            assigned_mechanic_id = free_mechanic_ids[0]

    initial_status = BookingStatus.ASSIGNED if assigned_mechanic_id else BookingStatus.PENDING

    booking = Booking(
        customer_id=current_user.id,
        vehicle_id=payload.vehicle_id,
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


@router.get("/{booking_id}", response_model=BookingRead)
def get_booking_by_id(
    booking_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    FEATURE 6: Direct verified booking details endpoint.
    Retrieves full verified records from the database with proper authorization.
    """
    query = (
        db.query(Booking)
        .options(
            joinedload(Booking.customer),
            joinedload(Booking.vehicle),
            joinedload(Booking.service),
            joinedload(Booking.mechanic)
        )
        .filter(Booking.id == booking_id)
    )
    if current_user.role != UserRole.ADMIN:
        query = query.filter(Booking.customer_id == current_user.id)

    booking = query.first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found or not authorized")
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
        raise HTTPException(status_code=404, detail="Active mechanic not found")

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

    # When booking status is updated to confirmed, notify the customer via email
    if payload.status.lower() == "confirmed":
        customer = booking.customer
        service = booking.service
        vehicle = booking.vehicle
        if customer and customer.email:
            subject = f"Your Car Assistance Booking #{booking.id} is Confirmed"
            service_name = service.name if service else "Service"
            vehicle_info = f"{vehicle.year} {vehicle.make} {vehicle.model} ({vehicle.registration})" if vehicle else "Vehicle"
            sched_str = booking.scheduled_at.strftime('%Y-%m-%d %H:%M UTC') if hasattr(booking.scheduled_at, 'strftime') else str(booking.scheduled_at)

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
