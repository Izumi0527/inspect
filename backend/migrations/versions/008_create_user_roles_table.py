"""Create user_roles association table

Revision ID: 008_create_user_roles_table
Revises: 007_create_system_tables
Create Date: 2025-09-11 23:30:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = '008_create_user_roles_table'
down_revision = '007_create_system_tables'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create user_roles association table"""
    
    # 创建用户角色关联表
    op.create_table('user_roles',
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('role_id', sa.String(36), sa.ForeignKey('roles.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.UniqueConstraint('user_id', 'role_id', name='uk_user_role'),
        comment='用户角色关联表'
    )
    
    # 创建索引
    op.create_index('idx_user_roles_user_id', 'user_roles', ['user_id'])
    op.create_index('idx_user_roles_role_id', 'user_roles', ['role_id'])


def downgrade() -> None:
    """Drop user_roles association table"""
    
    # 删除索引
    op.drop_index('idx_user_roles_role_id')
    op.drop_index('idx_user_roles_user_id')
    
    # 删除表
    op.drop_table('user_roles')