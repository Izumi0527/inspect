"""
告警领域服务模块

统一导出告警相关的所有服务和类型
"""

from src.services.alert.types import (
    AlertSeverity,
    AlertStatus,
    AlertCategory,
    RuleCondition,
    AlertRule,
    Alert,
)
from src.services.alert.service import AlertService, alert_service
from src.services.alert.engine import AlertEngine, alert_engine
from src.services.alert.escalation import (
    EscalationLevel,
    NotificationChannel,
    EscalationRule,
    AlertEscalation,
    AlertEscalationService,
    alert_escalation_service,
)
from src.services.alert.notifier import EmailNotifier

__all__ = [
    # 类型和枚举
    "AlertSeverity",
    "AlertStatus",
    "AlertCategory",
    "RuleCondition",
    "AlertRule",
    "Alert",
    "EscalationLevel",
    "NotificationChannel",
    "EscalationRule",
    "AlertEscalation",
    
    # 服务类
    "AlertService",
    "AlertEngine",
    "AlertEscalationService",
    "EmailNotifier",
    
    # 全局实例
    "alert_service",
    "alert_engine",
    "alert_escalation_service",
]
