"""
设备性能采集服务

整合SNMP和SSH协议，提供真实的设备性能数据采集功能。
支持网络设备、服务器等多种设备类型的监控。
"""

import asyncio
import time
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional, Any, Union
from datetime import datetime, timezone
import structlog

from src.core.snmp import (
    SNMPClient, 
    SNMPVersion, 
    SNMPCredentials, 
    SNMPConfig,
    SNMPSecurityLevel,
    SNMPAuthProtocol,
    SNMPPrivProtocol,
    CommonOIDs,
    create_snmp_client
)
from src.models.device import DeviceType
from src.core.ssh import (
    SSHClient,
    SSHCredentials,
    SSHConfig,
    SSHAuthMethod,
    DeviceCommands,
    create_ssh_client
)

logger = structlog.get_logger()


class MonitoringProtocol(Enum):
    """监控协议"""
    SNMP = "snmp"
    SSH = "ssh"
    HTTP = "http"
    MIXED = "mixed"


@dataclass
class DeviceCredentials:
    """设备认证信息"""
    # SNMP 凭据
    snmp_version: Optional[SNMPVersion] = None
    snmp_community: Optional[str] = None
    snmp_username: Optional[str] = None
    snmp_security_level: Optional[SNMPSecurityLevel] = None
    snmp_auth_protocol: Optional[SNMPAuthProtocol] = None
    snmp_auth_key: Optional[str] = None
    snmp_priv_protocol: Optional[SNMPPrivProtocol] = None
    snmp_priv_key: Optional[str] = None
    
    # SSH 凭据
    ssh_username: Optional[str] = None
    ssh_password: Optional[str] = None
    ssh_private_key: Optional[str] = None
    ssh_auth_method: SSHAuthMethod = SSHAuthMethod.PASSWORD


@dataclass
class DeviceMonitoringConfig:
    """设备监控配置"""
    device_id: int
    device_name: str
    ip_address: str
    device_type: DeviceType
    protocols: List[MonitoringProtocol]
    credentials: DeviceCredentials
    snmp_port: int = 161
    ssh_port: int = 22
    timeout: float = 30.0
    enabled: bool = True
    
    def __post_init__(self):
        """后处理验证"""
        # 验证device_type是DeviceType枚举实例
        if not isinstance(self.device_type, DeviceType):
            if isinstance(self.device_type, str):
                # 尝试从字符串转换
                try:
                    self.device_type = DeviceType(self.device_type.lower())
                except ValueError:
                    self.device_type = DeviceType.UNKNOWN
            else:
                raise ValueError(f"Invalid device_type: {self.device_type} (type: {type(self.device_type)})")
        
        # 验证protocols是列表且包含MonitoringProtocol实例
        if not isinstance(self.protocols, list):
            self.protocols = []
        
        validated_protocols = []
        for protocol in self.protocols:
            if isinstance(protocol, MonitoringProtocol):
                validated_protocols.append(protocol)
            elif isinstance(protocol, str):
                try:
                    validated_protocols.append(MonitoringProtocol(protocol.upper()))
                except ValueError:
                    pass  # 忽略无效协议
        self.protocols = validated_protocols


@dataclass
class PerformanceMetric:
    """性能指标"""
    name: str
    value: Union[int, float, str]
    unit: Optional[str] = None
    timestamp: Optional[datetime] = None


@dataclass
class DeviceStatus:
    """设备状态"""
    device_id: int
    is_online: bool
    response_time: Optional[float] = None
    last_check: Optional[datetime] = None
    error_message: Optional[str] = None
    metrics: List[PerformanceMetric] = field(default_factory=list)


class DevicePerformanceCollector:
    """设备性能数据采集器"""

    def __init__(self):
        self.logger = logger.bind(component="performance_collector")

    async def collect_device_metrics(self, config: DeviceMonitoringConfig) -> DeviceStatus:
        """
        采集设备指标数据
        
        Args:
            config: 设备监控配置
            
        Returns:
            设备状态和性能指标
        """
        start_time = time.time()
        device_status = DeviceStatus(
            device_id=config.device_id,
            is_online=False,
            last_check=datetime.now(timezone.utc)
        )
        
        if not config.enabled:
            device_status.error_message = "设备监控已禁用"
            return device_status
        
        try:
            self.logger.debug(
                "开始采集设备指标",
                device_id=config.device_id,
                device_name=config.device_name,
                ip_address=config.ip_address,
                device_type=str(config.device_type),
                protocols=[str(p) for p in config.protocols]
            )
            
            # 根据支持的协议采集数据
            metrics = []
            
            if MonitoringProtocol.SNMP in config.protocols:
                self.logger.debug("尝试SNMP数据采集", device_id=config.device_id)
                snmp_metrics = await self._collect_snmp_metrics(config)
                if snmp_metrics:
                    metrics.extend(snmp_metrics)
                    device_status.is_online = True
                    self.logger.debug("SNMP采集成功", device_id=config.device_id, metrics_count=len(snmp_metrics))
                else:
                    self.logger.debug("SNMP采集失败", device_id=config.device_id)
            
            if MonitoringProtocol.SSH in config.protocols:
                self.logger.debug("尝试SSH数据采集", device_id=config.device_id)
                ssh_metrics = await self._collect_ssh_metrics(config)
                if ssh_metrics:
                    metrics.extend(ssh_metrics)
                    device_status.is_online = True
                    self.logger.debug("SSH采集成功", device_id=config.device_id, metrics_count=len(ssh_metrics))
                else:
                    self.logger.debug("SSH采集失败", device_id=config.device_id)
            
            device_status.metrics = metrics
            device_status.response_time = (time.time() - start_time) * 1000  # 转换为毫秒
            
            self.logger.info(
                "设备指标采集完成",
                device_id=config.device_id,
                metrics_count=len(metrics),
                response_time=device_status.response_time,
                is_online=device_status.is_online
            )
            
        except Exception as e:
            device_status.error_message = str(e)
            device_status.response_time = (time.time() - start_time) * 1000
            
            self.logger.error(
                "设备指标采集失败",
                device_id=config.device_id,
                device_name=config.device_name,
                error=str(e),
                error_type=type(e).__name__,
                config_type=str(config.device_type),
                exc_info=True
            )
        
        return device_status

    async def _collect_snmp_metrics(self, config: DeviceMonitoringConfig) -> List[PerformanceMetric]:
        """通过SNMP采集设备指标"""
        metrics = []
        
        try:
            # 创建SNMP客户端
            snmp_client = await self._create_snmp_client(config)
            
            async with snmp_client:
                # 测试连接
                connection_ok = await snmp_client.test_connection()
                if not connection_ok:
                    self.logger.warning(f"SNMP连接失败: {config.ip_address}")
                    return metrics
                
                # 采集系统基础信息
                system_metrics = await self._collect_system_info_snmp(snmp_client)
                metrics.extend(system_metrics)
                
                # 采集接口信息
                interface_metrics = await self._collect_interface_info_snmp(snmp_client)
                metrics.extend(interface_metrics)
                
                # 采集CPU和内存信息（如果支持）
                resource_metrics = await self._collect_resource_info_snmp(snmp_client)
                metrics.extend(resource_metrics)
                
        except Exception as e:
            self.logger.error(f"SNMP数据采集异常: {e}")
        
        return metrics

    async def _collect_ssh_metrics(self, config: DeviceMonitoringConfig) -> List[PerformanceMetric]:
        """通过SSH采集设备指标"""
        metrics = []
        
        try:
            # 创建SSH客户端
            ssh_client = await self._create_ssh_client(config)
            
            async with ssh_client:
                # 测试连接
                connection_ok = await ssh_client.test_connection()
                if not connection_ok:
                    self.logger.warning(f"SSH连接失败: {config.ip_address}")
                    return metrics
                
                # 根据设备类型选择命令
                if config.device_type in [DeviceType.SERVER]:
                    linux_metrics = await self._collect_linux_metrics_ssh(ssh_client)
                    metrics.extend(linux_metrics)
                elif config.device_type in [DeviceType.ROUTER, DeviceType.SWITCH]:
                    network_metrics = await self._collect_network_device_metrics_ssh(ssh_client, config.device_type)
                    metrics.extend(network_metrics)
                
        except Exception as e:
            self.logger.error(f"SSH数据采集异常: {e}")
        
        return metrics

    async def _create_snmp_client(self, config: DeviceMonitoringConfig) -> SNMPClient:
        """创建SNMP客户端"""
        creds = config.credentials
        
        return await create_snmp_client(
            host=config.ip_address,
            port=config.snmp_port,
            version=creds.snmp_version or SNMPVersion.V2C,
            community=creds.snmp_community or "public",
            username=creds.snmp_username,
            security_level=creds.snmp_security_level,
            auth_protocol=creds.snmp_auth_protocol,
            auth_key=creds.snmp_auth_key,
            priv_protocol=creds.snmp_priv_protocol,
            priv_key=creds.snmp_priv_key,
            timeout=config.timeout
        )

    async def _create_ssh_client(self, config: DeviceMonitoringConfig) -> SSHClient:
        """创建SSH客户端"""
        creds = config.credentials
        
        return await create_ssh_client(
            host=config.ip_address,
            username=creds.ssh_username,
            password=creds.ssh_password,
            private_key_path=creds.ssh_private_key,
            port=config.ssh_port,
            timeout=config.timeout,
            auth_method=creds.ssh_auth_method
        )

    async def _collect_system_info_snmp(self, snmp_client: SNMPClient) -> List[PerformanceMetric]:
        """采集系统基础信息（SNMP）"""
        metrics = []
        timestamp = datetime.now(timezone.utc)
        
        try:
            # 获取系统基础信息
            oids = [
                CommonOIDs.SYS_DESCR,    # 系统描述
                CommonOIDs.SYS_UPTIME,  # 系统运行时间
                CommonOIDs.SYS_NAME,    # 系统名称
            ]
            
            results = await snmp_client.get(oids)
            
            for result in results:
                if result.error:
                    continue
                    
                if result.oid == CommonOIDs.SYS_DESCR:
                    metrics.append(PerformanceMetric(
                        name="system_description",
                        value=result.value,
                        timestamp=timestamp
                    ))
                elif result.oid == CommonOIDs.SYS_UPTIME:
                    # 转换为秒数
                    uptime_ticks = int(result.value)
                    uptime_seconds = uptime_ticks / 100  # SNMP ticks to seconds
                    metrics.append(PerformanceMetric(
                        name="system_uptime",
                        value=uptime_seconds,
                        unit="seconds",
                        timestamp=timestamp
                    ))
                elif result.oid == CommonOIDs.SYS_NAME:
                    metrics.append(PerformanceMetric(
                        name="system_name",
                        value=result.value,
                        timestamp=timestamp
                    ))
                    
        except Exception as e:
            self.logger.error(f"采集系统信息失败: {e}")
        
        return metrics

    async def _collect_interface_info_snmp(self, snmp_client: SNMPClient) -> List[PerformanceMetric]:
        """采集接口信息（SNMP）"""
        metrics = []
        timestamp = datetime.now(timezone.utc)
        
        try:
            # 获取接口数量
            if_number_results = await snmp_client.get([CommonOIDs.IF_NUMBER])
            if if_number_results and not if_number_results[0].error:
                interface_count = int(if_number_results[0].value)
                metrics.append(PerformanceMetric(
                    name="interface_count",
                    value=interface_count,
                    timestamp=timestamp
                ))
                
                # 获取接口状态统计
                if_status_results = await snmp_client.walk(CommonOIDs.IF_OPER_STATUS)
                
                online_interfaces = 0
                offline_interfaces = 0
                
                for result in if_status_results:
                    if not result.error:
                        status = int(result.value)
                        if status == 1:  # up
                            online_interfaces += 1
                        else:  # down or testing
                            offline_interfaces += 1
                
                metrics.extend([
                    PerformanceMetric(
                        name="interfaces_online",
                        value=online_interfaces,
                        timestamp=timestamp
                    ),
                    PerformanceMetric(
                        name="interfaces_offline", 
                        value=offline_interfaces,
                        timestamp=timestamp
                    )
                ])
            
            # 采集接口流量统计（前5个接口）
            traffic_metrics = await self._collect_interface_traffic_snmp(snmp_client)
            metrics.extend(traffic_metrics)
            
        except Exception as e:
            self.logger.error(f"采集接口信息失败: {e}")
        
        return metrics

    async def _collect_interface_traffic_snmp(self, snmp_client: SNMPClient) -> List[PerformanceMetric]:
        """采集接口流量统计"""
        metrics = []
        timestamp = datetime.now(timezone.utc)
        
        try:
            # 获取接口入口和出口字节数
            in_octets_results = await snmp_client.walk(CommonOIDs.IF_IN_OCTETS)
            out_octets_results = await snmp_client.walk(CommonOIDs.IF_OUT_OCTETS)
            
            total_in_bytes = 0
            total_out_bytes = 0
            
            for result in in_octets_results[:5]:  # 只统计前5个接口
                if not result.error:
                    total_in_bytes += int(result.value)
            
            for result in out_octets_results[:5]:  # 只统计前5个接口
                if not result.error:
                    total_out_bytes += int(result.value)
            
            metrics.extend([
                PerformanceMetric(
                    name="network_bytes_in",
                    value=total_in_bytes,
                    unit="bytes",
                    timestamp=timestamp
                ),
                PerformanceMetric(
                    name="network_bytes_out",
                    value=total_out_bytes,
                    unit="bytes",
                    timestamp=timestamp
                )
            ])
            
        except Exception as e:
            self.logger.error(f"采集接口流量失败: {e}")
        
        return metrics

    async def _collect_resource_info_snmp(self, snmp_client: SNMPClient) -> List[PerformanceMetric]:
        """采集CPU和内存资源信息"""
        metrics = []
        timestamp = datetime.now(timezone.utc)
        
        try:
            # 尝试获取CPU负载（需要设备支持HOST-RESOURCES-MIB）
            cpu_results = await snmp_client.walk(CommonOIDs.HR_PROCESSOR_LOAD)
            if cpu_results and not cpu_results[0].error:
                cpu_loads = [int(r.value) for r in cpu_results if not r.error]
                if cpu_loads:
                    avg_cpu_load = sum(cpu_loads) / len(cpu_loads)
                    metrics.append(PerformanceMetric(
                        name="cpu_usage",
                        value=avg_cpu_load,
                        unit="percent",
                        timestamp=timestamp
                    ))
            
            # 尝试获取内存信息
            storage_results = await snmp_client.walk(CommonOIDs.HR_STORAGE_SIZE)
            used_results = await snmp_client.walk(CommonOIDs.HR_STORAGE_USED)
            
            if storage_results and used_results:
                total_memory = 0
                used_memory = 0
                
                # 简化处理：假设前几个是内存存储
                for i, (size_result, used_result) in enumerate(zip(storage_results[:3], used_results[:3])):
                    if not size_result.error and not used_result.error:
                        size = int(size_result.value)
                        used = int(used_result.value)
                        total_memory += size
                        used_memory += used
                
                if total_memory > 0:
                    memory_usage_percent = (used_memory / total_memory) * 100
                    metrics.extend([
                        PerformanceMetric(
                            name="memory_total",
                            value=total_memory,
                            unit="units",
                            timestamp=timestamp
                        ),
                        PerformanceMetric(
                            name="memory_used",
                            value=used_memory,
                            unit="units",
                            timestamp=timestamp
                        ),
                        PerformanceMetric(
                            name="memory_usage",
                            value=memory_usage_percent,
                            unit="percent",
                            timestamp=timestamp
                        )
                    ])
            
        except Exception as e:
            self.logger.error(f"采集资源信息失败: {e}")
        
        return metrics

    async def _collect_linux_metrics_ssh(self, ssh_client: SSHClient) -> List[PerformanceMetric]:
        """采集Linux服务器指标"""
        metrics = []
        timestamp = datetime.now(timezone.utc)
        
        try:
            # 执行系统信息命令
            commands = DeviceCommands.LINUX['hardware_info'] + DeviceCommands.LINUX['system_info']
            
            results = await ssh_client.execute_commands(commands[:5])  # 限制命令数量
            
            for result in results:
                if result.exit_code == 0 and not result.error:
                    # 解析命令输出
                    if 'free' in result.command:
                        memory_metrics = self._parse_memory_info(result.stdout)
                        metrics.extend(memory_metrics)
                    elif 'uptime' in result.command:
                        uptime_metric = self._parse_uptime_info(result.stdout)
                        if uptime_metric:
                            metrics.append(uptime_metric)
                            
        except Exception as e:
            self.logger.error(f"采集Linux指标失败: {e}")
        
        return metrics

    async def _collect_network_device_metrics_ssh(
        self, 
        ssh_client: SSHClient, 
        device_type: DeviceType
    ) -> List[PerformanceMetric]:
        """采集网络设备指标"""
        metrics = []
        timestamp = datetime.now(timezone.utc)
        
        try:
            # 根据设备类型选择命令
            if device_type == DeviceType.ROUTER:
                commands = DeviceCommands.CISCO['basic_info'][:3]
            else:
                commands = DeviceCommands.CISCO['basic_info'][:2]
            
            results = await ssh_client.execute_commands(commands)
            
            for result in results:
                if result.exit_code == 0 and not result.error:
                    # 简单的文本指标记录
                    if 'show version' in result.command:
                        # 可以解析版本信息等
                        lines = result.stdout.split('\n')
                        for line in lines[:5]:  # 只取前几行
                            if 'uptime' in line.lower():
                                metrics.append(PerformanceMetric(
                                    name="device_info",
                                    value=line.strip(),
                                    timestamp=timestamp
                                ))
                                break
            
        except Exception as e:
            self.logger.error(f"采集网络设备指标失败: {e}")
        
        return metrics

    def _parse_memory_info(self, free_output: str) -> List[PerformanceMetric]:
        """解析free命令输出"""
        metrics = []
        timestamp = datetime.now(timezone.utc)
        
        try:
            lines = free_output.strip().split('\n')
            for line in lines:
                if 'Mem:' in line:
                    parts = line.split()
                    if len(parts) >= 7:
                        total = int(parts[1])
                        used = int(parts[2])
                        available = int(parts[6]) if len(parts) > 6 else int(parts[3])
                        
                        usage_percent = (used / total) * 100 if total > 0 else 0
                        
                        metrics.extend([
                            PerformanceMetric(
                                name="memory_total",
                                value=total,
                                unit="KB",
                                timestamp=timestamp
                            ),
                            PerformanceMetric(
                                name="memory_used",
                                value=used,
                                unit="KB",
                                timestamp=timestamp
                            ),
                            PerformanceMetric(
                                name="memory_available",
                                value=available,
                                unit="KB",
                                timestamp=timestamp
                            ),
                            PerformanceMetric(
                                name="memory_usage",
                                value=round(usage_percent, 2),
                                unit="percent",
                                timestamp=timestamp
                            )
                        ])
                    break
        except Exception as e:
            self.logger.error(f"解析内存信息失败: {e}")
        
        return metrics

    def _parse_uptime_info(self, uptime_output: str) -> Optional[PerformanceMetric]:
        """解析uptime命令输出"""
        try:
            timestamp = datetime.now(timezone.utc)
            # 提取负载平均值
            if 'load average:' in uptime_output:
                parts = uptime_output.split('load average:')[1].strip()
                load_1min = float(parts.split(',')[0].strip())
                
                return PerformanceMetric(
                    name="load_average_1min",
                    value=load_1min,
                    timestamp=timestamp
                )
        except Exception as e:
            self.logger.error(f"解析uptime信息失败: {e}")
        
        return None


# 全局性能采集器实例
device_performance_collector = DevicePerformanceCollector()