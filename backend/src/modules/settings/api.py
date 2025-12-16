"""
系统设置API路由

统一入口，整合所有设置子模块
使用延迟导入避免循环依赖
"""
from fastapi import APIRouter

# 创建主路由
router = APIRouter(prefix="/settings", tags=["系统设置"])

_routers_registered = False


def _register_sub_routers():
    """注册子路由（延迟执行）"""
    global _routers_registered
    if _routers_registered:
        return
    _routers_registered = True

    # 延迟导入子路由
    from src.modules.settings.general.api import router as general_router
    from src.modules.settings.users.api import router as users_router
    from src.modules.settings.backup.api import router as backup_router
    from src.modules.settings.notifications.api import router as notifications_router
    from src.modules.settings.security.api import router as security_router
    from src.modules.settings.audit.api import router as audit_router
    from src.modules.settings.monitoring.api import router as monitoring_router

    router.include_router(general_router)
    router.include_router(users_router)
    router.include_router(backup_router)
    router.include_router(notifications_router)
    router.include_router(security_router)
    router.include_router(audit_router)
    router.include_router(monitoring_router)


@router.get("/health")
async def health_check():
    """健康检查接口"""
    return {"status": "ok", "message": "Settings API is running"}


# 延迟注册子路由
_register_sub_routers()
