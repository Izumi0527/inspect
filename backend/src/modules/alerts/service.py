"""
告警中心模块 - 业务逻辑层

注意：此文件从现有服务重新导出，保持向后兼容
"""
# 从新模块化结构导入
from src.services.alert import (
    AlertEngine,
    alert_engine,
    AlertRule,
    Alert,
    AlertSeverity,
    AlertStatus,
    RuleCondition,
    EmailNotifier,
    alert_escalation_service,
)

__all__ = [
    "AlertEngine",
    "alert_engine",
    "AlertRule",
    "Alert",
    "AlertSeverity",
    "AlertStatus",
    "RuleCondition",
    "EmailNotifier",
    "alert_escalation_service",
]
