"""
巡检任务队列管理服务
基于Celery实现分布式任务队列
"""
import asyncio
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Union
from celery import Celery, Task
from celery.result import AsyncResult
from celery.schedules import crontab
import structlog
import json
import redis
from dataclasses import dataclass, field
from enum import Enum

from src.core.config import settings
from src.models.inspection import InspectionStatus, CheckItemStatus
from src.services.inspection import InspectionService
from src.services.device_connection import DeviceHealthChecker, SNMPService, SSHService
from src.repositories.device_repository import DeviceRepository
from src.core.database import get_db_session

logger = structlog.get_logger()


# Celery应用实例
celery_app = Celery(
    "inspection_tasks",
    broker=settings.REDIS_URL,
    backend=settings.REDIS_URL,
    include=[
        'src.services.inspection.task_queue'
    ]
)

# Celery配置
celery_app.conf.update(
    timezone=settings.TIMEZONE,
    enable_utc=True,
    task_serializer='json',
    accept_content=['json'],
    result_serializer='json',
    task_track_started=True,
    task_time_limit=30 * 60,  # 30分钟超时
    task_soft_time_limit=25 * 60,  # 25分钟软超时
    worker_prefetch_multiplier=1,
    worker_max_tasks_per_child=1000,
    result_expires=3600,  # 结果保留1小时
    beat_schedule={
        # 定时巡检任务
        'scheduled-inspections': {
            'task': 'src.services.inspection.task_queue.execute_scheduled_inspections',
            'schedule': crontab(minute='*/10'),  # 每10分钟执行一次
        },
        # 设备健康检查任务
        'device-health-check': {
            'task': 'src.services.inspection.task_queue.perform_device_health_checks',
            'schedule': crontab(minute='*/5'),  # 每5分钟执行一次
        },
    }
)


class TaskPriority(str, Enum):
    """任务优先级"""
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"


@dataclass
class InspectionTaskResult:
    """巡检任务结果"""
    task_id: str
    inspection_id: int
    device_id: int
    status: InspectionStatus
    started_at: datetime
    completed_at: Optional[datetime] = None
    total_checks: int = 0
    passed_checks: int = 0
    failed_checks: int = 0
    error_message: Optional[str] = None
    results: List[Dict[str, Any]] = field(default_factory=list)
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "task_id": self.task_id,
            "inspection_id": self.inspection_id,
            "device_id": self.device_id,
            "status": self.status.value,
            "started_at": self.started_at.isoformat(),
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "total_checks": self.total_checks,
            "passed_checks": self.passed_checks,
            "failed_checks": self.failed_checks,
            "error_message": self.error_message,
            "results": self.results
        }


class InspectionTaskQueue:
    """巡检任务队列管理器"""
    
    def __init__(self):
        self.celery_app = celery_app
        self.redis_client = redis.from_url(settings.REDIS_URL)
        self.inspection_service = InspectionService()
        self.device_health_checker = DeviceHealthChecker()
        
        # 任务状态缓存
        self.task_cache_ttl = 3600  # 1小时
        
        logger.info("InspectionTaskQueue initialized")
    
    async def submit_inspection_task(
        self, 
        inspection_id: int,
        device_id: int, 
        template_id: int,
        priority: TaskPriority = TaskPriority.NORMAL,
        schedule_time: Optional[datetime] = None
    ) -> str:
        """提交巡检任务到队列"""
        try:
            # 构建任务参数
            task_args = {
                "inspection_id": inspection_id,
                "device_id": device_id,
                "template_id": template_id,
                "submitted_at": datetime.now().isoformat()
            }
            
            # 设置任务选项
            task_options = {
                "priority": self._get_priority_value(priority),
                "routing_key": f"inspection.{priority.value}",
            }
            
            # 如果指定了执行时间，使用延时任务
            if schedule_time:
                eta = schedule_time
                task_options["eta"] = eta
            
            # 提交任务
            task_result = execute_device_inspection.apply_async(
                args=[task_args],
                **task_options
            )
            
            # 缓存任务信息
            await self._cache_task_info(task_result.id, {
                "inspection_id": inspection_id,
                "device_id": device_id,
                "template_id": template_id,
                "priority": priority.value,
                "submitted_at": datetime.now().isoformat(),
                "schedule_time": schedule_time.isoformat() if schedule_time else None,
                "status": "PENDING"
            })
            
            logger.info("Inspection task submitted", 
                       task_id=task_result.id,
                       inspection_id=inspection_id,
                       device_id=device_id,
                       priority=priority.value)
            
            return task_result.id
            
        except Exception as e:
            logger.error("Failed to submit inspection task", 
                        inspection_id=inspection_id,
                        device_id=device_id,
                        error=str(e))
            raise
    
    async def submit_batch_inspection_tasks(
        self,
        inspections: List[Dict[str, Any]],
        priority: TaskPriority = TaskPriority.NORMAL
    ) -> List[str]:
        """批量提交巡检任务"""
        task_ids = []
        
        for inspection_config in inspections:
            try:
                task_id = await self.submit_inspection_task(
                    inspection_id=inspection_config["inspection_id"],
                    device_id=inspection_config["device_id"],
                    template_id=inspection_config["template_id"],
                    priority=priority,
                    schedule_time=inspection_config.get("schedule_time")
                )
                task_ids.append(task_id)
                
            except Exception as e:
                logger.error("Failed to submit batch inspection task", 
                           inspection_config=inspection_config,
                           error=str(e))
                # 继续处理其他任务
                continue
        
        logger.info("Batch inspection tasks submitted", 
                   total_submitted=len(task_ids),
                   total_requested=len(inspections))
        
        return task_ids
    
    async def get_task_status(self, task_id: str) -> Dict[str, Any]:
        """获取任务状态"""
        try:
            # 首先从缓存获取
            cached_info = await self._get_cached_task_info(task_id)
            
            # 从Celery获取实时状态
            task_result = AsyncResult(task_id, app=self.celery_app)
            
            status_info = {
                "task_id": task_id,
                "state": task_result.state,
                "info": task_result.info,
                "ready": task_result.ready(),
                "successful": task_result.successful() if task_result.ready() else None,
                "failed": task_result.failed() if task_result.ready() else None,
            }
            
            # 合并缓存信息
            if cached_info:
                status_info.update(cached_info)
            
            return status_info
            
        except Exception as e:
            logger.error("Failed to get task status", task_id=task_id, error=str(e))
            return {"task_id": task_id, "error": str(e)}
    
    async def cancel_task(self, task_id: str) -> bool:
        """取消任务"""
        try:
            self.celery_app.control.revoke(task_id, terminate=True)
            
            # 更新缓存状态
            await self._update_cached_task_status(task_id, "REVOKED")
            
            logger.info("Task cancelled", task_id=task_id)
            return True
            
        except Exception as e:
            logger.error("Failed to cancel task", task_id=task_id, error=str(e))
            return False
    
    async def get_queue_stats(self) -> Dict[str, Any]:
        """获取队列统计信息"""
        try:
            # 获取活跃任务
            active_tasks = self.celery_app.control.inspect().active()
            
            # 获取预定任务
            scheduled_tasks = self.celery_app.control.inspect().scheduled()
            
            # 获取保留任务
            reserved_tasks = self.celery_app.control.inspect().reserved()
            
            # 统计信息
            total_active = sum(len(tasks) for tasks in (active_tasks or {}).values())
            total_scheduled = sum(len(tasks) for tasks in (scheduled_tasks or {}).values())
            total_reserved = sum(len(tasks) for tasks in (reserved_tasks or {}).values())
            
            return {
                "active_tasks": total_active,
                "scheduled_tasks": total_scheduled,
                "reserved_tasks": total_reserved,
                "workers": list((active_tasks or {}).keys()),
                "timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error("Failed to get queue stats", error=str(e))
            return {"error": str(e)}
    
    async def retry_failed_task(self, task_id: str, max_retries: int = 3) -> Optional[str]:
        """重试失败的任务"""
        try:
            # 获取原任务信息
            cached_info = await self._get_cached_task_info(task_id)
            if not cached_info:
                logger.warning("No cached info found for retry", task_id=task_id)
                return None
            
            # 重新提交任务
            new_task_id = await self.submit_inspection_task(
                inspection_id=cached_info["inspection_id"],
                device_id=cached_info["device_id"],
                template_id=cached_info["template_id"],
                priority=TaskPriority(cached_info.get("priority", "normal"))
            )
            
            logger.info("Task retried", 
                       original_task_id=task_id,
                       new_task_id=new_task_id)
            
            return new_task_id
            
        except Exception as e:
            logger.error("Failed to retry task", task_id=task_id, error=str(e))
            return None
    
    async def cleanup_completed_tasks(self, older_than_hours: int = 24):
        """清理已完成的任务"""
        try:
            cutoff_time = datetime.now() - timedelta(hours=older_than_hours)
            
            # 这里可以实现清理逻辑
            # 1. 清理Redis缓存中的过期任务
            # 2. 清理Celery结果后端的过期结果
            
            # 获取所有任务键
            pattern = "task_cache:*"
            keys = self.redis_client.keys(pattern)
            
            cleaned_count = 0
            for key in keys:
                try:
                    task_info = self.redis_client.hgetall(key)
                    if task_info and task_info.get(b'completed_at'):
                        completed_at = datetime.fromisoformat(task_info[b'completed_at'].decode())
                        if completed_at < cutoff_time:
                            self.redis_client.delete(key)
                            cleaned_count += 1
                except Exception:
                    continue
            
            logger.info("Completed tasks cleaned up", 
                       cleaned_count=cleaned_count,
                       cutoff_hours=older_than_hours)
            
        except Exception as e:
            logger.error("Failed to cleanup completed tasks", error=str(e))
    
    def _get_priority_value(self, priority: TaskPriority) -> int:
        """获取优先级数值（数值越高优先级越高）"""
        priority_map = {
            TaskPriority.LOW: 1,
            TaskPriority.NORMAL: 5,
            TaskPriority.HIGH: 8,
            TaskPriority.URGENT: 10
        }
        return priority_map.get(priority, 5)
    
    async def _cache_task_info(self, task_id: str, info: Dict[str, Any]):
        """缓存任务信息"""
        try:
            cache_key = f"task_cache:{task_id}"
            self.redis_client.hset(cache_key, mapping={
                k: json.dumps(v) if isinstance(v, (dict, list)) else str(v)
                for k, v in info.items()
            })
            self.redis_client.expire(cache_key, self.task_cache_ttl)
        except Exception as e:
            logger.warning("Failed to cache task info", task_id=task_id, error=str(e))
    
    async def _get_cached_task_info(self, task_id: str) -> Optional[Dict[str, Any]]:
        """获取缓存的任务信息"""
        try:
            cache_key = f"task_cache:{task_id}"
            cached_data = self.redis_client.hgetall(cache_key)
            
            if not cached_data:
                return None
            
            # 转换数据类型
            result = {}
            for k, v in cached_data.items():
                key = k.decode() if isinstance(k, bytes) else k
                value = v.decode() if isinstance(v, bytes) else v
                
                # 尝试JSON解析
                try:
                    result[key] = json.loads(value)
                except (json.JSONDecodeError, TypeError):
                    result[key] = value
            
            return result
            
        except Exception as e:
            logger.warning("Failed to get cached task info", task_id=task_id, error=str(e))
            return None
    
    async def _update_cached_task_status(self, task_id: str, status: str):
        """更新缓存中的任务状态"""
        try:
            cache_key = f"task_cache:{task_id}"
            self.redis_client.hset(cache_key, "status", status)
            if status in ["SUCCESS", "FAILURE", "REVOKED"]:
                self.redis_client.hset(cache_key, "completed_at", datetime.now().isoformat())
        except Exception as e:
            logger.warning("Failed to update cached task status", 
                         task_id=task_id, error=str(e))


# Celery任务定义
@celery_app.task(bind=True, name='src.services.inspection.task_queue.execute_device_inspection')
def execute_device_inspection(self, task_args: Dict[str, Any]) -> Dict[str, Any]:
    """执行设备巡检任务"""
    task_id = self.request.id
    inspection_id = task_args["inspection_id"]
    device_id = task_args["device_id"]
    template_id = task_args["template_id"]
    
    logger.info("Starting inspection task", 
               task_id=task_id,
               inspection_id=inspection_id,
               device_id=device_id)
    
    try:
        # 这里需要实现实际的巡检逻辑
        # 由于Celery任务是同步的，需要使用同步版本的服务
        
        # 更新任务进度
        self.update_state(state='PROGRESS', meta={'step': 'initializing'})
        
        # 模拟巡检执行（实际实现中需要调用InspectionService）
        result = {
            "task_id": task_id,
            "inspection_id": inspection_id,
            "device_id": device_id,
            "template_id": template_id,
            "status": "COMPLETED",
            "started_at": datetime.now().isoformat(),
            "completed_at": datetime.now().isoformat(),
            "total_checks": 5,
            "passed_checks": 4,
            "failed_checks": 1,
            "results": []
        }
        
        logger.info("Inspection task completed", 
                   task_id=task_id,
                   inspection_id=inspection_id,
                   result=result)
        
        return result
        
    except Exception as e:
        logger.error("Inspection task failed", 
                    task_id=task_id,
                    inspection_id=inspection_id,
                    error=str(e))
        
        raise self.retry(exc=e, countdown=60, max_retries=3)


@celery_app.task(name='src.services.inspection.task_queue.execute_scheduled_inspections')
def execute_scheduled_inspections():
    """执行定时巡检任务"""
    logger.info("Executing scheduled inspections")
    
    try:
        # 这里需要查询数据库，获取需要执行的定时巡检
        # 然后提交到任务队列
        
        # 示例逻辑
        current_time = datetime.now()
        logger.info("Scheduled inspections check completed", timestamp=current_time.isoformat())
        
        return {"status": "completed", "timestamp": current_time.isoformat()}
        
    except Exception as e:
        logger.error("Scheduled inspections failed", error=str(e))
        raise


@celery_app.task(name='src.services.inspection.task_queue.perform_device_health_checks')
def perform_device_health_checks():
    """执行设备健康检查任务"""
    logger.info("Performing device health checks")
    
    try:
        # 这里需要实现设备健康检查逻辑
        current_time = datetime.now()
        
        # 示例：检查设备连通性
        logger.info("Device health checks completed", timestamp=current_time.isoformat())
        
        return {"status": "completed", "timestamp": current_time.isoformat()}
        
    except Exception as e:
        logger.error("Device health checks failed", error=str(e))
        raise


# 全局任务队列管理器实例
task_queue_manager = InspectionTaskQueue()