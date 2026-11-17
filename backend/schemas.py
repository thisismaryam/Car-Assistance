from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, EmailStr

from models import BookingStatus, ServiceType, UserRole


# ---------- Auth ----------

class UserCreate(BaseModel):
    full_name: str
    email: EmailStr
    phone: str
    password: str


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    email: EmailStr
    phone: str
    role: UserRole
    is_active: bool
    created_at: datetime


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


# ---------- Vehicles ----------

class VehicleCreate(BaseModel):
    make: str
    model: str
    year: int
    registration: str
    notes: str | None = None


class VehicleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    owner_id: int
    make: str
    model: str
    year: int
    registration: str
    notes: str | None
    created_at: datetime


# ---------- Services ----------

class ServiceCreate(BaseModel):
    name: str
    description: str
    service_type: ServiceType = ServiceType.WORKSHOP
    base_price: Decimal
    duration_minutes: int = 60


class ServiceRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str
    service_type: ServiceType
    base_price: Decimal
    duration_minutes: int
    is_active: bool


# ---------- Bookings ----------

class BookingCreate(BaseModel):
    vehicle_id: int
    service_id: int
    scheduled_at: datetime
    address: str | None = None
    notes: str | None = None


class BookingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    customer_id: int
    vehicle_id: int
    service_id: int
    status: BookingStatus
    scheduled_at: datetime
    address: str | None
    notes: str | None
    created_at: datetime

    # Add these lines to include the nested data:
    customer: UserRead
    vehicle: VehicleRead
    service: ServiceRead
