from app.core.config import settings
from app.utils.email import send_email


def notify_admin(subject: str, body: str) -> None:
    """Email the staff inbox (ADMIN_NOTIFY_EMAIL in backend/.env).

    Does nothing when the setting is empty, and never raises: a mail problem must
    not break a booking or an emergency request.
    """
    to_email = (settings.ADMIN_NOTIFY_EMAIL or "").strip()
    if not to_email:
        return
    try:
        send_email(to_email=to_email, subject=subject, body=body)
    except Exception as exc:  # noqa: BLE001
        print(f"[ADMIN NOTIFY ERROR] {exc}")
