from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.booking import Service, ServiceType
from app.models.user import User
from app.schemas.booking import ServiceCreate, ServiceRead
from app.core.security import require_admin

router = APIRouter()


@router.post("/", response_model=ServiceRead, status_code=201)
def create_service(payload: ServiceCreate, db: Session = Depends(get_db), admin: User = Depends(require_admin)):
    service = Service(**payload.model_dump())
    db.add(service)
    db.commit()
    db.refresh(service)
    return service


@router.get("/", response_model=list[ServiceRead])
def list_services(service_type: ServiceType | None = None, db: Session = Depends(get_db)):
    query = db.query(Service).filter(Service.is_active == True)
    if service_type:
        query = query.filter(Service.service_type == service_type)
    return query.all()
