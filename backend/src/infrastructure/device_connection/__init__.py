"""
设备连接模块 - 提供SNMP/SSH设备连接服务

包含:
- base: 设备连接基类
- types: 数据类型定义
- snmp_service: SNMP连接服务
- ssh_service: SSH连接服务
- health_checker: 设备健康检查服务
"""
from src.infrastructure.device_connection.base import DeviceConnection, ConnectionManager
from src.infrastructure.device_connection.types import (
    DeviceConnectionType,
    SNMPConfig,
    SSHConfig,
    DeviceInfo,
    DeviceMetrics,
    CheckResult,
)
from src.infrastructure.device_connection.snmp_service import SNMPService
from src.infrastructure.device_connection.ssh_service import SSHService, SSHConnectionPool
from src.infrastructure.device_connection.health_checker import (
    DeviceHealthChecker,
    HealthCheckResult,
    HealthStatus,
)

__all__ = [
    # 基础类
    "DeviceConnection",
    "ConnectionManager",
    # 数据类型
    "DeviceConnectionType",
    "SNMPConfig",
    "SSHConfig",
    "DeviceInfo",
    "DeviceMetrics",
    "CheckResult",
    # SNMP服务
    "SNMPService",
    # SSH服务
    "SSHService",
    "SSHConnectionPool",
    # 健康检查服务
    "DeviceHealthChecker",
    "HealthCheckResult",
    "HealthStatus",
]
