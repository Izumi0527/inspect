"""
监控设置API路由 - 完整实现
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from datetime import datetime
from src.schemas.settings.monitoring import CurrentMonitoringResponse, MetricHistory
from src.core.permissions import require_permission
import structlog

logger = structlog.get_logger()

router = APIRouter(prefix="/monitoring", tags=["System Monitoring"])


def _get_monitoring_service():
    from src.services.settings.monitoring_service import monitoring_service
    return monitoring_service


@router.get("/current", response_model=CurrentMonitoringResponse)
async def get_current_metrics(
    current_user: dict = Depends(require_permission("settings:monitoring:read"))
):
    """获取当前系统监控指标"""
    try:
        metrics, services, system_info = await _get_monitoring_service().get_current_metrics()
        return CurrentMonitoringResponse(
            metrics=metrics, services=services, system=system_info, timestamp=datetime.now()
        )
    except Exception as e:
        logger.error("Failed to get current metrics", error=str(e))
        raise HTTPException(status_code=500, detail=f"获取监控数据失败: {str(e)}")


@router.get("/history", response_model=MetricHistory)
async def get_metric_history(
    hours: int = Query(24, ge=1, le=168, description="获取多少小时的历史数据"),
    current_user: dict = Depends(require_permission("settings:monitoring:read"))
):
    """获取历史监控数据"""
    try:
        history = await _get_monitoring_service().get_metric_history(hours)
        return history
    except Exception as e:
        logger.error("Failed to get metric history", error=str(e), hours=hours)
        raise HTTPException(status_code=500, detail=f"获取历史监控数据失败: {str(e)}")

__all__ = ["router"]
