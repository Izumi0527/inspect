"""
巡检管理模块 - API路由

提供巡检任务、模板、策略管理等API端点
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, List
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from src.core.permissions import require_permission
from src.core.database import get_db_session
from src.modules.inspection.schemas import (
    InspectionTaskCreate, InspectionTaskResponse,
    InspectionResultResponse, InspectionStatistics,
    InspectionTemplateCreate, InspectionTemplateResponse,
    InspectionStrategyCreate, InspectionStrategyResponse,
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


# ============= 巡检任务 =============

@router.get("/tasks", response_model=List[InspectionTaskResponse], summary="获取巡检任务列表")
async def get_inspection_tasks(
    status: Optional[InspectionStatus] = Query(None, description="状态过滤"),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(require_permission("inspection:read")),
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
    current_user: dict = Depends(require_permission("inspection:create")),
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
    current_user: dict = Depends(require_permission("inspection:read")),
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
    current_user: dict = Depends(require_permission("inspection:execute")),
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
    current_user: dict = Depends(require_permission("inspection:execute")),
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
    current_user: dict = Depends(require_permission("inspection:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """获取巡检任务的结果列表"""
    InspectionRepository = get_inspection_repository()
    repo = InspectionRepository(session)
    
    results = await repo.get_task_results(task_id)
    return [InspectionResultResponse(**r.__dict__) for r in results]


# ============= 巡检模板 =============

@router.get("/templates", response_model=List[InspectionTemplateResponse], summary="获取巡检模板列表")
async def get_inspection_templates(
    device_type: Optional[str] = Query(None, description="设备类型过滤"),
    current_user: dict = Depends(require_permission("inspection:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """获取巡检模板列表"""
    TemplateRepository = get_template_repository()
    repo = TemplateRepository(session)
    
    templates = await repo.get_all_templates(device_type=device_type)
    return [InspectionTemplateResponse(**t.__dict__) for t in templates]


@router.post("/templates", response_model=InspectionTemplateResponse, summary="创建巡检模板")
async def create_inspection_template(
    template_data: InspectionTemplateCreate,
    current_user: dict = Depends(require_permission("inspection:create")),
    session: AsyncSession = Depends(get_db_session)
):
    """创建新的巡检模板"""
    TemplateRepository = get_template_repository()
    repo = TemplateRepository(session)
    
    template = await repo.create_template(
        template_data.model_dump(),
        created_by=current_user["id"]
    )
    
    logger.info("Inspection template created", template_id=template.id, created_by=current_user["id"])
    return InspectionTemplateResponse(**template.__dict__)


@router.get("/templates/{template_id}", response_model=InspectionTemplateResponse, summary="获取巡检模板详情")
async def get_inspection_template(
    template_id: int,
    current_user: dict = Depends(require_permission("inspection:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """获取指定巡检模板详情"""
    TemplateRepository = get_template_repository()
    repo = TemplateRepository(session)
    
    template = await repo.get_template_by_id(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="巡检模板不存在")
    
    return InspectionTemplateResponse(**template.__dict__)


@router.delete("/templates/{template_id}", summary="删除巡检模板")
async def delete_inspection_template(
    template_id: int,
    current_user: dict = Depends(require_permission("inspection:delete")),
    session: AsyncSession = Depends(get_db_session)
):
    """删除巡检模板"""
    TemplateRepository = get_template_repository()
    repo = TemplateRepository(session)
    
    success = await repo.delete_template(template_id)
    if not success:
        raise HTTPException(status_code=404, detail="巡检模板不存在")
    
    logger.info("Inspection template deleted", template_id=template_id, deleted_by=current_user["id"])
    return {"message": "巡检模板已删除"}


# ============= 巡检策略 =============

@router.get("/strategies", response_model=List[InspectionStrategyResponse], summary="获取巡检策略列表")
async def get_inspection_strategies(
    enabled: Optional[bool] = Query(None, description="是否启用"),
    current_user: dict = Depends(require_permission("inspection:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """获取巡检策略列表"""
    StrategyRepository = get_strategy_repository()
    repo = StrategyRepository(session)
    
    strategies = await repo.get_all_strategies(enabled=enabled)
    return [InspectionStrategyResponse(**s.__dict__) for s in strategies]


@router.post("/strategies", response_model=InspectionStrategyResponse, summary="创建巡检策略")
async def create_inspection_strategy(
    strategy_data: InspectionStrategyCreate,
    current_user: dict = Depends(require_permission("inspection:create")),
    session: AsyncSession = Depends(get_db_session)
):
    """创建新的巡检策略"""
    StrategyRepository = get_strategy_repository()
    repo = StrategyRepository(session)
    
    strategy = await repo.create_strategy(
        strategy_data.model_dump(),
        created_by=current_user["id"]
    )
    
    logger.info("Inspection strategy created", strategy_id=strategy.id, created_by=current_user["id"])
    return InspectionStrategyResponse(**strategy.__dict__)


@router.delete("/strategies/{strategy_id}", summary="删除巡检策略")
async def delete_inspection_strategy(
    strategy_id: int,
    current_user: dict = Depends(require_permission("inspection:delete")),
    session: AsyncSession = Depends(get_db_session)
):
    """删除巡检策略"""
    StrategyRepository = get_strategy_repository()
    repo = StrategyRepository(session)
    
    success = await repo.delete_strategy(strategy_id)
    if not success:
        raise HTTPException(status_code=404, detail="巡检策略不存在")
    
    logger.info("Inspection strategy deleted", strategy_id=strategy_id, deleted_by=current_user["id"])
    return {"message": "巡检策略已删除"}


# ============= 统计 =============

@router.get("/statistics", response_model=InspectionStatistics, summary="获取巡检统计")
async def get_inspection_statistics(
    current_user: dict = Depends(require_permission("inspection:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """获取巡检统计信息"""
    service = get_inspection_service()
    stats = await service.get_statistics(session)
    return InspectionStatistics(**stats)
