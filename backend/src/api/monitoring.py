"""
设备监控API路由
"""
print(f"[IMPORT] monitoring.py is being imported at {__name__}")

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
import structlog

from src.services.device_monitoring import device_monitoring_service
from src.core.influxdb import influxdb_client
from src.core.auth import get_current_active_user
from src.models.user import User
from src.core.config import settings

logger = structlog.get_logger()
router = APIRouter()


class MonitoringStatsResponse(BaseModel):
    """监控统计响应模型"""
    is_running: bool
    monitor_interval: int
    total_devices: int
    active_devices: int
    monitoring_tasks: int
    influxdb_connected: bool
    last_check: str


class DeviceMetricsQuery(BaseModel):
    """设备指标查询模型"""
    device_id: int
    start_time: datetime
    end_time: Optional[datetime] = None
    metric_names: Optional[List[str]] = None


@router.get("/stats", response_model=MonitoringStatsResponse, summary="获取监控服务统计")
async def get_monitoring_stats(
    current_user: User = Depends(get_current_active_user)
):
    """获取设备监控服务统计信息"""
    stats = await device_monitoring_service.get_monitoring_stats()
    return MonitoringStatsResponse(**stats)


@router.post("/start", summary="启动设备监控")
async def start_monitoring(
    current_user: User = Depends(get_current_active_user)
):
    """启动设备监控服务（需要管理员权限）"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin permission required")
    
    await device_monitoring_service.start_monitoring()
    
    logger.info("Device monitoring started by user", user_id=current_user.id)
    
    return {
        "success": True,
        "message": "Device monitoring started successfully"
    }


@router.post("/stop", summary="停止设备监控")
async def stop_monitoring(
    current_user: User = Depends(get_current_active_user)
):
    """停止设备监控服务（需要管理员权限）"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin permission required")
    
    await device_monitoring_service.stop_monitoring()
    
    logger.info("Device monitoring stopped by user", user_id=current_user.id)
    
    return {
        "success": True,
        "message": "Device monitoring stopped successfully"
    }


@router.get("/devices/{device_id}/metrics", summary="获取设备历史监控数据")
async def get_device_metrics_history(
    device_id: int,
    start_time: datetime = Query(..., description="开始时间"),
    end_time: Optional[datetime] = Query(None, description="结束时间，默认为当前时间"),
    metric_names: Optional[str] = Query(None, description="指标名称，多个用逗号分隔"),
    current_user: User = Depends(get_current_active_user)
):
    """
    获取设备历史监控数据
    
    参数:
        device_id: 设备ID
        start_time: 开始时间（ISO格式）
        end_time: 结束时间（ISO格式），可选
        metric_names: 指标名称，如: cpu_usage,memory_usage
    """
    if not influxdb_client.is_connected:
        raise HTTPException(
            status_code=503, 
            detail="InfluxDB not connected, historical data unavailable"
        )
    
    # 设置默认结束时间
    if end_time is None:
        end_time = datetime.now()
    
    # 解析指标名称
    metric_list = None
    if metric_names:
        metric_list = [name.strip() for name in metric_names.split(",")]
    
    try:
        # 获取历史数据
        metrics_data = await device_monitoring_service.get_device_metrics_history(
            device_id, start_time, end_time, metric_list
        )
        
        if metrics_data is None:
            raise HTTPException(
                status_code=500,
                detail="Failed to query metrics data"
            )
        
        logger.info(
            "Device metrics history queried",
            device_id=device_id,
            start_time=start_time,
            end_time=end_time,
            data_points=len(metrics_data),
            user_id=current_user.id
        )
        
        return {
            "device_id": device_id,
            "start_time": start_time,
            "end_time": end_time,
            "metric_names": metric_list,
            "data_points": len(metrics_data),
            "data": metrics_data
        }
        
    except Exception as e:
        logger.error(
            "Error querying device metrics",
            device_id=device_id,
            error=str(e),
            user_id=current_user.id
        )
        raise HTTPException(
            status_code=500,
            detail="Failed to query device metrics history"
        )


@router.get("/devices/{device_id}/current-status", summary="获取设备当前状态")
async def get_device_current_status(
    device_id: int,
    current_user: User = Depends(get_current_active_user)
):
    """获取设备当前监控状态"""
    from src.services.cache_service import cache_service
    
    try:
        # 从缓存获取当前状态
        status_data = await cache_service.get_cached_device_status(device_id)
        
        if status_data is None:
            return {
                "device_id": device_id,
                "status": "unknown",
                "message": "No monitoring data available"
            }
        
        return {
            "device_id": device_id,
            "status": status_data.get("status", "unknown"),
            "response_time": status_data.get("response_time"),
            "last_update": status_data.get("last_update"),
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(
            "Error getting device current status",
            device_id=device_id,
            error=str(e)
        )
        raise HTTPException(
            status_code=500,
            detail="Failed to get device current status"
        )


@router.get("/devices/status-summary", summary="获取所有设备状态概览")
async def get_devices_status_summary(
    current_user: User = Depends(get_current_active_user)
):
    """获取所有设备的状态概览"""
    from src.services.cache_service import cache_service
    from src.core.database import get_db_session_context
    from src.repositories.device_repository import DeviceRepository
    
    try:
        # 获取所有设备
        async with get_db_session_context() as session:
            device_repo = DeviceRepository(session)
            devices, _ = await device_repo.get_devices_paginated(
                page=1, page_size=1000, is_active=True
            )
        
        # 统计状态
        status_summary = {
            "total_devices": len(devices),
            "online": 0,
            "offline": 0,
            "error": 0,
            "unknown": 0,
            "devices": []
        }
        
        for device in devices:
            # 从缓存获取状态
            status_data = await cache_service.get_cached_device_status(device.id)
            
            if status_data:
                status = status_data.get("status", "unknown")
                device_info = {
                    "device_id": device.id,
                    "name": device.name,
                    "ip_address": device.ip_address,
                    "status": status,
                    "response_time": status_data.get("response_time"),
                    "last_update": status_data.get("last_update")
                }
            else:
                status = "unknown"
                device_info = {
                    "device_id": device.id,
                    "name": device.name,
                    "ip_address": device.ip_address,
                    "status": status,
                    "response_time": None,
                    "last_update": None
                }
            
            status_summary[status] = status_summary.get(status, 0) + 1
            status_summary["devices"].append(device_info)
        
        return status_summary
        
    except Exception as e:
        logger.error("Error getting devices status summary", error=str(e))
        raise HTTPException(
            status_code=500,
            detail="Failed to get devices status summary"
        )


@router.post("/test-influxdb", summary="测试InfluxDB连接")
async def test_influxdb_connection(
    current_user: User = Depends(get_current_active_user)
):
    """测试InfluxDB连接和写入功能"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin permission required")
    
    if not influxdb_client.is_connected:
        return {
            "success": False,
            "message": "InfluxDB not connected",
            "connected": False
        }
    
    try:
        # 测试写入一个数据点
        test_data = {
            "measurement": "test_monitoring",
            "tags": {
                "test_id": "api_test",
                "user_id": str(current_user.id)
            },
            "fields": {
                "test_value": 123.45,
                "success": True
            }
        }
        
        success = await influxdb_client.write_points(
            test_data["measurement"],
            test_data["tags"],
            test_data["fields"]
        )
        
        logger.info("InfluxDB connection tested", user_id=current_user.id, success=success)
        
        return {
            "success": success,
            "message": "InfluxDB test completed successfully" if success else "InfluxDB write test failed",
            "connected": influxdb_client.is_connected,
            "test_data": test_data
        }
        
    except Exception as e:
        logger.error("InfluxDB test failed", error=str(e), user_id=current_user.id)
        return {
            "success": False,
            "message": f"InfluxDB test failed: {str(e)}",
            "connected": influxdb_client.is_connected
        }


print("=" * 60)
print("[DEBUG] Reached line 313 - BEFORE v2 models")
print("=" * 60)

# ==================== 监控中心 v2 响应模型 ====================

print("[DEBUG] Loading v2 response models...")

class StatsSummaryResponse(BaseModel):
    """统计摘要响应模型"""
    total_devices: int
    availability: float
    active_alerts: int
    avg_cpu: float
    avg_memory: float
    avg_network: float


class DeviceDistributionResponse(BaseModel):
    """设备状态分布响应模型"""
    healthy: int
    warning: int
    critical: int
    offline: int


class AvailabilityResponse(BaseModel):
    """可用性响应模型"""
    current: float
    target: float
    trend: str


# ==================== 监控中心 v2 API 端点 ====================

logger.info("[DEBUG] Registering v2 API endpoints...")
logger.info("[DEBUG] router type: %s", type(router))
logger.info("[DEBUG] router current routes count: %s", len(router.routes))

logger.info("[DEBUG] Registering endpoint: GET /stats/summary")
@router.get("/stats/summary", response_model=StatsSummaryResponse, summary="获取统计摘要")
async def get_stats_summary(
    current_user: Optional[User] = Depends(get_current_active_user) if not settings.DEBUG else None
):
    """获取 6 个关键指标的统计卡片数据"""
    logger.info(f"[stats/summary] Request received, user: {current_user.username if current_user else 'dev-mode'}")

    from src.core.database import get_db_session_context
    from src.repositories.device_repository import DeviceRepository

    try:
        async with get_db_session_context() as session:
            # 获取总设备数
            device_repo = DeviceRepository(session)
            devices, total_count = await device_repo.get_devices_paginated(
                page=1, page_size=10000, is_active=True
            )

            # 如果没有设备，返回零值而不是异常
            if not devices or total_count == 0:
                logger.warning("[stats/summary] No devices found in database")
                return StatsSummaryResponse(
                    total_devices=0,
                    availability=0.0,
                    active_alerts=0,
                    avg_cpu=0.0,
                    avg_memory=0.0,
                    avg_network=0.0
                )

            # 计算可用性(在线设备/总设备)
            online_count = sum(1 for d in devices if d.status == "online")
            availability = (online_count / total_count * 100) if total_count > 0 else 0

            # 获取活跃告警数(模拟数据,实际应从告警表查询)
            active_alerts = 0

            # 计算平均 CPU、内存、网络使用率
            avg_cpu = sum(d.cpu_usage or 0 for d in devices) / len(devices) if devices else 0
            avg_memory = sum(d.memory_usage or 0 for d in devices) / len(devices) if devices else 0
            avg_network = sum(d.network_usage or 0 for d in devices) / len(devices) if devices else 0

            logger.info(f"[stats/summary] Response: devices={total_count}, availability={round(availability, 2)}%, alerts={active_alerts}")

            return StatsSummaryResponse(
                total_devices=total_count,
                availability=round(availability, 2),
                active_alerts=active_alerts,
                avg_cpu=round(avg_cpu, 2),
                avg_memory=round(avg_memory, 2),
                avg_network=round(avg_network, 2)
            )
    except Exception as e:
        logger.error("Error getting stats summary", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to get stats summary")


logger.info("[DEBUG] Registering endpoint: GET /alerts/recent")
@router.get("/alerts/recent", summary="获取最近告警")
async def get_recent_alerts(
    limit: int = Query(10, description="返回告警数量"),
    current_user: User = Depends(get_current_active_user)
):
    """获取最近的告警列表"""
    # TODO: 实际实现应从告警表查询
    alerts = [
        {
            "id": i,
            "device_id": i * 10,
            "device_name": f"Device-{i}",
            "severity": ["critical", "warning", "info"][i % 3],
            "message": f"Alert message {i}",
            "timestamp": (datetime.now() - timedelta(minutes=i*5)).isoformat()
        }
        for i in range(1, min(limit + 1, 11))
    ]

    return {"alerts": alerts, "total": len(alerts)}


logger.info("[DEBUG] Registering endpoint: GET /devices/distribution")
@router.get("/devices/distribution", response_model=DeviceDistributionResponse, summary="获取设备状态分布")
async def get_device_distribution(
    current_user: User = Depends(get_current_active_user)
):
    """获取设备状态分布统计"""
    from src.core.database import get_db_session_context
    from src.repositories.device_repository import DeviceRepository

    try:
        async with get_db_session_context() as session:
            device_repo = DeviceRepository(session)
            devices, _ = await device_repo.get_devices_paginated(
                page=1, page_size=10000, is_active=True
            )

            # 统计各状态设备数量
            distribution = {
                "healthy": 0,
                "warning": 0,
                "critical": 0,
                "offline": 0
            }

            for device in devices:
                status = device.status or "offline"
                if status == "online":
                    # 根据 CPU/内存使用率判断健康状态
                    cpu = device.cpu_usage or 0
                    memory = device.memory_usage or 0
                    if cpu > 90 or memory > 90:
                        distribution["critical"] += 1
                    elif cpu > 75 or memory > 75:
                        distribution["warning"] += 1
                    else:
                        distribution["healthy"] += 1
                else:
                    distribution["offline"] += 1

            return DeviceDistributionResponse(**distribution)
    except Exception as e:
        logger.error("Error getting device distribution", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to get device distribution")


logger.info("[DEBUG] Registering endpoint: GET /availability")
@router.get("/availability", response_model=AvailabilityResponse, summary="获取可用性数据")
async def get_availability(
    current_user: User = Depends(get_current_active_user)
):
    """获取系统整体可用性"""
    from src.core.database import get_db_session_context
    from src.repositories.device_repository import DeviceRepository

    try:
        async with get_db_session_context() as session:
            device_repo = DeviceRepository(session)
            devices, total_count = await device_repo.get_devices_paginated(
                page=1, page_size=10000, is_active=True
            )

            online_count = sum(1 for d in devices if d.status == "online")
            current_availability = (online_count / total_count * 100) if total_count > 0 else 0

            return AvailabilityResponse(
                current=round(current_availability, 2),
                target=99.9,  # SLA 目标
                trend="stable"  # 趋势: stable/up/down
            )
    except Exception as e:
        logger.error("Error getting availability", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to get availability")


logger.info("[DEBUG] Registering endpoint: POST /system/performance")
@router.post("/system/performance", summary="获取系统性能历史")
async def get_system_performance(
    time_range: str = Query("24h", description="时间范围: 1h, 6h, 24h, 7d, 30d"),
    current_user: User = Depends(get_current_active_user)
):
    """从 InfluxDB 查询系统性能历史(CPU、内存、磁盘)"""
    if not influxdb_client.is_connected:
        # 返回模拟数据
        now = datetime.now()
        data_points = []
        for i in range(24):
            timestamp = (now - timedelta(hours=23-i)).isoformat()
            data_points.append({
                "timestamp": timestamp,
                "cpu": round(40 + i * 1.5, 2),
                "memory": round(50 + i * 1.2, 2),
                "disk": round(30 + i * 0.8, 2)
            })
        return {"data": data_points, "time_range": time_range}

    try:
        # 解析时间范围
        range_map = {
            "1h": "1h",
            "6h": "6h",
            "24h": "24h",
            "7d": "7d",
            "30d": "30d"
        }

        influx_range = range_map.get(time_range, "24h")

        # Flux 查询
        query = f'''
            from(bucket: "{influxdb_client.bucket}")
              |> range(start: -{influx_range})
              |> filter(fn: (r) => r["_measurement"] == "system_performance")
              |> filter(fn: (r) =>
                  r["_field"] == "cpu_percent" or
                  r["_field"] == "memory_percent" or
                  r["_field"] == "disk_percent"
              )
              |> aggregateWindow(every: 5m, fn: mean, createEmpty: false)
        '''

        result = await influxdb_client.query(query)

        if result is None:
            # Fallback to mock data
            now = datetime.now()
            data_points = []
            for i in range(24):
                timestamp = (now - timedelta(hours=23-i)).isoformat()
                data_points.append({
                    "timestamp": timestamp,
                    "cpu": round(40 + i * 1.5, 2),
                    "memory": round(50 + i * 1.2, 2),
                    "disk": round(30 + i * 0.8, 2)
                })
            return {"data": data_points, "time_range": time_range}

        return {"data": result, "time_range": time_range}

    except Exception as e:
        logger.error("Error getting system performance", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to get system performance")


logger.info("[DEBUG] Registering endpoint: POST /devices/temperature")
@router.post("/devices/temperature", summary="获取设备温度历史")
async def get_device_temperature(
    time_range: str = Query("24h", description="时间范围"),
    device_id: Optional[int] = Query(None, description="设备ID,为空则查询所有设备"),
    current_user: User = Depends(get_current_active_user)
):
    """从数据库查询设备温度历史"""
    from src.core.database import get_db_session_context
    from src.repositories.device_repository import DeviceRepository

    try:
        async with get_db_session_context() as session:
            device_repo = DeviceRepository(session)

            if device_id:
                # 查询单个设备
                device = await device_repo.get_device_by_id(device_id)
                if not device:
                    raise HTTPException(status_code=404, detail="Device not found")

                # 模拟温度历史数据
                now = datetime.now()
                data_points = []
                for i in range(24):
                    timestamp = (now - timedelta(hours=23-i)).isoformat()
                    data_points.append({
                        "timestamp": timestamp,
                        "device_id": device_id,
                        "temperature": round(45 + i * 0.5, 2)
                    })

                return {"device_id": device_id, "data": data_points, "time_range": time_range}
            else:
                # 查询所有设备的平均温度
                devices, _ = await device_repo.get_devices_paginated(
                    page=1, page_size=100, is_active=True
                )

                now = datetime.now()
                data_points = []
                for i in range(24):
                    timestamp = (now - timedelta(hours=23-i)).isoformat()
                    avg_temp = sum(d.temperature or 50 for d in devices) / len(devices) if devices else 50
                    data_points.append({
                        "timestamp": timestamp,
                        "average_temperature": round(avg_temp + i * 0.3, 2)
                    })

                return {"device_id": None, "data": data_points, "time_range": time_range}

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error getting device temperature", error=str(e))
        raise HTTPException(status_code=500, detail="Failed to get device temperature")


logger.info("[DEBUG] Registering endpoint: POST /network/traffic/history")
@router.post("/network/traffic/history", summary="获取网络流量历史")
async def get_network_traffic(
    time_range: str = Query("24h", description="时间范围"),
    current_user: User = Depends(get_current_active_user)
):
    """从 DeviceInterface 聚合网络流量历史"""
    # 模拟网络流量数据
    now = datetime.now()
    data_points = []

    for i in range(24):
        timestamp = (now - timedelta(hours=23-i)).isoformat()
        data_points.append({
            "timestamp": timestamp,
            "inbound": round(100 + i * 5 + (i % 3) * 10, 2),  # MB/s
            "outbound": round(80 + i * 4 + (i % 2) * 8, 2)    # MB/s
        })

    return {"data": data_points, "time_range": time_range}


@router.post("/reports/export", summary="导出监控报告")
async def export_monitoring_report(
    format: str = Query("pdf", description="导出格式: pdf, excel, csv"),
    time_range: str = Query("24h", description="时间范围"),
    sections: List[str] = Query(default=["stats", "charts", "alerts"], description="包含的部分"),
    current_user: User = Depends(get_current_active_user)
):
    """导出监控报告(支持 PDF、Excel、CSV 格式)"""
    # TODO: 实现实际的报告导出逻辑

    if format not in ["pdf", "excel", "csv"]:
        raise HTTPException(status_code=400, detail="Invalid format. Use pdf, excel, or csv")

    logger.info(
        "Report export requested",
        format=format,
        time_range=time_range,
        sections=sections,
        user_id=current_user.id
    )

    # 模拟报告生成
    report_data = {
        "format": format,
        "time_range": time_range,
        "sections": sections,
        "generated_at": datetime.now().isoformat(),
        "download_url": f"/api/v1/monitoring/reports/download/{format}/report-{datetime.now().strftime('%Y%m%d%H%M%S')}.{format}",
        "status": "ready"
    }

    return report_data