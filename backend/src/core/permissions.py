from functools import wraps
from typing import List, Optional
from fastapi import HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from src.services.auth import AuthService
from src.schemas.user import UserRole

# HTTP Bearer 安全方案
security = HTTPBearer()

def get_user_by_username(username: str) -> Optional[dict]:
    """根据用户名获取用户信息（临时实现）"""
    # 临时用户数据（后续将替换为数据库查询）
    temp_users = {
        "admin": {
            "id": "550e8400-e29b-41d4-a716-446655440001",
            "username": "admin",
            "email": "admin@example.com",
            "full_name": "系统管理员",
            "role": "admin",
            "is_active": True
        },
        "operator": {
            "id": "550e8400-e29b-41d4-a716-446655440002",
            "username": "operator",
            "email": "operator@example.com",
            "full_name": "运维人员",
            "role": "operator",
            "is_active": True
        },
        "viewer": {
            "id": "550e8400-e29b-41d4-a716-446655440003",
            "username": "viewer",
            "email": "viewer@example.com",
            "full_name": "查看者",
            "role": "viewer",
            "is_active": True
        }
    }
    
    return temp_users.get(username)

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> dict:
    """获取当前用户信息"""
    token = credentials.credentials
    
    # 验证令牌
    payload = AuthService.verify_token(token, "access")
    
    # 从载荷中提取用户信息
    username = payload.get("sub")
    if username is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # 这里应该从数据库获取用户信息
    # 临时实现：模拟用户数据
    user_data = get_user_by_username(username)
    if user_data is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    return user_data

def get_current_active_user(current_user: dict = Depends(get_current_user)) -> dict:
    """获取当前活跃用户"""
    if not current_user.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Inactive user"
        )
    
    return current_user

class PermissionChecker:
    """权限检查器"""
    
    def __init__(self, required_roles: List[UserRole]):
        self.required_roles = required_roles
    
    def __call__(self, current_user: dict = Depends(get_current_user)) -> dict:
        """检查用户权限"""
        user_role = current_user.get("role")
        
        if user_role not in [role.value for role in self.required_roles]:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions"
            )
        
        return current_user

# 权限装饰器
def require_roles(*roles: UserRole):
    """要求特定角色权限的装饰器"""
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            # 从依赖注入中获取当前用户
            current_user = kwargs.get('current_user')
            if not current_user:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Authentication required"
                )
            
            user_role = current_user.get("role")
            if user_role not in [role.value for role in roles]:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail="Insufficient permissions"
                )
            
            return await func(*args, **kwargs)
        return wrapper
    return decorator

# 预定义的权限检查器
require_admin = PermissionChecker([UserRole.ADMIN])
require_operator = PermissionChecker([UserRole.ADMIN, UserRole.OPERATOR])
require_viewer = PermissionChecker([UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER])

# 功能权限映射
PERMISSIONS = {
    # 设备管理权限
    "devices:read": [UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER],
    "devices:create": [UserRole.ADMIN, UserRole.OPERATOR],
    "devices:update": [UserRole.ADMIN, UserRole.OPERATOR],
    "devices:delete": [UserRole.ADMIN],
    
    # 巡检管理权限
    "inspections:read": [UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER],
    "inspections:create": [UserRole.ADMIN, UserRole.OPERATOR],
    "inspections:update": [UserRole.ADMIN, UserRole.OPERATOR],
    "inspections:delete": [UserRole.ADMIN],
    
    # 告警管理权限
    "alerts:read": [UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER],
    "alerts:acknowledge": [UserRole.ADMIN, UserRole.OPERATOR],
    "alerts:resolve": [UserRole.ADMIN, UserRole.OPERATOR],
    "alerts:delete": [UserRole.ADMIN],
    
    # 报表权限
    "reports:read": [UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER],
    "reports:create": [UserRole.ADMIN, UserRole.OPERATOR],
    "reports:delete": [UserRole.ADMIN],

    # 监控管理权限
    "monitoring:read": [UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER],
    "monitoring:write": [UserRole.ADMIN, UserRole.OPERATOR],

    # 仪表板权限
    "dashboard:read": [UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER],
    "dashboard:stats": [UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER],

    # 系统管理权限
    "users:read": [UserRole.ADMIN],
    "users:create": [UserRole.ADMIN],
    "users:update": [UserRole.ADMIN],
    "users:delete": [UserRole.ADMIN],
    "system:config": [UserRole.ADMIN],
    "system:read": [UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER],
    "system:health": [UserRole.ADMIN, UserRole.OPERATOR, UserRole.VIEWER],
}

def check_permission(permission: str, user_role: str) -> bool:
    """检查用户是否具有指定权限"""
    allowed_roles = PERMISSIONS.get(permission, [])
    return UserRole(user_role) in allowed_roles

def require_permission(permission: str):
    """要求特定权限的依赖"""
    def permission_checker(current_user: dict = Depends(get_current_active_user)) -> dict:
        user_role = current_user.get("role")
        
        if not check_permission(permission, user_role):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission denied: {permission}"
            )
        
        return current_user
    
    return permission_checker