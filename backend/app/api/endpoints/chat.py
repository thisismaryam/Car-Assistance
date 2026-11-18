from typing import Any
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.database import get_db
from app.models.user import User
from app.core.security import get_optional_current_user
from app.services.ai.orchestrator import assistant_orchestrator

router = APIRouter()


class ChatMessage(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatMessage] = []


class ChatResponse(BaseModel):
    reply: str
    branch: str | None = None
    booking_id: int | None = None
    booking_link: str | None = None


@router.post("/", response_model=ChatResponse)
@router.post("", response_model=ChatResponse)
def chat_endpoint(
    payload: ChatRequest,
    db: Session = Depends(get_db),
    current_user: User | None = Depends(get_optional_current_user)
):
    """
    FEATURE 5: AI Assistant with Real Backend Tools.
    Routes queries into three strict operational branches:
    1. Grounded RAG retrieval over approved documentation for knowledge queries.
    2. Direct backend tool execution for live business pricing and availability.
    3. Secure conversational booking flows validating authentication, ownership,
       capacity, and explicit confirmation before executing bookings through core service layer.
    """
    history_dicts = [{"role": msg.role, "content": msg.content} for msg in payload.history]
    result = assistant_orchestrator.process_message(
        db=db,
        message=payload.message,
        history=history_dicts,
        current_user=current_user
    )

    return ChatResponse(
        reply=result["reply"],
        branch=result.get("branch"),
        booking_id=result.get("booking_id"),
        booking_link=result.get("booking_link"),
    )
