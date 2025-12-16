"""
数据访问层

提供各业务实体的数据访问接口和实现：
- DeviceRepository - 设备数据访问
- UserRepository - 用户数据访问
- AlertRepository - 告警数据访问
- InspectionRepository - 巡检数据访问
- TemplateRepository - 模板数据访问
- StrategyRepository - 策略数据访问
"""


def __getattr__(name: str):
    """延迟导入避免循环依赖"""
    if name == "DeviceRepository":
        from src.repositories.device_repository import DeviceRepository
        return DeviceRepository
    if name == "get_device_repository":
        from src.repositories.device_repository import get_device_repository
        return get_device_repository
    if name == "UserRepository":
        from src.repositories.user_repository import UserRepository
        return UserRepository
    if name == "AlertRepository":
        from src.repositories.alert_repository import AlertRepository
        return AlertRepository
    if name == "InspectionRepository":
        from src.repositories.inspection_repository import InspectionRepository
        return InspectionRepository
    if name == "TemplateRepository":
        from src.repositories.template_repository import TemplateRepository
        return TemplateRepository
    if name == "StrategyRepository":
        from src.repositories.strategy_repository import StrategyRepository
        return StrategyRepository
    
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


__all__ = [
    "DeviceRepository",
    "get_device_repository",
    "UserRepository",
    "AlertRepository",
    "InspectionRepository",
    "TemplateRepository",
    "StrategyRepository",
]
