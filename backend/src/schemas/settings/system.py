"""
System Settings Schemas
系统配置相关的数据模型
"""
from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field


class ValidationRule(BaseModel):
    """验证规则"""
    min: Optional[float] = None
    max: Optional[float] = None
    pattern: Optional[str] = None
    options: Optional[List[Dict[str, Any]]] = None


class SettingResponse(BaseModel):
    """配置项响应"""
    id: str
    key: str
    value: Any
    category: str
    type: str = Field(description="数据类型: string/integer/float/boolean/array")
    label: str
    description: Optional[str] = None
    required: bool = False
    readonly: bool = False
    validation: Optional[ValidationRule] = None
    updated_at: Optional[datetime] = None
    updated_by: Optional[str] = None


class SettingsGroupResponse(BaseModel):
    """配置分组响应"""
    id: str
    name: str
    displayName: str
    description: str
    icon: str
    order: int
    configs: List[SettingResponse] = []


class SystemInfoResponse(BaseModel):
    """系统信息响应"""
    application_name: str
    version: str
    timezone: str
    uptime: Optional[str] = None
    last_backup: Optional[datetime] = None


class EmailTestResponse(BaseModel):
    """邮件测试响应"""
    success: bool
    message: str


class EmailSettingsRequest(BaseModel):
    """邮件设置请求"""
    smtp_server: str
    smtp_port: int = 587
    smtp_username: str
    smtp_password: str
    use_tls: bool = True
    use_ssl: bool = False
    sender_name: str = "网络设备巡检系统"
    sender_email: Optional[str] = None


class NotificationSettingsRequest(BaseModel):
    """通知设置请求"""
    email_enabled: bool = True
    sms_enabled: bool = False
    webhook_enabled: bool = False
    email_recipients: List[str] = []
    sms_recipients: List[str] = []
    webhook_urls: List[str] = []
    notification_levels: List[str] = ["warning", "error", "critical"]
