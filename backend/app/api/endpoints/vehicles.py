from fastapi import HTTPException
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.vehicle import Vehicle
from app.models.user import User
from app.schemas.vehicle import VehicleCreate, VehicleRead
from app.core.security import get_current_user

router = APIRouter()


@router.post("/", response_model=VehicleRead, status_code=201)
def add_vehicle(payload: VehicleCreate, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    vehicle = Vehicle(**payload.model_dump(), owner_id=current_user.id)
    db.add(vehicle)
    db.commit()
    db.refresh(vehicle)
    return vehicle


@router.get("/my-vehicles", response_model=list[VehicleRead])
def get_my_vehicles(db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    return db.query(Vehicle).filter(Vehicle.owner_id == current_user.id).all()


@router.delete("/{vehicle_id}")
def delete_vehicle(
    vehicle_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    vehicle = db.query(Vehicle).filter(
        Vehicle.id == vehicle_id,
        Vehicle.owner_id == current_user.id
    ).first()

    if not vehicle:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    db.delete(vehicle)
    db.commit()
    return {"message": "Vehicle deleted successfully"}
