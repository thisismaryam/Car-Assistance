from datetime import datetime
from pydantic import BaseModel, ConfigDict


class MechanicScheduleCreate(BaseModel):
    day_of_week: int  # 0=Monday, ..., 6=Sunday
    start_time: str = "09:00"  # "HH:MM"
    end_time: str = "18:00"    # "HH:MM"
    is_active: bool = True


class MechanicScheduleRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    mechanic_id: int
    day_of_week: int
    start_time: str
    end_time: str
    is_active: bool


class MechanicTimeOffCreate(BaseModel):
    start_time: datetime
    end_time: datetime
    reason: str = "Break / Unavailable"


class MechanicTimeOffRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    mechanic_id: int
    start_time: datetime
    end_time: datetime
    reason: str


class MechanicCreate(BaseModel):
    full_name: str
    email: str
    phone: str
    password: str


class MechanicRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    full_name: str
    email: str
    phone: str
    role: str
    is_active: bool
    schedules: list[MechanicScheduleRead] = []
    time_offs: list[MechanicTimeOffRead] = []


class AssignMechanicPayload(BaseModel):
    mechanic_id: int

