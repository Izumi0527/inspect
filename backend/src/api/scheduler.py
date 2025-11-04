"""
任务调度API路由
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
import structlog

from src.services.task_scheduler import (
    task_scheduler, 
    ScheduledTask, 
    TaskType, 
    TaskStatus,
    TaskExecution
)
from src.core.auth import get_current_active_user
from src.models.user import User

logger = structlog.get_logger()
router = APIRouter()


class TaskCreateRequest(BaseModel):
    """任务创建请求模型"""
    name: str
    task_type: TaskType
    cron_expression: str
    enabled: bool = True
    config: Dict[str, Any] = {}


class TaskUpdateRequest(BaseModel):
    """任务更新请求模型"""
    name: Optional[str] = None
    cron_expression: Optional[str] = None
    enabled: Optional[bool] = None
    config: Optional[Dict[str, Any]] = None


class TaskResponse(BaseModel):
    """任务响应模型"""
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
    """调度器统计响应模型"""
    is_running: bool
    check_interval: int
    total_tasks: int
    enabled_tasks: int
    running_tasks: int
    total_executions: int
    uptime: str


@router.get("/stats", response_model=SchedulerStatsResponse, summary="获取调度器统计")
async def get_scheduler_stats(
    current_user: User = Depends(get_current_active_user)
):
    """获取任务调度器统计信息"""
    stats = await task_scheduler.get_scheduler_stats()
    return SchedulerStatsResponse(**stats)


@router.get("/tasks", response_model=List[TaskResponse], summary="获取所有任务")
async def get_all_tasks(
    current_user: User = Depends(get_current_active_user)
):
    """获取所有调度任务列表"""
    tasks_status = await task_scheduler.get_all_tasks_status()
    return [TaskResponse(**task) for task in tasks_status if task is not None]


@router.get("/tasks/{task_id}", response_model=TaskResponse, summary="获取任务详情")
async def get_task(
    task_id: str,
    current_user: User = Depends(get_current_active_user)
):
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
    """
    创建新的调度任务（需要管理员权限）
    
    支持的任务类型：
    - device_inspection: 设备巡检
    - network_scan: 网络扫描
    - device_backup: 设备备份
    - system_health_check: 系统健康检查
    - data_cleanup: 数据清理
    - report_generation: 报表生成
    
    Cron表达式格式：
    - "0 2 * * *": 每天凌晨2点
    - "0 * * * *": 每小时整点
    - "*/30 * * * *": 每30分钟
    """
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin permission required")
    
    try:
        # 创建新任务
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
        
        # 获取创建的任务状态
        task_status = await task_scheduler.get_task_status(new_task.id)
        
        logger.info(
            "Task created",
            task_id=new_task.id,
            task_name=task_request.name,
            created_by=current_user.id
        )
        
        return TaskResponse(**task_status)
        
    except Exception as e:
        logger.error("Failed to create task", error=str(e), user_id=current_user.id)
        raise HTTPException(status_code=500, detail="Internal server error")


@router.put("/tasks/{task_id}", response_model=TaskResponse, summary="更新任务")
async def update_task(
    task_id: str,
    task_request: TaskUpdateRequest,
    current_user: User = Depends(get_current_active_user)
):
    """更新调度任务（需要管理员权限）"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin permission required")
    
    # 检查任务是否存在
    if task_id not in task_scheduler.tasks:
        raise HTTPException(status_code=404, detail="Task not found")
    
    try:
        task = task_scheduler.tasks[task_id]
        
        # 更新任务属性
        if task_request.name is not None:
            task.name = task_request.name
        if task_request.cron_expression is not None:
            task.cron_expression = task_request.cron_expression
            task.next_run = task_scheduler._calculate_next_run(task.cron_expression)
        if task_request.enabled is not None:
            task.enabled = task_request.enabled
        if task_request.config is not None:
            task.config.update(task_request.config)
        
        task.updated_at = datetime.now()
        
        # 获取更新后的任务状态
        task_status = await task_scheduler.get_task_status(task_id)
        
        logger.info(
            "Task updated",
            task_id=task_id,
            updated_by=current_user.id
        )
        
        return TaskResponse(**task_status)
        
    except Exception as e:
        logger.error("Failed to update task", task_id=task_id, error=str(e))
        raise HTTPException(status_code=500, detail="Internal server error")


@router.delete("/tasks/{task_id}", summary="删除任务")
async def delete_task(
    task_id: str,
    current_user: User = Depends(get_current_active_user)
):
    """删除调度任务（需要管理员权限）"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin permission required")
    
    success = await task_scheduler.remove_task(task_id)
    
    if not success:
        raise HTTPException(status_code=404, detail="Task not found")
    
    logger.info("Task deleted", task_id=task_id, deleted_by=current_user.id)
    
    return {
        "success": True,
        "message": "Task deleted successfully"
    }


@router.post("/tasks/{task_id}/enable", summary="启用任务")
async def enable_task(
    task_id: str,
    current_user: User = Depends(get_current_active_user)
):
    """启用调度任务（需要管理员权限）"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin permission required")
    
    success = await task_scheduler.enable_task(task_id)
    
    if not success:
        raise HTTPException(status_code=404, detail="Task not found")
    
    logger.info("Task enabled", task_id=task_id, enabled_by=current_user.id)
    
    return {
        "success": True,
        "message": "Task enabled successfully"
    }


@router.post("/tasks/{task_id}/disable", summary="禁用任务")
async def disable_task(
    task_id: str,
    current_user: User = Depends(get_current_active_user)
):
    """禁用调度任务（需要管理员权限）"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin permission required")
    
    success = await task_scheduler.disable_task(task_id)
    
    if not success:
        raise HTTPException(status_code=404, detail="Task not found")
    
    logger.info("Task disabled", task_id=task_id, disabled_by=current_user.id)
    
    return {
        "success": True,
        "message": "Task disabled successfully"
    }


@router.get("/task-types", summary="获取支持的任务类型")
async def get_task_types(
    current_user: User = Depends(get_current_active_user)
):
    """获取所有支持的任务类型和描述"""
    task_types = {
        TaskType.DEVICE_INSPECTION: {
            "name": "设备巡检",
            "description": "自动检查设备连通性和状态",
            "config_schema": {
                "check_connectivity": "bool - 检查连通性",
                "collect_metrics": "bool - 收集性能指标",
                "generate_report": "bool - 生成巡检报告"
            }
        },
        TaskType.NETWORK_SCAN: {
            "name": "网络扫描",
            "description": "扫描指定网络段发现新设备",
            "config_schema": {
                "networks": "list - 要扫描的网络段",
                "scan_type": "str - 扫描类型(ping/port/snmp)"
            }
        },
        TaskType.DEVICE_BACKUP: {
            "name": "设备备份",
            "description": "备份设备配置文件",
            "config_schema": {
                "backup_type": "str - 备份类型",
                "device_filter": "dict - 设备筛选条件"
            }
        },
        TaskType.SYSTEM_HEALTH_CHECK: {
            "name": "系统健康检查",
            "description": "检查系统各组件健康状态",
            "config_schema": {
                "check_database": "bool - 检查数据库",
                "check_redis": "bool - 检查Redis",
                "check_influxdb": "bool - 检查InfluxDB",
                "check_disk_space": "bool - 检查磁盘空间"
            }
        },
        TaskType.DATA_CLEANUP: {
            "name": "数据清理",
            "description": "清理过期日志和监控数据",
            "config_schema": {
                "cleanup_logs": "bool - 清理日志",
                "cleanup_old_metrics": "bool - 清理旧指标",
                "retention_days": "int - 保留天数"
            }
        },
        TaskType.REPORT_GENERATION: {
            "name": "报表生成",
            "description": "生成定期运营报表",
            "config_schema": {
                "report_types": "list - 报表类型",
                "format": "str - 输出格式"
            }
        }
    }
    
    return [
        {
            "type": task_type.value,
            "name": info["name"],
            "description": info["description"],
            "config_schema": info["config_schema"]
        }
        for task_type, info in task_types.items()
    ]


@router.get("/cron-examples", summary="获取Cron表达式示例")
async def get_cron_examples(
    current_user: User = Depends(get_current_active_user)
):
    """获取常用的Cron表达式示例"""
    examples = [
        {
            "expression": "0 2 * * *",
            "description": "每天凌晨2点执行",
            "frequency": "daily"
        },
        {
            "expression": "0 * * * *",
            "description": "每小时整点执行",
            "frequency": "hourly"
        },
        {
            "expression": "*/30 * * * *",
            "description": "每30分钟执行",
            "frequency": "every_30_minutes"
        },
        {
            "expression": "0 6 * * 0",
            "description": "每周日早上6点执行",
            "frequency": "weekly"
        },
        {
            "expression": "0 1 1 * *",
            "description": "每月1号凌晨1点执行",
            "frequency": "monthly"
        },
        {
            "expression": "0 0 1 1 *",
            "description": "每年1月1日执行",
            "frequency": "yearly"
        }
    ]
    
    return {
        "format": "分 时 日 月 周",
        "examples": examples,
        "note": "当前调度器支持简化的Cron表达式解析"
    }