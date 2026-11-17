from datetime import datetime
from decimal import Decimal
from enum import Enum
from typing import TYPE_CHECKING
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.vehicle import Vehicle


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
        DateTime(timezone=True), server_default=func.now())
    bookings: Mapped[list["Booking"]] = relationship(back_populates="service")


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
        default=BookingStatus.PENDING, index=True)
    scheduled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    customer: Mapped["User"] = relationship(back_populates="bookings")
    vehicle: Mapped["Vehicle"] = relationship(back_populates="bookings")
    service: Mapped["Service"] = relationship(back_populates="bookings")
