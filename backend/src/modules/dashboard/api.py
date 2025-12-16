"""
仪表板模块 - API路由

提供系统概览、统计数据、趋势图表等API端点
"""
from fastapi import APIRouter, Depends, Query
from typing import Optional, List
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from src.core.permissions import require_permission
from src.core.database import get_db_session
from src.modules.dashboard.schemas import (
    DashboardOverview, DeviceStatusSummary, AlertSummary,
    DeviceTrend, AlertTrend, InspectionTrend,
    TopDevicesByAlerts, RecentActivity, SystemStatus
)

# 延迟导入
def get_device_repository():
    from src.repositories.device_repository import DeviceRepository
    return DeviceRepository

def get_alert_engine():
    from src.services.alert import alert_engine
    return alert_engine

def get_device_monitoring_service():
    from src.services.device import device_monitoring_service
    return device_monitoring_service

def get_cache_service():
    from src.infrastructure.cache import cache_service
    return cache_service

logger = structlog.get_logger()
router = APIRouter()


@router.get("/overview", response_model=DashboardOverview, summary="获取仪表板概览")
async def get_dashboard_overview(
    current_user: dict = Depends(require_permission("dashboard:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """获取仪表板概览数据"""
    DeviceRepository = get_device_repository()
    device_repo = DeviceRepository(session)
    
    # 获取设备统计
    device_stats = await device_repo.get_device_statistics()
    
    # 获取告警统计
    alert_engine = get_alert_engine()
    alerts = list(alert_engine.alerts.values())
    active_alerts = [a for a in alerts if a.status.value == "active"]
    critical_alerts = [a for a in alerts if a.severity.value == "critical"]
    
    # 计算系统健康度
    total_devices = device_stats.get("total_devices", 0)
    online_devices = device_stats.get("online_devices", 0)
    system_health = (online_devices / total_devices * 100) if total_devices > 0 else 100.0
    
    return DashboardOverview(
        total_devices=total_devices,
        online_devices=online_devices,
        offline_devices=device_stats.get("offline_devices", 0),
        warning_devices=0,  # TODO: 从监控服务获取
        total_alerts=len(alerts),
        active_alerts=len(active_alerts),
        critical_alerts=len(critical_alerts),
        total_inspections=0,  # TODO: 从巡检服务获取
        recent_inspections=0,
        inspection_pass_rate=0.0,
        system_health=round(system_health, 2)
    )


@router.get("/device-status", response_model=DeviceStatusSummary, summary="获取设备状态摘要")
async def get_device_status_summary(
    current_user: dict = Depends(require_permission("dashboard:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """获取设备状态摘要"""
    DeviceRepository = get_device_repository()
    device_repo = DeviceRepository(session)
    
    stats = await device_repo.get_device_statistics()
    
    return DeviceStatusSummary(
        online=stats.get("online_devices", 0),
        offline=stats.get("offline_devices", 0),
        warning=0,
        unknown=stats.get("unknown_devices", 0),
        total=stats.get("total_devices", 0)
    )


@router.get("/alert-summary", response_model=AlertSummary, summary="获取告警摘要")
async def get_alert_summary(
    current_user: dict = Depends(require_permission("dashboard:read"))
):
    """获取告警摘要"""
    alert_engine = get_alert_engine()
    alerts = list(alert_engine.alerts.values())
    
    critical = len([a for a in alerts if a.severity.value == "critical"])
    warning = len([a for a in alerts if a.severity.value == "warning"])
    info = len([a for a in alerts if a.severity.value == "info"])
    unacknowledged = len([a for a in alerts if a.status.value == "active"])
    
    return AlertSummary(
        critical=critical,
        warning=warning,
        info=info,
        total=len(alerts),
        unacknowledged=unacknowledged
    )


@router.get("/recent-activities", response_model=List[RecentActivity], summary="获取最近活动")
async def get_recent_activities(
    limit: int = Query(10, ge=1, le=50),
    current_user: dict = Depends(require_permission("dashboard:read"))
):
    """获取最近活动列表"""
    # TODO: 从活动日志获取
    # 目前返回空列表
    return []


@router.get("/system-status", response_model=SystemStatus, summary="获取系统状态")
async def get_system_status(
    current_user: dict = Depends(require_permission("dashboard:read"))
):
    """获取系统运行状态"""
    monitoring_service = get_device_monitoring_service()
    alert_engine = get_alert_engine()
    cache_service = get_cache_service()
    
    return SystemStatus(
        monitoring_service=monitoring_service.is_running,
        alert_engine=alert_engine.is_running,
        scheduler_service=False,  # TODO: 从调度服务获取
        influxdb_connected=True,  # TODO: 检查InfluxDB连接
        redis_connected=cache_service.redis.is_connected,
        database_connected=True,
        uptime_seconds=0,  # TODO: 计算运行时间
        last_check=datetime.now()
    )


@router.get("/top-devices-by-alerts", response_model=List[TopDevicesByAlerts], summary="获取告警最多的设备")
async def get_top_devices_by_alerts(
    limit: int = Query(5, ge=1, le=20),
    current_user: dict = Depends(require_permission("dashboard:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """获取告警最多的设备列表"""
    alert_engine = get_alert_engine()
    alerts = list(alert_engine.alerts.values())
    
    # 按设备统计告警
    device_alerts = {}
    for alert in alerts:
        if alert.device_id:
            if alert.device_id not in device_alerts:
                device_alerts[alert.device_id] = {
                    "device_id": alert.device_id,
                    "device_name": alert.device_name or f"Device {alert.device_id}",
                    "ip_address": alert.device_ip or "",
                    "alert_count": 0,
                    "critical_count": 0
                }
            device_alerts[alert.device_id]["alert_count"] += 1
            if alert.severity.value == "critical":
                device_alerts[alert.device_id]["critical_count"] += 1
    
    # 排序并返回
    sorted_devices = sorted(
        device_alerts.values(),
        key=lambda x: x["alert_count"],
        reverse=True
    )[:limit]
    
    return [TopDevicesByAlerts(**d) for d in sorted_devices]
