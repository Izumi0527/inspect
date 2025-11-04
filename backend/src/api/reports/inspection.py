"""
巡检报告API路由
提供巡检报告生成、数据获取和对比功能
"""
from fastapi import APIRouter, HTTPException, Depends, BackgroundTasks
from datetime import datetime
from typing import Optional
import structlog

from src.core.permissions import require_permission
from src.core.database import get_db_session
from sqlalchemy.ext.asyncio import AsyncSession
from src.services.inspection_report_service import InspectionReportService
from src.schemas.report import (
    GenerateInspectionReportRequest,
    InspectionReportDataRequest,
    CompareDeviceReportsRequest,
    InspectionReportDataSchema,
    ReportResponse,
    ApiResponse,
    convert_report_to_response
)
from src.core.config import settings

logger = structlog.get_logger()
router = APIRouter()


@router.post("/inspection/generate",
             response_model=ApiResponse,
             summary="生成巡检报告")
async def generate_inspection_report(
    request: GenerateInspectionReportRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(require_permission("reports:create")),
    db: AsyncSession = Depends(get_db_session)
):
    """
    生成巡检报告文件（Excel/PDF/HTML/Word）

    **请求参数**：
    - title: 报告标题（必填）
    - description: 报告描述（可选）
    - dateRange: 日期范围（必填）
      - startDate: 开始日期 (ISO格式)
      - endDate: 结束日期 (ISO格式)
    - devices: 设备ID列表（可选）
    - strategies: 策略ID列表（可选）
    - executionIds: 执行记录ID列表（可选）
    - format: 报告格式 (pdf/excel/html/word，默认pdf)
    - includeCharts: 是否包含图表（默认true）
    - includeDetailData: 是否包含详细数据（默认true）
    - includeRecommendations: 是否包含建议（默认true）

    **返回**：
    - Report对象，status为"generating"
    - 报告生成完成后status变为"completed"
    - 可通过downloadUrl下载文件

    **注意**：
    - 报告生成为异步任务，大型报告可能需要数秒到数分钟
    - 建议轮询报告状态或使用WebSocket接收完成通知
    """
    try:
        logger.info("Generating inspection report",
                   title=request.title,
                   format=request.format,
                   user=current_user["id"])

        # 创建服务实例
        service = InspectionReportService(db)

        # 生成报告（这会创建数据库记录并生成文件）
        report = await service.generate_and_save_report(
            request=request,
            generated_by=current_user["id"]
        )

        # 转换为前端格式
        base_url = getattr(settings, "BASE_URL", "http://localhost:8000")
        report_data = convert_report_to_response(report, base_url)

        logger.info("Inspection report generated successfully",
                   report_id=report.id,
                   status=report.status,
                   user=current_user["id"])

        return ApiResponse(
            code=200,
            message="报告生成成功",
            data=report_data
        )

    except ValueError as e:
        logger.warning("Invalid request parameters", error=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Failed to generate inspection report",
                    error=str(e),
                    error_type=type(e).__name__)
        raise HTTPException(
            status_code=500,
            detail=f"生成巡检报告失败: {str(e)}"
        )


@router.post("/inspection/data",
             response_model=ApiResponse,
             summary="获取巡检报告数据")
async def get_inspection_report_data(
    request: InspectionReportDataRequest,
    current_user: dict = Depends(require_permission("reports:read")),
    db: AsyncSession = Depends(get_db_session)
):
    """
    获取巡检报告的原始数据（JSON格式）

    **用途**：
    - 在前端直接展示报告数据
    - 自定义报告渲染
    - 数据分析和处理

    **请求参数**：
    - dateRange: 日期范围（必填）
    - devices: 设备ID列表（可选）
    - strategies: 策略ID列表（可选）
    - executionIds: 执行记录ID列表（可选）

    **返回数据结构**：
    ```json
    {
      "summary": {
        "totalDevices": 10,
        "totalExecutions": 50,
        "totalChecks": 500,
        "passedChecks": 450,
        "failedChecks": 30,
        "warningChecks": 20,
        "avgScore": 90.5,
        "successRate": 90.0
      },
      "deviceResults": [...],
      "executionTrends": [...],
      "problemAnalysis": [...],
      "recommendations": [...]
    }
    ```
    """
    try:
        logger.info("Fetching inspection report data",
                   start_date=request.date_range.start_date,
                   end_date=request.date_range.end_date,
                   user=current_user["id"])

        # 解析日期
        start_date = datetime.fromisoformat(request.date_range.start_date)
        end_date = datetime.fromisoformat(request.date_range.end_date)

        # 创建服务实例
        service = InspectionReportService(db)

        # 生成报告数据
        report_data = await service.generate_inspection_report_data(
            start_date=start_date,
            end_date=end_date,
            device_ids=request.devices,
            strategy_ids=[int(s) for s in request.strategies] if request.strategies else None,
            execution_ids=[int(e) for e in request.execution_ids] if request.execution_ids else None
        )

        logger.info("Inspection report data generated",
                   devices=report_data.summary.total_devices,
                   executions=report_data.summary.total_executions,
                   user=current_user["id"])

        # 转换为dict并使用camelCase
        from src.schemas.report import convert_snake_to_camel_dict
        data_dict = report_data.model_dump(by_alias=True)

        return ApiResponse(
            code=200,
            message="数据获取成功",
            data=data_dict
        )

    except ValueError as e:
        logger.warning("Invalid request parameters", error=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Failed to fetch inspection report data",
                    error=str(e),
                    error_type=type(e).__name__)
        raise HTTPException(
            status_code=500,
            detail=f"获取巡检报告数据失败: {str(e)}"
        )


@router.post("/inspection/compare",
             response_model=ApiResponse,
             summary="设备报告对比")
async def compare_device_reports(
    request: CompareDeviceReportsRequest,
    current_user: dict = Depends(require_permission("reports:read")),
    db: AsyncSession = Depends(get_db_session)
):
    """
    对比多个设备的巡检报告数据

    **功能**：
    - 多设备性能对比
    - 问题分布对比
    - 趋势对比分析

    **请求参数**：
    - deviceIds: 设备ID列表（至少2个）
    - dateRange: 对比时间范围
    - metrics: 对比指标列表（可选，默认所有）

    **返回**：
    - 设备对比矩阵
    - 差异分析
    - 建议优化项
    """
    try:
        if len(request.device_ids) < 2:
            raise ValueError("至少需要选择2个设备进行对比")

        logger.info("Comparing device reports",
                   device_count=len(request.device_ids),
                   user=current_user["id"])

        # 解析日期
        start_date = datetime.fromisoformat(request.date_range.start_date)
        end_date = datetime.fromisoformat(request.date_range.end_date)

        # 创建服务实例
        service = InspectionReportService(db)

        # 获取每个设备的数据
        device_data_list = []
        for device_id in request.device_ids:
            data = await service.generate_inspection_report_data(
                start_date=start_date,
                end_date=end_date,
                device_ids=[device_id]
            )
            device_data_list.append(data)

        # 构建对比结果
        comparison = {
            "devices": [],
            "metrics_comparison": {},
            "trend_comparison": [],
            "problem_comparison": []
        }

        # 设备基本信息对比
        for idx, data in enumerate(device_data_list):
            device_id = request.device_ids[idx]
            device_result = next(
                (d for d in data.device_results if d.device_id == device_id),
                None
            )

            if device_result:
                comparison["devices"].append({
                    "deviceId": device_result.device_id,
                    "deviceName": device_result.device_name,
                    "deviceType": device_result.device_type,
                    "score": device_result.score,
                    "totalChecks": device_result.total_checks,
                    "passedChecks": device_result.passed_checks,
                    "failedChecks": device_result.failed_checks,
                    "uptime": device_result.uptime,
                    "issueCount": len(device_result.issues)
                })

        # 指标对比
        if request.metrics:
            for metric in request.metrics:
                comparison["metrics_comparison"][metric] = [
                    {
                        "deviceId": request.device_ids[idx],
                        "value": 0  # TODO: 从实际数据中提取
                    }
                    for idx in range(len(request.device_ids))
                ]

        logger.info("Device comparison completed",
                   device_count=len(request.device_ids),
                   user=current_user["id"])

        return ApiResponse(
            code=200,
            message="设备对比完成",
            data=comparison
        )

    except ValueError as e:
        logger.warning("Invalid request parameters", error=str(e))
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Failed to compare device reports",
                    error=str(e),
                    error_type=type(e).__name__)
        raise HTTPException(
            status_code=500,
            detail=f"设备报告对比失败: {str(e)}"
        )
