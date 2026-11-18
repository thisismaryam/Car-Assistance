"""add mechanics and booking assignment

Revision ID: a3c49e710b12
Revises: 91b24d770f21
Create Date: 2026-11-17 16:30:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = 'a3c49e710b12'
down_revision: Union[str, Sequence[str], None] = '91b24d770f21'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add mechanic_id to bookings if not present
    op.add_column('bookings', sa.Column('mechanic_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_bookings_mechanic_id_users',
        'bookings', 'users',
        ['mechanic_id'], ['id'],
        ondelete='SET NULL'
    )
    op.create_index(op.f('ix_bookings_mechanic_id'), 'bookings', ['mechanic_id'], unique=False)

    # 2. Create mechanic_schedules table
    op.create_table(
        'mechanic_schedules',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('mechanic_id', sa.Integer(), nullable=False),
        sa.Column('day_of_week', sa.Integer(), nullable=False),
        sa.Column('start_time', sa.String(length=5), server_default='09:00', nullable=False),
        sa.Column('end_time', sa.String(length=5), server_default='18:00', nullable=False),
        sa.Column('is_active', sa.Boolean(), server_default='true', nullable=False),
        sa.ForeignKeyConstraint(['mechanic_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_mechanic_schedules_mechanic_id'), 'mechanic_schedules', ['mechanic_id'], unique=False)
    op.create_index(op.f('ix_mechanic_schedules_day_of_week'), 'mechanic_schedules', ['day_of_week'], unique=False)

    # 3. Create mechanic_time_offs table
    op.create_table(
        'mechanic_time_offs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('mechanic_id', sa.Integer(), nullable=False),
        sa.Column('start_time', sa.DateTime(timezone=True), nullable=False),
        sa.Column('end_time', sa.DateTime(timezone=True), nullable=False),
        sa.Column('reason', sa.String(length=200), server_default='Break / Unavailable', nullable=False),
        sa.ForeignKeyConstraint(['mechanic_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_mechanic_time_offs_mechanic_id'), 'mechanic_time_offs', ['mechanic_id'], unique=False)
    op.create_index(op.f('ix_mechanic_time_offs_start_time'), 'mechanic_time_offs', ['start_time'], unique=False)
    op.create_index(op.f('ix_mechanic_time_offs_end_time'), 'mechanic_time_offs', ['end_time'], unique=False)


def downgrade() -> None:
    op.drop_table('mechanic_time_offs')
    op.drop_table('mechanic_schedules')
    op.drop_index(op.f('ix_bookings_mechanic_id'), table_name='bookings')
    op.drop_constraint('fk_bookings_mechanic_id_users', 'bookings', type_='foreignkey')
    op.drop_column('bookings', 'mechanic_id')

