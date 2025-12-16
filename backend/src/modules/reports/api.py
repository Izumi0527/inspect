"""
报表分析模块 - API路由

提供报表生成、统计分析、数据导出等API端点
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import FileResponse
from typing import Optional, List
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from src.core.permissions import require_permission
from src.core.database import get_db_session
from src.modules.reports.schemas import (
    ReportGenerateRequest, ReportResponse, ReportType, ExportFormat,
    StatisticsRequest, DeviceStatisticsResponse, AlertStatisticsResponse,
    InspectionStatisticsResponse, ScheduledReportCreate, ScheduledReportResponse
)

# 延迟导入
def get_report_generator():
    from src.services.report import report_generator
    return report_generator

def get_statistics_service():
    from src.services.report import statistics_service
    return statistics_service

logger = structlog.get_logger()
router = APIRouter()


# ============= 报表生成 =============

@router.post("/generate", response_model=ReportResponse, summary="生成报表")
async def generate_report(
    request: ReportGenerateRequest,
    current_user: dict = Depends(require_permission("reports:create")),
    session: AsyncSession = Depends(get_db_session)
):
    """生成新的报表"""
    generator = get_report_generator()
    
    report = await generator.create_report(
        name=request.name,
        report_type=request.report_type.value,
        start_time=request.start_time,
        end_time=request.end_time,
        device_ids=request.device_ids,
        include_charts=request.include_charts,
        include_details=request.include_details,
        custom_config=request.custom_config,
        created_by=current_user["id"],
        session=session
    )
    
    logger.info("Report generation started", report_id=report.id, created_by=current_user["id"])
    return ReportResponse(**report.__dict__)


@router.get("/", response_model=List[ReportResponse], summary="获取报表列表")
async def get_reports(
    report_type: Optional[ReportType] = Query(None, description="报表类型"),
    status: Optional[str] = Query(None, description="状态"),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(require_permission("reports:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """获取报表列表"""
    generator = get_report_generator()
    
    reports = await generator.get_reports(
        report_type=report_type.value if report_type else None,
        status=status,
        skip=skip,
        limit=limit,
        session=session
    )
    
    return [ReportResponse(**r.__dict__) for r in reports]


@router.get("/{report_id}", response_model=ReportResponse, summary="获取报表详情")
async def get_report(
    report_id: int,
    current_user: dict = Depends(require_permission("reports:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """获取指定报表详情"""
    generator = get_report_generator()
    
    report = await generator.get_report_by_id(report_id, session)
    if not report:
        raise HTTPException(status_code=404, detail="报表不存在")
    
    return ReportResponse(**report.__dict__)


@router.get("/{report_id}/download", summary="下载报表")
async def download_report(
    report_id: int,
    format: ExportFormat = Query(ExportFormat.PDF, description="导出格式"),
    current_user: dict = Depends(require_permission("reports:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """下载报表文件"""
    generator = get_report_generator()
    
    report = await generator.get_report_by_id(report_id, session)
    if not report:
        raise HTTPException(status_code=404, detail="报表不存在")
    
    if report.status != "completed":
        raise HTTPException(status_code=400, detail="报表尚未生成完成")
    
    if not report.file_path:
        raise HTTPException(status_code=404, detail="报表文件不存在")
    
    return FileResponse(
        path=report.file_path,
        filename=f"{report.name}.{format.value}",
        media_type="application/octet-stream"
    )


@router.delete("/{report_id}", summary="删除报表")
async def delete_report(
    report_id: int,
    current_user: dict = Depends(require_permission("reports:delete")),
    session: AsyncSession = Depends(get_db_session)
):
    """删除报表"""
    generator = get_report_generator()
    
    success = await generator.delete_report(report_id, session)
    if not success:
        raise HTTPException(status_code=404, detail="报表不存在")
    
    logger.info("Report deleted", report_id=report_id, deleted_by=current_user["id"])
    return {"message": "报表已删除"}


# ============= 统计分析 =============

@router.get("/statistics/devices", response_model=DeviceStatisticsResponse, summary="获取设备统计")
async def get_device_statistics(
    start_time: Optional[datetime] = Query(None),
    end_time: Optional[datetime] = Query(None),
    group_by: str = Query("day", description="分组方式"),
    current_user: dict = Depends(require_permission("reports:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """获取设备统计数据"""
    if not end_time:
        end_time = datetime.now()
    if not start_time:
        start_time = end_time - timedelta(days=7)
    
    statistics_service = get_statistics_service()
    stats = await statistics_service.get_device_statistics(
        start_time=start_time,
        end_time=end_time,
        group_by=group_by,
        session=session
    )
    
    return DeviceStatisticsResponse(**stats)


@router.get("/statistics/alerts", response_model=AlertStatisticsResponse, summary="获取告警统计")
async def get_alert_statistics(
    start_time: Optional[datetime] = Query(None),
    end_time: Optional[datetime] = Query(None),
    group_by: str = Query("day", description="分组方式"),
    current_user: dict = Depends(require_permission("reports:read"))
):
    """获取告警统计数据"""
    if not end_time:
        end_time = datetime.now()
    if not start_time:
        start_time = end_time - timedelta(days=7)
    
    statistics_service = get_statistics_service()
    stats = await statistics_service.get_alert_statistics(
        start_time=start_time,
        end_time=end_time,
        group_by=group_by
    )
    
    return AlertStatisticsResponse(**stats)


@router.get("/statistics/inspections", response_model=InspectionStatisticsResponse, summary="获取巡检统计")
async def get_inspection_statistics(
    start_time: Optional[datetime] = Query(None),
    end_time: Optional[datetime] = Query(None),
    group_by: str = Query("day", description="分组方式"),
    current_user: dict = Depends(require_permission("reports:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """获取巡检统计数据"""
    if not end_time:
        end_time = datetime.now()
    if not start_time:
        start_time = end_time - timedelta(days=7)
    
    statistics_service = get_statistics_service()
    stats = await statistics_service.get_inspection_statistics(
        start_time=start_time,
        end_time=end_time,
        group_by=group_by,
        session=session
    )
    
    return InspectionStatisticsResponse(**stats)


# ============= 定时报表 =============

@router.get("/scheduled", response_model=List[ScheduledReportResponse], summary="获取定时报表列表")
async def get_scheduled_reports(
    enabled: Optional[bool] = Query(None),
    current_user: dict = Depends(require_permission("reports:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """获取定时报表列表"""
    generator = get_report_generator()
    reports = await generator.get_scheduled_reports(enabled=enabled, session=session)
    return [ScheduledReportResponse(**r.__dict__) for r in reports]


@router.post("/scheduled", response_model=ScheduledReportResponse, summary="创建定时报表")
async def create_scheduled_report(
    request: ScheduledReportCreate,
    current_user: dict = Depends(require_permission("reports:create")),
    session: AsyncSession = Depends(get_db_session)
):
    """创建定时报表"""
    generator = get_report_generator()
    
    report = await generator.create_scheduled_report(
        request.model_dump(),
        created_by=current_user["id"],
        session=session
    )
    
    logger.info("Scheduled report created", report_id=report.id, created_by=current_user["id"])
    return ScheduledReportResponse(**report.__dict__)


@router.delete("/scheduled/{report_id}", summary="删除定时报表")
async def delete_scheduled_report(
    report_id: int,
    current_user: dict = Depends(require_permission("reports:delete")),
    session: AsyncSession = Depends(get_db_session)
):
    """删除定时报表"""
    generator = get_report_generator()
    
    success = await generator.delete_scheduled_report(report_id, session)
    if not success:
        raise HTTPException(status_code=404, detail="定时报表不存在")
    
    logger.info("Scheduled report deleted", report_id=report_id, deleted_by=current_user["id"])
    return {"message": "定时报表已删除"}
