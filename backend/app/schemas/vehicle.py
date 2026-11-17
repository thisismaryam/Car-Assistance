from datetime import datetime
from pydantic import BaseModel, ConfigDict


class VehicleCreate(BaseModel):
    make: str
    model: str
    year: int
    registration: str
    notes: str | None = None


class VehicleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    owner_id: int
    make: str
    model: str
    year: int
    registration: str
    notes: str | None
    created_at: datetime
