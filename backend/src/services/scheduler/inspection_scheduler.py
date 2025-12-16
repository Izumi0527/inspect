import asyncio
import json
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Callable, Any
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from apscheduler.triggers.date import DateTrigger
from apscheduler.jobstores.memory import MemoryJobStore
from apscheduler.executors.asyncio import AsyncIOExecutor
from croniter import croniter
import structlog

from src.core.config import settings

logger = structlog.get_logger()

class InspectionScheduler:
    """巡检任务调度器"""
    
    def __init__(self):
        # 配置调度器
        job_stores = {
            'default': MemoryJobStore()
        }
        executors = {
            'default': AsyncIOExecutor(),
        }
        
        job_defaults = {
            'coalesce': False,  # 不合并作业
            'max_instances': 3,  # 最多同时运行3个实例
            'misfire_grace_time': 300,  # 错过执行时间的宽限期（秒）
        }
        
        self.scheduler = AsyncIOScheduler(
            jobstores=job_stores,
            executors=executors,
            job_defaults=job_defaults,
            timezone='Asia/Shanghai'
        )
        
        self.scheduled_inspections: Dict[str, Dict] = {}  # 调度的巡检任务
        self.running = False
        
    async def start(self):
        """启动调度器"""
        try:
            if not self.running:
                self.scheduler.start()
                self.running = True
                logger.info("Inspection scheduler started")
            else:
                logger.warning("Scheduler already running")
        except Exception as e:
            logger.error("Failed to start scheduler", error=str(e))
            raise
    
    async def stop(self):
        """停止调度器"""
        try:
            if self.running:
                self.scheduler.shutdown(wait=False)
                self.running = False
                logger.info("Inspection scheduler stopped")
            else:
                logger.warning("Scheduler not running")
        except Exception as e:
            logger.error("Failed to stop scheduler", error=str(e))
    
    def is_running(self) -> bool:
        """检查调度器是否运行中"""
        return self.running and self.scheduler.running
    
    async def schedule_inspection(
        self,
        schedule_id: str,
        name: str,
        cron_expression: str,
        device_group_id: int,
        template_id: int,
        callback: Callable,
        timezone: str = 'Asia/Shanghai',
        max_instances: int = 1
    ) -> bool:
        """调度巡检任务"""
        try:
            # 验证Cron表达式
            if not self._validate_cron_expression(cron_expression):
                logger.error("Invalid cron expression", 
                           cron=cron_expression, 
                           schedule_id=schedule_id)
                return False
            
            # 如果已存在相同ID的任务，先删除
            if schedule_id in self.scheduled_inspections:
                await self.remove_inspection_schedule(schedule_id)
            
            # 创建Cron触发器
            trigger = CronTrigger.from_crontab(cron_expression, timezone=timezone)
            
            # 添加任务到调度器
            job = self.scheduler.add_job(
                func=callback,
                trigger=trigger,
                args=[schedule_id, device_group_id, template_id],
                id=schedule_id,
                name=name,
                max_instances=max_instances,
                replace_existing=True
            )
            
            # 计算下次运行时间
            next_run = self._calculate_next_run(cron_expression, timezone)
            
            # 保存调度信息
            self.scheduled_inspections[schedule_id] = {
                'schedule_id': schedule_id,
                'name': name,
                'cron_expression': cron_expression,
                'device_group_id': device_group_id,
                'template_id': template_id,
                'timezone': timezone,
                'max_instances': max_instances,
                'created_at': datetime.now(),
                'last_run': None,
                'next_run': next_run,
                'run_count': 0,
                'status': 'active'
            }
            
            logger.info("Inspection scheduled successfully", 
                       schedule_id=schedule_id,
                       name=name,
                       next_run=next_run)
            
            return True
            
        except Exception as e:
            logger.error("Failed to schedule inspection", 
                        schedule_id=schedule_id,
                        error=str(e))
            return False
    
    async def schedule_one_time_inspection(
        self,
        inspection_id: str,
        name: str,
        run_time: datetime,
        device_group_id: int,
        template_id: int,
        callback: Callable
    ) -> bool:
        """调度一次性巡检任务"""
        try:
            # 检查运行时间是否在未来
            if run_time <= datetime.now():
                logger.error("Run time must be in the future", 
                           run_time=run_time,
                           inspection_id=inspection_id)
                return False
            
            # 创建日期触发器
            trigger = DateTrigger(run_date=run_time, timezone='Asia/Shanghai')
            
            # 添加任务到调度器
            job = self.scheduler.add_job(
                func=callback,
                trigger=trigger,
                args=[inspection_id, device_group_id, template_id],
                id=f"onetime_{inspection_id}",
                name=f"One-time: {name}",
                max_instances=1
            )
            
            logger.info("One-time inspection scheduled", 
                       inspection_id=inspection_id,
                       name=name,
                       run_time=run_time)
            
            return True
            
        except Exception as e:
            logger.error("Failed to schedule one-time inspection", 
                        inspection_id=inspection_id,
                        error=str(e))
            return False
    
    async def remove_inspection_schedule(self, schedule_id: str) -> bool:
        """移除巡检调度"""
        try:
            # 从调度器中删除任务
            self.scheduler.remove_job(schedule_id)
            
            # 从本地存储中删除
            if schedule_id in self.scheduled_inspections:
                del self.scheduled_inspections[schedule_id]
            
            logger.info("Inspection schedule removed", schedule_id=schedule_id)
            return True
            
        except Exception as e:
            logger.error("Failed to remove inspection schedule", 
                        schedule_id=schedule_id,
                        error=str(e))
            return False
    
    async def pause_schedule(self, schedule_id: str) -> bool:
        """暂停调度"""
        try:
            self.scheduler.pause_job(schedule_id)
            
            if schedule_id in self.scheduled_inspections:
                self.scheduled_inspections[schedule_id]['status'] = 'paused'
            
            logger.info("Inspection schedule paused", schedule_id=schedule_id)
            return True
            
        except Exception as e:
            logger.error("Failed to pause schedule", 
                        schedule_id=schedule_id,
                        error=str(e))
            return False
    
    async def resume_schedule(self, schedule_id: str) -> bool:
        """恢复调度"""
        try:
            self.scheduler.resume_job(schedule_id)
            
            if schedule_id in self.scheduled_inspections:
                self.scheduled_inspections[schedule_id]['status'] = 'active'
            
            logger.info("Inspection schedule resumed", schedule_id=schedule_id)
            return True
            
        except Exception as e:
            logger.error("Failed to resume schedule", 
                        schedule_id=schedule_id,
                        error=str(e))
            return False
    
    def get_scheduled_inspections(self) -> List[Dict]:
        """获取所有调度的巡检任务"""
        schedules = []
        
        for schedule_info in self.scheduled_inspections.values():
            # 更新下次运行时间
            try:
                job = self.scheduler.get_job(schedule_info['schedule_id'])
                if job and job.next_run_time:
                    schedule_info['next_run'] = job.next_run_time
            except:
                pass
                
            schedules.append(schedule_info.copy())
        
        return schedules
    
    def get_schedule_info(self, schedule_id: str) -> Optional[Dict]:
        """获取特定调度信息"""
        if schedule_id not in self.scheduled_inspections:
            return None
        
        schedule_info = self.scheduled_inspections[schedule_id].copy()
        
        # 更新实时信息
        try:
            job = self.scheduler.get_job(schedule_id)
            if job:
                schedule_info['next_run'] = job.next_run_time
                schedule_info['job_status'] = 'scheduled' if job.next_run_time else 'completed'
        except:
            schedule_info['job_status'] = 'error'
        
        return schedule_info
    
    def _validate_cron_expression(self, cron_expression: str) -> bool:
        """验证Cron表达式"""
        try:
            # 使用croniter验证
            croniter(cron_expression)
            
            # 使用APScheduler验证
            CronTrigger.from_crontab(cron_expression)
            
            return True
            
        except Exception as e:
            logger.warning("Invalid cron expression", 
                         cron=cron_expression, 
                         error=str(e))
            return False
    
    def _calculate_next_run(self, cron_expression: str, timezone: str = 'Asia/Shanghai') -> Optional[datetime]:
        """计算下次运行时间"""
        try:
            from datetime import timezone as dt_timezone
            import pytz
            
            # 获取时区
            tz = pytz.timezone(timezone)
            
            # 使用croniter计算下次运行时间
            cron = croniter(cron_expression, datetime.now(tz))
            next_run = cron.get_next(datetime)
            
            return next_run
            
        except Exception as e:
            logger.error("Failed to calculate next run time", 
                        cron=cron_expression,
                        error=str(e))
            return None
    
    async def update_schedule_stats(self, schedule_id: str, success: bool = True):
        """更新调度统计信息"""
        if schedule_id in self.scheduled_inspections:
            schedule_info = self.scheduled_inspections[schedule_id]
            schedule_info['last_run'] = datetime.now()
            schedule_info['run_count'] += 1
            
            if not success:
                if 'error_count' not in schedule_info:
                    schedule_info['error_count'] = 0
                schedule_info['error_count'] += 1
    
    def get_scheduler_stats(self) -> Dict[str, Any]:
        """获取调度器统计信息"""
        active_schedules = len([s for s in self.scheduled_inspections.values() if s['status'] == 'active'])
        paused_schedules = len([s for s in self.scheduled_inspections.values() if s['status'] == 'paused'])
        
        return {
            'running': self.running,
            'total_schedules': len(self.scheduled_inspections),
            'active_schedules': active_schedules,
            'paused_schedules': paused_schedules,
            'scheduler_jobs': len(self.scheduler.get_jobs()) if self.running else 0,
            'uptime': datetime.now() if self.running else None
        }

# 常用的Cron表达式预设
CRON_PRESETS = {
    'hourly': '0 * * * *',        # 每小时执行
    'daily': '0 2 * * *',         # 每天凌晨2点执行
    'weekly': '0 2 * * 0',        # 每周日凌晨2点执行
    'monthly': '0 2 1 * *',       # 每月1号凌晨2点执行
    'every_15_minutes': '*/15 * * * *',  # 每15分钟执行
    'every_30_minutes': '*/30 * * * *',  # 每30分钟执行
    'twice_daily': '0 6,18 * * *',       # 每天6点和18点执行
    'weekdays': '0 9 * * 1-5',           # 工作日早上9点执行
    'weekends': '0 10 * * 6,0',          # 周末早上10点执行
}

def get_cron_description(cron_expression: str) -> str:
    """获取Cron表达式的中文描述"""
    descriptions = {
        '0 * * * *': '每小时执行',
        '0 2 * * *': '每天凌晨2点执行',
        '0 2 * * 0': '每周日凌晨2点执行',
        '0 2 1 * *': '每月1号凌晨2点执行',
        '*/15 * * * *': '每15分钟执行',
        '*/30 * * * *': '每30分钟执行',
        '0 6,18 * * *': '每天6点和18点执行',
        '0 9 * * 1-5': '工作日早上9点执行',
        '0 10 * * 6,0': '周末早上10点执行',
    }
    
    return descriptions.get(cron_expression, f'自定义调度: {cron_expression}')

# 全局调度器实例
inspection_scheduler = InspectionScheduler()