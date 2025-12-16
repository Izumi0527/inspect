"""
基础设施模块 - 提供底层基础设施服务

包含:
- cache: 缓存服务
- device_connection: 设备连接服务（SNMP/SSH）
- email: 邮件服务
- storage: 存储服务
"""

from src.infrastructure.cache.service import CacheService, cache_service, cached
from src.infrastructure.device_connection import (
    DeviceConnection,
    DeviceConnectionType,
    SNMPConfig,
    SSHConfig,
    DeviceInfo,
    DeviceMetrics,
    CheckResult,
    SNMPService,
    SSHService,
    SSHConnectionPool,
    DeviceHealthChecker,
    HealthCheckResult,
    HealthStatus,
)

__all__ = [
    # 缓存服务
    "CacheService",
    "cache_service",
    "cached",
    # 设备连接
    "DeviceConnection",
    "DeviceConnectionType",
    "SNMPConfig",
    "SSHConfig",
    "DeviceInfo",
    "DeviceMetrics",
    "CheckResult",
    "SNMPService",
    "SSHService",
    "SSHConnectionPool",
    "DeviceHealthChecker",
    "HealthCheckResult",
    "HealthStatus",
]
