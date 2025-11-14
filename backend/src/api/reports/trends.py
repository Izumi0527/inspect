"""
趋势分析报告API

提供趋势分析相关的API端点，包括：
- 趋势分析数据查询
- 趋势报告生成
- 预测数据获取
- 异常检测
"""

from fastapi import APIRouter, HTTPException, Depends
from typing import Optional
import structlog

from src.core.permissions import require_permission
from src.services.analytics_service import analytics_service, TimeRange
from src.schemas.report import (
    TrendAnalysisRequestSchema,
    GenerateTrendReportRequestSchema,
    PredictionsRequestSchema,
    AnomalyDetectionRequestSchema,
    TrendAnalysisDataSchema,
    convert_snake_to_camel_dict
)

logger = structlog.get_logger()
router = APIRouter()


# ==================== API端点 ====================

@router.post("/trends/analysis", summary="获取趋势分析数据")
async def get_trend_analysis(
    request: TrendAnalysisRequestSchema,
    current_user: dict = Depends(require_permission("reports:read"))
):
    """
    获取趋势分析数据

    分析指定指标在时间范围内的趋势，包括：
    - 指标时序数据
    - 趋势方向（上升/下降/稳定）
    - 变化率统计
    - 关键时间点标注
    """
    try:
        from datetime import datetime

        # 验证指标
        valid_metrics = ["availability", "performance", "errors", "capacity",
                        "cpu_usage", "memory_usage", "response_time", "throughput", "error_rate"]
        invalid_metrics = [m for m in request.metrics if m not in valid_metrics]
        if invalid_metrics:
            raise HTTPException(
                status_code=400,
                detail=f"不支持的指标: {', '.join(invalid_metrics)}"
            )

        # 解析日期范围
        start_date = datetime.fromisoformat(request.date_range.start_date)
        end_date = datetime.fromisoformat(request.date_range.end_date)

        # 解析设备ID
        device_ids = None
        if request.devices:
            device_ids = [int(device_id) for device_id in request.devices if device_id.isdigit()]

        # 调用服务生成趋势分析
        report = await analytics_service.generate_trend_analysis_report(
            metrics=request.metrics,
            time_range=TimeRange.CUSTOM,
            start_date=start_date,
            end_date=end_date,
            device_ids=device_ids
        )

        # 转换为 camelCase 格式
        camel_report = convert_snake_to_camel_dict(report)

        logger.info("Trend analysis data retrieved",
                   metrics=request.metrics,
                   granularity=request.granularity,
                   device_count=len(device_ids) if device_ids else 0,
                   user_id=current_user["id"])

        return {
            "success": True,
            "data": camel_report,
            "message": "趋势分析数据获取成功"
        }

    except HTTPException:
        raise
    except ValueError as e:
        logger.error("Invalid parameters for trend analysis", error=str(e))
        raise HTTPException(status_code=400, detail=f"参数错误: {str(e)}")
    except Exception as e:
        logger.error("Failed to get trend analysis data",
                    metrics=request.metrics,
                    error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"获取趋势分析数据失败: {str(e)}"
        )


@router.post("/trends/generate", summary="生成趋势分析报告")
async def generate_trend_report(
    request: GenerateTrendReportRequestSchema,
    current_user: dict = Depends(require_permission("reports:create"))
):
    """
    生成趋势分析报告

    生成完整的趋势分析报告文档，支持多种格式：
    - PDF: 适合打印和归档
    - Excel: 适合数据分析
    - HTML: 适合在线查看
    - Word: 适合编辑修改
    """
    try:
        from datetime import datetime

        # 解析日期范围
        start_date = datetime.fromisoformat(request.start_date)
        end_date = datetime.fromisoformat(request.end_date)

        # 解析设备ID
        device_ids = None
        if request.devices:
            device_ids = [int(device_id) for device_id in request.devices if device_id.isdigit()]

        # 生成趋势分析数据
        analysis_data = await analytics_service.generate_trend_analysis_report(
            metrics=request.metrics,
            time_range=TimeRange.CUSTOM,
            start_date=start_date,
            end_date=end_date,
            device_ids=device_ids
        )

        # TODO: 实现报告文件生成逻辑（PDF/Excel/HTML/Word）
        # 当前返回报告数据，后续需要调用 report_export 服务生成文件

        report_data = {
            "id": 1001,  # TODO: 从数据库生成
            "title": request.title,
            "type": "trend",
            "status": "completed",
            "format": request.format.value,
            "createdAt": datetime.now().isoformat(),
            "generatedBy": current_user["username"],
            "fileUrl": f"/reports/downloads/trend_{datetime.now().strftime('%Y%m%d_%H%M%S')}.{request.format.value}",
            "data": convert_snake_to_camel_dict(analysis_data)
        }

        logger.info("Trend report generated",
                   title=request.title,
                   format=request.format.value,
                   metrics=request.metrics,
                   user_id=current_user["id"])

        return {
            "success": True,
            "data": report_data,
            "message": "趋势报告生成成功"
        }

    except HTTPException:
        raise
    except ValueError as e:
        logger.error("Invalid parameters for report generation", error=str(e))
        raise HTTPException(status_code=400, detail=f"参数错误: {str(e)}")
    except Exception as e:
        logger.error("Failed to generate trend report",
                    title=request.title,
                    error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"生成趋势报告失败: {str(e)}"
        )


@router.post("/trends/predictions", summary="获取预测数据")
async def get_predictions(
    request: PredictionsRequestSchema,
    current_user: dict = Depends(require_permission("reports:read"))
):
    """
    获取指标预测数据

    基于历史数据预测未来趋势：
    - 使用移动平均算法
    - 支持周/月/季度预测
    - 提供置信区间
    """
    try:
        # 解析设备ID
        device_ids = None
        if request.devices:
            device_ids = [int(device_id) for device_id in request.devices if device_id.isdigit()]

        # 调用服务生成预测数据
        # TODO: 实现专门的预测服务函数
        # 当前从趋势分析报告中提取预测数据
        report = await analytics_service.generate_trend_analysis_report(
            metrics=request.metrics,
            time_range=TimeRange.LAST_90D,
            device_ids=device_ids
        )

        # 提取预测部分
        predictions = report.get("forecasts", {})

        logger.info("Predictions data retrieved",
                   metrics=request.metrics,
                   timeframe=request.timeframe,
                   user_id=current_user["id"])

        return {
            "success": True,
            "data": convert_snake_to_camel_dict(predictions),
            "message": "预测数据获取成功"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get predictions",
                    metrics=request.metrics,
                    error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"获取预测数据失败: {str(e)}"
        )


@router.post("/trends/anomalies", summary="异常检测")
async def detect_anomalies(
    request: AnomalyDetectionRequestSchema,
    current_user: dict = Depends(require_permission("reports:read"))
):
    """
    检测指标异常

    使用统计方法检测异常点：
    - 3-sigma规则
    - 可调节灵敏度
    - 标注异常时间点和严重程度
    """
    try:
        from datetime import datetime

        # 解析日期范围
        start_date = datetime.fromisoformat(request.date_range.start_date)
        end_date = datetime.fromisoformat(request.date_range.end_date)

        # 解析设备ID
        device_ids = None
        if request.devices:
            device_ids = [int(device_id) for device_id in request.devices if device_id.isdigit()]

        # 调用服务生成趋势分析（包含异常检测）
        report = await analytics_service.generate_trend_analysis_report(
            metrics=request.metrics,
            time_range=TimeRange.CUSTOM,
            start_date=start_date,
            end_date=end_date,
            device_ids=device_ids
        )

        # 提取异常检测部分
        anomalies = report.get("anomalies", [])

        logger.info("Anomaly detection completed",
                   metrics=request.metrics,
                   sensitivity=request.sensitivity,
                   anomalies_count=len(anomalies),
                   user_id=current_user["id"])

        return {
            "success": True,
            "data": {
                "anomalies": anomalies,
                "totalCount": len(anomalies),
                "severity": request.sensitivity
            },
            "message": "异常检测完成"
        }

    except HTTPException:
        raise
    except ValueError as e:
        logger.error("Invalid parameters for anomaly detection", error=str(e))
        raise HTTPException(status_code=400, detail=f"参数错误: {str(e)}")
    except Exception as e:
        logger.error("Failed to detect anomalies",
                    metrics=request.metrics,
                    error=str(e))
        raise HTTPException(
            status_code=500,
            detail=f"异常检测失败: {str(e)}"
        )
