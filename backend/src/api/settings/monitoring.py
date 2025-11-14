"""
Monitoring API Router
系统监控API路由
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from datetime import datetime
from src.schemas.settings.monitoring import (
    CurrentMonitoringResponse,
    MetricHistory
)
from src.services.settings.monitoring_service import monitoring_service
from src.core.permissions import require_permission
import structlog

logger = structlog.get_logger()

router = APIRouter(prefix="/monitoring", tags=["System Monitoring"])


@router.get("/current", response_model=CurrentMonitoringResponse)
async def get_current_metrics(
    current_user: dict = Depends(require_permission("settings:monitoring:read"))
):
    """
    获取当前系统监控指标

    实时返回系统资源使用情况，包括:
    - **CPU**: 使用率、核心数、温度（如果支持）
    - **内存**: 总量、已用、空闲、使用率
    - **磁盘**: 总量、已用、空闲、使用率
    - **网络**: 发送/接收字节数和包数
    - **服务状态**: 各个服务的健康状态和响应时间
    - **系统信息**: 主机名、操作系统、运行时间

    **注意**: 此接口会被前端每5秒自动调用一次进行实时监控

    权限要求: settings:monitoring:read
    """
    try:
        metrics, services, system_info = await monitoring_service.get_current_metrics()

        response = CurrentMonitoringResponse(
            metrics=metrics,
            services=services,
            system=system_info,
            timestamp=datetime.now()
        )

        logger.debug(
            "Current metrics retrieved",
            cpu=metrics.cpu.usage,
            memory=metrics.memory.usage,
            user_id=current_user["id"]
        )

        return response

    except Exception as e:
        logger.error("Failed to get current metrics", error=str(e), user_id=current_user["id"])
        raise HTTPException(status_code=500, detail=f"获取监控数据失败: {str(e)}")


@router.get("/history", response_model=MetricHistory)
async def get_metric_history(
    hours: int = Query(24, ge=1, le=168, description="获取多少小时的历史数据（1-168小时）"),
    current_user: dict = Depends(require_permission("settings:monitoring:read"))
):
    """
    获取历史监控数据

    返回指定时间范围内的系统指标历史数据，用于绘制趋势图表。

    参数:
    - **hours**: 历史数据时长（小时），范围1-168（7天）

    返回数据包括:
    - CPU使用率历史
    - 内存使用率历史
    - 磁盘使用率历史
    - 网络IO历史

    权限要求: settings:monitoring:read
    """
    try:
        history = await monitoring_service.get_metric_history(hours)

        logger.info(
            "Metric history retrieved",
            hours=hours,
            user_id=current_user["id"]
        )

        return history

    except Exception as e:
        logger.error("Failed to get metric history", error=str(e), hours=hours, user_id=current_user["id"])
        raise HTTPException(status_code=500, detail=f"获取历史监控数据失败: {str(e)}")
