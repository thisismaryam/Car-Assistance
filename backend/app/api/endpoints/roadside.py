from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status
from sqlalchemy.orm import Session, joinedload
from app.database import get_db
from app.models.roadside import RoadsideRequest, RoadsideAssignment
from app.models.vehicle import Vehicle
from app.models.user import User, UserRole
from app.schemas.roadside import (
    RoadsideCreate,
    RoadsideRead,
    RoadsideStatusUpdate,
    RoadsideAssignPayload,
    RoadsideAssignmentRead,
)
from app.core.security import get_current_user, require_admin
from app.services.roadside_dispatch import dispatch_manager

router = APIRouter()

ALLOWED_LIFECYCLE_STATUSES = [
    "requested",
    "accepted",
    "assigned",
    "en route",
    "en_route",
    "arrived",
    "resolved",
    "cancelled",
]


def _format_roadside_dict(r: RoadsideRequest) -> dict:
    """Serializes a RoadsideRequest object to a dictionary for real-time WebSocket payloads."""
    return {
        "id": r.id,
        "user_id": r.user_id,
        "vehicle_id": r.vehicle_id,
        "location": r.location,
        "issue_type": r.issue_type,
        "status": r.status,
        "notes": r.notes,
        "assigned_mechanic_id": r.assigned_mechanic_id,
        "assigned_mechanic": {
            "id": r.assigned_mechanic.id,
            "full_name": r.assigned_mechanic.full_name,
            "phone": r.assigned_mechanic.phone,
            "email": r.assigned_mechanic.email,
        } if r.assigned_mechanic else None,
        "user": {
            "id": r.user.id,
            "full_name": r.user.full_name,
            "phone": r.user.phone,
            "email": r.user.email,
        } if r.user else None,
        "vehicle": {
            "id": r.vehicle.id,
            "make": r.vehicle.make,
            "model": r.vehicle.model,
            "year": r.vehicle.year,
            "registration": r.vehicle.registration,
        } if r.vehicle else None,
        "accepted_at": r.accepted_at.isoformat() if r.accepted_at else None,
        "assigned_at": r.assigned_at.isoformat() if r.assigned_at else None,
        "en_route_at": r.en_route_at.isoformat() if r.en_route_at else None,
        "arrived_at": r.arrived_at.isoformat() if r.arrived_at else None,
        "resolved_at": r.resolved_at.isoformat() if r.resolved_at else None,
        "cancelled_at": r.cancelled_at.isoformat() if r.cancelled_at else None,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
    }


@router.post("/", response_model=RoadsideRead, status_code=201)
async def create_roadside_request(
    payload: RoadsideCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    FEATURE 4: Emergency dispatch workflow capturing complete incident data:
    issue type, vehicle, location, customer notes, and timestamps under unique request IDs.
    Persists to PostgreSQL with immediate streaming to the dedicated admin queue.
    """
    if payload.vehicle_id:
        vehicle = db.query(Vehicle).filter(
            Vehicle.id == payload.vehicle_id,
            Vehicle.owner_id == current_user.id
        ).first()
        if not vehicle:
            raise HTTPException(status_code=404, detail="Vehicle not found or does not belong to your account")

    roadside = RoadsideRequest(
        user_id=current_user.id,
        vehicle_id=payload.vehicle_id,
        location=payload.location.strip(),
        issue_type=payload.issue_type.strip(),
        notes=payload.notes.strip() if payload.notes else None,
        status="requested"
    )
    db.add(roadside)
    db.commit()
    db.refresh(roadside)

    record = (
        db.query(RoadsideRequest)
        .options(
            joinedload(RoadsideRequest.user),
            joinedload(RoadsideRequest.vehicle),
            joinedload(RoadsideRequest.assigned_mechanic),
            joinedload(RoadsideRequest.assignments).joinedload(RoadsideAssignment.mechanic),
        )
        .filter(RoadsideRequest.id == roadside.id)
        .first()
    )

    # Real-time notification to dedicated admin queue
    try:
        await dispatch_manager.broadcast_to_admins("new_incident", _format_roadside_dict(record))
    except Exception:
        pass

    return record


@router.get("/my", response_model=list[RoadsideRead])
def get_my_roadside_requests(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    return (
        db.query(RoadsideRequest)
        .options(
            joinedload(RoadsideRequest.user),
            joinedload(RoadsideRequest.vehicle),
            joinedload(RoadsideRequest.assigned_mechanic),
            joinedload(RoadsideRequest.assignments).joinedload(RoadsideAssignment.mechanic),
        )
        .filter(RoadsideRequest.user_id == current_user.id)
        .order_by(RoadsideRequest.created_at.desc())
        .all()
    )


@router.get("/all", response_model=list[RoadsideRead])
def get_all_roadside_requests(
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    return (
        db.query(RoadsideRequest)
        .options(
            joinedload(RoadsideRequest.user),
            joinedload(RoadsideRequest.vehicle),
            joinedload(RoadsideRequest.assigned_mechanic),
            joinedload(RoadsideRequest.assignments).joinedload(RoadsideAssignment.mechanic),
        )
        .order_by(RoadsideRequest.created_at.desc())
        .all()
    )


@router.get("/{request_id}", response_model=RoadsideRead)
def get_roadside_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    query = (
        db.query(RoadsideRequest)
        .options(
            joinedload(RoadsideRequest.user),
            joinedload(RoadsideRequest.vehicle),
            joinedload(RoadsideRequest.assigned_mechanic),
            joinedload(RoadsideRequest.assignments).joinedload(RoadsideAssignment.mechanic),
        )
        .filter(RoadsideRequest.id == request_id)
    )
    if current_user.role != UserRole.ADMIN:
        query = query.filter(RoadsideRequest.user_id == current_user.id)

    record = query.first()
    if not record:
        raise HTTPException(status_code=404, detail="Roadside request not found or unauthorized")
    return record


@router.patch("/{request_id}/assign", response_model=RoadsideRead)
async def assign_roadside_provider(
    request_id: int,
    payload: RoadsideAssignPayload,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin)
):
    """
    FEATURE 4: Enable mechanic or towing provider assignments backed by valid assignment records.
    Updates the request to 'assigned' and streams real-time updates to customer and admin.
    """
    roadside = (
        db.query(RoadsideRequest)
        .options(
            joinedload(RoadsideRequest.user),
            joinedload(RoadsideRequest.vehicle),
            joinedload(RoadsideRequest.assigned_mechanic),
            joinedload(RoadsideRequest.assignments),
        )
        .filter(RoadsideRequest.id == request_id)
        .first()
    )
    if not roadside:
        raise HTTPException(status_code=404, detail="Roadside incident not found")

    # Verify mechanic exists and is active
    mechanic = db.query(User).filter(
        User.id == payload.mechanic_id,
        User.role.in_([UserRole.MECHANIC, UserRole.ADMIN]),
        User.is_active == True
    ).first()
    if not mechanic:
        raise HTTPException(status_code=404, detail="Active mechanic or provider not found")

    now = datetime.now(timezone.utc)

    # 1. Back assignment with valid RoadsideAssignment record
    assignment = RoadsideAssignment(
        request_id=roadside.id,
        mechanic_id=mechanic.id,
        assigned_by_id=admin.id,
        status="active",
        notes=payload.notes,
        created_at=now
    )
    db.add(assignment)

    # 2. Update RoadsideRequest fields
    roadside.assigned_mechanic_id = mechanic.id
    roadside.status = "assigned"
    roadside.assigned_at = now
    roadside.updated_at = now
    db.commit()

    record = (
        db.query(RoadsideRequest)
        .options(
            joinedload(RoadsideRequest.user),
            joinedload(RoadsideRequest.vehicle),
            joinedload(RoadsideRequest.assigned_mechanic),
            joinedload(RoadsideRequest.assignments).joinedload(RoadsideAssignment.mechanic),
        )
        .filter(RoadsideRequest.id == roadside.id)
        .first()
    )

    data_dict = _format_roadside_dict(record)

    # Real-time streams
    await dispatch_manager.broadcast_to_admins("incident_assigned", data_dict)
    await dispatch_manager.notify_customer(roadside.id, "incident_assigned", data_dict)

    return record


@router.patch("/{request_id}/status", response_model=RoadsideRead)
async def update_roadside_status(
    request_id: int,
    payload: RoadsideStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """
    FEATURE 4: Track lifecycle statuses (requested, accepted, assigned, en route, arrived, resolved, cancelled)
    with live updates pushed to customers and admin queue.
    """
    roadside = (
        db.query(RoadsideRequest)
        .options(
            joinedload(RoadsideRequest.user),
            joinedload(RoadsideRequest.vehicle),
            joinedload(RoadsideRequest.assigned_mechanic),
            joinedload(RoadsideRequest.assignments),
        )
        .filter(RoadsideRequest.id == request_id)
        .first()
    )
    if not roadside:
        raise HTTPException(status_code=404, detail="Roadside request not found")

    # Permission check: customer can cancel their own requested booking; admin can set any lifecycle status
    requested_status = payload.status.strip().lower()
    if requested_status not in [s.lower() for s in ALLOWED_LIFECYCLE_STATUSES]:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid lifecycle status '{payload.status}'. Allowed: requested, accepted, assigned, en route, arrived, resolved, cancelled"
        )

    if current_user.role != UserRole.ADMIN:
        if roadside.user_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not authorized to update this incident")
        if requested_status != "cancelled":
            raise HTTPException(status_code=403, detail="Customers can only cancel active requests")

    now = datetime.now(timezone.utc)
    roadside.status = requested_status
    roadside.updated_at = now

    # Track lifecycle timestamps
    if requested_status in ["accepted"]:
        roadside.accepted_at = now
    elif requested_status in ["assigned"]:
        roadside.assigned_at = now
    elif requested_status in ["en route", "en_route"]:
        roadside.en_route_at = now
    elif requested_status in ["arrived"]:
        roadside.arrived_at = now
    elif requested_status in ["resolved"]:
        roadside.resolved_at = now
        # Mark active assignments completed
        for a in roadside.assignments:
            if a.status == "active":
                a.status = "completed"
                a.completed_at = now
    elif requested_status in ["cancelled"]:
        roadside.cancelled_at = now
        for a in roadside.assignments:
            if a.status == "active":
                a.status = "cancelled"
                a.completed_at = now

    if payload.notes:
        roadside.notes = (roadside.notes + " | " if roadside.notes else "") + payload.notes.strip()

    db.commit()

    record = (
        db.query(RoadsideRequest)
        .options(
            joinedload(RoadsideRequest.user),
            joinedload(RoadsideRequest.vehicle),
            joinedload(RoadsideRequest.assigned_mechanic),
            joinedload(RoadsideRequest.assignments).joinedload(RoadsideAssignment.mechanic),
        )
        .filter(RoadsideRequest.id == roadside.id)
        .first()
    )

    data_dict = _format_roadside_dict(record)

    # Push live updates to customers and admin
    await dispatch_manager.broadcast_to_admins("incident_status_updated", data_dict)
    await dispatch_manager.notify_customer(roadside.id, "incident_status_updated", data_dict)

    return record


# --- WebSocket Endpoints for Live Streaming ---


@router.websocket("/ws/admin")
async def websocket_admin_endpoint(websocket: WebSocket):
    """
    Dedicated admin queue stream for real-time roadside incident alerts and status updates.
    """
    await dispatch_manager.connect_admin(websocket)
    try:
        while True:
            # Keep socket open and receive any ping/keepalive messages
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        await dispatch_manager.disconnect_admin(websocket)
    except Exception:
        await dispatch_manager.disconnect_admin(websocket)


@router.websocket("/ws/customer/{request_id}")
async def websocket_customer_endpoint(websocket: WebSocket, request_id: int):
    """
    Customer real-time stream for live lifecycle updates (en route, arrived, resolved, etc.).
    """
    await dispatch_manager.connect_customer(request_id, websocket)
    try:
        while True:
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        await dispatch_manager.disconnect_customer(request_id, websocket)
    except Exception:
        await dispatch_manager.disconnect_customer(request_id, websocket)
