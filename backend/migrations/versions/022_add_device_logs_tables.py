"""Add device logs tables

Revision ID: 022
Revises: 021
Create Date: 2026-01-05 23:45:00.000000

"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '022'
down_revision = '021'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create device_logs table
    op.create_table(
        'device_logs',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('device_id', sa.Integer(), nullable=False),
        sa.Column('level', sa.String(length=20), nullable=False, default='info'),
        sa.Column('facility', sa.String(length=50), nullable=False, default='system'),
        sa.Column('source', sa.String(length=20), nullable=False, default='syslog'),
        sa.Column('message', sa.Text(), nullable=False),
        sa.Column('raw_message', sa.Text(), nullable=True),
        sa.Column('source_ip', sa.String(length=45), nullable=True),
        sa.Column('source_process', sa.String(length=100), nullable=True),
        sa.Column('log_timestamp', sa.DateTime(), nullable=False),
        sa.Column('collected_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.ForeignKeyConstraint(['device_id'], ['devices.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    
    # Create indexes for device_logs
    op.create_index('idx_device_logs_device_id', 'device_logs', ['device_id'])
    op.create_index('idx_device_logs_level', 'device_logs', ['level'])
    op.create_index('idx_device_logs_facility', 'device_logs', ['facility'])
    op.create_index('idx_device_logs_timestamp', 'device_logs', ['log_timestamp'])
    op.create_index('idx_device_logs_collected_at', 'device_logs', ['collected_at'])
    op.create_index('idx_device_logs_device_level_time', 'device_logs', ['device_id', 'level', 'log_timestamp'])
    
    # Create log_parsing_rules table
    op.create_table(
        'log_parsing_rules',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('vendor', sa.String(length=50), nullable=False),
        sa.Column('device_type', sa.String(length=50), nullable=True),
        sa.Column('pattern', sa.Text(), nullable=False),
        sa.Column('level_mapping', sa.Text(), nullable=True),
        sa.Column('facility_mapping', sa.Text(), nullable=True),
        sa.Column('is_active', sa.Boolean(), nullable=False, default=True),
        sa.Column('priority', sa.Integer(), nullable=False, default=100),
        sa.Column('created_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('name')
    )
    
    # Create indexes for log_parsing_rules
    op.create_index('idx_log_parsing_rules_vendor', 'log_parsing_rules', ['vendor'])
    op.create_index('idx_log_parsing_rules_active', 'log_parsing_rules', ['is_active'])
    op.create_index('idx_log_parsing_rules_priority', 'log_parsing_rules', ['priority'])


def downgrade() -> None:
    # Drop indexes for log_parsing_rules
    op.drop_index('idx_log_parsing_rules_priority', 'log_parsing_rules')
    op.drop_index('idx_log_parsing_rules_active', 'log_parsing_rules')
    op.drop_index('idx_log_parsing_rules_vendor', 'log_parsing_rules')
    
    # Drop log_parsing_rules table
    op.drop_table('log_parsing_rules')
    
    # Drop indexes for device_logs
    op.drop_index('idx_device_logs_device_level_time', 'device_logs')
    op.drop_index('idx_device_logs_collected_at', 'device_logs')
    op.drop_index('idx_device_logs_timestamp', 'device_logs')
    op.drop_index('idx_device_logs_facility', 'device_logs')
    op.drop_index('idx_device_logs_level', 'device_logs')
    op.drop_index('idx_device_logs_device_id', 'device_logs')
    
    # Drop device_logs table
    op.drop_table('device_logs')