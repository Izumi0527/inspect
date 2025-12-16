"""
任务调度服务

重导出原有调度服务，保持向后兼容
"""
from src.services.scheduler import InspectionScheduler, TaskScheduler

# 向后兼容别名
SchedulerService = InspectionScheduler

__all__ = ["SchedulerService", "InspectionScheduler", "TaskScheduler"]
