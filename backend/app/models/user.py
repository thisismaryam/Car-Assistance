from datetime import datetime
from enum import Enum
from typing import TYPE_CHECKING
from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

if TYPE_CHECKING:
    from app.models.vehicle import Vehicle
    from app.models.booking import Booking
    from app.models.roadside import RoadsideRequest


class UserRole(str, Enum):
    CUSTOMER = "customer"
    ADMIN = "admin"
    MECHANIC = "mechanic"


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
        DateTime(timezone=True), server_default=func.now())

    vehicles: Mapped[list["Vehicle"]] = relationship(
        back_populates="owner", cascade="all, delete-orphan")
    bookings: Mapped[list["Booking"]] = relationship(back_populates="customer")
    roadside_requests: Mapped[list["RoadsideRequest"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
