from datetime import datetime
from pydantic import BaseModel, EmailStr, ConfigDict
from app.models.user import UserRole


class UserCreate(BaseModel):
    full_name: str
    email: EmailStr
    phone: str
    password: str


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    full_name: str
    email: EmailStr
    phone: str
    role: UserRole
    is_active: bool
    created_at: datetime


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"
