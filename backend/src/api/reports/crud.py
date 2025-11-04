"""
报表通用CRUD API
提供报表的增删改查、下载、预览等功能
"""
from fastapi import APIRouter, HTTPException, Depends, Query, Response
from fastapi.responses import FileResponse
from sqlalchemy import select, and_, or_, func, desc
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List
from pathlib import Path
import structlog

from src.core.permissions import require_permission
from src.core.database import get_db_session
from src.models.report import Report, ReportStatus, ReportType, ReportFormat as DBReportFormat
from src.schemas.report import (
    ReportResponse,
    ReportListResponse,
    ReportQueryParams,
    ReportCreate,
    ReportUpdate,
    ApiResponse,
    convert_report_to_response,
    ReportFormat,
    ReportStatus as SchemaReportStatus,
    ReportType as SchemaReportType
)
from src.core.config import settings

logger = structlog.get_logger()
router = APIRouter()


@router.get("/",
            response_model=ApiResponse,
            summary="获取报表列表")
async def get_reports(
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
    report_type: Optional[str] = Query(None, description="报表类型筛选"),
    status: Optional[str] = Query(None, description="状态筛选"),
    report_format: Optional[str] = Query(None, description="格式筛选"),
    search: Optional[str] = Query(None, description="搜索关键词"),
    start_date: Optional[str] = Query(None, description="开始日期筛选"),
    end_date: Optional[str] = Query(None, description="结束日期筛选"),
    current_user: dict = Depends(require_permission("reports:read")),
    db: AsyncSession = Depends(get_db_session)
):
    """
    获取报表列表（分页）

    **筛选条件**：
    - type: inspection/trend/statistics/custom
    - status: generating/completed/failed/scheduled
    - format: pdf/excel/html/word
    - search: 在标题和描述中搜索
    - start_date, end_date: 报表生成日期范围

    **返回**：
    - items: 报表列表
    - total: 总数量
    - page: 当前页码
    - pageSize: 每页数量
    """
    try:
        logger.info("Fetching reports list",
                   page=page,
                   page_size=page_size,
                   report_type=report_type,
                   user=current_user["id"])

        # 构建查询条件
        conditions = []

        # 类型筛选
        if report_type:
            try:
                rt = ReportType[report_type.upper()]
                conditions.append(Report.report_type == rt)
            except KeyError:
                raise ValueError(f"无效的报表类型: {report_type}")

        # 状态筛选
        if status:
            try:
                report_status = ReportStatus[status.upper()]
                conditions.append(Report.status == report_status)
            except KeyError:
                raise ValueError(f"无效的状态: {status}")

        # 关键词搜索
        if search:
            search_pattern = f"%{search}%"
            conditions.append(
                or_(
                    Report.title.ilike(search_pattern),
                    Report.description.ilike(search_pattern)
                )
            )

        # 日期范围筛选
        if start_date:
            conditions.append(Report.created_at >= start_date)
        if end_date:
            conditions.append(Report.created_at <= end_date)

        # 只显示当前用户有权限查看的报表
        # TODO: 实现更细粒度的权限控制
        # conditions.append(
        #     or_(
        #         Report.generated_by == current_user["id"],
        #         Report.is_public == True
        #     )
        # )

        # 计数查询
        count_query = select(func.count()).select_from(Report)
        if conditions:
            count_query = count_query.where(and_(*conditions))

        count_result = await db.execute(count_query)
        total = count_result.scalar() or 0

        # 数据查询
        offset = (page - 1) * page_size
        data_query = (
            select(Report)
            .where(and_(*conditions) if conditions else True)
            .order_by(desc(Report.created_at))
            .offset(offset)
            .limit(page_size)
        )

        result = await db.execute(data_query)
        reports = result.scalars().all()

        # 转换为前端格式
        base_url = getattr(settings, "BASE_URL", "http://localhost:8000")
        items = [convert_report_to_response(report, base_url) for report in reports]

        logger.info("Reports list fetched",
                   total=total,
                   returned=len(items),
                   user=current_user["id"])

        return ApiResponse(
            code=200,
            message="获取成功",
            data={
                "items": items,
                "total": total,
                "page": page,
                "pageSize": page_size
            }
        )

    except ValueError as e:
        logger.warning("Invalid query parameters", error=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Failed to fetch reports list",
                    error=str(e),
                    error_type=type(e).__name__)
        raise HTTPException(
            status_code=500,
            detail=f"获取报表列表失败: {str(e)}"
        )


@router.get("/stats",
            response_model=ApiResponse,
            summary="获取报表统计数据")
async def get_report_stats(
    current_user: dict = Depends(require_permission("reports:read")),
    db: AsyncSession = Depends(get_db_session)
):
    """
    获取报表统计数据

    **返回统计指标**：
    - total_reports: 报表总数
    - generated_today: 今日生成数量
    - scheduled_reports: 定时报表数量
    - failed_reports: 失败报表数量
    - average_generation_time: 平均生成时间（秒）
    - most_used_format: 最常用格式
    - storage_used: 存储空间使用（字节）
    """
    try:
        from datetime import datetime, timezone, timedelta

        logger.info("Fetching report statistics", user=current_user["id"])

        # 1. 报表总数
        total_query = select(func.count()).select_from(Report)
        total_result = await db.execute(total_query)
        total_reports = total_result.scalar() or 0

        # 2. 今日生成数量（UTC时区）
        today_start = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        today_query = select(func.count()).select_from(Report).where(
            Report.created_at >= today_start
        )
        today_result = await db.execute(today_query)
        generated_today = today_result.scalar() or 0

        # 3. 定时报表数量
        scheduled_query = select(func.count()).select_from(Report).where(
            Report.schedule_id.isnot(None)
        )
        scheduled_result = await db.execute(scheduled_query)
        scheduled_reports = scheduled_result.scalar() or 0

        # 4. 失败报表数量
        failed_query = select(func.count()).select_from(Report).where(
            Report.status == ReportStatus.FAILED.value
        )
        failed_result = await db.execute(failed_query)
        failed_reports = failed_result.scalar() or 0

        # 5. 平均生成时间（只统计已完成的报表）
        avg_time_query = select(func.avg(Report.generation_time)).where(
            and_(
                Report.status == ReportStatus.COMPLETED.value,
                Report.generation_time.isnot(None)
            )
        )
        avg_time_result = await db.execute(avg_time_query)
        avg_generation_time = avg_time_result.scalar() or 0
        # 转换为整数（秒）
        avg_generation_time = int(avg_generation_time) if avg_generation_time else 0

        # 6. 最常用格式（统计file_formats字段）
        format_query = select(Report.file_formats).where(
            and_(
                Report.status == ReportStatus.COMPLETED.value,
                Report.file_formats.isnot(None)
            )
        )
        format_result = await db.execute(format_query)
        format_rows = format_result.scalars().all()

        # 统计各格式出现次数
        format_counter = {}
        for formats in format_rows:
            if isinstance(formats, list):
                for fmt in formats:
                    format_counter[fmt] = format_counter.get(fmt, 0) + 1

        # 找出最常用的格式
        most_used_format = "pdf"  # 默认值
        if format_counter:
            most_used_format = max(format_counter, key=format_counter.get)

        # 7. 存储空间使用（字节）
        size_query = select(Report.file_sizes).where(
            and_(
                Report.status == ReportStatus.COMPLETED.value,
                Report.file_sizes.isnot(None)
            )
        )
        size_result = await db.execute(size_query)
        size_rows = size_result.scalars().all()

        # 累加所有文件大小
        storage_used = 0
        for sizes in size_rows:
            if isinstance(sizes, dict):
                for size in sizes.values():
                    if isinstance(size, (int, float)):
                        storage_used += int(size)

        # 构造返回数据
        stats_data = {
            "total_reports": total_reports,
            "generated_today": generated_today,
            "scheduled_reports": scheduled_reports,
            "failed_reports": failed_reports,
            "average_generation_time": avg_generation_time,
            "most_used_format": most_used_format,
            "storage_used": storage_used
        }

        logger.info("Report statistics fetched successfully",
                   total_reports=total_reports,
                   generated_today=generated_today,
                   user=current_user["id"])

        return ApiResponse(
            code=200,
            message="获取统计数据成功",
            data=stats_data
        )

    except Exception as e:
        logger.error("Failed to fetch report statistics",
                    error=str(e),
                    error_type=type(e).__name__)
        raise HTTPException(
            status_code=500,
            detail=f"获取报表统计数据失败: {str(e)}"
        )


@router.get("/{report_id}",
            response_model=ApiResponse,
            summary="获取报表详情")
async def get_report(
    report_id: int,
    current_user: dict = Depends(require_permission("reports:read")),
    db: AsyncSession = Depends(get_db_session)
):
    """
    获取单个报表的详细信息

    **返回**：
    - 报表完整信息
    - 包含下载链接
    """
    try:
        logger.info("Fetching report detail",
                   report_id=report_id,
                   user=current_user["id"])

        # 查询报表
        query = select(Report).where(Report.id == report_id)
        result = await db.execute(query)
        report = result.scalar_one_or_none()

        if not report:
            raise HTTPException(status_code=404, detail="报表不存在")

        # 权限检查
        # TODO: 实现细粒度权限控制
        # if report.generated_by != current_user["id"] and not report.is_public:
        #     raise HTTPException(status_code=403, detail="无权访问此报表")

        # 转换为前端格式
        base_url = getattr(settings, "BASE_URL", "http://localhost:8000")
        report_data = convert_report_to_response(report, base_url)

        logger.info("Report detail fetched",
                   report_id=report_id,
                   user=current_user["id"])

        return ApiResponse(
            code=200,
            message="获取成功",
            data=report_data
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to fetch report detail",
                    report_id=report_id,
                    error=str(e),
                    error_type=type(e).__name__)
        raise HTTPException(
            status_code=500,
            detail=f"获取报表详情失败: {str(e)}"
        )


@router.delete("/{report_id}",
               response_model=ApiResponse,
               summary="删除报表")
async def delete_report(
    report_id: int,
    current_user: dict = Depends(require_permission("reports:delete")),
    db: AsyncSession = Depends(get_db_session)
):
    """
    删除报表

    **操作**：
    - 删除数据库记录
    - 删除关联的文件

    **权限**：
    - 需要reports:delete权限
    - 或者是报表创建者
    """
    try:
        logger.info("Deleting report",
                   report_id=report_id,
                   user=current_user["id"])

        # 查询报表
        query = select(Report).where(Report.id == report_id)
        result = await db.execute(query)
        report = result.scalar_one_or_none()

        if not report:
            raise HTTPException(status_code=404, detail="报表不存在")

        # 权限检查
        # TODO: 实现细粒度权限控制
        # if report.generated_by != current_user["id"]:
        #     raise HTTPException(status_code=403, detail="无权删除此报表")

        # 删除关联文件
        if report.file_paths and isinstance(report.file_paths, dict):
            for file_path in report.file_paths.values():
                try:
                    path = Path(file_path)
                    if path.exists():
                        path.unlink()
                        logger.info("Report file deleted", file_path=file_path)
                except Exception as e:
                    logger.warning("Failed to delete report file",
                                 file_path=file_path,
                                 error=str(e))

        # 删除数据库记录
        await db.delete(report)
        await db.commit()

        logger.info("Report deleted successfully",
                   report_id=report_id,
                   user=current_user["id"])

        return ApiResponse(
            code=200,
            message="删除成功",
            data={"id": report_id}
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to delete report",
                    report_id=report_id,
                    error=str(e),
                    error_type=type(e).__name__)
        raise HTTPException(
            status_code=500,
            detail=f"删除报表失败: {str(e)}"
        )


@router.get("/{report_id}/download",
            summary="下载报表文件")
async def download_report(
    report_id: int,
    report_format: Optional[str] = Query(None, description="指定下载格式"),
    current_user: dict = Depends(require_permission("reports:read")),
    db: AsyncSession = Depends(get_db_session)
):
    """
    下载报表文件

    **参数**：
    - report_format: 指定下载格式（pdf/excel/html/word）
      - 如果不指定，默认下载第一个可用格式

    **返回**：
    - 文件流（用于浏览器下载）
    """
    try:
        logger.info("Downloading report",
                   report_id=report_id,
                   report_format=report_format,
                   user=current_user["id"])

        # 查询报表
        query = select(Report).where(Report.id == report_id)
        result = await db.execute(query)
        report = result.scalar_one_or_none()

        if not report:
            raise HTTPException(status_code=404, detail="报表不存在")

        # 权限检查
        # TODO: 实现细粒度权限控制

        # 检查报表状态
        if report.status != ReportStatus.COMPLETED:
            raise HTTPException(
                status_code=400,
                detail=f"报表尚未生成完成，当前状态: {report.status.value}"
            )

        # 确定下载格式
        if not report.file_paths or not isinstance(report.file_paths, dict):
            raise HTTPException(status_code=404, detail="报表文件不存在")

        if report_format:
            file_path = report.file_paths.get(report_format.lower())
            if not file_path:
                available_formats = list(report.file_paths.keys())
                raise HTTPException(
                    status_code=404,
                    detail=f"不支持的格式 {report_format}，可用格式: {', '.join(available_formats)}"
                )
        else:
            # 默认使用第一个格式
            report_format = list(report.file_paths.keys())[0]
            file_path = report.file_paths[report_format]

        # 检查文件是否存在
        path = Path(file_path)
        if not path.exists():
            logger.error("Report file not found", file_path=file_path)
            raise HTTPException(status_code=404, detail="报表文件不存在")

        # 确定文件MIME类型
        mime_types = {
            "pdf": "application/pdf",
            "excel": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "html": "text/html",
            "word": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        }
        media_type = mime_types.get(report_format, "application/octet-stream")

        # 生成文件名
        filename = f"{report.title}_{report.id}.{report_format}"

        logger.info("Report download started",
                   report_id=report_id,
                   report_format=report_format,
                   file_size=path.stat().st_size,
                   user=current_user["id"])

        return FileResponse(
            path=str(path),
            media_type=media_type,
            filename=filename,
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"'
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to download report",
                    report_id=report_id,
                    error=str(e),
                    error_type=type(e).__name__)
        raise HTTPException(
            status_code=500,
            detail=f"下载报表失败: {str(e)}"
        )


@router.get("/{report_id}/preview",
            response_model=ApiResponse,
            summary="预览报表")
async def preview_report(
    report_id: int,
    current_user: dict = Depends(require_permission("reports:read")),
    db: AsyncSession = Depends(get_db_session)
):
    """
    获取报表预览数据

    **功能**：
    - HTML格式：返回HTML内容
    - 其他格式：返回基本信息和元数据

    **注意**：
    - 此功能目前处于开发中
    - 完整预览功能将在后续版本提供
    """
    try:
        logger.info("Previewing report",
                   report_id=report_id,
                   user=current_user["id"])

        # 查询报表
        query = select(Report).where(Report.id == report_id)
        result = await db.execute(query)
        report = result.scalar_one_or_none()

        if not report:
            raise HTTPException(status_code=404, detail="报表不存在")

        # 基础预览信息
        preview_data = {
            "id": str(report.id),
            "title": report.title,
            "description": report.description,
            "type": report.report_type.value,
            "status": report.status.value,
            "preview_available": False,
            "message": "报表预览功能正在开发中，请使用下载功能获取完整报表"
        }

        # TODO: 实现HTML预览
        # if report.file_formats and "html" in report.file_formats:
        #     html_path = report.file_paths.get("html")
        #     if html_path and Path(html_path).exists():
        #         with open(html_path, 'r', encoding='utf-8') as f:
        #             preview_data["html_content"] = f.read()
        #             preview_data["preview_available"] = True

        return ApiResponse(
            code=200,
            message="预览数据获取成功",
            data=preview_data
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to preview report",
                    report_id=report_id,
                    error=str(e),
                    error_type=type(e).__name__)
        raise HTTPException(
            status_code=500,
            detail=f"预览报表失败: {str(e)}"
        )
