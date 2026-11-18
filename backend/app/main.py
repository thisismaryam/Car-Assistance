from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.database import engine, Base
import app.models  # Registers all models including RoadsideRequest
from app.api.endpoints import auth, bookings, services, vehicles, roadside, chat, mechanics
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from app.core.limiter import limiter

app = FastAPI(title=settings.APP_NAME, debug=settings.DEBUG)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/auth", tags=["Authentication"])
app.include_router(services.router, prefix="/services", tags=["Services"])
app.include_router(vehicles.router, prefix="/vehicles", tags=["Vehicles"])
app.include_router(bookings.router, prefix="/bookings", tags=["Bookings"])
app.include_router(roadside.router, prefix="/roadside", tags=["Roadside Assistance"])
app.include_router(mechanics.router, prefix="/admin/mechanics", tags=["Mechanic Management"])
app.include_router(mechanics.router, prefix="/mechanics", tags=["Mechanic Management"])
app.include_router(chat.router, prefix="/api/chat", tags=["AI Chatbot"])
app.include_router(chat.router, prefix="/chat", tags=["AI Chatbot"])


@app.get("/health")
def health():
    return {"status": "ok"}
