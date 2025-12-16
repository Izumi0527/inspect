# 调度服务模块
"""
调度领域服务

提供任务调度和定时执行功能：
- InspectionScheduler: 巡检任务调度器 (基于APScheduler)
- TaskScheduler: 通用任务调度器
- CRON_PRESETS: 常用Cron表达式预设
- TaskType, TaskStatus: 任务类型和状态枚举

推荐导入方式:
    from src.services.scheduler import InspectionScheduler, inspection_scheduler
    from src.services.scheduler import TaskScheduler, task_scheduler
    from src.services.scheduler import CRON_PRESETS, get_cron_description
"""

# 巡检调度器
from .inspection_scheduler import (
    InspectionScheduler,
    inspection_scheduler,
    CRON_PRESETS,
    get_cron_description,
)

# 通用任务调度器
from .task_scheduler import (
    TaskScheduler,
    task_scheduler,
    TaskType,
    TaskStatus,
    ScheduledTask,
    TaskExecution,
)

__all__ = [
    # 巡检调度器
    "InspectionScheduler",
    "inspection_scheduler",
    "CRON_PRESETS",
    "get_cron_description",
    
    # 通用任务调度器
    "TaskScheduler",
    "task_scheduler",
    "TaskType",
    "TaskStatus",
    "ScheduledTask",
    "TaskExecution",
]
