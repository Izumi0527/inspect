"""
设备管理相关数据模型
"""
from datetime import datetime
from typing import Optional, List
from sqlalchemy import (
    Column, Integer, String, Boolean, DateTime, Text, Float,
    ForeignKey, JSON, Enum, Index, BigInteger
)
from sqlalchemy.orm import relationship, Mapped, mapped_column
from sqlalchemy.sql import func
import enum

from src.core.database import Base

class DeviceStatus(str, enum.Enum):
    """设备状态枚举"""
    ONLINE = "online"
    OFFLINE = "offline"
    UNKNOWN = "unknown"
    MAINTENANCE = "maintenance"

class DeviceType(str, enum.Enum):
    """设备类型枚举"""
    SWITCH = "switch"
    ROUTER = "router"
    FIREWALL = "firewall"
    SERVER = "server"
    PRINTER = "printer"
    AP = "ap"  # Access Point
    UNKNOWN = "unknown"

class DeviceVendor(str, enum.Enum):
    """设备厂商枚举"""
    CISCO = "cisco"
    HUAWEI = "huawei"
    H3C = "h3c"
    JUNIPER = "juniper"
    HP = "hp"
    DELL = "dell"
    FORTINET = "fortinet"
    CHECKPOINT = "checkpoint"
    OTHER = "other"

class Device(Base):
    """设备模型"""
    __tablename__ = 'devices'
    
    # 基础字段
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    
    # 网络信息
    ip_address: Mapped[str] = mapped_column(String(45), nullable=False, unique=True, index=True)
    mac_address: Mapped[Optional[str]] = mapped_column(String(17), nullable=True)
    hostname: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    
    # 设备信息
    device_type: Mapped[str] = mapped_column(String(20), nullable=False, default='unknown', index=True)
    vendor: Mapped[str] = mapped_column(String(20), nullable=False, default='other')
    model: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    serial_number: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    firmware_version: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    
    # 物理位置
    location: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    
    # 连接配置
    snmp_community: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    snmp_version: Mapped[str] = mapped_column(String(10), default="2c", nullable=False)
    snmp_port: Mapped[int] = mapped_column(Integer, default=161, nullable=False)
    ssh_username: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    ssh_password: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)  # 加密存储
    ssh_port: Mapped[int] = mapped_column(Integer, default=22, nullable=False)
    
    # 状态信息
    status: Mapped[str] = mapped_column(String(20), default='unknown', nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_monitored: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    
    # 连接状态（探测结果）
    icmp_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # online/offline
    snmp_status: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)  # success/failed/not_configured
    last_probe_time: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)  # 最后探测时间
    
    # 性能信息
    cpu_usage: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    memory_usage: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    temperature: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    uptime: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # 秒
    
    # 连接信息
    response_time: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # 毫秒
    last_seen: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    
    # 告警统计
    alert_count: Mapped[Optional[int]] = mapped_column(Integer, default=0, nullable=True)  # 活跃告警数量
    
    # 时间字段
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)
    
    # 外键
    group_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('device_groups.id'), nullable=True)
    created_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey('users.id'), nullable=True)
    
    # 其他信息
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    tags: Mapped[Optional[str]] = mapped_column(JSON, nullable=True)  # JSON格式标签
    
    # 关系
    group = relationship("DeviceGroup", back_populates="devices")
    created_by_user = relationship("User", back_populates="created_devices")
    inspections = relationship("Inspection", back_populates="device")
    interfaces = relationship("DeviceInterface", back_populates="device")
    monitoring_data = relationship("DeviceMetric", back_populates="device")
    alerts = relationship("Alert", back_populates="device")
    logs = relationship("DeviceLog", back_populates="device")
    
    # 索引
    __table_args__ = (
        Index('idx_device_type_status', device_type, status),
        Index('idx_device_group_id', group_id),
        Index('idx_device_last_seen', last_seen),
    )
    
    def __repr__(self):
        return f"<Device(id={self.id}, name='{self.name}', ip='{self.ip_address}')>"

class DeviceGroup(Base):
    """设备组模型"""
    __tablename__ = 'device_groups'
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # 组织信息
    parent_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('device_groups.id'), nullable=True)
    level: Mapped[int] = mapped_column(Integer, default=0, nullable=False)  # 组织层级
    path: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)  # 路径，如 "/1/2/3"
    
    # 状态字段
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    
    # 时间字段
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)
    
    # 关系
    devices = relationship("Device", back_populates="group")
    parent = relationship("DeviceGroup", remote_side=[id], back_populates="children")
    children = relationship("DeviceGroup", back_populates="parent")
    
    def __repr__(self):
        return f"<DeviceGroup(id={self.id}, name='{self.name}')>"

class DeviceInterface(Base):
    """设备接口模型"""
    __tablename__ = 'device_interfaces'

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    device_id: Mapped[int] = mapped_column(Integer, ForeignKey('devices.id', ondelete='CASCADE'), nullable=False)

    # 接口信息
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    alias: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    description: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)

    # 网络配置
    mac_address: Mapped[Optional[str]] = mapped_column(String(17), nullable=True)
    ip_address: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    subnet_mask: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)

    # 状态信息
    is_up: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    admin_status: Mapped[Optional[str]] = mapped_column(String(20), default='down', nullable=True)  # up/down
    oper_status: Mapped[Optional[str]] = mapped_column(String(20), default='down', nullable=True)   # up/down
    speed: Mapped[Optional[int]] = mapped_column(BigInteger, nullable=True)  # bps
    mtu: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    # 统计信息
    in_octets: Mapped[Optional[int]] = mapped_column(BigInteger, default=0, nullable=True)
    out_octets: Mapped[Optional[int]] = mapped_column(BigInteger, default=0, nullable=True)
    in_errors: Mapped[Optional[int]] = mapped_column(BigInteger, default=0, nullable=True)
    out_errors: Mapped[Optional[int]] = mapped_column(BigInteger, default=0, nullable=True)

    # 时间字段
    last_updated: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)

    # 关系
    device = relationship("Device", back_populates="interfaces")

    # 索引
    __table_args__ = (
        Index('idx_interface_device_id', device_id),
        Index('idx_interface_name', device_id, name),
    )

    def __repr__(self):
        return f"<DeviceInterface(id={self.id}, device_id={self.device_id}, name='{self.name}')>"

class DeviceMetric(Base):
    """设备监控指标数据模型（时序数据）"""
    __tablename__ = 'device_metrics'
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    device_id: Mapped[int] = mapped_column(Integer, ForeignKey('devices.id', ondelete='CASCADE'), nullable=False)
    
    # 指标信息
    metric_name: Mapped[str] = mapped_column(String(100), nullable=False)
    metric_value: Mapped[float] = mapped_column(Float, nullable=False)
    unit: Mapped[Optional[str]] = mapped_column("metric_unit", String(20), nullable=True)
    interface_name: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    tags: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)
    
    # 时间字段
    # 数据库字段为 collected_at，这里保持 Python 属性名为 timestamp 以兼容现有调用
    timestamp: Mapped[datetime] = mapped_column(
        "collected_at", DateTime, default=func.now(), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
    
    # 关系
    device = relationship("Device", back_populates="monitoring_data")
    
    # 索引
    __table_args__ = (
        Index('idx_metric_device_time', device_id, timestamp),
        Index('idx_metric_name_time', metric_name, timestamp),
    )
    
    def __repr__(self):
        return f"<DeviceMetric(id={self.id}, device_id={self.device_id}, metric='{self.metric_name}')>"

class NetworkScan(Base):
    """网络扫描记录模型"""
    __tablename__ = 'network_scans'
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    scan_id: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    
    # 扫描信息
    target_network: Mapped[str] = mapped_column(String(50), nullable=False)
    scan_type: Mapped[str] = mapped_column(String(20), nullable=False)  # ping, tcp, full
    
    # 扫描配置
    port_scan: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    snmp_scan: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    deep_scan: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    
    # 状态信息
    status: Mapped[str] = mapped_column(String(20), nullable=False)  # running, completed, failed
    
    # 结果统计
    total_hosts_scanned: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    devices_found: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    
    # 错误信息
    error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # 时间字段
    started_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), nullable=False)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
    
    # 创建者
    created_by: Mapped[Optional[str]] = mapped_column(String(36), ForeignKey('users.id'), nullable=True)
    
    # 关系
    discovered_devices = relationship("DiscoveredDevice", back_populates="scan")
    
    # 索引
    __table_args__ = (
        Index('idx_scan_status', status),
        Index('idx_scan_started_at', started_at),
    )
    
    def __repr__(self):
        return f"<NetworkScan(id={self.id}, scan_id='{self.scan_id}', target='{self.target_network}')>"

class DiscoveredDevice(Base):
    """扫描发现的设备模型"""
    __tablename__ = 'discovered_devices'
    
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    scan_id: Mapped[int] = mapped_column(Integer, ForeignKey('network_scans.id', ondelete='CASCADE'), nullable=False)
    
    # 设备信息
    ip_address: Mapped[str] = mapped_column(String(45), nullable=False)
    mac_address: Mapped[Optional[str]] = mapped_column(String(17), nullable=True)
    hostname: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    
    # 识别信息
    vendor: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    device_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    os_info: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    
    # 网络信息
    open_ports: Mapped[Optional[str]] = mapped_column(JSON, nullable=True)  # JSON格式端口列表
    services: Mapped[Optional[str]] = mapped_column(JSON, nullable=True)    # JSON格式服务信息
    response_time: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    
    # SNMP信息
    snmp_available: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    snmp_info: Mapped[Optional[str]] = mapped_column(JSON, nullable=True)  # JSON格式SNMP信息
    
    # 状态
    is_imported: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    imported_device_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey('devices.id'), nullable=True)
    
    # 时间字段
    discovered_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), nullable=False)
    
    # 关系
    scan = relationship("NetworkScan", back_populates="discovered_devices")
    
    # 索引
    __table_args__ = (
        Index('idx_discovered_scan_id', scan_id),
        Index('idx_discovered_ip', ip_address),
    )
    
    def __repr__(self):
        return f"<DiscoveredDevice(id={self.id}, ip='{self.ip_address}', vendor='{self.vendor}')>"
