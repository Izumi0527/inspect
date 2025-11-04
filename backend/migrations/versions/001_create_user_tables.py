"""Create users and roles tables

Revision ID: 001_create_user_tables
Revises: 
Create Date: 2025-01-25 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = '001_create_user_tables'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create users and roles related tables"""
    
    # 创建权限表
    op.create_table('permissions',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('name', sa.String(100), nullable=False, unique=True, comment='权限名称'),
        sa.Column('display_name', sa.String(200), nullable=False, comment='显示名称'),
        sa.Column('description', sa.Text, comment='权限描述'),
        sa.Column('module', sa.String(50), nullable=False, comment='所属模块'),
        sa.Column('action', sa.String(20), nullable=False, comment='操作类型'),
        sa.Column('resource', sa.String(100), nullable=False, comment='资源对象'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        comment='系统权限表'
    )
    
    # 创建角色表
    op.create_table('roles',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('name', sa.String(50), nullable=False, unique=True, comment='角色名称'),
        sa.Column('display_name', sa.String(100), nullable=False, comment='显示名称'),
        sa.Column('description', sa.Text, comment='角色描述'),
        sa.Column('is_built_in', sa.Boolean, default=False, comment='是否内置角色'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        comment='用户角色表'
    )
    
    # 创建角色权限关联表
    op.create_table('role_permissions',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('role_id', sa.String(36), sa.ForeignKey('roles.id', ondelete='CASCADE'), nullable=False),
        sa.Column('permission_id', sa.String(36), sa.ForeignKey('permissions.id', ondelete='CASCADE'), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.UniqueConstraint('role_id', 'permission_id', name='uk_role_permission'),
        comment='角色权限关联表'
    )
    
    # 创建用户表
    op.create_table('users',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('username', sa.String(50), nullable=False, unique=True, comment='用户名'),
        sa.Column('email', sa.String(100), nullable=False, unique=True, comment='邮箱地址'),
        sa.Column('full_name', sa.String(100), comment='真实姓名'),
        sa.Column('hashed_password', sa.String(255), nullable=False, comment='加密后的密码'),
        sa.Column('avatar', sa.String(500), comment='头像URL'),
        sa.Column('role', sa.String(20), nullable=False, default='viewer', comment='用户角色'),
        sa.Column('is_active', sa.Boolean, default=True, comment='是否激活'),
        sa.Column('is_superuser', sa.Boolean, default=False, comment='是否超级用户'),
        sa.Column('last_login_at', sa.DateTime(timezone=True), comment='最后登录时间'),
        sa.Column('last_login_ip', sa.String(45), comment='最后登录IP'),
        sa.Column('password_changed_at', sa.DateTime(timezone=True), comment='密码修改时间'),
        sa.Column('force_password_change', sa.Boolean, default=False, comment='强制修改密码'),
        sa.Column('login_attempts', sa.Integer, default=0, comment='登录尝试次数'),
        sa.Column('locked_until', sa.DateTime(timezone=True), comment='锁定到期时间'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('created_by', sa.String(36), comment='创建者ID'),
        sa.CheckConstraint("role IN ('admin', 'operator', 'viewer')", name='ck_users_role'),
        comment='用户账户表'
    )
    
    # 创建用户会话表
    op.create_table('user_sessions',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('session_token', sa.String(255), nullable=False, unique=True, comment='会话令牌'),
        sa.Column('refresh_token', sa.String(255), unique=True, comment='刷新令牌'),
        sa.Column('ip_address', sa.String(45), comment='登录IP'),
        sa.Column('user_agent', sa.Text, comment='用户代理'),
        sa.Column('is_active', sa.Boolean, default=True, comment='是否激活'),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False, comment='过期时间'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('last_accessed_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        comment='用户会话表'
    )
    
    # 创建审计日志表
    op.create_table('audit_logs',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='SET NULL')),
        sa.Column('username', sa.String(50), comment='操作用户名'),
        sa.Column('action', sa.String(100), nullable=False, comment='操作类型'),
        sa.Column('resource', sa.String(100), comment='操作资源'),
        sa.Column('resource_id', sa.String(36), comment='资源ID'),
        sa.Column('method', sa.String(10), comment='HTTP方法'),
        sa.Column('path', sa.String(500), comment='请求路径'),
        sa.Column('ip_address', sa.String(45), comment='客户端IP'),
        sa.Column('user_agent', sa.Text, comment='用户代理'),
        sa.Column('status', sa.String(20), nullable=False, comment='操作状态'),
        sa.Column('details', sa.JSON, comment='详细信息'),
        sa.Column('duration', sa.Integer, comment='执行时间(毫秒)'),
        sa.Column('timestamp', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        comment='操作审计日志表'
    )
    
    # 创建索引
    # 用户表索引
    op.create_index('idx_users_email', 'users', ['email'])
    op.create_index('idx_users_username', 'users', ['username'])
    op.create_index('idx_users_role', 'users', ['role'])
    op.create_index('idx_users_is_active', 'users', ['is_active'])
    op.create_index('idx_users_created_at', 'users', ['created_at'])
    op.create_index('idx_users_last_login_at', 'users', ['last_login_at'])
    
    # 会话表索引
    op.create_index('idx_user_sessions_user_id', 'user_sessions', ['user_id'])
    op.create_index('idx_user_sessions_token', 'user_sessions', ['session_token'])
    op.create_index('idx_user_sessions_expires_at', 'user_sessions', ['expires_at'])
    op.create_index('idx_user_sessions_is_active', 'user_sessions', ['is_active'])
    
    # 审计日志表索引
    op.create_index('idx_audit_logs_user_id', 'audit_logs', ['user_id'])
    op.create_index('idx_audit_logs_action', 'audit_logs', ['action'])
    op.create_index('idx_audit_logs_timestamp', 'audit_logs', ['timestamp'])
    op.create_index('idx_audit_logs_resource', 'audit_logs', ['resource', 'resource_id'])
    
    # 权限表索引
    op.create_index('idx_permissions_module', 'permissions', ['module'])
    op.create_index('idx_permissions_action', 'permissions', ['action'])
    
    # 角色权限关联表索引
    op.create_index('idx_role_permissions_role_id', 'role_permissions', ['role_id'])
    op.create_index('idx_role_permissions_permission_id', 'role_permissions', ['permission_id'])


def downgrade() -> None:
    """Drop all user related tables"""
    
    # 删除索引
    op.drop_index('idx_role_permissions_permission_id')
    op.drop_index('idx_role_permissions_role_id')
    op.drop_index('idx_permissions_action')
    op.drop_index('idx_permissions_module')
    op.drop_index('idx_audit_logs_resource')
    op.drop_index('idx_audit_logs_timestamp')
    op.drop_index('idx_audit_logs_action')
    op.drop_index('idx_audit_logs_user_id')
    op.drop_index('idx_user_sessions_is_active')
    op.drop_index('idx_user_sessions_expires_at')
    op.drop_index('idx_user_sessions_token')
    op.drop_index('idx_user_sessions_user_id')
    op.drop_index('idx_users_last_login_at')
    op.drop_index('idx_users_created_at')
    op.drop_index('idx_users_is_active')
    op.drop_index('idx_users_role')
    op.drop_index('idx_users_username')
    op.drop_index('idx_users_email')
    
    # 删除表
    op.drop_table('audit_logs')
    op.drop_table('user_sessions')
    op.drop_table('users')
    op.drop_table('role_permissions')
    op.drop_table('roles')
    op.drop_table('permissions')