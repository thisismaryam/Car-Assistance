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

settings = Settings()