"""Chat assistant behaviour for guest customers (no accounts): lookup by email + phone, no login wall."""
import os
import sys
import unittest
from datetime import datetime, timedelta, timezone
from decimal import Decimal

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
os.environ.setdefault("DATABASE_URL", "sqlite://")
os.environ.setdefault("SECRET_KEY", "test-secret")

from sqlalchemy import create_engine  # noqa: E402
from sqlalchemy.orm import sessionmaker  # noqa: E402
from sqlalchemy.pool import StaticPool  # noqa: E402

from app.database import Base  # noqa: E402
from app.models.booking import Booking, BookingStatus, Service, ServiceType  # noqa: E402
from app.models.user import User, UserRole  # noqa: E402
from app.models.vehicle import Vehicle  # noqa: E402
from app.services.ai import orchestrator as orch_mod  # noqa: E402
from app.services.ai.orchestrator import assistant_orchestrator as bot  # noqa: E402


class TestGuestChat(unittest.TestCase):
    def setUp(self):
        engine = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False}, poolclass=StaticPool)
        Base.metadata.create_all(bind=engine)
        self.db = sessionmaker(bind=engine)()
        orch_mod._lookup_failures.clear()
        u = User(full_name="Miriam Z", email="miriam@gmail.com", phone="+92 300 1234567",
                 hashed_password="x", role=UserRole.CUSTOMER, is_active=True)
        self.db.add(u)
        self.db.flush()
        v = Vehicle(owner_id=u.id, make="BMW", model="M5", year=2021, registration="OG 04")
        s = Service(name="Oil & Filter Change", description="d", service_type=ServiceType.WORKSHOP,
                    base_price=Decimal("29.99"), duration_minutes=60, is_active=True)
        self.db.add_all([v, s])
        self.db.flush()
        self.db.add(Booking(customer_id=u.id, vehicle_id=v.id, service_id=s.id, status=BookingStatus.PENDING,
                            scheduled_at=datetime.now(timezone.utc) + timedelta(days=3)))
        self.db.commit()
        # no Groq key in tests: force rule-based path
        orch_mod.settings.GROQ_API_KEY = None

    def ask(self, msg, history=None):
        return bot.process_message(self.db, msg, history or [], None)

    def test_my_appointment_is_lookup_not_login_wall(self):
        r = self.ask("Can you tell me about the appointment I made for BMW M5 under the name Miriam?")
        self.assertEqual(r["branch"], "booking_lookup")
        self.assertIn("email address and the phone number", r["reply"])
        self.assertNotIn("/login", r["reply"])

    def test_lookup_with_matching_email_and_phone(self):
        first = self.ask("what is the status of my booking")
        hist = [{"role": "assistant", "content": first["reply"]}]
        r = self.ask("my email is Miriam@Gmail.com and phone 0300-1234567", hist)
        self.assertEqual(r["branch"], "booking_lookup")
        self.assertIn("Oil & Filter Change", r["reply"])
        self.assertIn("BMW M5", r["reply"])

    def test_wrong_phone_gets_generic_error_and_is_throttled(self):
        hist = [{"role": "assistant", "content": "share the email address and the phone number"}]
        for _ in range(orch_mod.MAX_LOOKUP_FAILURES):
            r = self.ask("miriam@gmail.com 0311 0000000", hist)
            self.assertIn("couldn't find", r["reply"])
        r = self.ask("miriam@gmail.com 0300 1234567", hist)  # even the right phone is blocked now
        self.assertIn("Too many", r["reply"])

    def test_new_booking_request_points_guest_to_forms(self):
        r = self.ask("Book an Oil Change for my car")
        self.assertEqual(r["branch"], "conversational_booking")
        self.assertIn("/dashboard/workshop", r["reply"])
        self.assertNotIn("(/login)", r["reply"])


if __name__ == "__main__":
    unittest.main()
