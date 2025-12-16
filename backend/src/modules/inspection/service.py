"""
巡检管理模块 - 业务逻辑层

注意：此文件从现有服务重新导出，保持向后兼容
"""
# 从现有服务导入
from src.services.inspection import (
    inspection_service,
)
from src.repositories.inspection_repository import (
    InspectionRepository,
)
from src.repositories.template_repository import (
    TemplateRepository,
)
from src.repositories.strategy_repository import (
    StrategyRepository,
)

__all__ = [
    "inspection_service",
    "InspectionRepository",
    "TemplateRepository",
    "StrategyRepository",
]
