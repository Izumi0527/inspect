"""
设备管理模块 - 数据访问层

注意：此文件从 src.repositories.device_repository 重新导出
保持向后兼容，同时提供模块化的导入路径
"""
# 从原有位置导入，保持向后兼容
from src.repositories.device_repository import (
    DeviceRepository,
    get_device_repository,
)

__all__ = ["DeviceRepository", "get_device_repository"]
