"""
告警中心模块 - 数据模式定义
"""
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum
from pydantic import Field

from src.shared.base_schema import BaseSchema, PaginatedResponse


class AlertSeverity(str, Enum):
    """告警严重级别"""
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"
    EMERGENCY = "emergency"


class AlertStatus(str, Enum):
    """告警状态"""
    ACTIVE = "active"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"
    SUPPRESSED = "suppressed"


class RuleCondition(str, Enum):
    """规则条件类型"""
    GREATER_THAN = "gt"
    LESS_THAN = "lt"
    EQUAL = "eq"
    NOT_EQUAL = "ne"
    CONTAINS = "contains"
    NOT_CONTAINS = "not_contains"


class AlertRuleCreate(BaseSchema):
    """创建告警规则请求"""
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    enabled: bool = True
    severity: AlertSeverity = AlertSeverity.WARNING
    metric_name: str = Field(..., description="监控指标名称")
    condition: RuleCondition = RuleCondition.GREATER_THAN
    threshold: float = 0.0
    duration: int = Field(300, ge=0, description="持续时间(秒)")
    notify_email: bool = True
    notify_websocket: bool = True
    email_recipients: List[str] = []
    cooldown_minutes: int = Field(30, ge=0, description="冷却时间(分钟)")


class AlertRuleUpdate(BaseSchema):
    """更新告警规则请求"""
    name: Optional[str] = None
    description: Optional[str] = None
    enabled: Optional[bool] = None
    severity: Optional[AlertSeverity] = None
    metric_name: Optional[str] = None
    condition: Optional[RuleCondition] = None
    threshold: Optional[float] = None
    duration: Optional[int] = None
    notify_email: Optional[bool] = None
    notify_websocket: Optional[bool] = None
    email_recipients: Optional[List[str]] = None
    cooldown_minutes: Optional[int] = None


class AlertRuleResponse(BaseSchema):
    """告警规则响应"""
    id: str
    name: str
    description: Optional[str] = None
    enabled: bool
    severity: AlertSeverity
    metric_name: str
    condition: RuleCondition
    threshold: float
    duration: int
    notify_email: bool
    notify_websocket: bool
    email_recipients: List[str]
    cooldown_minutes: int
    created_at: datetime
    updated_at: datetime
    last_triggered: Optional[datetime] = None
    trigger_count: int = 0


class AlertResponse(BaseSchema):
    """告警响应"""
    id: str
    rule_id: str
    rule_name: str
    severity: AlertSeverity
    status: AlertStatus
    title: str
    message: str
    details: Dict[str, Any] = {}
    device_id: Optional[int] = None
    device_name: Optional[str] = None
    device_ip: Optional[str] = None
    triggered_at: datetime
    acknowledged_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    acknowledged_by: Optional[str] = None
    resolved_by: Optional[str] = None
    notes: List[str] = []


class AlertListResponse(PaginatedResponse[AlertResponse]):
    """告警列表响应"""
    pass


class AlertAcknowledgeRequest(BaseSchema):
    """确认告警请求"""
    notes: Optional[str] = None


class AlertResolveRequest(BaseSchema):
    """解决告警请求"""
    notes: Optional[str] = None


class AlertStatistics(BaseSchema):
    """告警统计"""
    total_alerts: int
    active_alerts: int
    acknowledged_alerts: int
    resolved_alerts: int
    by_severity: Dict[str, int]
    by_device: Dict[str, int]
    recent_24h: int


class EscalationPolicyCreate(BaseSchema):
    """创建升级策略请求"""
    name: str
    description: Optional[str] = None
    levels: List[Dict[str, Any]]
    enabled: bool = True


class EscalationPolicyResponse(BaseSchema):
    """升级策略响应"""
    id: str
    name: str
    description: Optional[str] = None
    levels: List[Dict[str, Any]]
    enabled: bool
    created_at: datetime
    updated_at: datetime
