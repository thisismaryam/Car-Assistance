from datetime import datetime
from typing import TYPE_CHECKING
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.booking import Booking
    from app.models.roadside import RoadsideRequest


class Vehicle(Base):
    __tablename__ = "vehicles"
    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True)
    make: Mapped[str] = mapped_column(String(60))
    model: Mapped[str] = mapped_column(String(60))
    year: Mapped[int] = mapped_column(Integer)
    registration: Mapped[str] = mapped_column(String(40), unique=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now())

    owner: Mapped["User"] = relationship(back_populates="vehicles")
    bookings: Mapped[list["Booking"]] = relationship(back_populates="vehicle")
    roadside_requests: Mapped[list["RoadsideRequest"]] = relationship(
        back_populates="vehicle"
    )
