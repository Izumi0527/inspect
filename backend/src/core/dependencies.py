"""
依赖注入配置

提供全局服务和仓储的依赖注入函数
支持两种方式：
1. 传统方式（向后兼容）
2. dependency-injector 容器方式（推荐）
"""
from typing import Generator, TYPE_CHECKING
import structlog

from src.repositories.alert_repository_impl import (
    InMemoryAlertRepository,
    get_in_memory_alert_repository
)
from src.services.alert import AlertService

if TYPE_CHECKING:
    from src.core.container import Container

logger = structlog.get_logger()


# ==================== 容器依赖 ====================

def get_container():
    """获取DI容器实例"""
    from src.core.container import container
    return container


# ==================== Repository Dependencies ====================

def get_alert_repository() -> InMemoryAlertRepository:
    """
    获取告警Repository实例（依赖注入）

    Returns:
        InMemoryAlertRepository: 告警仓储单例实例

    使用示例:
        @router.get("/alerts")
        async def get_alerts(
            repo: InMemoryAlertRepository = Depends(get_alert_repository)
        ):
            alerts = await repo.get_active_alerts()
            return alerts
    """
    return get_in_memory_alert_repository()


def get_device_repository():
    """获取设备Repository实例"""
    from src.repositories.device_repository import DeviceRepository
    return DeviceRepository()


def get_user_repository():
    """获取用户Repository实例"""
    from src.repositories.user_repository import UserRepository
    return UserRepository()


def get_inspection_repository():
    """获取巡检Repository实例"""
    from src.repositories.inspection_repository import InspectionRepository
    return InspectionRepository()


# ==================== Service Dependencies ====================

_alert_service_instance = None


def get_alert_service() -> AlertService:
    """
    获取告警Service实例（依赖注入）

    Returns:
        AlertService: 告警服务单例实例

    使用示例:
        @router.get("/alerts")
        async def get_alerts(
            service: AlertService = Depends(get_alert_service)
        ):
            alerts = service.get_active_alerts()
            return alerts
    """
    global _alert_service_instance

    if _alert_service_instance is None:
        # 创建Service实例，注入Repository
        repository = get_in_memory_alert_repository()
        _alert_service_instance = AlertService(alert_repository=repository)
        logger.info("AlertService instance created with InMemoryAlertRepository")

    return _alert_service_instance


def get_monitoring_service():
    """获取监控服务实例"""
    from src.services.monitoring import MonitoringService
    return MonitoringService()


def get_inspection_service():
    """获取巡检服务实例"""
    from src.services.inspection import InspectionService
    return InspectionService()


def get_cache_service():
    """获取缓存服务实例"""
    from src.infrastructure.cache import cache_service
    return cache_service


def reset_alert_service():
    """
    重置告警Service实例（用于测试）

    警告：仅用于测试环境，不要在生产环境调用
    """
    global _alert_service_instance
    _alert_service_instance = None
    logger.warning("AlertService instance has been reset")


# ==================== Database Repository Dependencies ====================

from sqlalchemy.ext.asyncio import AsyncSession
from src.repositories.alert_repository_db import DatabaseAlertRepository
from src.core.database import get_db_session


async def get_database_alert_repository(
    db: AsyncSession
) -> DatabaseAlertRepository:
    """
    获取数据库告警Repository实例（依赖注入）

    Args:
        db: SQLAlchemy异步会话

    Returns:
        DatabaseAlertRepository: 数据库告警仓储实例

    使用示例:
        @router.get("/alerts")
        async def get_alerts(
            db: AsyncSession = Depends(get_db_session),
            repo: DatabaseAlertRepository = Depends(get_database_alert_repository)
        ):
            alerts, total = await repo.get_alerts(skip=0, limit=20)
            return {"alerts": alerts, "total": total}
    """
    return DatabaseAlertRepository(db)


async def get_alert_service_with_db(db: AsyncSession) -> AlertService:
    """
    获取使用数据库Repository的告警Service实例

    Args:
        db: SQLAlchemy异步会话

    Returns:
        AlertService: 使用数据库Repository的告警服务实例

    注意：
    - 这个Service实例使用DatabaseAlertRepository进行数据持久化
    - 每次请求创建新的Service实例，使用传入的数据库会话
    - 适用于已经启用数据库持久化的环境

    使用示例:
        @router.post("/alerts/acknowledge")
        async def acknowledge_alert(
            alert_id: int,
            user_id: int,
            db: AsyncSession = Depends(get_db_session),
            service: AlertService = Depends(get_alert_service_with_db)
        ):
            success = await service.acknowledge_alert(alert_id, user_id)
            return {"success": success}
    """
    repository = DatabaseAlertRepository(db)
    return AlertService(alert_repository=repository)
