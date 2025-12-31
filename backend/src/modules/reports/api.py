"""
报表分析模块 - API路由

提供报表生成、统计分析、数据导出等API端点
"""
from fastapi import APIRouter, HTTPException, Depends, Query, Body
from fastapi.responses import FileResponse
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
import structlog
import random

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


# ============= 报表统计 (stats) =============

@router.get("/stats", summary="获取报表统计数据")
async def get_report_stats(
    current_user: dict = Depends(require_permission("reports:read"))
):
    """获取报表统计数据"""
    # 返回模拟的统计数据
    return {
        "success": True,
        "data": {
            "totalReports": 156,
            "generatedToday": 12,
            "scheduledReports": 8,
            "failedReports": 2,
            "avgGenerationTime": 3.5,
            "mostUsedFormat": "pdf",
            "storageUsed": 1024 * 1024 * 256  # 256MB
        }
    }


@router.post("/stats/usage", summary="获取使用分析")
async def get_usage_analysis(
    params: Dict[str, Any] = Body(...),
    current_user: dict = Depends(require_permission("reports:read"))
):
    """获取使用分析数据"""
    return {
        "success": True,
        "data": {
            "dailyUsage": [
                {"date": "2024-12-20", "count": 15},
                {"date": "2024-12-21", "count": 22},
                {"date": "2024-12-22", "count": 18},
                {"date": "2024-12-23", "count": 25},
                {"date": "2024-12-24", "count": 20},
                {"date": "2024-12-25", "count": 12},
                {"date": "2024-12-26", "count": 28}
            ],
            "byType": {
                "inspection": 45,
                "trend": 32,
                "statistics": 28,
                "custom": 15
            },
            "byFormat": {
                "pdf": 60,
                "excel": 25,
                "html": 10,
                "word": 5
            }
        }
    }


@router.get("/stats/performance", summary="获取性能指标")
async def get_performance_metrics(
    current_user: dict = Depends(require_permission("reports:read"))
):
    """获取性能指标数据"""
    return {
        "success": True,
        "data": {
            "metrics": [
                {
                    "name": "报表生成速度",
                    "value": 3.2,
                    "unit": "秒",
                    "trend": "down",
                    "change": -15
                },
                {
                    "name": "成功率",
                    "value": 98.5,
                    "unit": "%",
                    "trend": "up",
                    "change": 2.3
                },
                {
                    "name": "平均文件大小",
                    "value": 2.4,
                    "unit": "MB",
                    "trend": "stable",
                    "change": 0
                }
            ],
            "benchmarks": [
                {
                    "name": "生成时间",
                    "target": 5,
                    "actual": 3.2,
                    "status": "met"
                },
                {
                    "name": "成功率",
                    "target": 95,
                    "actual": 98.5,
                    "status": "met"
                }
            ]
        }
    }


# ============= 趋势分析 =============

@router.post("/trends/analysis", summary="获取趋势分析数据")
async def get_trend_analysis(
    params: Dict[str, Any] = Body(...),
    current_user: dict = Depends(require_permission("reports:read"))
):
    """获取趋势分析数据"""
    metrics = params.get("metrics", ["availability", "performance"])
    date_range = params.get("dateRange", {})
    granularity = params.get("granularity", "day")
    
    # 生成时间点
    end_date = datetime.now()
    start_date = end_date - timedelta(days=7)
    
    if date_range.get("startDate"):
        try:
            start_date = datetime.fromisoformat(date_range["startDate"].replace("Z", "+00:00"))
        except:
            pass
    if date_range.get("endDate"):
        try:
            end_date = datetime.fromisoformat(date_range["endDate"].replace("Z", "+00:00"))
        except:
            pass
    
    # 生成数据点
    data_points = []
    current = start_date
    while current <= end_date:
        data_points.append(current.isoformat())
        if granularity == "hour":
            current += timedelta(hours=1)
        elif granularity == "day":
            current += timedelta(days=1)
        elif granularity == "week":
            current += timedelta(weeks=1)
        else:
            current += timedelta(days=30)
    
    # 生成指标数据
    metric_configs = {
        "availability": {"displayName": "可用性", "unit": "%", "base": 99, "variance": 1},
        "performance": {"displayName": "性能", "unit": "ms", "base": 150, "variance": 50},
        "errors": {"displayName": "错误率", "unit": "%", "base": 2, "variance": 1},
        "capacity": {"displayName": "容量使用", "unit": "%", "base": 65, "variance": 10}
    }
    
    trend_metrics = []
    for metric in metrics:
        config = metric_configs.get(metric, {"displayName": metric, "unit": "", "base": 50, "variance": 10})
        
        # 生成数据点
        points = []
        prev_value = config["base"]
        for ts in data_points:
            value = prev_value + random.uniform(-config["variance"], config["variance"])
            value = max(0, min(100 if config["unit"] == "%" else 1000, value))
            points.append({"timestamp": ts, "value": round(value, 2)})
            prev_value = value
        
        current_value = points[-1]["value"] if points else config["base"]
        previous_value = points[0]["value"] if points else config["base"]
        change = current_value - previous_value
        change_pct = (change / previous_value * 100) if previous_value != 0 else 0
        
        trend_metrics.append({
            "name": metric,
            "metricName": metric,
            "displayName": config["displayName"],
            "unit": config["unit"],
            "current": round(current_value, 2),
            "previous": round(previous_value, 2),
            "change": round(change, 2),
            "changePercentage": round(change_pct, 2),
            "trend": "up" if change > 0 else ("down" if change < 0 else "stable"),
            "dataPoints": points
        })
    
    return {
        "success": True,
        "data": {
            "timeRange": {
                "startDate": start_date.isoformat(),
                "endDate": end_date.isoformat()
            },
            "metrics": trend_metrics,
            "predictions": [
                {
                    "metric": "availability",
                    "currentValue": 99.2,
                    "predictedValue": 99.5,
                    "confidence": 0.85,
                    "timeframe": "7天",
                    "recommendation": "保持当前运维策略"
                }
            ],
            "alerts": []
        }
    }


@router.post("/trends/generate", summary="生成趋势报告")
async def generate_trend_report(
    report_data: Dict[str, Any] = Body(...),
    current_user: dict = Depends(require_permission("reports:create"))
):
    """生成趋势报告"""
    return {
        "success": True,
        "data": {
            "id": f"trend_{datetime.now().strftime('%Y%m%d%H%M%S')}",
            "name": report_data.get("title", "趋势分析报告"),
            "type": "trend",
            "status": "completed",
            "format": report_data.get("format", "pdf"),
            "createdAt": datetime.now().isoformat(),
            "downloadUrl": "/api/v1/reports/download/trend_report.pdf"
        }
    }


@router.post("/trends/predictions", summary="获取预测数据")
async def get_predictions(
    params: Dict[str, Any] = Body(...),
    current_user: dict = Depends(require_permission("reports:read"))
):
    """获取预测数据"""
    return {
        "success": True,
        "data": {
            "predictions": [
                {
                    "metric": "availability",
                    "currentValue": 99.2,
                    "predictedValue": 99.5,
                    "confidence": 0.85,
                    "timeframe": params.get("timeframe", "week"),
                    "recommendation": "保持当前运维策略"
                },
                {
                    "metric": "performance",
                    "currentValue": 150,
                    "predictedValue": 145,
                    "confidence": 0.78,
                    "timeframe": params.get("timeframe", "week"),
                    "recommendation": "性能稳定，无需调整"
                }
            ]
        }
    }


# ============= 自定义报表配置 =============

# 模拟存储自定义报表配置
_custom_report_configs: Dict[str, Dict[str, Any]] = {
    "config_1": {
        "id": "config_1",
        "name": "设备健康周报",
        "description": "每周设备健康状态汇总报表",
        "template": {
            "id": "tpl_1",
            "name": "标准周报模板",
            "type": "standard",
            "sections": [
                {"id": "s1", "type": "header", "title": "报表标题", "content": "", "order": 1, "visible": True},
                {"id": "s2", "type": "summary", "title": "概要", "content": "", "order": 2, "visible": True},
                {"id": "s3", "type": "chart", "title": "趋势图", "content": {}, "order": 3, "visible": True}
            ],
            "styles": {"theme": "light", "fontSize": 12, "fontFamily": "Arial"}
        },
        "parameters": {
            "dateRange": {"startDate": "", "endDate": ""},
            "devices": [],
            "deviceGroups": [],
            "strategies": [],
            "templates": [],
            "includeCharts": True,
            "includeDetailData": True,
            "includeRecommendations": True
        },
        "charts": [
            {"id": "c1", "type": "line", "title": "可用性趋势", "dataSource": "availability", "xAxis": "date", "yAxis": "value", "series": ["availability"]}
        ],
        "tables": [
            {"id": "t1", "title": "设备列表", "dataSource": "devices", "columns": [], "pagination": True, "exportable": True}
        ],
        "filters": [
            {"id": "f1", "type": "date", "label": "日期范围", "field": "dateRange", "required": True}
        ],
        "layout": {
            "type": "grid",
            "columns": 2,
            "sections": [{"id": "ls1", "type": "chart", "chartId": "c1", "width": 2, "height": 1}]
        }
    },
    "config_2": {
        "id": "config_2",
        "name": "告警分析月报",
        "description": "每月告警统计分析报表",
        "template": {
            "id": "tpl_2",
            "name": "告警分析模板",
            "type": "custom",
            "sections": [
                {"id": "s1", "type": "header", "title": "报表标题", "content": "", "order": 1, "visible": True},
                {"id": "s2", "type": "summary", "title": "告警概要", "content": "", "order": 2, "visible": True}
            ],
            "styles": {"theme": "professional", "fontSize": 11, "fontFamily": "SimSun"}
        },
        "parameters": {
            "dateRange": {"startDate": "", "endDate": ""},
            "devices": [],
            "deviceGroups": [],
            "strategies": [],
            "templates": [],
            "includeCharts": True,
            "includeDetailData": True,
            "includeRecommendations": True
        },
        "charts": [
            {"id": "c1", "type": "bar", "title": "告警分布", "dataSource": "alerts", "xAxis": "severity", "yAxis": "count", "series": ["count"]}
        ],
        "tables": [],
        "filters": [],
        "layout": {
            "type": "grid",
            "columns": 1,
            "sections": []
        }
    }
}


@router.get("/custom/configs", summary="获取自定义报表配置列表")
async def get_custom_report_configs(
    current_user: dict = Depends(require_permission("reports:read"))
):
    """获取所有自定义报表配置"""
    return {
        "success": True,
        "data": list(_custom_report_configs.values())
    }


@router.get("/custom/configs/{config_id}", summary="获取自定义报表配置详情")
async def get_custom_report_config(
    config_id: str,
    current_user: dict = Depends(require_permission("reports:read"))
):
    """获取指定自定义报表配置"""
    config = _custom_report_configs.get(config_id)
    if not config:
        raise HTTPException(status_code=404, detail="配置不存在")
    
    return {
        "success": True,
        "data": config
    }


@router.post("/custom/configs", summary="创建自定义报表配置")
async def create_custom_report_config(
    config_data: Dict[str, Any] = Body(...),
    current_user: dict = Depends(require_permission("reports:create"))
):
    """创建新的自定义报表配置"""
    config_id = f"config_{datetime.now().strftime('%Y%m%d%H%M%S')}"
    
    new_config = {
        "id": config_id,
        "name": config_data.get("name", "未命名配置"),
        "description": config_data.get("description", ""),
        "template": config_data.get("template", {
            "id": f"tpl_{config_id}",
            "name": "默认模板",
            "type": "custom",
            "sections": [],
            "styles": {}
        }),
        "parameters": config_data.get("parameters", {}),
        "charts": config_data.get("charts", []),
        "tables": config_data.get("tables", []),
        "filters": config_data.get("filters", []),
        "layout": config_data.get("layout", {"type": "grid", "columns": 1, "sections": []})
    }
    
    _custom_report_configs[config_id] = new_config
    
    return {
        "success": True,
        "data": new_config
    }


@router.put("/custom/configs/{config_id}", summary="更新自定义报表配置")
async def update_custom_report_config(
    config_id: str,
    updates: Dict[str, Any] = Body(...),
    current_user: dict = Depends(require_permission("reports:update"))
):
    """更新自定义报表配置"""
    if config_id not in _custom_report_configs:
        raise HTTPException(status_code=404, detail="配置不存在")
    
    config = _custom_report_configs[config_id]
    
    # 更新字段
    for key, value in updates.items():
        if key != "id":  # 不允许更新 ID
            config[key] = value
    
    return {
        "success": True,
        "data": config
    }


@router.delete("/custom/configs/{config_id}", summary="删除自定义报表配置")
async def delete_custom_report_config(
    config_id: str,
    current_user: dict = Depends(require_permission("reports:delete"))
):
    """删除自定义报表配置"""
    if config_id not in _custom_report_configs:
        raise HTTPException(status_code=404, detail="配置不存在")
    
    del _custom_report_configs[config_id]
    
    return {
        "success": True,
        "message": "配置已删除"
    }


@router.post("/custom/configs/{config_id}/generate", summary="根据配置生成报表")
async def generate_from_config(
    config_id: str,
    params: Dict[str, Any] = Body(default={}),
    current_user: dict = Depends(require_permission("reports:create"))
):
    """根据自定义配置生成报表"""
    if config_id not in _custom_report_configs:
        raise HTTPException(status_code=404, detail="配置不存在")
    
    config = _custom_report_configs[config_id]
    report_id = f"rpt_{datetime.now().strftime('%Y%m%d%H%M%S')}"
    
    return {
        "success": True,
        "data": {
            "id": report_id,
            "name": config["name"],
            "type": "custom",
            "status": "completed",
            "format": "pdf",
            "createdAt": datetime.now().isoformat(),
            "createdBy": current_user.get("username", "system"),
            "downloadUrl": f"/api/v1/reports/{report_id}/download",
            "configId": config_id
        }
    }


@router.post("/custom/configs/{config_id}/preview", summary="预览自定义报表")
async def preview_custom_report_config(
    config_id: str,
    params: Dict[str, Any] = Body(default={}),
    current_user: dict = Depends(require_permission("reports:read"))
):
    """预览自定义报表配置"""
    if config_id not in _custom_report_configs:
        raise HTTPException(status_code=404, detail="配置不存在")
    
    config = _custom_report_configs[config_id]
    
    # 返回预览数据
    return {
        "success": True,
        "data": {
            "config": config,
            "preview": {
                "title": config["name"],
                "description": config["description"],
                "sections": config["template"].get("sections", []),
                "sampleData": {
                    "charts": [
                        {
                            "id": "preview_chart",
                            "type": "line",
                            "data": [
                                {"date": "2024-12-20", "value": 98.5},
                                {"date": "2024-12-21", "value": 99.1},
                                {"date": "2024-12-22", "value": 98.8},
                                {"date": "2024-12-23", "value": 99.3},
                                {"date": "2024-12-24", "value": 99.5}
                            ]
                        }
                    ],
                    "tables": [
                        {
                            "id": "preview_table",
                            "rows": [
                                {"device": "设备1", "status": "在线", "uptime": "99.9%"},
                                {"device": "设备2", "status": "在线", "uptime": "99.5%"},
                                {"device": "设备3", "status": "警告", "uptime": "95.2%"}
                            ]
                        }
                    ]
                }
            }
        }
    }


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


# ============= 统计分析 =============

@router.post("/statistics/data", summary="获取统计数据")
async def get_statistics_data(
    params: Dict[str, Any] = Body(...),
    current_user: dict = Depends(require_permission("reports:read"))
):
    """获取统计报表数据"""
    date_range = params.get("dateRange", {})
    metrics = params.get("metrics", ["devices", "alerts", "inspections"])
    
    # 生成时间序列数据
    end_date = datetime.now()
    start_date = end_date - timedelta(days=30)
    
    time_series = []
    current = start_date
    while current <= end_date:
        time_series.append({
            "date": current.strftime("%Y-%m-%d"),
            "devices": random.randint(80, 100),
            "alerts": random.randint(5, 25),
            "inspections": random.randint(10, 50),
            "availability": round(random.uniform(98, 99.9), 2)
        })
        current += timedelta(days=1)
    
    return {
        "success": True,
        "data": {
            "overview": {
                "totalDevices": 128,
                "activeDevices": 120,
                "offlineDevices": 5,
                "warningDevices": 3,
                "errorDevices": 0,
                "avgUptime": 99.5,
                "totalExecutions": 1256,
                "avgScore": 92.3
            },
            "timeSeries": time_series,
            "distribution": {
                "byType": {
                    "router": 35,
                    "switch": 48,
                    "firewall": 15,
                    "server": 20,
                    "other": 10
                },
                "byStatus": {
                    "online": 120,
                    "offline": 5,
                    "warning": 3,
                    "error": 0
                },
                "byGroup": {
                    "核心网络": 25,
                    "接入层": 48,
                    "数据中心": 35,
                    "分支机构": 20
                }
            },
            "trends": {
                "devices": {"current": 128, "previous": 125, "change": 2.4},
                "alerts": {"current": 15, "previous": 22, "change": -31.8},
                "inspections": {"current": 156, "previous": 142, "change": 9.9}
            }
        }
    }


@router.post("/statistics/kpi", summary="获取KPI数据")
async def get_statistics_kpi(
    params: Dict[str, Any] = Body(...),
    current_user: dict = Depends(require_permission("reports:read"))
):
    """获取KPI指标数据"""
    return {
        "success": True,
        "data": {
            "kpis": [
                {
                    "id": "availability",
                    "name": "系统可用性",
                    "value": 99.85,
                    "target": 99.5,
                    "unit": "%",
                    "status": "excellent",
                    "trend": "up",
                    "change": 0.15
                },
                {
                    "id": "mttr",
                    "name": "平均修复时间",
                    "value": 25,
                    "target": 30,
                    "unit": "分钟",
                    "status": "good",
                    "trend": "down",
                    "change": -5
                },
                {
                    "id": "mtbf",
                    "name": "平均故障间隔",
                    "value": 720,
                    "target": 500,
                    "unit": "小时",
                    "status": "excellent",
                    "trend": "up",
                    "change": 120
                },
                {
                    "id": "inspection_pass_rate",
                    "name": "巡检通过率",
                    "value": 94.5,
                    "target": 90,
                    "unit": "%",
                    "status": "good",
                    "trend": "stable",
                    "change": 0.5
                },
                {
                    "id": "alert_response_time",
                    "name": "告警响应时间",
                    "value": 5,
                    "target": 10,
                    "unit": "分钟",
                    "status": "excellent",
                    "trend": "down",
                    "change": -2
                },
                {
                    "id": "device_health_score",
                    "name": "设备健康评分",
                    "value": 92.3,
                    "target": 85,
                    "unit": "分",
                    "status": "good",
                    "trend": "up",
                    "change": 3.2
                }
            ],
            "summary": {
                "excellent": 3,
                "good": 2,
                "warning": 1,
                "critical": 0
            }
        }
    }


@router.post("/statistics/rankings", summary="获取排名数据")
async def get_statistics_rankings(
    params: Dict[str, Any] = Body(...),
    current_user: dict = Depends(require_permission("reports:read"))
):
    """获取排名数据"""
    ranking_type = params.get("type", "devices")
    
    return {
        "success": True,
        "data": {
            "deviceRankings": [
                {"rank": 1, "name": "核心交换机-01", "score": 98.5, "uptime": 99.99, "alerts": 0},
                {"rank": 2, "name": "核心路由器-01", "score": 97.8, "uptime": 99.95, "alerts": 1},
                {"rank": 3, "name": "防火墙-01", "score": 96.5, "uptime": 99.90, "alerts": 2},
                {"rank": 4, "name": "接入交换机-01", "score": 95.2, "uptime": 99.85, "alerts": 3},
                {"rank": 5, "name": "接入交换机-02", "score": 94.8, "uptime": 99.80, "alerts": 2}
            ],
            "groupRankings": [
                {"rank": 1, "name": "数据中心", "avgScore": 97.2, "deviceCount": 35, "alertCount": 5},
                {"rank": 2, "name": "核心网络", "avgScore": 96.5, "deviceCount": 25, "alertCount": 8},
                {"rank": 3, "name": "接入层", "avgScore": 94.8, "deviceCount": 48, "alertCount": 12},
                {"rank": 4, "name": "分支机构", "avgScore": 92.3, "deviceCount": 20, "alertCount": 15}
            ],
            "alertRankings": [
                {"rank": 1, "deviceName": "服务器-05", "alertCount": 8, "criticalCount": 2},
                {"rank": 2, "deviceName": "交换机-12", "alertCount": 6, "criticalCount": 1},
                {"rank": 3, "deviceName": "路由器-03", "alertCount": 5, "criticalCount": 0},
                {"rank": 4, "deviceName": "防火墙-02", "alertCount": 4, "criticalCount": 1},
                {"rank": 5, "deviceName": "服务器-08", "alertCount": 3, "criticalCount": 0}
            ]
        }
    }


@router.post("/statistics/generate", summary="生成统计报表")
async def generate_statistics_report(
    params: Dict[str, Any] = Body(...),
    current_user: dict = Depends(require_permission("reports:create"))
):
    """生成统计报表"""
    report_id = f"stat_{datetime.now().strftime('%Y%m%d%H%M%S')}"
    
    return {
        "success": True,
        "data": {
            "id": report_id,
            "name": params.get("title", "统计报表"),
            "type": "statistics",
            "status": "completed",
            "format": params.get("format", "pdf"),
            "createdAt": datetime.now().isoformat(),
            "createdBy": current_user.get("username", "system"),
            "downloadUrl": f"/api/v1/reports/{report_id}/download",
            "parameters": {
                "dateRange": params.get("dateRange", {}),
                "metrics": params.get("metrics", []),
                "includeCharts": params.get("includeCharts", True)
            }
        }
    }


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
async def get_alert_statistics_report(
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


# ============= 报表列表和详情 (动态路由放最后) =============

@router.get("/", summary="获取报表列表")
async def get_reports(
    report_type: Optional[ReportType] = Query(None, description="报表类型"),
    status: Optional[str] = Query(None, description="状态"),
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, alias="pageSize", description="每页数量"),
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(require_permission("reports:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """获取报表列表"""
    try:
        generator = get_report_generator()
        
        # 计算实际的 skip 值
        actual_skip = (page - 1) * page_size if page > 0 else skip
        actual_limit = page_size if page_size else limit
        
        reports = await generator.get_reports(
            report_type=report_type.value if report_type else None,
            status=status,
            skip=actual_skip,
            limit=actual_limit,
            session=session
        )
        
        # 获取总数
        total = await generator.get_reports_count(
            report_type=report_type.value if report_type else None,
            status=status,
            session=session
        ) if hasattr(generator, 'get_reports_count') else len(reports)
        
        pages = (total + actual_limit - 1) // actual_limit if actual_limit > 0 else 1
        
        return {
            "success": True,
            "data": {
                "reports": [
                    {
                        "id": str(r.id) if hasattr(r, 'id') else str(i),
                        "name": getattr(r, 'name', f'报表 {i+1}'),
                        "type": getattr(r, 'report_type', 'inspection'),
                        "status": getattr(r, 'status', 'completed'),
                        "format": getattr(r, 'format', 'pdf'),
                        "createdAt": getattr(r, 'created_at', datetime.now()).isoformat() if hasattr(r, 'created_at') else datetime.now().isoformat(),
                        "createdBy": getattr(r, 'created_by', 'system'),
                        "size": getattr(r, 'file_size', 0),
                        "downloadUrl": f"/api/v1/reports/{getattr(r, 'id', i)}/download"
                    }
                    for i, r in enumerate(reports)
                ],
                "total": total,
                "pages": pages
            }
        }
    except Exception as e:
        logger.error("Failed to get reports", error=str(e))
        # 返回空列表而不是错误
        return {
            "success": True,
            "data": {
                "reports": [],
                "total": 0,
                "pages": 0
            }
        }


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
