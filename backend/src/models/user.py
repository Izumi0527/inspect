"""
用户和权限相关数据模型
"""
from datetime import datetime
from typing import Optional, List
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Text, 
    ForeignKey, Table, Index
)
from sqlalchemy.orm import relationship, Mapped, mapped_column
from sqlalchemy.sql import func

from src.core.database import Base

# 用户角色关联表
user_roles = Table(
    'user_roles',
    Base.metadata,
    Column('user_id', String(36), ForeignKey('users.id', ondelete='CASCADE'), primary_key=True),
    Column('role_id', String(36), ForeignKey('roles.id', ondelete='CASCADE'), primary_key=True)
)

# 角色权限关联表
role_permissions = Table(
    'role_permissions',
    Base.metadata,
    Column('role_id', String(36), ForeignKey('roles.id', ondelete='CASCADE'), primary_key=True),
    Column('permission_id', String(36), ForeignKey('permissions.id', ondelete='CASCADE'), primary_key=True)
)

class User(Base):
    """用户模型"""
    __tablename__ = 'users'

    # 基础字段
    id: Mapped[str] = mapped_column(String(36), primary_key=True, index=True)
    username: Mapped[str] = mapped_column(String(50), unique=True, index=True, nullable=False)
    email: Mapped[str] = mapped_column(String(100), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)

    # 个人信息
    full_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    avatar: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False)

    # 状态字段
    is_active: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    is_superuser: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)

    # 时间字段
    created_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    updated_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    last_login_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)

    # 安全字段
    last_login_ip: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    password_changed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    force_password_change: Mapped[Optional[bool]] = mapped_column(Boolean, nullable=True)
    login_attempts: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    locked_until: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), nullable=True)
    
    # 关系
    roles = relationship("Role", secondary=user_roles, back_populates="users")
    created_devices = relationship("Device", back_populates="created_by_user")
    inspection_logs = relationship("InspectionLog", back_populates="operator")
    login_sessions = relationship("UserSession", back_populates="user")
    
    def __repr__(self):
        return f"<User(id='{self.id}', username='{self.username}', email='{self.email}')>"

class Role(Base):
    """角色模型"""
    __tablename__ = 'roles'
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # 状态字段
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)  # 系统角色不能删除
    
    # 时间字段
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)
    
    # 关系
    users = relationship("User", secondary=user_roles, back_populates="roles")
    permissions = relationship("Permission", secondary=role_permissions, back_populates="roles")
    
    def __repr__(self):
        return f"<Role(id='{self.id}', name='{self.name}')>"

class Permission(Base):
    """权限模型"""
    __tablename__ = 'permissions'
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)  # 权限标识符
    display_name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    category: Mapped[str] = mapped_column(String(50), nullable=False)  # 权限分类
    
    # 时间字段
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), nullable=False)
    
    # 关系
    roles = relationship("Role", secondary=role_permissions, back_populates="permissions")
    
    def __repr__(self):
        return f"<Permission(id='{self.id}', name='{self.name}')>"

class UserSession(Base):
    """用户会话模型"""
    __tablename__ = 'user_sessions'
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True, index=True)
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey('users.id', ondelete='CASCADE'), nullable=False)
    session_id: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    
    # 会话信息
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)  # 支持IPv6
    user_agent: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # 时间字段
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    last_activity: Mapped[datetime] = mapped_column(DateTime, default=func.now(), nullable=False)
    
    # 状态字段
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    
    # 关系
    user = relationship("User", back_populates="login_sessions")
    
    # 索引
    __table_args__ = (
        Index('idx_session_user_id', user_id),
        Index('idx_session_expires_at', expires_at),
    )
    
    def __repr__(self):
        return f"<UserSession(id='{self.id}', user_id='{self.user_id}', session_id='{self.session_id[:8]}...')>"

class AuditLog(Base):
    """审计日志模型"""
    __tablename__ = 'audit_logs'
    
    id: Mapped[str] = mapped_column(String(36), primary_key=True, index=True)
    user_id: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey('users.id', ondelete='SET NULL'), nullable=True)
    
    # 操作信息
    action: Mapped[str] = mapped_column(String(100), nullable=False)  # 操作类型
    resource_type: Mapped[str] = mapped_column(String(50), nullable=False)  # 资源类型
    resource_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)  # 资源ID
    
    # 详细信息
    description: Mapped[str] = mapped_column(Text, nullable=False)  # 操作描述
    details: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # 详细信息(JSON)
    
    # 请求信息
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    user_agent: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # 结果信息
    status: Mapped[str] = mapped_column(String(20), nullable=False)  # success, failed, error
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # 时间字段
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), nullable=False)
    
    # 索引
    __table_args__ = (
        Index('idx_audit_user_id', user_id),
        Index('idx_audit_action', action),
        Index('idx_audit_resource', resource_type, resource_id),
        Index('idx_audit_created_at', created_at),
    )
    
    def __repr__(self):
        return f"<AuditLog(id='{self.id}', user_id='{self.user_id}', action='{self.action}')>"