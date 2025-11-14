"""
Notification Settings Schemas
通知配置相关的Pydantic模型
"""
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field, EmailStr


class TestEmailRequest(BaseModel):
    """测试邮件请求"""
    recipient: Optional[EmailStr] = Field(None, description="测试接收人邮箱（不填则发送给配置的发件人）")
    subject: str = Field(default="邮件配置测试", description="邮件主题")
    content: str = Field(default="这是一封测试邮件，用于验证邮件配置是否正确。", description="邮件内容")

    class Config:
        json_schema_extra = {
            "example": {
                "recipient": "test@example.com",
                "subject": "邮件配置测试",
                "content": "测试邮件内容"
            }
        }


class TestEmailResponse(BaseModel):
    """测试邮件响应"""
    success: bool = Field(..., description="是否成功")
    message: str = Field(..., description="响应消息")


class TestSmsRequest(BaseModel):
    """测试短信请求"""
    phone_number: Optional[str] = Field(None, description="测试接收人手机号（不填则使用配置的测试号码）", pattern=r"^1[3-9]\d{9}$")
    content: str = Field(default="【网络设备巡检系统】这是一条测试短信，用于验证短信配置是否正确。", description="短信内容")

    class Config:
        json_schema_extra = {
            "example": {
                "phone_number": "13800138000",
                "content": "【网络设备巡检系统】测试短信"
            }
        }


class TestSmsResponse(BaseModel):
    """测试短信响应"""
    success: bool = Field(..., description="是否成功")
    message: str = Field(..., description="响应消息")
    sms_id: Optional[str] = Field(None, description="短信ID")


class TestWebhookRequest(BaseModel):
    """测试Webhook请求"""
    url: Optional[str] = Field(None, description="测试URL（不填则使用配置的URL）")
    method: str = Field(default="POST", description="HTTP方法", pattern="^(GET|POST|PUT|PATCH)$")
    headers: Optional[Dict[str, str]] = Field(default_factory=dict, description="自定义请求头")
    payload: Optional[Dict[str, Any]] = Field(
        default_factory=lambda: {
            "event": "test",
            "message": "这是一个测试Webhook请求",
            "timestamp": None  # 将在服务层填充
        },
        description="测试数据"
    )

    class Config:
        json_schema_extra = {
            "example": {
                "url": "https://example.com/webhook",
                "method": "POST",
                "headers": {
                    "Content-Type": "application/json",
                    "Authorization": "Bearer token"
                },
                "payload": {
                    "event": "test",
                    "message": "测试消息"
                }
            }
        }


class TestWebhookResponse(BaseModel):
    """测试Webhook响应"""
    success: bool = Field(..., description="是否成功")
    message: str = Field(..., description="响应消息")
    status_code: Optional[int] = Field(None, description="HTTP状态码")
    response_body: Optional[str] = Field(None, description="响应内容")
    response_time_ms: Optional[int] = Field(None, description="响应时间(毫秒)")
