"""
仪表板模块 - 数据模式定义
"""
from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import Field

from src.shared.base_schema import BaseSchema


class DashboardOverview(BaseSchema):
    """仪表板概览"""
    total_devices: int = 0
    online_devices: int = 0
    offline_devices: int = 0
    warning_devices: int = 0
    total_alerts: int = 0
    active_alerts: int = 0
    critical_alerts: int = 0
    total_inspections: int = 0
    recent_inspections: int = 0
    inspection_pass_rate: float = 0.0
    system_health: float = 100.0


class DeviceStatusSummary(BaseSchema):
    """设备状态摘要"""
    online: int = 0
    offline: int = 0
    warning: int = 0
    unknown: int = 0
    total: int = 0


class AlertSummary(BaseSchema):
    """告警摘要"""
    critical: int = 0
    warning: int = 0
    info: int = 0
    total: int = 0
    unacknowledged: int = 0


class TrendDataPoint(BaseSchema):
    """趋势数据点"""
    timestamp: datetime
    value: float
    label: Optional[str] = None


class DeviceTrend(BaseSchema):
    """设备趋势"""
    time_range: str
    data_points: List[TrendDataPoint]
    metric_name: str


class AlertTrend(BaseSchema):
    """告警趋势"""
    time_range: str
    data_points: List[TrendDataPoint]
    by_severity: Dict[str, List[TrendDataPoint]] = {}


class InspectionTrend(BaseSchema):
    """巡检趋势"""
    time_range: str
    total_tasks: List[TrendDataPoint]
    pass_rate: List[TrendDataPoint]


class TopDevicesByAlerts(BaseSchema):
    """告警最多的设备"""
    device_id: int
    device_name: str
    ip_address: str
    alert_count: int
    critical_count: int


class RecentActivity(BaseSchema):
    """最近活动"""
    id: str
    type: str  # device_added, alert_triggered, inspection_completed, etc.
    title: str
    description: str
    timestamp: datetime
    related_id: Optional[int] = None
    severity: Optional[str] = None


class SystemStatus(BaseSchema):
    """系统状态"""
    monitoring_service: bool = False
    alert_engine: bool = False
    scheduler_service: bool = False
    influxdb_connected: bool = False
    redis_connected: bool = False
    database_connected: bool = True
    uptime_seconds: int = 0
    last_check: datetime
