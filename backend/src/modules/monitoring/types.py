"""
监控模块类型定义
"""
from typing import TypedDict, Optional, List, Dict, Any
from datetime import datetime


class DeviceMetrics(TypedDict, total=False):
    """设备指标数据"""
    timestamp: str
    connectivity: Dict[str, Any]
    response_time: float
    cpu_usage: int
    memory_usage: int
    temperature: int
    uptime: int
    packet_loss: float
    bandwidth_utilization: int
    interface_count: int
    active_interfaces: int
    interfaces: List[Dict[str, Any]]
    disk_usage: int
    network_io: int
    disk_io: int
    load_average: float
    process_count: int
    tcp_connections: int


class MonitorInfo(TypedDict):
    """监控信息"""
    device_id: int
    device_info: Dict[str, Any]
    interval: int
    started_at: datetime
    last_collection: Optional[datetime]
    status: str
    error_count: int


class ConnectivityStatus(TypedDict):
    """连通性状态"""
    status: str
    reachable: bool
    last_check: str
    error: Optional[str]


class InterfaceMetrics(TypedDict, total=False):
    """接口指标"""
    name: str
    status: str
    speed: int
    in_octets: int
    out_octets: int
    in_packets: int
    out_packets: int
    in_errors: int
    out_errors: int


class NetworkOverview(TypedDict):
    """网络概览"""
    total_traffic: str
    avg_cpu_usage: str
    active_devices: int
    monitoring_status: Dict[str, Any]


class MonitoringStatus(TypedDict):
    """监控系统状态"""
    total_devices: int
    active_monitoring: int
    error_monitoring: int
    websocket_connections: int
    influxdb_available: bool
    last_updated: str
