from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session, joinedload
from pydantic import BaseModel

from database import (
    create_access_token,
    get_current_user,
    get_db,
    hash_password,
    require_admin,
    settings,
    verify_password,
)
from models import Booking, Service, User, UserRole, Vehicle
from schemas import (
    BookingCreate,
    BookingRead,
    ServiceCreate,
    ServiceRead,
    Token,
    UserCreate,
    UserRead,
    VehicleCreate,
    VehicleRead,
)

app = FastAPI(title=settings.APP_NAME, debug=settings.DEBUG)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- Health ----------


@app.get("/")
def root():
    return {"message": "Car Assistance API is running"}


@app.get("/health")
def health():
    return {"status": "ok"}

# ---------- Auth ----------


@app.post("/auth/register", response_model=UserRead, status_code=201)
def register(payload: UserCreate, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == payload.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        full_name=payload.full_name,
        email=payload.email,
        phone=payload.phone,
        hashed_password=hash_password(payload.password),
        role=UserRole.CUSTOMER,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


@app.post("/auth/login", response_model=Token)
def login(form: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == form.username).first()
    if not user or not verify_password(form.password, user.hashed_password):
        raise HTTPException(
            status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="User is inactive")

    token = create_access_token({"sub": str(user.id), "role": user.role.value})
    return Token(access_token=token)


@app.get("/auth/me", response_model=UserRead)
def me(current_user: User = Depends(get_current_user)):
    return current_user

# ---------- Services ----------


@app.post("/services", response_model=ServiceRead, status_code=201)
def create_service(
    payload: ServiceCreate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    service = Service(**payload.model_dump())
    db.add(service)
    db.commit()
    db.refresh(service)
    return service


@app.get("/services", response_model=list[ServiceRead])
def list_services(db: Session = Depends(get_db)):
    return db.query(Service).filter(Service.is_active == True).all()

# ---------- Vehicles ----------


@app.post("/vehicles", response_model=VehicleRead, status_code=201)
def add_vehicle(
    payload: VehicleCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    vehicle = Vehicle(**payload.model_dump(), owner_id=current_user.id)
    db.add(vehicle)
    db.commit()
    db.refresh(vehicle)
    return vehicle


@app.get("/vehicles/my-vehicles", response_model=list[VehicleRead])
def get_my_vehicles(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.query(Vehicle).filter(Vehicle.owner_id == current_user.id).all()

# ---------- Bookings ----------


@app.post("/bookings", response_model=BookingRead, status_code=201)
def create_booking(
    payload: BookingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    vehicle = db.query(Vehicle).filter(
        Vehicle.id == payload.vehicle_id,
        Vehicle.owner_id == current_user.id
    ).first()
    if not vehicle:
        raise HTTPException(
            status_code=404, detail="Vehicle not found or does not belong to you")

    service = db.query(Service).filter(
        Service.id == payload.service_id,
        Service.is_active == True
    ).first()
    if not service:
        raise HTTPException(
            status_code=404, detail="Service not found or inactive")

    existing_booking = db.query(Booking).filter(
        Booking.customer_id == current_user.id,
        Booking.scheduled_at == payload.scheduled_at,
        Booking.status != "cancelled"
    ).first()

    if existing_booking:
        raise HTTPException(
            status_code=400, detail="You already have a booking at this exact time.")

    booking = Booking(
        customer_id=current_user.id,
        vehicle_id=payload.vehicle_id,
        service_id=payload.service_id,
        scheduled_at=payload.scheduled_at,
        address=payload.address,
        notes=payload.notes,
        status="pending"
    )

    db.add(booking)
    db.commit()

    # Reload the booking with relationships before returning
    return db.query(Booking).options(
        joinedload(Booking.customer),
        joinedload(Booking.vehicle),
        joinedload(Booking.service)
    ).filter(Booking.id == booking.id).first()


@app.get("/bookings/my", response_model=list[BookingRead])
def get_my_bookings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.query(Booking).options(
        joinedload(Booking.customer),
        joinedload(Booking.vehicle),
        joinedload(Booking.service)
    ).filter(
        Booking.customer_id == current_user.id
    ).order_by(Booking.scheduled_at.desc()).all()


@app.get("/bookings/all", response_model=list[BookingRead])
def get_all_bookings(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    return db.query(Booking).options(
        joinedload(Booking.customer),
        joinedload(Booking.vehicle),
        joinedload(Booking.service)
    ).order_by(Booking.scheduled_at.desc()).all()


class StatusUpdate(BaseModel):
    status: str


@app.patch("/bookings/{booking_id}/status", response_model=BookingRead)
def update_booking_status(
    booking_id: int,
    payload: StatusUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    booking = db.query(Booking).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found")

    booking.status = payload.status
    db.commit()
    db.refresh(booking)
    return booking
