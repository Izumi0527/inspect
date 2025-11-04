"""
巡检任务执行器

提供设备巡检任务的执行、调度和结果处理功能。
支持多协议设备巡检，包括SNMP、SSH等。
"""

import asyncio
import json
from dataclasses import dataclass, field
from enum import Enum
from typing import Dict, List, Optional, Any, Union, Callable
from datetime import datetime, timezone, timedelta
import structlog

from src.core.snmp import SNMPClient, SNMPVersion, create_snmp_client, CommonOIDs
from src.core.ssh import SSHClient, create_ssh_client, DeviceCommands
from src.services.device_performance import (
    DevicePerformanceCollector,
    DeviceMonitoringConfig,
    DeviceType,
    MonitoringProtocol,
    DeviceCredentials
)
from src.core.influxdb import influxdb_client
from src.core.database import get_db_session

logger = structlog.get_logger()


class InspectionItemType(Enum):
    """巡检项类型"""
    CONNECTIVITY = "connectivity"           # 连通性检查
    PERFORMANCE = "performance"            # 性能指标检查
    CONFIGURATION = "configuration"        # 配置检查
    RESOURCE = "resource"                  # 资源使用率检查
    SERVICE = "service"                    # 服务状态检查
    SECURITY = "security"                  # 安全配置检查
    CUSTOM_SNMP = "custom_snmp"           # 自定义SNMP查询
    CUSTOM_SSH = "custom_ssh"             # 自定义SSH命令


class InspectionStatus(Enum):
    """巡检状态"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class CheckResult(Enum):
    """检查结果"""
    PASS = "pass"
    FAIL = "fail"
    WARNING = "warning"
    SKIP = "skip"
    ERROR = "error"


@dataclass
class InspectionItem:
    """巡检项配置"""
    id: str
    name: str
    description: str
    item_type: InspectionItemType
    protocol: MonitoringProtocol
    parameters: Dict[str, Any] = field(default_factory=dict)
    threshold: Optional[Dict[str, Any]] = None
    enabled: bool = True
    timeout: float = 30.0


@dataclass
class InspectionTemplate:
    """巡检模板"""
    id: int
    name: str
    description: str
    device_types: List[DeviceType]
    inspection_items: List[InspectionItem]
    is_default: bool = False
    is_active: bool = True


@dataclass
class InspectionResult:
    """单个巡检项结果"""
    item_id: str
    item_name: str
    result: CheckResult
    expected_value: Optional[Any] = None
    actual_value: Optional[Any] = None
    message: Optional[str] = None
    execution_time: float = 0.0
    timestamp: Optional[datetime] = None
    details: Optional[Dict[str, Any]] = None


@dataclass
class InspectionReport:
    """巡检报告"""
    inspection_id: int
    device_id: int
    template_id: Optional[int]
    status: InspectionStatus
    start_time: datetime
    end_time: Optional[datetime] = None
    total_items: int = 0
    passed_items: int = 0
    failed_items: int = 0
    warning_items: int = 0
    error_items: int = 0
    results: List[InspectionResult] = field(default_factory=list)
    error_message: Optional[str] = None


class InspectionExecutor:
    """巡检任务执行器"""

    def __init__(self):
        self.performance_collector = DevicePerformanceCollector()
        self.logger = logger.bind(component="inspection_executor")
        self.running_inspections: Dict[int, asyncio.Task] = {}

    async def execute_inspection(
        self,
        inspection_id: int,
        device_config: DeviceMonitoringConfig,
        template: InspectionTemplate
    ) -> InspectionReport:
        """
        执行设备巡检
        
        Args:
            inspection_id: 巡检任务ID
            device_config: 设备配置
            template: 巡检模板
            
        Returns:
            巡检报告
        """
        start_time = datetime.now(timezone.utc)
        report = InspectionReport(
            inspection_id=inspection_id,
            device_id=device_config.device_id,
            template_id=template.id,
            status=InspectionStatus.RUNNING,
            start_time=start_time
        )

        self.logger.info(
            "开始执行设备巡检",
            inspection_id=inspection_id,
            device_id=device_config.device_id,
            device_name=device_config.device_name,
            template_name=template.name
        )

        try:
            # 创建异步任务
            task = asyncio.create_task(self._execute_inspection_task(device_config, template, report))
            self.running_inspections[inspection_id] = task
            
            # 等待任务完成
            await task
            
            # 更新报告状态
            report.end_time = datetime.now(timezone.utc)
            report.status = InspectionStatus.COMPLETED
            
            # 统计结果
            self._calculate_statistics(report)
            
            self.logger.info(
                "设备巡检执行完成",
                inspection_id=inspection_id,
                device_id=device_config.device_id,
                total_items=report.total_items,
                passed_items=report.passed_items,
                failed_items=report.failed_items,
                execution_time=(report.end_time - report.start_time).total_seconds()
            )

        except asyncio.CancelledError:
            report.status = InspectionStatus.CANCELLED
            report.error_message = "巡检任务被取消"
            self.logger.warning("巡检任务被取消", inspection_id=inspection_id)
        except Exception as e:
            report.status = InspectionStatus.FAILED
            report.error_message = str(e)
            report.end_time = datetime.now(timezone.utc)
            
            self.logger.error(
                "巡检任务执行失败",
                inspection_id=inspection_id,
                error=str(e)
            )
        finally:
            # 清理运行中的任务
            self.running_inspections.pop(inspection_id, None)

        return report

    async def _execute_inspection_task(
        self,
        device_config: DeviceMonitoringConfig,
        template: InspectionTemplate,
        report: InspectionReport
    ):
        """执行巡检任务的具体逻辑"""
        
        # 准备连接客户端
        snmp_client = None
        ssh_client = None
        
        try:
            # 根据巡检项需要建立连接
            protocols_needed = set()
            for item in template.inspection_items:
                if item.enabled:
                    protocols_needed.add(item.protocol)
            
            # 建立SNMP连接
            if MonitoringProtocol.SNMP in protocols_needed:
                snmp_client = await self._create_snmp_client(device_config)
            
            # 建立SSH连接
            if MonitoringProtocol.SSH in protocols_needed:
                ssh_client = await self._create_ssh_client(device_config)
            
            # 执行各个巡检项
            for item in template.inspection_items:
                if not item.enabled:
                    continue
                    
                result = await self._execute_inspection_item(
                    item, device_config, snmp_client, ssh_client
                )
                report.results.append(result)
                
        finally:
            # 关闭连接
            if snmp_client:
                try:
                    await snmp_client.__aexit__(None, None, None)
                except:
                    pass
            if ssh_client:
                try:
                    await ssh_client.__aexit__(None, None, None)
                except:
                    pass

    async def _execute_inspection_item(
        self,
        item: InspectionItem,
        device_config: DeviceMonitoringConfig,
        snmp_client: Optional[SNMPClient],
        ssh_client: Optional[SSHClient]
    ) -> InspectionResult:
        """执行单个巡检项"""
        start_time = asyncio.get_event_loop().time()
        
        result = InspectionResult(
            item_id=item.id,
            item_name=item.name,
            result=CheckResult.ERROR,
            timestamp=datetime.now(timezone.utc)
        )

        try:
            self.logger.debug(f"执行巡检项: {item.name}", item_type=item.item_type.value)
            
            # 根据巡检项类型执行相应的检查
            if item.item_type == InspectionItemType.CONNECTIVITY:
                await self._check_connectivity(item, device_config, result, snmp_client, ssh_client)
            elif item.item_type == InspectionItemType.PERFORMANCE:
                await self._check_performance(item, device_config, result, snmp_client, ssh_client)
            elif item.item_type == InspectionItemType.RESOURCE:
                await self._check_resource_usage(item, device_config, result, snmp_client, ssh_client)
            elif item.item_type == InspectionItemType.CONFIGURATION:
                await self._check_configuration(item, device_config, result, ssh_client)
            elif item.item_type == InspectionItemType.SERVICE:
                await self._check_service_status(item, device_config, result, ssh_client)
            elif item.item_type == InspectionItemType.CUSTOM_SNMP:
                await self._execute_custom_snmp(item, device_config, result, snmp_client)
            elif item.item_type == InspectionItemType.CUSTOM_SSH:
                await self._execute_custom_ssh(item, device_config, result, ssh_client)
            else:
                result.result = CheckResult.SKIP
                result.message = f"不支持的巡检项类型: {item.item_type.value}"
            
            # 如果没有设置结果，默认为通过
            if result.result == CheckResult.ERROR and not result.message:
                result.result = CheckResult.PASS
                
        except Exception as e:
            result.result = CheckResult.ERROR
            result.message = f"巡检项执行异常: {str(e)}"
            self.logger.error(f"巡检项执行失败: {item.name}", error=str(e))
        
        result.execution_time = asyncio.get_event_loop().time() - start_time
        return result

    async def _check_connectivity(
        self,
        item: InspectionItem,
        device_config: DeviceMonitoringConfig,
        result: InspectionResult,
        snmp_client: Optional[SNMPClient],
        ssh_client: Optional[SSHClient]
    ):
        """检查设备连通性"""
        if item.protocol == MonitoringProtocol.SNMP and snmp_client:
            connection_ok = await snmp_client.test_connection()
            result.result = CheckResult.PASS if connection_ok else CheckResult.FAIL
            result.actual_value = "在线" if connection_ok else "离线"
            result.message = "SNMP连接正常" if connection_ok else "SNMP连接失败"
            
        elif item.protocol == MonitoringProtocol.SSH and ssh_client:
            connection_ok = await ssh_client.test_connection()
            result.result = CheckResult.PASS if connection_ok else CheckResult.FAIL
            result.actual_value = "在线" if connection_ok else "离线"
            result.message = "SSH连接正常" if connection_ok else "SSH连接失败"
        else:
            result.result = CheckResult.ERROR
            result.message = "无可用的连接客户端"

    async def _check_performance(
        self,
        item: InspectionItem,
        device_config: DeviceMonitoringConfig,
        result: InspectionResult,
        snmp_client: Optional[SNMPClient],
        ssh_client: Optional[SSHClient]
    ):
        """检查性能指标"""
        # 使用性能采集器获取指标
        device_status = await self.performance_collector.collect_device_metrics(device_config)
        
        if not device_status.metrics:
            result.result = CheckResult.ERROR
            result.message = "无法获取性能指标"
            return
        
        # 查找指定的性能指标
        metric_name = item.parameters.get("metric_name", "cpu_usage")
        target_metric = None
        
        for metric in device_status.metrics:
            if metric.name == metric_name:
                target_metric = metric
                break
        
        if not target_metric:
            result.result = CheckResult.ERROR
            result.message = f"未找到性能指标: {metric_name}"
            return
        
        result.actual_value = target_metric.value
        
        # 检查阈值
        if item.threshold:
            self._check_threshold(result, item.threshold)
        else:
            result.result = CheckResult.PASS
            result.message = f"{metric_name}: {target_metric.value}"

    async def _check_resource_usage(
        self,
        item: InspectionItem,
        device_config: DeviceMonitoringConfig,
        result: InspectionResult,
        snmp_client: Optional[SNMPClient],
        ssh_client: Optional[SSHClient]
    ):
        """检查资源使用率"""
        if item.protocol == MonitoringProtocol.SNMP and snmp_client:
            await self._check_resource_usage_snmp(item, result, snmp_client)
        elif item.protocol == MonitoringProtocol.SSH and ssh_client:
            await self._check_resource_usage_ssh(item, result, ssh_client)
        else:
            result.result = CheckResult.ERROR
            result.message = "无可用的连接客户端"

    async def _check_resource_usage_snmp(
        self,
        item: InspectionItem,
        result: InspectionResult,
        snmp_client: SNMPClient
    ):
        """通过SNMP检查资源使用率"""
        resource_type = item.parameters.get("resource_type", "cpu")
        
        if resource_type == "cpu":
            # 检查CPU使用率
            cpu_results = await snmp_client.walk(CommonOIDs.HR_PROCESSOR_LOAD)
            if cpu_results and not cpu_results[0].error:
                cpu_loads = [int(r.value) for r in cpu_results if not r.error]
                if cpu_loads:
                    avg_cpu = sum(cpu_loads) / len(cpu_loads)
                    result.actual_value = avg_cpu
                    
                    if item.threshold:
                        self._check_threshold(result, item.threshold)
                    else:
                        result.result = CheckResult.PASS
                        result.message = f"CPU使用率: {avg_cpu}%"
                else:
                    result.result = CheckResult.ERROR
                    result.message = "无法获取CPU使用率数据"
            else:
                result.result = CheckResult.ERROR
                result.message = "SNMP查询CPU使用率失败"
                
        elif resource_type == "memory":
            # 检查内存使用率 
            storage_results = await snmp_client.walk(CommonOIDs.HR_STORAGE_SIZE)
            used_results = await snmp_client.walk(CommonOIDs.HR_STORAGE_USED)
            
            if storage_results and used_results:
                total_memory = sum(int(r.value) for r in storage_results[:3] if not r.error)
                used_memory = sum(int(r.value) for r in used_results[:3] if not r.error)
                
                if total_memory > 0:
                    memory_usage = (used_memory / total_memory) * 100
                    result.actual_value = memory_usage
                    
                    if item.threshold:
                        self._check_threshold(result, item.threshold)
                    else:
                        result.result = CheckResult.PASS
                        result.message = f"内存使用率: {memory_usage:.1f}%"
                else:
                    result.result = CheckResult.ERROR
                    result.message = "内存数据异常"
            else:
                result.result = CheckResult.ERROR
                result.message = "SNMP查询内存使用率失败"

    async def _check_resource_usage_ssh(
        self,
        item: InspectionItem,
        result: InspectionResult,
        ssh_client: SSHClient
    ):
        """通过SSH检查资源使用率"""
        resource_type = item.parameters.get("resource_type", "cpu")
        
        if resource_type == "memory":
            # 检查内存使用率
            cmd_result = await ssh_client.execute_command("free -m")
            if cmd_result.exit_code == 0:
                lines = cmd_result.stdout.strip().split('\n')
                for line in lines:
                    if 'Mem:' in line:
                        parts = line.split()
                        if len(parts) >= 3:
                            total = int(parts[1])
                            used = int(parts[2])
                            memory_usage = (used / total) * 100
                            result.actual_value = memory_usage
                            
                            if item.threshold:
                                self._check_threshold(result, item.threshold)
                            else:
                                result.result = CheckResult.PASS
                                result.message = f"内存使用率: {memory_usage:.1f}%"
                            return
                
                result.result = CheckResult.ERROR
                result.message = "无法解析内存使用率数据"
            else:
                result.result = CheckResult.ERROR
                result.message = f"SSH命令执行失败: {cmd_result.stderr}"

    async def _check_configuration(
        self,
        item: InspectionItem,
        device_config: DeviceMonitoringConfig,
        result: InspectionResult,
        ssh_client: Optional[SSHClient]
    ):
        """检查设备配置"""
        if not ssh_client:
            result.result = CheckResult.ERROR
            result.message = "SSH连接不可用"
            return
        
        command = item.parameters.get("command", "")
        expected_pattern = item.parameters.get("expected_pattern", "")
        
        if not command:
            result.result = CheckResult.ERROR
            result.message = "未指定检查命令"
            return
        
        cmd_result = await ssh_client.execute_command(command)
        if cmd_result.exit_code == 0:
            result.actual_value = cmd_result.stdout.strip()
            
            if expected_pattern:
                import re
                if re.search(expected_pattern, cmd_result.stdout):
                    result.result = CheckResult.PASS
                    result.message = "配置检查通过"
                else:
                    result.result = CheckResult.FAIL
                    result.message = "配置不符合预期"
            else:
                result.result = CheckResult.PASS
                result.message = "配置检查完成"
        else:
            result.result = CheckResult.ERROR
            result.message = f"命令执行失败: {cmd_result.stderr}"

    async def _check_service_status(
        self,
        item: InspectionItem,
        device_config: DeviceMonitoringConfig,
        result: InspectionResult,
        ssh_client: Optional[SSHClient]
    ):
        """检查服务状态"""
        if not ssh_client:
            result.result = CheckResult.ERROR
            result.message = "SSH连接不可用"
            return
        
        service_name = item.parameters.get("service_name", "")
        if not service_name:
            result.result = CheckResult.ERROR
            result.message = "未指定服务名称"
            return
        
        # 检查系统服务状态
        cmd_result = await ssh_client.execute_command(f"systemctl is-active {service_name}")
        if cmd_result.exit_code == 0:
            status = cmd_result.stdout.strip()
            result.actual_value = status
            
            if status == "active":
                result.result = CheckResult.PASS
                result.message = f"服务 {service_name} 运行正常"
            else:
                result.result = CheckResult.FAIL
                result.message = f"服务 {service_name} 状态异常: {status}"
        else:
            result.result = CheckResult.ERROR
            result.message = f"无法检查服务状态: {cmd_result.stderr}"

    async def _execute_custom_snmp(
        self,
        item: InspectionItem,
        device_config: DeviceMonitoringConfig,
        result: InspectionResult,
        snmp_client: Optional[SNMPClient]
    ):
        """执行自定义SNMP查询"""
        if not snmp_client:
            result.result = CheckResult.ERROR
            result.message = "SNMP连接不可用"
            return
        
        oid = item.parameters.get("oid", "")
        if not oid:
            result.result = CheckResult.ERROR
            result.message = "未指定OID"
            return
        
        snmp_results = await snmp_client.get([oid])
        if snmp_results and not snmp_results[0].error:
            result.actual_value = snmp_results[0].value
            
            if item.threshold:
                self._check_threshold(result, item.threshold)
            else:
                result.result = CheckResult.PASS
                result.message = f"SNMP查询成功: {snmp_results[0].value}"
        else:
            result.result = CheckResult.ERROR
            result.message = f"SNMP查询失败: {snmp_results[0].error if snmp_results else '无响应'}"

    async def _execute_custom_ssh(
        self,
        item: InspectionItem,
        device_config: DeviceMonitoringConfig,
        result: InspectionResult,
        ssh_client: Optional[SSHClient]
    ):
        """执行自定义SSH命令"""
        if not ssh_client:
            result.result = CheckResult.ERROR
            result.message = "SSH连接不可用"
            return
        
        command = item.parameters.get("command", "")
        if not command:
            result.result = CheckResult.ERROR
            result.message = "未指定SSH命令"
            return
        
        cmd_result = await ssh_client.execute_command(command, timeout=item.timeout)
        
        if cmd_result.exit_code == 0:
            result.actual_value = cmd_result.stdout.strip()
            
            if item.threshold:
                # 尝试将输出转换为数值进行阈值检查
                try:
                    numeric_value = float(result.actual_value)
                    result.actual_value = numeric_value
                    self._check_threshold(result, item.threshold)
                except ValueError:
                    result.result = CheckResult.PASS
                    result.message = "SSH命令执行成功"
            else:
                result.result = CheckResult.PASS
                result.message = "SSH命令执行成功"
        else:
            result.result = CheckResult.ERROR
            result.message = f"SSH命令执行失败: {cmd_result.stderr}"

    def _check_threshold(self, result: InspectionResult, threshold: Dict[str, Any]):
        """检查阈值"""
        if not isinstance(result.actual_value, (int, float)):
            result.result = CheckResult.ERROR
            result.message = "无法对非数值进行阈值检查"
            return
        
        value = float(result.actual_value)
        
        # 检查临界阈值
        if "critical_min" in threshold and value < threshold["critical_min"]:
            result.result = CheckResult.FAIL
            result.message = f"值 {value} 低于临界最小值 {threshold['critical_min']}"
            return
        
        if "critical_max" in threshold and value > threshold["critical_max"]:
            result.result = CheckResult.FAIL
            result.message = f"值 {value} 超过临界最大值 {threshold['critical_max']}"
            return
        
        # 检查警告阈值
        if "warning_min" in threshold and value < threshold["warning_min"]:
            result.result = CheckResult.WARNING
            result.message = f"值 {value} 低于警告最小值 {threshold['warning_min']}"
            return
        
        if "warning_max" in threshold and value > threshold["warning_max"]:
            result.result = CheckResult.WARNING
            result.message = f"值 {value} 超过警告最大值 {threshold['warning_max']}"
            return
        
        # 通过所有阈值检查
        result.result = CheckResult.PASS
        result.message = f"值 {value} 在正常范围内"

    def _calculate_statistics(self, report: InspectionReport):
        """计算巡检统计信息"""
        report.total_items = len(report.results)
        report.passed_items = sum(1 for r in report.results if r.result == CheckResult.PASS)
        report.failed_items = sum(1 for r in report.results if r.result == CheckResult.FAIL)
        report.warning_items = sum(1 for r in report.results if r.result == CheckResult.WARNING)
        report.error_items = sum(1 for r in report.results if r.result == CheckResult.ERROR)

    async def _create_snmp_client(self, device_config: DeviceMonitoringConfig) -> SNMPClient:
        """创建SNMP客户端"""
        creds = device_config.credentials
        
        client = await create_snmp_client(
            host=device_config.ip_address,
            port=device_config.snmp_port,
            version=creds.snmp_version or SNMPVersion.V2C,
            community=creds.snmp_community or "public",
            username=creds.snmp_username,
            security_level=creds.snmp_security_level,
            auth_protocol=creds.snmp_auth_protocol,
            auth_key=creds.snmp_auth_key,
            priv_protocol=creds.snmp_priv_protocol,
            priv_key=creds.snmp_priv_key,
            timeout=device_config.timeout
        )
        
        await client.__aenter__()
        return client

    async def _create_ssh_client(self, device_config: DeviceMonitoringConfig) -> SSHClient:
        """创建SSH客户端"""
        creds = device_config.credentials
        
        client = await create_ssh_client(
            host=device_config.ip_address,
            username=creds.ssh_username,
            password=creds.ssh_password,
            private_key_path=creds.ssh_private_key,
            port=device_config.ssh_port,
            timeout=device_config.timeout,
            auth_method=creds.ssh_auth_method
        )
        
        await client.__aenter__()
        return client

    async def cancel_inspection(self, inspection_id: int) -> bool:
        """取消巡检任务"""
        task = self.running_inspections.get(inspection_id)
        if task and not task.done():
            task.cancel()
            self.logger.info("巡检任务已取消", inspection_id=inspection_id)
            return True
        return False

    def get_running_inspections(self) -> List[int]:
        """获取正在运行的巡检任务ID列表"""
        return [
            inspection_id for inspection_id, task in self.running_inspections.items()
            if not task.done()
        ]


# 全局巡检执行器实例
inspection_executor = InspectionExecutor()