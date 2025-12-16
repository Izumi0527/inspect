"""
流量分析模块 - 数据模式定义
"""
from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import Field

from src.shared.base_schema import BaseSchema


class InterfaceTrafficResponse(BaseSchema):
    """接口流量响应"""
    interface_index: str
    interface_name: str
    in_octets: int
    out_octets: int
    in_rate: float  # bytes/s
    out_rate: float  # bytes/s
    utilization: float  # 百分比
    timestamp: datetime


class DeviceTrafficResponse(BaseSchema):
    """设备流量响应"""
    device_id: int
    device_name: str
    ip_address: str
    total_in_rate: float
    total_out_rate: float
    interfaces: List[InterfaceTrafficResponse]
    timestamp: datetime


class TrafficTrendDataPoint(BaseSchema):
    """流量趋势数据点"""
    timestamp: datetime
    in_rate: float
    out_rate: float


class TrafficTrendResponse(BaseSchema):
    """流量趋势响应"""
    device_id: int
    interface_index: Optional[str] = None
    start_time: datetime
    end_time: datetime
    interval: str
    data_points: List[TrafficTrendDataPoint]


class TopTalkersResponse(BaseSchema):
    """流量排行响应"""
    device_id: int
    device_name: str
    ip_address: str
    interface_name: Optional[str] = None
    in_rate: float
    out_rate: float
    total_rate: float


class BandwidthUtilizationResponse(BaseSchema):
    """带宽利用率响应"""
    device_id: int
    device_name: str
    interface_index: str
    interface_name: str
    speed: int  # bps
    in_utilization: float
    out_utilization: float
    peak_in_utilization: float
    peak_out_utilization: float


class TrafficAlertThreshold(BaseSchema):
    """流量告警阈值"""
    device_id: int
    interface_index: Optional[str] = None
    in_threshold: float  # bytes/s
    out_threshold: float  # bytes/s
    utilization_threshold: float  # 百分比
    enabled: bool = True


class TrafficSummaryResponse(BaseSchema):
    """流量摘要响应"""
    total_devices: int
    total_interfaces: int
    total_in_traffic: float  # bytes/s
    total_out_traffic: float  # bytes/s
    avg_utilization: float
    high_utilization_count: int
    timestamp: datetime
