import uuid

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.user import User, UserRole
from app.schemas.booking import BookingCreate


def resolve_booking_customer(
    db: Session,
    payload: BookingCreate,
    current_user: User | None,
) -> User:
    if current_user and current_user.role == UserRole.CUSTOMER:
        return current_user

    if not payload.customer_email or not payload.customer_email.strip():
        raise HTTPException(
            status_code=400,
            detail="Guest details required: customer_name, customer_email, customer_phone.",
        )

    email_clean = payload.customer_email.strip().lower()
    user = db.query(User).filter(func.lower(User.email) == email_clean).first()
    if not user:
        user = User(
            full_name=(payload.customer_name or "Guest Customer").strip(),
            email=email_clean,
            phone=(payload.customer_phone or "").strip(),
            hashed_password=hash_password(str(uuid.uuid4())),
            role=UserRole.CUSTOMER,
            is_active=True,
        )
        db.add(user)
        db.flush()
    else:
        if payload.customer_name and (not user.full_name or user.full_name == "Guest Customer"):
            user.full_name = payload.customer_name.strip()
        if payload.customer_phone and not user.phone:
            user.phone = payload.customer_phone.strip()
        db.flush()
    return user
