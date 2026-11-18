"""
Google Calendar invitations for bookings.

How it works: the BUSINESS Google account owns the calendar. For each booking we
create an event on that calendar and add the customer's email as a guest with
sendUpdates="all", so Google emails the customer an invitation they can accept.
The customer never connects a Google account to this website.

Everything here is best-effort: if Google is not configured, is down, or rejects a
request, we log it and return None/False. A booking must never fail because of
the calendar.
"""
import logging
from datetime import datetime, timedelta, timezone

from app.core.config import settings

logger = logging.getLogger("google_calendar")

SCOPES = ["https://www.googleapis.com/auth/calendar.events"]
TOKEN_URI = "https://oauth2.googleapis.com/token"
HTTP_TIMEOUT_SECONDS = 10


def is_configured() -> bool:
    return all([
        settings.GOOGLE_CLIENT_ID,
        settings.GOOGLE_CLIENT_SECRET,
        settings.GOOGLE_REFRESH_TOKEN,
    ])


def _service():
    # Imported lazily so the app still starts if the Google packages aren't installed.
    import google_auth_httplib2
    import httplib2
    from google.oauth2.credentials import Credentials
    from googleapiclient.discovery import build

    creds = Credentials(
        token=None,
        refresh_token=settings.GOOGLE_REFRESH_TOKEN,
        token_uri=TOKEN_URI,
        client_id=settings.GOOGLE_CLIENT_ID,
        client_secret=settings.GOOGLE_CLIENT_SECRET,
        scopes=SCOPES,
    )
    http = google_auth_httplib2.AuthorizedHttp(
        creds, http=httplib2.Http(timeout=HTTP_TIMEOUT_SECONDS)
    )
    return build("calendar", "v3", http=http, cache_discovery=False)


def build_event_body(booking, customer, service, vehicle) -> dict:
    start = booking.scheduled_at
    if start.tzinfo is None:
        start = start.replace(tzinfo=timezone.utc)
    start = start.astimezone(timezone.utc)
    end = start + timedelta(minutes=service.duration_minutes or 60)

    vehicle_line = (
        f"{vehicle.year} {vehicle.make} {vehicle.model} ({vehicle.registration})"
        if vehicle else "Vehicle on file"
    )
    lines = [
        f"Booking #{booking.id}",
        f"Service: {service.name} (Rs. {service.base_price})",
        f"Vehicle: {vehicle_line}",
    ]
    if booking.address:
        lines.append(f"Service address: {booking.address}")
    if booking.notes:
        lines.append(f"Notes: {booking.notes}")
    lines.append("")
    lines.append("Thank you for choosing Car Assistance.")

    body = {
        "summary": f"{service.name} - Car Assistance",
        "description": "\n".join(lines),
        "start": {"dateTime": start.isoformat(), "timeZone": "UTC"},
        "end": {"dateTime": end.isoformat(), "timeZone": "UTC"},
        "attendees": [{"email": customer.email, "displayName": customer.full_name}],
        "reminders": {"useDefault": False, "overrides": [{"method": "popup", "minutes": 60}]},
        "extendedProperties": {"private": {"bookingId": str(booking.id)}},
    }
    if booking.address:
        body["location"] = booking.address
    return body


def create_booking_event(booking, customer, service, vehicle) -> str | None:
    """Create the event + email the invitation. Returns the Google event id, or None."""
    if not is_configured():
        logger.info(
            "Google Calendar not configured; skipping invite for booking #%s", booking.id)
        return None
    if not customer or not customer.email:
        return None
    try:
        event = (
            _service()
            .events()
            .insert(
                calendarId=settings.GOOGLE_CALENDAR_ID,
                body=build_event_body(booking, customer, service, vehicle),
                sendUpdates="all",  # Google emails the invitation to the customer
            )
            .execute()
        )
        return event.get("id")
    except Exception as exc:  # never break a booking over the calendar
        logger.warning(
            "Google Calendar invite failed for booking #%s: %s", booking.id, exc)
        print(f"[GOOGLE CALENDAR ERROR] booking #{booking.id}: {exc}")
        return None


def delete_booking_event(event_id: str | None) -> bool:
    """Remove the event; Google emails guests a cancellation. Returns True if removed."""
    if not event_id or not is_configured():
        return False
    try:
        _service().events().delete(
            calendarId=settings.GOOGLE_CALENDAR_ID,
            eventId=event_id,
            sendUpdates="all",
        ).execute()
        return True
    except Exception as exc:
        # 404/410 = already gone, which is fine
        status = getattr(getattr(exc, "resp", None), "status", None)
        if status in (404, 410):
            return True
        logger.warning(
            "Google Calendar delete failed for event %s: %s", event_id, exc)
        print(f"[GOOGLE CALENDAR ERROR] delete {event_id}: {exc}")
        return False
