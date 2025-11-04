"""
设备监控API路由
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
import structlog

from src.services.device_monitoring import device_monitoring_service
from src.core.influxdb import influxdb_client
from src.core.auth import get_current_active_user
from src.models.user import User

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