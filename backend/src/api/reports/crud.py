"""
报表通用CRUD API
提供报表的增删改查、下载、预览等功能
"""
from fastapi import APIRouter, HTTPException, Depends, Query, Response, BackgroundTasks
from fastapi.responses import FileResponse
from sqlalchemy import select, and_, or_, func, desc
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List
from pathlib import Path
from datetime import datetime
import structlog

from src.core.permissions import require_permission
from src.core.database import get_db_session
from src.services.statistics_service import statistics_service
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


# ============================================================================
# POST /reports - 创建报表配置
# ============================================================================

@router.post("/",
             response_model=ApiResponse,
             summary="创建报表配置",
             status_code=201)
async def create_report(
    request: ReportCreate,
    current_user: dict = Depends(require_permission("reports:create")),
    db: AsyncSession = Depends(get_db_session)
):
    """
    创建新的报表配置

    **请求参数**：
    - title: 报表标题（必填，1-200字符）
    - description: 报表描述（可选）
    - reportType: 报表类型（inspection/statistics/trend/custom）
    - category: 报表分类（daily/weekly/monthly/quarterly/yearly/custom）
    - startDate: 开始日期（ISO格式，必填）
    - endDate: 结束日期（ISO格式，必填）
    - parameters: 报表参数配置（包含设备过滤、指标配置等）
    - schedule: 调度配置（可选，包含调度类型、cron表达式等）

    **功能特性**：
    - 支持多种报表类型和分类
    - 灵活的参数配置（设备类型、位置、分组等）
    - 可选的调度配置（定时生成报表）
    - 自动记录创建者信息
    - 初始状态为'pending'等待生成

    **返回数据**：
    - id: 报表ID
    - title, description: 基本信息
    - reportType, category: 类型和分类
    - status: 报表状态（pending）
    - createdAt, updatedAt: 时间戳
    - generatedBy: 创建者ID
    - 其他配置信息

    **使用场景**：
    - 创建一次性报表配置
    - 创建定期报表任务
    - 保存常用报表配置模板
    - 批量报表生成前的配置准备

    **注意事项**：
    - 创建后status为'pending'，需要调用generate接口触发生成
    - startDate必须早于endDate
    - 调度配置需提供有效的cron表达式
    - 创建不会立即生成报表文件
    """
    try:
        logger.info("Creating report configuration",
                   title=request.title,
                   report_type=request.report_type,
                   user=current_user["id"])

        # 验证时间范围
        if request.start_date >= request.end_date:
            raise HTTPException(
                status_code=400,
                detail="开始日期必须早于结束日期"
            )

        # 创建Report实例
        report = Report(
            title=request.title,
            description=request.description,
            report_type=request.report_type,
            category=request.category,
            start_date=request.start_date,
            end_date=request.end_date,
            status=ReportStatus.PENDING,
            generated_by=current_user["id"],
            file_formats=request.parameters.file_formats if request.parameters else [],
            device_filters={
                "device_types": request.parameters.device_types if request.parameters and request.parameters.device_types else [],
                "locations": request.parameters.locations if request.parameters and request.parameters.locations else [],
                "device_groups": request.parameters.device_groups if request.parameters and request.parameters.device_groups else [],
                "metrics": request.parameters.metrics if request.parameters and request.parameters.metrics else []
            } if request.parameters else {}
        )

        # 如果提供了调度配置，保存到数据库
        if request.schedule:
            report.schedule_enabled = request.schedule.enabled
            report.schedule_type = request.schedule.schedule_type
            report.schedule_cron = request.schedule.cron_expression

        # 保存到数据库
        db.add(report)
        await db.commit()
        await db.refresh(report)

        logger.info("Report configuration created successfully",
                   report_id=report.id,
                   title=report.title,
                   user=current_user["id"])

        # 转换为前端格式
        base_url = getattr(settings, "BASE_URL", "http://localhost:8000")
        report_data = convert_report_to_response(report, base_url)

        return ApiResponse(
            code=201,
            message="报表配置创建成功",
            data=report_data
        )

    except HTTPException:
        raise
    except ValueError as e:
        logger.warning("Invalid request parameters", error=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Failed to create report configuration",
                    error=str(e),
                    error_type=type(e).__name__)
        raise HTTPException(
            status_code=500,
            detail=f"创建报表配置失败: {str(e)}"
        )


# ============================================================================
# PUT /reports/{report_id} - 更新报表配置
# ============================================================================

@router.put("/{report_id}",
            response_model=ApiResponse,
            summary="更新报表配置")
async def update_report(
    report_id: int,
    request: ReportUpdate,
    current_user: dict = Depends(require_permission("reports:update")),
    db: AsyncSession = Depends(get_db_session)
):
    """
    更新报表配置

    **请求参数**：
    - title: 报表标题（可选，1-200字符）
    - description: 报表描述（可选）
    - parameters: 报表参数配置（可选）
    - schedule: 调度配置（可选）

    **功能特性**：
    - 仅更新提供的字段（部分更新）
    - 验证报表存在性和权限
    - 不能更新正在生成中的报表
    - 自动更新updatedAt时间戳
    - 支持清空可选字段（传null）

    **返回数据**：
    - 更新后的完整报表信息
    - 包含所有字段和最新的updatedAt

    **使用场景**：
    - 修改报表标题或描述
    - 调整报表参数（筛选条件、指标等）
    - 更新调度配置
    - 修正配置错误

    **注意事项**：
    - 不能更新正在生成中的报表（status=generating）
    - 不能修改reportType、startDate、endDate等关键字段
    - 更新后需要重新生成才能应用到报表文件
    - 只有报表创建者或管理员可以更新
    """
    try:
        logger.info("Updating report configuration",
                   report_id=report_id,
                   user=current_user["id"])

        # 查询报表
        query = select(Report).where(Report.id == report_id)
        result = await db.execute(query)
        report = result.scalar_one_or_none()

        if not report:
            raise HTTPException(
                status_code=404,
                detail=f"报表 {report_id} 不存在"
            )

        # 验证权限：只有创建者或管理员可以更新
        if report.generated_by != current_user["id"]:
            # TODO: 添加管理员权限检查
            raise HTTPException(
                status_code=403,
                detail="没有权限更新此报表"
            )

        # 不能更新正在生成中的报表
        if report.status == ReportStatus.GENERATING:
            raise HTTPException(
                status_code=400,
                detail="不能更新正在生成中的报表，请等待生成完成"
            )

        # 更新字段
        update_data = request.model_dump(exclude_unset=True, by_alias=False)

        if "title" in update_data and update_data["title"]:
            report.title = update_data["title"]

        if "description" in update_data:
            report.description = update_data["description"]

        # 更新parameters
        if "parameters" in update_data and update_data["parameters"]:
            params = update_data["parameters"]

            # 更新file_formats
            if "file_formats" in params:
                report.file_formats = params["file_formats"]

            # 更新device_filters
            device_filters = {}
            if "device_types" in params:
                device_filters["device_types"] = params["device_types"] or []
            if "locations" in params:
                device_filters["locations"] = params["locations"] or []
            if "device_groups" in params:
                device_filters["device_groups"] = params["device_groups"] or []
            if "metrics" in params:
                device_filters["metrics"] = params["metrics"] or []

            if device_filters:
                report.device_filters = device_filters

        # 更新schedule
        if "schedule" in update_data and update_data["schedule"]:
            schedule = update_data["schedule"]
            if "enabled" in schedule:
                report.schedule_enabled = schedule["enabled"]
            if "schedule_type" in schedule:
                report.schedule_type = schedule["schedule_type"]
            if "cron_expression" in schedule:
                report.schedule_cron = schedule["cron_expression"]

        # 保存更新
        await db.commit()
        await db.refresh(report)

        logger.info("Report configuration updated successfully",
                   report_id=report.id,
                   user=current_user["id"])

        # 转换为前端格式
        base_url = getattr(settings, "BASE_URL", "http://localhost:8000")
        report_data = convert_report_to_response(report, base_url)

        return ApiResponse(
            code=200,
            message="报表配置更新成功",
            data=report_data
        )

    except HTTPException:
        raise
    except ValueError as e:
        logger.warning("Invalid request parameters", error=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Failed to update report configuration",
                    report_id=report_id,
                    error=str(e),
                    error_type=type(e).__name__)
        raise HTTPException(
            status_code=500,
            detail=f"更新报表配置失败: {str(e)}"
        )


# ============================================================================
# POST /reports/{report_id}/generate - 触发报表生成
# ============================================================================

@router.post("/{report_id}/generate",
             response_model=ApiResponse,
             summary="触发报表生成",
             status_code=202)
async def generate_report(
    report_id: int,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(require_permission("reports:create")),
    db: AsyncSession = Depends(get_db_session)
):
    """
    触发报表生成（异步）

    **功能特性**：
    - 异步生成报表文件
    - 支持多种报表类型（inspection/statistics/trend/custom）
    - 自动更新报表状态（pending → generating → completed/failed）
    - 生成多种格式文件（根据配置）
    - 存储文件路径和大小信息
    - 记录生成时间和错误信息

    **返回数据**：
    - 立即返回202 Accepted
    - 报表状态更新为generating
    - 可通过GET /reports/{report_id}查询生成进度
    - 生成完成后status变为completed或failed

    **使用场景**：
    - 创建报表配置后触发生成
    - 重新生成已有报表
    - 调度任务自动生成
    - 手动触发报表刷新

    **注意事项**：
    - 生成过程是异步的，立即返回不代表生成完成
    - 不能重复触发正在生成中的报表
    - 大型报表可能需要几分钟生成时间
    - 生成失败会更新status为failed并记录错误信息
    - 需要轮询GET /reports/{report_id}查看完成状态
    """
    try:
        logger.info("Triggering report generation",
                   report_id=report_id,
                   user=current_user["id"])

        # 查询报表
        query = select(Report).where(Report.id == report_id)
        result = await db.execute(query)
        report = result.scalar_one_or_none()

        if not report:
            raise HTTPException(
                status_code=404,
                detail=f"报表 {report_id} 不存在"
            )

        # 验证权限
        if report.generated_by != current_user["id"]:
            # TODO: 添加管理员权限检查
            raise HTTPException(
                status_code=403,
                detail="没有权限生成此报表"
            )

        # 不能重复触发正在生成中的报表
        if report.status == ReportStatus.GENERATING:
            raise HTTPException(
                status_code=400,
                detail="报表正在生成中，请稍后再试"
            )

        # 更新状态为GENERATING
        report.status = ReportStatus.GENERATING
        report.error_message = None
        report.error_details = None
        await db.commit()

        # 创建后台任务
        async def generate_report_task():
            """后台任务：异步生成报表"""
            async for session in get_db_session():
                try:
                    logger.info("Starting report generation task",
                               report_id=report_id,
                               report_type=report.report_type)

                    # 重新查询报表（新的数据库会话）
                    query = select(Report).where(Report.id == report_id)
                    result = await session.execute(query)
                    report_obj = result.scalar_one()

                    # 根据报表类型获取数据
                    report_data = None

                    if report_obj.report_type == ReportType.STATISTICS:
                        # 调用statistics_service获取数据
                        from src.schemas.report import StatisticsRequestSchema

                        stats_request = StatisticsRequestSchema(
                            start_date=report_obj.start_date.isoformat(),
                            end_date=report_obj.end_date.isoformat(),
                            device_types=report_obj.device_filters.get("device_types", []) if report_obj.device_filters else [],
                            locations=report_obj.device_filters.get("locations", []) if report_obj.device_filters else [],
                            device_groups=report_obj.device_filters.get("device_groups", []) if report_obj.device_filters else [],
                            group_by="day",
                            include_trends=True
                        )

                        stats_data = await statistics_service.get_statistics_data(session, stats_request)
                        report_data = stats_data.model_dump(by_alias=True)

                    elif report_obj.report_type == ReportType.INSPECTION:
                        # TODO: 实现inspection报表数据获取
                        report_data = {"type": "inspection", "placeholder": True}

                    elif report_obj.report_type == ReportType.TREND:
                        # TODO: 实现trend报表数据获取
                        report_data = {"type": "trend", "placeholder": True}

                    else:  # CUSTOM
                        # TODO: 实现custom报表数据获取
                        report_data = {"type": "custom", "placeholder": True}

                    # 生成文件
                    file_paths = {}
                    file_sizes = {}

                    # 根据报表类型选择生成器
                    if report_obj.report_type == ReportType.STATISTICS:
                        # 使用统计报表生成器
                        from src.services.statistics_report_generator import statistics_report_generator

                        for format_type in (report_obj.file_formats or ["pdf"]):
                            try:
                                file_path = await statistics_report_generator.generate_statistics_report(
                                    statistics_data=report_data,
                                    title=report_obj.title,
                                    format_type=format_type,
                                    include_charts=report_obj.device_filters.get("metrics", []) if report_obj.device_filters else True
                                )

                                file_paths[format_type] = file_path
                                file_sizes[format_type] = Path(file_path).stat().st_size

                                logger.info("Generated statistics report file",
                                           report_id=report_id,
                                           format=format_type,
                                           file_path=file_path)

                            except Exception as format_error:
                                logger.error(f"Failed to generate {format_type} report",
                                           report_id=report_id,
                                           error=str(format_error))
                                # 继续生成其他格式
                                continue

                    else:
                        # 其他类型报表使用占位文件（待实现）
                        for format_type in (report_obj.file_formats or ["pdf"]):
                            temp_dir = Path("backend/temp/reports")
                            temp_dir.mkdir(parents=True, exist_ok=True)

                            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                            file_name = f"report_{report_id}_{timestamp}.{format_type}"
                            file_path = str(temp_dir / file_name)

                            # 创建占位文件
                            with open(file_path, "w") as f:
                                f.write(f"Report {report_id} - {format_type} placeholder")

                            file_paths[format_type] = file_path
                            file_sizes[format_type] = Path(file_path).stat().st_size

                    # 更新报表状态为COMPLETED
                    report_obj.status = ReportStatus.COMPLETED
                    report_obj.file_paths = file_paths
                    report_obj.file_sizes = file_sizes
                    report_obj.generated_at = datetime.now()
                    await session.commit()

                    logger.info("Report generation completed successfully",
                               report_id=report_id,
                               file_count=len(file_paths))

                except Exception as e:
                    logger.error("Report generation failed",
                                report_id=report_id,
                                error=str(e),
                                error_type=type(e).__name__)

                    # 更新报表状态为FAILED
                    try:
                        query = select(Report).where(Report.id == report_id)
                        result = await session.execute(query)
                        report_obj = result.scalar_one()

                        report_obj.status = ReportStatus.FAILED
                        report_obj.error_message = str(e)
                        report_obj.error_details = {"error_type": type(e).__name__}
                        await session.commit()
                    except Exception as commit_error:
                        logger.error("Failed to update report status to FAILED",
                                    report_id=report_id,
                                    error=str(commit_error))

        # 添加后台任务
        background_tasks.add_task(generate_report_task)

        logger.info("Report generation task queued",
                   report_id=report_id,
                   user=current_user["id"])

        # 转换为前端格式
        base_url = getattr(settings, "BASE_URL", "http://localhost:8000")
        report_data = convert_report_to_response(report, base_url)

        return ApiResponse(
            code=202,
            message="报表生成任务已启动，请稍后查询生成状态",
            data=report_data
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to trigger report generation",
                    report_id=report_id,
                    error=str(e),
                    error_type=type(e).__name__)
        raise HTTPException(
            status_code=500,
            detail=f"触发报表生成失败: {str(e)}"
        )


# ============================================================================
# POST /reports/{report_id}/clone - 克隆报表配置
# ============================================================================

@router.post("/{report_id}/clone",
             response_model=ApiResponse,
             summary="克隆报表配置",
             status_code=201)
async def clone_report(
    report_id: int,
    new_title: Optional[str] = Query(None, description="新报表标题（可选）"),
    current_user: dict = Depends(require_permission("reports:create")),
    db: AsyncSession = Depends(get_db_session)
):
    """
    克隆报表配置

    **请求参数**：
    - new_title: 新报表标题（可选，默认为"原标题 - 副本"）

    **功能特性**：
    - 复制现有报表的完整配置
    - 自动重置状态为pending
    - 清空生成相关字段（file_paths、generated_at、error等）
    - 保留所有报表参数和调度配置
    - 更新创建者为当前用户
    - 自动添加"副本"标识（如果未提供新标题）

    **返回数据**：
    - 新创建的报表完整信息
    - id为新分配的ID
    - status为pending
    - 其他配置与源报表相同

    **使用场景**：
    - 基于现有报表创建相似配置
    - 批量创建报表模板
    - 保存常用报表配置
    - 快速复制报表结构

    **注意事项**：
    - 不会复制生成的文件和结果
    - 新报表需要重新触发generate才能生成文件
    - 克隆不影响源报表
    - 可以克隆任何状态的报表
    - 只需要reports:create权限（无需源报表所有权）
    """
    try:
        logger.info("Cloning report",
                   report_id=report_id,
                   user=current_user["id"])

        # 查询源报表
        query = select(Report).where(Report.id == report_id)
        result = await db.execute(query)
        source_report = result.scalar_one_or_none()

        if not source_report:
            raise HTTPException(
                status_code=404,
                detail=f"报表 {report_id} 不存在"
            )

        # 确定新报表标题
        if new_title:
            cloned_title = new_title
        else:
            cloned_title = f"{source_report.title} - 副本"

        # 创建克隆报表
        cloned_report = Report(
            title=cloned_title,
            description=source_report.description,
            report_type=source_report.report_type,
            category=source_report.category,
            start_date=source_report.start_date,
            end_date=source_report.end_date,
            status=ReportStatus.PENDING,  # 重置为pending
            generated_by=current_user["id"],  # 更新为当前用户
            file_formats=source_report.file_formats.copy() if source_report.file_formats else [],
            device_filters=source_report.device_filters.copy() if source_report.device_filters else {},
            # 重置生成相关字段
            file_paths=None,
            file_sizes=None,
            generated_at=None,
            error_message=None,
            error_details=None,
            # 复制调度配置
            schedule_enabled=source_report.schedule_enabled,
            schedule_type=source_report.schedule_type,
            schedule_cron=source_report.schedule_cron,
            next_run_at=None  # 重置调度时间
        )

        # 保存到数据库
        db.add(cloned_report)
        await db.commit()
        await db.refresh(cloned_report)

        logger.info("Report cloned successfully",
                   source_report_id=report_id,
                   cloned_report_id=cloned_report.id,
                   user=current_user["id"])

        # 转换为前端格式
        base_url = getattr(settings, "BASE_URL", "http://localhost:8000")
        report_data = convert_report_to_response(cloned_report, base_url)

        return ApiResponse(
            code=201,
            message="报表配置克隆成功",
            data=report_data
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to clone report",
                    report_id=report_id,
                    error=str(e),
                    error_type=type(e).__name__)
        raise HTTPException(
            status_code=500,
            detail=f"克隆报表配置失败: {str(e)}"
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
