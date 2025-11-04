from fastapi import APIRouter
from src.api.auth import router as auth_router
from src.api.devices import router as devices_router
from src.api.inspection import router as inspection_router
from src.api.monitoring import router as monitoring_router
from src.api.scheduler import router as scheduler_router
from src.api.alerts import router as alerts_router
from src.api.alert_escalation import router as alert_escalation_router
from src.api.reports import router as reports_router
from src.api.traffic import router as traffic_router
from src.api.users import router as users_router
from src.api.roles import router as roles_router
from src.api.audit import router as audit_router
from src.api.backup import router as backup_router
from src.api.notifications import router as notifications_router
from src.api.security import router as security_router
from src.api.monitoring_settings import router as monitoring_settings_router
from src.api.license import router as license_router
from src.api.system import router as system_router
from src.api.dashboard import router as dashboard_router

api_router = APIRouter()

# 注册各模块路由
api_router.include_router(auth_router, prefix="/auth", tags=["认证"])
api_router.include_router(dashboard_router, prefix="/dashboard", tags=["仪表板"])
api_router.include_router(users_router, prefix="/settings/users", tags=["用户管理"])
api_router.include_router(roles_router, prefix="/settings/roles", tags=["角色管理"])
api_router.include_router(audit_router, prefix="/settings/audit", tags=["审计日志"])
api_router.include_router(backup_router, prefix="/settings/backup", tags=["备份恢复"])
api_router.include_router(notifications_router, prefix="/settings/notifications", tags=["通知配置"])
api_router.include_router(security_router, prefix="/settings/security", tags=["安全设置"])
api_router.include_router(monitoring_settings_router, prefix="/settings/monitoring", tags=["系统监控"])
api_router.include_router(license_router, prefix="/settings/license", tags=["许可证管理"])
api_router.include_router(system_router, prefix="/settings/system", tags=["系统设置"])
api_router.include_router(devices_router, prefix="/devices", tags=["设备管理"])
api_router.include_router(inspection_router, prefix="/inspection", tags=["巡检管理"])
api_router.include_router(monitoring_router, prefix="/monitoring", tags=["实时监控"])
api_router.include_router(scheduler_router, prefix="/scheduler", tags=["任务调度"])
api_router.include_router(alerts_router, prefix="/alerts", tags=["告警中心"])
api_router.include_router(alert_escalation_router, tags=["告警升级"])
api_router.include_router(reports_router, prefix="/reports", tags=["报表分析"])
api_router.include_router(traffic_router, prefix="/traffic", tags=["流量分析"])