"""
Dashboard API路由
提供仪表板数据聚合接口
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text, select, func
from typing import Dict, Any, List
from datetime import datetime, timedelta
import structlog

from src.core.permissions import require_permission
from src.core.database import get_db_session
from src.core.config import settings
from src.models.device import Device
from src.models.alert import Alert, AlertSeverity
from src.models.system import SystemBackup
from src.repositories.device_repository import DeviceRepository
from src.services.monitoring import MonitoringService
from src.core.redis import redis_manager
from src.core.influxdb import influxdb_client

router = APIRouter()
logger = structlog.get_logger()

# Dashboard数据结构
class DashboardStats:
    """仪表板统计数据"""
    
    def __init__(self):
        self.online_devices = 0
        self.total_devices = 0
        self.active_alerts = 0
        self.critical_alerts = 0
        self.network_traffic = "0 MB/s"
        self.system_load = "0%"

@router.get("/overview", summary="获取仪表板概览数据")
async def get_dashboard_overview(
    db: AsyncSession = Depends(get_db_session),
    current_user: dict = Depends(require_permission("monitoring:read"))
):
    """获取仪表板概览数据，包括设备状态、告警统计等"""
    try:
        # 初始化统计数据
        stats = DashboardStats()
        
        # 1. 获取设备统计
        device_repo = DeviceRepository(db)
        
        # 总设备数和在线设备数
        total_devices_query = select(func.count(Device.id))
        total_result = await db.execute(total_devices_query)
        stats.total_devices = total_result.scalar() or 0
        
        online_devices_query = select(func.count(Device.id)).where(Device.status == 'online')
        online_result = await db.execute(online_devices_query)
        stats.online_devices = online_result.scalar() or 0
        
        # 2. 获取告警统计
        active_alerts_query = select(func.count(Alert.id)).where(
            Alert.status.in_(['open', 'acknowledged'])
        )
        active_result = await db.execute(active_alerts_query)
        stats.active_alerts = active_result.scalar() or 0
        
        critical_alerts_query = select(func.count(Alert.id)).where(
            Alert.severity == AlertSeverity.CRITICAL,
            Alert.status.in_(['open', 'acknowledged'])
        )
        critical_result = await db.execute(critical_alerts_query)
        stats.critical_alerts = critical_result.scalar() or 0

        # 计算昨日告警数量（用于较昨日变化）
        yesterday_start = datetime.now() - timedelta(days=1)
        yesterday_start = yesterday_start.replace(hour=0, minute=0, second=0, microsecond=0)
        yesterday_end = yesterday_start + timedelta(days=1)

        yesterday_alerts_query = select(func.count(Alert.id)).where(
            Alert.created_at >= yesterday_start,
            Alert.created_at < yesterday_end,
            Alert.status.in_(['open', 'acknowledged'])
        )
        yesterday_alerts_result = await db.execute(yesterday_alerts_query)
        yesterday_alert_count = yesterday_alerts_result.scalar() or 0

        # 计算告警变化
        alert_change = stats.active_alerts - yesterday_alert_count
        alert_change_percent = round((alert_change / yesterday_alert_count * 100), 1) if yesterday_alert_count > 0 else 0

        # 3. 计算设备健康度
        device_health_percentage = (stats.online_devices / stats.total_devices * 100) if stats.total_devices > 0 else 0
        
        # 4. 获取网络流量数据
        try:
            monitoring_service = MonitoringService()
            network_stats = await monitoring_service.get_network_overview()
            stats.network_traffic = network_stats.get('total_traffic', '0 MB/s')
            stats.system_load = network_stats.get('avg_cpu_usage', '0%')
        except AttributeError as e:
            logger.warning("MonitoringService method missing", error=str(e))
            stats.network_traffic = "0 MB/s"  # 使用0而不是模拟值
            stats.system_load = "0%"
        except Exception as e:
            logger.warning("获取监控数据失败", error=str(e))
            stats.network_traffic = "0 MB/s"
            stats.system_load = "0%"

        # 5. 获取系统运行时间
        try:
            import psutil
            import time
            boot_time = psutil.boot_time()  # 系统启动时间戳
            uptime_seconds = time.time() - boot_time  # 运行秒数
            days = int(uptime_seconds // 86400)
            hours = int((uptime_seconds % 86400) // 3600)
            system_uptime = f"{days}天 {hours}小时"
        except Exception as e:
            logger.warning("获取系统运行时间失败", error=str(e))
            system_uptime = "未知"

        # 6. 获取最后备份时间
        try:
            last_backup_query = select(SystemBackup.created_at).where(
                SystemBackup.status == 'completed'
            ).order_by(SystemBackup.created_at.desc()).limit(1)
            last_backup_result = await db.execute(last_backup_query)
            last_backup_time = last_backup_result.scalar()
            last_backup_str = last_backup_time.strftime("%Y-%m-%d %H:%M:%S") if last_backup_time else "未执行"
        except Exception as e:
            logger.warning("获取最后备份时间失败", error=str(e))
            last_backup_str = "未知"

        # 7. 构建响应数据
        dashboard_data = {
            # 主要统计卡片
            "stats": [
                {
                    "title": "在线设备",
                    "value": str(stats.online_devices),
                    "total": stats.total_devices,
                    "change": f"+{max(0, stats.online_devices - (stats.total_devices - stats.online_devices))}",
                    "changePercent": f"+{device_health_percentage:.1f}%",
                    "iconName": "Monitor",
                    "iconColor": "text-green-600",
                    "color": "green",
                    "trend": "up" if stats.online_devices > stats.total_devices * 0.8 else "down"
                },
                {
                    "title": "活跃告警",
                    "value": str(stats.active_alerts),
                    "critical": stats.critical_alerts,
                    "change": f"{alert_change:+d}较昨日" if alert_change != 0 else "无变化",
                    "changePercent": f"{alert_change_percent:+.1f}%" if yesterday_alert_count > 0 else "0%",
                    "iconName": "AlertTriangle",
                    "iconColor": "text-red-600" if stats.critical_alerts > 0 else "text-yellow-600",
                    "color": "red" if stats.critical_alerts > 0 else "yellow",
                    "trend": "down" if alert_change < 0 else ("up" if alert_change > 0 else "stable")
                },
                {
                    "title": "网络流量",
                    "value": stats.network_traffic,
                    "change": "动态计算",
                    "changePercent": "0%",
                    "iconName": "Activity",
                    "iconColor": "text-blue-600",
                    "color": "blue",
                    "trend": "stable"
                },
                {
                    "title": "系统负载",
                    "value": stats.system_load,
                    "change": "动态计算",
                    "changePercent": "0%",
                    "iconName": "Server",
                    "iconColor": "text-purple-600",
                    "color": "purple",
                    "trend": "stable"
                }
            ],
            
            # 最近告警
            "recent_alerts": await get_recent_alerts(db),
            
            # 网络概览
            "network_overview": [
                {
                    "name": "核心网络",
                    "devices": stats.online_devices,
                    "status": "healthy" if device_health_percentage > 90 else "warning",
                    "utilization": min(100, max(0, round((stats.online_devices / max(1, stats.total_devices)) * 100))),
                    "alerts": stats.critical_alerts
                },
                {
                    "name": "接入网络",
                    "devices": max(0, stats.total_devices - stats.online_devices),
                    "status": "warning" if stats.total_devices - stats.online_devices > 2 else "healthy",
                    "utilization": min(100, max(0, round(((stats.total_devices - stats.online_devices) / max(1, stats.total_devices)) * 100))),
                    "alerts": max(0, stats.active_alerts - stats.critical_alerts)
                }
            ],
            
            # 快速操作
            "quick_actions": [
                {
                    "name": "设备扫描",
                    "description": "扫描网络中的新设备",
                    "icon": "Search",
                    "href": "/devices?action=discover",
                    "color": "blue"
                },
                {
                    "name": "手动巡检",
                    "description": "执行手动巡检任务", 
                    "icon": "Play",
                    "href": "/inspection/tasks?action=create",
                    "color": "green"
                },
                {
                    "name": "生成报表",
                    "description": "生成系统运行报表",
                    "icon": "FileText", 
                    "href": "/reports?action=generate",
                    "color": "purple"
                },
                {
                    "name": "系统设置",
                    "description": "配置系统参数",
                    "icon": "Settings",
                    "href": "/settings",
                    "color": "gray"
                }
            ],
            
            # 系统状态
            "system_status": {
                "overall_health": "healthy" if device_health_percentage > 85 else "warning",
                "uptime": system_uptime,
                "last_backup": last_backup_str,
                "license_expiry": settings.LICENSE_EXPIRY,
                "version": settings.APP_VERSION
            }
        }
        
        logger.info("Dashboard数据获取成功", 
                   total_devices=stats.total_devices,
                   online_devices=stats.online_devices,
                   active_alerts=stats.active_alerts)
        
        return {
            "success": True,
            "data": dashboard_data,
            "message": "Dashboard数据获取成功"
        }
        
    except Exception as e:
        logger.error("获取Dashboard数据失败", error=str(e))
        raise HTTPException(status_code=500, detail=f"获取Dashboard数据失败: {str(e)}")

async def get_recent_alerts(db: AsyncSession, limit: int = 5) -> List[Dict[str, Any]]:
    """获取最近的告警信息"""
    try:
        # 获取最近的告警记录
        query = (
            select(Alert, Device.name.label('device_name'))
            .join(Device, Alert.device_id == Device.id)
            .where(Alert.status.in_(['open', 'acknowledged']))
            .order_by(Alert.created_at.desc())
            .limit(limit)
        )
        
        result = await db.execute(query)
        alerts_data = result.all()
        
        recent_alerts = []
        for alert, device_name in alerts_data:
            recent_alerts.append({
                "id": alert.id,
                "device": device_name,
                "message": alert.message,
                "severity": alert.severity.value,
                "time": alert.created_at.strftime("%Y-%m-%d %H:%M:%S"),
                "category": alert.alert_type or "系统"
            })
        
        return recent_alerts
        
    except Exception as e:
        logger.warning("获取最近告警失败", error=str(e))
        return []

@router.get("/stats", summary="获取仪表板统计数据")
async def get_dashboard_stats(
    db: AsyncSession = Depends(get_db_session),
    current_user: dict = Depends(require_permission("monitoring:read"))
):
    """获取仪表板统计数据"""
    try:
        # 基础设备统计
        total_devices = await db.scalar(select(func.count(Device.id)))
        online_devices = await db.scalar(
            select(func.count(Device.id)).where(Device.status == 'online')
        )
        
        # 告警统计
        active_alerts = await db.scalar(
            select(func.count(Alert.id)).where(Alert.status.in_(['open', 'acknowledged']))
        )
        
        return {
            "success": True,
            "data": {
                "devices": {
                    "total": total_devices or 0,
                    "online": online_devices or 0,
                    "offline": (total_devices or 0) - (online_devices or 0),
                    "health_percentage": round((online_devices / total_devices * 100) if total_devices else 0, 1)
                },
                "alerts": {
                    "total": active_alerts or 0,
                    "critical": await db.scalar(
                        select(func.count(Alert.id)).where(
                            Alert.severity == AlertSeverity.CRITICAL,
                            Alert.status.in_(['open', 'acknowledged'])
                        )
                    ) or 0
                }
            }
        }
        
    except Exception as e:
        logger.error("获取统计数据失败", error=str(e))
        raise HTTPException(status_code=500, detail="获取统计数据失败")

@router.get("/health", summary="获取系统健康状态")
async def get_system_health(
    db: AsyncSession = Depends(get_db_session),
    current_user: dict = Depends(require_permission("system:read"))
):
    """获取系统健康状态"""
    try:
        # 这里应该从实际的系统监控服务获取真实数据
        import psutil
        import time

        # 获取真实的系统指标
        cpu_percent = psutil.cpu_percent(interval=1)
        memory = psutil.virtual_memory()
        disk = psutil.disk_usage('/')

        # 获取系统运行时间
        try:
            boot_time = psutil.boot_time()  # 系统启动时间戳
            uptime_seconds = time.time() - boot_time  # 运行秒数
            days = int(uptime_seconds // 86400)
            hours = int((uptime_seconds % 86400) // 3600)
            uptime_str = f"{days}天 {hours}小时"
        except Exception as e:
            logger.warning("获取系统运行时间失败", error=str(e))
            uptime_str = "未知"

        # 检查数据库连接
        database_status = "connected"
        try:
            await db.execute(text("SELECT 1"))
        except Exception as e:
            logger.warning("数据库连接检查失败", error=str(e))
            database_status = "disconnected"

        # 检查Redis连接
        redis_status = "not_configured"
        if settings.REDIS_URL:
            try:
                redis_healthy = await redis_manager.ping()
                redis_status = "connected" if redis_healthy else "disconnected"
            except Exception as e:
                logger.warning("Redis连接检查失败", error=str(e))
                redis_status = "disconnected"

        # 检查InfluxDB连接
        influxdb_status = "not_configured"
        if settings.INFLUXDB_URL:
            try:
                health_result = await influxdb_client.health()
                influxdb_status = health_result.get('status', 'unknown')
            except Exception as e:
                logger.warning("InfluxDB连接检查失败", error=str(e))
                influxdb_status = "disconnected"

        # 网络状态基于数据库连接状态判断
        network_status = "normal" if database_status == "connected" else "degraded"

        health_data = {
            "overall_status": "healthy" if cpu_percent < 80 and memory.percent < 85 and database_status == "connected" else "warning",
            "uptime": uptime_str,
            "cpu_usage": f"{cpu_percent:.1f}%",
            "memory_usage": f"{memory.percent:.1f}%",
            "disk_usage": f"{disk.percent:.1f}%",
            "network_status": network_status,
            "database_status": database_status,
            "redis_status": redis_status,
            "influxdb_status": influxdb_status
        }

        return {
            "success": True,
            "data": health_data
        }

    except Exception as e:
        logger.error("获取系统健康状态失败", error=str(e))
        # 如果获取真实数据失败，返回基础状态而不是模拟数据
        return {
            "success": True,
            "data": {
                "overall_status": "unknown",
                "uptime": "未知",
                "cpu_usage": "未知",
                "memory_usage": "未知",
                "disk_usage": "未知",
                "network_status": "unknown",
                "database_status": "unknown",
                "redis_status": "unknown",
                "influxdb_status": "unknown"
            }
        }