"""
流量分析模块 - API路由

提供网络流量监控、带宽分析、流量趋势等API端点
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, List
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from src.core.permissions import require_permission
from src.core.database import get_db_session
from src.modules.traffic.schemas import (
    DeviceTrafficResponse, InterfaceTrafficResponse,
    TrafficTrendResponse, TopTalkersResponse,
    BandwidthUtilizationResponse, TrafficSummaryResponse
)

# 延迟导入
def get_traffic_service():
    from src.services.monitoring import traffic_analyzer
    return traffic_analyzer

def get_device_repository():
    from src.repositories.device_repository import DeviceRepository
    return DeviceRepository

logger = structlog.get_logger()
router = APIRouter()


@router.get("/summary", response_model=TrafficSummaryResponse, summary="获取流量摘要")
async def get_traffic_summary(
    current_user: dict = Depends(require_permission("traffic:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """获取网络流量摘要"""
    traffic_service = get_traffic_service()
    summary = await traffic_service.get_traffic_summary(session)
    return TrafficSummaryResponse(**summary)


@router.get("/devices/{device_id}", response_model=DeviceTrafficResponse, summary="获取设备流量")
async def get_device_traffic(
    device_id: int,
    current_user: dict = Depends(require_permission("traffic:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """获取指定设备的流量数据"""
    DeviceRepository = get_device_repository()
    device_repo = DeviceRepository(session)
    
    device = await device_repo.get_device_by_id(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="设备不存在")
    
    traffic_service = get_traffic_service()
    traffic_data = await traffic_service.get_device_traffic(device_id, session)
    
    return DeviceTrafficResponse(
        device_id=device_id,
        device_name=device.name,
        ip_address=device.ip_address,
        total_in_rate=traffic_data.get("total_in_rate", 0),
        total_out_rate=traffic_data.get("total_out_rate", 0),
        interfaces=[
            InterfaceTrafficResponse(**iface)
            for iface in traffic_data.get("interfaces", [])
        ],
        timestamp=datetime.now()
    )


@router.get("/devices/{device_id}/trend", response_model=TrafficTrendResponse, summary="获取设备流量趋势")
async def get_device_traffic_trend(
    device_id: int,
    interface_index: Optional[str] = Query(None, description="接口索引"),
    start_time: Optional[datetime] = Query(None),
    end_time: Optional[datetime] = Query(None),
    interval: str = Query("5m", description="数据间隔: 1m, 5m, 1h"),
    current_user: dict = Depends(require_permission("traffic:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """获取设备流量趋势"""
    if not end_time:
        end_time = datetime.now()
    if not start_time:
        start_time = end_time - timedelta(hours=24)
    
    traffic_service = get_traffic_service()
    trend_data = await traffic_service.get_traffic_trend(
        device_id=device_id,
        interface_index=interface_index,
        start_time=start_time,
        end_time=end_time,
        interval=interval,
        session=session
    )
    
    return TrafficTrendResponse(
        device_id=device_id,
        interface_index=interface_index,
        start_time=start_time,
        end_time=end_time,
        interval=interval,
        data_points=trend_data
    )


@router.get("/top-talkers", response_model=List[TopTalkersResponse], summary="获取流量排行")
async def get_top_talkers(
    limit: int = Query(10, ge=1, le=50),
    sort_by: str = Query("total", description="排序方式: in, out, total"),
    current_user: dict = Depends(require_permission("traffic:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """获取流量排行榜"""
    traffic_service = get_traffic_service()
    top_talkers = await traffic_service.get_top_talkers(
        limit=limit,
        sort_by=sort_by,
        session=session
    )
    
    return [TopTalkersResponse(**t) for t in top_talkers]


@router.get("/bandwidth-utilization", response_model=List[BandwidthUtilizationResponse], summary="获取带宽利用率")
async def get_bandwidth_utilization(
    device_id: Optional[int] = Query(None, description="设备ID"),
    threshold: float = Query(0, ge=0, le=100, description="利用率阈值"),
    current_user: dict = Depends(require_permission("traffic:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """获取带宽利用率数据"""
    traffic_service = get_traffic_service()
    utilization_data = await traffic_service.get_bandwidth_utilization(
        device_id=device_id,
        threshold=threshold,
        session=session
    )
    
    return [BandwidthUtilizationResponse(**u) for u in utilization_data]


@router.get("/high-utilization", response_model=List[BandwidthUtilizationResponse], summary="获取高利用率接口")
async def get_high_utilization_interfaces(
    threshold: float = Query(80, ge=0, le=100, description="利用率阈值"),
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(require_permission("traffic:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """获取高利用率接口列表"""
    traffic_service = get_traffic_service()
    high_util = await traffic_service.get_high_utilization_interfaces(
        threshold=threshold,
        limit=limit,
        session=session
    )
    
    return [BandwidthUtilizationResponse(**u) for u in high_util]
