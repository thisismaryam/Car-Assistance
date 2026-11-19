from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore"  # <--- THIS IS THE CRITICAL LINE

    )

    DATABASE_URL: str
    APP_NAME: str = "Car Assistance API"
    DEBUG: bool = True
    SECRET_KEY: str

    GROQ_API_KEY: str | None = None
    SMTP_EMAIL: str | None = None
    SMTP_PASSWORD: str | None = None
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    # Optional: staff inbox that gets an email for roadside requests and booking notes.
    ADMIN_NOTIFY_EMAIL: str | None = None

    # Voice assistant (ElevenLabs). One key can serve both; the STT/TTS-specific
    # keys override it if you created separate keys.
    ELEVENLABS_API_KEY: str | None = None
    ELEVENLABS_STT_API_KEY: str | None = None
    ELEVENLABS_TTS_API_KEY: str | None = None
    ELEVENLABS_VOICE_ID: str = "JBFqnCBsd6RMkjVDRZzb"
    ELEVENLABS_TTS_MODEL: str = "eleven_flash_v2_5"
    # Browsers do not apply CORS to WebSockets, so the voice endpoint checks Origin itself.
    VOICE_ALLOWED_ORIGINS: str = "http://localhost:3000,http://127.0.0.1:3000"

    GOOGLE_CLIENT_ID: str | None = None
    GOOGLE_CLIENT_SECRET: str | None = None
    GOOGLE_REFRESH_TOKEN: str | None = None
    GOOGLE_CALENDAR_ID: str = "primary"


settings = Settings()
