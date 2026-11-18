from slowapi import Limiter
from slowapi.util import get_remote_address

# Shared limiter instance. Imported by main.py (to attach to app.state)
# and by endpoints (to decorate routes).
limiter = Limiter(
    key_func=get_remote_address,
    default_limits=[],  # no global limit — only per-route where declared
)