"""
API 路由注册

所有路由统一从 modules/ 目录导入。
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

api_router = APIRouter()

# ============================================================
# 主路由（从新模块导入，保持API路径不变）
# ============================================================

# 认证模块
api_router.include_router(auth_router, prefix="/auth", tags=["认证"])

# 仪表板模块
api_router.include_router(dashboard_router, prefix="/dashboard", tags=["仪表板"])

# Settings 模块（内部已包含 /settings 前缀）
api_router.include_router(settings_router)

# 业务模块
api_router.include_router(devices_router, prefix="/devices", tags=["设备管理"])
api_router.include_router(inspection_router, prefix="/inspection", tags=["巡检管理"])
api_router.include_router(monitoring_router, prefix="/monitoring", tags=["实时监控"])
api_router.include_router(scheduler_router, prefix="/scheduler", tags=["任务调度"])
api_router.include_router(alerts_router, prefix="/alerts", tags=["告警中心"])
api_router.include_router(alert_escalation_router, tags=["告警升级"])
api_router.include_router(reports_router, prefix="/reports", tags=["报表分析"])
api_router.include_router(traffic_router, prefix="/traffic", tags=["流量分析"])

# ============================================================
# 注意: v1路由已在上方直接注册，无需再嵌套引入
# api/v1/__init__.py 保留用于向后兼容，但不再重复注册
# ============================================================