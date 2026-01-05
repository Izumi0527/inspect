"""
设备日志管理 - API路由

提供设备日志的采集、查询、搜索等API端点
"""
from fastapi import APIRouter, HTTPException, Depends, Query, BackgroundTasks
from typing import Optional, List
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from src.core.permissions import require_permission
from src.core.database import get_db_session
from src.shared.exceptions import NotFoundException
from src.shared.pagination import get_pagination_params, PaginationParams

from src.services.logging.log_service import LogService
from src.models.device_log import LogLevel, LogFacility
from src.modules.logs.schemas import (
    LogResponse, LogListResponse, LogStatisticsResponse,
    LogCollectionRequest, LogCollectionResponse
)

logger = structlog.get_logger()
router = APIRouter()


# ============= 日志查询端点 =============

@router.get("/devices/{device_id}/logs", response_model=LogListResponse, summary="获取设备日志")
async def get_device_logs(
    device_id: int,
    skip: int = Query(0, ge=0, description="跳过的记录数"),
    limit: int = Query(100, ge=1, le=1000, description="返回的记录数"),
    level: Optional[str] = Query(None, description="日志级别过滤"),
    facility: Optional[str] = Query(None, description="设施类型过滤"),
    start_time: Optional[datetime] = Query(None, description="开始时间"),
    end_time: Optional[datetime] = Query(None, description="结束时间"),
    search: Optional[str] = Query(None, description="搜索关键词"),
    current_user: dict = Depends(require_permission("logs:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """获取指定设备的日志列表，支持分页和过滤"""
    service = LogService(session)
    
    # 转换枚举参数
    level_enum = None
    if level:
        try:
            level_enum = LogLevel(level)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid log level: {level}")
    
    facility_enum = None
    if facility:
        try:
            facility_enum = LogFacility(facility)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid facility: {facility}")
    
    try:
        logs, total = await service.get_device_logs(
            device_id=device_id,
            skip=skip,
            limit=limit,
            level=level_enum,
            facility=facility_enum,
            start_time=start_time,
            end_time=end_time,
            search=search
        )
        
        logger.info("Device logs retrieved", 
                   device_id=device_id, 
                   count=len(logs), 
                   total=total,
                   user_id=current_user.get("id"))
        
        return LogListResponse(
            logs=[LogResponse(**log) for log in logs],
            total=total,
            page=skip // limit + 1 if limit > 0 else 1,
            page_size=limit
        )
        
    except Exception as e:
        logger.error("Failed to get device logs", device_id=device_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"获取设备日志失败: {str(e)}")


@router.get("/logs/recent", response_model=List[LogResponse], summary="获取最近日志")
async def get_recent_logs(
    device_id: Optional[int] = Query(None, description="设备ID过滤"),
    hours: int = Query(24, ge=1, le=168, description="最近小时数"),
    level: Optional[str] = Query(None, description="日志级别过滤"),
    limit: int = Query(100, ge=1, le=1000, description="返回数量限制"),
    current_user: dict = Depends(require_permission("logs:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """获取最近的日志"""
    service = LogService(session)
    
    # 转换枚举参数
    level_enum = None
    if level:
        try:
            level_enum = LogLevel(level)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid log level: {level}")
    
    try:
        logs = await service.get_recent_logs(
            device_id=device_id,
            hours=hours,
            level=level_enum,
            limit=limit
        )
        
        logger.info("Recent logs retrieved", 
                   device_id=device_id,
                   hours=hours,
                   count=len(logs),
                   user_id=current_user.get("id"))
        
        return [LogResponse(**log) for log in logs]
        
    except Exception as e:
        logger.error("Failed to get recent logs", error=str(e))
        raise HTTPException(status_code=500, detail=f"获取最近日志失败: {str(e)}")


@router.get("/logs/search", response_model=LogListResponse, summary="搜索日志")
async def search_logs(
    keyword: str = Query(..., description="搜索关键词"),
    skip: int = Query(0, ge=0, description="跳过的记录数"),
    limit: int = Query(100, ge=1, le=1000, description="返回的记录数"),
    device_id: Optional[int] = Query(None, description="设备ID过滤"),
    level: Optional[str] = Query(None, description="日志级别过滤"),
    current_user: dict = Depends(require_permission("logs:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """搜索日志"""
    service = LogService(session)
    
    # 转换枚举参数
    level_enum = None
    if level:
        try:
            level_enum = LogLevel(level)
        except ValueError:
            raise HTTPException(status_code=400, detail=f"Invalid log level: {level}")
    
    try:
        logs, total = await service.search_logs(
            keyword=keyword,
            skip=skip,
            limit=limit,
            device_id=device_id,
            level=level_enum
        )
        
        logger.info("Logs searched", 
                   keyword=keyword,
                   device_id=device_id,
                   count=len(logs),
                   total=total,
                   user_id=current_user.get("id"))
        
        return LogListResponse(
            logs=[LogResponse(**log) for log in logs],
            total=total,
            page=skip // limit + 1 if limit > 0 else 1,
            page_size=limit
        )
        
    except Exception as e:
        logger.error("Failed to search logs", keyword=keyword, error=str(e))
        raise HTTPException(status_code=500, detail=f"搜索日志失败: {str(e)}")


# ============= 日志采集端点 =============

@router.post("/devices/{device_id}/logs/collect", response_model=LogCollectionResponse, summary="采集设备日志")
async def collect_device_logs(
    device_id: int,
    request: LogCollectionRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(require_permission("logs:collect")),
    session: AsyncSession = Depends(get_db_session)
):
    """采集指定设备的日志"""
    service = LogService(session)
    
    try:
        # 在后台任务中执行日志采集
        background_tasks.add_task(
            _collect_device_logs_task,
            service,
            device_id,
            request.log_type,
            request.max_entries,
            current_user.get("id")
        )
        
        logger.info("Log collection task started", 
                   device_id=device_id,
                   log_type=request.log_type,
                   user_id=current_user.get("id"))
        
        return LogCollectionResponse(
            message="日志采集任务已启动",
            device_id=device_id,
            log_type=request.log_type,
            status="started"
        )
        
    except Exception as e:
        logger.error("Failed to start log collection", device_id=device_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"启动日志采集失败: {str(e)}")


@router.post("/logs/batch-collect", response_model=LogCollectionResponse, summary="批量采集设备日志")
async def batch_collect_logs(
    device_ids: List[int],
    background_tasks: BackgroundTasks,
    log_type: str = Query("system", description="日志类型"),
    max_concurrent: int = Query(5, ge=1, le=20, description="最大并发数"),
    current_user: dict = Depends(require_permission("logs:collect")),
    session: AsyncSession = Depends(get_db_session)
):
    """批量采集多个设备的日志"""
    if not device_ids:
        raise HTTPException(status_code=400, detail="请选择要采集日志的设备")
    
    service = LogService(session)
    
    try:
        # 在后台任务中执行批量日志采集
        background_tasks.add_task(
            _batch_collect_logs_task,
            service,
            device_ids,
            log_type,
            max_concurrent,
            current_user.get("id")
        )
        
        logger.info("Batch log collection task started", 
                   device_count=len(device_ids),
                   log_type=log_type,
                   user_id=current_user.get("id"))
        
        return LogCollectionResponse(
            message=f"批量日志采集任务已启动，涉及 {len(device_ids)} 台设备",
            device_ids=device_ids,
            log_type=log_type,
            status="started"
        )
        
    except Exception as e:
        logger.error("Failed to start batch log collection", 
                    device_ids=device_ids, error=str(e))
        raise HTTPException(status_code=500, detail=f"启动批量日志采集失败: {str(e)}")


# ============= 日志统计端点 =============

@router.get("/logs/statistics", response_model=LogStatisticsResponse, summary="获取日志统计")
async def get_log_statistics(
    device_id: Optional[int] = Query(None, description="设备ID过滤"),
    hours: int = Query(24, ge=1, le=168, description="统计时间范围（小时）"),
    current_user: dict = Depends(require_permission("logs:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """获取日志统计信息"""
    service = LogService(session)
    
    try:
        stats = await service.get_log_statistics(
            device_id=device_id,
            hours=hours
        )
        
        logger.info("Log statistics retrieved", 
                   device_id=device_id,
                   hours=hours,
                   total_logs=stats.get("total_logs", 0),
                   user_id=current_user.get("id"))
        
        return LogStatisticsResponse(**stats)
        
    except Exception as e:
        logger.error("Failed to get log statistics", error=str(e))
        raise HTTPException(status_code=500, detail=f"获取日志统计失败: {str(e)}")


# ============= 后台任务 =============

async def _collect_device_logs_task(
    service: LogService,
    device_id: int,
    log_type: str,
    max_entries: int,
    user_id: Optional[int]
):
    """设备日志采集后台任务"""
    try:
        collected_count = await service.collect_device_logs(
            device_id=device_id,
            log_type=log_type,
            max_entries=max_entries
        )
        
        logger.info("Device log collection completed", 
                   device_id=device_id,
                   collected_count=collected_count,
                   user_id=user_id)
        
    except Exception as e:
        logger.error("Device log collection task failed", 
                    device_id=device_id, error=str(e))


async def _batch_collect_logs_task(
    service: LogService,
    device_ids: List[int],
    log_type: str,
    max_concurrent: int,
    user_id: Optional[int]
):
    """批量日志采集后台任务"""
    try:
        results = await service.batch_collect_logs(
            device_ids=device_ids,
            log_type=log_type,
            max_concurrent=max_concurrent
        )
        
        total_collected = sum(results.values())
        
        logger.info("Batch log collection completed", 
                   device_count=len(device_ids),
                   total_collected=total_collected,
                   user_id=user_id)
        
    except Exception as e:
        logger.error("Batch log collection task failed", 
                    device_ids=device_ids, error=str(e))