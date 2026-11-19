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
    # NULL for guest (not logged in) emergency requests
    user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True
    )
    vehicle_id: Mapped[int | None] = mapped_column(
        ForeignKey("vehicles.id", ondelete="SET NULL"), nullable=True, index=True
    )
    location: Mapped[str] = mapped_column(Text)
    issue_type: Mapped[str] = mapped_column(String(100))
    # Lifecycle statuses: requested, accepted, assigned, en_route (or en route), arrived, resolved, cancelled
    status: Mapped[str] = mapped_column(String(50), default="requested", index=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Guest contact details (only filled when user_id is NULL)
    guest_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    guest_phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    guest_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    guest_vehicle: Mapped[str | None] = mapped_column(String(200), nullable=True)
    # Secret handed to the guest so only they can track / cancel their request
    tracking_token: Mapped[str | None] = mapped_column(String(64), nullable=True, unique=True, index=True)

    # Provider / Mechanic assignment
    assigned_mechanic_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True
    )

    # Lifecycle Timestamps
    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    assigned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    en_route_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    arrived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )

    user: Mapped["User | None"] = relationship("User", foreign_keys=[user_id], back_populates="roadside_requests")
    vehicle: Mapped["Vehicle | None"] = relationship(back_populates="roadside_requests")
    assigned_mechanic: Mapped["User | None"] = relationship("User", foreign_keys=[assigned_mechanic_id], back_populates="assigned_roadside_requests")
    assignments: Mapped[list["RoadsideAssignment"]] = relationship(
        back_populates="request",
        cascade="all, delete-orphan",
        order_by="desc(RoadsideAssignment.created_at)"
    )


class RoadsideAssignment(Base):
    __tablename__ = "roadside_assignments"

    id: Mapped[int] = mapped_column(primary_key=True)
    request_id: Mapped[int] = mapped_column(
        ForeignKey("roadside_requests.id", ondelete="CASCADE"), index=True
    )
    mechanic_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    assigned_by_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(50), default="assigned")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )

    request: Mapped["RoadsideRequest"] = relationship(back_populates="assignments")
    mechanic: Mapped["User"] = relationship("User", foreign_keys=[mechanic_id])
    assigned_by: Mapped["User | None"] = relationship("User", foreign_keys=[assigned_by_id])
