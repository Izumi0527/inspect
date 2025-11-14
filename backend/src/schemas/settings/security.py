"""
Security Settings Schemas
安全设置相关的Pydantic模型
"""
from typing import Optional, List
from pydantic import BaseModel, Field
from datetime import datetime


class TestLdapRequest(BaseModel):
    """测试LDAP连接请求"""
    server_url: Optional[str] = Field(None, description="LDAP服务器地址（不填则使用配置的值）")
    port: Optional[int] = Field(None, description="端口号")
    bind_dn: Optional[str] = Field(None, description="Bind DN")
    bind_password: Optional[str] = Field(None, description="Bind密码")
    base_dn: Optional[str] = Field(None, description="Base DN")
    use_ssl: Optional[bool] = Field(None, description="是否使用SSL")

    class Config:
        json_schema_extra = {
            "example": {
                "server_url": "ldap://192.168.1.100",
                "port": 389,
                "bind_dn": "cn=admin,dc=example,dc=com",
                "bind_password": "password",
                "base_dn": "dc=example,dc=com",
                "use_ssl": False
            }
        }


class TestLdapResponse(BaseModel):
    """测试LDAP连接响应"""
    success: bool = Field(..., description="是否成功")
    message: str = Field(..., description="响应消息")
    user_count: Optional[int] = Field(None, description="查询到的用户数量")


class SyncLdapUsersRequest(BaseModel):
    """同步LDAP用户请求"""
    dry_run: bool = Field(default=False, description="是否为模拟运行（不实际创建用户）")
    user_filter: Optional[str] = Field(None, description="用户过滤条件（LDAP filter）")

    class Config:
        json_schema_extra = {
            "example": {
                "dry_run": False,
                "user_filter": "(objectClass=person)"
            }
        }


class SyncLdapUsersResponse(BaseModel):
    """同步LDAP用户响应"""
    success: bool = Field(..., description="是否成功")
    message: str = Field(..., description="响应消息")
    total_found: int = Field(..., description="找到的用户总数")
    created: int = Field(..., description="创建的用户数")
    updated: int = Field(..., description="更新的用户数")
    skipped: int = Field(..., description="跳过的用户数")
    failed: int = Field(..., description="失败的用户数")
    dry_run: bool = Field(..., description="是否为模拟运行")


class SessionInfo(BaseModel):
    """会话信息"""
    session_id: str = Field(..., description="会话ID")
    user_id: int = Field(..., description="用户ID")
    username: str = Field(..., description="用户名")
    ip_address: Optional[str] = Field(None, description="IP地址")
    user_agent: Optional[str] = Field(None, description="User Agent")
    created_at: datetime = Field(..., description="创建时间")
    last_activity: datetime = Field(..., description="最后活动时间")
    expires_at: Optional[datetime] = Field(None, description="过期时间")
    is_active: bool = Field(..., description="是否活跃")

    class Config:
        from_attributes = True


class SessionListResponse(BaseModel):
    """会话列表响应"""
    total: int = Field(..., description="总数")
    sessions: List[SessionInfo] = Field(..., description="会话列表")


class DeleteSessionResponse(BaseModel):
    """删除会话响应"""
    success: bool = Field(..., description="是否成功")
    message: str = Field(..., description="响应消息")
