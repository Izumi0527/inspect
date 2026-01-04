"""add device probe status fields

Revision ID: 020
Revises: 019
Create Date: 2026-01-04

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '020'
down_revision: Union[str, None] = '019'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """添加设备探测状态字段"""
    # 添加 icmp_status 字段
    op.add_column('devices', sa.Column('icmp_status', sa.String(20), nullable=True))
    
    # 添加 snmp_status 字段
    op.add_column('devices', sa.Column('snmp_status', sa.String(20), nullable=True))
    
    # 添加 last_probe_time 字段
    op.add_column('devices', sa.Column('last_probe_time', sa.DateTime(), nullable=True))
    
    # 创建索引以优化查询
    op.create_index('idx_device_icmp_status', 'devices', ['icmp_status'])
    op.create_index('idx_device_snmp_status', 'devices', ['snmp_status'])
    op.create_index('idx_device_last_probe_time', 'devices', ['last_probe_time'])


def downgrade() -> None:
    """移除设备探测状态字段"""
    # 删除索引
    op.drop_index('idx_device_last_probe_time', table_name='devices')
    op.drop_index('idx_device_snmp_status', table_name='devices')
    op.drop_index('idx_device_icmp_status', table_name='devices')
    
    # 删除字段
    op.drop_column('devices', 'last_probe_time')
    op.drop_column('devices', 'snmp_status')
    op.drop_column('devices', 'icmp_status')
