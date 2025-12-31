"""
巡检管理模块 - API路由

提供巡检任务、模板、策略管理等API端点
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
import math
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from src.core.permissions import require_permission
from src.core.database import get_db_session
from src.models.inspection import InspectionTrigger
from src.modules.inspection.schemas import (
    InspectionTaskCreate, InspectionTaskResponse,
    InspectionResultResponse, InspectionStatistics,
    InspectionTemplateCreate, InspectionTemplateUpdate, InspectionTemplateResponse,
    InspectionStrategyCreate, InspectionStrategyUpdate, InspectionStrategyResponse,
    InspectionStatus
)

# 延迟导入避免循环依赖
def get_inspection_service():
    from src.services.inspection import inspection_service
    return inspection_service

def get_inspection_repository():
    from src.repositories.inspection_repository import InspectionRepository
    return InspectionRepository

def get_template_repository():
    from src.repositories.template_repository import TemplateRepository
    return TemplateRepository

def get_strategy_repository():
    from src.repositories.strategy_repository import StrategyRepository
    return StrategyRepository

logger = structlog.get_logger()
router = APIRouter()

def api_ok(data: Any, message: str = "操作成功", code: int = 200) -> Dict[str, Any]:
    """统一返回前端 inspection 模块期望的响应结构：{code, message, data}"""
    return {"code": code, "message": message, "data": data}


def serialize_template(template: Any) -> Dict[str, Any]:
    """将巡检模板ORM对象序列化为稳定的响应结构（兼容JSON字段为null的历史数据）。"""
    payload = {
        "id": getattr(template, "id", None),
        "name": getattr(template, "name", ""),
        "description": getattr(template, "description", "") or "",
        "category": getattr(template, "category", None) or "custom",
        "device_types": getattr(template, "device_types", None) or [],
        "check_items": getattr(template, "check_items", None) or [],
        "is_default": bool(getattr(template, "is_default", False)),
        "is_active": bool(getattr(template, "is_active", True)) if getattr(template, "is_active", None) is not None else True,
        "created_at": getattr(template, "created_at", None),
        "updated_at": getattr(template, "updated_at", None) or getattr(template, "created_at", None),
    }
    return InspectionTemplateResponse.model_validate(payload).model_dump()


# ============= 巡检任务 =============

@router.get("/tasks", response_model=List[InspectionTaskResponse], summary="获取巡检任务列表")
async def get_inspection_tasks(
    status: Optional[InspectionStatus] = Query(None, description="状态过滤"),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(require_permission("inspections:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """获取巡检任务列表"""
    InspectionRepository = get_inspection_repository()
    repo = InspectionRepository(session)
    
    tasks = await repo.get_tasks_paginated(
        skip=skip,
        limit=limit,
        status=status.value if status else None
    )
    
    return [InspectionTaskResponse(**t.__dict__) for t in tasks]


@router.post("/tasks", response_model=InspectionTaskResponse, summary="创建巡检任务")
async def create_inspection_task(
    task_data: InspectionTaskCreate,
    current_user: dict = Depends(require_permission("inspections:create")),
    session: AsyncSession = Depends(get_db_session)
):
    """创建新的巡检任务"""
    service = get_inspection_service()
    
    task = await service.create_task(
        name=task_data.name,
        description=task_data.description,
        template_id=task_data.template_id,
        strategy_id=task_data.strategy_id,
        device_ids=task_data.device_ids,
        scheduled_at=task_data.scheduled_at,
        created_by=current_user["id"],
        session=session
    )
    
    logger.info("Inspection task created", task_id=task.id, created_by=current_user["id"])
    return InspectionTaskResponse(**task.__dict__)


@router.get("/tasks/{task_id}", response_model=InspectionTaskResponse, summary="获取巡检任务详情")
async def get_inspection_task(
    task_id: int,
    current_user: dict = Depends(require_permission("inspections:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """获取指定巡检任务详情"""
    InspectionRepository = get_inspection_repository()
    repo = InspectionRepository(session)
    
    task = await repo.get_task_by_id(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="巡检任务不存在")
    
    return InspectionTaskResponse(**task.__dict__)


@router.post("/tasks/{task_id}/start", summary="启动巡检任务")
async def start_inspection_task(
    task_id: int,
    current_user: dict = Depends(require_permission("inspections:execute")),
    session: AsyncSession = Depends(get_db_session)
):
    """启动巡检任务"""
    service = get_inspection_service()
    
    success = await service.start_task(task_id, session)
    if not success:
        raise HTTPException(status_code=400, detail="无法启动巡检任务")
    
    logger.info("Inspection task started", task_id=task_id, started_by=current_user["id"])
    return {"message": "巡检任务已启动"}


@router.post("/tasks/{task_id}/cancel", summary="取消巡检任务")
async def cancel_inspection_task(
    task_id: int,
    current_user: dict = Depends(require_permission("inspections:execute")),
    session: AsyncSession = Depends(get_db_session)
):
    """取消巡检任务"""
    service = get_inspection_service()
    
    success = await service.cancel_task(task_id, session)
    if not success:
        raise HTTPException(status_code=400, detail="无法取消巡检任务")
    
    logger.info("Inspection task cancelled", task_id=task_id, cancelled_by=current_user["id"])
    return {"message": "巡检任务已取消"}


@router.get("/tasks/{task_id}/results", response_model=List[InspectionResultResponse], summary="获取巡检结果")
async def get_inspection_results(
    task_id: int,
    current_user: dict = Depends(require_permission("inspections:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """获取巡检任务的结果列表"""
    InspectionRepository = get_inspection_repository()
    repo = InspectionRepository(session)
    
    results = await repo.get_task_results(task_id)
    return [InspectionResultResponse(**r.__dict__) for r in results]


# ============= 巡检模板 =============

@router.get("/templates", summary="获取巡检模板列表（分页）")
async def get_inspection_templates(
    device_type: Optional[str] = Query(None, description="设备类型过滤"),
    skip: int = Query(0, ge=0, description="跳过记录数（用于分页）"),
    limit: int = Query(20, ge=1, le=100, description="返回数量（用于分页）"),
    current_user: dict = Depends(require_permission("inspections:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """获取巡检模板列表"""
    TemplateRepository = get_template_repository()
    repo = TemplateRepository(session)

    page = (skip // limit) + 1
    filters: Dict[str, Any] = {}
    if device_type:
        filters["device_type"] = device_type

    templates, total = await repo.list_templates(
        page=page,
        page_size=limit,
        filters=filters or None,
        order_by="created_at",
        order_direction="desc",
    )

    pages = math.ceil(total / limit) if limit else 0
    data = {
        "templates": [serialize_template(t) for t in templates],
        "total": total,
        "pages": pages,
    }
    return api_ok(data)


@router.post("/templates", summary="创建巡检模板")
async def create_inspection_template(
    template_data: InspectionTemplateCreate,
    current_user: dict = Depends(require_permission("inspections:create")),
    session: AsyncSession = Depends(get_db_session)
):
    """创建新的巡检模板"""
    TemplateRepository = get_template_repository()
    repo = TemplateRepository(session)

    template = await repo.create(template_data.model_dump(by_alias=False))
    logger.info("Inspection template created", template_id=template.id, created_by=current_user.get("id"))
    return api_ok(serialize_template(template))


@router.get("/templates/{template_id}", summary="获取巡检模板详情")
async def get_inspection_template(
    template_id: int,
    current_user: dict = Depends(require_permission("inspections:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """获取指定巡检模板详情"""
    TemplateRepository = get_template_repository()
    repo = TemplateRepository(session)

    template = await repo.get_by_id(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="巡检模板不存在")

    return api_ok(serialize_template(template))


@router.put("/templates/{template_id}", summary="更新巡检模板")
async def update_inspection_template(
    template_id: int,
    template_data: InspectionTemplateUpdate,
    current_user: dict = Depends(require_permission("inspections:update")),
    session: AsyncSession = Depends(get_db_session)
):
    """更新巡检模板（部分更新）"""
    TemplateRepository = get_template_repository()
    repo = TemplateRepository(session)

    updates = template_data.model_dump(by_alias=False, exclude_unset=True)
    template = await repo.update(template_id, updates)
    if not template:
        raise HTTPException(status_code=404, detail="巡检模板不存在")

    logger.info("Inspection template updated", template_id=template_id, updated_by=current_user.get("id"))
    return api_ok(serialize_template(template))


@router.delete("/templates/{template_id}", summary="删除巡检模板")
async def delete_inspection_template(
    template_id: int,
    current_user: dict = Depends(require_permission("inspections:delete")),
    session: AsyncSession = Depends(get_db_session)
):
    """删除巡检模板"""
    TemplateRepository = get_template_repository()
    repo = TemplateRepository(session)

    success = await repo.delete(template_id)
    if not success:
        raise HTTPException(status_code=404, detail="巡检模板不存在")

    logger.info("Inspection template deleted", template_id=template_id, deleted_by=current_user.get("id"))
    return api_ok(True, message="巡检模板已删除")


# ============= 巡检策略 =============

@router.get("/strategies", summary="获取巡检策略列表（分页）")
async def get_inspection_strategies(
    skip: int = Query(0, ge=0, description="跳过记录数（用于分页）"),
    limit: int = Query(20, ge=1, le=100, description="返回数量（用于分页）"),
    type: Optional[str] = Query(None, description="类型过滤：scheduled/manual"),
    enabled: Optional[bool] = Query(None, description="是否启用"),
    current_user: dict = Depends(require_permission("inspections:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """获取巡检策略列表"""
    StrategyRepository = get_strategy_repository()
    repo = StrategyRepository(session)
    
    if type and type not in ("scheduled", "manual"):
        raise HTTPException(status_code=400, detail="无效的策略类型")

    page = (skip // limit) + 1
    filters: Dict[str, Any] = {}
    if enabled is not None:
        filters["enabled"] = enabled
    if type:
        filters["type"] = type

    strategies, total = await repo.list_strategies(
        page=page,
        page_size=limit,
        filters=filters or None,
    )

    def map_strategy(strategy) -> Dict[str, Any]:
        return {
            "id": str(strategy.id),
            "name": strategy.name,
            "description": strategy.description or "",
            "type": strategy.type,
            "cron": strategy.cron,
            "devices": list(strategy.devices or []),
            "templates": list(strategy.templates or []),
            "enabled": bool(strategy.enabled),
            "createdAt": strategy.created_at.isoformat() if strategy.created_at else "",
            "updatedAt": strategy.updated_at.isoformat() if strategy.updated_at else "",
            "nextRunTime": strategy.next_run_time.isoformat() if strategy.next_run_time else None,
        }

    pages = int(math.ceil(total / limit)) if limit > 0 else 0
    return api_ok(
        {
            "items": [map_strategy(s) for s in strategies],
            "total": int(total or 0),
            "pages": pages,
        }
    )


@router.get("/strategies/{strategy_id}", summary="获取巡检策略详情")
async def get_inspection_strategy(
    strategy_id: int,
    current_user: dict = Depends(require_permission("inspections:read")),
    session: AsyncSession = Depends(get_db_session),
):
    StrategyRepository = get_strategy_repository()
    repo = StrategyRepository(session)

    strategy = await repo.get_by_id(strategy_id)
    if not strategy:
        raise HTTPException(status_code=404, detail="巡检策略不存在")

    return api_ok(
        {
            "id": str(strategy.id),
            "name": strategy.name,
            "description": strategy.description or "",
            "type": strategy.type,
            "cron": strategy.cron,
            "devices": list(strategy.devices or []),
            "templates": list(strategy.templates or []),
            "enabled": bool(strategy.enabled),
            "createdAt": strategy.created_at.isoformat() if strategy.created_at else "",
            "updatedAt": strategy.updated_at.isoformat() if strategy.updated_at else "",
            "nextRunTime": strategy.next_run_time.isoformat() if strategy.next_run_time else None,
        }
    )


@router.post("/strategies", summary="创建巡检策略")
async def create_inspection_strategy(
    strategy_data: InspectionStrategyCreate,
    current_user: dict = Depends(require_permission("inspections:create")),
    session: AsyncSession = Depends(get_db_session)
):
    """创建新的巡检策略"""
    StrategyRepository = get_strategy_repository()
    repo = StrategyRepository(session)
    
    strategy = await repo.create(strategy_data.model_dump())
    
    logger.info("Inspection strategy created", strategy_id=strategy.id, created_by=current_user["id"])
    return api_ok(
        {
            "id": str(strategy.id),
            "name": strategy.name,
            "description": strategy.description or "",
            "type": strategy.type,
            "cron": strategy.cron,
            "devices": list(strategy.devices or []),
            "templates": list(strategy.templates or []),
            "enabled": bool(strategy.enabled),
            "createdAt": strategy.created_at.isoformat() if strategy.created_at else "",
            "updatedAt": strategy.updated_at.isoformat() if strategy.updated_at else "",
            "nextRunTime": strategy.next_run_time.isoformat() if strategy.next_run_time else None,
        },
        message="创建策略成功",
        code=201,
    )


@router.put("/strategies/{strategy_id}", summary="更新巡检策略")
async def update_inspection_strategy(
    strategy_id: int,
    strategy_data: InspectionStrategyUpdate,
    current_user: dict = Depends(require_permission("inspections:update")),
    session: AsyncSession = Depends(get_db_session),
):
    StrategyRepository = get_strategy_repository()
    repo = StrategyRepository(session)

    updated = await repo.update(strategy_id, strategy_data.model_dump(exclude_unset=True))
    if not updated:
        raise HTTPException(status_code=404, detail="巡检策略不存在")

    return api_ok(
        {
            "id": str(updated.id),
            "name": updated.name,
            "description": updated.description or "",
            "type": updated.type,
            "cron": updated.cron,
            "devices": list(updated.devices or []),
            "templates": list(updated.templates or []),
            "enabled": bool(updated.enabled),
            "createdAt": updated.created_at.isoformat() if updated.created_at else "",
            "updatedAt": updated.updated_at.isoformat() if updated.updated_at else "",
            "nextRunTime": updated.next_run_time.isoformat() if updated.next_run_time else None,
        },
        message="更新策略成功",
    )


@router.delete("/strategies/{strategy_id}", summary="删除巡检策略")
async def delete_inspection_strategy(
    strategy_id: int,
    current_user: dict = Depends(require_permission("inspections:delete")),
    session: AsyncSession = Depends(get_db_session)
):
    """删除巡检策略"""
    StrategyRepository = get_strategy_repository()
    repo = StrategyRepository(session)
    
    success = await repo.delete(strategy_id)
    if not success:
        raise HTTPException(status_code=404, detail="巡检策略不存在")
    
    logger.info("Inspection strategy deleted", strategy_id=strategy_id, deleted_by=current_user["id"])
    return api_ok({"id": strategy_id}, message="巡检策略已删除")


@router.post("/strategies/{strategy_id}/toggle", summary="切换巡检策略启用状态")
async def toggle_inspection_strategy(
    strategy_id: int,
    current_user: dict = Depends(require_permission("inspections:update")),
    session: AsyncSession = Depends(get_db_session),
):
    StrategyRepository = get_strategy_repository()
    repo = StrategyRepository(session)

    strategy = await repo.get_by_id(strategy_id)
    if not strategy:
        raise HTTPException(status_code=404, detail="巡检策略不存在")

    updated = await repo.toggle_enabled(strategy_id, not bool(strategy.enabled))
    if not updated:
        raise HTTPException(status_code=404, detail="巡检策略不存在")

    return api_ok(
        {
            "id": str(updated.id),
            "name": updated.name,
            "description": updated.description or "",
            "type": updated.type,
            "cron": updated.cron,
            "devices": list(updated.devices or []),
            "templates": list(updated.templates or []),
            "enabled": bool(updated.enabled),
            "createdAt": updated.created_at.isoformat() if updated.created_at else "",
            "updatedAt": updated.updated_at.isoformat() if updated.updated_at else "",
            "nextRunTime": updated.next_run_time.isoformat() if updated.next_run_time else None,
        },
        message="策略状态已更新",
    )


@router.post("/strategies/{strategy_id}/trigger", summary="触发策略执行（创建巡检执行记录）")
async def trigger_inspection_strategy(
    strategy_id: int,
    current_user: dict = Depends(require_permission("inspections:execute")),
    session: AsyncSession = Depends(get_db_session),
):
    StrategyRepository = get_strategy_repository()
    repo = StrategyRepository(session)
    strategy = await repo.get_by_id(strategy_id)
    if not strategy:
        raise HTTPException(status_code=404, detail="巡检策略不存在")

    if not strategy.devices:
        raise HTTPException(status_code=400, detail="策略未配置设备，无法触发执行")

    # 简化实现：为策略关联的每台设备创建一条巡检执行记录（状态 pending）
    InspectionRepository = get_inspection_repository()
    inspection_repo = InspectionRepository(session)

    template_id = strategy.templates[0] if isinstance(strategy.templates, list) and strategy.templates else None
    inspection_ids: List[int] = []
    for device_id in (strategy.devices or []):
        inspection = await inspection_repo.create_inspection(
            device_id=int(device_id),
            template_id=int(template_id) if template_id is not None else None,
            name=f"{strategy.name} 手动触发",
            trigger=InspectionTrigger.MANUAL,
            created_by=current_user.get("id"),
        )
        inspection_ids.append(int(inspection.id))

    return api_ok(
        {
            "message": "触发成功",
            "inspection_ids": inspection_ids,
        },
        message="触发策略执行成功",
    )


# ============= 统计 =============

@router.get("/statistics", response_model=InspectionStatistics, summary="获取巡检统计")
async def get_inspection_statistics(
    current_user: dict = Depends(require_permission("inspections:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """获取巡检统计信息"""
    service = get_inspection_service()
    stats = await service.get_statistics(session)
    return InspectionStatistics(**stats)


# ============= 巡检执行记录 =============

@router.get("/executions", summary="获取巡检执行记录列表（分页）")
async def get_inspection_executions(
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(10, ge=1, le=100, description="每页数量"),
    status: Optional[str] = Query(None, description="状态过滤（逗号分隔多个状态）"),
    strategy_id: Optional[int] = Query(None, description="策略ID过滤"),
    start_date: Optional[str] = Query(None, description="开始日期（YYYY-MM-DD）"),
    end_date: Optional[str] = Query(None, description="结束日期（YYYY-MM-DD）"),
    current_user: dict = Depends(require_permission("inspections:read")),
    session: AsyncSession = Depends(get_db_session),
):
    """
    获取巡检执行记录列表
    
    返回格式与前端 InspectionExecution 接口对应
    """
    InspectionRepository = get_inspection_repository()
    repo = InspectionRepository(session)
    
    # 解析状态参数
    status_list = None
    if status:
        status_list = [s.strip() for s in status.split(",") if s.strip()]
    
    # 解析日期参数
    start_datetime = None
    end_datetime = None
    if start_date:
        try:
            start_datetime = datetime.strptime(start_date, "%Y-%m-%d")
        except ValueError:
            pass
    if end_date:
        try:
            end_datetime = datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1)
        except ValueError:
            pass
    
    # 查询执行记录
    inspections, total = await repo.get_executions_paginated(
        page=page,
        page_size=page_size,
        status=status_list,
        strategy_id=strategy_id,
        start_date=start_datetime,
        end_date=end_datetime,
    )
    
    # 转换为前端期望的格式
    def map_execution(inspection) -> Dict[str, Any]:
        # 计算进度
        total_checks = inspection.total_checks or 0
        completed_checks = (inspection.passed_checks or 0) + (inspection.failed_checks or 0) + (inspection.warning_checks or 0) + (inspection.skipped_checks or 0)
        progress = int((completed_checks / total_checks * 100) if total_checks > 0 else 0)
        
        # 如果已完成，进度为100
        if inspection.status in [InspectionStatus.COMPLETED.value, "completed"]:
            progress = 100
        elif inspection.status in [InspectionStatus.FAILED.value, "failed", InspectionStatus.CANCELLED.value, "cancelled"]:
            progress = progress or 0
        
        # 获取策略名称（从关联的schedule或使用inspection名称）
        strategy_name = inspection.name or ""
        strategy_id_value = ""
        if inspection.schedule:
            strategy_name = inspection.schedule.name or strategy_name
            strategy_id_value = str(inspection.schedule.id)
        elif inspection.schedule_id:
            strategy_id_value = str(inspection.schedule_id)
        
        # 计算评分
        score = 0
        if total_checks > 0:
            score = int((inspection.passed_checks or 0) / total_checks * 100)
        
        # 构建summary
        summary = {
            "totalChecks": total_checks,
            "passedChecks": inspection.passed_checks or 0,
            "failedChecks": inspection.failed_checks or 0,
            "warningChecks": inspection.warning_checks or 0,
            "score": score,
            "deviceResults": [],
        }
        
        # 获取触发类型
        trigger_type = "manual"
        if inspection.trigger:
            trigger_value = inspection.trigger if isinstance(inspection.trigger, str) else inspection.trigger.value
            if trigger_value in ["scheduled", "SCHEDULED"]:
                trigger_type = "scheduled"
            elif trigger_value in ["manual", "MANUAL"]:
                trigger_type = "manual"
        
        return {
            "id": str(inspection.id),
            "strategyId": strategy_id_value,
            "strategyName": strategy_name,
            "triggerType": trigger_type,
            "triggerUser": inspection.created_by or None,
            "status": inspection.status if isinstance(inspection.status, str) else inspection.status.value,
            "progress": progress,
            "totalDevices": 1,  # 当前模型是每个inspection对应一个设备
            "completedDevices": 1 if inspection.status in [InspectionStatus.COMPLETED.value, "completed", InspectionStatus.FAILED.value, "failed"] else 0,
            "startTime": inspection.started_at.isoformat() if inspection.started_at else (inspection.created_at.isoformat() if inspection.created_at else ""),
            "endTime": inspection.completed_at.isoformat() if inspection.completed_at else None,
            "duration": inspection.duration,
            "summary": summary,
        }
    
    pages = int(math.ceil(total / page_size)) if page_size > 0 else 0
    
    return api_ok({
        "items": [map_execution(i) for i in inspections],
        "total": int(total or 0),
        "pages": pages,
    })


@router.get("/executions/{execution_id}", summary="获取巡检执行记录详情")
async def get_inspection_execution_detail(
    execution_id: int,
    current_user: dict = Depends(require_permission("inspections:read")),
    session: AsyncSession = Depends(get_db_session),
):
    """获取单个巡检执行记录的详细信息"""
    InspectionRepository = get_inspection_repository()
    repo = InspectionRepository(session)
    
    inspection = await repo.get_execution_by_id(execution_id)
    if not inspection:
        raise HTTPException(status_code=404, detail="执行记录不存在")
    
    # 计算进度和评分
    total_checks = inspection.total_checks or 0
    completed_checks = (inspection.passed_checks or 0) + (inspection.failed_checks or 0) + (inspection.warning_checks or 0) + (inspection.skipped_checks or 0)
    progress = int((completed_checks / total_checks * 100) if total_checks > 0 else 0)
    
    if inspection.status in [InspectionStatus.COMPLETED.value, "completed"]:
        progress = 100
    
    score = 0
    if total_checks > 0:
        score = int((inspection.passed_checks or 0) / total_checks * 100)
    
    # 获取策略信息
    strategy_name = inspection.name or ""
    strategy_id_value = ""
    if inspection.schedule:
        strategy_name = inspection.schedule.name or strategy_name
        strategy_id_value = str(inspection.schedule.id)
    
    # 获取触发类型
    trigger_type = "manual"
    if inspection.trigger:
        trigger_value = inspection.trigger if isinstance(inspection.trigger, str) else inspection.trigger.value
        if trigger_value in ["scheduled", "SCHEDULED"]:
            trigger_type = "scheduled"
    
    # 构建检查结果
    check_results = []
    if inspection.results:
        for result in inspection.results:
            check_results.append({
                "checkItemId": str(result.id),
                "checkItemName": result.check_item_name,
                "status": result.status if isinstance(result.status, str) else result.status.value,
                "actualValue": result.actual_value,
                "expectedValue": result.expected_value,
                "message": result.message,
                "executionTime": result.execution_time or 0,
            })
    
    # 构建设备结果
    device_result = None
    if inspection.device:
        device_result = {
            "deviceId": str(inspection.device.id),
            "deviceName": inspection.device.name or "未知设备",
            "deviceType": inspection.device.device_type or "",
            "deviceIp": inspection.device.ip_address or "",
            "status": "success" if inspection.status in [InspectionStatus.COMPLETED.value, "completed"] and (inspection.failed_checks or 0) == 0 else ("warning" if (inspection.warning_checks or 0) > 0 else ("error" if (inspection.failed_checks or 0) > 0 else "offline")),
            "score": score,
            "checkResults": check_results,
            "passedChecks": inspection.passed_checks or 0,
            "totalChecks": total_checks,
            "executionTime": inspection.duration or 0,
        }
    
    summary = {
        "totalChecks": total_checks,
        "passedChecks": inspection.passed_checks or 0,
        "failedChecks": inspection.failed_checks or 0,
        "warningChecks": inspection.warning_checks or 0,
        "score": score,
        "deviceResults": [device_result] if device_result else [],
    }
    
    return api_ok({
        "id": str(inspection.id),
        "strategyId": strategy_id_value,
        "strategyName": strategy_name,
        "triggerType": trigger_type,
        "triggerUser": inspection.created_by or None,
        "status": inspection.status if isinstance(inspection.status, str) else inspection.status.value,
        "progress": progress,
        "totalDevices": 1,
        "completedDevices": 1 if inspection.status in [InspectionStatus.COMPLETED.value, "completed", InspectionStatus.FAILED.value, "failed"] else 0,
        "startTime": inspection.started_at.isoformat() if inspection.started_at else (inspection.created_at.isoformat() if inspection.created_at else ""),
        "endTime": inspection.completed_at.isoformat() if inspection.completed_at else None,
        "duration": inspection.duration,
        "summary": summary,
    })


@router.get("/trends", summary="获取巡检趋势数据")
async def get_inspection_trends(
    period: str = Query("week", description="时间周期: day/week/month"),
    start_date: Optional[str] = Query(None, description="开始日期（YYYY-MM-DD）"),
    end_date: Optional[str] = Query(None, description="结束日期（YYYY-MM-DD）"),
    current_user: dict = Depends(require_permission("inspections:read")),
    session: AsyncSession = Depends(get_db_session),
):
    """
    获取巡检趋势数据（用于统计分析页面的趋势图表）
    
    返回按日期聚合的执行次数、成功次数、失败次数和平均评分
    """
    InspectionRepository = get_inspection_repository()
    repo = InspectionRepository(session)
    
    # 解析日期参数
    now = datetime.utcnow()
    
    if start_date:
        try:
            start_datetime = datetime.strptime(start_date, "%Y-%m-%d")
        except ValueError:
            start_datetime = now - timedelta(days=7)
    else:
        # 默认根据周期设置开始日期
        if period == "day":
            start_datetime = now - timedelta(days=1)
        elif period == "month":
            start_datetime = now - timedelta(days=30)
        else:  # week
            start_datetime = now - timedelta(days=7)
    
    if end_date:
        try:
            end_datetime = datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1)
        except ValueError:
            end_datetime = now
    else:
        end_datetime = now
    
    # 获取趋势数据
    trend_data = await repo.get_trend_data(
        period=period,
        start_date=start_datetime,
        end_date=end_datetime
    )
    
    return api_ok(trend_data)


@router.get("/device-distribution", summary="获取设备分布统计")
async def get_device_distribution(
    current_user: dict = Depends(require_permission("inspections:read")),
    session: AsyncSession = Depends(get_db_session),
):
    """
    获取设备类型分布统计（用于统计分析页面的饼图）
    
    返回各设备类型的数量和颜色配置
    """
    from src.repositories.device_repository import DeviceRepository
    
    device_repo = DeviceRepository(session)
    distribution = await device_repo.get_device_type_distribution()
    
    return api_ok(distribution)


@router.get("/problem-distribution", summary="获取问题分布统计")
async def get_problem_distribution(
    current_user: dict = Depends(require_permission("inspections:read")),
    session: AsyncSession = Depends(get_db_session),
):
    """
    获取问题分类分布统计（用于统计分析页面的问题分布图表）
    
    返回各问题类型的数量统计
    """
    InspectionRepository = get_inspection_repository()
    repo = InspectionRepository(session)
    
    distribution = await repo.get_problem_category_distribution()
    
    return api_ok(distribution)


@router.get("/stats", summary="获取巡检统计（前端仪表盘）")
async def get_inspection_stats_dashboard(
    range: Optional[str] = Query(None, description="时间范围: 24h/7d/30d（可选）"),
    current_user: dict = Depends(require_permission("inspections:read")),
    session: AsyncSession = Depends(get_db_session),
):
    StrategyRepository = get_strategy_repository()
    strategy_repo = StrategyRepository(session)
    strategy_stats = await strategy_repo.get_strategy_statistics()

    total_strategies = int(strategy_stats.get("total_strategies", 0))
    active_strategies = int(strategy_stats.get("active_strategies", 0))

    now = datetime.utcnow()
    if range == "7d":
        start = now - timedelta(days=7)
        end = now
    elif range == "30d":
        start = now - timedelta(days=30)
        end = now
    else:
        start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        end = start + timedelta(days=1)

    previous_start = start - (end - start)
    previous_end = start

    InspectionRepository = get_inspection_repository()
    inspection_repo = InspectionRepository(session)

    current_summary = await inspection_repo.get_stats_summary(start_date=start, end_date=end)
    previous_summary = await inspection_repo.get_stats_summary(start_date=previous_start, end_date=previous_end)

    def pct_change(current_value: float, previous_value: float) -> str:
        if previous_value == 0:
            return "0.0%"
        return f"{((current_value - previous_value) / previous_value * 100):+.1f}%"

    def delta_change(current_value: float, previous_value: float) -> str:
        return f"{(current_value - previous_value):+.1f}%"

    current_total = float(current_summary.get("total_executions", 0))
    previous_total = float(previous_summary.get("total_executions", 0))

    current_success_rate = float(current_summary.get("success_rate", 0.0))
    previous_success_rate = float(previous_summary.get("success_rate", 0.0))

    current_avg_score = float(current_summary.get("avg_score", 0.0))
    previous_avg_score = float(previous_summary.get("avg_score", 0.0))

    data = {
        "totalStrategies": total_strategies,
        "activeStrategies": active_strategies,
        "todayExecutions": int(current_total),
        "successRate": current_success_rate,
        "avgScore": current_avg_score,
        "changes": {
            "executionsChange": pct_change(current_total, previous_total),
            "successRateChange": delta_change(current_success_rate, previous_success_rate),
            "avgScoreChange": delta_change(current_avg_score, previous_avg_score),
            "strategiesChange": "0.0%",
        },
        "recentExecutions": [],
    }

    return api_ok(data)
