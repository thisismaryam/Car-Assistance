from datetime import datetime, date, time, timedelta, timezone
from typing import Any
from sqlalchemy import func, or_, text
from sqlalchemy.orm import Session
from app.models.booking import Booking, BookingStatus, Service, ServiceType
from app.models.user import User, UserRole
from app.models.mechanic import MechanicSchedule, MechanicTimeOff

# Configuration defaults
DEFAULT_WORKSHOP_CAPACITY = 3
DEFAULT_SLOT_DURATION_MINUTES = 60
DEFAULT_LEAD_TIME_HOURS = 2
DEFAULT_TRAVEL_BUFFER_MINUTES = 30
BUSINESS_HOURS_START = time(9, 0)
BUSINESS_HOURS_END = time(18, 0)


def generate_day_slots(target_date: date, slot_duration_minutes: int = DEFAULT_SLOT_DURATION_MINUTES) -> list[tuple[datetime, datetime]]:
    """
    Generates standard business hour slot intervals for a given date in UTC.
    From 09:00 to 18:00 UTC.
    """
    slots = []
    current_time = datetime.combine(target_date, BUSINESS_HOURS_START).replace(tzinfo=timezone.utc)
    day_end = datetime.combine(target_date, BUSINESS_HOURS_END).replace(tzinfo=timezone.utc)

    while current_time + timedelta(minutes=slot_duration_minutes) <= day_end:
        slot_end = current_time + timedelta(minutes=slot_duration_minutes)
        slots.append((current_time, slot_end))
        current_time = slot_end

    return slots


def get_active_mechanics_for_slot(
    db: Session,
    slot_start: datetime,
    slot_end: datetime,
    travel_buffer_minutes: int = DEFAULT_TRAVEL_BUFFER_MINUTES,
    exclude_booking_id: int | None = None
) -> list[User]:
    """
    Finds all active mechanics who:
    1. Are scheduled to work on this day of week covering slot_start to slot_end.
    2. Have no overlapping MechanicTimeOff.
    3. Have no overlapping active assigned bookings (with travel buffer applied for home services).
    """
    day_of_week = slot_start.weekday()  # 0=Monday, 6=Sunday
    slot_start_time_str = slot_start.strftime("%H:%M")
    slot_end_time_str = slot_end.strftime("%H:%M")

    # 1. Query mechanics scheduled for duty on this day and hours
    mechanics = (
        db.query(User)
        .join(MechanicSchedule, MechanicSchedule.mechanic_id == User.id)
        .filter(
            User.role == UserRole.MECHANIC,
            User.is_active == True,
            MechanicSchedule.day_of_week == day_of_week,
            MechanicSchedule.is_active == True,
            MechanicSchedule.start_time <= slot_start_time_str,
            MechanicSchedule.end_time >= slot_end_time_str,
        )
        .all()
    )

    available_mechanics = []
    # Window to protect including travel buffer
    effective_start = slot_start - timedelta(minutes=travel_buffer_minutes)
    effective_end = slot_end + timedelta(minutes=travel_buffer_minutes)

    for mechanic in mechanics:
        # Check time-off
        has_time_off = db.query(MechanicTimeOff).filter(
            MechanicTimeOff.mechanic_id == mechanic.id,
            MechanicTimeOff.start_time < slot_end,
            MechanicTimeOff.end_time > slot_start
        ).first() is not None

        if has_time_off:
            continue

        # Check overlapping assigned bookings
        overlap_query = db.query(Booking).join(Service).filter(
            Booking.mechanic_id == mechanic.id,
            Booking.status.in_([
                BookingStatus.PENDING,
                BookingStatus.CONFIRMED,
                BookingStatus.ASSIGNED,
                BookingStatus.IN_PROGRESS,
            ])
        )
        if exclude_booking_id:
            overlap_query = overlap_query.filter(Booking.id != exclude_booking_id)

        overlapping_bookings = overlap_query.all()
        conflict = False

        for b in overlapping_bookings:
            b_dur = b.service.duration_minutes if b.service else 60
            # If home service, add travel buffer
            b_buf = travel_buffer_minutes if (b.service and b.service.service_type == ServiceType.HOME) else 0
            b_start = b.scheduled_at - timedelta(minutes=b_buf)
            b_end = b.scheduled_at + timedelta(minutes=b_dur + b_buf)

            # Check overlap between [effective_start, effective_end] and [b_start, b_end]
            if effective_start < b_end and effective_end > b_start:
                conflict = True
                break

        if not conflict:
            available_mechanics.append(mechanic)

    return available_mechanics


def calculate_slot_availability(
    db: Session,
    service: Service,
    slot_start: datetime,
    slot_end: datetime,
    now: datetime | None = None,
    workshop_capacity: int = DEFAULT_WORKSHOP_CAPACITY,
    lead_time_hours: int = DEFAULT_LEAD_TIME_HOURS
) -> dict[str, Any]:
    """
    Calculates capacity and availability for a single time slot.
    Governs pending vs confirmed:
    Both PENDING and CONFIRMED (as well as ASSIGNED and IN_PROGRESS) hold reservation capacity.
    CANCELLED bookings do not hold capacity (capacity automatically restored).
    """
    if now is None:
        now = datetime.now(timezone.utc)

    # 1. Lead time & past check
    if slot_start < now:
        return {
            "start_time": slot_start.isoformat(),
            "end_time": slot_end.isoformat(),
            "is_available": False,
            "reason": "Slot is in the past",
            "capacity": 0,
            "active_bookings": 0,
            "remaining_capacity": 0,
        }

    if slot_start < now + timedelta(hours=lead_time_hours):
        return {
            "start_time": slot_start.isoformat(),
            "end_time": slot_end.isoformat(),
            "is_available": False,
            "reason": f"Requires minimum {lead_time_hours} hours preparation lead time",
            "capacity": 0,
            "active_bookings": 0,
            "remaining_capacity": 0,
        }

    # 2. Workshop Capacity Rule
    if service.service_type == ServiceType.WORKSHOP:
        is_sqlite = db.bind and db.bind.dialect.name == "sqlite"
        if is_sqlite:
            candidates = (
                db.query(Booking)
                .join(Service)
                .filter(
                    Service.service_type == ServiceType.WORKSHOP,
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
            active_count = sum(
                1 for b in candidates
                if (b.scheduled_at + timedelta(minutes=b.service.duration_minutes if b.service else 60)) > slot_start
            )
        else:
            active_count = (
                db.query(func.count(Booking.id))
                .join(Service)
                .filter(
                    Service.service_type == ServiceType.WORKSHOP,
                    Booking.status.in_([
                        BookingStatus.PENDING,
                        BookingStatus.CONFIRMED,
                        BookingStatus.ASSIGNED,
                        BookingStatus.IN_PROGRESS,
                    ]),
                    Booking.scheduled_at < slot_end,
                    # overlap condition with slot
                    func.timezone('UTC', Booking.scheduled_at) + (func.coalesce(Service.duration_minutes, 60) * text("interval '1 minute'")) > slot_start
                )
                .scalar() or 0
            )

        remaining = max(0, workshop_capacity - active_count)
        is_available = remaining > 0

        return {
            "start_time": slot_start.isoformat(),
            "end_time": slot_end.isoformat(),
            "is_available": is_available,
            "reason": "Available" if is_available else "Workshop bays are fully booked for this slot",
            "capacity": workshop_capacity,
            "active_bookings": active_count,
            "remaining_capacity": remaining,
        }

    # 3. Home Service Capacity Rule (Mechanic driven)
    elif service.service_type == ServiceType.HOME:
        free_mechanics = get_active_mechanics_for_slot(
            db, slot_start, slot_end, travel_buffer_minutes=DEFAULT_TRAVEL_BUFFER_MINUTES
        )
        total_mechanics_count = db.query(User).filter(User.role == UserRole.MECHANIC, User.is_active == True).count()
        remaining = len(free_mechanics)
        is_available = remaining > 0

        reason = "Available"
        if total_mechanics_count == 0:
            reason = "No mechanics on staff"
        elif not is_available:
            reason = "All available mechanics are booked or off-duty for this slot"

        return {
            "start_time": slot_start.isoformat(),
            "end_time": slot_end.isoformat(),
            "is_available": is_available,
            "reason": reason,
            "capacity": total_mechanics_count,
            "active_bookings": total_mechanics_count - remaining,
            "remaining_capacity": remaining,
            "available_mechanic_ids": [m.id for m in free_mechanics],
        }

    # 4. Roadside / other
    return {
        "start_time": slot_start.isoformat(),
        "end_time": slot_end.isoformat(),
        "is_available": True,
        "reason": "Immediate dispatch available",
        "capacity": 999,
        "active_bookings": 0,
        "remaining_capacity": 999,
    }


def get_day_availability(
    db: Session,
    service_id: int,
    target_date: date
) -> list[dict[str, Any]]:
    """
    Computes slot availability for a whole day for a given service.
    """
    service = db.query(Service).filter(Service.id == service_id, Service.is_active == True).first()
    if not service:
        return []

    duration = service.duration_minutes or DEFAULT_SLOT_DURATION_MINUTES
    slots = generate_day_slots(target_date, slot_duration_minutes=duration)
    now = datetime.now(timezone.utc)

    result = []
    for slot_start, slot_end in slots:
        slot_info = calculate_slot_availability(
            db=db,
            service=service,
            slot_start=slot_start,
            slot_end=slot_end,
            now=now
        )
        result.append(slot_info)

    return result


def find_alternative_slots(
    db: Session,
    service: Service,
    from_date: date,
    days_ahead: int = 3,
    limit: int = 5
) -> list[str]:
    """
    Searches upcoming days for the next available alternative slots.
    """
    alternatives = []
    now = datetime.now(timezone.utc)

    for d_offset in range(days_ahead):
        curr_date = from_date + timedelta(days=d_offset)
        slots = generate_day_slots(curr_date, service.duration_minutes or 60)
        for s_start, s_end in slots:
            info = calculate_slot_availability(db, service, s_start, s_end, now=now)
            if info["is_available"]:
                alternatives.append(s_start.strftime("%Y-%m-%d %H:%M UTC"))
                if len(alternatives) >= limit:
                    return alternatives

    return alternatives

