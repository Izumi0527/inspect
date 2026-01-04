"""
设备监控服务
"""
import asyncio
import time
from typing import Dict, List, Optional, Any
from datetime import datetime, timezone
import structlog

from src.core.influxdb import influxdb_client, record_device_status, record_device_metrics
from src.repositories.device_repository import DeviceRepository
from src.core.database import get_db_session_context
from src.infrastructure.cache import cache_service
from src.models.device import DeviceType
from src.core.snmp import SNMPVersion, SNMPSecurityLevel

from src.services.device.performance import (
    device_performance_collector,
    DeviceMonitoringConfig,
    DeviceType as PerfDeviceType,
    MonitoringProtocol,
    DeviceCredentials,
)
from src.services.device.snmp_utils import (
    extract_snmp_config,
    normalize_snmp_version,
    normalize_snmp_security_level,
    normalize_snmp_auth_protocol,
    normalize_snmp_priv_protocol,
)

logger = structlog.get_logger()


class DeviceMonitoringService:
    """设备监控服务"""
    
    def __init__(self):
        self.monitoring_tasks: Dict[int, asyncio.Task] = {}
        self.is_running = False
        self.monitor_interval = 60  # 监控间隔（秒）
        self.deleted_devices: set[int] = set()

    def _normalize_device_id(self, device_id: Any) -> Optional[int]:
        """确保设备ID为整数，便于集合判断"""
        if isinstance(device_id, int):
            return device_id
        if isinstance(device_id, str):
            try:
                return int(device_id)
            except ValueError:
                return None
        return None
    
    def _get_ws_notifier(self):
        """延迟导入以避免循环依赖"""
        from src.modules.monitoring.websocket import ws_notifier  # noqa: WPS433
        return ws_notifier
    
    async def start_monitoring(self):
        """启动设备监控"""
        if self.is_running:
            logger.info("Device monitoring already running")
            return
        
        self.is_running = True
        logger.info("Starting device monitoring service")
        
        # 启动主监控循环
        asyncio.create_task(self._monitoring_loop())
    
    async def stop_monitoring(self):
        """停止设备监控"""
        self.is_running = False
        
        # 取消所有监控任务
        for task in self.monitoring_tasks.values():
            task.cancel()
        
        # 等待任务完成
        if self.monitoring_tasks:
            await asyncio.gather(*self.monitoring_tasks.values(), return_exceptions=True)
            self.monitoring_tasks.clear()
        
        logger.info("Device monitoring service stopped")

    async def mark_device_deleted(self, device_id: int):
        """标记设备已删除，立即跳过后续采集并清理缓存"""
        normalized_id = self._normalize_device_id(device_id)
        if normalized_id is not None:
            self.deleted_devices.add(normalized_id)
            task = self.monitoring_tasks.pop(normalized_id, None)
        else:
            task = None
        if task:
            task.cancel()
        await cache_service.clear_device_related_cache(device_id)
    
    async def _monitoring_loop(self):
        """主监控循环"""
        while self.is_running:
            try:
                await self._monitor_all_devices()
                await asyncio.sleep(self.monitor_interval)
            except Exception as e:
                logger.error("Error in monitoring loop", error=str(e))
                await asyncio.sleep(10)  # 发生错误时短暂等待
    
    async def _monitor_all_devices(self):
        """监控所有设备（使用缓存优化）"""
        try:
            # 首先尝试从缓存获取活跃设备列表
            devices_data = await cache_service.get_cached_active_devices()
            
            if devices_data is None:
                # 缓存未命中，从数据库查询并缓存
                logger.debug("Cache miss for active devices, querying database")
                async with get_db_session_context() as session:
                    device_repo = DeviceRepository(session)
                    
                    # 获取所有活跃设备
                    devices, _ = await device_repo.get_devices_paginated(
                        page=1, 
                        page_size=1000,
                        is_active=True
                    )
                    
                    if not devices:
                        return
                    
                    # 转换为字典格式并缓存（包含SNMP和SSH配置）
                    devices_data = [
                        {
                            "id": device.id,
                            "name": device.name,
                            "ip_address": device.ip_address,
                            "device_type": device.device_type,
                            "is_active": device.is_active,
                            "is_monitored": device.is_monitored,
                            # SNMP 配置
                            "snmp_community": device.snmp_community,
                            "snmp_version": device.snmp_version,
                            "snmp_port": device.snmp_port,
                            # SSH 配置
                            "ssh_username": device.ssh_username,
                            "ssh_password": device.ssh_password,
                            "ssh_port": device.ssh_port,
                            # 其他配置
                            "vendor": device.vendor,
                            "tags": device.tags,
                        }
                        for device in devices
                    ]
                    
                    # 缓存设备列表，5分钟过期
                    await cache_service.cache_active_devices(devices_data, expire=300)
                    logger.debug(f"Cached {len(devices_data)} active devices")
            else:
                logger.debug(f"Using cached active devices list: {len(devices_data)} devices")
            
            # 过滤出需要监控的设备
            monitored_devices = []
            for device in devices_data:
                device_id = self._normalize_device_id(device.get("id"))
                if device_id is None:
                    continue
                if device_id in self.deleted_devices:
                    continue
                if not device.get("is_monitored", True):
                    continue
                monitored_devices.append({
                    **device,
                    "id": device_id
                })
            
            if not monitored_devices:
                logger.debug("No devices to monitor")
                return
                
            logger.debug(f"Monitoring {len(monitored_devices)} devices")
            
            # 并发监控设备（限制并发数以避免过载）
            semaphore = asyncio.Semaphore(20)  # 最多同时监控20个设备
            
            tasks = [
                self._monitor_single_device_with_semaphore(device, semaphore)
                for device in monitored_devices
            ]
            
            await asyncio.gather(*tasks, return_exceptions=True)
            
        except Exception as e:
            logger.error("Error monitoring devices", error=str(e))
    
    async def _monitor_single_device_with_semaphore(self, device, semaphore):
        """使用信号量控制并发的设备监控"""
        async with semaphore:
            await self._monitor_single_device(device)
    
    async def _monitor_single_device(self, device_data):
        """监控单个设备"""
        start_time = time.time()
        device_id = self._normalize_device_id(device_data["id"])
        if device_id is None:
            logger.warning("Invalid device id detected, skip monitoring", device_data=device_data)
            return
        device_ip = device_data["ip_address"]
        device_name = device_data.get("name", "Unknown")

        # 如果设备已被删除，跳过采集
        if device_id in self.deleted_devices:
            logger.debug("Skip monitoring deleted device", device_id=device_id)
            return
        
        try:
            # 模拟设备监控（实际项目中需要实现真实的监控逻辑）
            monitoring_result = await self._check_device_status(device_data)
            
            # 记录到缓存
            await cache_service.cache_device_status(
                device_id,
                monitoring_result["status"],
                monitoring_result.get("response_time")
            )
            
            # 记录到InfluxDB
            await record_device_status(
                device_id,
                device_ip,
                monitoring_result["status"],
                monitoring_result.get("response_time")
            )
            
            # 如果有性能指标，也记录到InfluxDB
            if "metrics" in monitoring_result:
                await record_device_metrics(
                    device_id,
                    device_ip,
                    monitoring_result["metrics"]
                )
                
                # 同时更新数据库中的性能指标
                await self._update_device_metrics_in_db(device_id, monitoring_result["metrics"])
            
            # 检查状态变化并发送WebSocket通知
            await self._check_status_change(device_data, monitoring_result)
            
            logger.debug(
                "Device monitored successfully",
                device_id=device_id,
                device_name=device_name,
                ip_address=device_ip,
                status=monitoring_result["status"],
                duration=round(time.time() - start_time, 3)
            )
            
        except Exception as e:
            logger.error(
                "Error monitoring device",
                device_id=device_id,
                device_name=device_name,
                ip_address=device_ip,
                error=str(e)
            )
            
            # 记录错误状态
            await record_device_status(
                device_id,
                device_ip,
                "error"
            )
    
    async def _check_device_status(self, device_data) -> Dict[str, Any]:
        """检查设备状态（使用真实的性能采集器）"""
        import json
        device_id = device_data["id"]
        device_name = device_data.get("name", "Unknown")
        device_ip = device_data["ip_address"]
        
        try:
            # 构建设备监控配置（从字典设备信息中获取）
            device_type = self._determine_device_type(device_data)
            protocols = self._determine_protocols(device_data)
            credentials, snmp_port = self._build_credentials(device_data)
            
            logger.debug(
                "Building device monitoring config",
                device_id=device_id,
                device_name=device_name,
                device_type=str(device_type),
                protocols=[str(p) for p in protocols],
                has_snmp_community=bool(device_data.get('snmp_community')),
                has_ssh_username=bool(device_data.get('ssh_username'))
            )
            
            config = DeviceMonitoringConfig(
                device_id=device_id,
                device_name=device_name,
                ip_address=device_ip,
                device_type=device_type,
                protocols=protocols,
                credentials=credentials,
                snmp_port=snmp_port,
                ssh_port=device_data.get('ssh_port') or 22
            )
            
            logger.debug("Device monitoring config created successfully", device_id=device_id)
            
            # 使用性能采集器获取实际数据
            device_status = await device_performance_collector.collect_device_metrics(config)
            
            result = {
                "status": "online" if device_status.is_online else "offline",
                "timestamp": device_status.last_check or datetime.now(timezone.utc),
            }
            
            if device_status.response_time:
                result["response_time"] = device_status.response_time
            
            if device_status.error_message:
                result["error"] = device_status.error_message
            
            # 转换性能指标为字典格式
            if device_status.metrics:
                metrics = {}
                for metric in device_status.metrics:
                    metrics[metric.name] = {
                        "value": metric.value,
                        "unit": metric.unit,
                        "timestamp": metric.timestamp.isoformat() if metric.timestamp else None
                    }
                result["metrics"] = metrics
            
            return result
            
        except Exception as e:
            logger.error(
                "Error using performance collector",
                device_id=device_id,
                device_name=device_name,
                error=str(e),
                error_type=type(e).__name__,
                device_type=device_data.get('device_type', 'unknown'),
                ip_address=device_ip,
                exc_info=True
            )
            
            # 降级到简单的ping检查
            return await self._simple_ping_check(device_data)
    
    def _determine_device_type(self, device_data) -> DeviceType:
        """根据设备信息确定设备类型"""
        # 这里可以根据设备的类型字段或其他信息来判断
        device_type_mapping = {
            "router": DeviceType.ROUTER,
            "switch": DeviceType.SWITCH,
            "firewall": DeviceType.FIREWALL,
            "server": DeviceType.SERVER,
            "linux": DeviceType.SERVER,
            "windows": DeviceType.SERVER,
            "storage": DeviceType.UNKNOWN,
            "ups": DeviceType.UNKNOWN,
            "ap": DeviceType.AP
        }
        
        # 从设备类型或描述中匹配
        device_type_str = device_data.get('device_type', '').lower()
        if not device_type_str:
            device_type_str = device_data.get('description', '').lower()
        
        for key, device_type in device_type_mapping.items():
            if key in device_type_str:
                return device_type
        
        return DeviceType.UNKNOWN
    
    def _get_cli_config(self, device_data) -> Dict[str, Any]:
        tags = device_data.get("tags")
        if isinstance(tags, str):
            try:
                tags = json.loads(tags)
            except (ValueError, json.JSONDecodeError):
                tags = {}
        return (tags or {}).get("cli_config") or {}

    def _determine_protocols(self, device_data) -> List[MonitoringProtocol]:
        """确定设备支持的监控协议"""
        protocols = []
        
        # 根据设备信息判断支持的协议
        # 这里可以从数据库中获取设备的协议配置
        
        # 默认尝试SNMP
        protocols.append(MonitoringProtocol.SNMP)
        
        # 如果是服务器类设备，也尝试SSH
        device_type = self._determine_device_type(device_data)
        cli_config = self._get_cli_config(device_data)
        cli_protocol = cli_config.get("cli_protocol")

        if cli_protocol == "ssh":
            if device_data.get("ssh_username") and device_data.get("ssh_password"):
                protocols.append(MonitoringProtocol.SSH)
        elif cli_protocol in (None, "", "default"):
            if device_type in [DeviceType.SERVER, DeviceType.ROUTER, DeviceType.SWITCH] and device_data.get("ssh_username"):
                protocols.append(MonitoringProtocol.SSH)
    
        return protocols
    
    def _build_credentials(self, device_data) -> tuple[DeviceCredentials, int]:
        """构建设备认证信息并返回SNMP端口"""
        # 这里应该从设备配置或加密存储中获取认证信息
        import os
        
        credentials = DeviceCredentials()
        snmp_config = extract_snmp_config(device_data.get("tags"))
        snmp_port = snmp_config.get("port") or device_data.get("snmp_port") or 161
        snmp_community = None
        
        # SNMP 配置 - 优先使用 tags.snmp_config，否则使用设备字段/环境变量默认值
        snmp_version_raw = snmp_config.get("version") or device_data.get("snmp_version")
        credentials.snmp_version = normalize_snmp_version(snmp_version_raw) or SNMPVersion.V2C
        
        if credentials.snmp_version == SNMPVersion.V3:
            v3_config = snmp_config.get("v3_config") or {}
            credentials.snmp_username = v3_config.get("username")
            credentials.snmp_security_level = (
                normalize_snmp_security_level(v3_config.get("security_level"))
                or SNMPSecurityLevel.NO_AUTH_NO_PRIV
            )
            credentials.snmp_auth_protocol = normalize_snmp_auth_protocol(v3_config.get("auth_protocol"))
            credentials.snmp_auth_key = v3_config.get("auth_password") or v3_config.get("auth_key")
            credentials.snmp_priv_protocol = normalize_snmp_priv_protocol(v3_config.get("priv_protocol"))
            credentials.snmp_priv_key = v3_config.get("priv_password") or v3_config.get("priv_key")
        else:
            snmp_community = snmp_config.get("v2c_config", {}).get("community") or device_data.get("snmp_community")
            if not snmp_community:
                snmp_community = os.getenv("DEFAULT_SNMP_COMMUNITY", "public")
            credentials.snmp_community = snmp_community
        
        logger.debug(
            "构建设备认证信息",
            device_id=device_data.get('id'),
            snmp_version=str(credentials.snmp_version),
            snmp_community_set=bool(snmp_community),
            snmp_community_preview=snmp_community[:3] + "***" if snmp_community else "None",
            snmp_username_set=bool(credentials.snmp_username),
            snmp_security_level=credentials.snmp_security_level.value if credentials.snmp_security_level else None
        )
        
        cli_protocol = self._get_cli_config(device_data).get("cli_protocol")
        
        ssh_username = device_data.get('ssh_username')
        ssh_password = device_data.get('ssh_password')
        
        if cli_protocol == "ssh" and ssh_username and ssh_password:
            credentials.ssh_username = ssh_username
            credentials.ssh_password = ssh_password
    
        return credentials, snmp_port
    
    async def _simple_ping_check(self, device_data) -> Dict[str, Any]:
        """简单的ping检查作为降级方案"""
        import subprocess
        import asyncio
        
        device_ip = device_data["ip_address"]
        
        try:
            # 执行ping命令
            cmd = ["ping", "-c", "1", "-W", "3", device_ip]
            process = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE
            )
            
            stdout, stderr = await process.communicate()
            
            if process.returncode == 0:
                # 从ping输出中提取延迟时间
                output = stdout.decode()
                import re
                time_match = re.search(r'time=(\d+(?:\.\d+)?)', output)
                response_time = float(time_match.group(1)) if time_match else None
                
                return {
                    "status": "online",
                    "timestamp": datetime.now(timezone.utc),
                    "response_time": response_time
                }
            else:
                return {
                    "status": "offline",
                    "timestamp": datetime.now(timezone.utc),
                    "error": stderr.decode().strip()
                }
                
        except Exception as e:
            return {
                "status": "error",
                "timestamp": datetime.now(timezone.utc),
                "error": str(e)
            }
    
    async def _check_status_change(self, device_data, monitoring_result):
        """检查设备状态变化并发送通知"""
        device_id = device_data["id"]
        device_name = device_data.get("name", "Unknown")
        device_ip = device_data["ip_address"]
        
        try:
            # 从缓存获取之前的状态
            cached_status = await cache_service.get_cached_device_status(device_id)
            previous_status = cached_status.get("status") if cached_status else None
            current_status = monitoring_result["status"]
            
            # 如果状态发生变化，发送WebSocket通知
            if previous_status and previous_status != current_status:
                severity = "critical" if current_status == "offline" else "info"
                
                notifier = self._get_ws_notifier()
                await notifier.notify_device_status_change(
                    device_id,
                    current_status,
                    device_name=device_name,
                    ip_address=device_ip,
                    previous_status=previous_status,
                    response_time=monitoring_result.get("response_time")
                )
                
                # 如果设备离线，发送告警
                if current_status == "offline":
                    await notifier.notify_alert(
                        "device_offline",
                        severity,
                        f"设备 {device_name} ({device_ip}) 离线",
                        device_id=device_id,
                        device_name=device_name,
                        ip_address=device_ip
                    )
                
                logger.info(
                    "Device status changed",
                    device_id=device_id,
                    device_name=device_name,
                    ip_address=device_ip,
                    previous_status=previous_status,
                    current_status=current_status
                )
        
        except Exception as e:
            logger.error(
                "Error checking status change",
                device_id=device_id,
                device_name=device_name,
                error=str(e)
            )
    
    async def get_device_metrics_history(
        self, 
        device_id: int, 
        start_time: datetime, 
        end_time: datetime,
        metric_names: Optional[List[str]] = None
    ) -> Optional[List[Dict]]:
        """
        获取设备历史监控数据
        
        Args:
            device_id: 设备ID
            start_time: 开始时间
            end_time: 结束时间
            metric_names: 指定的指标名称列表
        """
        if not influxdb_client.is_connected:
            logger.warning("InfluxDB not connected, cannot query metrics history")
            return None
        
        # 构建Flux查询语句
        time_range = f'range(start: {start_time.isoformat()}, stop: {end_time.isoformat()})'
        device_filter = f'filter(fn: (r) => r.device_id == "{device_id}")'
        
        # 基础查询
        query_parts = [
            f'from(bucket: "{influxdb_client.bucket}")',
            f'|> {time_range}',
            f'|> filter(fn: (r) => r._measurement == "device_metrics")',
            f'|> {device_filter}'
        ]
        
        # 如果指定了特定指标，添加字段过滤
        if metric_names:
            field_conditions = ' or '.join([f'r._field == "{name}"' for name in metric_names])
            query_parts.append(f'|> filter(fn: (r) => {field_conditions})')
        
        flux_query = '\n  '.join(query_parts)
        
        try:
            results = await influxdb_client.query(flux_query)
            return results
        except Exception as e:
            logger.error(
                "Error querying device metrics history",
                device_id=device_id,
                error=str(e)
            )
            return None
    
    async def get_monitoring_stats(self) -> Dict[str, Any]:
        """获取监控统计信息"""
        try:
            async with get_db_session_context() as session:
                device_repo = DeviceRepository(session)
                _, total_devices = await device_repo.get_devices_paginated(page=1, page_size=1)
                _, active_devices = await device_repo.get_devices_paginated(
                    page=1, page_size=1, is_active=True
                )
                
                return {
                    "is_running": self.is_running,
                    "monitor_interval": self.monitor_interval,
                    "total_devices": total_devices,
                    "active_devices": active_devices,
                    "monitoring_tasks": len(self.monitoring_tasks),
                    "influxdb_connected": influxdb_client.is_connected,
                    "last_check": datetime.now(timezone.utc).isoformat()
                }
        except Exception as e:
            logger.error("Error getting monitoring stats", error=str(e))
            return {
                "is_running": self.is_running,
                "monitor_interval": self.monitor_interval,
                "total_devices": 0,
                "active_devices": 0,
                "monitoring_tasks": 0,
                "influxdb_connected": False,
                "error": str(e)
            }

    async def _update_device_metrics_in_db(self, device_id: int, metrics: Dict[str, Any]) -> bool:
        """
        将采集到的性能指标更新到数据库
        
        Args:
            device_id: 设备ID
            metrics: 性能指标字典，格式为 {metric_name: {value, unit, timestamp}}
        """
        try:
            # 提取关键指标
            cpu_usage = None
            memory_usage = None
            uptime = None
            response_time = None
            
            for metric_name, metric_data in metrics.items():
                if isinstance(metric_data, dict):
                    value = metric_data.get("value")
                else:
                    value = metric_data
                
                if metric_name == "cpu_usage" and value is not None:
                    cpu_usage = float(value)
                elif metric_name == "memory_usage" and value is not None:
                    memory_usage = float(value)
                elif metric_name == "system_uptime" and value is not None:
                    uptime = int(float(value))
            
            # 如果没有任何指标，跳过更新
            if cpu_usage is None and memory_usage is None and uptime is None:
                return True
            
            # 更新数据库
            async with get_db_session_context() as session:
                from src.modules.devices.service import DeviceService
                device_service = DeviceService(session)
                
                success = await device_service.update_device_metrics(
                    device_id=device_id,
                    cpu_usage=cpu_usage,
                    memory_usage=memory_usage,
                    uptime=uptime,
                    response_time=response_time
                )
                
                if success:
                    await session.commit()
                    logger.debug(
                        "Device metrics updated in database",
                        device_id=device_id,
                        cpu_usage=cpu_usage,
                        memory_usage=memory_usage,
                        uptime=uptime
                    )
                
                return success
                
        except Exception as e:
            logger.error(
                "Error updating device metrics in database",
                device_id=device_id,
                error=str(e)
            )
            return False


# 全局设备监控服务实例
device_monitoring_service = DeviceMonitoringService()
