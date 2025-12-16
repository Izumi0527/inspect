"""
依赖注入容器

使用 dependency-injector 框架管理应用依赖

重构说明：
- 移除 lambda 延迟导入，使用 providers.Callable
- 使用工厂函数模式，避免循环导入
- 提供清晰的依赖关系
"""
from typing import TYPE_CHECKING
from dependency_injector import containers, providers

from src.core.config import settings

if TYPE_CHECKING:
    from src.repositories.alert_repository_impl import InMemoryAlertRepository
    from src.services.alert import AlertService
    from src.services.monitoring import MonitoringService


# ==================== 工厂函数 ====================
# 使用工厂函数避免循环导入问题

def _get_db_session_factory():
    """获取数据库会话工厂"""
    from src.core.database import async_session_factory
    return async_session_factory


def _get_redis_client():
    """获取Redis客户端"""
    from src.core.redis import redis_client
    return redis_client


def _create_alert_repository():
    """创建告警Repository"""
    from src.repositories.alert_repository_impl import get_in_memory_alert_repository
    return get_in_memory_alert_repository()


def _create_device_repository():
    """创建设备Repository"""
    from src.repositories.device_repository import DeviceRepository
    return DeviceRepository


def _create_user_repository():
    """创建用户Repository"""
    from src.repositories.user_repository import UserRepository
    return UserRepository()


def _create_inspection_repository():
    """创建巡检Repository"""
    from src.repositories.inspection_repository import InspectionRepository
    return InspectionRepository()


def _create_template_repository():
    """创建模板Repository"""
    from src.repositories.template_repository import TemplateRepository
    return TemplateRepository()


def _create_strategy_repository():
    """创建策略Repository"""
    from src.repositories.strategy_repository import StrategyRepository
    return StrategyRepository()


def _create_alert_service(alert_repository):
    """创建告警服务"""
    from src.services.alert import AlertService
    return AlertService(alert_repository=alert_repository)


def _create_monitoring_service():
    """创建监控服务"""
    from src.services.monitoring import MonitoringService
    return MonitoringService()


def _create_inspection_service():
    """创建巡检服务"""
    from src.services.inspection import InspectionService
    return InspectionService()


def _create_report_generator():
    """创建报表生成器"""
    from src.services.report import ReportGenerator
    return ReportGenerator()


def _create_traffic_analysis_service():
    """创建流量分析服务"""
    from src.services.monitoring import TrafficAnalyzer
    return TrafficAnalyzer()


def _create_scheduler_service():
    """创建任务调度服务"""
    from src.services.scheduler import InspectionScheduler
    return InspectionScheduler()


def _get_cache_service():
    """获取缓存服务"""
    from src.infrastructure.cache import cache_service
    return cache_service


def _create_snmp_service():
    """创建SNMP服务"""
    from src.infrastructure.device_connection import SNMPService
    return SNMPService()


def _create_ssh_service():
    """创建SSH服务"""
    from src.infrastructure.device_connection import SSHService
    return SSHService()


class Container(containers.DeclarativeContainer):
    """应用依赖注入容器"""

    # 配置
    config = providers.Configuration()

    # ==================== 基础设施 ====================

    # 数据库会话工厂
    db_session_factory = providers.Singleton(_get_db_session_factory)

    # Redis客户端
    redis_client = providers.Singleton(_get_redis_client)

    # 缓存服务
    cache_service = providers.Singleton(_get_cache_service)

    # ==================== Repositories ====================

    # 告警Repository（内存版）- 单例
    alert_repository = providers.Singleton(_create_alert_repository)

    # 设备Repository - 工厂（需要session参数）
    device_repository_class = providers.Callable(_create_device_repository)

    # 用户Repository - 工厂
    user_repository = providers.Factory(_create_user_repository)

    # 巡检Repository - 工厂
    inspection_repository = providers.Factory(_create_inspection_repository)

    # 模板Repository - 工厂
    template_repository = providers.Factory(_create_template_repository)

    # 策略Repository - 工厂
    strategy_repository = providers.Factory(_create_strategy_repository)

    # ==================== Services ====================

    # 告警服务 - 单例（依赖alert_repository）
    alert_service = providers.Singleton(
        _create_alert_service,
        alert_repository=alert_repository
    )

    # 监控服务 - 单例
    monitoring_service = providers.Singleton(_create_monitoring_service)

    # 巡检服务 - 工厂
    inspection_service = providers.Factory(_create_inspection_service)

    # 报表生成服务 - 工厂
    report_generator = providers.Factory(_create_report_generator)

    # 流量分析服务 - 工厂
    traffic_analysis_service = providers.Factory(_create_traffic_analysis_service)

    # 任务调度服务 - 单例
    scheduler_service = providers.Singleton(_create_scheduler_service)

    # ==================== 基础设施服务 ====================

    # SNMP服务 - 工厂
    snmp_service = providers.Factory(_create_snmp_service)

    # SSH服务 - 工厂
    ssh_service = providers.Factory(_create_ssh_service)


# 全局容器实例
container = Container()


def get_container() -> Container:
    """获取容器实例"""
    return container


def init_container() -> Container:
    """初始化容器配置"""
    container.config.from_dict({
        "debug": settings.DEBUG,
        "database_url": str(settings.DATABASE_URL),
        "redis_url": str(settings.REDIS_URL),
    })
    return container


# ==================== 便捷访问函数 ====================

def get_alert_service() -> "AlertService":
    """获取告警服务实例"""
    return container.alert_service()


def get_monitoring_service() -> "MonitoringService":
    """获取监控服务实例"""
    return container.monitoring_service()


def get_alert_repository() -> "InMemoryAlertRepository":
    """获取告警Repository实例"""
    return container.alert_repository()
