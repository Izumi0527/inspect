"""
设备管理模块 - 数据模式定义
"""
from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import Field, field_validator

from src.shared.base_schema import BaseSchema, TimestampMixin, IDMixin, PaginatedResponse


class DeviceCreate(BaseSchema):
    """创建设备请求"""
    name: str = Field(..., min_length=1, max_length=100, description="设备名称")
    ip_address: str = Field(..., description="IP地址")
    device_type: str = Field(..., description="设备类型: router, switch, firewall, server")
    vendor: str = Field(..., description="厂商: cisco, huawei, h3c, juniper")
    model: Optional[str] = Field(None, max_length=100, description="设备型号")
    location: Optional[str] = Field(None, max_length=200, description="位置")
    group_id: Optional[int] = Field(None, description="设备组ID")
    snmp_community: Optional[str] = Field("public", description="SNMP Community")
    # 数据库约束 ck_devices_snmp_version 只允许 '1'/'2c'/'3'，这里默认用 '2c'
    snmp_version: str = Field("2c", description="SNMP版本: 1, 2c, 3")
    ssh_username: Optional[str] = Field(None, description="SSH用户名")
    ssh_password: Optional[str] = Field(None, description="SSH密码")
    ssh_port: Optional[int] = Field(22, ge=1, le=65535, description="SSH端口")
    description: Optional[str] = Field(None, max_length=500, description="描述")
    tags: Optional[Dict[str, Any]] = Field(None, description="标签")

    @field_validator("snmp_version", mode="before")
    @classmethod
    def normalize_snmp_version(cls, v: Any):
        """规范化 SNMP 版本输入，兼容 'v2c'/'v3' 等写法并落到数据库可接受值。"""
        if v is None:
            return v
        if isinstance(v, str):
            normalized = v.strip().lower()
            version_map = {
                "v1": "1",
                "1": "1",
                "v2c": "2c",
                "2c": "2c",
                "v3": "3",
                "3": "3",
            }
            return version_map.get(normalized, v)
        return v


class DeviceUpdate(BaseSchema):
    """更新设备请求"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    ip_address: Optional[str] = None
    device_type: Optional[str] = None
    vendor: Optional[str] = None
    model: Optional[str] = None
    location: Optional[str] = None
    group_id: Optional[int] = None
    snmp_community: Optional[str] = None
    snmp_version: Optional[str] = None
    ssh_username: Optional[str] = None
    ssh_password: Optional[str] = None
    ssh_port: Optional[int] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    tags: Optional[Dict[str, Any]] = None

    @field_validator("snmp_version", mode="before")
    @classmethod
    def normalize_snmp_version(cls, v: Any):
        """与 DeviceCreate 保持一致：兼容输入并落到数据库可接受值。"""
        if v is None:
            return v
        if isinstance(v, str):
            normalized = v.strip().lower()
            version_map = {
                "v1": "1",
                "1": "1",
                "v2c": "2c",
                "2c": "2c",
                "v3": "3",
                "3": "3",
            }
            return version_map.get(normalized, v)
        return v


class DeviceResponse(BaseSchema, IDMixin, TimestampMixin):
    """设备响应"""
    name: str
    ip_address: str
    device_type: str
    vendor: str
    model: Optional[str] = None
    location: Optional[str] = None
    group_id: Optional[int] = None
    status: str = "unknown"
    last_seen: Optional[datetime] = None
    is_active: bool = True
    created_by: Optional[str] = None
    snmp_community: Optional[str] = None
    snmp_version: Optional[str] = None
    snmp_port: Optional[int] = None
    ssh_username: Optional[str] = None
    ssh_port: Optional[int] = None
    tags: Optional[Any] = None  # 支持字典或列表格式
    description: Optional[str] = None
    # 探测状态字段
    icmp_status: Optional[str] = None  # online/offline
    snmp_status: Optional[str] = None  # success/failed/not_configured
    response_time: Optional[float] = None  # 响应时间（毫秒）
    last_probe_time: Optional[datetime] = None  # 最后探测时间
    # 性能指标字段
    cpu_usage: Optional[float] = None  # CPU使用率
    memory_usage: Optional[float] = None  # 内存使用率
    temperature: Optional[float] = None  # 温度
    uptime: Optional[int] = None  # 运行时间（秒）
    # 告警统计字段
    alert_count: Optional[int] = None  # 活跃告警数量


class DeviceListResponse(PaginatedResponse[DeviceResponse]):
    """设备列表响应"""
    pass


class DeviceGroupResponse(BaseSchema, IDMixin):
    """设备组响应"""
    name: str
    description: Optional[str] = None
    device_count: int = 0
    created_at: datetime


class DeviceGroupCreate(BaseSchema):
    """创建设备组请求"""
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = Field(None, max_length=500)


# 网络扫描相关
class NetworkScanRequest(BaseSchema):
    """网络扫描请求"""
    target_network: str = Field(..., description="目标网段，如 192.168.1.0/24")
    scan_type: str = Field("ping", description="扫描类型: ping, tcp, full")
    port_scan: bool = Field(False, description="是否进行端口扫描")
    snmp_scan: bool = Field(False, description="是否进行SNMP扫描")
    deep_scan: bool = Field(False, description="是否进行深度扫描")


class NetworkScanResponse(BaseSchema):
    """网络扫描响应"""
    scan_id: str
    message: str
    target_network: str
    scan_type: str
    status: str


class ScanResultResponse(BaseSchema):
    """扫描结果响应"""
    scan_id: str
    target_network: str
    scan_type: str
    status: str
    started_at: datetime
    completed_at: Optional[datetime] = None
    devices_found: int
    total_hosts_scanned: int
    error_message: Optional[str] = None


class DiscoveredDeviceResponse(BaseSchema):
    """发现设备响应"""
    ip_address: str
    hostname: Optional[str] = None
    mac_address: Optional[str] = None
    vendor: Optional[str] = None
    device_type: Optional[str] = None
    open_ports: List[int] = []
    services: Dict[str, Any] = {}
    response_time: Optional[float] = None
    last_seen: Optional[datetime] = None
    os_info: Optional[str] = None
    snmp_available: bool = False


# 批量操作相关
class DeviceBatchImportRequest(BaseSchema):
    """批量导入设备请求"""
    devices: List[DeviceCreate]
    auto_detect: bool = True
    skip_duplicates: bool = True


class DeviceBatchImportResponse(BaseSchema):
    """批量导入设备响应"""
    message: str
    imported_count: int
    skipped_count: int
    imported_devices: List[DeviceResponse] = []
    skipped_devices: List[Dict[str, str]] = []


class DeviceStatistics(BaseSchema):
    """设备统计信息"""
    total_devices: int
    online_devices: int
    offline_devices: int
    unknown_devices: int
    type_distribution: Dict[str, int]



# 设备探测相关
class DeviceProbeResponse(BaseSchema):
    """设备探测响应"""
    device_id: int
    ip_address: str
    # ICMP 探测结果
    icmp_reachable: bool
    icmp_response_time: Optional[float] = None
    icmp_error: Optional[str] = None
    # SNMP 探测结果
    snmp_reachable: bool = False
    snmp_response_time: Optional[float] = None
    snmp_error: Optional[str] = None
    snmp_system_info: Optional[str] = None
    # 探测时间
    probed_at: datetime


class DeviceBatchProbeRequest(BaseSchema):
    """批量探测设备请求"""
    device_ids: List[int] = Field(..., min_length=1, description="设备ID列表")
    max_concurrent: int = Field(20, ge=1, le=50, description="最大并发数")


class DeviceBatchProbeResponse(BaseSchema):
    """批量探测设备响应"""
    total: int
    probed: int
    results: List[DeviceProbeResponse]
