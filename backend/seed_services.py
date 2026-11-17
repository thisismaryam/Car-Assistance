"""
Seed script: populates the services table with 10 realistic Car Assistance services.
Run from the backend/ directory:
    python seed_services.py
"""

import sys
import os

# Make sure the app package is importable
sys.path.insert(0, os.path.dirname(__file__))

from decimal import Decimal
from app.database import SessionLocal

# Import ALL models so SQLAlchemy can resolve cross-model relationships
import app.models.user      # noqa: F401 — registers User in the mapper registry
import app.models.vehicle   # noqa: F401 — registers Vehicle
from app.models.booking import Service, ServiceType

SERVICES = [
    # --- Workshop Services (bring car to our bay) ---
    {
        "name": "Oil & Filter Change",
        "description": "Full synthetic oil replacement with OEM-grade filter. Includes multi-point visual inspection.",
        "service_type": ServiceType.WORKSHOP,
        "base_price": Decimal("29.99"),
        "duration_minutes": 45,
    },
    {
        "name": "Brake Pad Replacement",
        "description": "Front or rear brake pad swap with rotor inspection. Safety-critical — we use OEM-equivalent pads.",
        "service_type": ServiceType.WORKSHOP,
        "base_price": Decimal("119.99"),
        "duration_minutes": 90,
    },
    {
        "name": "Engine Diagnostics",
        "description": "Full OBD-II scan plus live-data analysis. Written fault report included with every session.",
        "service_type": ServiceType.WORKSHOP,
        "base_price": Decimal("49.99"),
        "duration_minutes": 60,
    },
    {
        "name": "AC System Service",
        "description": "Refrigerant recharge, leak test, and cabin filter replacement. Restore factory-cold performance.",
        "service_type": ServiceType.WORKSHOP,
        "base_price": Decimal("89.99"),
        "duration_minutes": 75,
    },
    {
        "name": "Wheel Alignment & Balancing",
        "description": "4-wheel laser alignment plus dynamic balancing. Extends tyre life and improves fuel economy.",
        "service_type": ServiceType.WORKSHOP,
        "base_price": Decimal("59.99"),
        "duration_minutes": 60,
    },
    # --- Home Services (we come to you) ---
    {
        "name": "Home Oil Change",
        "description": "Certified mechanic visits your driveway for a full synthetic oil service — no garage trip needed.",
        "service_type": ServiceType.HOME,
        "base_price": Decimal("49.99"),
        "duration_minutes": 60,
    },
    {
        "name": "Home Battery Replacement",
        "description": "New OEM-spec battery fitted at your location. Old battery disposed of responsibly.",
        "service_type": ServiceType.HOME,
        "base_price": Decimal("79.99"),
        "duration_minutes": 30,
    },
    {
        "name": "Home Tyre Change",
        "description": "Up to 4 tyres swapped at your home or office. Includes torque check and tyre-pressure calibration.",
        "service_type": ServiceType.HOME,
        "base_price": Decimal("39.99"),
        "duration_minutes": 45,
    },
    # --- Roadside Assistance ---
    {
        "name": "Emergency Towing",
        "description": "24/7 flatbed tow to our nearest workshop or any location within 30 km.",
        "service_type": ServiceType.ROADSIDE,
        "base_price": Decimal("69.99"),
        "duration_minutes": 60,
    },
    {
        "name": "Jump-Start & Fuel Delivery",
        "description": "On-site battery jump-start or emergency fuel drop (up to 5 L). Average response: 25 minutes.",
        "service_type": ServiceType.ROADSIDE,
        "base_price": Decimal("29.99"),
        "duration_minutes": 30,
    },
]


def seed():
    db = SessionLocal()
    try:
        existing = db.query(Service).count()
        if existing > 0:
            print(f"[skip] Services table already has {existing} row(s). No changes made.")
            print("       To re-seed, manually clear the table first:")
            print("       psql -c 'TRUNCATE services RESTART IDENTITY CASCADE;'")
            return

        for data in SERVICES:
            db.add(Service(**data))

        db.commit()
        print(f"[ok]   Inserted {len(SERVICES)} services successfully.")
        for svc in db.query(Service).order_by(Service.service_type, Service.id).all():
            print(f"       [{svc.service_type.value:10s}] {svc.id:2d}. {svc.name} — ${svc.base_price}")
    except Exception as exc:
        db.rollback()
        print(f"[error] Seed failed: {exc}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    seed()
