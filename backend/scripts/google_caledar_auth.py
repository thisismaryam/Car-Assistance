"""
One-time helper: gets the refresh token for your BUSINESS Google account.

Run from the backend folder, signed in to the business Google account in your browser:

    pip install google-auth-oauthlib
    python scripts/google_calendar_auth.py

It reads GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET from backend/.env, opens a
browser for you to approve calendar access, then prints GOOGLE_REFRESH_TOKEN.
Paste that line into backend/.env.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from google_auth_oauthlib.flow import InstalledAppFlow  # noqa: E402

from app.core.config import settings  # noqa: E402

SCOPES = ["https://www.googleapis.com/auth/calendar.events"]


def main():
    if not settings.GOOGLE_CLIENT_ID or not settings.GOOGLE_CLIENT_SECRET:
        sys.exit(
            "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend/.env first.")

    flow = InstalledAppFlow.from_client_config(
        {
            "installed": {
                "client_id": settings.GOOGLE_CLIENT_ID,
                "client_secret": settings.GOOGLE_CLIENT_SECRET,
                "auth_uri": "https://accounts.google.com/o/oauth2/auth",
                "token_uri": "https://oauth2.googleapis.com/token",
                "redirect_uris": ["http://localhost"],
            }
        },
        scopes=SCOPES,
    )
    # access_type=offline + prompt=consent guarantees a refresh token is returned
    creds = flow.run_local_server(
        port=0, access_type="offline", prompt="consent")

    if not creds.refresh_token:
        sys.exit(
            "No refresh token returned. Remove the app at myaccount.google.com/permissions and retry.")
    print("\nAdd this line to backend/.env:\n")
    print(f"GOOGLE_REFRESH_TOKEN={creds.refresh_token}\n")


if __name__ == "__main__":
    main()
