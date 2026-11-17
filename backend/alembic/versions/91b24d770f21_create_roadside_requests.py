"""create roadside_requests table

Revision ID: 91b24d770f21
Revises: 70c147d67f67
Create Date: 2026-11-17 12:45:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = '91b24d770f21'
down_revision: Union[str, Sequence[str], None] = '70c147d67f67'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'roadside_requests',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('vehicle_id', sa.Integer(), nullable=True),
        sa.Column('location', sa.Text(), nullable=False),
        sa.Column('issue_type', sa.String(length=100), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False, server_default='pending'),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['vehicle_id'], ['vehicles.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_roadside_requests_user_id'), 'roadside_requests', ['user_id'], unique=False)
    op.create_index(op.f('ix_roadside_requests_vehicle_id'), 'roadside_requests', ['vehicle_id'], unique=False)
    op.create_index(op.f('ix_roadside_requests_status'), 'roadside_requests', ['status'], unique=False)


def downgrade() -> None:
    op.drop_index(op.f('ix_roadside_requests_status'), table_name='roadside_requests')
    op.drop_index(op.f('ix_roadside_requests_vehicle_id'), table_name='roadside_requests')
    op.drop_index(op.f('ix_roadside_requests_user_id'), table_name='roadside_requests')
    op.drop_table('roadside_requests')

