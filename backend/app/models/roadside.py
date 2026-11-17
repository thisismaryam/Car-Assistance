from datetime import datetime
from typing import TYPE_CHECKING
from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base

if TYPE_CHECKING:
    from app.models.user import User
    from app.models.vehicle import Vehicle


class RoadsideRequest(Base):
    __tablename__ = "roadside_requests"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    vehicle_id: Mapped[int | None] = mapped_column(
        ForeignKey("vehicles.id", ondelete="SET NULL"), nullable=True, index=True
    )
    location: Mapped[str] = mapped_column(Text)
    issue_type: Mapped[str] = mapped_column(String(100))
    status: Mapped[str] = mapped_column(String(50), default="pending", index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User"] = relationship(back_populates="roadside_requests")
    vehicle: Mapped["Vehicle | None"] = relationship(back_populates="roadside_requests")

