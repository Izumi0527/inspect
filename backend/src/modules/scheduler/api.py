"""
任务调度API路由

直接定义路由，避免循环导入
"""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
import structlog

from src.services.scheduler import (
    task_scheduler,
    ScheduledTask,
    TaskType,
)
from src.core.auth import get_current_active_user
from src.models.user import User

logger = structlog.get_logger()
router = APIRouter()


class TaskCreateRequest(BaseModel):
    name: str
    task_type: TaskType
    cron_expression: str
    enabled: bool = True
    config: Dict[str, Any] = {}


class TaskUpdateRequest(BaseModel):
    name: Optional[str] = None
    cron_expression: Optional[str] = None
    enabled: Optional[bool] = None
    config: Optional[Dict[str, Any]] = None


class TaskResponse(BaseModel):
    id: str
    name: str
    task_type: str
    cron_expression: str
    enabled: bool
    status: str
    progress: float
    last_run: Optional[str]
    next_run: Optional[str]
    run_count: int
    success_count: int
    failure_count: int
    error_message: Optional[str]


class SchedulerStatsResponse(BaseModel):
    is_running: bool
    check_interval: int
    total_tasks: int
    enabled_tasks: int
    running_tasks: int
    total_executions: int
    uptime: str


@router.get("/stats", response_model=SchedulerStatsResponse, summary="获取调度器统计")
async def get_scheduler_stats(current_user: User = Depends(get_current_active_user)):
    """获取任务调度器统计信息"""
    stats = await task_scheduler.get_scheduler_stats()
    return SchedulerStatsResponse(**stats)


@router.get("/tasks", response_model=List[TaskResponse], summary="获取所有任务")
async def get_all_tasks(current_user: User = Depends(get_current_active_user)):
    """获取所有调度任务列表"""
    tasks_status = await task_scheduler.get_all_tasks_status()
    return [TaskResponse(**task) for task in tasks_status if task is not None]


@router.get("/tasks/{task_id}", response_model=TaskResponse, summary="获取任务详情")
async def get_task(task_id: str, current_user: User = Depends(get_current_active_user)):
    """获取指定任务的详细信息"""
    task_status = await task_scheduler.get_task_status(task_id)
    if task_status is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return TaskResponse(**task_status)


@router.post("/tasks", response_model=TaskResponse, summary="创建新任务")
async def create_task(
    task_request: TaskCreateRequest,
    current_user: User = Depends(get_current_active_user)
):
    """创建新的调度任务"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin permission required")

    try:
        new_task = ScheduledTask(
            name=task_request.name,
            task_type=task_request.task_type,
            cron_expression=task_request.cron_expression,
            enabled=task_request.enabled,
            config=task_request.config
        )
        success = await task_scheduler.add_task(new_task)
        if not success:
            raise HTTPException(status_code=400, detail="Failed to create task")

        task_status = await task_scheduler.get_task_status(new_task.id)
        logger.info("Task created", task_id=new_task.id, task_name=task_request.name)
        return TaskResponse(**task_status)
    except Exception as e:
        logger.error("Failed to create task", error=str(e))
        raise HTTPException(status_code=500, detail="Internal server error")


@router.delete("/tasks/{task_id}", summary="删除任务")
async def delete_task(task_id: str, current_user: User = Depends(get_current_active_user)):
    """删除调度任务"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin permission required")

    success = await task_scheduler.remove_task(task_id)
    if not success:
        raise HTTPException(status_code=404, detail="Task not found")

    logger.info("Task deleted", task_id=task_id)
    return {"success": True, "message": "Task deleted successfully"}


@router.post("/tasks/{task_id}/enable", summary="启用任务")
async def enable_task(task_id: str, current_user: User = Depends(get_current_active_user)):
    """启用调度任务"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin permission required")

    success = await task_scheduler.enable_task(task_id)
    if not success:
        raise HTTPException(status_code=404, detail="Task not found")

    return {"success": True, "message": "Task enabled successfully"}


@router.post("/tasks/{task_id}/disable", summary="禁用任务")
async def disable_task(task_id: str, current_user: User = Depends(get_current_active_user)):
    """禁用调度任务"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin permission required")

    success = await task_scheduler.disable_task(task_id)
    if not success:
        raise HTTPException(status_code=404, detail="Task not found")

    return {"success": True, "message": "Task disabled successfully"}


__all__ = ["router"]
