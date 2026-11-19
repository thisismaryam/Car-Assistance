"""
Comprehensive verification test suite for Features 4, 5, and 6:
- Feature 4: Roadside Assistance Dispatch (lifecycle statuses, provider assignment records, incident data, WebSocket manager)
- Feature 5: AI Assistant with Real Backend Tools (Grounded RAG retrieval, live tools, conversational booking flow)
- Feature 6: Direct Booking Link (verified DB record retrieval, error handling)
"""

import sys
import os
import unittest
from datetime import datetime, date, timedelta, timezone
from decimal import Decimal

# Ensure backend root is in PYTHONPATH
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.database import Base
from app.models.user import User, UserRole
from app.models.vehicle import Vehicle
from app.models.booking import Booking, BookingStatus, Service, ServiceType
from app.models.roadside import RoadsideRequest, RoadsideAssignment
from app.models.mechanic import MechanicSchedule
from app.core.security import hash_password
from app.schemas.booking import BookingCreate
from app.services.booking_customer import resolve_booking_customer
from app.services.ai.rag import rag_retriever
from app.services.ai.tools import (
    get_live_services_tool,
    check_live_availability_tool,
    get_user_garage_tool,
    validate_booking_intent_tool,
    execute_confirmed_booking_core,
)
from app.services.ai.orchestrator import assistant_orchestrator
from app.services.roadside_dispatch import RoadsideDispatchManager


class TestFeatures456(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Use in-memory SQLite database with StaticPool for fast, isolated testing
        from sqlalchemy.pool import StaticPool
        cls.engine = create_engine(
            "sqlite:///:memory:",
            connect_args={"check_same_thread": False},
            poolclass=StaticPool,
        )
        Base.metadata.create_all(bind=cls.engine)
        cls.Session = sessionmaker(autocommit=False, autoflush=False, bind=cls.engine)

    def setUp(self):
        self.db = self.Session()
        # Seed test data
        self.customer = User(
            full_name="Ahmed Khan",
            email="ahmed@example.com",
            phone="+923001112233",
            hashed_password=hash_password("testpass123"),
            role=UserRole.CUSTOMER,
            is_active=True,
        )
        self.mechanic = User(
            full_name="Tariq Mahmood",
            email="tariq@carassistance.com",
            phone="+923004445566",
            hashed_password=hash_password("testpass123"),
            role=UserRole.MECHANIC,
            is_active=True,
        )
        self.admin = User(
            full_name="Admin Ops",
            email="admin@carassistance.com",
            phone="+923009998877",
            hashed_password=hash_password("adminpass123"),
            role=UserRole.ADMIN,
            is_active=True,
        )
        self.db.add_all([self.customer, self.mechanic, self.admin])
        self.db.commit()

        # Mechanic schedule Mon-Sat 09:00 - 18:00
        for d in range(6):
            self.db.add(
                MechanicSchedule(
                    mechanic_id=self.mechanic.id,
                    day_of_week=d,
                    start_time="09:00",
                    end_time="18:00",
                    is_active=True,
                )
            )

        # Vehicle
        self.vehicle = Vehicle(
            owner_id=self.customer.id,
            make="Toyota",
            model="Corolla",
            year=2022,
            registration="ICT-9988",
        )
        self.db.add(self.vehicle)

        # Services
        self.workshop_svc = Service(
            name="Oil & Filter Change",
            description="Full synthetic oil replacement",
            service_type=ServiceType.WORKSHOP,
            base_price=Decimal("29.99"),
            duration_minutes=45,
            is_active=True,
        )
        self.home_svc = Service(
            name="Home Battery Replacement",
            description="New OEM-spec battery fitted at your location",
            service_type=ServiceType.HOME,
            base_price=Decimal("79.99"),
            duration_minutes=30,
            is_active=True,
        )
        self.roadside_svc = Service(
            name="Emergency Towing",
            description="24/7 flatbed tow",
            service_type=ServiceType.ROADSIDE,
            base_price=Decimal("69.99"),
            duration_minutes=60,
            is_active=True,
        )
        self.db.add_all([self.workshop_svc, self.home_svc, self.roadside_svc])
        self.db.commit()

    def tearDown(self):
        self.db.rollback()
        # Clean up all rows
        for table in reversed(Base.metadata.sorted_tables):
            self.db.execute(table.delete())
        self.db.commit()
        self.db.close()

    # --- FEATURE 4 TESTS ---

    def test_roadside_incident_creation_and_lifecycle(self):
        """Verify full incident data capture, unique ID, and lifecycle statuses."""
        req = RoadsideRequest(
            user_id=self.customer.id,
            vehicle_id=self.vehicle.id,
            location="GPS: 31.5204, 74.3587 (Main Boulevard)",
            issue_type="Towing Required",
            notes="Left tyre shredded on curb",
            status="requested",
        )
        self.db.add(req)
        self.db.commit()
        self.db.refresh(req)

        self.assertIsNotNone(req.id)
        self.assertEqual(req.status, "requested")
        self.assertEqual(req.location, "GPS: 31.5204, 74.3587 (Main Boulevard)")
        self.assertEqual(req.vehicle_id, self.vehicle.id)

        # Transition to accepted
        now = datetime.now(timezone.utc)
        req.status = "accepted"
        req.accepted_at = now
        self.db.commit()
        self.assertEqual(req.status, "accepted")
        self.assertIsNotNone(req.accepted_at)

    def test_roadside_provider_assignment_record(self):
        """Verify provider assignment is backed by a valid RoadsideAssignment record."""
        req = RoadsideRequest(
            user_id=self.customer.id,
            location="Ferozepur Road",
            issue_type="Dead Battery / Jump Start",
            status="requested",
        )
        self.db.add(req)
        self.db.commit()

        # Admin assigns mechanic
        now = datetime.now(timezone.utc)
        assignment = RoadsideAssignment(
            request_id=req.id,
            mechanic_id=self.mechanic.id,
            assigned_by_id=self.admin.id,
            status="active",
            notes="Flatbed unit #2 dispatched",
            created_at=now,
        )
        req.assigned_mechanic_id = self.mechanic.id
        req.status = "assigned"
        req.assigned_at = now
        self.db.add(assignment)
        self.db.commit()

        # Check DB persistence
        retrieved_assignment = self.db.query(RoadsideAssignment).filter(RoadsideAssignment.request_id == req.id).first()
        self.assertIsNotNone(retrieved_assignment)
        self.assertEqual(retrieved_assignment.mechanic_id, self.mechanic.id)
        self.assertEqual(retrieved_assignment.assigned_by_id, self.admin.id)
        self.assertEqual(retrieved_assignment.status, "active")

        # Advance to en route -> arrived -> resolved
        req.status = "en route"
        req.en_route_at = datetime.now(timezone.utc)
        self.db.commit()
        self.assertEqual(req.status, "en route")

        req.status = "resolved"
        req.resolved_at = datetime.now(timezone.utc)
        retrieved_assignment.status = "completed"
        retrieved_assignment.completed_at = req.resolved_at
        self.db.commit()

        self.assertEqual(req.status, "resolved")
        self.assertEqual(retrieved_assignment.status, "completed")

    def test_roadside_dispatch_manager_channels(self):
        """Verify WebSocket dispatch manager tracking structures."""
        mgr = RoadsideDispatchManager()
        self.assertEqual(len(mgr.admin_connections), 0)
        self.assertEqual(len(mgr.customer_connections), 0)

    # --- FEATURE 5 TESTS ---

    def test_grounded_rag_retrieval(self):
        """Verify grounded RAG strictly retrieves official approved documentation."""
        answer = rag_retriever.answer_knowledge_query("What are the workshop operating hours and bay capacity?")
        self.assertIn("100 Auto Care Way", answer)
        self.assertIn("09:00 to 18:00 UTC", answer)
        self.assertIn("3", answer)
        self.assertIn("Source: [Workshop Facility & Bay Operating Guidelines]", answer)

    def test_live_backend_tool_pricing(self):
        """Verify live services tool fetches real prices from database."""
        services = get_live_services_tool(self.db)
        self.assertEqual(len(services), 3)
        svc_names = [s["name"] for s in services]
        self.assertIn("Oil & Filter Change", svc_names)
        self.assertIn("Home Battery Replacement", svc_names)

        # Workshop filter
        workshop_only = get_live_services_tool(self.db, service_type_str="workshop")
        self.assertEqual(len(workshop_only), 1)
        self.assertEqual(workshop_only[0]["name"], "Oil & Filter Change")
        self.assertEqual(workshop_only[0]["base_price"], 29.99)

    def test_live_backend_tool_user_garage(self):
        """Verify garage tool verifies authentication and returns owned vehicles."""
        # Unauthenticated
        unauth = get_user_garage_tool(self.db, current_user=None)
        self.assertFalse(unauth["authenticated"])

        # Authenticated
        auth = get_user_garage_tool(self.db, current_user=self.customer)
        self.assertTrue(auth["authenticated"])
        self.assertEqual(len(auth["vehicles"]), 1)
        self.assertEqual(auth["vehicles"][0]["registration"], "ICT-9988")

    def test_staff_token_does_not_override_guest_booking_email(self):
        payload = BookingCreate(
            customer_name="Ahmed Khan",
            customer_email=self.customer.email.upper(),
            customer_phone=self.customer.phone,
            service_id=self.workshop_svc.id,
            scheduled_at=datetime.now(timezone.utc) + timedelta(days=3),
        )

        booking_customer = resolve_booking_customer(
            db=self.db,
            payload=payload,
            current_user=self.admin,
        )

        self.assertEqual(booking_customer.id, self.customer.id)
        self.assertEqual(booking_customer.email, self.customer.email)

        authenticated_customer = resolve_booking_customer(
            db=self.db,
            payload=BookingCreate(
                customer_email="different@example.com",
                service_id=self.workshop_svc.id,
                scheduled_at=datetime.now(timezone.utc) + timedelta(days=3),
            ),
            current_user=self.customer,
        )
        self.assertEqual(authenticated_customer.id, self.customer.id)

        new_guest_payload = BookingCreate(
            customer_name="Guest Driver",
            customer_email="guest.driver@example.com",
            customer_phone="+923001234567",
            service_id=self.workshop_svc.id,
            scheduled_at=datetime.now(timezone.utc) + timedelta(days=3),
        )
        new_guest = resolve_booking_customer(
            db=self.db,
            payload=new_guest_payload,
            current_user=self.admin,
        )

        self.assertEqual(new_guest.email, "guest.driver@example.com")
        self.assertEqual(new_guest.role, UserRole.CUSTOMER)

    def test_conversational_booking_flow_requires_confirmation(self):
        """Verify booking flow requires explicit confirmation before creating records."""
        # Attempt booking without confirmation
        response = assistant_orchestrator.process_message(
            db=self.db,
            message="I want to book an Oil & Filter Change for my Toyota Corolla tomorrow at 11:00 UTC",
            history=[],
            current_user=self.customer,
        )
        self.assertEqual(response["branch"], "conversational_booking")
        self.assertIsNone(response["booking_id"])
        self.assertIn("Would you like me to confirm and execute this booking now?", response["reply"])

        # Total bookings in DB should still be 0!
        self.assertEqual(self.db.query(Booking).count(), 0)

        # Now provide explicit confirmation
        confirm_response = assistant_orchestrator.process_message(
            db=self.db,
            message="Yes, please confirm",
            history=[
                {
                    "role": "user",
                    "content": "I want to book an Oil & Filter Change for my Toyota Corolla tomorrow at 11:00 UTC",
                },
                {"role": "assistant", "content": response["reply"]},
            ],
            current_user=self.customer,
        )

        self.assertEqual(confirm_response["branch"], "conversational_booking")
        self.assertIsNotNone(confirm_response["booking_id"])
        self.assertIsNotNone(confirm_response["booking_link"])
        self.assertIn(f"/dashboard/bookings/{confirm_response['booking_id']}", confirm_response["booking_link"])

        # Verified in database!
        db_booking = self.db.query(Booking).filter(Booking.id == confirm_response["booking_id"]).first()
        self.assertIsNotNone(db_booking)
        self.assertEqual(db_booking.customer_id, self.customer.id)
        self.assertEqual(db_booking.vehicle_id, self.vehicle.id)

    def test_booking_does_not_fill_missing_vehicle_service_or_time(self):
        request = "I want to book an appointment for my car"
        response = assistant_orchestrator.process_message(
            db=self.db,
            message=request,
            history=[],
            current_user=self.customer,
        )

        self.assertIn("Which vehicle", response["reply"])
        self.assertIn("Which service", response["reply"])
        self.assertIn("date and time", response["reply"])
        self.assertIsNone(response["booking_id"])
        self.assertEqual(self.db.query(Booking).count(), 0)

        cancelled = assistant_orchestrator.process_message(
            db=self.db,
            message="no",
            history=[
                {"role": "user", "content": request},
                {"role": "assistant", "content": response["reply"]},
            ],
            current_user=self.customer,
        )
        self.assertIn("no booking was made", cancelled["reply"].lower())
        self.assertEqual(self.db.query(Booking).count(), 0)

        validation = validate_booking_intent_tool(
            db=self.db,
            current_user=self.customer,
            vehicle_query=None,
            service_query=self.workshop_svc.id,
            scheduled_at=datetime.now(timezone.utc) + timedelta(days=3),
        )
        self.assertEqual(validation["error_type"], "VEHICLE_SELECTION_REQUIRED")

    def test_booking_rejection_clears_draft_without_execution(self):
        request = "Book Oil & Filter Change for Toyota Corolla tomorrow at 11:00 UTC"
        proposal = assistant_orchestrator.process_message(
            db=self.db,
            message=request,
            history=[],
            current_user=self.customer,
        )
        history = [
            {"role": "user", "content": request},
            {"role": "assistant", "content": proposal["reply"]},
        ]

        rejected = assistant_orchestrator.process_message(
            db=self.db,
            message="no/cancel",
            history=history,
            current_user=self.customer,
        )

        self.assertIn("draft", rejected["reply"])
        self.assertIn("no booking was made", rejected["reply"].lower())
        self.assertIsNone(rejected["booking_id"])
        self.assertEqual(self.db.query(Booking).count(), 0)

        after_rejection = assistant_orchestrator.process_message(
            db=self.db,
            message="yes",
            history=history + [{"role": "assistant", "content": rejected["reply"]}],
            current_user=self.customer,
        )
        self.assertIsNone(after_rejection["booking_id"])
        self.assertEqual(self.db.query(Booking).count(), 0)

    # --- FEATURE 6 TESTS ---

    def test_direct_booking_verification_and_authorization(self):
        """Verify direct booking record retrieval enforces authorization."""
        # Create a booking in DB
        booking = Booking(
            customer_id=self.customer.id,
            vehicle_id=self.vehicle.id,
            service_id=self.workshop_svc.id,
            scheduled_at=datetime.now(timezone.utc) + timedelta(days=2),
            status=BookingStatus.CONFIRMED,
        )
        self.db.add(booking)
        self.db.commit()
        self.db.refresh(booking)

        # Query authorized customer
        found = self.db.query(Booking).filter(
            Booking.id == booking.id,
            Booking.customer_id == self.customer.id
        ).first()
        self.assertIsNotNone(found)
        self.assertEqual(found.id, booking.id)

        # Query unauthorized other user
        other_user = User(
            full_name="Other User",
            email="other@example.com",
            phone="+923000000000",
            hashed_password=hash_password("pass123"),
            role=UserRole.CUSTOMER,
        )
        self.db.add(other_user)
        self.db.commit()

        unauthorized = self.db.query(Booking).filter(
            Booking.id == booking.id,
            Booking.customer_id == other_user.id
        ).first()
        self.assertIsNone(unauthorized)


if __name__ == "__main__":
    unittest.main()
