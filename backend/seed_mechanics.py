"""
Seed script: populates the database with 2 realistic certified mechanics
with default schedules (Mon-Sat 09:00 - 18:00 UTC).
"""
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from app.database import SessionLocal
import app.models # registers User, MechanicSchedule, etc.
from app.models.user import User, UserRole
from app.models.mechanic import MechanicSchedule
from app.core.security import hash_password

MECHANICS = [
    {
        "full_name": "Tariq Mahmood",
        "email": "tariq.mechanic@carassistance.com",
        "phone": "+923001234567",
        "password": "mechanicpass123",
    },
    {
        "full_name": "Hamza Ali",
        "email": "hamza.mechanic@carassistance.com",
        "phone": "+923007654321",
        "password": "mechanicpass123",
    },
]


def seed_mechanics():
    db = SessionLocal()
    try:
        for m_data in MECHANICS:
            existing = db.query(User).filter(User.email == m_data["email"]).first()
            if not existing:
                mechanic = User(
                    full_name=m_data["full_name"],
                    email=m_data["email"],
                    phone=m_data["phone"],
                    hashed_password=hash_password(m_data["password"]),
                    role=UserRole.MECHANIC,
                    is_active=True
                )
                db.add(mechanic)
                db.commit()
                db.refresh(mechanic)

                # Seed Mon-Sat 09:00-18:00 schedule
                for day in range(6):
                    db.add(MechanicSchedule(
                        mechanic_id=mechanic.id,
                        day_of_week=day,
                        start_time="09:00",
                        end_time="18:00",
                        is_active=True
                    ))
                db.commit()
                print(f"[ok] Created mechanic: {mechanic.full_name} ({mechanic.email})")
            else:
                print(f"[skip] Mechanic already exists: {existing.email}")
    except Exception as exc:
        db.rollback()
        print(f"[error] Seeding mechanics failed: {exc}")
    finally:
        db.close()


if __name__ == "__main__":
    seed_mechanics()

