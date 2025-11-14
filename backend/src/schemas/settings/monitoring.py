"""
Monitoring Schemas
系统监控相关的Pydantic模型
"""
from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime
from enum import Enum


class ServiceStatus(str, Enum):
    """服务状态"""
    HEALTHY = "healthy"
    UNHEALTHY = "unhealthy"
    DEGRADED = "degraded"


class CpuMetrics(BaseModel):
    """CPU指标"""
    usage: float = Field(..., description="CPU使用率（百分比）")
    cores: int = Field(..., description="CPU核心数")
    temperature: Optional[float] = Field(None, description="CPU温度（摄氏度）")


class MemoryMetrics(BaseModel):
    """内存指标"""
    total: int = Field(..., description="总内存（字节）")
    used: int = Field(..., description="已用内存（字节）")
    free: int = Field(..., description="空闲内存（字节）")
    usage: float = Field(..., description="内存使用率（百分比）")


class DiskMetrics(BaseModel):
    """磁盘指标"""
    total: int = Field(..., description="总磁盘空间（字节）")
    used: int = Field(..., description="已用磁盘空间（字节）")
    free: int = Field(..., description="空闲磁盘空间（字节）")
    usage: float = Field(..., description="磁盘使用率（百分比）")


class NetworkMetrics(BaseModel):
    """网络指标"""
    bytes_sent: int = Field(..., description="发送字节数", alias="bytesSent")
    bytes_received: int = Field(..., description="接收字节数", alias="bytesReceived")
    packets_sent: int = Field(..., description="发送包数", alias="packetsSent")
    packets_received: int = Field(..., description="接收包数", alias="packetsReceived")

    class Config:
        populate_by_name = True


class SystemMetrics(BaseModel):
    """系统指标集合"""
    cpu: CpuMetrics = Field(..., description="CPU指标")
    memory: MemoryMetrics = Field(..., description="内存指标")
    disk: DiskMetrics = Field(..., description="磁盘指标")
    network: NetworkMetrics = Field(..., description="网络指标")


class SystemInfo(BaseModel):
    """系统信息"""
    hostname: str = Field(..., description="主机名")
    platform: str = Field(..., description="操作系统平台")
    uptime: int = Field(..., description="系统运行时间（秒）")
    process_uptime: int = Field(..., description="进程运行时间（秒）", alias="processUptime")

    class Config:
        populate_by_name = True


class ServiceHealthInfo(BaseModel):
    """服务健康信息"""
    name: str = Field(..., description="服务名称")
    status: ServiceStatus = Field(..., description="服务状态")
    response_time: int = Field(..., description="响应时间（毫秒）", alias="responseTime")
    uptime: int = Field(..., description="运行时间（秒）")

    class Config:
        populate_by_name = True


class CurrentMonitoringResponse(BaseModel):
    """当前监控数据响应"""
    metrics: SystemMetrics = Field(..., description="系统指标")
    services: List[ServiceHealthInfo] = Field(..., description="服务健康状态")
    system: SystemInfo = Field(..., description="系统信息")
    timestamp: datetime = Field(..., description="数据时间戳")


class MetricDataPoint(BaseModel):
    """指标数据点"""
    timestamp: datetime = Field(..., description="时间戳")
    value: float = Field(..., description="指标值")


class MetricHistory(BaseModel):
    """指标历史数据"""
    cpu_usage: List[MetricDataPoint] = Field(..., description="CPU使用率历史", alias="cpuUsage")
    memory_usage: List[MetricDataPoint] = Field(..., description="内存使用率历史", alias="memoryUsage")
    disk_usage: List[MetricDataPoint] = Field(..., description="磁盘使用率历史", alias="diskUsage")
    network_io: List[MetricDataPoint] = Field(..., description="网络IO历史", alias="networkIo")

    class Config:
        populate_by_name = True
