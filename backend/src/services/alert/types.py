"""
告警领域类型定义

统一定义告警相关的枚举、数据类和类型
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, List, Optional
import uuid


class AlertSeverity(str, Enum):
    """告警严重级别"""
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"
    EMERGENCY = "emergency"
    FATAL = "fatal"  # 最高级别


class AlertStatus(str, Enum):
    """告警状态"""
    OPEN = "open"  # 未处理
    ACTIVE = "active"  # 活跃（与OPEN同义，保持兼容）
    ACKNOWLEDGED = "acknowledged"  # 已确认
    RESOLVED = "resolved"  # 已解决
    SUPPRESSED = "suppressed"  # 已抑制


class AlertCategory(str, Enum):
    """告警类别"""
    PERFORMANCE = "performance"  # 性能告警
    CONNECTIVITY = "connectivity"  # 连通性告警
    SECURITY = "security"  # 安全告警
    CONFIGURATION = "configuration"  # 配置告警
    HARDWARE = "hardware"  # 硬件告警
    OTHER = "other"  # 其他


class RuleCondition(str, Enum):
    """规则条件类型"""
    GREATER_THAN = "gt"
    LESS_THAN = "lt"
    EQUAL = "eq"
    NOT_EQUAL = "ne"
    CONTAINS = "contains"
    NOT_CONTAINS = "not_contains"
    
    # 兼容旧版本的操作符
    GT = ">"
    LT = "<"
    GTE = ">="
    LTE = "<="
    EQ = "=="
    NEQ = "!="


@dataclass
class AlertRule:
    """告警规则模型"""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    name: str = ""
    description: str = ""
    enabled: bool = True
    severity: AlertSeverity = AlertSeverity.WARNING
    category: AlertCategory = AlertCategory.OTHER
    
    # 规则条件
    metric_name: str = ""  # 监控指标名称，如 "device_status", "cpu_usage"
    condition: RuleCondition = RuleCondition.GREATER_THAN
    operator: str = ">"  # 兼容旧版本
    threshold: float = 0.0
    threshold_value: float = 0.0  # 兼容旧版本
    duration: int = 300  # 持续时间（秒）
    
    # 设备过滤
    device_types: List[str] = field(default_factory=list)
    
    # 通知配置
    notify_email: bool = True
    notify_websocket: bool = True
    notification_enabled: bool = True
    email_enabled: bool = True
    email_recipients: List[str] = field(default_factory=list)
    
    # 自动解决配置
    auto_resolve: bool = True
    
    # 抑制配置
    cooldown_minutes: int = 30  # 冷却时间（分钟）
    
    # 创建和更新时间
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    
    # 运行时状态
    last_triggered: Optional[datetime] = None
    trigger_count: int = 0


@dataclass
class Alert:
    """告警实例模型"""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    rule_id: str = ""
    rule_name: str = ""
    severity: AlertSeverity = AlertSeverity.WARNING
    status: AlertStatus = AlertStatus.ACTIVE
    category: AlertCategory = AlertCategory.OTHER
    
    # 告警内容
    title: str = ""
    message: str = ""
    details: Dict[str, Any] = field(default_factory=dict)
    
    # 指标信息
    metric_name: str = ""
    current_value: Any = None
    threshold_value: Any = None
    
    # 相关对象
    device_id: Optional[int] = None
    device_name: Optional[str] = None
    device_ip: Optional[str] = None
    
    # 时间信息
    triggered_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    last_occurred: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    acknowledged_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    
    # 处理信息
    acknowledged_by: Optional[str] = None
    resolved_by: Optional[str] = None
    notes: List[str] = field(default_factory=list)
    
    # 统计信息
    occurrence_count: int = 1
    notification_count: int = 0
