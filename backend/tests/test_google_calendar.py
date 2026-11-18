import unittest
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace
from unittest.mock import patch

from app.core.config import settings
from app.utils import google_calendar


class TestGoogleCalendar(unittest.TestCase):
    def setUp(self):
        self.booking = SimpleNamespace(
            id=42,
            scheduled_at=datetime(
                2026, 12, 1, 9, 30, tzinfo=timezone(timedelta(hours=5))),
            address="10 Example Road",
            notes="Call on arrival",
        )
        self.customer = SimpleNamespace(
            email="customer@example.com",
            full_name="Example Customer",
        )
        self.service = SimpleNamespace(
            name="Oil Change",
            base_price=Decimal("125.00"),
            duration_minutes=75,
        )
        self.vehicle = SimpleNamespace(
            year=2024,
            make="Example",
            model="Tourer",
            registration="ABC-123",
        )

    def test_event_body_converts_booking_time_to_utc_and_uses_service_duration(self):
        body = google_calendar.build_event_body(
            self.booking, self.customer, self.service, self.vehicle)

        start = datetime.fromisoformat(body["start"]["dateTime"])
        end = datetime.fromisoformat(body["end"]["dateTime"])
        self.assertEqual(start, datetime(2026, 12, 1, 4, 30, tzinfo=timezone.utc))
        self.assertEqual(end - start, timedelta(minutes=75))
        self.assertEqual(body["attendees"], [{
            "email": "customer@example.com",
            "displayName": "Example Customer",
        }])
        self.assertEqual(body["location"], "10 Example Road")
        self.assertIn("Call on arrival", body["description"])
        self.assertEqual(
            body["extendedProperties"]["private"]["bookingId"], "42")

    def test_create_booking_event_inserts_and_sends_guest_invitation(self):
        service_client = unittest.mock.MagicMock()
        service_client.events.return_value.insert.return_value.execute.return_value = {
            "id": "google-event-42",
        }
        with (
            patch.object(settings, "GOOGLE_CLIENT_ID", "client-id"),
            patch.object(settings, "GOOGLE_CLIENT_SECRET", "client-secret"),
            patch.object(settings, "GOOGLE_REFRESH_TOKEN", "refresh-token"),
            patch.object(settings, "GOOGLE_CALENDAR_ID", "calendar@example.com"),
            patch.object(google_calendar, "_service", return_value=service_client),
        ):
            event_id = google_calendar.create_booking_event(
                self.booking, self.customer, self.service, self.vehicle)

        self.assertEqual(event_id, "google-event-42")
        insert = service_client.events.return_value.insert
        self.assertEqual(insert.call_args.kwargs["calendarId"], "calendar@example.com")
        self.assertEqual(insert.call_args.kwargs["sendUpdates"], "all")
        self.assertEqual(
            insert.call_args.kwargs["body"]["attendees"][0]["email"],
            "customer@example.com",
        )

    def test_create_booking_event_skips_when_google_is_not_configured(self):
        with (
            patch.object(settings, "GOOGLE_CLIENT_ID", None),
            patch.object(settings, "GOOGLE_CLIENT_SECRET", None),
            patch.object(settings, "GOOGLE_REFRESH_TOKEN", None),
            patch.object(google_calendar, "_service") as service_factory,
        ):
            event_id = google_calendar.create_booking_event(
                self.booking, self.customer, self.service, self.vehicle)

        self.assertIsNone(event_id)
        service_factory.assert_not_called()

    def test_delete_booking_event_treats_already_missing_event_as_deleted(self):
        not_found = RuntimeError("event no longer exists")
        not_found.resp = SimpleNamespace(status=404)
        service_client = unittest.mock.MagicMock()
        service_client.events.return_value.delete.return_value.execute.side_effect = not_found
        with (
            patch.object(settings, "GOOGLE_CLIENT_ID", "client-id"),
            patch.object(settings, "GOOGLE_CLIENT_SECRET", "client-secret"),
            patch.object(settings, "GOOGLE_REFRESH_TOKEN", "refresh-token"),
            patch.object(google_calendar, "_service", return_value=service_client),
        ):
            removed = google_calendar.delete_booking_event("google-event-42")

        self.assertTrue(removed)


if __name__ == "__main__":
    unittest.main()
