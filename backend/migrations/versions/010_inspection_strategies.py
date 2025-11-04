"""Create inspection strategies table

Revision ID: 010_inspection_strategies
Revises: 009_insert_test_devices
Create Date: 2025-11-02 01:50:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = '010_inspection_strategies'
down_revision = '009_insert_test_devices'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create inspection_strategies table"""

    # 创建巡检策略表
    op.create_table('inspection_strategies',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('name', sa.String(100), nullable=False, comment='策略名称'),
        sa.Column('description', sa.Text, comment='策略描述'),

        # 策略类型: scheduled(定时) 或 manual(手动)
        sa.Column('type', sa.String(20), nullable=False, default='manual', comment='策略类型'),

        # Cron表达式(仅用于定时策略)
        sa.Column('cron', sa.String(100), comment='Cron表达式'),

        # 关联的设备ID列表(JSON数组)
        sa.Column('devices', sa.JSON, nullable=False, comment='关联设备ID列表'),

        # 关联的模板ID列表(JSON数组)
        sa.Column('templates', sa.JSON, nullable=False, comment='关联模板ID列表'),

        # 策略状态
        sa.Column('enabled', sa.Boolean, default=True, nullable=False, comment='是否启用'),

        # 执行时间记录
        sa.Column('last_run_time', sa.DateTime(timezone=True), comment='最后执行时间'),
        sa.Column('next_run_time', sa.DateTime(timezone=True), comment='下次执行时间'),

        # 时间戳
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP'), nullable=False),

        # 添加类型CHECK约束
        sa.CheckConstraint("type IN ('scheduled', 'manual')", name='ck_inspection_strategies_type'),
        comment='巡检策略表'
    )

    # 创建索引
    op.create_index('idx_inspection_strategies_name', 'inspection_strategies', ['name'])
    op.create_index('idx_inspection_strategies_type', 'inspection_strategies', ['type'])
    op.create_index('idx_inspection_strategies_enabled', 'inspection_strategies', ['enabled'])
    op.create_index('idx_inspection_strategies_next_run_time', 'inspection_strategies', ['next_run_time'])
    op.create_index('idx_inspection_strategies_created_at', 'inspection_strategies', ['created_at'])


def downgrade() -> None:
    """Drop inspection_strategies table"""

    # 删除索引
    op.drop_index('idx_inspection_strategies_created_at')
    op.drop_index('idx_inspection_strategies_next_run_time')
    op.drop_index('idx_inspection_strategies_enabled')
    op.drop_index('idx_inspection_strategies_type')
    op.drop_index('idx_inspection_strategies_name')

    # 删除表
    op.drop_table('inspection_strategies')
