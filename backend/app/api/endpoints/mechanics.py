from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.models.user import User, UserRole
from app.models.mechanic import MechanicSchedule, MechanicTimeOff
from app.models.booking import Booking, ServiceType
from app.schemas.mechanic import (
    MechanicCreate,
    MechanicRead,
    MechanicScheduleCreate,
    MechanicScheduleRead,
    MechanicTimeOffCreate,
    MechanicTimeOffRead,
)
from app.schemas.auth import UserRead
from app.core.security import hash_password, require_admin
from app.services.availability import get_active_mechanics_for_slot

router = APIRouter()


@router.get("/", response_model=list[MechanicRead])
def list_mechanics(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """List all mechanic accounts with their schedules and time-off records."""
    mechanics = (
        db.query(User)
        .options(
            joinedload(User.schedules),
            joinedload(User.time_offs)
        )
        .filter(User.role == UserRole.MECHANIC)
        .all()
    )
    return mechanics


@router.post("/", response_model=MechanicRead, status_code=201)
def create_mechanic(payload: MechanicCreate, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    """Create a new mechanic account and seed default Mon-Sat 09:00-18:00 schedule."""
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="A user with this email already exists")

    mechanic = User(
        full_name=payload.full_name,
        email=payload.email,
        phone=payload.phone,
        hashed_password=hash_password(payload.password),
        role=UserRole.MECHANIC,
        is_active=True
    )
    db.add(mechanic)
    db.commit()
    db.refresh(mechanic)

    # Initialize default schedules (Monday to Saturday: days 0 through 5)
    for d in range(6):
        db.add(MechanicSchedule(
            mechanic_id=mechanic.id,
            day_of_week=d,
            start_time="09:00",
            end_time="18:00",
            is_active=True
        ))
    db.commit()

    return db.query(User).options(
        joinedload(User.schedules),
        joinedload(User.time_offs)
    ).filter(User.id == mechanic.id).first()


@router.put("/{mechanic_id}/schedule", response_model=list[MechanicScheduleRead])
def update_mechanic_schedule(
    mechanic_id: int,
    schedules: list[MechanicScheduleCreate],
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Replace all weekly schedule rules for a mechanic."""
    mechanic = db.query(User).filter(User.id == mechanic_id, User.role == UserRole.MECHANIC).first()
    if not mechanic:
        raise HTTPException(status_code=404, detail="Mechanic not found")

    # Clear existing
    db.query(MechanicSchedule).filter(MechanicSchedule.mechanic_id == mechanic_id).delete()

    created = []
    for s in schedules:
        item = MechanicSchedule(
            mechanic_id=mechanic_id,
            day_of_week=s.day_of_week,
            start_time=s.start_time,
            end_time=s.end_time,
            is_active=s.is_active
        )
        db.add(item)
        created.append(item)

    db.commit()
    return db.query(MechanicSchedule).filter(MechanicSchedule.mechanic_id == mechanic_id).order_by(MechanicSchedule.day_of_week).all()


@router.post("/{mechanic_id}/time-off", response_model=MechanicTimeOffRead, status_code=201)
def add_mechanic_time_off(
    mechanic_id: int,
    payload: MechanicTimeOffCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Record an unavailable period or break for a mechanic."""
    mechanic = db.query(User).filter(User.id == mechanic_id, User.role == UserRole.MECHANIC).first()
    if not mechanic:
        raise HTTPException(status_code=404, detail="Mechanic not found")

    if payload.end_time <= payload.start_time:
        raise HTTPException(status_code=400, detail="End time must be after start time")

    time_off = MechanicTimeOff(
        mechanic_id=mechanic_id,
        start_time=payload.start_time,
        end_time=payload.end_time,
        reason=payload.reason
    )
    db.add(time_off)
    db.commit()
    db.refresh(time_off)
    return time_off


@router.delete("/{mechanic_id}/time-off/{time_off_id}", status_code=204)
def delete_mechanic_time_off(
    mechanic_id: int,
    time_off_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """Remove a time off or break record."""
    item = db.query(MechanicTimeOff).filter(
        MechanicTimeOff.id == time_off_id,
        MechanicTimeOff.mechanic_id == mechanic_id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Time off record not found")

    db.delete(item)
    db.commit()
    return None


@router.get("/available-for-booking/{booking_id}", response_model=list[UserRead])
def get_available_mechanics_for_booking(
    booking_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    Returns the list of all mechanics who are on duty and have NO conflicts
    (including service duration and travel buffer) for the given booking.
    """
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    duration = booking.service.duration_minutes if booking.service else 60
    slot_start = booking.scheduled_at
    slot_end = booking.scheduled_at + timedelta(minutes=duration)

    is_home = booking.service and booking.service.service_type == ServiceType.HOME
    buffer_mins = 30 if is_home else 0

    available = get_active_mechanics_for_slot(
        db=db,
        slot_start=slot_start,
        slot_end=slot_end,
        travel_buffer_minutes=buffer_mins,
        exclude_booking_id=booking.id
    )

    return available

