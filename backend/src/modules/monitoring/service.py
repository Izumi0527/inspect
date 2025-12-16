"""
实时监控模块 - 业务逻辑层

注意：此文件从现有服务重新导出，保持向后兼容
"""
# 从新模块化结构导入
from src.services.device import (
    DeviceMonitoringService,
    device_monitoring_service,
)
from src.services.monitoring import (
    monitoring_service,
)

__all__ = [
    "DeviceMonitoringService",
    "device_monitoring_service",
    "monitoring_service",
]
