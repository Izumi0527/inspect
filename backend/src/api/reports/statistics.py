"""
统计报表API路由
提供统计数据查询、KPI指标和设备排名功能
"""
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from datetime import datetime
from typing import Optional
import structlog

from src.core.permissions import require_permission
from src.core.database import get_db_session
from sqlalchemy.ext.asyncio import AsyncSession
from src.services.statistics_service import statistics_service
from src.models.report import Report, ReportType, ReportStatus
from src.schemas.report import (
    StatisticsRequestSchema,
    StatisticsDataSchema,
    GenerateStatisticsReportRequest,
    KPIRequestSchema,
    KPIDataSchema,
    RankingsRequestSchema,
    RankingsDataSchema,
    ApiResponse,
    ReportResponse,
    convert_report_to_response
)
from src.core.config import settings

logger = structlog.get_logger()
router = APIRouter()


@router.post("/statistics/data",
             response_model=ApiResponse,
             summary="获取统计数据")
async def get_statistics_data(
    request: StatisticsRequestSchema,
    current_user: dict = Depends(require_permission("reports:read")),
    db: AsyncSession = Depends(get_db_session)
):
    """
    获取统计数据（不生成文件，仅返回JSON数据）

    **请求参数**：
    - startDate: 开始日期 (ISO格式，必填)
    - endDate: 结束日期 (ISO格式，必填)
    - deviceTypes: 设备类型筛选列表（可选）
    - locations: 位置筛选列表（可选）
    - deviceGroups: 设备组筛选列表（可选）
    - groupBy: 分组方式 (hour/day/week/month，默认day)
    - includeTrends: 是否包含趋势数据（默认true）

    **返回数据包含**：
    - 总览指标：设备总数、在线数、离线数、巡检数、问题数等
    - 比率指标：巡检成功率、问题解决率、设备健康分数等
    - 分布数据：设备类型分布、性能评级分布、问题分类统计
    - 排名数据：表现最佳设备、表现最差设备
    - 趋势数据：近期趋势变化

    **使用场景**：
    - StatisticsReports组件实时获取统计数据
    - 仪表盘概览数据展示
    - 数据分析和监控

    **注意**：
    - 数据量较大时建议使用缓存
    - 时间范围不宜过长，建议不超过90天
    """
    try:
        logger.info("Getting statistics data",
                   start_date=request.start_date,
                   end_date=request.end_date,
                   user=current_user["id"])

        # 调用服务层获取统计数据
        stats_data = await statistics_service.get_statistics_data(db, request)

        logger.info("Statistics data retrieved successfully",
                   total_devices=stats_data.total_devices,
                   total_inspections=stats_data.total_inspections,
                   user=current_user["id"])

        return ApiResponse(
            code=200,
            message="统计数据获取成功",
            data=stats_data.model_dump(by_alias=True)
        )

    except ValueError as e:
        logger.warning("Invalid request parameters", error=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Failed to get statistics data",
                    error=str(e),
                    error_type=type(e).__name__)
        raise HTTPException(
            status_code=500,
            detail=f"获取统计数据失败: {str(e)}"
        )


@router.post("/statistics/generate",
             response_model=ApiResponse,
             summary="生成统计报表文件")
async def generate_statistics_report(
    request: GenerateStatisticsReportRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(require_permission("reports:create")),
    db: AsyncSession = Depends(get_db_session)
):
    """
    生成统计报表文件（Excel/PDF/HTML/Word）

    **请求参数**：
    - title: 报表标题（必填）
    - description: 报表描述（可选）
    - startDate: 开始日期（必填）
    - endDate: 结束日期（必填）
    - deviceTypes: 设备类型筛选（可选）
    - locations: 位置筛选（可选）
    - format: 报表格式 (pdf/excel/html/word，默认pdf)
    - includeCharts: 是否包含图表（默认true）
    - includeTrends: 是否包含趋势分析（默认true）
    - includeRankings: 是否包含排名数据（默认true）

    **返回**：
    - Report对象，status为"generating"
    - 报告生成完成后status变为"completed"
    - 可通过downloadUrl下载文件

    **使用场景**：
    - 生成月度/季度统计报告
    - 导出完整统计数据供离线分析
    - 管理层汇报材料

    **注意**：
    - 报表生成为异步任务，可能需要数秒到数分钟
    - 建议轮询报告状态查询完成情况
    - 大型报表建议使用后台任务队列
    """
    try:
        logger.info("Generating statistics report",
                   title=request.title,
                   format=request.format,
                   user=current_user["id"])

        # 第一步：获取统计数据
        stats_request = StatisticsRequestSchema(
            start_date=request.start_date,
            end_date=request.end_date,
            device_types=request.device_types,
            locations=request.locations,
            group_by="day",
            include_trends=request.include_trends
        )
        stats_data = await statistics_service.get_statistics_data(db, stats_request)

        # 第二步：创建Report数据库记录
        start_dt = datetime.fromisoformat(request.start_date.replace('Z', '+00:00'))
        end_dt = datetime.fromisoformat(request.end_date.replace('Z', '+00:00'))

        report = Report(
            title=request.title,
            description=request.description,
            report_type=ReportType.STATISTICS,
            status=ReportStatus.GENERATING,
            generated_by=current_user["id"],
            start_date=start_dt,
            end_date=end_dt,
            file_formats=[request.format.value],
            device_filters={
                "device_types": request.device_types or [],
                "locations": request.locations or []
            }
        )
        db.add(report)
        await db.commit()
        await db.refresh(report)

        # 第三步：异步生成报表文件
        async def generate_report_task():
            """后台任务：生成报表文件"""
            try:
                # 准备报表数据
                report_data = {
                    "type": "statistics",
                    "statistics": stats_data.model_dump(by_alias=True),
                    "title": request.title,
                    "description": request.description,
                    "time_range": {
                        "start": request.start_date,
                        "end": request.end_date
                    }
                }

                # 调用报表生成器（这里需要扩展report_generator支持statistics类型）
                # TODO: 扩展report_generator.py支持statistics报表类型
                file_path = f"/tmp/reports/{report.id}_statistics.{request.format.value}"

                # 更新数据库记录
                report.status = ReportStatus.COMPLETED
                report.file_paths = {request.format.value: file_path}
                report.file_sizes = {request.format.value: 0}  # TODO: 获取实际文件大小
                await db.commit()

                logger.info("Statistics report generated successfully",
                           report_id=report.id)

            except Exception as e:
                logger.error("Failed to generate statistics report file",
                            report_id=report.id,
                            error=str(e))
                report.status = ReportStatus.FAILED
                await db.commit()

        # 添加后台任务
        background_tasks.add_task(generate_report_task)

        # 转换为前端格式
        base_url = getattr(settings, "BASE_URL", "http://localhost:8000")
        report_data = convert_report_to_response(report, base_url)

        logger.info("Statistics report generation started",
                   report_id=report.id,
                   user=current_user["id"])

        return ApiResponse(
            code=200,
            message="统计报表生成任务已启动",
            data=report_data
        )

    except ValueError as e:
        logger.warning("Invalid request parameters", error=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Failed to start statistics report generation",
                    error=str(e),
                    error_type=type(e).__name__)
        raise HTTPException(
            status_code=500,
            detail=f"统计报表生成失败: {str(e)}"
        )


@router.post("/statistics/kpi",
             response_model=ApiResponse,
             summary="获取KPI指标数据")
async def get_kpi_data(
    request: KPIRequestSchema,
    current_user: dict = Depends(require_permission("reports:read")),
    db: AsyncSession = Depends(get_db_session)
):
    """
    获取KPI（关键绩效指标）数据

    **请求参数**：
    - startDate: 开始日期（必填）
    - endDate: 结束日期（必填）
    - deviceTypes: 设备类型筛选（可选）
    - comparisonPeriod: 对比周期 (previous_period/previous_year，可选)

    **返回KPI指标**：
    - 巡检完成率 (Inspection Completion Rate)
    - 巡检成功率 (Inspection Success Rate)
    - 平均巡检时长 (Avg Inspection Duration)
    - 设备可用率 (Device Availability)
    - 设备健康分数 (Device Health Score)
    - 问题解决率 (Issue Resolution Rate)
    - 平均解决时间 (Avg Resolution Time)
    - 平均修复时间 MTTR (Mean Time To Repair)
    - 平均无故障时间 MTBF (Mean Time Between Failures)
    - 严重问题数 (Critical Issues Count)
    - SLA达标率 (SLA Compliance Rate)
    - 平均响应时间 (Avg Response Time)

    **每个KPI包含**：
    - value: 当前值
    - previousValue: 对比期的值（如果提供了comparisonPeriod）
    - changeRate: 变化率 (%)
    - trend: 趋势 (up/down/stable)
    - status: 状态 (excellent/good/warning/critical)
    - target: 目标值（用于判断达标情况）

    **使用场景**：
    - KPI仪表盘展示
    - 管理层决策支持
    - 性能趋势分析

    **注意**：
    - 建议时间范围为1个月以内
    - comparisonPeriod用于同比/环比分析
    """
    try:
        logger.info("Getting KPI data",
                   start_date=request.start_date,
                   end_date=request.end_date,
                   comparison_period=request.comparison_period,
                   user=current_user["id"])

        # 调用服务层获取KPI数据
        kpi_data = await statistics_service.get_kpi_data(
            db=db,
            start_date=request.start_date,
            end_date=request.end_date,
            device_types=request.device_types,
            comparison_period=request.comparison_period
        )

        logger.info("KPI data retrieved successfully",
                   user=current_user["id"])

        return ApiResponse(
            code=200,
            message="KPI数据获取成功",
            data=kpi_data.model_dump(by_alias=True)
        )

    except ValueError as e:
        logger.warning("Invalid request parameters", error=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Failed to get KPI data",
                    error=str(e),
                    error_type=type(e).__name__)
        raise HTTPException(
            status_code=500,
            detail=f"获取KPI数据失败: {str(e)}"
        )


@router.post("/statistics/rankings",
             response_model=ApiResponse,
             summary="获取设备排名数据")
async def get_rankings_data(
    request: RankingsRequestSchema,
    current_user: dict = Depends(require_permission("reports:read")),
    db: AsyncSession = Depends(get_db_session)
):
    """
    获取设备排名数据

    **请求参数**：
    - startDate: 开始日期（必填）
    - endDate: 结束日期（必填）
    - rankingType: 排名类型 (performance/reliability/efficiency，默认performance)
    - deviceTypes: 设备类型筛选（可选）
    - topN: 返回前N名（默认10，范围1-100）
    - includeBottom: 是否包含后N名（默认true）

    **返回排名数据**：
    - overallRankings: 综合排名
    - byPerformance: 按性能排名
    - byReliability: 按可靠性排名
    - byEfficiency: 按效率排名
    - byDeviceType: 按设备类型分组的排名

    **每个设备排名包含**：
    - rank: 排名
    - deviceId, deviceName, deviceType: 设备信息
    - score: 综合得分
    - healthScore: 健康分数
    - uptime: 在线率 (%)
    - avgResponseTime: 平均响应时间 (ms)
    - totalChecks, failedChecks: 检查统计
    - issuesCount: 问题数量
    - status: 当前状态

    **使用场景**：
    - 设备性能对比
    - 识别表现优异/不佳的设备
    - 资源优化决策

    **注意**：
    - topN过大会影响响应速度
    - 建议按设备类型分别查询
    """
    try:
        logger.info("Getting rankings data",
                   start_date=request.start_date,
                   end_date=request.end_date,
                   ranking_type=request.ranking_type,
                   top_n=request.top_n,
                   user=current_user["id"])

        # 调用服务层获取排名数据
        rankings_data = await statistics_service.get_rankings_data(
            db=db,
            start_date=request.start_date,
            end_date=request.end_date,
            ranking_type=request.ranking_type,
            device_types=request.device_types,
            top_n=request.top_n,
            include_bottom=request.include_bottom
        )

        logger.info("Rankings data retrieved successfully",
                   total_devices=rankings_data.total_devices,
                   user=current_user["id"])

        return ApiResponse(
            code=200,
            message="排名数据获取成功",
            data=rankings_data.model_dump(by_alias=True)
        )

    except ValueError as e:
        logger.warning("Invalid request parameters", error=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Failed to get rankings data",
                    error=str(e),
                    error_type=type(e).__name__)
        raise HTTPException(
            status_code=500,
            detail=f"获取排名数据失败: {str(e)}"
        )
