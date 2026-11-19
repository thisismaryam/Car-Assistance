"""Allow guest roadside requests (nullable user_id + guest contact columns).

Revision ID: d6f9b2e3a1c8
Revises: c5e8a1d2f4b7
Create Date: 2026-11-19

Written defensively: each step checks the live schema first, so it is safe to
run even if part of it was applied by hand.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'd6f9b2e3a1c8'
down_revision: Union[str, Sequence[str], None] = 'c5e8a1d2f4b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLE = "roadside_requests"


def _columns() -> set[str]:
    insp = sa.inspect(op.get_bind())
    return {c["name"] for c in insp.get_columns(TABLE)}


def upgrade() -> None:
    cols = _columns()

    # Guests have no account, so user_id must be optional.
    op.alter_column(TABLE, "user_id", existing_type=sa.Integer(), nullable=True)

    for name, length in (
        ("guest_name", 150),
        ("guest_phone", 30),
        ("guest_email", 255),
        ("guest_vehicle", 200),
    ):
        if name not in cols:
            op.add_column(TABLE, sa.Column(name, sa.String(length=length), nullable=True))

    if "tracking_token" not in cols:
        op.add_column(TABLE, sa.Column("tracking_token", sa.String(length=64), nullable=True))
        op.create_index(
            op.f("ix_roadside_requests_tracking_token"),
            TABLE,
            ["tracking_token"],
            unique=True,
        )


def downgrade() -> None:
    cols = _columns()
    if "tracking_token" in cols:
        op.drop_index(op.f("ix_roadside_requests_tracking_token"), table_name=TABLE)
        op.drop_column(TABLE, "tracking_token")
    for name in ("guest_vehicle", "guest_email", "guest_phone", "guest_name"):
        if name in cols:
            op.drop_column(TABLE, name)
    # Guest rows have no owner; remove them before restoring NOT NULL.
    op.execute(f"DELETE FROM {TABLE} WHERE user_id IS NULL")
    op.alter_column(TABLE, "user_id", existing_type=sa.Integer(), nullable=False)
