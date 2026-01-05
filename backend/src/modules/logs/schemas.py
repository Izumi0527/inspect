"""
日志管理模块 - Pydantic模式定义

定义日志相关的请求和响应模式
"""
from datetime import datetime
from typing import Optional, List, Dict, Any, Union
from enum import Enum
from pydantic import BaseModel, Field

from src.shared.base_schema import BaseSchema, PaginatedResponse


# ============= 基础模式 =============

class LogResponse(BaseSchema):
    """日志响应模式"""
    id: int
    device_id: int
    level: str = Field(..., description="日志级别")
    facility: str = Field(..., description="设施类型")
    source: str = Field(..., description="日志来源")
    message: str = Field(..., description="日志消息")
    raw_message: Optional[str] = Field(None, description="原始日志消息")
    source_ip: Optional[str] = Field(None, description="来源IP地址")
    source_process: Optional[str] = Field(None, description="来源进程")
    log_timestamp: Optional[datetime] = Field(None, description="日志时间戳")
    collected_at: datetime = Field(..., description="采集时间")
    created_at: datetime = Field(..., description="创建时间")


class LogListResponse(PaginatedResponse[LogResponse]):
    """日志列表响应"""
    logs: List[LogResponse] = Field(..., description="日志列表")


# ============= 日志采集相关 =============

class LogCollectionRequest(BaseSchema):
    """日志采集请求"""
    log_type: str = Field("system", description="日志类型")
    max_entries: int = Field(100, ge=1, le=1000, description="最大采集条目数")


class LogCollectionResponse(BaseSchema):
    """日志采集响应"""
    message: str = Field(..., description="响应消息")
    device_id: Optional[int] = Field(None, description="设备ID")
    device_ids: Optional[List[int]] = Field(None, description="设备ID列表")
    log_type: str = Field(..., description="日志类型")
    status: str = Field(..., description="任务状态")


# ============= 日志统计相关 =============

class LogStatisticsResponse(BaseSchema):
    """日志统计响应"""
    total_logs: int = Field(..., description="总日志数")
    by_level: Dict[str, int] = Field(..., description="按级别统计")
    by_facility: Dict[str, int] = Field(..., description="按设施统计")
    by_device: Dict[int, int] = Field(..., description="按设备统计")
    trends: Dict[str, int] = Field(..., description="时间趋势")
    time_range_hours: int = Field(..., description="统计时间范围（小时）")


# ============= 日志解析规则相关 =============

class LogParsingRuleCreate(BaseSchema):
    """创建日志解析规则请求"""
    name: str = Field(..., min_length=1, max_length=100, description="规则名称")
    description: Optional[str] = Field(None, description="规则描述")
    vendor: str = Field(..., description="设备厂商")
    device_type: Optional[str] = Field(None, description="设备类型")
    pattern: str = Field(..., description="正则表达式模式")
    level_mapping: Optional[str] = Field(None, description="级别映射（JSON格式）")
    facility_mapping: Optional[str] = Field(None, description="设施映射（JSON格式）")
    priority: int = Field(100, ge=1, le=1000, description="优先级")


class LogParsingRuleUpdate(BaseSchema):
    """更新日志解析规则请求"""
    name: Optional[str] = Field(None, min_length=1, max_length=100, description="规则名称")
    description: Optional[str] = Field(None, description="规则描述")
    vendor: Optional[str] = Field(None, description="设备厂商")
    device_type: Optional[str] = Field(None, description="设备类型")
    pattern: Optional[str] = Field(None, description="正则表达式模式")
    level_mapping: Optional[str] = Field(None, description="级别映射（JSON格式）")
    facility_mapping: Optional[str] = Field(None, description="设施映射（JSON格式）")
    priority: Optional[int] = Field(None, ge=1, le=1000, description="优先级")
    is_active: Optional[bool] = Field(None, description="是否启用")


class LogParsingRuleResponse(BaseSchema):
    """日志解析规则响应"""
    id: int
    name: str = Field(..., description="规则名称")
    description: Optional[str] = Field(None, description="规则描述")
    vendor: str = Field(..., description="设备厂商")
    device_type: Optional[str] = Field(None, description="设备类型")
    pattern: str = Field(..., description="正则表达式模式")
    level_mapping: Optional[str] = Field(None, description="级别映射")
    facility_mapping: Optional[str] = Field(None, description="设施映射")
    is_active: bool = Field(..., description="是否启用")
    priority: int = Field(..., description="优先级")
    created_at: datetime = Field(..., description="创建时间")
    updated_at: datetime = Field(..., description="更新时间")


class LogParsingRuleListResponse(PaginatedResponse[LogParsingRuleResponse]):
    """日志解析规则列表响应"""
    rules: List[LogParsingRuleResponse] = Field(..., description="规则列表")


# ============= 日志级别和设施枚举 =============

class LogLevelEnum(str, Enum):
    """日志级别枚举"""
    DEBUG = "debug"
    INFO = "info"
    WARNING = "warning"
    ERROR = "error"
    CRITICAL = "critical"


class LogFacilityEnum(str, Enum):
    """日志设施枚举"""
    SYSTEM = "system"
    INTERFACE = "interface"
    SECURITY = "security"
    ROUTING = "routing"
    SWITCHING = "switching"
    SNMP = "snmp"
    SSH = "ssh"
    OTHER = "other"


class LogSourceEnum(str, Enum):
    """日志来源枚举"""
    SYSLOG = "syslog"
    SSH = "ssh"
    SNMP_TRAP = "snmp_trap"
    FILE = "file"
    API = "api"