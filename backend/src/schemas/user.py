from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, EmailStr, Field, field_validator, ValidationInfo
from enum import Enum


class UserRole(str, Enum):
    """用户角色枚举"""
    ADMIN = "admin"
    OPERATOR = "operator"
    VIEWER = "viewer"


class UserStatus(str, Enum):
    """用户状态枚举"""
    ACTIVE = "active"
    INACTIVE = "inactive"
    LOCKED = "locked"
    PENDING = "pending"


class UserBase(BaseModel):
    """用户基础模型"""
    username: str = Field(..., min_length=3, max_length=50, description="用户名")
    email: EmailStr = Field(..., description="邮箱地址")
    full_name: Optional[str] = Field(None, max_length=100, description="全名")
    role: UserRole = Field(UserRole.VIEWER, description="用户角色")
    status: UserStatus = Field(UserStatus.ACTIVE, description="用户状态")
    
    @field_validator('username')
    @classmethod
    def validate_username(cls, v):
        if not v.replace('_', '').replace('-', '').isalnum():
            raise ValueError('用户名只能包含字母、数字、下划线和连字符')
        return v.lower()


class UserCreate(UserBase):
    """创建用户请求模型"""
    password: str = Field(..., min_length=8, max_length=128, description="密码")
    confirm_password: str = Field(..., description="确认密码")
    
    @field_validator('confirm_password')
    @classmethod
    def passwords_match(cls, v, info: ValidationInfo):
        if 'password' in info.data and v != info.data['password']:
            raise ValueError('两次输入的密码不一致')
        return v
    
    @field_validator('password')
    @classmethod
    def validate_password(cls, v):
        """密码复杂度验证"""
        if len(v) < 8:
            raise ValueError('密码长度至少8位')
        if not any(c.isupper() for c in v):
            raise ValueError('密码必须包含大写字母')
        if not any(c.islower() for c in v):
            raise ValueError('密码必须包含小写字母')
        if not any(c.isdigit() for c in v):
            raise ValueError('密码必须包含数字')
        if not any(c in '!@#$%^&*()_+-=[]{}|;:,.<>?' for c in v):
            raise ValueError('密码必须包含特殊字符')
        return v


class UserUpdate(BaseModel):
    """更新用户请求模型"""
    username: Optional[str] = Field(None, min_length=3, max_length=50)
    email: Optional[EmailStr] = None
    full_name: Optional[str] = Field(None, max_length=100)
    role: Optional[UserRole] = None
    status: Optional[UserStatus] = None
    
    @field_validator('username')
    @classmethod
    def validate_username(cls, v):
        if v and not v.replace('_', '').replace('-', '').isalnum():
            raise ValueError('用户名只能包含字母、数字、下划线和连字符')
        return v.lower() if v else v


class UserPasswordReset(BaseModel):
    """密码重置请求模型"""
    new_password: str = Field(..., min_length=8, max_length=128)
    confirm_password: str = Field(...)
    force_change_on_login: bool = Field(False, description="下次登录时强制修改密码")
    
    @field_validator('confirm_password')
    @classmethod
    def passwords_match(cls, v, info: ValidationInfo):
        if 'new_password' in info.data and v != info.data['new_password']:
            raise ValueError('两次输入的密码不一致')
        return v
    
    @field_validator('new_password')
    @classmethod
    def validate_password(cls, v):
        """密码复杂度验证"""
        if len(v) < 8:
            raise ValueError('密码长度至少8位')
        if not any(c.isupper() for c in v):
            raise ValueError('密码必须包含大写字母')
        if not any(c.islower() for c in v):
            raise ValueError('密码必须包含小写字母')
        if not any(c.isdigit() for c in v):
            raise ValueError('密码必须包含数字')
        if not any(c in '!@#$%^&*()_+-=[]{}|;:,.<>?' for c in v):
            raise ValueError('密码必须包含特殊字符')
        return v


class UserStatusUpdate(BaseModel):
    """用户状态更新模型"""
    status: UserStatus
    reason: Optional[str] = Field(None, max_length=500, description="状态变更原因")


class UserResponse(UserBase):
    """用户响应模型"""
    id: str
    avatar: Optional[str] = None
    permissions: List[str] = []
    last_login_at: Optional[datetime] = None
    last_login_ip: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    created_by: str
    
    model_config = {"from_attributes": True}


class UserListResponse(BaseModel):
    """用户列表响应模型"""
    items: List[UserResponse]
    total: int
    page: int
    page_size: int
    has_next: bool
    has_prev: bool


class UserQueryParams(BaseModel):
    """用户查询参数模型"""
    page: int = Field(1, ge=1, description="页码")
    page_size: int = Field(20, ge=1, le=100, description="每页数量")
    search: Optional[str] = Field(None, max_length=100, description="搜索关键词")
    role: Optional[UserRole] = Field(None, description="角色筛选")
    status: Optional[UserStatus] = Field(None, description="状态筛选")
    sort_by: str = Field("created_at", description="排序字段")
    sort_order: str = Field("desc", pattern="^(asc|desc)$", description="排序方向")


class UserBulkOperation(BaseModel):
    """批量操作模型"""
    user_ids: List[str] = Field(..., min_items=1, description="用户ID列表")
    operation: str = Field(..., pattern="^(activate|deactivate|lock|unlock|delete)$")
    reason: Optional[str] = Field(None, max_length=500, description="操作原因")


class UserBulkImportItem(BaseModel):
    """批量导入用户项模型"""
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    full_name: Optional[str] = Field(None, max_length=100)
    role: UserRole = UserRole.VIEWER
    password: Optional[str] = Field(None, description="如果为空则生成随机密码")
    
    @field_validator('username')
    @classmethod
    def validate_username(cls, v):
        if not v.replace('_', '').replace('-', '').isalnum():
            raise ValueError('用户名只能包含字母、数字、下划线和连字符')
        return v.lower()


class UserBulkImport(BaseModel):
    """批量导入模型"""
    users: List[UserBulkImportItem] = Field(..., min_items=1, max_items=1000)
    send_email: bool = Field(True, description="是否发送欢迎邮件")
    force_password_change: bool = Field(True, description="首次登录强制修改密码")


class UserBulkImportResult(BaseModel):
    """批量导入结果模型"""
    total: int
    success: int
    failed: int
    errors: List[dict] = []
    created_users: List[UserResponse] = []


# 权限相关模型
class Permission(BaseModel):
    """权限模型"""
    id: str
    name: str
    display_name: str
    description: str
    module: str
    action: str
    resource: str
    
    model_config = {"from_attributes": True}


class Role(BaseModel):
    """角色模型"""
    id: str
    name: str
    display_name: str
    description: str
    permissions: List[Permission] = []
    user_count: int = 0
    is_built_in: bool = False
    created_at: datetime
    updated_at: datetime
    
    model_config = {"from_attributes": True}


class RoleCreate(BaseModel):
    """创建角色模型"""
    name: str = Field(..., min_length=2, max_length=50, pattern="^[a-z_]+$")
    display_name: str = Field(..., min_length=2, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    permission_ids: List[str] = []


class RoleUpdate(BaseModel):
    """更新角色模型"""
    display_name: Optional[str] = Field(None, min_length=2, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    permission_ids: Optional[List[str]] = None


class UserPermissionsResponse(BaseModel):
    """用户权限响应模型"""
    user_id: str
    username: str
    role: str
    permissions: List[Permission]
    effective_permissions: List[str]  # 扁平化的权限列表