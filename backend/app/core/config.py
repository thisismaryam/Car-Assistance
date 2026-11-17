from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8")
    DATABASE_URL: str
    APP_NAME: str = "Car Assistance API"
    DEBUG: bool = True
    SECRET_KEY: str


settings = Settings()
