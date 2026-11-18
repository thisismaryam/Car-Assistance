from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, ConfigDict

# Import from our own files
from app.schemas.auth import UserRead  # <--- Changed from user to auth
from app.schemas.vehicle import VehicleRead
from app.models.booking import BookingStatus, ServiceType

# --- Service Schemas ---


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

# --- Booking Schemas ---


class BookingCreate(BaseModel):
    # Guest customer details
    customer_name: str | None = None
    customer_email: str | None = None
    customer_phone: str | None = None

    # Guest vehicle details
    vehicle_make: str | None = None
    vehicle_model: str | None = None
    vehicle_year: int | None = None
    vehicle_registration: str | None = None

    # Service & Schedule
    service_id: int
    scheduled_at: datetime
    address: str | None = None
    notes: str | None = None

    # Optional vehicle_id for backward compatibility
    vehicle_id: int | None = None


class BookingRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    customer_id: int
    vehicle_id: int
    service_id: int
    mechanic_id: int | None = None
    status: BookingStatus
    scheduled_at: datetime
    address: str | None
    notes: str | None
    created_at: datetime

    # Nested relationships (this is what makes the Admin table show names instead of "User 1")
    customer: UserRead
    vehicle: VehicleRead
    service: ServiceRead
    mechanic: UserRead | None = None


class StatusUpdate(BaseModel):
    status: str
