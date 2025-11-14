"""
Settings API Router
统一的系统设置API路由
"""
from fastapi import APIRouter

# 创建主路由
router = APIRouter(prefix="/settings", tags=["Settings"])

# 导入子路由
from .general import router as general_router
from .notifications import router as notifications_router
from .security import router as security_router
from .users import router as users_router
from .audit import router as audit_router
from .monitoring import router as monitoring_router
from .backup import router as backup_router

# 注册子路由
router.include_router(general_router)
router.include_router(notifications_router)
router.include_router(security_router)
router.include_router(users_router)
router.include_router(audit_router)
router.include_router(monitoring_router)
router.include_router(backup_router)

@router.get("/health")
async def health_check():
    """健康检查接口"""
    return {"status": "ok", "message": "Settings API is running"}
