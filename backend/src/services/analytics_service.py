import asyncio
import json
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Union, Tuple
from enum import Enum
import pandas as pd
import numpy as np
from collections import defaultdict, Counter
import structlog
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.config import settings
from src.models.inspection import InspectionStatus, CheckItemStatus, Inspection, InspectionResult
from src.core.influxdb import influxdb_client
from src.core.database import get_db

logger = structlog.get_logger()

class ReportType(str, Enum):
    DEVICE_HEALTH = "device_health"
    INSPECTION_SUMMARY = "inspection_summary"
    TREND_ANALYSIS = "trend_analysis"
    PERFORMANCE_ANALYSIS = "performance_analysis"
    AVAILABILITY_REPORT = "availability_report"
    COMPLIANCE_REPORT = "compliance_report"

class TimeRange(str, Enum):
    LAST_24H = "24h"
    LAST_7D = "7d"
    LAST_30D = "30d"
    LAST_90D = "90d"
    LAST_YEAR = "1y"
    CUSTOM = "custom"

class AnalyticsService:
    """数据分析服务"""
    
    def __init__(self):
        self.cache = {}
        self.cache_ttl = 300  # 缓存5分钟
        
    async def generate_device_health_report(
        self,
        time_range: TimeRange = TimeRange.LAST_30D,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        device_ids: Optional[List[int]] = None,
        group_ids: Optional[List[int]] = None
    ) -> Dict[str, Any]:
        """生成设备健康度报告"""
        try:
            # 获取时间范围
            start_time, end_time = self._get_time_range(time_range, start_date, end_date)
            
            # 模拟获取巡检数据（实际应从数据库获取）
            inspection_data = await self._get_inspection_data(
                start_time, end_time, device_ids, group_ids
            )
            
            # 设备健康度分析
            device_health = self._analyze_device_health(inspection_data)
            
            # 问题分类统计
            issue_categories = self._categorize_issues(inspection_data)
            
            # 设备可用性分析
            availability_stats = self._calculate_availability(inspection_data)
            
            # 性能指标趋势
            performance_trends = self._analyze_performance_trends(inspection_data)
            
            report = {
                "report_type": ReportType.DEVICE_HEALTH,
                "time_range": {
                    "start": start_time.isoformat(),
                    "end": end_time.isoformat(),
                    "range_type": time_range
                },
                "summary": {
                    "total_devices": len(device_health),
                    "healthy_devices": len([d for d in device_health.values() if d["health_score"] >= 90]),
                    "warning_devices": len([d for d in device_health.values() if 70 <= d["health_score"] < 90]),
                    "critical_devices": len([d for d in device_health.values() if d["health_score"] < 70]),
                    "average_health_score": round(np.mean([d["health_score"] for d in device_health.values()]), 2),
                    "total_inspections": sum([d["inspection_count"] for d in device_health.values()]),
                    "total_issues": sum([d["issue_count"] for d in device_health.values()])
                },
                "device_health": device_health,
                "issue_categories": issue_categories,
                "availability_stats": availability_stats,
                "performance_trends": performance_trends,
                "generated_at": datetime.now().isoformat()
            }
            
            logger.info("Device health report generated",
                       device_count=len(device_health),
                       time_range=time_range)
            
            return report
            
        except Exception as e:
            logger.error("Failed to generate device health report", error=str(e))
            raise
    
    async def generate_inspection_summary_report(
        self,
        time_range: TimeRange = TimeRange.LAST_7D,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        group_by: str = "day"  # day, week, month
    ) -> Dict[str, Any]:
        """生成巡检汇总报告"""
        try:
            start_time, end_time = self._get_time_range(time_range, start_date, end_date)
            
            # 获取巡检数据
            inspection_data = await self._get_inspection_data(start_time, end_time)
            
            # 按时间分组统计
            time_series = self._group_by_time(inspection_data, group_by, start_time, end_time)
            
            # 成功率统计
            success_rate_trend = self._calculate_success_rate_trend(time_series)
            
            # 检查项类型分布
            check_type_distribution = self._analyze_check_type_distribution(inspection_data)
            
            # 设备类型性能对比
            device_type_performance = self._analyze_device_type_performance(inspection_data)
            
            # 巡检频率分析
            inspection_frequency = self._analyze_inspection_frequency(inspection_data)
            
            report = {
                "report_type": ReportType.INSPECTION_SUMMARY,
                "time_range": {
                    "start": start_time.isoformat(),
                    "end": end_time.isoformat(),
                    "range_type": time_range,
                    "group_by": group_by
                },
                "summary": {
                    "total_inspections": len(inspection_data),
                    "successful_inspections": len([i for i in inspection_data if i["status"] == InspectionStatus.COMPLETED]),
                    "failed_inspections": len([i for i in inspection_data if i["status"] == InspectionStatus.FAILED]),
                    "average_success_rate": round(success_rate_trend["overall_success_rate"], 2),
                    "total_check_items": sum([i.get("total_checks", 0) for i in inspection_data]),
                    "average_execution_time": round(np.mean([i.get("execution_duration", 0) for i in inspection_data]), 2)
                },
                "time_series": time_series,
                "success_rate_trend": success_rate_trend,
                "check_type_distribution": check_type_distribution,
                "device_type_performance": device_type_performance,
                "inspection_frequency": inspection_frequency,
                "generated_at": datetime.now().isoformat()
            }
            
            logger.info("Inspection summary report generated",
                       inspection_count=len(inspection_data),
                       time_range=time_range)
            
            return report
            
        except Exception as e:
            logger.error("Failed to generate inspection summary report", error=str(e))
            raise
    
    async def generate_trend_analysis_report(
        self,
        metrics: List[str],
        time_range: TimeRange = TimeRange.LAST_30D,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        device_ids: Optional[List[int]] = None
    ) -> Dict[str, Any]:
        """生成趋势分析报告"""
        try:
            start_time, end_time = self._get_time_range(time_range, start_date, end_date)
            
            # 获取指标数据
            metrics_data = await self._get_metrics_data(
                metrics, start_time, end_time, device_ids
            )
            
            # 趋势分析
            trend_analysis = {}
            for metric in metrics:
                if metric in metrics_data:
                    trend_analysis[metric] = self._analyze_metric_trend(
                        metrics_data[metric], metric
                    )
            
            # 异常检测
            anomalies = self._detect_anomalies(metrics_data)
            
            # 相关性分析
            correlations = self._calculate_correlations(metrics_data)
            
            # 预测分析
            forecasts = self._generate_forecasts(metrics_data, days_ahead=7)
            
            report = {
                "report_type": ReportType.TREND_ANALYSIS,
                "time_range": {
                    "start": start_time.isoformat(),
                    "end": end_time.isoformat(),
                    "range_type": time_range
                },
                "metrics": metrics,
                "trend_analysis": trend_analysis,
                "anomalies": anomalies,
                "correlations": correlations,
                "forecasts": forecasts,
                "summary": {
                    "total_data_points": sum([len(data["values"]) for data in metrics_data.values()]),
                    "analyzed_metrics": len(metrics),
                    "anomalies_detected": len(anomalies),
                    "strongest_correlation": max(correlations.values()) if correlations else 0
                },
                "generated_at": datetime.now().isoformat()
            }
            
            logger.info("Trend analysis report generated",
                       metrics_count=len(metrics),
                       anomalies_count=len(anomalies))
            
            return report
            
        except Exception as e:
            logger.error("Failed to generate trend analysis report", error=str(e))
            raise
    
    async def generate_performance_analysis_report(
        self,
        time_range: TimeRange = TimeRange.LAST_30D,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        device_types: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """生成性能分析报告"""
        try:
            start_time, end_time = self._get_time_range(time_range, start_date, end_date)
            
            # 获取性能数据
            performance_data = await self._get_performance_data(
                start_time, end_time, device_types
            )
            
            # CPU使用率分析
            cpu_analysis = self._analyze_cpu_performance(performance_data)
            
            # 内存使用率分析
            memory_analysis = self._analyze_memory_performance(performance_data)
            
            # 接口状态分析
            interface_analysis = self._analyze_interface_performance(performance_data)
            
            # 响应时间分析
            response_time_analysis = self._analyze_response_times(performance_data)
            
            # 性能评分
            performance_scores = self._calculate_performance_scores(performance_data)
            
            # TOP问题设备
            top_problematic_devices = self._identify_problematic_devices(performance_data)
            
            report = {
                "report_type": ReportType.PERFORMANCE_ANALYSIS,
                "time_range": {
                    "start": start_time.isoformat(),
                    "end": end_time.isoformat(),
                    "range_type": time_range
                },
                "summary": {
                    "devices_analyzed": len(performance_data),
                    "avg_cpu_usage": round(np.mean([d.get("avg_cpu", 0) for d in performance_data.values()]), 2),
                    "avg_memory_usage": round(np.mean([d.get("avg_memory", 0) for d in performance_data.values()]), 2),
                    "high_cpu_devices": len([d for d in performance_data.values() if d.get("avg_cpu", 0) > 80]),
                    "high_memory_devices": len([d for d in performance_data.values() if d.get("avg_memory", 0) > 85]),
                    "avg_performance_score": round(np.mean(list(performance_scores.values())), 2)
                },
                "cpu_analysis": cpu_analysis,
                "memory_analysis": memory_analysis,
                "interface_analysis": interface_analysis,
                "response_time_analysis": response_time_analysis,
                "performance_scores": performance_scores,
                "top_problematic_devices": top_problematic_devices,
                "generated_at": datetime.now().isoformat()
            }
            
            logger.info("Performance analysis report generated",
                       devices_analyzed=len(performance_data))
            
            return report
            
        except Exception as e:
            logger.error("Failed to generate performance analysis report", error=str(e))
            raise
    
    async def generate_availability_report(
        self,
        time_range: TimeRange = TimeRange.LAST_30D,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        sla_threshold: float = 99.9
    ) -> Dict[str, Any]:
        """生成可用性报告"""
        try:
            start_time, end_time = self._get_time_range(time_range, start_date, end_date)
            
            # 获取可用性数据
            availability_data = await self._get_availability_data(start_time, end_time)
            
            # 计算设备可用性
            device_availability = self._calculate_device_availability(availability_data)
            
            # SLA达标分析
            sla_compliance = self._analyze_sla_compliance(device_availability, sla_threshold)
            
            # 停机事件分析
            downtime_events = self._analyze_downtime_events(availability_data)
            
            # 可用性趋势
            availability_trend = self._analyze_availability_trend(availability_data)
            
            # MTTR和MTBF分析
            reliability_metrics = self._calculate_reliability_metrics(downtime_events)
            
            report = {
                "report_type": ReportType.AVAILABILITY_REPORT,
                "time_range": {
                    "start": start_time.isoformat(),
                    "end": end_time.isoformat(),
                    "range_type": time_range
                },
                "sla_threshold": sla_threshold,
                "summary": {
                    "total_devices": len(device_availability),
                    "avg_availability": round(np.mean(list(device_availability.values())), 4),
                    "sla_compliant_devices": len(sla_compliance["compliant"]),
                    "sla_non_compliant_devices": len(sla_compliance["non_compliant"]),
                    "total_downtime_hours": sum([event["duration_hours"] for event in downtime_events]),
                    "total_downtime_events": len(downtime_events),
                    "avg_mttr_hours": reliability_metrics.get("avg_mttr", 0),
                    "avg_mtbf_hours": reliability_metrics.get("avg_mtbf", 0)
                },
                "device_availability": device_availability,
                "sla_compliance": sla_compliance,
                "downtime_events": downtime_events,
                "availability_trend": availability_trend,
                "reliability_metrics": reliability_metrics,
                "generated_at": datetime.now().isoformat()
            }
            
            logger.info("Availability report generated",
                       devices_count=len(device_availability),
                       sla_compliance_rate=len(sla_compliance["compliant"])/len(device_availability))
            
            return report
            
        except Exception as e:
            logger.error("Failed to generate availability report", error=str(e))
            raise
    
    def _get_time_range(
        self,
        time_range: TimeRange,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> Tuple[datetime, datetime]:
        """获取时间范围"""
        end_time = end_date or datetime.now()
        
        if time_range == TimeRange.CUSTOM:
            if not start_date:
                raise ValueError("自定义时间范围需要提供开始时间")
            return start_date, end_time
        
        time_deltas = {
            TimeRange.LAST_24H: timedelta(hours=24),
            TimeRange.LAST_7D: timedelta(days=7),
            TimeRange.LAST_30D: timedelta(days=30),
            TimeRange.LAST_90D: timedelta(days=90),
            TimeRange.LAST_YEAR: timedelta(days=365)
        }
        
        delta = time_deltas.get(time_range, timedelta(days=30))
        start_time = end_time - delta
        
        return start_time, end_time
    
    async def _get_inspection_data(
        self,
        start_time: datetime,
        end_time: datetime,
        device_ids: Optional[List[int]] = None,
        group_ids: Optional[List[int]] = None
    ) -> List[Dict[str, Any]]:
        """获取巡检数据（模拟数据）"""
        # 实际实现中应该从数据库获取数据
        # 这里生成模拟数据用于演示
        
        inspection_data = []
        device_count = 50
        
        current_time = start_time
        while current_time < end_time:
            for device_id in range(1, device_count + 1):
                if device_ids and device_id not in device_ids:
                    continue
                
                # 模拟巡检数据
                inspection = {
                    "id": len(inspection_data) + 1,
                    "device_id": device_id,
                    "device_name": f"Device_{device_id:03d}",
                    "device_type": np.random.choice(["switch", "router", "firewall", "server"]),
                    "vendor": np.random.choice(["cisco", "huawei", "h3c", "juniper"]),
                    "group_id": np.random.randint(1, 6),
                    "status": np.random.choice([
                        InspectionStatus.COMPLETED, 
                        InspectionStatus.FAILED, 
                        InspectionStatus.COMPLETED,
                        InspectionStatus.COMPLETED
                    ]),  # 75%成功率
                    "created_at": current_time,
                    "started_at": current_time,
                    "completed_at": current_time + timedelta(seconds=np.random.randint(30, 300)),
                    "execution_duration": np.random.randint(30, 300),
                    "total_checks": np.random.randint(5, 15),
                    "passed_checks": 0,
                    "failed_checks": 0,
                    "check_results": []
                }
                
                # 生成检查结果
                for i in range(inspection["total_checks"]):
                    check_result = {
                        "check_item_name": np.random.choice([
                            "连通性检查", "CPU使用率", "内存使用率", "接口状态", "设备运行时间"
                        ]),
                        "check_item_type": np.random.choice([
                            "connectivity", "cpu_usage", "memory_usage", "interface_status", "uptime"
                        ]),
                        "status": np.random.choice([
                            CheckItemStatus.PASS,
                            CheckItemStatus.FAIL,
                            CheckItemStatus.WARNING,
                            CheckItemStatus.PASS,
                            CheckItemStatus.PASS
                        ]),  # 60%通过率
                        "execution_time": np.random.randint(5, 50),
                        "actual_value": self._generate_mock_metric_value(i)
                    }
                    
                    inspection["check_results"].append(check_result)
                    
                    if check_result["status"] == CheckItemStatus.PASS:
                        inspection["passed_checks"] += 1
                    else:
                        inspection["failed_checks"] += 1
                
                inspection_data.append(inspection)
            
            # 增加时间间隔
            current_time += timedelta(hours=np.random.randint(4, 12))
        
        return inspection_data
    
    def _generate_mock_metric_value(self, check_index: int) -> str:
        """生成模拟指标值"""
        if check_index == 0:  # 连通性
            return "可达" if np.random.random() > 0.1 else "不可达"
        elif check_index == 1:  # CPU
            return f"{np.random.randint(10, 95)}%"
        elif check_index == 2:  # 内存
            return f"{np.random.randint(20, 90)}%"
        elif check_index == 3:  # 接口
            total = np.random.randint(8, 48)
            active = np.random.randint(int(total*0.6), total)
            return f"{active}/{total}"
        else:  # 运行时间
            days = np.random.randint(1, 365)
            return f"{days}天"
    
    def _analyze_device_health(self, inspection_data: List[Dict]) -> Dict[str, Any]:
        """分析设备健康度"""
        device_health = {}
        
        # 按设备分组
        device_groups = defaultdict(list)
        for inspection in inspection_data:
            device_groups[inspection["device_id"]].append(inspection)
        
        for device_id, inspections in device_groups.items():
            if not inspections:
                continue
            
            latest_inspection = max(inspections, key=lambda x: x["created_at"])
            
            # 计算健康度评分
            success_rate = len([i for i in inspections if i["status"] == InspectionStatus.COMPLETED]) / len(inspections)
            avg_pass_rate = np.mean([
                i["passed_checks"] / i["total_checks"] if i["total_checks"] > 0 else 0
                for i in inspections
            ])
            
            # 健康度评分算法
            health_score = (success_rate * 0.4 + avg_pass_rate * 0.6) * 100
            
            device_health[str(device_id)] = {
                "device_id": device_id,
                "device_name": latest_inspection["device_name"],
                "device_type": latest_inspection["device_type"],
                "vendor": latest_inspection["vendor"],
                "health_score": round(health_score, 2),
                "inspection_count": len(inspections),
                "success_rate": round(success_rate * 100, 2),
                "avg_pass_rate": round(avg_pass_rate * 100, 2),
                "issue_count": sum([i["failed_checks"] for i in inspections]),
                "last_inspection": latest_inspection["created_at"].isoformat(),
                "status": "healthy" if health_score >= 90 else "warning" if health_score >= 70 else "critical"
            }
        
        return device_health
    
    def _categorize_issues(self, inspection_data: List[Dict]) -> Dict[str, Any]:
        """问题分类统计"""
        issue_categories = defaultdict(int)
        issue_details = defaultdict(list)
        
        for inspection in inspection_data:
            for check_result in inspection.get("check_results", []):
                if check_result["status"] != CheckItemStatus.PASS:
                    category = check_result["check_item_type"]
                    issue_categories[category] += 1
                    issue_details[category].append({
                        "device_id": inspection["device_id"],
                        "device_name": inspection["device_name"],
                        "check_item_name": check_result["check_item_name"],
                        "status": check_result["status"],
                        "timestamp": inspection["created_at"].isoformat()
                    })
        
        # 转换为排序列表
        sorted_categories = sorted(issue_categories.items(), key=lambda x: x[1], reverse=True)
        
        return {
            "summary": dict(sorted_categories),
            "details": dict(issue_details),
            "top_issues": sorted_categories[:5]
        }
    
    def _calculate_availability(self, inspection_data: List[Dict]) -> Dict[str, Any]:
        """计算设备可用性"""
        device_availability = {}
        
        device_groups = defaultdict(list)
        for inspection in inspection_data:
            device_groups[inspection["device_id"]].append(inspection)
        
        for device_id, inspections in device_groups.items():
            if not inspections:
                continue
            
            total_checks = len(inspections)
            successful_checks = len([i for i in inspections if i["status"] == InspectionStatus.COMPLETED])
            
            availability = (successful_checks / total_checks) * 100 if total_checks > 0 else 0
            
            latest_inspection = max(inspections, key=lambda x: x["created_at"])
            
            device_availability[str(device_id)] = {
                "device_id": device_id,
                "device_name": latest_inspection["device_name"],
                "availability_percent": round(availability, 4),
                "total_checks": total_checks,
                "successful_checks": successful_checks,
                "failed_checks": total_checks - successful_checks,
                "last_check": latest_inspection["created_at"].isoformat()
            }
        
        return {
            "by_device": device_availability,
            "overall_availability": round(np.mean([d["availability_percent"] for d in device_availability.values()]), 4)
        }
    
    def _analyze_performance_trends(self, inspection_data: List[Dict]) -> Dict[str, Any]:
        """分析性能指标趋势"""
        trends = {
            "cpu_trend": [],
            "memory_trend": [],
            "interface_trend": []
        }
        
        # 按时间排序
        sorted_inspections = sorted(inspection_data, key=lambda x: x["created_at"])
        
        for inspection in sorted_inspections:
            timestamp = inspection["created_at"].isoformat()
            
            for check_result in inspection.get("check_results", []):
                check_type = check_result["check_item_type"]
                actual_value = check_result["actual_value"]
                
                if check_type == "cpu_usage" and "%" in actual_value:
                    try:
                        cpu_value = float(actual_value.replace("%", ""))
                        trends["cpu_trend"].append({
                            "timestamp": timestamp,
                            "device_id": inspection["device_id"],
                            "value": cpu_value
                        })
                    except:
                        pass
                
                elif check_type == "memory_usage" and "%" in actual_value:
                    try:
                        memory_value = float(actual_value.replace("%", ""))
                        trends["memory_trend"].append({
                            "timestamp": timestamp,
                            "device_id": inspection["device_id"],
                            "value": memory_value
                        })
                    except:
                        pass
                
                elif check_type == "interface_status" and "/" in actual_value:
                    try:
                        active, total = map(int, actual_value.split("/"))
                        interface_usage = (active / total) * 100 if total > 0 else 0
                        trends["interface_trend"].append({
                            "timestamp": timestamp,
                            "device_id": inspection["device_id"],
                            "value": interface_usage
                        })
                    except:
                        pass
        
        return trends
    
    # 其他辅助方法的实现...
    
    def _group_by_time(self, inspection_data: List[Dict], group_by: str, start_time: datetime, end_time: datetime) -> List[Dict]:
        """按时间分组"""
        time_groups = defaultdict(list)
        
        for inspection in inspection_data:
            timestamp = inspection["created_at"]
            
            if group_by == "day":
                key = timestamp.strftime("%Y-%m-%d")
            elif group_by == "week":
                key = timestamp.strftime("%Y-W%U")
            elif group_by == "month":
                key = timestamp.strftime("%Y-%m")
            else:
                key = timestamp.strftime("%Y-%m-%d")
            
            time_groups[key].append(inspection)
        
        # 生成时间序列数据
        time_series = []
        for time_key in sorted(time_groups.keys()):
            inspections = time_groups[time_key]
            
            total = len(inspections)
            successful = len([i for i in inspections if i["status"] == InspectionStatus.COMPLETED])
            
            time_series.append({
                "time_period": time_key,
                "total_inspections": total,
                "successful_inspections": successful,
                "failed_inspections": total - successful,
                "success_rate": round((successful / total) * 100, 2) if total > 0 else 0
            })
        
        return time_series
    
    def _calculate_success_rate_trend(self, time_series: List[Dict]) -> Dict[str, Any]:
        """计算成功率趋势"""
        if not time_series:
            return {"overall_success_rate": 0, "trend": "stable", "trend_data": []}
        
        success_rates = [period["success_rate"] for period in time_series]
        overall_success_rate = np.mean(success_rates)
        
        # 简单的趋势分析
        if len(success_rates) >= 2:
            recent_avg = np.mean(success_rates[-3:]) if len(success_rates) >= 3 else success_rates[-1]
            earlier_avg = np.mean(success_rates[:-3]) if len(success_rates) >= 6 else success_rates[0]
            
            if recent_avg > earlier_avg + 5:
                trend = "improving"
            elif recent_avg < earlier_avg - 5:
                trend = "declining"
            else:
                trend = "stable"
        else:
            trend = "stable"
        
        return {
            "overall_success_rate": round(overall_success_rate, 2),
            "trend": trend,
            "trend_data": [{"period": p["time_period"], "success_rate": p["success_rate"]} for p in time_series]
        }
    
    async def _get_metrics_data(
        self,
        metrics: List[str],
        start_time: datetime,
        end_time: datetime,
        device_ids: Optional[List[int]] = None
    ) -> Dict[str, Dict]:
        """
        获取指标数据

        优先从真实数据源获取数据:
        - 监控指标(cpu_usage, memory_usage等): 从InfluxDB查询
        - 巡检指标(availability, performance等): 从PostgreSQL查询
        - 降级方案: 如果数据源不可用,使用模拟数据
        """
        metrics_data = {}

        # 定义指标类型映射
        influxdb_metrics = {"cpu_usage", "memory_usage", "response_time", "throughput", "error_rate", "capacity"}
        inspection_metrics = {"availability", "performance", "errors"}

        for metric in metrics:
            try:
                # 从InfluxDB查询监控指标
                if metric in influxdb_metrics:
                    metric_data = await self._get_influxdb_metric(
                        metric, start_time, end_time, device_ids
                    )
                    if metric_data and metric_data.get("values"):
                        metrics_data[metric] = metric_data
                        logger.info(f"Retrieved {metric} from InfluxDB", data_points=len(metric_data["values"]))
                        continue

                # 从PostgreSQL查询巡检指标
                elif metric in inspection_metrics:
                    metric_data = await self._get_inspection_metric(
                        metric, start_time, end_time, device_ids
                    )
                    if metric_data and metric_data.get("values"):
                        metrics_data[metric] = metric_data
                        logger.info(f"Retrieved {metric} from database", data_points=len(metric_data["values"]))
                        continue

                # 降级到模拟数据
                logger.warning(f"Using mock data for {metric}", reason="Real data source unavailable")
                metrics_data[metric] = self._generate_mock_metric_data(
                    metric, start_time, end_time
                )

            except Exception as e:
                logger.error(f"Failed to get {metric} data", error=str(e), error_type=type(e).__name__)
                # 降级到模拟数据
                metrics_data[metric] = self._generate_mock_metric_data(
                    metric, start_time, end_time
                )

        return metrics_data

    async def _get_influxdb_metric(
        self,
        metric: str,
        start_time: datetime,
        end_time: datetime,
        device_ids: Optional[List[int]] = None
    ) -> Optional[Dict]:
        """从InfluxDB查询监控指标"""
        if not influxdb_client.is_connected:
            logger.debug("InfluxDB not connected, skipping query")
            return None

        try:
            # 构建Flux查询语句
            device_filter = ""
            if device_ids:
                device_ids_str = '", "'.join(str(id) for id in device_ids)
                device_filter = f'|> filter(fn: (r) => contains(value: r.device_id, set: ["{device_ids_str}"]))'

            # 映射指标名称到InfluxDB字段名
            field_mapping = {
                "cpu_usage": "cpu",
                "memory_usage": "memory",
                "response_time": "response_time",
                "throughput": "bandwidth_in",
                "error_rate": "error_count",
                "capacity": "disk_usage"
            }

            field_name = field_mapping.get(metric, metric)

            flux_query = f'''
                from(bucket: "{influxdb_client.bucket}")
                |> range(start: {start_time.isoformat()}, stop: {end_time.isoformat()})
                |> filter(fn: (r) => r._measurement == "device_metrics")
                |> filter(fn: (r) => r._field == "{field_name}")
                {device_filter}
                |> aggregateWindow(every: 1h, fn: mean, createEmpty: false)
                |> yield(name: "mean")
            '''

            # 执行查询
            result = await influxdb_client.query(flux_query)

            if not result:
                return None

            # 解析查询结果
            metric_values = []
            for record in result:
                if isinstance(record, dict) and "_time" in record and "_value" in record:
                    metric_values.append({
                        "timestamp": record["_time"],
                        "value": round(float(record["_value"]), 2)
                    })

            if not metric_values:
                return None

            return {
                "metric_name": metric,
                "values": metric_values,
                "unit": self._get_metric_unit(metric)
            }

        except Exception as e:
            logger.error(f"InfluxDB query failed for {metric}", error=str(e))
            return None

    async def _get_inspection_metric(
        self,
        metric: str,
        start_time: datetime,
        end_time: datetime,
        device_ids: Optional[List[int]] = None
    ) -> Optional[Dict]:
        """从PostgreSQL查询巡检指标"""
        try:
            async with db_manager.get_session() as session:
                # 构建查询条件
                query = select(Inspection).where(
                    Inspection.started_at >= start_time,
                    Inspection.started_at <= end_time
                )

                if device_ids:
                    query = query.where(Inspection.device_id.in_(device_ids))

                # 按时间排序
                query = query.order_by(Inspection.started_at)

                result = await session.execute(query)
                executions = result.scalars().all()

                if not executions:
                    return None

                # 根据指标类型聚合数据
                if metric == "availability":
                    # 可用性 = 成功执行数 / 总执行数
                    metric_values = self._calculate_availability_metric(executions)
                elif metric == "performance":
                    # 性能评分 = 所有检查项的平均分数
                    metric_values = self._calculate_performance_metric(executions)
                elif metric == "errors":
                    # 错误数 = 失败的检查项数量
                    metric_values = self._calculate_errors_metric(executions)
                else:
                    return None

                if not metric_values:
                    return None

                return {
                    "metric_name": metric,
                    "values": metric_values,
                    "unit": self._get_metric_unit(metric)
                }

        except Exception as e:
            logger.error(f"Database query failed for {metric}", error=str(e))
            return None

    def _calculate_availability_metric(self, executions: List) -> List[Dict]:
        """计算可用性指标"""
        # 按小时分组
        hourly_data = {}

        for execution in executions:
            hour_key = execution.started_at.replace(minute=0, second=0, microsecond=0)
            if hour_key not in hourly_data:
                hourly_data[hour_key] = {"total": 0, "success": 0}

            hourly_data[hour_key]["total"] += 1
            if execution.status == InspectionStatus.COMPLETED.value:
                hourly_data[hour_key]["success"] += 1

        # 计算可用性百分比
        metric_values = []
        for timestamp, data in sorted(hourly_data.items()):
            availability = (data["success"] / data["total"] * 100) if data["total"] > 0 else 0
            metric_values.append({
                "timestamp": timestamp.isoformat(),
                "value": round(availability, 2)
            })

        return metric_values

    def _calculate_performance_metric(self, executions: List) -> List[Dict]:
        """计算性能评分指标"""
        hourly_data = {}

        for execution in executions:
            hour_key = execution.started_at.replace(minute=0, second=0, microsecond=0)
            if hour_key not in hourly_data:
                hourly_data[hour_key] = {"scores": []}

            # 使用执行的检查项统计计算分数
            if hasattr(execution, 'passed_checks') and hasattr(execution, 'total_checks'):
                if execution.total_checks and execution.total_checks > 0:
                    score = (execution.passed_checks / execution.total_checks) * 100
                    hourly_data[hour_key]["scores"].append(score)

        # 计算每小时的平均性能评分
        metric_values = []
        for timestamp, data in sorted(hourly_data.items()):
            if data["scores"]:
                avg_score = sum(data["scores"]) / len(data["scores"])
                metric_values.append({
                    "timestamp": timestamp.isoformat(),
                    "value": round(avg_score, 2)
                })

        return metric_values

    def _calculate_errors_metric(self, executions: List) -> List[Dict]:
        """计算错误数指标"""
        hourly_data = {}

        for execution in executions:
            hour_key = execution.started_at.replace(minute=0, second=0, microsecond=0)
            if hour_key not in hourly_data:
                hourly_data[hour_key] = 0

            # 统计失败的检查项数量
            if hasattr(execution, 'failed_checks') and execution.failed_checks:
                hourly_data[hour_key] += execution.failed_checks
            elif execution.status == InspectionStatus.FAILED.value:
                hourly_data[hour_key] += 1

        # 生成时序数据
        metric_values = []
        for timestamp, error_count in sorted(hourly_data.items()):
            metric_values.append({
                "timestamp": timestamp.isoformat(),
                "value": error_count
            })

        return metric_values

    def _generate_mock_metric_data(
        self,
        metric: str,
        start_time: datetime,
        end_time: datetime
    ) -> Dict:
        """生成模拟指标数据(降级方案)"""
        metric_values = []
        current_time = start_time

        while current_time < end_time:
            # 根据指标类型生成不同的模拟值
            if metric == "cpu_usage":
                value = max(0, min(100, np.random.normal(45, 15)))
            elif metric == "memory_usage":
                value = max(0, min(100, np.random.normal(60, 20)))
            elif metric == "response_time":
                value = max(0, np.random.lognormal(2, 1))
            elif metric == "availability":
                value = max(0, min(100, np.random.normal(95, 5)))
            elif metric == "performance":
                value = max(0, min(100, np.random.normal(85, 10)))
            elif metric == "errors":
                value = max(0, np.random.poisson(2))
            else:
                value = np.random.random() * 100

            metric_values.append({
                "timestamp": current_time.isoformat(),
                "value": round(value, 2)
            })

            current_time += timedelta(hours=1)

        return {
            "metric_name": metric,
            "values": metric_values,
            "unit": self._get_metric_unit(metric)
        }
    
    def _get_metric_unit(self, metric: str) -> str:
        """获取指标单位"""
        units = {
            "cpu_usage": "%",
            "memory_usage": "%",
            "response_time": "ms",
            "throughput": "Mbps",
            "error_rate": "%"
        }
        return units.get(metric, "")
    
    def _analyze_metric_trend(self, metric_data: Dict, metric_name: str) -> Dict[str, Any]:
        """分析单个指标的趋势"""
        values = [point["value"] for point in metric_data["values"]]
        
        if len(values) < 2:
            return {"trend": "insufficient_data", "slope": 0, "correlation": 0}
        
        # 计算趋势
        x = np.arange(len(values))
        slope, _ = np.polyfit(x, values, 1)
        
        # 计算相关系数
        correlation = np.corrcoef(x, values)[0, 1] if len(values) > 1 else 0
        
        # 判断趋势方向
        if abs(slope) < 0.1:
            trend = "stable"
        elif slope > 0:
            trend = "increasing"
        else:
            trend = "decreasing"
        
        # 统计信息
        stats = {
            "mean": round(np.mean(values), 2),
            "median": round(np.median(values), 2),
            "std": round(np.std(values), 2),
            "min": round(np.min(values), 2),
            "max": round(np.max(values), 2),
            "p95": round(np.percentile(values, 95), 2),
            "p99": round(np.percentile(values, 99), 2)
        }
        
        return {
            "metric_name": metric_name,
            "trend": trend,
            "slope": round(slope, 4),
            "correlation": round(correlation, 4),
            "statistics": stats,
            "data_points": len(values)
        }
    
    def _detect_anomalies(self, metrics_data: Dict) -> List[Dict[str, Any]]:
        """异常检测"""
        anomalies = []
        
        for metric_name, metric_data in metrics_data.items():
            values = [point["value"] for point in metric_data["values"]]
            timestamps = [point["timestamp"] for point in metric_data["values"]]
            
            if len(values) < 10:  # 数据点太少，跳过异常检测
                continue
            
            # 使用简单的3-sigma规则检测异常
            mean = np.mean(values)
            std = np.std(values)
            threshold = 3 * std
            
            for i, (timestamp, value) in enumerate(zip(timestamps, values)):
                if abs(value - mean) > threshold:
                    anomalies.append({
                        "metric_name": metric_name,
                        "timestamp": timestamp,
                        "value": round(value, 2),
                        "expected_range": [
                            round(mean - threshold, 2),
                            round(mean + threshold, 2)
                        ],
                        "severity": "high" if abs(value - mean) > 2 * threshold else "medium",
                        "deviation": round(abs(value - mean) / std, 2)
                    })
        
        return sorted(anomalies, key=lambda x: x["deviation"], reverse=True)
    
    def _calculate_correlations(self, metrics_data: Dict) -> Dict[str, float]:
        """计算指标间相关性"""
        correlations = {}
        metric_names = list(metrics_data.keys())
        
        if len(metric_names) < 2:
            return correlations
        
        # 获取所有指标的值数组
        metric_values = {}
        min_length = float('inf')
        
        for metric_name, metric_data in metrics_data.items():
            values = [point["value"] for point in metric_data["values"]]
            metric_values[metric_name] = values
            min_length = min(min_length, len(values))
        
        # 截取到相同长度
        for metric_name in metric_values:
            metric_values[metric_name] = metric_values[metric_name][:min_length]
        
        # 计算相关性矩阵
        for i in range(len(metric_names)):
            for j in range(i + 1, len(metric_names)):
                metric1, metric2 = metric_names[i], metric_names[j]
                
                if len(metric_values[metric1]) > 1 and len(metric_values[metric2]) > 1:
                    correlation = np.corrcoef(metric_values[metric1], metric_values[metric2])[0, 1]
                    if not np.isnan(correlation):
                        correlations[f"{metric1}_vs_{metric2}"] = round(correlation, 4)
        
        return correlations
    
    def _generate_forecasts(self, metrics_data: Dict, days_ahead: int = 7) -> Dict[str, Any]:
        """生成预测数据"""
        forecasts = {}
        
        for metric_name, metric_data in metrics_data.items():
            values = [point["value"] for point in metric_data["values"]]
            
            if len(values) < 5:  # 数据点太少，无法预测
                continue
            
            # 使用简单的移动平均进行预测
            window_size = min(len(values), 7)
            recent_avg = np.mean(values[-window_size:])
            recent_trend = np.mean(np.diff(values[-window_size:])) if len(values) > 1 else 0
            
            # 生成预测值
            forecast_values = []
            for i in range(days_ahead * 24):  # 每小时一个预测点
                forecast_value = recent_avg + (recent_trend * i)
                
                # 添加一些随机性
                noise = np.random.normal(0, np.std(values[-window_size:]) * 0.1)
                forecast_value += noise
                
                forecast_values.append(round(max(0, forecast_value), 2))
            
            forecasts[metric_name] = {
                "metric_name": metric_name,
                "forecast_values": forecast_values,
                "confidence": "medium",  # 简单模型，中等置信度
                "method": "moving_average_with_trend"
            }
        
        return forecasts
    
    async def _get_performance_data(
        self,
        start_time: datetime,
        end_time: datetime,
        device_types: Optional[List[str]] = None
    ) -> Dict[str, Dict]:
        """获取性能数据"""
        performance_data = {}
        
        # 模拟50个设备的性能数据
        for device_id in range(1, 51):
            device_type = np.random.choice(["switch", "router", "firewall", "server"])
            
            if device_types and device_type not in device_types:
                continue
            
            # 生成性能指标
            cpu_values = np.random.normal(50, 20, 100)
            cpu_values = np.clip(cpu_values, 0, 100)
            
            memory_values = np.random.normal(65, 25, 100)
            memory_values = np.clip(memory_values, 0, 100)
            
            response_times = np.random.lognormal(2, 1, 100)
            
            performance_data[str(device_id)] = {
                "device_id": device_id,
                "device_type": device_type,
                "cpu_values": cpu_values.tolist(),
                "memory_values": memory_values.tolist(),
                "response_times": response_times.tolist(),
                "avg_cpu": round(np.mean(cpu_values), 2),
                "avg_memory": round(np.mean(memory_values), 2),
                "avg_response_time": round(np.mean(response_times), 2),
                "max_cpu": round(np.max(cpu_values), 2),
                "max_memory": round(np.max(memory_values), 2),
                "max_response_time": round(np.max(response_times), 2)
            }
        
        return performance_data
    
    def _analyze_cpu_performance(self, performance_data: Dict) -> Dict[str, Any]:
        """分析CPU性能"""
        all_cpu_values = []
        high_cpu_devices = []
        
        for device_id, data in performance_data.items():
            avg_cpu = data["avg_cpu"]
            max_cpu = data["max_cpu"]
            
            all_cpu_values.extend(data["cpu_values"])
            
            if avg_cpu > 80:
                high_cpu_devices.append({
                    "device_id": data["device_id"],
                    "device_type": data["device_type"],
                    "avg_cpu": avg_cpu,
                    "max_cpu": max_cpu
                })
        
        return {
            "overall_avg": round(np.mean(all_cpu_values), 2),
            "overall_max": round(np.max(all_cpu_values), 2),
            "p95": round(np.percentile(all_cpu_values, 95), 2),
            "high_cpu_devices": sorted(high_cpu_devices, key=lambda x: x["avg_cpu"], reverse=True),
            "devices_above_80": len(high_cpu_devices),
            "total_devices": len(performance_data)
        }
    
    def _analyze_memory_performance(self, performance_data: Dict) -> Dict[str, Any]:
        """分析内存性能"""
        all_memory_values = []
        high_memory_devices = []
        
        for device_id, data in performance_data.items():
            avg_memory = data["avg_memory"]
            max_memory = data["max_memory"]
            
            all_memory_values.extend(data["memory_values"])
            
            if avg_memory > 85:
                high_memory_devices.append({
                    "device_id": data["device_id"],
                    "device_type": data["device_type"],
                    "avg_memory": avg_memory,
                    "max_memory": max_memory
                })
        
        return {
            "overall_avg": round(np.mean(all_memory_values), 2),
            "overall_max": round(np.max(all_memory_values), 2),
            "p95": round(np.percentile(all_memory_values, 95), 2),
            "high_memory_devices": sorted(high_memory_devices, key=lambda x: x["avg_memory"], reverse=True),
            "devices_above_85": len(high_memory_devices),
            "total_devices": len(performance_data)
        }
    
    def _analyze_interface_performance(self, performance_data: Dict) -> Dict[str, Any]:
        """分析接口性能"""
        # 模拟接口数据
        interface_stats = {
            "total_interfaces": 0,
            "active_interfaces": 0,
            "utilization_high": 0,
            "error_interfaces": 0
        }
        
        for device_id, data in performance_data.items():
            # 模拟接口数据
            if data["device_type"] in ["switch", "router"]:
                total_ports = np.random.randint(8, 48)
                active_ports = np.random.randint(int(total_ports * 0.3), total_ports)
                high_util_ports = np.random.randint(0, int(active_ports * 0.2))
                error_ports = np.random.randint(0, int(active_ports * 0.1))
                
                interface_stats["total_interfaces"] += total_ports
                interface_stats["active_interfaces"] += active_ports
                interface_stats["utilization_high"] += high_util_ports
                interface_stats["error_interfaces"] += error_ports
        
        interface_stats["utilization_rate"] = round(
            (interface_stats["active_interfaces"] / interface_stats["total_interfaces"]) * 100, 2
        ) if interface_stats["total_interfaces"] > 0 else 0
        
        return interface_stats
    
    def _analyze_response_times(self, performance_data: Dict) -> Dict[str, Any]:
        """分析响应时间"""
        all_response_times = []
        slow_devices = []
        
        for device_id, data in performance_data.items():
            avg_response = data["avg_response_time"]
            max_response = data["max_response_time"]
            
            all_response_times.extend(data["response_times"])
            
            if avg_response > 100:  # 超过100ms认为较慢
                slow_devices.append({
                    "device_id": data["device_id"],
                    "device_type": data["device_type"],
                    "avg_response_time": avg_response,
                    "max_response_time": max_response
                })
        
        return {
            "overall_avg": round(np.mean(all_response_times), 2),
            "overall_max": round(np.max(all_response_times), 2),
            "p50": round(np.percentile(all_response_times, 50), 2),
            "p90": round(np.percentile(all_response_times, 90), 2),
            "p95": round(np.percentile(all_response_times, 95), 2),
            "p99": round(np.percentile(all_response_times, 99), 2),
            "slow_devices": sorted(slow_devices, key=lambda x: x["avg_response_time"], reverse=True),
            "devices_above_100ms": len(slow_devices)
        }
    
    def _calculate_performance_scores(self, performance_data: Dict) -> Dict[str, float]:
        """计算性能评分"""
        scores = {}
        
        for device_id, data in performance_data.items():
            cpu_score = max(0, 100 - data["avg_cpu"])  # CPU使用率越低分数越高
            memory_score = max(0, 100 - data["avg_memory"])  # 内存使用率越低分数越高
            response_score = max(0, 100 - min(data["avg_response_time"], 100))  # 响应时间越低分数越高
            
            # 综合评分
            overall_score = (cpu_score * 0.4 + memory_score * 0.4 + response_score * 0.2)
            scores[device_id] = round(overall_score, 2)
        
        return scores
    
    def _identify_problematic_devices(self, performance_data: Dict, top_n: int = 10) -> List[Dict]:
        """识别问题设备"""
        problematic_devices = []
        
        for device_id, data in performance_data.items():
            issues = []
            issue_score = 0
            
            if data["avg_cpu"] > 80:
                issues.append("高CPU使用率")
                issue_score += 3
            
            if data["avg_memory"] > 85:
                issues.append("高内存使用率")
                issue_score += 3
            
            if data["avg_response_time"] > 100:
                issues.append("响应时间过长")
                issue_score += 2
            
            if data["max_cpu"] > 95:
                issues.append("CPU峰值过高")
                issue_score += 2
            
            if data["max_memory"] > 95:
                issues.append("内存峰值过高")
                issue_score += 2
            
            if issues:
                problematic_devices.append({
                    "device_id": data["device_id"],
                    "device_type": data["device_type"],
                    "issue_score": issue_score,
                    "issues": issues,
                    "avg_cpu": data["avg_cpu"],
                    "avg_memory": data["avg_memory"],
                    "avg_response_time": data["avg_response_time"]
                })
        
        # 按问题严重程度排序
        return sorted(problematic_devices, key=lambda x: x["issue_score"], reverse=True)[:top_n]
    
    async def _get_availability_data(self, start_time: datetime, end_time: datetime) -> List[Dict]:
        """获取可用性数据"""
        availability_data = []
        
        current_time = start_time
        while current_time < end_time:
            # 模拟设备状态检查数据
            for device_id in range(1, 51):
                # 90%的时间设备是可用的
                is_available = np.random.random() > 0.1
                
                availability_data.append({
                    "device_id": device_id,
                    "timestamp": current_time,
                    "is_available": is_available,
                    "response_time": np.random.lognormal(2, 1) if is_available else None
                })
            
            current_time += timedelta(minutes=30)  # 每30分钟检查一次
        
        return availability_data
    
    def _calculate_device_availability(self, availability_data: List[Dict]) -> Dict[str, float]:
        """计算设备可用性"""
        device_availability = {}
        
        # 按设备分组
        device_groups = defaultdict(list)
        for record in availability_data:
            device_groups[record["device_id"]].append(record)
        
        for device_id, records in device_groups.items():
            total_checks = len(records)
            available_checks = len([r for r in records if r["is_available"]])
            
            availability = (available_checks / total_checks) * 100 if total_checks > 0 else 0
            device_availability[str(device_id)] = round(availability, 4)
        
        return device_availability
    
    def _analyze_sla_compliance(self, device_availability: Dict[str, float], sla_threshold: float) -> Dict[str, List]:
        """分析SLA达标情况"""
        compliant = []
        non_compliant = []
        
        for device_id, availability in device_availability.items():
            device_info = {
                "device_id": int(device_id),
                "availability": availability,
                "gap": round(sla_threshold - availability, 4) if availability < sla_threshold else 0
            }
            
            if availability >= sla_threshold:
                compliant.append(device_info)
            else:
                non_compliant.append(device_info)
        
        return {
            "compliant": compliant,
            "non_compliant": sorted(non_compliant, key=lambda x: x["gap"], reverse=True)
        }
    
    def _analyze_downtime_events(self, availability_data: List[Dict]) -> List[Dict]:
        """分析停机事件"""
        downtime_events = []
        
        # 按设备分组
        device_groups = defaultdict(list)
        for record in availability_data:
            device_groups[record["device_id"]].append(record)
        
        for device_id, records in device_groups.items():
            # 按时间排序
            records.sort(key=lambda x: x["timestamp"])
            
            current_downtime = None
            
            for record in records:
                if not record["is_available"]:
                    if current_downtime is None:
                        # 开始新的停机事件
                        current_downtime = {
                            "device_id": device_id,
                            "start_time": record["timestamp"],
                            "end_time": record["timestamp"]
                        }
                    else:
                        # 延续停机事件
                        current_downtime["end_time"] = record["timestamp"]
                else:
                    if current_downtime is not None:
                        # 结束停机事件
                        duration = current_downtime["end_time"] - current_downtime["start_time"]
                        duration_hours = duration.total_seconds() / 3600
                        
                        downtime_events.append({
                            "device_id": current_downtime["device_id"],
                            "start_time": current_downtime["start_time"].isoformat(),
                            "end_time": current_downtime["end_time"].isoformat(),
                            "duration_hours": round(duration_hours, 2),
                            "duration_minutes": round(duration.total_seconds() / 60, 2)
                        })
                        
                        current_downtime = None
        
        return sorted(downtime_events, key=lambda x: x["duration_hours"], reverse=True)
    
    def _analyze_availability_trend(self, availability_data: List[Dict]) -> List[Dict]:
        """分析可用性趋势"""
        # 按天分组计算可用性
        daily_availability = defaultdict(lambda: {"total": 0, "available": 0})
        
        for record in availability_data:
            date_key = record["timestamp"].strftime("%Y-%m-%d")
            daily_availability[date_key]["total"] += 1
            if record["is_available"]:
                daily_availability[date_key]["available"] += 1
        
        trend_data = []
        for date_key in sorted(daily_availability.keys()):
            stats = daily_availability[date_key]
            availability = (stats["available"] / stats["total"]) * 100 if stats["total"] > 0 else 0
            
            trend_data.append({
                "date": date_key,
                "availability": round(availability, 2),
                "total_checks": stats["total"],
                "available_checks": stats["available"]
            })
        
        return trend_data
    
    def _calculate_reliability_metrics(self, downtime_events: List[Dict]) -> Dict[str, float]:
        """计算可靠性指标"""
        if not downtime_events:
            return {"avg_mttr": 0, "avg_mtbf": 0, "total_downtime": 0}
        
        # MTTR (Mean Time To Repair) - 平均修复时间
        total_downtime = sum([event["duration_hours"] for event in downtime_events])
        avg_mttr = total_downtime / len(downtime_events)
        
        # MTBF (Mean Time Between Failures) - 平均故障间隔时间
        # 简化计算：假设30天观察期
        observation_days = 30
        total_devices = len(set([event["device_id"] for event in downtime_events]))
        failure_rate = len(downtime_events) / (total_devices * observation_days * 24)  # 每小时故障率
        avg_mtbf = 1 / failure_rate if failure_rate > 0 else 0
        
        return {
            "avg_mttr": round(avg_mttr, 2),
            "avg_mtbf": round(avg_mtbf, 2),
            "total_downtime": round(total_downtime, 2),
            "failure_count": len(downtime_events)
        }
    
    def _analyze_check_type_distribution(self, inspection_data: List[Dict]) -> Dict[str, Any]:
        """分析检查项类型分布"""
        check_type_stats = defaultdict(lambda: {"total": 0, "passed": 0, "failed": 0, "warning": 0, "error": 0})
        
        for inspection in inspection_data:
            for check_result in inspection.get("check_results", []):
                check_type = check_result["check_item_type"]
                status = check_result["status"]
                
                check_type_stats[check_type]["total"] += 1
                
                if status == CheckItemStatus.PASS:
                    check_type_stats[check_type]["passed"] += 1
                elif status == CheckItemStatus.FAIL:
                    check_type_stats[check_type]["failed"] += 1
                elif status == CheckItemStatus.WARNING:
                    check_type_stats[check_type]["warning"] += 1
                elif status == CheckItemStatus.ERROR:
                    check_type_stats[check_type]["error"] += 1
        
        # 计算成功率
        distribution = {}
        for check_type, stats in check_type_stats.items():
            distribution[check_type] = {
                **stats,
                "success_rate": round((stats["passed"] / stats["total"]) * 100, 2) if stats["total"] > 0 else 0
            }
        
        return distribution
    
    def _analyze_device_type_performance(self, inspection_data: List[Dict]) -> Dict[str, Any]:
        """分析设备类型性能对比"""
        device_type_stats = defaultdict(lambda: {"inspections": 0, "successful": 0, "total_checks": 0, "passed_checks": 0})
        
        for inspection in inspection_data:
            device_type = inspection.get("device_type", "unknown")
            
            device_type_stats[device_type]["inspections"] += 1
            device_type_stats[device_type]["total_checks"] += inspection.get("total_checks", 0)
            device_type_stats[device_type]["passed_checks"] += inspection.get("passed_checks", 0)
            
            if inspection.get("status") == InspectionStatus.COMPLETED:
                device_type_stats[device_type]["successful"] += 1
        
        # 计算性能指标
        performance_comparison = {}
        for device_type, stats in device_type_stats.items():
            performance_comparison[device_type] = {
                "total_inspections": stats["inspections"],
                "success_rate": round((stats["successful"] / stats["inspections"]) * 100, 2) if stats["inspections"] > 0 else 0,
                "check_pass_rate": round((stats["passed_checks"] / stats["total_checks"]) * 100, 2) if stats["total_checks"] > 0 else 0,
                "avg_checks_per_inspection": round(stats["total_checks"] / stats["inspections"], 2) if stats["inspections"] > 0 else 0
            }
        
        return performance_comparison
    
    def _analyze_inspection_frequency(self, inspection_data: List[Dict]) -> Dict[str, Any]:
        """分析巡检频率"""
        # 按设备分析巡检频率
        device_inspections = defaultdict(list)
        for inspection in inspection_data:
            device_inspections[inspection["device_id"]].append(inspection["created_at"])
        
        frequency_stats = {
            "devices_analyzed": len(device_inspections),
            "avg_inspections_per_device": 0,
            "frequency_distribution": {"daily": 0, "weekly": 0, "monthly": 0, "irregular": 0}
        }
        
        total_inspections = sum(len(inspections) for inspections in device_inspections.values())
        frequency_stats["avg_inspections_per_device"] = round(total_inspections / len(device_inspections), 2) if device_inspections else 0
        
        # 简化的频率分析
        for device_id, timestamps in device_inspections.items():
            if len(timestamps) < 2:
                frequency_stats["frequency_distribution"]["irregular"] += 1
                continue
            
            timestamps.sort()
            intervals = [(timestamps[i+1] - timestamps[i]).total_seconds() / 3600 for i in range(len(timestamps)-1)]
            avg_interval = np.mean(intervals)
            
            if avg_interval <= 24:
                frequency_stats["frequency_distribution"]["daily"] += 1
            elif avg_interval <= 168:  # 7 days
                frequency_stats["frequency_distribution"]["weekly"] += 1
            elif avg_interval <= 720:  # 30 days
                frequency_stats["frequency_distribution"]["monthly"] += 1
            else:
                frequency_stats["frequency_distribution"]["irregular"] += 1
        
        return frequency_stats

# 全局分析服务实例
analytics_service = AnalyticsService()