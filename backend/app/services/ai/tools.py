from datetime import datetime, date as py_date, timedelta, timezone
from typing import Any
from sqlalchemy import cast, Date, func, text
from sqlalchemy.orm import Session, joinedload
from app.models.booking import Booking, BookingStatus, Service, ServiceType
from app.models.vehicle import Vehicle
from app.models.user import User, UserRole
from app.services.availability import (
    calculate_slot_availability,
    get_day_availability,
    find_alternative_slots,
)


def get_live_services_tool(db: Session, service_type_str: str | None = None) -> list[dict[str, Any]]:
    """
    FEATURE 5 - Branch 2 Tool:
    Direct backend tool execution to fetch live business pricing and service catalog directly from database.
    """
    query = db.query(Service).filter(Service.is_active == True)
    if service_type_str:
        st_lower = service_type_str.lower().strip()
        if st_lower in ["workshop", "bay"]:
            query = query.filter(Service.service_type == ServiceType.WORKSHOP)
        elif st_lower in ["home", "doorstep"]:
            query = query.filter(Service.service_type == ServiceType.HOME)
        elif st_lower in ["roadside", "emergency", "tow"]:
            query = query.filter(Service.service_type == ServiceType.ROADSIDE)

    services = query.order_by(Service.service_type, Service.base_price).all()
    return [
        {
            "id": s.id,
            "name": s.name,
            "category": s.service_type.value,
            "base_price": float(s.base_price),
            "duration_minutes": s.duration_minutes,
            "description": s.description,
        }
        for s in services
    ]


def check_live_availability_tool(db: Session, service_identifier: str | int, target_date_str: str) -> dict[str, Any]:
    """
    FEATURE 5 - Branch 2 Tool:
    Direct backend tool execution to calculate real-time slot availability directly from database and availability engine.
    """
    # 1. Resolve service
    service = None
    if isinstance(service_identifier, int) or (isinstance(service_identifier, str) and service_identifier.isdigit()):
        service = db.query(Service).filter(Service.id == int(service_identifier), Service.is_active == True).first()
    else:
        # Match by name
        term = f"%{service_identifier.strip()}%"
        service = db.query(Service).filter(Service.name.ilike(term), Service.is_active == True).first()

    if not service:
        # Fallback to first workshop service if not found
        service = db.query(Service).filter(Service.service_type == ServiceType.WORKSHOP, Service.is_active == True).first()

    if not service:
        return {"error": "No active service found"}

    try:
        t_date = datetime.strptime(target_date_str.strip(), "%Y-%m-%d").date()
    except Exception:
        t_date = datetime.now(timezone.utc).date()

    slots = get_day_availability(db, service_id=service.id, target_date=t_date)
    available_slots = [s for s in slots if s.get("is_available")]

    return {
        "service_id": service.id,
        "service_name": service.name,
        "service_type": service.service_type.value,
        "date": t_date.isoformat(),
        "total_slots": len(slots),
        "available_slots_count": len(available_slots),
        "available_slots": available_slots,
        "all_slots": slots,
    }


def get_user_garage_tool(db: Session, current_user: User | None) -> dict[str, Any]:
    """
    FEATURE 5 - Branch 3 Validation Tool:
    Verifies user authentication and retrieves verified vehicle ownership from database.
    """
    if not current_user:
        return {"authenticated": False, "vehicles": [], "message": "User is not authenticated. Please log in."}

    vehicles = db.query(Vehicle).filter(Vehicle.owner_id == current_user.id).all()
    return {
        "authenticated": True,
        "user_id": current_user.id,
        "user_name": current_user.full_name,
        "vehicles": [
            {
                "id": v.id,
                "make": v.make,
                "model": v.model,
                "year": v.year,
                "registration": v.registration,
            }
            for v in vehicles
        ],
    }


def validate_booking_intent_tool(
    db: Session,
    current_user: User | None,
    vehicle_query: str | int | None,
    service_query: str | int | None,
    scheduled_at: datetime | None,
    address: str | None = None
) -> dict[str, Any]:
    """
    FEATURE 5 - Branch 3 Validation Tool:
    Strictly validates authentication, vehicle ownership, service eligibility, and slot capacity
    before allowing explicit confirmation.
    """
    # 1. Authentication
    if not current_user:
        return {
            "valid": False,
            "error_type": "AUTHENTICATION_REQUIRED",
            "message": "You must be logged in to book an appointment. Please log in to your account first.",
        }

    # 2. Vehicle Ownership
    user_vehicles = db.query(Vehicle).filter(Vehicle.owner_id == current_user.id).all()
    if not user_vehicles:
        return {
            "valid": False,
            "error_type": "NO_VEHICLES",
            "message": "You do not have any vehicles registered in your garage. Please add a vehicle in your [Garage Dashboard](/dashboard/vehicles) first.",
        }

    matched_vehicle = None
    if vehicle_query is not None:
        v_str = str(vehicle_query).strip().lower()
        exact_vehicle_matches = [
            v for v in user_vehicles
            if (
                str(v.id) == v_str
                or v.registration.lower() == v_str
                or f"{v.make} {v.model}".lower() in v_str
            )
        ]
        vehicle_matches = exact_vehicle_matches or [
            v for v in user_vehicles
            if v.make.lower() in v_str or v.model.lower() in v_str
        ]
        if len(vehicle_matches) == 1:
            matched_vehicle = vehicle_matches[0]

    if not matched_vehicle:
        v_list = ", ".join([f"{v.year} {v.make} {v.model} ({v.registration})" for v in user_vehicles])
        return {
            "valid": False,
            "error_type": "VEHICLE_SELECTION_REQUIRED",
            "message": f"Please select which vehicle to service from your garage: {v_list}.",
        }

    # 3. Service Eligibility
    matched_service = None
    if service_query is not None:
        s_str = str(service_query).strip().lower()
        if s_str.isdigit():
            matched_service = db.query(Service).filter(Service.id == int(s_str), Service.is_active == True).first()
        else:
            services = db.query(Service).filter(Service.is_active == True).all()
            service_matches = [
                s for s in services if s.name.lower() in s_str or s_str in s.name.lower()
            ]
            if len(service_matches) == 1:
                matched_service = service_matches[0]

    if not matched_service:
        available_services = db.query(Service).filter(Service.is_active == True).all()
        service_list = ", ".join(s.name for s in available_services)
        return {
            "valid": False,
            "error_type": "SERVICE_SELECTION_REQUIRED",
            "message": f"Please specify which service you would like to book: {service_list}.",
        }

    if matched_service.service_type == ServiceType.ROADSIDE:
        return {
            "valid": False,
            "error_type": "ROADSIDE_REDIRECT",
            "message": "Roadside emergencies require immediate dispatch through our [/emergency](/emergency) portal or 24/7 hotline.",
        }

    if matched_service.service_type == ServiceType.HOME and (not address or not address.strip()):
        return {
            "valid": False,
            "error_type": "ADDRESS_REQUIRED",
            "message": f"{matched_service.name} is a Doorstep Home Service. Please provide your service address or driveway location.",
        }

    # 4. Schedule and Capacity
    if not scheduled_at:
        return {
            "valid": False,
            "error_type": "SCHEDULE_TIME_REQUIRED",
            "message": "Please provide a preferred appointment date and time during business hours (Mon-Sat 09:00 - 18:00 UTC).",
        }

    now_utc = datetime.now(timezone.utc)
    service_duration = matched_service.duration_minutes or 60
    slot_end = scheduled_at + timedelta(minutes=service_duration)

    # Check vehicle conflict across time window
    potential_conflicts = (
        db.query(Booking)
        .join(Service)
        .filter(
            Booking.vehicle_id == matched_vehicle.id,
            Booking.status.in_([
                BookingStatus.PENDING,
                BookingStatus.CONFIRMED,
                BookingStatus.ASSIGNED,
                BookingStatus.IN_PROGRESS,
            ]),
            Booking.scheduled_at < slot_end,
        )
        .all()
    )
    vehicle_conflict = None
    for b in potential_conflicts:
        b_dur = b.service.duration_minutes if b.service else 60
        b_end = b.scheduled_at + timedelta(minutes=b_dur)
        if b_end > scheduled_at:
            vehicle_conflict = b
            break

    if vehicle_conflict:
        return {
            "valid": False,
            "error_type": "VEHICLE_TIME_CONFLICT",
            "message": f"Conflict: {matched_vehicle.make} {matched_vehicle.model} already has an active appointment (#{vehicle_conflict.id}) at this time.",
        }

    # Daily booking limit
    daily_count = db.query(Booking).filter(
        Booking.customer_id == current_user.id,
        cast(Booking.scheduled_at, Date) == scheduled_at.date(),
        Booking.status != BookingStatus.CANCELLED
    ).count()
    if daily_count >= 5:
        return {
            "valid": False,
            "error_type": "DAILY_LIMIT_EXCEEDED",
            "message": "Daily booking limit reached (5 bookings max per day). Please select another date.",
        }

    # Slot availability & capacity
    slot_info = calculate_slot_availability(
        db=db,
        service=matched_service,
        slot_start=scheduled_at,
        slot_end=slot_end,
        now=now_utc
    )
    if not slot_info["is_available"]:
        alternatives = find_alternative_slots(db, service=matched_service, from_date=scheduled_at.date())
        alt_str = f" Suggested alternatives: {', '.join(alternatives[:3])}." if alternatives else ""
        return {
            "valid": False,
            "error_type": "SLOT_UNAVAILABLE",
            "message": f"The requested appointment slot is unavailable: {slot_info['reason']}.{alt_str}",
        }

    # Everything is verified! Formulate proposal for explicit confirmation
    return {
        "valid": True,
        "vehicle": {
            "id": matched_vehicle.id,
            "display": f"{matched_vehicle.year} {matched_vehicle.make} {matched_vehicle.model} ({matched_vehicle.registration})",
        },
        "service": {
            "id": matched_service.id,
            "name": matched_service.name,
            "price": float(matched_service.base_price),
            "duration": matched_service.duration_minutes,
            "type": matched_service.service_type.value,
        },
        "scheduled_at": scheduled_at.isoformat(),
        "address": address.strip() if address else None,
        "slot_info": slot_info,
    }


def execute_confirmed_booking_core(
    db: Session,
    current_user: User,
    vehicle_id: int,
    service_id: int,
    scheduled_at: datetime,
    address: str | None = None,
    notes: str | None = None
) -> Booking:
    """
    FEATURE 5 - Branch 3 Core Execution Tool:
    Executes confirmed booking directly into PostgreSQL via core database transaction.
    """
    service = db.query(Service).filter(Service.id == service_id, Service.is_active == True).first()
    if not service:
        raise ValueError("Service not found or inactive")

    # Lock key advisory lock
    slot_iso = scheduled_at.replace(microsecond=0).isoformat()
    lock_key = f"slot_{service.service_type.value}_{slot_iso}"
    try:
        db.execute(text("SELECT pg_advisory_xact_lock(hashtext(:k))"), {"k": lock_key})
    except Exception:
        pass

    slot_end = scheduled_at + timedelta(minutes=service.duration_minutes or 60)
    slot_info = calculate_slot_availability(db=db, service=service, slot_start=scheduled_at, slot_end=slot_end)
    if not slot_info["is_available"]:
        raise ValueError(f"Slot became unavailable: {slot_info['reason']}")

    assigned_mechanic_id = None
    if service.service_type == ServiceType.HOME:
        free_ids = slot_info.get("available_mechanic_ids", [])
        if free_ids:
            assigned_mechanic_id = free_ids[0]

    initial_status = BookingStatus.ASSIGNED if assigned_mechanic_id else BookingStatus.PENDING

    booking = Booking(
        customer_id=current_user.id,
        vehicle_id=vehicle_id,
        service_id=service_id,
        mechanic_id=assigned_mechanic_id,
        scheduled_at=scheduled_at,
        address=address,
        notes=notes or "Booked via Car Assistance AI Assistant",
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
