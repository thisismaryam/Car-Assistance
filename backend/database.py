from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker


# ---------- Settings (loaded from .env) ----------

class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8")

    DATABASE_URL: str
    APP_NAME: str = "Car Assistance API"
    DEBUG: bool = True
    SECRET_KEY: str


settings = Settings()


# ---------- Database ----------

class Base(DeclarativeBase):
    """All ORM models inherit from this."""


engine = create_engine(
    settings.DATABASE_URL,
    echo=settings.DEBUG,
    pool_pre_ping=True,
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def get_db():
    """FastAPI dependency — opens a DB session for one request, then closes it."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# ---------- Password hashing ----------

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# ---------- JWT tokens ----------

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def create_access_token(data: dict) -> str:
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + \
        timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, settings.SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


# ---------- Current user dependency ----------

def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: Session = Depends(get_db),
):
    from models import User  # imported here to avoid circular import

    payload = decode_token(token)
    user_id = payload.get("sub")
    if user_id is None:
        raise HTTPException(status_code=401, detail="Invalid token payload")

    user = db.query(User).filter(User.id == int(user_id)).first()
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=401, detail="User not found or inactive")
    return user


def require_admin(current_user=Depends(get_current_user)):
    from models import UserRole

    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    return current_user
