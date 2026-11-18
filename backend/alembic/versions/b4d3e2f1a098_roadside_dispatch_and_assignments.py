"""roadside dispatch and assignments

Revision ID: b4d3e2f1a098
Revises: a3c49e710b12
Create Date: 2026-11-17 22:15:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'b4d3e2f1a098'
down_revision: Union[str, Sequence[str], None] = 'a3c49e710b12'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add assignment and lifecycle columns to roadside_requests
    op.add_column('roadside_requests', sa.Column('assigned_mechanic_id', sa.Integer(), nullable=True))
    op.add_column('roadside_requests', sa.Column('accepted_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('roadside_requests', sa.Column('assigned_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('roadside_requests', sa.Column('en_route_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('roadside_requests', sa.Column('arrived_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('roadside_requests', sa.Column('resolved_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('roadside_requests', sa.Column('cancelled_at', sa.DateTime(timezone=True), nullable=True))

    op.create_foreign_key(
        'fk_roadside_requests_assigned_mechanic_id_users',
        'roadside_requests', 'users',
        ['assigned_mechanic_id'], ['id'],
        ondelete='SET NULL'
    )
    op.create_index(
        op.f('ix_roadside_requests_assigned_mechanic_id'),
        'roadside_requests',
        ['assigned_mechanic_id'],
        unique=False
    )

    # 2. Create roadside_assignments table to back mechanic/provider assignments
    op.create_table(
        'roadside_assignments',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('request_id', sa.Integer(), nullable=False),
        sa.Column('mechanic_id', sa.Integer(), nullable=False),
        sa.Column('assigned_by_id', sa.Integer(), nullable=True),
        sa.Column('status', sa.String(length=50), server_default='assigned', nullable=False),
        sa.Column('notes', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['request_id'], ['roadside_requests.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['mechanic_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['assigned_by_id'], ['users.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_roadside_assignments_request_id'), 'roadside_assignments', ['request_id'], unique=False)
    op.create_index(op.f('ix_roadside_assignments_mechanic_id'), 'roadside_assignments', ['mechanic_id'], unique=False)


def downgrade() -> None:
    op.drop_table('roadside_assignments')
    op.drop_index(op.f('ix_roadside_requests_assigned_mechanic_id'), table_name='roadside_requests')
    op.drop_constraint('fk_roadside_requests_assigned_mechanic_id_users', 'roadside_requests', type_='foreignkey')
    op.drop_column('roadside_requests', 'cancelled_at')
    op.drop_column('roadside_requests', 'resolved_at')
    op.drop_column('roadside_requests', 'arrived_at')
    op.drop_column('roadside_requests', 'en_route_at')
    op.drop_column('roadside_requests', 'assigned_at')
    op.drop_column('roadside_requests', 'accepted_at')
    op.drop_column('roadside_requests', 'assigned_mechanic_id')
