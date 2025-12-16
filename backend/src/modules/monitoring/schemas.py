"""
实时监控模块 - 数据模式定义
"""
from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import Field

from src.shared.base_schema import BaseSchema


class DeviceStatusResponse(BaseSchema):
    """设备状态响应"""
    device_id: int
    device_name: str
    ip_address: str
    status: str = Field(..., description="状态: online, offline, unknown")
    response_time: Optional[float] = Field(None, description="响应时间(ms)")
    last_check: Optional[datetime] = None
    error_message: Optional[str] = None


class DeviceMetricsResponse(BaseSchema):
    """设备指标响应"""
    device_id: int
    timestamp: datetime
    cpu_usage: Optional[float] = None
    memory_usage: Optional[float] = None
    disk_usage: Optional[float] = None
    temperature: Optional[float] = None
    uptime: Optional[int] = None
    bandwidth_in: Optional[float] = None
    bandwidth_out: Optional[float] = None
    packet_loss: Optional[float] = None
    custom_metrics: Optional[Dict[str, Any]] = None


class MonitoringStatsResponse(BaseSchema):
    """监控统计响应"""
    is_running: bool
    monitor_interval: int
    total_devices: int
    active_devices: int
    monitoring_tasks: int
    influxdb_connected: bool
    last_check: Optional[str] = None
    error: Optional[str] = None


class InterfaceStatusResponse(BaseSchema):
    """接口状态响应"""
    index: str
    description: str
    operational_status: str
    admin_status: str
    speed: int
    in_octets: Optional[int] = None
    out_octets: Optional[int] = None


class DeviceInterfacesResponse(BaseSchema):
    """设备接口列表响应"""
    device_id: int
    device_name: str
    interfaces: List[InterfaceStatusResponse]
    timestamp: datetime


class MetricsHistoryRequest(BaseSchema):
    """指标历史查询请求"""
    device_id: int
    start_time: datetime
    end_time: datetime
    metric_names: Optional[List[str]] = None
    interval: str = Field("1m", description="聚合间隔: 1m, 5m, 1h, 1d")


class MetricsHistoryResponse(BaseSchema):
    """指标历史响应"""
    device_id: int
    start_time: datetime
    end_time: datetime
    data_points: List[Dict[str, Any]]
    metric_names: List[str]


class MonitoringConfigUpdate(BaseSchema):
    """监控配置更新"""
    monitor_interval: Optional[int] = Field(None, ge=10, le=3600, description="监控间隔(秒)")
    enabled_metrics: Optional[List[str]] = None
    alert_thresholds: Optional[Dict[str, float]] = None


class RealtimeDataSubscription(BaseSchema):
    """实时数据订阅请求"""
    device_ids: List[int]
    metrics: List[str] = Field(default=["status", "cpu", "memory"])
    interval: int = Field(5, ge=1, le=60, description="推送间隔(秒)")
