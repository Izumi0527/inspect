from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import structlog

from src.core.permissions import require_permission
from src.services.analytics_service import analytics_service, ReportType, TimeRange

# 导入子路由
from src.api.reports import inspection, crud, trends

logger = structlog.get_logger()
router = APIRouter()

# 整合子路由
router.include_router(inspection.router, tags=["巡检报告"])
router.include_router(crud.router, tags=["报表管理"])
router.include_router(trends.router, tags=["趋势分析"])

# 报表请求数据模型
class ReportRequest(BaseModel):
    report_type: ReportType
    time_range: TimeRange = TimeRange.LAST_30D
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    device_ids: Optional[List[int]] = None
    group_ids: Optional[List[int]] = None
    device_types: Optional[List[str]] = None
    metrics: Optional[List[str]] = None
    group_by: Optional[str] = "day"
    sla_threshold: Optional[float] = 99.9

class TrendAnalysisRequest(BaseModel):
    metrics: List[str]
    time_range: TimeRange = TimeRange.LAST_30D
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    device_ids: Optional[List[int]] = None

class PerformanceAnalysisRequest(BaseModel):
    time_range: TimeRange = TimeRange.LAST_30D
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    device_types: Optional[List[str]] = None

class AvailabilityReportRequest(BaseModel):
    time_range: TimeRange = TimeRange.LAST_30D
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    sla_threshold: float = 99.9

@router.get("/types", summary="获取可用报表类型")
async def get_available_reports(
    current_user: dict = Depends(require_permission("reports:read"))
):
    """
    获取系统支持的所有报表类型
    """
    available_reports = [
        {
            "type": ReportType.DEVICE_HEALTH,
            "name": "设备健康度报告",
            "description": "分析设备健康状况、问题统计和可用性",
            "supported_time_ranges": [r.value for r in TimeRange],
            "parameters": ["device_ids", "group_ids"]
        },
        {
            "type": ReportType.INSPECTION_SUMMARY,
            "name": "巡检汇总报告",
            "description": "巡检统计、成功率趋势和检查项分布",
            "supported_time_ranges": [r.value for r in TimeRange],
            "parameters": ["group_by"]
        },
        {
            "type": ReportType.TREND_ANALYSIS,
            "name": "趋势分析报告",
            "description": "指标趋势分析、异常检测和相关性分析",
            "supported_time_ranges": [r.value for r in TimeRange],
            "parameters": ["metrics", "device_ids"],
            "available_metrics": ["cpu_usage", "memory_usage", "response_time", "throughput", "error_rate"]
        },
        {
            "type": ReportType.PERFORMANCE_ANALYSIS,
            "name": "性能分析报告",
            "description": "CPU、内存、接口性能分析和问题设备识别",
            "supported_time_ranges": [r.value for r in TimeRange],
            "parameters": ["device_types"]
        },
        {
            "type": ReportType.AVAILABILITY_REPORT,
            "name": "可用性报告",
            "description": "设备可用性、SLA达标率和停机事件分析",
            "supported_time_ranges": [r.value for r in TimeRange],
            "parameters": ["sla_threshold"]
        }
    ]
    
    logger.info("Retrieved available reports", 
               report_count=len(available_reports),
               user_id=current_user["id"])
    
    return {
        "available_reports": available_reports,
        "total_types": len(available_reports)
    }

@router.post("/device-health", summary="生成设备健康度报告")
async def generate_device_health_report(
    time_range: TimeRange = Query(TimeRange.LAST_30D, description="时间范围"),
    start_date: Optional[datetime] = Query(None, description="开始时间（自定义范围时必需）"),
    end_date: Optional[datetime] = Query(None, description="结束时间"),
    device_ids: Optional[str] = Query(None, description="设备ID列表（逗号分隔）"),
    group_ids: Optional[str] = Query(None, description="设备组ID列表（逗号分隔）"),
    current_user: dict = Depends(require_permission("reports:read"))
):
    """
    生成设备健康度报告
    
    包含内容：
    - 设备健康度评分
    - 问题分类统计
    - 设备可用性分析
    - 性能指标趋势
    """
    try:
        # 解析参数
        parsed_device_ids = None
        if device_ids:
            try:
                parsed_device_ids = [int(x.strip()) for x in device_ids.split(",") if x.strip()]
            except ValueError:
                raise HTTPException(status_code=400, detail="设备ID格式错误")
        
        parsed_group_ids = None
        if group_ids:
            try:
                parsed_group_ids = [int(x.strip()) for x in group_ids.split(",") if x.strip()]
            except ValueError:
                raise HTTPException(status_code=400, detail="设备组ID格式错误")
        
        # 生成报告
        report = await analytics_service.generate_device_health_report(
            time_range=time_range,
            start_date=start_date,
            end_date=end_date,
            device_ids=parsed_device_ids,
            group_ids=parsed_group_ids
        )
        
        logger.info("Device health report generated",
                   time_range=time_range,
                   device_count=report["summary"]["total_devices"],
                   user_id=current_user["id"])
        
        return report
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Failed to generate device health report", 
                    time_range=time_range,
                    error=str(e))
        raise HTTPException(status_code=500, detail=f"生成设备健康度报告失败: {str(e)}")

@router.post("/inspection-summary", summary="生成巡检汇总报告")
async def generate_inspection_summary_report(
    time_range: TimeRange = Query(TimeRange.LAST_7D, description="时间范围"),
    start_date: Optional[datetime] = Query(None, description="开始时间"),
    end_date: Optional[datetime] = Query(None, description="结束时间"),
    group_by: str = Query("day", pattern="^(day|week|month)$", description="分组方式"),
    current_user: dict = Depends(require_permission("reports:read"))
):
    """
    生成巡检汇总报告
    
    包含内容：
    - 巡检统计汇总
    - 成功率时序趋势
    - 检查项类型分布
    - 设备类型性能对比
    - 巡检频率分析
    """
    try:
        report = await analytics_service.generate_inspection_summary_report(
            time_range=time_range,
            start_date=start_date,
            end_date=end_date,
            group_by=group_by
        )
        
        logger.info("Inspection summary report generated",
                   time_range=time_range,
                   group_by=group_by,
                   inspection_count=report["summary"]["total_inspections"],
                   user_id=current_user["id"])
        
        return report
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Failed to generate inspection summary report",
                    time_range=time_range,
                    error=str(e))
        raise HTTPException(status_code=500, detail=f"生成巡检汇总报告失败: {str(e)}")

@router.post("/trend-analysis", summary="生成趋势分析报告")
async def generate_trend_analysis_report(
    request: TrendAnalysisRequest,
    current_user: dict = Depends(require_permission("reports:read"))
):
    """
    生成趋势分析报告
    
    包含内容：
    - 指标趋势分析
    - 异常检测
    - 相关性分析
    - 预测分析
    """
    try:
        if not request.metrics:
            raise HTTPException(status_code=400, detail="必须指定至少一个分析指标")
        
        # 验证指标名称
        valid_metrics = ["cpu_usage", "memory_usage", "response_time", "throughput", "error_rate"]
        invalid_metrics = [m for m in request.metrics if m not in valid_metrics]
        if invalid_metrics:
            raise HTTPException(
                status_code=400, 
                detail=f"不支持的指标: {', '.join(invalid_metrics)}. 支持的指标: {', '.join(valid_metrics)}"
            )
        
        report = await analytics_service.generate_trend_analysis_report(
            metrics=request.metrics,
            time_range=request.time_range,
            start_date=request.start_date,
            end_date=request.end_date,
            device_ids=request.device_ids
        )
        
        logger.info("Trend analysis report generated",
                   metrics=request.metrics,
                   time_range=request.time_range,
                   anomalies_count=report["summary"]["anomalies_detected"],
                   user_id=current_user["id"])
        
        return report
        
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Failed to generate trend analysis report",
                    metrics=request.metrics,
                    error=str(e))
        raise HTTPException(status_code=500, detail=f"生成趋势分析报告失败: {str(e)}")

@router.post("/performance-analysis", summary="生成性能分析报告")
async def generate_performance_analysis_report(
    request: PerformanceAnalysisRequest,
    current_user: dict = Depends(require_permission("reports:read"))
):
    """
    生成性能分析报告
    
    包含内容：
    - CPU使用率分析
    - 内存使用率分析
    - 接口状态分析
    - 响应时间分析
    - 性能评分和问题设备识别
    """
    try:
        # 验证设备类型
        if request.device_types:
            valid_types = ["switch", "router", "firewall", "server"]
            invalid_types = [t for t in request.device_types if t not in valid_types]
            if invalid_types:
                raise HTTPException(
                    status_code=400,
                    detail=f"不支持的设备类型: {', '.join(invalid_types)}. 支持的类型: {', '.join(valid_types)}"
                )
        
        report = await analytics_service.generate_performance_analysis_report(
            time_range=request.time_range,
            start_date=request.start_date,
            end_date=request.end_date,
            device_types=request.device_types
        )
        
        logger.info("Performance analysis report generated",
                   time_range=request.time_range,
                   devices_analyzed=report["summary"]["devices_analyzed"],
                   user_id=current_user["id"])
        
        return report
        
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Failed to generate performance analysis report",
                    time_range=request.time_range,
                    error=str(e))
        raise HTTPException(status_code=500, detail=f"生成性能分析报告失败: {str(e)}")

@router.post("/availability", summary="生成可用性报告")
async def generate_availability_report(
    request: AvailabilityReportRequest,
    current_user: dict = Depends(require_permission("reports:read"))
):
    """
    生成可用性报告
    
    包含内容：
    - 设备可用性统计
    - SLA达标分析
    - 停机事件分析
    - 可用性趋势
    - 可靠性指标（MTTR、MTBF）
    """
    try:
        if not (0 <= request.sla_threshold <= 100):
            raise HTTPException(status_code=400, detail="SLA阈值必须在0-100之间")
        
        report = await analytics_service.generate_availability_report(
            time_range=request.time_range,
            start_date=request.start_date,
            end_date=request.end_date,
            sla_threshold=request.sla_threshold
        )
        
        logger.info("Availability report generated",
                   time_range=request.time_range,
                   sla_threshold=request.sla_threshold,
                   devices_count=report["summary"]["total_devices"],
                   user_id=current_user["id"])
        
        return report
        
    except HTTPException:
        raise
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Failed to generate availability report",
                    time_range=request.time_range,
                    error=str(e))
        raise HTTPException(status_code=500, detail=f"生成可用性报告失败: {str(e)}")

@router.get("/metrics", summary="获取可用的分析指标")
async def get_available_metrics(
    current_user: dict = Depends(require_permission("reports:read"))
):
    """
    获取系统支持的所有分析指标
    """
    metrics = [
        {
            "name": "cpu_usage",
            "display_name": "CPU使用率",
            "unit": "%",
            "description": "设备CPU使用率百分比",
            "typical_range": "0-100"
        },
        {
            "name": "memory_usage", 
            "display_name": "内存使用率",
            "unit": "%",
            "description": "设备内存使用率百分比",
            "typical_range": "0-100"
        },
        {
            "name": "response_time",
            "display_name": "响应时间",
            "unit": "ms", 
            "description": "设备响应时间毫秒数",
            "typical_range": "1-1000"
        },
        {
            "name": "throughput",
            "display_name": "吞吐量",
            "unit": "Mbps",
            "description": "网络设备吞吐量",
            "typical_range": "0-10000"
        },
        {
            "name": "error_rate",
            "display_name": "错误率",
            "unit": "%",
            "description": "设备错误率百分比",
            "typical_range": "0-10"
        }
    ]
    
    logger.info("Retrieved available metrics",
               metrics_count=len(metrics),
               user_id=current_user["id"])
    
    return {
        "metrics": metrics,
        "total_count": len(metrics)
    }

@router.get("/time-ranges", summary="获取支持的时间范围")
async def get_supported_time_ranges(
    current_user: dict = Depends(require_permission("reports:read"))
):
    """
    获取报表分析支持的时间范围选项
    """
    time_ranges = [
        {
            "value": TimeRange.LAST_24H,
            "display_name": "最近24小时",
            "description": "过去24小时的数据"
        },
        {
            "value": TimeRange.LAST_7D,
            "display_name": "最近7天", 
            "description": "过去一周的数据"
        },
        {
            "value": TimeRange.LAST_30D,
            "display_name": "最近30天",
            "description": "过去一个月的数据"
        },
        {
            "value": TimeRange.LAST_90D,
            "display_name": "最近90天",
            "description": "过去三个月的数据"
        },
        {
            "value": TimeRange.LAST_YEAR,
            "display_name": "最近1年",
            "description": "过去一年的数据"
        },
        {
            "value": TimeRange.CUSTOM,
            "display_name": "自定义范围",
            "description": "指定开始和结束时间"
        }
    ]
    
    return {
        "time_ranges": time_ranges,
        "total_count": len(time_ranges),
        "default_range": TimeRange.LAST_30D
    }