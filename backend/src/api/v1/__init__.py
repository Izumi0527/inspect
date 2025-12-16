"""
API v1 路由 - 从新模块结构导入

这是重构后的路由注册方式，从 modules/ 目录导入路由。
保持与原有API路径完全兼容。
"""
from fastapi import APIRouter

# ============================================================
# 从新模块导入路由
# ============================================================
from src.modules.auth import router as auth_router
from src.modules.devices import router as devices_router
from src.modules.monitoring import router as monitoring_router
from src.modules.alerts import router as alerts_router
from src.modules.inspection import router as inspection_router
from src.modules.dashboard import router as dashboard_router
from src.modules.reports import router as reports_router
from src.modules.traffic import router as traffic_router
from src.modules.scheduler import router as scheduler_router

# Settings模块从新模块导入
from src.modules.settings.api import router as settings_router

# 告警升级路由从新模块导入
from src.modules.alerts.escalation import router as alert_escalation_router

# 创建v1版本路由
api_v1_router = APIRouter(prefix="/v1")

# ============================================================
# 注册路由
# ============================================================

# 认证模块
api_v1_router.include_router(auth_router, prefix="/auth", tags=["v1-认证"])

# 仪表板模块
api_v1_router.include_router(dashboard_router, prefix="/dashboard", tags=["v1-仪表板"])

# Settings 模块（内部已包含 /settings 前缀）
api_v1_router.include_router(settings_router, tags=["v1-系统设置"])

# 业务模块
api_v1_router.include_router(devices_router, prefix="/devices", tags=["v1-设备管理"])
api_v1_router.include_router(inspection_router, prefix="/inspection", tags=["v1-巡检管理"])
api_v1_router.include_router(monitoring_router, prefix="/monitoring", tags=["v1-实时监控"])
api_v1_router.include_router(scheduler_router, prefix="/scheduler", tags=["v1-任务调度"])
api_v1_router.include_router(alerts_router, prefix="/alerts", tags=["v1-告警中心"])
api_v1_router.include_router(alert_escalation_router, tags=["v1-告警升级"])
api_v1_router.include_router(reports_router, prefix="/reports", tags=["v1-报表分析"])
api_v1_router.include_router(traffic_router, prefix="/traffic", tags=["v1-流量分析"])

__all__ = ["api_v1_router"]
