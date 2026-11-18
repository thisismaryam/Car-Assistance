import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

from app.core.config import settings


def send_email(to_email: str, subject: str, body: str) -> bool:
    """
    Sends an email using Python's smtplib.
    Uses SMTP_EMAIL / SMTP_PASSWORD / SMTP_HOST / SMTP_PORT from backend/.env (via settings).
    If credentials are not set, logs the notification cleanly (simulation mode).
    """
    smtp_email = settings.SMTP_EMAIL
    # Gmail shows app passwords as "abcd efgh ijkl mnop"; the spaces must not be sent.
    smtp_password = (settings.SMTP_PASSWORD or "").replace(" ", "")
    smtp_host = settings.SMTP_HOST
    smtp_port = settings.SMTP_PORT

    if not smtp_email or not smtp_password:
        print(f"\n[EMAIL NOTIFICATION (Simulated - No SMTP credentials set)]")
        print(f"To: {to_email}")
        print(f"Subject: {subject}")
        print(f"Body:\n{body}\n")
        return True

    try:
        msg = MIMEMultipart()
        msg["From"] = smtp_email
        msg["To"] = to_email
        msg["Subject"] = subject
        msg.attach(MIMEText(body, "plain"))

        if smtp_port == 465:
            with smtplib.SMTP_SSL(smtp_host, smtp_port, timeout=10) as server:
                server.login(smtp_email, smtp_password)
                server.send_message(msg)
        else:
            with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as server:
                server.starttls()
                server.login(smtp_email, smtp_password)
                server.send_message(msg)

        print(f"[EMAIL SENT] Successfully sent notification to {to_email}")
        return True
    except Exception as exc:
        print(f"[EMAIL ERROR] Failed to send email to {to_email}: {exc}")
        return False

