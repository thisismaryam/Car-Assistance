from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import cast, Date, func
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.models.booking import Booking, Service
from app.models.vehicle import Vehicle
from app.models.user import User
from app.schemas.booking import BookingCreate, BookingRead, StatusUpdate
from app.core.security import get_current_user, require_admin

router = APIRouter()


@router.post("/", response_model=BookingRead, status_code=201)
def create_booking(payload: BookingCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    vehicle = db.query(Vehicle).filter(
        Vehicle.id == payload.vehicle_id, Vehicle.owner_id == current_user.id).first()
    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")
    service = db.query(Service).filter(
        Service.id == payload.service_id, Service.is_active == True).first()
    if not service:
        raise HTTPException(status_code=404, detail="Service not found")

    existing = db.query(Booking).filter(Booking.customer_id == current_user.id,
                                        Booking.scheduled_at == payload.scheduled_at, Booking.status != "cancelled").first()
    if existing:
        raise HTTPException(
            status_code=400, detail="You already have a booking at this time")

    # Task 2: 5-Booking Limit check for requested date
    target_date = payload.scheduled_at.date()
    daily_count = db.query(Booking).filter(
        Booking.customer_id == current_user.id,
        cast(Booking.scheduled_at, Date) == target_date,
        Booking.status != "cancelled"
    ).count()

    if daily_count >= 5:
        raise HTTPException(
            status_code=400,
            detail="Daily booking limit reached (5). Please choose another day."
        )

    booking = Booking(customer_id=current_user.id, vehicle_id=payload.vehicle_id, service_id=payload.service_id,
                      scheduled_at=payload.scheduled_at, address=payload.address, notes=payload.notes, status="pending")
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return db.query(Booking).options(joinedload(Booking.customer), joinedload(Booking.vehicle), joinedload(Booking.service)).filter(Booking.id == booking.id).first()


@router.get("/my", response_model=list[BookingRead])
def get_my_bookings(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Booking).options(joinedload(Booking.customer), joinedload(Booking.vehicle), joinedload(Booking.service)).filter(Booking.customer_id == current_user.id).order_by(Booking.scheduled_at.desc()).all()


@router.get("/all", response_model=list[BookingRead])
def get_all_bookings(db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    return db.query(Booking).options(joinedload(Booking.customer), joinedload(Booking.vehicle), joinedload(Booking.service)).order_by(Booking.scheduled_at.desc()).all()


@router.patch("/{booking_id}/status", response_model=BookingRead)
def update_status(booking_id: int, payload: StatusUpdate, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")
    booking.status = payload.status
    db.commit()
    db.refresh(booking)
    return booking
