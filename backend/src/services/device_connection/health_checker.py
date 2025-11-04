"""
设备连接健康检查服务
"""
import asyncio
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Union, Callable
from concurrent.futures import ThreadPoolExecutor
import structlog
from dataclasses import dataclass, field
from enum import Enum
import time

from .snmp_service import SNMPService
from .ssh_service import SSHService
from .types import DeviceInfo, DeviceConnectionType

logger = structlog.get_logger()


class HealthStatus(str, Enum):
    """健康状态枚举"""
    HEALTHY = "healthy"
    DEGRADED = "degraded"
    UNHEALTHY = "unhealthy"
    UNKNOWN = "unknown"


@dataclass
class HealthCheckResult:
    """健康检查结果"""
    device_id: int
    device_ip: str
    connection_type: DeviceConnectionType
    status: HealthStatus
    response_time: float = 0.0
    last_check: datetime = field(default_factory=datetime.now)
    error_message: Optional[str] = None
    consecutive_failures: int = 0
    uptime_percentage: float = 100.0
    additional_info: Dict[str, Any] = field(default_factory=dict)
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "device_id": self.device_id,
            "device_ip": self.device_ip,
            "connection_type": self.connection_type.value,
            "status": self.status.value,
            "response_time": self.response_time,
            "last_check": self.last_check.isoformat(),
            "error_message": self.error_message,
            "consecutive_failures": self.consecutive_failures,
            "uptime_percentage": self.uptime_percentage,
            "additional_info": self.additional_info
        }


class DeviceHealthChecker:
    """设备健康检查器"""
    
    def __init__(
        self, 
        check_interval: int = 60,  # 检查间隔（秒）
        failure_threshold: int = 3,  # 连续失败阈值
        timeout: int = 10  # 检查超时时间
    ):
        self.check_interval = check_interval
        self.failure_threshold = failure_threshold
        self.timeout = timeout
        
        # 服务实例
        self.snmp_service = SNMPService()
        self.ssh_service = SSHService()
        
        # 健康检查历史记录
        self.health_history: Dict[int, List[HealthCheckResult]] = {}
        self.current_status: Dict[int, HealthCheckResult] = {}
        
        # 线程池执行器
        self.thread_executor = ThreadPoolExecutor(max_workers=20)
        
        # 运行状态
        self._running = False
        self._check_tasks: Dict[int, asyncio.Task] = {}
        
        # 回调函数列表
        self.status_change_callbacks: List[Callable[[HealthCheckResult, HealthCheckResult], None]] = []
        
        logger.info("DeviceHealthChecker initialized", 
                   check_interval=check_interval,
                   failure_threshold=failure_threshold,
                   timeout=timeout)
    
    def add_status_change_callback(self, callback: Callable[[HealthCheckResult, HealthCheckResult], None]):
        """添加状态变化回调函数"""
        self.status_change_callbacks.append(callback)
    
    def remove_status_change_callback(self, callback: Callable):
        """移除状态变化回调函数"""
        if callback in self.status_change_callbacks:
            self.status_change_callbacks.remove(callback)
    
    async def start_monitoring(self, devices: List[DeviceInfo]):
        """开始监控设备列表"""
        self._running = True
        
        for device in devices:
            task = asyncio.create_task(self._monitor_device(device))
            self._check_tasks[device.id] = task
        
        logger.info("Started health monitoring", device_count=len(devices))
    
    async def stop_monitoring(self):
        """停止所有监控"""
        self._running = False
        
        # 取消所有监控任务
        for device_id, task in self._check_tasks.items():
            if not task.done():
                task.cancel()
        
        # 等待任务完成
        if self._check_tasks:
            await asyncio.gather(*self._check_tasks.values(), return_exceptions=True)
        
        self._check_tasks.clear()
        logger.info("Stopped all health monitoring")
    
    async def _monitor_device(self, device: DeviceInfo):
        """监控单个设备"""
        device_id = device.id
        
        while self._running:
            try:
                # 执行健康检查
                health_result = await self._check_device_health(device)
                
                # 更新历史记录
                self._update_health_history(device_id, health_result)
                
                # 检查状态变化并触发回调
                previous_status = self.current_status.get(device_id)
                if previous_status and previous_status.status != health_result.status:
                    await self._notify_status_change(previous_status, health_result)
                
                # 更新当前状态
                self.current_status[device_id] = health_result
                
                logger.debug("Health check completed", 
                           device_id=device_id,
                           status=health_result.status.value,
                           response_time=health_result.response_time)
                
            except Exception as e:
                logger.error("Device health check failed", 
                           device_id=device_id,
                           device_ip=device.ip_address,
                           error=str(e))
            
            # 等待下次检查
            await asyncio.sleep(self.check_interval)
    
    async def _check_device_health(self, device: DeviceInfo) -> HealthCheckResult:
        """检查单个设备健康状态"""
        start_time = time.time()
        
        # 获取上次检查结果
        previous_result = self.current_status.get(device.id)
        consecutive_failures = previous_result.consecutive_failures if previous_result else 0
        
        try:
            # 根据设备配置选择检查方式
            connection_types = self._get_available_connection_types(device)
            
            for conn_type in connection_types:
                try:
                    if conn_type == DeviceConnectionType.SNMP:
                        success, error_msg, additional_info = await self._check_snmp_health(device)
                    elif conn_type == DeviceConnectionType.SSH:
                        success, error_msg, additional_info = await self._check_ssh_health(device)
                    else:
                        continue
                    
                    response_time = time.time() - start_time
                    
                    if success:
                        # 检查成功
                        status = HealthStatus.HEALTHY
                        consecutive_failures = 0
                        uptime_percentage = self._calculate_uptime_percentage(device.id)
                        
                        return HealthCheckResult(
                            device_id=device.id,
                            device_ip=device.ip_address,
                            connection_type=conn_type,
                            status=status,
                            response_time=response_time,
                            consecutive_failures=consecutive_failures,
                            uptime_percentage=uptime_percentage,
                            additional_info=additional_info
                        )
                    else:
                        # 记录失败但继续尝试其他连接方式
                        logger.warning("Connection type failed", 
                                     device_id=device.id,
                                     connection_type=conn_type.value,
                                     error=error_msg)
                        continue
                        
                except Exception as e:
                    logger.warning("Health check method failed",
                                 device_id=device.id,
                                 connection_type=conn_type.value,
                                 error=str(e))
                    continue
            
            # 所有连接方式都失败
            consecutive_failures += 1
            status = HealthStatus.UNHEALTHY if consecutive_failures >= self.failure_threshold else HealthStatus.DEGRADED
            
            return HealthCheckResult(
                device_id=device.id,
                device_ip=device.ip_address,
                connection_type=DeviceConnectionType.SNMP,  # 默认
                status=status,
                response_time=time.time() - start_time,
                consecutive_failures=consecutive_failures,
                error_message="All connection methods failed",
                uptime_percentage=self._calculate_uptime_percentage(device.id)
            )
            
        except Exception as e:
            # 健康检查异常
            consecutive_failures += 1
            status = HealthStatus.UNHEALTHY if consecutive_failures >= self.failure_threshold else HealthStatus.DEGRADED
            
            return HealthCheckResult(
                device_id=device.id,
                device_ip=device.ip_address,
                connection_type=DeviceConnectionType.SNMP,  # 默认
                status=status,
                response_time=time.time() - start_time,
                consecutive_failures=consecutive_failures,
                error_message=str(e),
                uptime_percentage=self._calculate_uptime_percentage(device.id)
            )
    
    def _get_available_connection_types(self, device: DeviceInfo) -> List[DeviceConnectionType]:
        """获取设备可用的连接类型"""
        connection_types = []
        
        # 检查SNMP配置
        if device.snmp_community or (device.snmp_version == "3" and device.snmp_username):
            connection_types.append(DeviceConnectionType.SNMP)
        
        # 检查SSH配置
        if device.ssh_username and device.ssh_password:
            connection_types.append(DeviceConnectionType.SSH)
        
        return connection_types or [DeviceConnectionType.SNMP]  # 默认SNMP
    
    async def _check_snmp_health(self, device: DeviceInfo) -> tuple[bool, Optional[str], Dict[str, Any]]:
        """SNMP健康检查"""
        try:
            # 连接设备
            connected = await self.snmp_service.connect(device)
            if not connected:
                return False, "SNMP connection failed", {}
            
            # 获取系统信息作为健康检查
            system_info = await self.snmp_service.get_system_info(
                device.ip_address, 
                device.snmp_community
            )
            
            await self.snmp_service.disconnect()
            
            if system_info and system_info.get("system_description"):
                additional_info = {
                    "system_uptime": system_info.get("system_uptime"),
                    "system_name": system_info.get("system_name"),
                    "detected_vendor": system_info.get("detected_vendor")
                }
                return True, None, additional_info
            else:
                return False, "No SNMP response or invalid data", {}
                
        except Exception as e:
            return False, f"SNMP health check error: {str(e)}", {}
    
    async def _check_ssh_health(self, device: DeviceInfo) -> tuple[bool, Optional[str], Dict[str, Any]]:
        """SSH健康检查"""
        try:
            # 测试SSH连接
            device_dict = device.to_dict()
            result = await self.ssh_service.test_connection_with_retry(device_dict, max_attempts=1)
            
            if result.get("success"):
                connection_result = result.get("result", {})
                additional_info = {
                    "device_type": connection_result.get("device_type"),
                    "software_version": connection_result.get("software_version"),
                    "interface_count": connection_result.get("interface_count")
                }
                return True, None, additional_info
            else:
                return False, result.get("error", "SSH connection failed"), {}
                
        except Exception as e:
            return False, f"SSH health check error: {str(e)}", {}
    
    def _update_health_history(self, device_id: int, result: HealthCheckResult):
        """更新设备健康历史记录"""
        if device_id not in self.health_history:
            self.health_history[device_id] = []
        
        history = self.health_history[device_id]
        history.append(result)
        
        # 保留最近100条记录
        if len(history) > 100:
            history.pop(0)
    
    def _calculate_uptime_percentage(self, device_id: int, hours: int = 24) -> float:
        """计算设备在指定时间内的正常运行百分比"""
        if device_id not in self.health_history:
            return 100.0
        
        cutoff_time = datetime.now() - timedelta(hours=hours)
        recent_checks = [
            result for result in self.health_history[device_id]
            if result.last_check >= cutoff_time
        ]
        
        if not recent_checks:
            return 100.0
        
        healthy_count = sum(1 for result in recent_checks if result.status == HealthStatus.HEALTHY)
        return (healthy_count / len(recent_checks)) * 100.0
    
    async def _notify_status_change(self, previous: HealthCheckResult, current: HealthCheckResult):
        """通知状态变化"""
        try:
            for callback in self.status_change_callbacks:
                if asyncio.iscoroutinefunction(callback):
                    await callback(previous, current)
                else:
                    callback(previous, current)
            
            logger.info("Device status changed",
                       device_id=current.device_id,
                       device_ip=current.device_ip,
                       previous_status=previous.status.value,
                       current_status=current.status.value)
                       
        except Exception as e:
            logger.error("Status change notification failed", 
                        device_id=current.device_id,
                        error=str(e))
    
    async def get_device_health(self, device_id: int) -> Optional[HealthCheckResult]:
        """获取设备当前健康状态"""
        return self.current_status.get(device_id)
    
    async def get_all_device_health(self) -> Dict[int, HealthCheckResult]:
        """获取所有设备健康状态"""
        return self.current_status.copy()
    
    async def get_device_health_history(self, device_id: int, limit: int = 50) -> List[HealthCheckResult]:
        """获取设备健康历史记录"""
        if device_id not in self.health_history:
            return []
        
        history = self.health_history[device_id]
        return history[-limit:] if limit > 0 else history
    
    async def perform_immediate_check(self, device: DeviceInfo) -> HealthCheckResult:
        """执行立即健康检查"""
        return await self._check_device_health(device)
    
    def get_health_summary(self) -> Dict[str, Any]:
        """获取健康状态摘要"""
        if not self.current_status:
            return {
                "total_devices": 0,
                "healthy": 0,
                "degraded": 0,
                "unhealthy": 0,
                "unknown": 0,
                "overall_health_percentage": 0.0
            }
        
        status_counts = {
            HealthStatus.HEALTHY: 0,
            HealthStatus.DEGRADED: 0,
            HealthStatus.UNHEALTHY: 0,
            HealthStatus.UNKNOWN: 0
        }
        
        for result in self.current_status.values():
            status_counts[result.status] += 1
        
        total_devices = len(self.current_status)
        healthy_percentage = (status_counts[HealthStatus.HEALTHY] / total_devices) * 100.0 if total_devices > 0 else 0.0
        
        return {
            "total_devices": total_devices,
            "healthy": status_counts[HealthStatus.HEALTHY],
            "degraded": status_counts[HealthStatus.DEGRADED],
            "unhealthy": status_counts[HealthStatus.UNHEALTHY],
            "unknown": status_counts[HealthStatus.UNKNOWN],
            "overall_health_percentage": round(healthy_percentage, 2)
        }
    
    def __del__(self):
        """析构函数，确保资源清理"""
        try:
            if self.ssh_service:
                self.ssh_service.close_connection_pool()
        except:
            pass