"""
实时监控模块 - API路由

提供设备监控状态、性能指标、历史数据等API端点
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, List
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from src.core.permissions import require_permission
from src.core.database import get_db_session
from src.modules.monitoring.schemas import (
    DeviceStatusResponse,
    DeviceMetricsResponse,
    MonitoringStatsResponse,
    MetricsHistoryResponse,
)

# 延迟导入避免循环依赖
def get_device_monitoring_service():
    from src.services.device import device_monitoring_service
    return device_monitoring_service

def get_monitoring_service():
    from src.services.monitoring import monitoring_service
    return monitoring_service

def get_cache_service():
    from src.infrastructure.cache import cache_service
    return cache_service

def get_device_repository():
    from src.repositories.device_repository import DeviceRepository
    return DeviceRepository

logger = structlog.get_logger()
router = APIRouter()


@router.get("/stats", response_model=MonitoringStatsResponse, summary="获取监控统计")
async def get_monitoring_stats(
    current_user: dict = Depends(require_permission("monitoring:read"))
):
    """获取监控服务统计信息"""
    service = get_device_monitoring_service()
    stats = await service.get_monitoring_stats()
    return MonitoringStatsResponse(**stats)


@router.get("/devices/{device_id}/status", response_model=DeviceStatusResponse, summary="获取设备状态")
async def get_device_status(
    device_id: int,
    current_user: dict = Depends(require_permission("monitoring:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """获取指定设备的实时状态"""
    cache_service = get_cache_service()
    DeviceRepository = get_device_repository()
    
    # 从缓存获取状态
    status_data = await cache_service.get_cached_device_status(device_id)
    
    # 获取设备信息
    device_repo = DeviceRepository(session)
    device = await device_repo.get_device_by_id(device_id)
    
    if not device:
        raise HTTPException(status_code=404, detail="设备不存在")
    
    if status_data:
        return DeviceStatusResponse(
            device_id=device_id,
            device_name=device.name,
            ip_address=device.ip_address,
            status=status_data.get("status", "unknown"),
            response_time=status_data.get("response_time"),
            last_check=datetime.fromtimestamp(status_data.get("last_update", 0)) if status_data.get("last_update") else None
        )
    else:
        return DeviceStatusResponse(
            device_id=device_id,
            device_name=device.name,
            ip_address=device.ip_address,
            status="unknown",
            response_time=None,
            last_check=None
        )


@router.get("/devices/{device_id}/metrics", response_model=DeviceMetricsResponse, summary="获取设备指标")
async def get_device_metrics(
    device_id: int,
    current_user: dict = Depends(require_permission("monitoring:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """获取指定设备的实时性能指标"""
    DeviceRepository = get_device_repository()
    
    device_repo = DeviceRepository(session)
    device = await device_repo.get_device_by_id(device_id)
    
    if not device:
        raise HTTPException(status_code=404, detail="设备不存在")
    
    # TODO: 从InfluxDB获取最新指标
    # 目前返回模拟数据
    return DeviceMetricsResponse(
        device_id=device_id,
        timestamp=datetime.now(),
        cpu_usage=None,
        memory_usage=None,
        disk_usage=None
    )


@router.get("/devices/{device_id}/history", response_model=MetricsHistoryResponse, summary="获取历史指标")
async def get_device_metrics_history(
    device_id: int,
    start_time: Optional[datetime] = Query(None, description="开始时间"),
    end_time: Optional[datetime] = Query(None, description="结束时间"),
    metric_names: Optional[str] = Query(None, description="指标名称，逗号分隔"),
    current_user: dict = Depends(require_permission("monitoring:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """获取设备历史监控数据"""
    DeviceRepository = get_device_repository()
    
    device_repo = DeviceRepository(session)
    device = await device_repo.get_device_by_id(device_id)
    
    if not device:
        raise HTTPException(status_code=404, detail="设备不存在")
    
    # 默认时间范围：最近24小时
    if not end_time:
        end_time = datetime.now()
    if not start_time:
        start_time = end_time - timedelta(hours=24)
    
    # 解析指标名称
    metrics = metric_names.split(",") if metric_names else None
    
    # 从监控服务获取历史数据
    service = get_device_monitoring_service()
    history_data = await service.get_device_metrics_history(
        device_id=device_id,
        start_time=start_time,
        end_time=end_time,
        metric_names=metrics
    )
    
    return MetricsHistoryResponse(
        device_id=device_id,
        start_time=start_time,
        end_time=end_time,
        data_points=history_data or [],
        metric_names=metrics or []
    )


@router.get("/devices/status", response_model=List[DeviceStatusResponse], summary="获取所有设备状态")
async def get_all_devices_status(
    current_user: dict = Depends(require_permission("monitoring:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """获取所有设备的实时状态"""
    cache_service = get_cache_service()
    DeviceRepository = get_device_repository()
    
    device_repo = DeviceRepository(session)
    devices, _ = await device_repo.get_devices_paginated(page=1, page_size=1000, is_active=True)
    
    result = []
    for device in devices:
        status_data = await cache_service.get_cached_device_status(device.id)
        
        result.append(DeviceStatusResponse(
            device_id=device.id,
            device_name=device.name,
            ip_address=device.ip_address,
            status=status_data.get("status", "unknown") if status_data else "unknown",
            response_time=status_data.get("response_time") if status_data else None,
            last_check=datetime.fromtimestamp(status_data.get("last_update", 0)) if status_data and status_data.get("last_update") else None
        ))
    
    return result


@router.post("/start", summary="启动监控服务")
async def start_monitoring(
    current_user: dict = Depends(require_permission("monitoring:admin"))
):
    """启动设备监控服务"""
    service = get_device_monitoring_service()
    await service.start_monitoring()
    
    logger.info("Monitoring service started", started_by=current_user["id"])
    return {"message": "监控服务已启动"}


@router.post("/stop", summary="停止监控服务")
async def stop_monitoring(
    current_user: dict = Depends(require_permission("monitoring:admin"))
):
    """停止设备监控服务"""
    service = get_device_monitoring_service()
    await service.stop_monitoring()
    
    logger.info("Monitoring service stopped", stopped_by=current_user["id"])
    return {"message": "监控服务已停止"}
