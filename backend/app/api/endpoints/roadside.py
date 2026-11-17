from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.models.roadside import RoadsideRequest
from app.models.vehicle import Vehicle
from app.models.user import User
from app.schemas.roadside import RoadsideCreate, RoadsideRead, RoadsideStatusUpdate
from app.core.security import get_current_user, require_admin

router = APIRouter()


@router.post("/", response_model=RoadsideRead, status_code=201)
def create_roadside_request(
    payload: RoadsideCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    if payload.vehicle_id:
        vehicle = db.query(Vehicle).filter(
            Vehicle.id == payload.vehicle_id,
            Vehicle.owner_id == current_user.id
        ).first()
        if not vehicle:
            raise HTTPException(status_code=404, detail="Vehicle not found")

    roadside = RoadsideRequest(
        user_id=current_user.id,
        vehicle_id=payload.vehicle_id,
        location=payload.location,
        issue_type=payload.issue_type,
        notes=payload.notes,
        status="pending"
    )
    db.add(roadside)
    db.commit()
    db.refresh(roadside)

    return db.query(RoadsideRequest).options(
        joinedload(RoadsideRequest.user),
        joinedload(RoadsideRequest.vehicle)
    ).filter(RoadsideRequest.id == roadside.id).first()


@router.get("/my", response_model=list[RoadsideRead])
def get_my_roadside_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return db.query(RoadsideRequest).options(
        joinedload(RoadsideRequest.user),
        joinedload(RoadsideRequest.vehicle)
    ).filter(RoadsideRequest.user_id == current_user.id).order_by(RoadsideRequest.created_at.desc()).all()


@router.get("/all", response_model=list[RoadsideRead])
def get_all_roadside_requests(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    return db.query(RoadsideRequest).options(
        joinedload(RoadsideRequest.user),
        joinedload(RoadsideRequest.vehicle)
    ).order_by(RoadsideRequest.created_at.desc()).all()


@router.patch("/{request_id}/status", response_model=RoadsideRead)
def update_roadside_status(
    request_id: int,
    payload: RoadsideStatusUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    roadside = db.query(RoadsideRequest).filter(RoadsideRequest.id == request_id).first()
    if not roadside:
        raise HTTPException(status_code=404, detail="Roadside request not found")

    roadside.status = payload.status
    db.commit()
    db.refresh(roadside)

    return db.query(RoadsideRequest).options(
        joinedload(RoadsideRequest.user),
        joinedload(RoadsideRequest.vehicle)
    ).filter(RoadsideRequest.id == roadside.id).first()

