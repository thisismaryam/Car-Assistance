from datetime import datetime
from typing import TYPE_CHECKING
from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

if TYPE_CHECKING:
    from app.models.user import User


class MechanicSchedule(Base):
    __tablename__ = "mechanic_schedules"

    id: Mapped[int] = mapped_column(primary_key=True)
    mechanic_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    # 0 = Monday, 1 = Tuesday, ..., 6 = Sunday
    day_of_week: Mapped[int] = mapped_column(Integer, index=True)
    start_time: Mapped[str] = mapped_column(String(5), default="09:00")  # "HH:MM"
    end_time: Mapped[str] = mapped_column(String(5), default="18:00")    # "HH:MM"
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    mechanic: Mapped["User"] = relationship(back_populates="schedules")


class MechanicTimeOff(Base):
    __tablename__ = "mechanic_time_offs"

    id: Mapped[int] = mapped_column(primary_key=True)
    mechanic_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    start_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    end_time: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    reason: Mapped[str] = mapped_column(String(200), default="Break / Unavailable")

    mechanic: Mapped["User"] = relationship(back_populates="time_offs")

