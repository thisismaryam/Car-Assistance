from datetime import datetime
from pydantic import BaseModel, ConfigDict
from app.schemas.auth import UserRead
from app.schemas.vehicle import VehicleRead


class RoadsideCreate(BaseModel):
    vehicle_id: int | None = None
    location: str
    issue_type: str
    notes: str | None = None


class RoadsideAssignPayload(BaseModel):
    mechanic_id: int
    notes: str | None = None


class RoadsideStatusUpdate(BaseModel):
    status: str
    notes: str | None = None


class RoadsideAssignmentRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    request_id: int
    mechanic_id: int
    assigned_by_id: int | None = None
    status: str
    notes: str | None = None
    created_at: datetime
    completed_at: datetime | None = None

    mechanic: UserRead | None = None
    assigned_by: UserRead | None = None


class RoadsideRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    vehicle_id: int | None
    location: str
    issue_type: str
    status: str
    notes: str | None

    assigned_mechanic_id: int | None = None
    accepted_at: datetime | None = None
    assigned_at: datetime | None = None
    en_route_at: datetime | None = None
    arrived_at: datetime | None = None
    resolved_at: datetime | None = None
    cancelled_at: datetime | None = None

    created_at: datetime
    updated_at: datetime

    user: UserRead
    vehicle: VehicleRead | None = None
    assigned_mechanic: UserRead | None = None
    assignments: list[RoadsideAssignmentRead] = []
