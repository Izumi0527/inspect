"""
设备领域服务模块

统一导出设备相关的所有服务和类型
"""

# 从各子模块导入
from src.services.device.monitoring import DeviceMonitoringService, device_monitoring_service
from src.services.device.connector import (
    DeviceConnector,
    device_connector,
    ConnectionType,
    ConnectionStatus,
    DeviceConnectionInfo,
    ConnectionSession,
)
from src.services.device.performance import (
    DevicePerformanceCollector,
    device_performance_collector,
    MonitoringProtocol,
    DeviceCredentials,
    DeviceMonitoringConfig,
    PerformanceMetric,
    DeviceStatus,
)
from src.services.device.batch import (
    DeviceBatchService,
    device_batch_service,
    BatchOperationType,
    BatchOperationStatus,
    BatchOperationResult,
    DeviceBatchData,
)
from src.services.device.scanner import (
    NetworkScanner,
    network_scanner,
    NetworkDevice,
    ScanResult,
)
from src.services.device.probe import (
    DeviceProbeService,
    device_probe_service,
    ProbeResult,
)

__all__ = [
    # 监控服务
    "DeviceMonitoringService",
    "device_monitoring_service",
    
    # 连接器
    "DeviceConnector",
    "device_connector",
    "ConnectionType",
    "ConnectionStatus",
    "DeviceConnectionInfo",
    "ConnectionSession",
    
    # 性能采集
    "DevicePerformanceCollector",
    "device_performance_collector",
    "MonitoringProtocol",
    "DeviceCredentials",
    "DeviceMonitoringConfig",
    "PerformanceMetric",
    "DeviceStatus",
    
    # 批量操作
    "DeviceBatchService",
    "device_batch_service",
    "BatchOperationType",
    "BatchOperationStatus",
    "BatchOperationResult",
    "DeviceBatchData",
    
    # 网络扫描
    "NetworkScanner",
    "network_scanner",
    "NetworkDevice",
    "ScanResult",
    
    # 设备探测
    "DeviceProbeService",
    "device_probe_service",
    "ProbeResult",
]
