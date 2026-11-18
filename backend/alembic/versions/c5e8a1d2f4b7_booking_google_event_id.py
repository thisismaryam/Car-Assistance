"""Persist Google Calendar event IDs on bookings.

Revision ID: c5e8a1d2f4b7
Revises: b4dfb1c8ebe8
Create Date: 2026-11-18

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'c5e8a1d2f4b7'
down_revision: Union[str, Sequence[str], None] = 'b4dfb1c8ebe8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "bookings",
        sa.Column("google_event_id", sa.String(length=255), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("bookings", "google_event_id")