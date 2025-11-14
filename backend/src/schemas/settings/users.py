"""
User Settings Schemas
用户管理扩展相关的Pydantic模型
"""
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, EmailStr, Field, field_validator, ValidationInfo
from datetime import datetime
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


class BatchOperationType(str, Enum):
    """批量操作类型"""
    ACTIVATE = "activate"  # 激活
    DEACTIVATE = "deactivate"  # 停用
    DELETE = "delete"  # 删除
    RESET_PASSWORD = "reset_password"  # 重置密码
    UNLOCK = "unlock"  # 解锁
    ASSIGN_ROLE = "assign_role"  # 分配角色


class BatchUserOperation(BaseModel):
    """批量用户操作请求"""
    user_ids: List[int] = Field(..., min_length=1, description="用户ID列表")
    operation: BatchOperationType = Field(..., description="操作类型")
    params: Optional[Dict[str, Any]] = Field(default_factory=dict, description="操作参数")

    class Config:
        json_schema_extra = {
            "example": {
                "user_ids": [1, 2, 3],
                "operation": "activate",
                "params": {}
            }
        }


class BatchOperationResult(BaseModel):
    """单个操作结果"""
    user_id: int = Field(..., description="用户ID")
    success: bool = Field(..., description="是否成功")
    message: Optional[str] = Field(None, description="结果消息")


class BatchUserOperationResponse(BaseModel):
    """批量用户操作响应"""
    success_count: int = Field(..., description="成功数量")
    failed_count: int = Field(..., description="失败数量")
    results: List[BatchOperationResult] = Field(..., description="详细结果")
    message: str = Field(..., description="总体消息")


class UserStats(BaseModel):
    """用户统计数据"""
    total_users: int = Field(..., description="总用户数")
    active_users: int = Field(..., description="活跃用户数")
    inactive_users: int = Field(..., description="停用用户数")
    locked_users: int = Field(..., description="锁定用户数")
    online_users: int = Field(..., description="在线用户数")

    # 按角色统计
    users_by_role: Dict[str, int] = Field(..., description="按角色统计")

    # 时间统计
    new_users_today: int = Field(..., description="今日新增用户")
    new_users_this_week: int = Field(..., description="本周新增用户")
    new_users_this_month: int = Field(..., description="本月新增用户")

    # 登录统计
    login_count_today: int = Field(..., description="今日登录次数")
    login_count_this_week: int = Field(..., description="本周登录次数")

    # 最近活动
    recent_active_users: List[Dict[str, Any]] = Field(default_factory=list, description="最近活跃用户")

    class Config:
        json_schema_extra = {
            "example": {
                "total_users": 100,
                "active_users": 85,
                "inactive_users": 10,
                "locked_users": 5,
                "online_users": 15,
                "users_by_role": {
                    "admin": 5,
                    "operator": 30,
                    "viewer": 65
                },
                "new_users_today": 2,
                "new_users_this_week": 8,
                "new_users_this_month": 25,
                "login_count_today": 45,
                "login_count_this_week": 320,
                "recent_active_users": []
            }
        }
