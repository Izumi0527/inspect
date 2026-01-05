"""Add alert_count to devices table

Revision ID: 021
Revises: 020
Create Date: 2026-01-05 23:30:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '021'
down_revision = '020'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add alert_count column to devices table
    op.add_column('devices', sa.Column('alert_count', sa.Integer(), nullable=True, default=0))


def downgrade() -> None:
    # Remove alert_count column from devices table
    op.drop_column('devices', 'alert_count')