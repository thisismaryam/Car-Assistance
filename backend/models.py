from datetime import datetime
from decimal import Decimal
from enum import Enum

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    func,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database import Base


# ---------- Enums (fixed allowed values) ----------

class UserRole(str, Enum):
    CUSTOMER = "customer"
    ADMIN = "admin"
    MECHANIC = "mechanic"


class BookingStatus(str, Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    ASSIGNED = "assigned"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class ServiceType(str, Enum):
    WORKSHOP = "workshop"
    HOME = "home"
    ROADSIDE = "roadside"


# ---------- Users ----------

class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    full_name: Mapped[str] = mapped_column(String(120))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    phone: Mapped[str] = mapped_column(String(30))
    hashed_password: Mapped[str] = mapped_column(String(255))
    role: Mapped[UserRole] = mapped_column(default=UserRole.CUSTOMER)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    vehicles: Mapped[list["Vehicle"]] = relationship(
        back_populates="owner", cascade="all, delete-orphan"
    )
    bookings: Mapped[list["Booking"]] = relationship(back_populates="customer")


# ---------- Vehicles ----------

class Vehicle(Base):
    __tablename__ = "vehicles"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    make: Mapped[str] = mapped_column(String(60))
    model: Mapped[str] = mapped_column(String(60))
    year: Mapped[int] = mapped_column(Integer)
    registration: Mapped[str] = mapped_column(String(40), unique=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    owner: Mapped["User"] = relationship(back_populates="vehicles")
    bookings: Mapped[list["Booking"]] = relationship(back_populates="vehicle")


# ---------- Services ----------

class Service(Base):
    __tablename__ = "services"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text)
    service_type: Mapped[ServiceType] = mapped_column(
        default=ServiceType.WORKSHOP)
    base_price: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    duration_minutes: Mapped[int] = mapped_column(Integer, default=60)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    bookings: Mapped[list["Booking"]] = relationship(back_populates="service")


# ---------- Bookings ----------

class Booking(Base):
    __tablename__ = "bookings"

    id: Mapped[int] = mapped_column(primary_key=True)
    customer_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), index=True)
    vehicle_id: Mapped[int] = mapped_column(
        ForeignKey("vehicles.id"), index=True)
    service_id: Mapped[int] = mapped_column(
        ForeignKey("services.id"), index=True)
    status: Mapped[BookingStatus] = mapped_column(
        default=BookingStatus.PENDING, index=True
    )
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    customer: Mapped["User"] = relationship(back_populates="bookings")
    vehicle: Mapped["Vehicle"] = relationship(back_populates="bookings")
    service: Mapped["Service"] = relationship(back_populates="bookings")
