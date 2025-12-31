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
    MonitoringDashboardStatsResponse,
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


@router.get("/stats", response_model=MonitoringDashboardStatsResponse, summary="获取监控仪表盘统计")
async def get_monitoring_stats(
    current_user: dict = Depends(require_permission("monitoring:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """
    获取监控中心仪表盘的6个关键指标:
    - 总设备数
    - 可用性
    - 活跃告警数
    - 平均CPU使用率
    - 平均内存使用率
    - 平均网络流量
    """
    DeviceRepository = get_device_repository()
    device_repo = DeviceRepository(session)
    cache_service = get_cache_service()
    
    # 获取设备统计
    device_stats = await device_repo.get_device_statistics()
    total_devices = device_stats.get("total_devices", 0)
    online_devices = device_stats.get("online_devices", 0)
    
    # 计算可用性
    availability = (online_devices / total_devices * 100) if total_devices > 0 else 0.0
    
    # 获取告警统计（从告警模块）
    try:
        from src.repositories.alert_repository_db import DatabaseAlertRepository
        alert_repo = DatabaseAlertRepository(session)
        # 获取活跃告警（状态为 OPEN 或 ACKNOWLEDGED）
        _, active_alerts = await alert_repo.get_active_alerts(skip=0, limit=1)
    except Exception as e:
        logger.warning(f"Failed to get alert count: {e}")
        active_alerts = 0
    
    # 获取性能指标（从缓存或计算平均值）
    avg_cpu = 0.0
    avg_memory = 0.0
    avg_network = 0.0
    
    try:
        # 尝试从缓存获取所有设备的状态
        devices, _ = await device_repo.get_devices_paginated(page=1, page_size=100, is_active=True)
        cpu_values = []
        memory_values = []
        network_values = []
        
        for device in devices:
            status_data = await cache_service.get_cached_device_status(device.id)
            if status_data and isinstance(status_data, dict):
                metrics = status_data.get("metrics", {})
                if isinstance(metrics, dict):
                    if "cpu_usage" in metrics:
                        cpu_val = metrics["cpu_usage"]
                        if isinstance(cpu_val, dict):
                            cpu_values.append(cpu_val.get("value", 0))
                        else:
                            cpu_values.append(cpu_val)
                    if "memory_usage" in metrics:
                        mem_val = metrics["memory_usage"]
                        if isinstance(mem_val, dict):
                            memory_values.append(mem_val.get("value", 0))
                        else:
                            memory_values.append(mem_val)
                    if "bandwidth_utilization" in metrics:
                        net_val = metrics["bandwidth_utilization"]
                        if isinstance(net_val, dict):
                            network_values.append(net_val.get("value", 0))
                        else:
                            network_values.append(net_val)
        
        if cpu_values:
            avg_cpu = sum(cpu_values) / len(cpu_values)
        if memory_values:
            avg_memory = sum(memory_values) / len(memory_values)
        if network_values:
            avg_network = sum(network_values) / len(network_values)
            
    except Exception as e:
        logger.warning(f"Failed to calculate average metrics: {e}")
    
    return MonitoringDashboardStatsResponse(
        total_devices=total_devices,
        availability=round(availability, 2),
        active_alerts=active_alerts,
        avg_cpu=round(avg_cpu, 1),
        avg_memory=round(avg_memory, 1),
        avg_network=round(avg_network, 1)
    )


@router.get("/stats/service", response_model=MonitoringStatsResponse, summary="获取监控服务状态")
async def get_monitoring_service_stats(
    current_user: dict = Depends(require_permission("monitoring:read"))
):
    """获取监控服务运行状态（内部使用）"""
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


@router.get("/devices/distribution", summary="获取设备状态分布")
async def get_device_status_distribution(
    current_user: dict = Depends(require_permission("monitoring:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """获取设备按状态的分布统计"""
    DeviceRepository = get_device_repository()
    device_repo = DeviceRepository(session)

    stats = await device_repo.get_device_statistics()

    return {
        "healthy": stats.get("online_devices", 0),
        "warning": stats.get("warning_devices", 0),
        "critical": stats.get("critical_devices", 0),
        "offline": stats.get("offline_devices", 0)
    }


@router.get("/availability", summary="获取系统可用性")
async def get_system_availability(
    current_user: dict = Depends(require_permission("monitoring:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """获取系统整体可用性数据"""
    DeviceRepository = get_device_repository()
    device_repo = DeviceRepository(session)

    stats = await device_repo.get_device_statistics()
    total = stats.get("total_devices", 0)
    online = stats.get("online_devices", 0)

    availability = (online / total * 100) if total > 0 else 100.0

    return {
        "current": round(availability, 2),
        "target": 99.9,
        "trend": "stable"
    }


@router.post("/system/performance", summary="获取系统性能历史")
async def get_system_performance_history(
    request_body: dict,
    current_user: dict = Depends(require_permission("monitoring:read"))
):
    """获取系统性能历史数据（CPU、内存、网络）"""
    monitoring_service = get_monitoring_service()

    # 从请求体获取参数
    start_time_str = request_body.get("start_time")
    end_time_str = request_body.get("end_time")
    metrics = request_body.get("metrics")

    # 解析时间参数
    try:
        if isinstance(start_time_str, str):
            start_time = datetime.fromisoformat(start_time_str.replace("Z", "+00:00"))
        else:
            start_time = datetime.now() - timedelta(hours=24)
        
        if isinstance(end_time_str, str):
            end_time = datetime.fromisoformat(end_time_str.replace("Z", "+00:00"))
        else:
            end_time = datetime.now()
    except (ValueError, TypeError):
        start_time = datetime.now() - timedelta(hours=24)
        end_time = datetime.now()

    # 获取系统级别的性能历史数据
    metric_names = metrics if isinstance(metrics, list) else ["cpu_usage", "memory_usage", "network_traffic"]

    try:
        history_data = await monitoring_service.get_system_performance_history(
            start_time=start_time,
            end_time=end_time,
            metrics=metric_names
        )
        return history_data or []
    except Exception as e:
        logger.warning(f"获取系统性能历史失败: {e}")
        # 返回空数据而不是抛出异常
        return []


@router.post("/devices/temperature", summary="获取设备温度历史")
async def get_device_temperature_history(
    request_body: dict,
    current_user: dict = Depends(require_permission("monitoring:read"))
):
    """获取设备温度历史数据"""
    monitoring_service = get_monitoring_service()

    # 从请求体获取参数
    start_time_str = request_body.get("start_time")
    end_time_str = request_body.get("end_time")

    # 解析时间参数
    try:
        if isinstance(start_time_str, str):
            start_time = datetime.fromisoformat(start_time_str.replace("Z", "+00:00"))
        else:
            start_time = datetime.now() - timedelta(hours=24)
        
        if isinstance(end_time_str, str):
            end_time = datetime.fromisoformat(end_time_str.replace("Z", "+00:00"))
        else:
            end_time = datetime.now()
    except (ValueError, TypeError):
        start_time = datetime.now() - timedelta(hours=24)
        end_time = datetime.now()

    try:
        history_data = await monitoring_service.get_temperature_history(
            start_time=start_time,
            end_time=end_time
        )
        return history_data or []
    except Exception as e:
        logger.warning(f"获取温度历史失败: {e}")
        # 返回空数据而不是抛出异常
        return []


@router.post("/network/traffic/history", summary="获取网络流量历史")
async def get_network_traffic_history(
    request_body: dict,
    current_user: dict = Depends(require_permission("monitoring:read"))
):
    """获取网络流量历史数据"""
    monitoring_service = get_monitoring_service()

    # 从请求体获取参数
    start_time_str = request_body.get("start_time")
    end_time_str = request_body.get("end_time")

    # 解析时间参数
    try:
        if isinstance(start_time_str, str):
            start_time = datetime.fromisoformat(start_time_str.replace("Z", "+00:00"))
        else:
            start_time = datetime.now() - timedelta(hours=24)
        
        if isinstance(end_time_str, str):
            end_time = datetime.fromisoformat(end_time_str.replace("Z", "+00:00"))
        else:
            end_time = datetime.now()
    except (ValueError, TypeError):
        start_time = datetime.now() - timedelta(hours=24)
        end_time = datetime.now()

    try:
        history_data = await monitoring_service.get_network_traffic_history(
            start_time=start_time,
            end_time=end_time
        )
        return history_data or []
    except Exception as e:
        logger.warning(f"获取网络流量历史失败: {e}")
        # 返回空数据而不是抛出异常
        return []
