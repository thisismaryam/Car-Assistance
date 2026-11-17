from datetime import datetime
from pydantic import BaseModel, ConfigDict
from app.schemas.auth import UserRead
from app.schemas.vehicle import VehicleRead


class RoadsideCreate(BaseModel):
    vehicle_id: int | None = None
    location: str
    issue_type: str
    notes: str | None = None


class RoadsideStatusUpdate(BaseModel):
    status: str


class RoadsideRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    user_id: int
    vehicle_id: int | None
    location: str
    issue_type: str
    status: str
    notes: str | None
    created_at: datetime
    updated_at: datetime

    user: UserRead
    vehicle: VehicleRead | None = None

