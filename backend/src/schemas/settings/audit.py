"""
Audit Settings Schemas
审计日志扩展相关的Pydantic模型
"""
from typing import Dict, List, Any, Optional
from pydantic import BaseModel, Field
from datetime import datetime


class AuditLogResponse(BaseModel):
    """审计日志响应模型"""
    id: str
    user_id: Optional[str] = None
    username: Optional[str] = None
    action: str
    resource_type: str
    resource_id: Optional[str] = None
    description: str
    details: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    status: str
    error_message: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True


class AuditLogListResponse(BaseModel):
    """审计日志列表响应"""
    items: List[AuditLogResponse]
    total: int
    page: int
    pageSize: int


class ExportLogsRequest(BaseModel):
    """导出日志请求"""
    format: str = Field(..., pattern="^(csv|excel|json)$", description="导出格式")
    startDate: str = Field(..., description="开始日期")
    endDate: str = Field(..., description="结束日期")
    filters: Optional[dict] = Field(default=None, description="筛选条件")


class CleanupLogsRequest(BaseModel):
    """清理日志请求"""
    beforeDate: str = Field(..., description="删除此日期之前的日志")


class AuditStats(BaseModel):
    """审计日志统计数据"""
    total_logs: int = Field(..., description="总日志数")
    logs_today: int = Field(..., description="今日日志数")
    logs_this_week: int = Field(..., description="本周日志数")
    logs_this_month: int = Field(..., description="本月日志数")

    # 按操作类型统计
    logs_by_action: Dict[str, int] = Field(..., description="按操作类型统计")

    # 按状态统计
    logs_by_status: Dict[str, int] = Field(..., description="按状态统计")

    # 按资源类型统计
    logs_by_resource_type: Dict[str, int] = Field(..., description="按资源类型统计")

    # 活跃用户
    top_active_users: List[Dict[str, Any]] = Field(..., description="最活跃用户Top10")

    # 高频操作
    top_actions: List[Dict[str, Any]] = Field(..., description="高频操作Top10")

    # 失败操作统计
    failed_operations_count: int = Field(..., description="失败操作数量")
    failed_operations_rate: float = Field(..., description="失败率（百分比）")

    class Config:
        json_schema_extra = {
            "example": {
                "total_logs": 10000,
                "logs_today": 150,
                "logs_this_week": 1200,
                "logs_this_month": 4500,
                "logs_by_action": {
                    "login": 2000,
                    "logout": 1800,
                    "create": 1500,
                    "update": 2000,
                    "delete": 500
                },
                "logs_by_status": {
                    "success": 9500,
                    "failed": 500
                },
                "logs_by_resource_type": {
                    "user": 3000,
                    "device": 4000,
                    "inspection": 2000,
                    "backup": 1000
                },
                "top_active_users": [],
                "top_actions": [],
                "failed_operations_count": 500,
                "failed_operations_rate": 5.0
            }
        }
