"""
告警中心模块

提供告警规则管理、告警触发、告警升级、通知等功能

模块结构：
- api.py: 告警API路由
- escalation.py: 告警升级路由
- engine.py: 告警引擎（规则检查循环）
- evaluator.py: 规则评估器
- notifier.py: 通知服务
- service.py: 告警服务（重导出）
"""
from src.modules.alerts.api import router
from src.modules.alerts.escalation import router as escalation_router
from src.modules.alerts.engine import AlertEngine
from src.modules.alerts.evaluator import AlertEvaluator, alert_evaluator
from src.modules.alerts.notifier import AlertNotifier, alert_notifier

__all__ = [
    "router",
    "escalation_router",
    "AlertEngine",
    "AlertEvaluator",
    "alert_evaluator",
    "AlertNotifier",
    "alert_notifier",
]
