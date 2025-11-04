"""
任务调度器服务
"""
import asyncio
import uuid
from typing import Dict, List, Optional, Any, Callable
from datetime import datetime, timezone, timedelta
from enum import Enum
from dataclasses import dataclass, field
import structlog

from src.core.database import get_db_session_context
from src.repositories.device_repository import DeviceRepository
from src.api.websocket import ws_notifier
from src.core.influxdb import record_user_activity
from src.services.network_scanner import network_scanner

logger = structlog.get_logger()


class TaskType(str, Enum):
    """任务类型"""
    DEVICE_INSPECTION = "device_inspection"
    NETWORK_SCAN = "network_scan"
    DEVICE_BACKUP = "device_backup"
    SYSTEM_HEALTH_CHECK = "system_health_check"
    DATA_CLEANUP = "data_cleanup"
    REPORT_GENERATION = "report_generation"


class TaskStatus(str, Enum):
    """任务状态"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class ScheduledTask:
    """调度任务模型"""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    name: str = ""
    task_type: TaskType = TaskType.DEVICE_INSPECTION
    cron_expression: str = ""  # Cron表达式，如 "0 2 * * *" 表示每天2点
    enabled: bool = True
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    last_run: Optional[datetime] = None
    next_run: Optional[datetime] = None
    run_count: int = 0
    success_count: int = 0
    failure_count: int = 0
    
    # 任务配置参数
    config: Dict[str, Any] = field(default_factory=dict)
    
    # 运行时状态
    status: TaskStatus = TaskStatus.PENDING
    error_message: Optional[str] = None
    progress: float = 0.0
    
    # 任务函数（运行时设置）
    task_func: Optional[Callable] = field(default=None, init=False)


@dataclass
class TaskExecution:
    """任务执行记录"""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    task_id: str = ""
    started_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    finished_at: Optional[datetime] = None
    status: TaskStatus = TaskStatus.RUNNING
    result: Optional[Dict[str, Any]] = None
    error_message: Optional[str] = None
    duration: float = 0.0


class TaskScheduler:
    """任务调度器"""
    
    def __init__(self):
        self.tasks: Dict[str, ScheduledTask] = {}
        self.executions: Dict[str, TaskExecution] = {}
        self.running_tasks: Dict[str, asyncio.Task] = {}
        self.scheduler_task: Optional[asyncio.Task] = None
        self.is_running = False
        self.check_interval = 60  # 检查间隔（秒）
    
    async def start(self):
        """启动调度器"""
        if self.is_running:
            logger.info("Task scheduler already running")
            return
        
        self.is_running = True
        
        # 注册默认任务
        await self._register_default_tasks()
        
        # 启动调度循环
        self.scheduler_task = asyncio.create_task(self._scheduler_loop())
        
        logger.info("Task scheduler started successfully")
    
    async def stop(self):
        """停止调度器"""
        self.is_running = False
        
        # 取消调度器任务
        if self.scheduler_task:
            self.scheduler_task.cancel()
            try:
                await self.scheduler_task
            except asyncio.CancelledError:
                pass
        
        # 取消所有运行中的任务
        for task in self.running_tasks.values():
            task.cancel()
        
        if self.running_tasks:
            await asyncio.gather(*self.running_tasks.values(), return_exceptions=True)
            self.running_tasks.clear()
        
        logger.info("Task scheduler stopped")
    
    async def _register_default_tasks(self):
        """注册默认任务"""
        default_tasks = [
            ScheduledTask(
                id="daily_device_inspection",
                name="每日设备巡检",
                task_type=TaskType.DEVICE_INSPECTION,
                cron_expression="0 2 * * *",  # 每天凌晨2点
                config={
                    "check_connectivity": True,
                    "collect_metrics": True,
                    "generate_report": True
                }
            ),
            ScheduledTask(
                id="hourly_network_scan",
                name="每小时网络扫描",
                task_type=TaskType.NETWORK_SCAN,
                cron_expression="0 * * * *",  # 每小时整点
                config={
                    "networks": ["192.168.1.0/24"],
                    "scan_type": "ping"
                }
            ),
            ScheduledTask(
                id="weekly_system_health",
                name="每周系统健康检查",
                task_type=TaskType.SYSTEM_HEALTH_CHECK,
                cron_expression="0 6 * * 0",  # 每周日早上6点
                config={
                    "check_database": True,
                    "check_redis": True,
                    "check_influxdb": True,
                    "check_disk_space": True
                }
            ),
            ScheduledTask(
                id="monthly_data_cleanup",
                name="每月数据清理",
                task_type=TaskType.DATA_CLEANUP,
                cron_expression="0 1 1 * *",  # 每月1号凌晨1点
                config={
                    "cleanup_logs": True,
                    "cleanup_old_metrics": True,
                    "retention_days": 90
                }
            )
        ]
        
        for task in default_tasks:
            # 计算下次运行时间
            task.next_run = self._calculate_next_run(task.cron_expression)
            # 注册任务函数
            task.task_func = self._get_task_function(task.task_type)
            # 添加到任务列表
            self.tasks[task.id] = task
        
        logger.info(f"Registered {len(default_tasks)} default scheduled tasks")
    
    async def _scheduler_loop(self):
        """调度器主循环"""
        while self.is_running:
            try:
                current_time = datetime.now(timezone.utc)
                
                # 检查需要执行的任务
                for task_id, task in self.tasks.items():
                    if (task.enabled and 
                        task.next_run and 
                        task.next_run <= current_time and
                        task_id not in self.running_tasks):
                        
                        # 启动任务执行
                        execution_task = asyncio.create_task(
                            self._execute_task(task)
                        )
                        self.running_tasks[task_id] = execution_task
                        
                        logger.info(
                            "Task execution started",
                            task_id=task_id,
                            task_name=task.name,
                            scheduled_time=task.next_run
                        )
                
                # 清理已完成的任务
                completed_tasks = []
                for task_id, task in self.running_tasks.items():
                    if task.done():
                        completed_tasks.append(task_id)
                
                for task_id in completed_tasks:
                    del self.running_tasks[task_id]
                
                # 等待下次检查
                await asyncio.sleep(self.check_interval)
                
            except Exception as e:
                logger.error("Error in scheduler loop", error=str(e))
                await asyncio.sleep(10)  # 发生错误时短暂等待
    
    async def _execute_task(self, task: ScheduledTask):
        """执行单个任务"""
        execution = TaskExecution(
            task_id=task.id,
            started_at=datetime.now(timezone.utc)
        )
        
        self.executions[execution.id] = execution
        task.status = TaskStatus.RUNNING
        task.run_count += 1
        task.progress = 0.0
        
        try:
            # 发送任务开始通知
            await ws_notifier.notify_system_event(
                "task_started",
                f"任务 '{task.name}' 开始执行",
                task_id=task.id,
                task_name=task.name,
                task_type=task.task_type.value
            )
            
            # 执行任务函数
            if task.task_func:
                result = await task.task_func(task, execution)
                execution.result = result
                execution.status = TaskStatus.COMPLETED
                task.status = TaskStatus.COMPLETED
                task.success_count += 1
                task.progress = 100.0
                
                logger.info(
                    "Task completed successfully",
                    task_id=task.id,
                    task_name=task.name,
                    duration=execution.duration
                )
                
            else:
                raise Exception(f"No task function registered for task type: {task.task_type}")
                
        except Exception as e:
            error_msg = str(e)
            execution.status = TaskStatus.FAILED
            execution.error_message = error_msg
            task.status = TaskStatus.FAILED
            task.failure_count += 1
            task.error_message = error_msg
            task.progress = 0.0
            
            logger.error(
                "Task execution failed",
                task_id=task.id,
                task_name=task.name,
                error=error_msg
            )
            
        finally:
            # 更新执行记录
            execution.finished_at = datetime.now(timezone.utc)
            execution.duration = (execution.finished_at - execution.started_at).total_seconds()
            
            # 更新任务信息
            task.last_run = execution.started_at
            task.next_run = self._calculate_next_run(task.cron_expression, task.last_run)
            task.updated_at = datetime.now(timezone.utc)
            
            # 发送任务完成通知
            await ws_notifier.notify_system_event(
                "task_completed" if execution.status == TaskStatus.COMPLETED else "task_failed",
                f"任务 '{task.name}' {'执行完成' if execution.status == TaskStatus.COMPLETED else '执行失败'}",
                task_id=task.id,
                task_name=task.name,
                status=execution.status.value,
                duration=execution.duration,
                error=execution.error_message
            )
            
            # 记录用户活动
            await record_user_activity(
                user_id="system",
                action="task_execution",
                resource="scheduler",
                details={
                    "task_id": task.id,
                    "task_name": task.name,
                    "status": execution.status.value,
                    "duration": execution.duration
                }
            )
    
    def _get_task_function(self, task_type: TaskType) -> Optional[Callable]:
        """获取任务执行函数"""
        task_functions = {
            TaskType.DEVICE_INSPECTION: self._device_inspection_task,
            TaskType.NETWORK_SCAN: self._network_scan_task,
            TaskType.SYSTEM_HEALTH_CHECK: self._system_health_check_task,
            TaskType.DATA_CLEANUP: self._data_cleanup_task,
            TaskType.DEVICE_BACKUP: self._device_backup_task,
            TaskType.REPORT_GENERATION: self._report_generation_task
        }
        
        return task_functions.get(task_type)
    
    def _calculate_next_run(self, cron_expression: str, from_time: Optional[datetime] = None) -> datetime:
        """计算下次运行时间（简化的cron解析）"""
        if from_time is None:
            from_time = datetime.now(timezone.utc)
        
        # 简化的cron解析实现
        # 格式: "分 时 日 月 周"
        # 例如: "0 2 * * *" = 每天2点
        parts = cron_expression.split()
        if len(parts) != 5:
            # 默认返回1小时后
            return from_time + timedelta(hours=1)
        
        minute, hour, day, month, weekday = parts
        
        # 简单实现：只支持每小时和每天的调度
        if hour == "*" and minute.isdigit():
            # 每小时执行
            next_run = from_time.replace(minute=int(minute), second=0, microsecond=0)
            if next_run <= from_time:
                next_run += timedelta(hours=1)
            return next_run
        
        elif hour.isdigit() and minute.isdigit():
            # 每天执行
            next_run = from_time.replace(
                hour=int(hour),
                minute=int(minute),
                second=0,
                microsecond=0
            )
            if next_run <= from_time:
                next_run += timedelta(days=1)
            return next_run
        
        # 默认1小时后
        return from_time + timedelta(hours=1)
    
    # 任务执行函数
    async def _device_inspection_task(self, task: ScheduledTask, execution: TaskExecution) -> Dict[str, Any]:
        """设备巡检任务"""
        logger.info("Starting device inspection task", task_id=task.id)
        
        try:
            async with get_db_session_context() as session:
                device_repo = DeviceRepository(session)
                devices, _ = await device_repo.get_devices_paginated(
                    page=1, page_size=1000, is_active=True
                )
            
            total_devices = len(devices)
            inspected_count = 0
            online_count = 0
            offline_count = 0
            
            for i, device in enumerate(devices):
                # 更新进度
                task.progress = (i / total_devices) * 100
                
                # 模拟设备检查
                await asyncio.sleep(0.1)  # 模拟检查耗时
                
                # 随机模拟设备状态
                import random
                is_online = random.random() > 0.1  # 90%在线率
                
                if is_online:
                    online_count += 1
                else:
                    offline_count += 1
                    # 发送离线告警
                    await ws_notifier.notify_alert(
                        "device_offline",
                        "warning",
                        f"巡检发现设备 {device.name} 离线",
                        device_id=device.id,
                        device_name=device.name,
                        ip_address=device.ip_address
                    )
                
                inspected_count += 1
            
            result = {
                "total_devices": total_devices,
                "inspected_count": inspected_count,
                "online_count": online_count,
                "offline_count": offline_count,
                "success_rate": (online_count / total_devices * 100) if total_devices > 0 else 0
            }
            
            logger.info(
                "Device inspection completed",
                task_id=task.id,
                **result
            )
            
            return result
            
        except Exception as e:
            logger.error("Device inspection task failed", task_id=task.id, error=str(e))
            raise
    
    async def _network_scan_task(self, task: ScheduledTask, execution: TaskExecution) -> Dict[str, Any]:
        """网络扫描任务"""
        logger.info("Starting network scan task", task_id=task.id)
        
        config = task.config
        networks = config.get("networks", ["192.168.1.0/24"])
        scan_type = config.get("scan_type", "ping")
        
        total_discovered = 0
        scan_results = []
        
        for i, network in enumerate(networks):
            task.progress = (i / len(networks)) * 100
            
            # 模拟网络扫描
            await asyncio.sleep(2)
            
            # 模拟扫描结果
            import random
            discovered_count = random.randint(5, 20)
            total_discovered += discovered_count
            
            scan_results.append({
                "network": network,
                "discovered_devices": discovered_count,
                "scan_type": scan_type
            })
            
            # 发送扫描进度通知
            await ws_notifier.notify_scan_progress(
                execution.id,
                int(task.progress),
                "scanning",
                network=network,
                discovered=discovered_count
            )
        
        result = {
            "scanned_networks": len(networks),
            "total_discovered": total_discovered,
            "scan_results": scan_results
        }
        
        logger.info("Network scan completed", task_id=task.id, **result)
        return result
    
    async def _system_health_check_task(self, task: ScheduledTask, execution: TaskExecution) -> Dict[str, Any]:
        """系统健康检查任务"""
        logger.info("Starting system health check", task_id=task.id)
        
        config = task.config
        health_status = {}
        
        # 检查数据库
        if config.get("check_database", True):
            task.progress = 25
            try:
                async with get_db_session_context() as session:
                    result = await session.execute("SELECT 1")
                    health_status["database"] = "healthy"
            except Exception as e:
                health_status["database"] = f"error: {str(e)}"
        
        # 检查Redis
        if config.get("check_redis", True):
            task.progress = 50
            from src.core.redis import redis_manager
            health_status["redis"] = "healthy" if redis_manager.is_connected else "disconnected"
        
        # 检查InfluxDB
        if config.get("check_influxdb", True):
            task.progress = 75
            from src.core.influxdb import influxdb_client
            health_status["influxdb"] = "healthy" if influxdb_client.is_connected else "disconnected"
        
        # 检查磁盘空间
        if config.get("check_disk_space", True):
            task.progress = 100
            import shutil
            try:
                disk_usage = shutil.disk_usage("/")
                free_space_gb = disk_usage.free / (1024**3)
                health_status["disk_space"] = {
                    "free_gb": round(free_space_gb, 2),
                    "status": "healthy" if free_space_gb > 10 else "low"
                }
            except Exception as e:
                health_status["disk_space"] = f"error: {str(e)}"
        
        # 发送健康检查结果通知
        unhealthy_components = [
            k for k, v in health_status.items() 
            if isinstance(v, str) and ("error" in v or v == "disconnected")
        ]
        
        if unhealthy_components:
            await ws_notifier.notify_alert(
                "system_health",
                "warning",
                f"系统健康检查发现问题: {', '.join(unhealthy_components)}",
                components=unhealthy_components,
                health_status=health_status
            )
        
        result = {
            "health_status": health_status,
            "overall_status": "healthy" if not unhealthy_components else "warning",
            "unhealthy_components": unhealthy_components
        }
        
        logger.info("System health check completed", task_id=task.id, **result)
        return result
    
    async def _data_cleanup_task(self, task: ScheduledTask, execution: TaskExecution) -> Dict[str, Any]:
        """数据清理任务"""
        logger.info("Starting data cleanup task", task_id=task.id)
        
        config = task.config
        retention_days = config.get("retention_days", 90)
        cleanup_results = {}
        
        # 模拟清理操作
        if config.get("cleanup_logs", True):
            task.progress = 50
            await asyncio.sleep(1)
            cleanup_results["logs"] = "cleaned old log files"
        
        if config.get("cleanup_old_metrics", True):
            task.progress = 100
            await asyncio.sleep(1)
            cleanup_results["metrics"] = f"cleaned metrics older than {retention_days} days"
        
        result = {
            "retention_days": retention_days,
            "cleanup_results": cleanup_results
        }
        
        logger.info("Data cleanup completed", task_id=task.id, **result)
        return result
    
    async def _device_backup_task(self, task: ScheduledTask, execution: TaskExecution) -> Dict[str, Any]:
        """设备备份任务"""
        logger.info("Starting device backup task", task_id=task.id)
        
        # 模拟备份操作
        await asyncio.sleep(3)
        task.progress = 100
        
        result = {
            "backed_up_devices": 10,
            "backup_size_mb": 245.8,
            "backup_location": "/data/backups"
        }
        
        logger.info("Device backup completed", task_id=task.id, **result)
        return result
    
    async def _report_generation_task(self, task: ScheduledTask, execution: TaskExecution) -> Dict[str, Any]:
        """报表生成任务"""
        logger.info("Starting report generation task", task_id=task.id)
        
        # 模拟报表生成
        await asyncio.sleep(2)
        task.progress = 100
        
        result = {
            "generated_reports": ["daily_status", "device_health", "network_summary"],
            "report_format": "PDF",
            "report_location": "/data/reports"
        }
        
        logger.info("Report generation completed", task_id=task.id, **result)
        return result
    
    # 管理接口
    async def add_task(self, task: ScheduledTask) -> bool:
        """添加新任务"""
        try:
            task.next_run = self._calculate_next_run(task.cron_expression)
            task.task_func = self._get_task_function(task.task_type)
            self.tasks[task.id] = task
            
            logger.info("Task added", task_id=task.id, task_name=task.name)
            return True
        except Exception as e:
            logger.error("Failed to add task", task_id=task.id, error=str(e))
            return False
    
    async def remove_task(self, task_id: str) -> bool:
        """删除任务"""
        try:
            if task_id in self.tasks:
                # 如果任务正在运行，先取消
                if task_id in self.running_tasks:
                    self.running_tasks[task_id].cancel()
                    del self.running_tasks[task_id]
                
                del self.tasks[task_id]
                logger.info("Task removed", task_id=task_id)
                return True
            return False
        except Exception as e:
            logger.error("Failed to remove task", task_id=task_id, error=str(e))
            return False
    
    async def enable_task(self, task_id: str) -> bool:
        """启用任务"""
        if task_id in self.tasks:
            self.tasks[task_id].enabled = True
            self.tasks[task_id].updated_at = datetime.now(timezone.utc)
            logger.info("Task enabled", task_id=task_id)
            return True
        return False
    
    async def disable_task(self, task_id: str) -> bool:
        """禁用任务"""
        if task_id in self.tasks:
            self.tasks[task_id].enabled = False
            self.tasks[task_id].updated_at = datetime.now(timezone.utc)
            logger.info("Task disabled", task_id=task_id)
            return True
        return False
    
    async def get_task_status(self, task_id: str) -> Optional[Dict[str, Any]]:
        """获取任务状态"""
        if task_id not in self.tasks:
            return None
        
        task = self.tasks[task_id]
        return {
            "id": task.id,
            "name": task.name,
            "task_type": task.task_type.value,
            "enabled": task.enabled,
            "status": task.status.value,
            "progress": task.progress,
            "last_run": task.last_run.isoformat() if task.last_run else None,
            "next_run": task.next_run.isoformat() if task.next_run else None,
            "run_count": task.run_count,
            "success_count": task.success_count,
            "failure_count": task.failure_count,
            "error_message": task.error_message
        }
    
    async def get_all_tasks_status(self) -> List[Dict[str, Any]]:
        """获取所有任务状态"""
        return [
            await self.get_task_status(task_id) 
            for task_id in self.tasks.keys()
        ]
    
    async def get_scheduler_stats(self) -> Dict[str, Any]:
        """获取调度器统计信息"""
        total_tasks = len(self.tasks)
        enabled_tasks = len([t for t in self.tasks.values() if t.enabled])
        running_tasks = len(self.running_tasks)
        
        return {
            "is_running": self.is_running,
            "check_interval": self.check_interval,
            "total_tasks": total_tasks,
            "enabled_tasks": enabled_tasks,
            "running_tasks": running_tasks,
            "total_executions": len(self.executions),
            "uptime": datetime.now(timezone.utc).isoformat()
        }


# 全局任务调度器实例
task_scheduler = TaskScheduler()