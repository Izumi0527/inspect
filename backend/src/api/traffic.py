"""
流量分析API端点
提供网络流量分析和异常检测功能
"""
from fastapi import APIRouter, HTTPException, Depends, Query, BackgroundTasks
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
import structlog

from src.core.permissions import (
    get_current_active_user, 
    require_permission
)
from src.services.traffic_analysis import traffic_analyzer, TrafficAnomaly

logger = structlog.get_logger()
router = APIRouter()

# 请求/响应模型
class TrafficAnalysisRequest(BaseModel):
    device_ips: List[str]
    analysis_period_hours: int = 24
    enable_anomaly_detection: bool = True

class TrafficMetricsResponse(BaseModel):
    timestamp: datetime
    device_ip: str
    interface: str
    bytes_in: int
    bytes_out: int
    packets_in: int
    packets_out: int
    bandwidth_utilization: float
    errors: int
    discards: int

class TrafficAnomalyResponse(BaseModel):
    timestamp: datetime
    device_ip: str
    interface: str
    anomaly_type: str
    severity: str
    description: str
    baseline_value: float
    current_value: float
    confidence: float
    metadata: Dict[str, Any]

class TrafficTrendResponse(BaseModel):
    device_ip: str
    interface: str
    current_in: float
    current_out: float
    current_utilization: float
    trend_in: float
    trend_out: float
    trend_utilization: float
    avg_in: float
    avg_out: float
    avg_utilization: float
    peak_in: float
    peak_out: float
    peak_utilization: float

class TrafficSummaryResponse(BaseModel):
    total_devices: int
    total_interfaces: int
    active_anomalies: int
    baseline_patterns: int
    devices: Dict[str, Any]

# ============= 流量分析端点 =============

@router.post("/collect", summary="采集设备流量数据")
async def collect_traffic_data(
    device_ip: str = Query(..., description="设备IP地址"),
    current_user: dict = Depends(require_permission("traffic:read"))
):
    """
    采集指定设备的流量数据
    """
    try:
        traffic_data = await traffic_analyzer.collect_traffic_data(device_ip)
        
        response = [
            TrafficMetricsResponse(
                timestamp=metric.timestamp,
                device_ip=metric.device_ip,
                interface=metric.interface,
                bytes_in=metric.bytes_in,
                bytes_out=metric.bytes_out,
                packets_in=metric.packets_in,
                packets_out=metric.packets_out,
                bandwidth_utilization=metric.bandwidth_utilization,
                errors=metric.errors,
                discards=metric.discards
            ) for metric in traffic_data
        ]
        
        logger.info("Traffic data collected via API",
                   device_ip=device_ip,
                   metrics_count=len(response),
                   user_id=current_user["id"])
        
        return {
            "success": True,
            "device_ip": device_ip,
            "metrics": response,
            "collected_at": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error("Failed to collect traffic data via API",
                    device_ip=device_ip,
                    error=str(e))
        raise HTTPException(status_code=500, detail=f"流量数据采集失败: {str(e)}")

@router.get("/anomalies", summary="获取流量异常")
async def get_traffic_anomalies(
    device_ip: Optional[str] = Query(None, description="设备IP过滤"),
    severity: Optional[str] = Query(None, description="严重程度过滤"),
    hours: int = Query(24, ge=1, le=168, description="查询时间范围（小时）"),
    current_user: dict = Depends(require_permission("traffic:read"))
):
    """
    获取流量异常列表
    """
    try:
        # 先采集最新数据进行分析
        if device_ip:
            traffic_data = await traffic_analyzer.collect_traffic_data(device_ip)
            anomalies = traffic_analyzer.detect_anomalies(traffic_data)
        else:
            # 如果没有指定设备，分析所有设备的流量
            all_anomalies = []
            for device_key in traffic_analyzer.traffic_history.keys():
                # 提取设备IP
                recent_data = list(traffic_analyzer.traffic_history[device_key])[-1:]
                if recent_data:
                    device_anomalies = traffic_analyzer.detect_anomalies(recent_data)
                    all_anomalies.extend(device_anomalies)
            anomalies = all_anomalies
        
        # 应用过滤条件
        if severity:
            anomalies = [a for a in anomalies if a.severity == severity]
        
        # 转换为响应格式
        response = [
            TrafficAnomalyResponse(
                timestamp=anomaly.timestamp,
                device_ip=anomaly.device_ip,
                interface=anomaly.interface,
                anomaly_type=anomaly.anomaly_type,
                severity=anomaly.severity,
                description=anomaly.description,
                baseline_value=anomaly.baseline_value,
                current_value=anomaly.current_value,
                confidence=anomaly.confidence,
                metadata=anomaly.metadata
            ) for anomaly in anomalies
        ]
        
        logger.info("Traffic anomalies retrieved",
                   device_ip=device_ip,
                   anomalies_count=len(response),
                   severity_filter=severity,
                   user_id=current_user["id"])
        
        return {
            "success": True,
            "anomalies": response,
            "total_count": len(response),
            "query_params": {
                "device_ip": device_ip,
                "severity": severity,
                "hours": hours
            },
            "timestamp": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error("Failed to get traffic anomalies",
                    device_ip=device_ip,
                    error=str(e))
        raise HTTPException(status_code=500, detail=f"获取流量异常失败: {str(e)}")

@router.get("/trends/{device_ip}", summary="获取设备流量趋势")
async def get_traffic_trends(
    device_ip: str,
    hours: int = Query(24, ge=1, le=168, description="分析时间范围（小时）"),
    current_user: dict = Depends(require_permission("traffic:read"))
):
    """
    获取指定设备的流量趋势分析
    """
    try:
        trends_data = await traffic_analyzer.analyze_traffic_trends(device_ip, hours)
        
        if "error" in trends_data:
            raise HTTPException(status_code=404, detail=trends_data["error"])
        
        # 转换接口趋势数据为响应格式
        interface_trends = []
        for interface, trend_data in trends_data.get("interfaces", {}).items():
            interface_trend = TrafficTrendResponse(
                device_ip=device_ip,
                interface=interface,
                current_in=trend_data["current_in"],
                current_out=trend_data["current_out"],
                current_utilization=trend_data["current_utilization"],
                trend_in=trend_data["trend_in"],
                trend_out=trend_data["trend_out"],
                trend_utilization=trend_data["trend_utilization"],
                avg_in=trend_data["avg_in"],
                avg_out=trend_data["avg_out"],
                avg_utilization=trend_data["avg_utilization"],
                peak_in=trend_data["peak_in"],
                peak_out=trend_data["peak_out"],
                peak_utilization=trend_data["peak_utilization"]
            )
            interface_trends.append(interface_trend)
        
        logger.info("Traffic trends retrieved",
                   device_ip=device_ip,
                   hours=hours,
                   interfaces_count=len(interface_trends),
                   user_id=current_user["id"])
        
        return {
            "success": True,
            "device_ip": device_ip,
            "analysis_period_hours": hours,
            "interface_trends": interface_trends,
            "total_samples": trends_data.get("total_samples", 0),
            "analysis_timestamp": trends_data.get("analysis_timestamp")
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get traffic trends",
                    device_ip=device_ip,
                    error=str(e))
        raise HTTPException(status_code=500, detail=f"获取流量趋势失败: {str(e)}")

@router.get("/summary", summary="获取流量汇总信息")
async def get_traffic_summary(
    device_ips: Optional[List[str]] = Query(None, description="设备IP列表"),
    current_user: dict = Depends(require_permission("traffic:read"))
):
    """
    获取流量监控汇总信息
    """
    try:
        summary_data = traffic_analyzer.get_traffic_summary(device_ips)
        
        if "error" in summary_data:
            raise HTTPException(status_code=500, detail=summary_data["error"])
        
        response = TrafficSummaryResponse(
            total_devices=summary_data["total_devices"],
            total_interfaces=summary_data["total_interfaces"],
            active_anomalies=summary_data["active_anomalies"],
            baseline_patterns=summary_data["baseline_patterns"],
            devices=summary_data["devices"]
        )
        
        logger.info("Traffic summary retrieved",
                   devices_count=response.total_devices,
                   interfaces_count=response.total_interfaces,
                   user_id=current_user["id"])
        
        return {
            "success": True,
            "summary": response,
            "timestamp": datetime.now().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get traffic summary", error=str(e))
        raise HTTPException(status_code=500, detail=f"获取流量汇总失败: {str(e)}")

@router.post("/baseline/calculate", summary="计算流量基线")
async def calculate_traffic_baseline(
    device_ip: str = Query(..., description="设备IP地址"),
    interface: str = Query(..., description="网络接口"),
    current_user: dict = Depends(require_permission("traffic:update"))
):
    """
    计算指定设备接口的流量基线模式
    """
    try:
        pattern = traffic_analyzer.calculate_baseline(device_ip, interface)
        
        if not pattern:
            raise HTTPException(
                status_code=404, 
                detail="无法计算基线模式，可能是数据不足或设备不存在"
            )
        
        logger.info("Traffic baseline calculated",
                   device_ip=device_ip,
                   interface=interface,
                   confidence=pattern.pattern_confidence,
                   user_id=current_user["id"])
        
        return {
            "success": True,
            "device_ip": pattern.device_ip,
            "interface": pattern.interface,
            "baseline": {
                "baseline_in": pattern.baseline_in,
                "baseline_out": pattern.baseline_out,
                "avg_utilization": pattern.avg_utilization,
                "peak_hours": pattern.peak_hours,
                "pattern_confidence": pattern.pattern_confidence
            },
            "calculated_at": datetime.now().isoformat()
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to calculate baseline",
                    device_ip=device_ip,
                    interface=interface,
                    error=str(e))
        raise HTTPException(status_code=500, detail=f"计算基线失败: {str(e)}")

@router.post("/monitoring/start", summary="开始流量监控")
async def start_traffic_monitoring(
    request: TrafficAnalysisRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(require_permission("traffic:update"))
):
    """
    开始对指定设备的流量监控和异常检测
    """
    try:
        # 添加后台任务进行持续监控
        background_tasks.add_task(
            _continuous_traffic_monitoring,
            request.device_ips,
            request.analysis_period_hours,
            request.enable_anomaly_detection
        )
        
        logger.info("Traffic monitoring started",
                   device_ips=request.device_ips,
                   period_hours=request.analysis_period_hours,
                   anomaly_detection=request.enable_anomaly_detection,
                   user_id=current_user["id"])
        
        return {
            "success": True,
            "message": "流量监控已启动",
            "monitoring_config": {
                "device_ips": request.device_ips,
                "analysis_period_hours": request.analysis_period_hours,
                "enable_anomaly_detection": request.enable_anomaly_detection
            },
            "started_at": datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error("Failed to start traffic monitoring",
                    device_ips=request.device_ips,
                    error=str(e))
        raise HTTPException(status_code=500, detail=f"启动流量监控失败: {str(e)}")

@router.delete("/data/cleanup", summary="清理历史流量数据")
async def cleanup_traffic_data(
    older_than_hours: int = Query(168, ge=1, le=8760, description="清理多少小时前的数据"),
    current_user: dict = Depends(require_permission("traffic:admin"))
):
    """
    清理历史流量数据（管理员权限）
    """
    try:
        # 实现数据清理逻辑
        cleanup_count = 0
        cutoff_time = datetime.now() - timedelta(hours=older_than_hours)
        
        for device_key in list(traffic_analyzer.traffic_history.keys()):
            original_count = len(traffic_analyzer.traffic_history[device_key])
            
            # 过滤掉过期数据
            traffic_analyzer.traffic_history[device_key] = deque([
                metric for metric in traffic_analyzer.traffic_history[device_key]
                if metric.timestamp >= cutoff_time
            ], maxlen=2000)
            
            cleaned_count = original_count - len(traffic_analyzer.traffic_history[device_key])
            cleanup_count += cleaned_count
        
        logger.info("Traffic data cleanup completed",
                   cleanup_count=cleanup_count,
                   older_than_hours=older_than_hours,
                   admin_user=current_user["id"])
        
        return {
            "success": True,
            "message": f"已清理 {cleanup_count} 条历史流量记录",
            "cleanup_count": cleanup_count,
            "cutoff_time": cutoff_time.isoformat()
        }
        
    except Exception as e:
        logger.error("Failed to cleanup traffic data",
                    error=str(e))
        raise HTTPException(status_code=500, detail=f"清理流量数据失败: {str(e)}")

# ============= 辅助函数 =============

async def _continuous_traffic_monitoring(
    device_ips: List[str], 
    period_hours: int, 
    enable_anomaly_detection: bool
):
    """
    持续流量监控后台任务
    """
    try:
        import asyncio
        
        # 监控循环
        for _ in range(period_hours * 6):  # 每10分钟采集一次
            for device_ip in device_ips:
                try:
                    # 采集流量数据
                    traffic_data = await traffic_analyzer.collect_traffic_data(device_ip)
                    
                    # 异常检测
                    if enable_anomaly_detection:
                        anomalies = traffic_analyzer.detect_anomalies(traffic_data)
                        if anomalies:
                            # 这里可以集成告警系统
                            logger.warning("Traffic anomalies detected in monitoring",
                                         device_ip=device_ip,
                                         anomalies_count=len(anomalies))
                    
                except Exception as e:
                    logger.error("Error in continuous monitoring",
                               device_ip=device_ip,
                               error=str(e))
            
            # 等待10分钟
            await asyncio.sleep(600)
            
    except Exception as e:
        logger.error("Continuous traffic monitoring failed", error=str(e))