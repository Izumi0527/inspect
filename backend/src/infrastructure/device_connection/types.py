"""
设备连接相关的数据类型和枚举定义
"""
from enum import Enum
from dataclasses import dataclass
from typing import Optional, Dict, Any, List
from datetime import datetime
import json


class DeviceConnectionType(str, Enum):
    """设备连接类型枚举"""
    SNMP = "snmp"
    SSH = "ssh"
    TELNET = "telnet"
    HTTP = "http"


@dataclass
class SNMPConfig:
    """SNMP连接配置"""
    ip: str
    community: str = "public"
    version: str = "2c"
    port: int = 161
    timeout: int = 5
    retries: int = 1
    
    # SNMP v3 专用配置
    username: Optional[str] = None
    auth_protocol: Optional[str] = None
    auth_password: Optional[str] = None
    priv_protocol: Optional[str] = None
    priv_password: Optional[str] = None
    security_level: str = "noAuthNoPriv"
    
    def __post_init__(self):
        """初始化后验证配置"""
        if self.version == "3":
            if not self.username:
                raise ValueError("SNMP v3 requires username")
            
            valid_levels = ["noAuthNoPriv", "authNoPriv", "authPriv"]
            if self.security_level not in valid_levels:
                self.security_level = "noAuthNoPriv"
            
            if self.security_level in ["authNoPriv", "authPriv"]:
                if not self.auth_protocol or not self.auth_password:
                    raise ValueError("Auth security level requires auth_protocol and auth_password")
            
            if self.security_level == "authPriv":
                if not self.priv_protocol or not self.priv_password:
                    raise ValueError("Priv security level requires priv_protocol and priv_password")


@dataclass
class SSHConfig:
    """SSH连接配置"""
    host: str
    username: str
    password: str
    port: int = 22
    timeout: int = 30
    device_type: str = "cisco_ios"


@dataclass
class DeviceInfo:
    """设备信息域模型"""
    id: int
    name: str
    ip_address: str
    vendor: str
    device_type: str
    model: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None
    
    # SNMP配置
    snmp_community: str = "public"
    snmp_version: str = "2c"
    snmp_port: int = 161
    
    # SNMP v3专用字段
    snmp_username: Optional[str] = None
    snmp_auth_protocol: Optional[str] = None
    snmp_auth_password: Optional[str] = None
    snmp_priv_protocol: Optional[str] = None
    snmp_priv_password: Optional[str] = None
    snmp_security_level: str = "noAuthNoPriv"
    
    # SSH配置
    ssh_username: Optional[str] = None
    ssh_password: Optional[str] = None
    ssh_port: int = 22
    
    # 状态信息
    status: str = "unknown"
    last_seen: Optional[datetime] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    
    # 扩展属性
    tags: Optional[Dict[str, Any]] = None
    custom_fields: Optional[Dict[str, Any]] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "id": self.id,
            "name": self.name,
            "ip_address": self.ip_address,
            "vendor": self.vendor,
            "device_type": self.device_type,
            "model": self.model,
            "location": self.location,
            "description": self.description,
            "snmp_community": self.snmp_community,
            "snmp_version": self.snmp_version,
            "snmp_port": self.snmp_port,
            "snmp_username": self.snmp_username,
            "snmp_auth_protocol": self.snmp_auth_protocol,
            "snmp_auth_password": self.snmp_auth_password,
            "snmp_priv_protocol": self.snmp_priv_protocol,
            "snmp_priv_password": self.snmp_priv_password,
            "snmp_security_level": self.snmp_security_level,
            "ssh_username": self.ssh_username,
            "ssh_password": self.ssh_password,
            "ssh_port": self.ssh_port,
            "status": self.status,
            "last_seen": self.last_seen.isoformat() if self.last_seen else None,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "updated_at": self.updated_at.isoformat() if self.updated_at else None,
            "tags": self.tags or {},
            "custom_fields": self.custom_fields or {},
        }
    
    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "DeviceInfo":
        """从字典创建实例"""
        for date_field in ["last_seen", "created_at", "updated_at"]:
            if data.get(date_field) and isinstance(data[date_field], str):
                data[date_field] = datetime.fromisoformat(data[date_field])

        tags = data.get("tags")
        if isinstance(tags, str):
            try:
                data["tags"] = json.loads(tags)
            except (ValueError, json.JSONDecodeError):
                data["tags"] = {}
        
        return cls(**data)


@dataclass
class DeviceMetrics:
    """设备监控指标域模型"""
    device_id: int
    timestamp: datetime
    
    # 基础连通性
    connectivity: Dict[str, Any]
    response_time: float
    
    # 性能指标
    cpu_usage: Optional[float] = None
    memory_usage: Optional[float] = None
    temperature: Optional[float] = None
    uptime: Optional[int] = None
    
    # 网络指标
    packet_loss: Optional[float] = None
    bandwidth_utilization: Optional[float] = None
    throughput_in: Optional[float] = None
    throughput_out: Optional[float] = None
    
    # 接口信息
    interfaces: Optional[List[Dict[str, Any]]] = None
    
    # 错误统计
    error_count: Optional[int] = None
    warning_count: Optional[int] = None
    
    # 扩展指标
    custom_metrics: Optional[Dict[str, Any]] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "device_id": self.device_id,
            "timestamp": self.timestamp.isoformat(),
            "connectivity": self.connectivity,
            "response_time": self.response_time,
            "cpu_usage": self.cpu_usage,
            "memory_usage": self.memory_usage,
            "temperature": self.temperature,
            "uptime": self.uptime,
            "packet_loss": self.packet_loss,
            "bandwidth_utilization": self.bandwidth_utilization,
            "throughput_in": self.throughput_in,
            "throughput_out": self.throughput_out,
            "interfaces": self.interfaces or [],
            "error_count": self.error_count,
            "warning_count": self.warning_count,
            "custom_metrics": self.custom_metrics or {}
        }


@dataclass 
class CheckResult:
    """检查结果数据模型"""
    check_item_name: str
    check_item_type: str
    status: str  # "pass", "fail", "warning", "error", "skip"
    expected_value: Optional[str] = None
    actual_value: Optional[str] = None
    message: str = ""
    execution_time: int = 0
    error_details: Optional[Dict[str, Any]] = None
    additional_info: Optional[Dict[str, Any]] = None
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "check_item_name": self.check_item_name,
            "check_item_type": self.check_item_type,
            "status": self.status,
            "expected_value": self.expected_value,
            "actual_value": self.actual_value,
            "message": self.message,
            "execution_time": self.execution_time,
            "error_details": self.error_details,
            "additional_info": self.additional_info
        }
