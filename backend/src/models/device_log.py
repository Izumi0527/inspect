"""
设备日志相关数据模型
"""
from datetime import datetime
from typing import Optional
from sqlalchemy import (
    Column, Integer, String, DateTime, Text, Boolean,
    ForeignKey, Index, Enum
)
from sqlalchemy.orm import relationship, Mapped, mapped_column
from sqlalchemy.sql import func
import enum

from src.core.database import Base


class LogLevel(str, enum.Enum):
    """日志级别枚举"""
    DEBUG = "debug"
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


class LogFacility(str, enum.Enum):
    """日志设施枚举"""
    SYSTEM = "system"
    INTERFACE = "interface"
    SECURITY = "security"
    ROUTING = "routing"
    SWITCHING = "switching"
    SNMP = "snmp"
    SSH = "ssh"
    OTHER = "other"


class LogSource(str, enum.Enum):
    """日志来源枚举"""
    SYSLOG = "syslog"
    SSH = "ssh"
    SNMP_TRAP = "snmp_trap"
    FILE = "file"
    API = "api"


class DeviceLog(Base):
    """设备日志模型"""
    __tablename__ = 'device_logs'
    
    # 基础字段
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    device_id: Mapped[int] = mapped_column(Integer, ForeignKey('devices.id', ondelete='CASCADE'), nullable=False)
    
    # 日志信息
    level: Mapped[str] = mapped_column(String(20), nullable=False, default='info')
    facility: Mapped[str] = mapped_column(String(50), nullable=False, default='system')
    source: Mapped[str] = mapped_column(String(20), nullable=False, default='syslog')
    
    # 日志内容
    message: Mapped[str] = mapped_column(Text, nullable=False)
    raw_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # 来源信息
    source_ip: Mapped[Optional[str]] = mapped_column(String(45), nullable=True)
    source_process: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    
    # 时间信息
    log_timestamp: Mapped[datetime] = mapped_column(DateTime, nullable=False)  # 日志原始时间
    collected_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), nullable=False)  # 采集时间
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), nullable=False)
    
    # 关系
    device = relationship("Device", back_populates="logs")
    
    # 索引
    __table_args__ = (
        Index('idx_device_logs_device_id', device_id),
        Index('idx_device_logs_level', level),
        Index('idx_device_logs_facility', facility),
        Index('idx_device_logs_timestamp', log_timestamp),
        Index('idx_device_logs_collected_at', collected_at),
        Index('idx_device_logs_device_level_time', device_id, level, log_timestamp),
    )
    
    def __repr__(self):
        return f"<DeviceLog(id={self.id}, device_id={self.device_id}, level='{self.level}')>"


class LogParsingRule(Base):
    """日志解析规则模型"""
    __tablename__ = 'log_parsing_rules'
    
    # 基础字段
    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    
    # 规则配置
    vendor: Mapped[str] = mapped_column(String(50), nullable=False)  # 设备厂商
    device_type: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # 设备类型
    pattern: Mapped[str] = mapped_column(Text, nullable=False)  # 正则表达式模式
    
    # 字段映射
    level_mapping: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON格式的级别映射
    facility_mapping: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # JSON格式的设施映射
    
    # 状态
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    priority: Mapped[int] = mapped_column(Integer, default=100, nullable=False)  # 优先级，数字越小优先级越高
    
    # 时间字段
    created_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=func.now(), onupdate=func.now(), nullable=False)
    
    # 索引
    __table_args__ = (
        Index('idx_log_parsing_rules_vendor', vendor),
        Index('idx_log_parsing_rules_active', is_active),
        Index('idx_log_parsing_rules_priority', priority),
    )
    
    def __repr__(self):
        return f"<LogParsingRule(id={self.id}, name='{self.name}', vendor='{self.vendor}')>"