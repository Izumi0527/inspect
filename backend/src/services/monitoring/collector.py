import asyncio
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Union, Tuple
from dataclasses import dataclass, asdict
from enum import Enum
import structlog

from src.infrastructure.device_connection import SNMPService, SSHService
from src.core.config import settings

# 延迟导入避免循环依赖
def _get_network_scanner():
    from src.services.device.scanner import network_scanner
    return network_scanner

def _get_device_connector():
    from src.services.device.connector import device_connector
    return device_connector

logger = structlog.get_logger()

class MetricType(str, Enum):
    """性能指标类型"""
    CPU_USAGE = "cpu_usage"
    MEMORY_USAGE = "memory_usage"
    INTERFACE_STATUS = "interface_status"
    INTERFACE_TRAFFIC = "interface_traffic"
    UPTIME = "uptime"
    TEMPERATURE = "temperature"
    POWER_STATUS = "power_status"
    DISK_USAGE = "disk_usage"

class DataSource(str, Enum):
    """数据源类型"""
    SNMP = "snmp"
    SSH = "ssh"
    PING = "ping"
    HTTP = "http"

@dataclass
class PerformanceMetric:
    """性能指标数据结构"""
    device_ip: str
    metric_type: MetricType
    value: Union[float, int, str, Dict[str, Any]]
    unit: str
    timestamp: datetime
    source: DataSource
    vendor: Optional[str] = None
    device_type: Optional[str] = None
    status: str = "success"  # success, warning, error
    message: Optional[str] = None
    raw_data: Optional[Dict[str, Any]] = None

@dataclass
class CollectionTask:
    """数据采集任务"""
    task_id: str
    device_ip: str
    metrics: List[MetricType]
    interval: int  # 采集间隔（秒）
    enabled: bool = True
    last_collection: Optional[datetime] = None
    next_collection: Optional[datetime] = None
    failure_count: int = 0
    max_failures: int = 5

class PerformanceCollector:
    """性能数据采集服务"""
    
    def __init__(self):
        self.snmp_service = SNMPService()
        self.ssh_service = SSHService()
        # 使用延迟导入避免循环依赖
        self._network_scanner = None
        self._device_connector = None
    
    @property
    def network_scanner(self):
        if self._network_scanner is None:
            self._network_scanner = _get_network_scanner()
        return self._network_scanner
    
    @property
    def device_connector(self):
        if self._device_connector is None:
            self._device_connector = _get_device_connector()
        return self._device_connector
        
        # 采集任务管理
        self.collection_tasks: Dict[str, CollectionTask] = {}
        self.active_collections: Dict[str, asyncio.Task] = {}
        
        # 数据缓存
        self.metric_cache: Dict[str, List[PerformanceMetric]] = {}
        self.cache_retention_hours = 24
        
        # 厂商特定的指标配置
        self.vendor_metrics_config = {
            "cisco": {
                MetricType.CPU_USAGE: {
                    "snmp_oid": "1.3.6.1.4.1.9.9.109.1.1.1.1.7.1",
                    "ssh_command": "show processes cpu",
                    "parser": "_parse_cisco_cpu"
                },
                MetricType.MEMORY_USAGE: {
                    "snmp_oid": "1.3.6.1.4.1.9.9.48.1.1.1.5.1",
                    "ssh_command": "show memory statistics",
                    "parser": "_parse_cisco_memory"
                },
                MetricType.TEMPERATURE: {
                    "ssh_command": "show environment temperature",
                    "parser": "_parse_cisco_temperature"
                }
            },
            "huawei": {
                MetricType.CPU_USAGE: {
                    "snmp_oid": "1.3.6.1.4.1.2011.5.25.31.1.1.1.1.5",
                    "ssh_command": "display cpu-usage",
                    "parser": "_parse_huawei_cpu"
                },
                MetricType.MEMORY_USAGE: {
                    "snmp_oid": "1.3.6.1.4.1.2011.5.25.31.1.1.1.1.7",
                    "ssh_command": "display memory-usage",
                    "parser": "_parse_huawei_memory"
                }
            },
            "h3c": {
                MetricType.CPU_USAGE: {
                    "snmp_oid": "1.3.6.1.4.1.25506.2.6.1.1.1.1.6",
                    "ssh_command": "display cpu-usage",
                    "parser": "_parse_h3c_cpu"
                }
            }
        }
    
    async def start_collection_task(
        self,
        device_ip: str,
        metrics: List[MetricType],
        interval: int = 300,  # 默认5分钟
        device_info: Optional[Dict[str, Any]] = None
    ) -> str:
        """启动性能数据采集任务"""
        try:
            task_id = f"collection_{device_ip}_{int(time.time())}"
            
            # 创建采集任务
            collection_task = CollectionTask(
                task_id=task_id,
                device_ip=device_ip,
                metrics=metrics,
                interval=interval,
                next_collection=datetime.now()
            )
            
            self.collection_tasks[task_id] = collection_task
            
            # 启动异步采集任务
            async_task = asyncio.create_task(
                self._run_collection_loop(task_id, device_info)
            )
            self.active_collections[task_id] = async_task
            
            logger.info("Performance collection task started",
                       task_id=task_id,
                       device_ip=device_ip,
                       metrics=[m.value for m in metrics],
                       interval=interval)
            
            return task_id
            
        except Exception as e:
            logger.error("Failed to start collection task",
                        device_ip=device_ip,
                        error=str(e))
            raise
    
    async def _run_collection_loop(self, task_id: str, device_info: Optional[Dict[str, Any]]):
        """运行采集循环"""
        collection_task = self.collection_tasks[task_id]
        
        while collection_task.enabled:
            try:
                current_time = datetime.now()
                
                # 检查是否到了采集时间
                if collection_task.next_collection and current_time < collection_task.next_collection:
                    await asyncio.sleep(10)  # 10秒后再次检查
                    continue
                
                # 执行数据采集
                metrics = await self.collect_device_metrics(
                    collection_task.device_ip,
                    collection_task.metrics,
                    device_info
                )
                
                # 存储指标到缓存
                if metrics:
                    self._cache_metrics(metrics)
                    collection_task.failure_count = 0
                    logger.debug("Metrics collected successfully",
                               task_id=task_id,
                               device_ip=collection_task.device_ip,
                               metric_count=len(metrics))
                else:
                    collection_task.failure_count += 1
                    logger.warning("No metrics collected",
                                 task_id=task_id,
                                 device_ip=collection_task.device_ip,
                                 failure_count=collection_task.failure_count)
                
                # 更新采集时间
                collection_task.last_collection = current_time
                collection_task.next_collection = current_time + timedelta(seconds=collection_task.interval)
                
                # 检查失败次数
                if collection_task.failure_count >= collection_task.max_failures:
                    logger.error("Collection task disabled due to too many failures",
                               task_id=task_id,
                               device_ip=collection_task.device_ip,
                               failure_count=collection_task.failure_count)
                    collection_task.enabled = False
                
            except Exception as e:
                collection_task.failure_count += 1
                logger.error("Collection loop error",
                           task_id=task_id,
                           device_ip=collection_task.device_ip,
                           error=str(e),
                           failure_count=collection_task.failure_count)
                
                if collection_task.failure_count >= collection_task.max_failures:
                    collection_task.enabled = False
                
                await asyncio.sleep(60)  # 错误时等待1分钟
        
        # 清理任务
        if task_id in self.active_collections:
            del self.active_collections[task_id]
        
        logger.info("Collection task stopped", task_id=task_id)
    
    async def collect_device_metrics(
        self,
        device_ip: str,
        metrics: List[MetricType],
        device_info: Optional[Dict[str, Any]] = None
    ) -> List[PerformanceMetric]:
        """采集单个设备的性能指标"""
        try:
            collected_metrics = []
            current_time = datetime.now()
            
            # 获取设备信息
            if not device_info:
                device_info = await self._get_device_info(device_ip)
            
            vendor = device_info.get("vendor", "unknown").lower()
            device_type = device_info.get("device_type", "unknown")
            
            # 并发采集各类指标
            collection_tasks = []
            for metric_type in metrics:
                task = asyncio.create_task(
                    self._collect_single_metric(
                        device_ip, metric_type, vendor, device_type, current_time
                    )
                )
                collection_tasks.append(task)
            
            # 等待所有采集任务完成
            results = await asyncio.gather(*collection_tasks, return_exceptions=True)
            
            for result in results:
                if isinstance(result, PerformanceMetric):
                    collected_metrics.append(result)
                elif isinstance(result, Exception):
                    logger.warning("Metric collection failed",
                                 device_ip=device_ip,
                                 error=str(result))
            
            return collected_metrics
            
        except Exception as e:
            logger.error("Failed to collect device metrics",
                        device_ip=device_ip,
                        error=str(e))
            return []
    
    async def _collect_single_metric(
        self,
        device_ip: str,
        metric_type: MetricType,
        vendor: str,
        device_type: str,
        timestamp: datetime
    ) -> Optional[PerformanceMetric]:
        """采集单个指标"""
        try:
            # 获取厂商特定的配置
            vendor_config = self.vendor_metrics_config.get(vendor, {})
            metric_config = vendor_config.get(metric_type, {})
            
            # 优先使用SNMP采集
            if "snmp_oid" in metric_config:
                result = await self._collect_via_snmp(
                    device_ip, metric_type, metric_config["snmp_oid"], timestamp
                )
                if result:
                    result.vendor = vendor
                    result.device_type = device_type
                    return result
            
            # 备选SSH采集
            if "ssh_command" in metric_config:
                result = await self._collect_via_ssh(
                    device_ip, metric_type, metric_config, timestamp
                )
                if result:
                    result.vendor = vendor
                    result.device_type = device_type
                    return result
            
            # 通用指标采集
            result = await self._collect_generic_metric(
                device_ip, metric_type, timestamp
            )
            if result:
                result.vendor = vendor
                result.device_type = device_type
                return result
            
            return None
            
        except Exception as e:
            logger.debug("Single metric collection failed",
                        device_ip=device_ip,
                        metric_type=metric_type.value,
                        error=str(e))
            return None
    
    async def _collect_via_snmp(
        self,
        device_ip: str,
        metric_type: MetricType,
        oid: str,
        timestamp: datetime
    ) -> Optional[PerformanceMetric]:
        """通过SNMP采集指标"""
        try:
            value = await self.snmp_service.snmp_get(device_ip, oid)
            
            if value is not None:
                # 根据指标类型处理数值
                processed_value, unit = self._process_metric_value(metric_type, value)
                
                return PerformanceMetric(
                    device_ip=device_ip,
                    metric_type=metric_type,
                    value=processed_value,
                    unit=unit,
                    timestamp=timestamp,
                    source=DataSource.SNMP,
                    raw_data={"snmp_oid": oid, "raw_value": value}
                )
            
            return None
            
        except Exception as e:
            logger.debug("SNMP collection failed",
                        device_ip=device_ip,
                        metric_type=metric_type.value,
                        oid=oid,
                        error=str(e))
            return None
    
    async def _collect_via_ssh(
        self,
        device_ip: str,
        metric_type: MetricType,
        config: Dict[str, Any],
        timestamp: datetime
    ) -> Optional[PerformanceMetric]:
        """通过SSH采集指标"""
        try:
            command = config["ssh_command"]
            parser_name = config.get("parser")
            
            # 执行SSH命令（这里需要设备认证信息）
            # 临时使用默认认证信息，实际应该从设备配置中获取
            device_info = {
                "ip_address": device_ip,
                "ssh_username": "admin",  # 应该从配置获取
                "ssh_password": "admin",  # 应该从配置获取
                "vendor": "cisco",
                "device_type": "switch"
            }
            
            output = await self.ssh_service.execute_command(device_info, command)
            
            if output and parser_name:
                # 使用指定的解析器处理输出
                parser_func = getattr(self, parser_name, None)
                if parser_func:
                    processed_value, unit = parser_func(output)
                    
                    return PerformanceMetric(
                        device_ip=device_ip,
                        metric_type=metric_type,
                        value=processed_value,
                        unit=unit,
                        timestamp=timestamp,
                        source=DataSource.SSH,
                        raw_data={"command": command, "output": output[:500]}
                    )
            
            return None
            
        except Exception as e:
            logger.debug("SSH collection failed",
                        device_ip=device_ip,
                        metric_type=metric_type.value,
                        error=str(e))
            return None
    
    async def _collect_generic_metric(
        self,
        device_ip: str,
        metric_type: MetricType,
        timestamp: datetime
    ) -> Optional[PerformanceMetric]:
        """通用指标采集"""
        try:
            if metric_type == MetricType.UPTIME:
                # 通过SNMP获取系统运行时间
                uptime_ticks = await self.snmp_service.snmp_get(
                    device_ip, "1.3.6.1.2.1.1.3.0"
                )
                if uptime_ticks:
                    uptime_seconds = int(uptime_ticks) / 100
                    return PerformanceMetric(
                        device_ip=device_ip,
                        metric_type=metric_type,
                        value=uptime_seconds,
                        unit="seconds",
                        timestamp=timestamp,
                        source=DataSource.SNMP
                    )
            
            elif metric_type == MetricType.INTERFACE_STATUS:
                # 获取接口状态信息
                interfaces = await self.snmp_service.get_interface_status(device_ip)
                if interfaces:
                    up_count = len([i for i in interfaces if i.get("operational_status") == "up"])
                    total_count = len(interfaces)
                    
                    return PerformanceMetric(
                        device_ip=device_ip,
                        metric_type=metric_type,
                        value={"up_interfaces": up_count, "total_interfaces": total_count},
                        unit="count",
                        timestamp=timestamp,
                        source=DataSource.SNMP,
                        raw_data={"interfaces": interfaces}
                    )
            
            elif metric_type == MetricType.INTERFACE_TRAFFIC:
                # 获取接口流量统计
                traffic_stats = await self.snmp_service.get_interface_traffic(device_ip)
                if traffic_stats:
                    total_in = sum(stat.get("in_octets", 0) for stat in traffic_stats)
                    total_out = sum(stat.get("out_octets", 0) for stat in traffic_stats)
                    
                    return PerformanceMetric(
                        device_ip=device_ip,
                        metric_type=metric_type,
                        value={"in_octets": total_in, "out_octets": total_out},
                        unit="bytes",
                        timestamp=timestamp,
                        source=DataSource.SNMP,
                        raw_data={"traffic_stats": traffic_stats}
                    )
            
            return None
            
        except Exception as e:
            logger.debug("Generic metric collection failed",
                        device_ip=device_ip,
                        metric_type=metric_type.value,
                        error=str(e))
            return None
    
    def _process_metric_value(self, metric_type: MetricType, raw_value: Any) -> Tuple[Any, str]:
        """处理指标数值"""
        if metric_type in [MetricType.CPU_USAGE, MetricType.MEMORY_USAGE]:
            return float(raw_value), "percent"
        elif metric_type == MetricType.UPTIME:
            return float(raw_value), "seconds"
        elif metric_type == MetricType.TEMPERATURE:
            return float(raw_value), "celsius"
        else:
            return raw_value, "unknown"
    
    # 厂商特定的解析器
    def _parse_cisco_cpu(self, output: str) -> Tuple[float, str]:
        """解析Cisco CPU使用率"""
        try:
            for line in output.split('\n'):
                if 'CPU utilization' in line:
                    # 查找百分比数值
                    import re
                    match = re.search(r'(\d+(?:\.\d+)?)%', line)
                    if match:
                        return float(match.group(1)), "percent"
            return 0.0, "percent"
        except:
            return 0.0, "percent"
    
    def _parse_cisco_memory(self, output: str) -> Tuple[float, str]:
        """解析Cisco内存使用率"""
        try:
            used_memory = 0
            free_memory = 0
            
            for line in output.split('\n'):
                if 'Used' in line and 'bytes' in line:
                    import re
                    match = re.search(r'(\d+)', line)
                    if match:
                        used_memory = int(match.group(1))
                elif 'Free' in line and 'bytes' in line:
                    import re
                    match = re.search(r'(\d+)', line)
                    if match:
                        free_memory = int(match.group(1))
            
            if used_memory + free_memory > 0:
                usage_percent = (used_memory / (used_memory + free_memory)) * 100
                return round(usage_percent, 2), "percent"
            
            return 0.0, "percent"
        except:
            return 0.0, "percent"
    
    def _parse_cisco_temperature(self, output: str) -> Tuple[float, str]:
        """解析Cisco温度信息"""
        try:
            temperatures = []
            for line in output.split('\n'):
                if 'Celsius' in line or 'C' in line:
                    import re
                    match = re.search(r'(\d+(?:\.\d+)?)', line)
                    if match:
                        temperatures.append(float(match.group(1)))
            
            if temperatures:
                return max(temperatures), "celsius"  # 返回最高温度
            return 0.0, "celsius"
        except:
            return 0.0, "celsius"
    
    def _parse_huawei_cpu(self, output: str) -> Tuple[float, str]:
        """解析华为CPU使用率"""
        try:
            for line in output.split('\n'):
                if 'CPU usage' in line:
                    import re
                    match = re.search(r'(\d+(?:\.\d+)?)%', line)
                    if match:
                        return float(match.group(1)), "percent"
            return 0.0, "percent"
        except:
            return 0.0, "percent"
    
    def _parse_huawei_memory(self, output: str) -> Tuple[float, str]:
        """解析华为内存使用率"""
        try:
            for line in output.split('\n'):
                if 'Memory usage' in line:
                    import re
                    match = re.search(r'(\d+(?:\.\d+)?)%', line)
                    if match:
                        return float(match.group(1)), "percent"
            return 0.0, "percent"
        except:
            return 0.0, "percent"
    
    def _parse_h3c_cpu(self, output: str) -> Tuple[float, str]:
        """解析H3C CPU使用率"""
        try:
            for line in output.split('\n'):
                if 'CPU usage' in line or 'CPU utilization' in line:
                    import re
                    match = re.search(r'(\d+(?:\.\d+)?)%', line)
                    if match:
                        return float(match.group(1)), "percent"
            return 0.0, "percent"
        except:
            return 0.0, "percent"
    
    async def _get_device_info(self, device_ip: str) -> Dict[str, Any]:
        """获取设备基本信息"""
        try:
            # 首先尝试从SNMP获取设备信息
            system_info = await self.snmp_service.get_system_info(device_ip)
            if system_info:
                return {
                    "vendor": system_info.get("detected_vendor", "unknown"),
                    "device_type": "network_device",
                    "system_description": system_info.get("system_description"),
                    "system_name": system_info.get("system_name")
                }
            
            # 如果SNMP失败，返回默认信息
            return {
                "vendor": "unknown",
                "device_type": "unknown"
            }
            
        except Exception as e:
            logger.debug("Failed to get device info",
                        device_ip=device_ip,
                        error=str(e))
            return {
                "vendor": "unknown",
                "device_type": "unknown"
            }
    
    def _cache_metrics(self, metrics: List[PerformanceMetric]) -> None:
        """缓存性能指标"""
        try:
            for metric in metrics:
                cache_key = f"{metric.device_ip}_{metric.metric_type.value}"
                
                if cache_key not in self.metric_cache:
                    self.metric_cache[cache_key] = []
                
                # 添加到缓存
                self.metric_cache[cache_key].append(metric)
                
                # 保持缓存大小（最多保留1000个条目）
                if len(self.metric_cache[cache_key]) > 1000:
                    self.metric_cache[cache_key] = self.metric_cache[cache_key][-500:]
            
        except Exception as e:
            logger.warning("Failed to cache metrics", error=str(e))
    
    def get_cached_metrics(
        self,
        device_ip: str,
        metric_type: MetricType,
        start_time: Optional[datetime] = None,
        end_time: Optional[datetime] = None,
        limit: int = 100
    ) -> List[PerformanceMetric]:
        """获取缓存的性能指标"""
        try:
            cache_key = f"{device_ip}_{metric_type.value}"
            cached_metrics = self.metric_cache.get(cache_key, [])
            
            # 时间过滤
            if start_time or end_time:
                filtered_metrics = []
                for metric in cached_metrics:
                    if start_time and metric.timestamp < start_time:
                        continue
                    if end_time and metric.timestamp > end_time:
                        continue
                    filtered_metrics.append(metric)
                cached_metrics = filtered_metrics
            
            # 限制数量
            return cached_metrics[-limit:] if cached_metrics else []
            
        except Exception as e:
            logger.warning("Failed to get cached metrics",
                          device_ip=device_ip,
                          metric_type=metric_type.value,
                          error=str(e))
            return []
    
    async def get_real_time_metrics(
        self,
        device_ip: str,
        metrics: List[MetricType]
    ) -> List[PerformanceMetric]:
        """获取实时性能指标"""
        return await self.collect_device_metrics(device_ip, metrics)
    
    async def stop_collection_task(self, task_id: str) -> bool:
        """停止采集任务"""
        try:
            if task_id in self.collection_tasks:
                self.collection_tasks[task_id].enabled = False
                
            if task_id in self.active_collections:
                self.active_collections[task_id].cancel()
                del self.active_collections[task_id]
                
            logger.info("Collection task stopped", task_id=task_id)
            return True
            
        except Exception as e:
            logger.error("Failed to stop collection task",
                        task_id=task_id,
                        error=str(e))
            return False
    
    def get_collection_status(self) -> Dict[str, Any]:
        """获取采集任务状态"""
        return {
            "total_tasks": len(self.collection_tasks),
            "active_tasks": len(self.active_collections),
            "cached_devices": len(set(key.split('_')[0] for key in self.metric_cache.keys())),
            "cached_metrics_count": sum(len(metrics) for metrics in self.metric_cache.values())
        }
    
    async def cleanup_cache(self, older_than_hours: int = None) -> None:
        """清理缓存数据"""
        try:
            if older_than_hours is None:
                older_than_hours = self.cache_retention_hours
            
            cutoff_time = datetime.now() - timedelta(hours=older_than_hours)
            cleaned_count = 0
            
            for cache_key in list(self.metric_cache.keys()):
                metrics = self.metric_cache[cache_key]
                filtered_metrics = [
                    metric for metric in metrics 
                    if metric.timestamp >= cutoff_time
                ]
                
                cleaned_count += len(metrics) - len(filtered_metrics)
                
                if filtered_metrics:
                    self.metric_cache[cache_key] = filtered_metrics
                else:
                    del self.metric_cache[cache_key]
            
            logger.info("Cache cleanup completed",
                       cleaned_metrics=cleaned_count,
                       retention_hours=older_than_hours)
            
        except Exception as e:
            logger.error("Cache cleanup failed", error=str(e))


# 创建全局性能采集器实例
performance_collector = PerformanceCollector()