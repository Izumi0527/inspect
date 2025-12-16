"""
网络流量分析服务
实现流量数据采集、分析和异常检测算法
"""
import asyncio
import numpy as np
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Tuple
from dataclasses import dataclass
from collections import defaultdict, deque
import structlog

logger = structlog.get_logger()

@dataclass
class TrafficMetrics:
    """流量指标数据结构"""
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

@dataclass
class TrafficPattern:
    """流量模式"""
    device_ip: str
    interface: str
    baseline_in: float
    baseline_out: float
    peak_hours: List[int]
    avg_utilization: float
    pattern_confidence: float

@dataclass
class TrafficAnomaly:
    """流量异常"""
    timestamp: datetime
    device_ip: str
    interface: str
    anomaly_type: str  # spike, drop, unusual_pattern
    severity: str  # low, medium, high, critical
    description: str
    baseline_value: float
    current_value: float
    confidence: float
    metadata: Dict[str, Any]

class TrafficAnalyzer:
    """流量分析器"""
    
    def __init__(self):
        # 历史数据存储（生产环境应使用时序数据库）
        self.traffic_history: Dict[str, deque] = defaultdict(lambda: deque(maxlen=2000))
        self.baseline_patterns: Dict[str, TrafficPattern] = {}
        self.anomaly_thresholds = {
            'spike_multiplier': 3.0,    # 流量激增倍数
            'drop_threshold': 0.3,      # 流量下降阈值
            'deviation_threshold': 2.5,  # 标准差倍数
            'min_samples': 30           # 最小样本数
        }
        
    async def collect_traffic_data(self, device_ip: str) -> List[TrafficMetrics]:
        """
        采集设备流量数据
        在实际环境中这里会通过SNMP或其他协议采集真实数据
        """
        try:
            # 模拟SNMP采集流量数据
            current_time = datetime.now()
            interfaces = ['eth0', 'eth1', 'lo']
            
            traffic_data = []
            for interface in interfaces:
                # 生成模拟流量数据，带有一些变化模式
                base_traffic_in = np.random.normal(100000, 20000)
                base_traffic_out = np.random.normal(50000, 10000)
                
                # 添加时间模式（工作时间流量更高）
                hour = current_time.hour
                if 9 <= hour <= 18:
                    base_traffic_in *= 1.5
                    base_traffic_out *= 1.3
                
                metrics = TrafficMetrics(
                    timestamp=current_time,
                    device_ip=device_ip,
                    interface=interface,
                    bytes_in=max(0, int(base_traffic_in)),
                    bytes_out=max(0, int(base_traffic_out)),
                    packets_in=int(base_traffic_in / 1024),
                    packets_out=int(base_traffic_out / 1024),
                    bandwidth_utilization=np.random.uniform(10, 80),
                    errors=np.random.poisson(0.1),
                    discards=np.random.poisson(0.05)
                )
                traffic_data.append(metrics)
            
            # 存储到历史数据
            key = f"{device_ip}"
            self.traffic_history[key].extend(traffic_data)
            
            logger.info("Traffic data collected", 
                       device_ip=device_ip,
                       interfaces=len(interfaces),
                       timestamp=current_time)
            
            return traffic_data
            
        except Exception as e:
            logger.error("Failed to collect traffic data",
                        device_ip=device_ip,
                        error=str(e))
            raise e
    
    def calculate_baseline(self, device_ip: str, interface: str) -> Optional[TrafficPattern]:
        """计算流量基线模式"""
        try:
            key = f"{device_ip}"
            if key not in self.traffic_history:
                return None
            
            # 过滤指定接口的历史数据
            interface_data = [
                metric for metric in self.traffic_history[key]
                if metric.interface == interface
            ]
            
            if len(interface_data) < self.anomaly_thresholds['min_samples']:
                return None
            
            # 计算基线指标
            bytes_in_values = [m.bytes_in for m in interface_data]
            bytes_out_values = [m.bytes_out for m in interface_data]
            utilization_values = [m.bandwidth_utilization for m in interface_data]
            
            baseline_in = np.mean(bytes_in_values)
            baseline_out = np.mean(bytes_out_values)
            avg_utilization = np.mean(utilization_values)
            
            # 分析峰值时间模式
            hourly_traffic = defaultdict(list)
            for metric in interface_data:
                hour = metric.timestamp.hour
                hourly_traffic[hour].append(metric.bytes_in + metric.bytes_out)
            
            # 找出流量峰值时段
            hourly_avg = {hour: np.mean(values) for hour, values in hourly_traffic.items()}
            overall_avg = np.mean(list(hourly_avg.values()))
            peak_hours = [hour for hour, avg in hourly_avg.items() if avg > overall_avg * 1.2]
            
            # 计算模式置信度
            stability = 1.0 - (np.std(bytes_in_values) / max(baseline_in, 1))
            pattern_confidence = min(0.95, max(0.3, stability))
            
            pattern = TrafficPattern(
                device_ip=device_ip,
                interface=interface,
                baseline_in=baseline_in,
                baseline_out=baseline_out,
                peak_hours=peak_hours,
                avg_utilization=avg_utilization,
                pattern_confidence=pattern_confidence
            )
            
            # 缓存基线模式
            pattern_key = f"{device_ip}:{interface}"
            self.baseline_patterns[pattern_key] = pattern
            
            logger.info("Baseline pattern calculated",
                       device_ip=device_ip,
                       interface=interface,
                       baseline_in=baseline_in,
                       baseline_out=baseline_out,
                       confidence=pattern_confidence)
            
            return pattern
            
        except Exception as e:
            logger.error("Failed to calculate baseline",
                        device_ip=device_ip,
                        interface=interface,
                        error=str(e))
            return None
    
    def detect_anomalies(self, current_metrics: List[TrafficMetrics]) -> List[TrafficAnomaly]:
        """检测流量异常"""
        anomalies = []
        
        try:
            for metric in current_metrics:
                pattern_key = f"{metric.device_ip}:{metric.interface}"
                
                # 获取或计算基线模式
                if pattern_key not in self.baseline_patterns:
                    pattern = self.calculate_baseline(metric.device_ip, metric.interface)
                    if not pattern:
                        continue
                else:
                    pattern = self.baseline_patterns[pattern_key]
                
                # 检测各种异常类型
                detected_anomalies = []
                
                # 1. 流量激增检测
                current_total = metric.bytes_in + metric.bytes_out
                baseline_total = pattern.baseline_in + pattern.baseline_out
                
                if current_total > baseline_total * self.anomaly_thresholds['spike_multiplier']:
                    anomaly = TrafficAnomaly(
                        timestamp=metric.timestamp,
                        device_ip=metric.device_ip,
                        interface=metric.interface,
                        anomaly_type="traffic_spike",
                        severity=self._calculate_severity(current_total / baseline_total),
                        description=f"流量激增至基线的{current_total/baseline_total:.1f}倍",
                        baseline_value=baseline_total,
                        current_value=current_total,
                        confidence=pattern.pattern_confidence,
                        metadata={
                            "spike_ratio": current_total / baseline_total,
                            "bytes_in": metric.bytes_in,
                            "bytes_out": metric.bytes_out
                        }
                    )
                    detected_anomalies.append(anomaly)
                
                # 2. 流量骤降检测
                elif current_total < baseline_total * self.anomaly_thresholds['drop_threshold']:
                    anomaly = TrafficAnomaly(
                        timestamp=metric.timestamp,
                        device_ip=metric.device_ip,
                        interface=metric.interface,
                        anomaly_type="traffic_drop",
                        severity=self._calculate_severity(baseline_total / current_total),
                        description=f"流量骤降至基线的{current_total/baseline_total:.1%}",
                        baseline_value=baseline_total,
                        current_value=current_total,
                        confidence=pattern.pattern_confidence,
                        metadata={
                            "drop_ratio": current_total / baseline_total,
                            "bytes_in": metric.bytes_in,
                            "bytes_out": metric.bytes_out
                        }
                    )
                    detected_anomalies.append(anomaly)
                
                # 3. 带宽利用率异常
                if metric.bandwidth_utilization > 90:
                    anomaly = TrafficAnomaly(
                        timestamp=metric.timestamp,
                        device_ip=metric.device_ip,
                        interface=metric.interface,
                        anomaly_type="high_utilization",
                        severity="high" if metric.bandwidth_utilization > 95 else "medium",
                        description=f"带宽利用率过高: {metric.bandwidth_utilization:.1f}%",
                        baseline_value=pattern.avg_utilization,
                        current_value=metric.bandwidth_utilization,
                        confidence=0.9,
                        metadata={
                            "utilization": metric.bandwidth_utilization,
                            "threshold": 90
                        }
                    )
                    detected_anomalies.append(anomaly)
                
                # 4. 错误包检测
                if metric.errors > 10:
                    anomaly = TrafficAnomaly(
                        timestamp=metric.timestamp,
                        device_ip=metric.device_ip,
                        interface=metric.interface,
                        anomaly_type="high_errors",
                        severity=self._calculate_error_severity(metric.errors),
                        description=f"接口错误包数量异常: {metric.errors}",
                        baseline_value=0,
                        current_value=metric.errors,
                        confidence=0.95,
                        metadata={
                            "errors": metric.errors,
                            "discards": metric.discards
                        }
                    )
                    detected_anomalies.append(anomaly)
                
                anomalies.extend(detected_anomalies)
            
            if anomalies:
                logger.warning("Traffic anomalies detected",
                             count=len(anomalies),
                             devices=[a.device_ip for a in anomalies])
            
            return anomalies
            
        except Exception as e:
            logger.error("Failed to detect anomalies", error=str(e))
            return []
    
    def _calculate_severity(self, ratio: float) -> str:
        """根据比值计算异常严重程度"""
        if ratio >= 10:
            return "critical"
        elif ratio >= 5:
            return "high"
        elif ratio >= 3:
            return "medium"
        else:
            return "low"
    
    def _calculate_error_severity(self, error_count: int) -> str:
        """根据错误数量计算严重程度"""
        if error_count >= 100:
            return "critical"
        elif error_count >= 50:
            return "high"
        elif error_count >= 20:
            return "medium"
        else:
            return "low"
    
    async def analyze_traffic_trends(self, device_ip: str, hours: int = 24) -> Dict[str, Any]:
        """分析流量趋势"""
        try:
            key = f"{device_ip}"
            if key not in self.traffic_history:
                return {"error": "No traffic data available"}
            
            # 获取指定时间范围内的数据
            cutoff_time = datetime.now() - timedelta(hours=hours)
            recent_data = [
                metric for metric in self.traffic_history[key]
                if metric.timestamp >= cutoff_time
            ]
            
            if not recent_data:
                return {"error": "No recent data available"}
            
            # 按接口分组分析
            interface_trends = defaultdict(list)
            for metric in recent_data:
                interface_trends[metric.interface].append(metric)
            
            trends = {}
            for interface, metrics in interface_trends.items():
                # 计算趋势指标
                bytes_in_series = [m.bytes_in for m in metrics]
                bytes_out_series = [m.bytes_out for m in metrics]
                utilization_series = [m.bandwidth_utilization for m in metrics]
                
                # 线性回归计算趋势
                x = np.arange(len(bytes_in_series))
                
                trend_in = np.polyfit(x, bytes_in_series, 1)[0] if len(bytes_in_series) > 1 else 0
                trend_out = np.polyfit(x, bytes_out_series, 1)[0] if len(bytes_out_series) > 1 else 0
                trend_util = np.polyfit(x, utilization_series, 1)[0] if len(utilization_series) > 1 else 0
                
                trends[interface] = {
                    "current_in": bytes_in_series[-1] if bytes_in_series else 0,
                    "current_out": bytes_out_series[-1] if bytes_out_series else 0,
                    "current_utilization": utilization_series[-1] if utilization_series else 0,
                    "trend_in": float(trend_in),
                    "trend_out": float(trend_out),
                    "trend_utilization": float(trend_util),
                    "avg_in": np.mean(bytes_in_series),
                    "avg_out": np.mean(bytes_out_series),
                    "avg_utilization": np.mean(utilization_series),
                    "peak_in": max(bytes_in_series),
                    "peak_out": max(bytes_out_series),
                    "peak_utilization": max(utilization_series),
                    "sample_count": len(metrics)
                }
            
            return {
                "device_ip": device_ip,
                "analysis_period_hours": hours,
                "interfaces": trends,
                "total_samples": len(recent_data),
                "analysis_timestamp": datetime.now().isoformat()
            }
            
        except Exception as e:
            logger.error("Failed to analyze traffic trends",
                        device_ip=device_ip,
                        error=str(e))
            return {"error": str(e)}
    
    def get_traffic_summary(self, device_ips: List[str] = None) -> Dict[str, Any]:
        """获取流量汇总信息"""
        try:
            summary = {
                "total_devices": 0,
                "total_interfaces": 0,
                "active_anomalies": 0,
                "baseline_patterns": len(self.baseline_patterns),
                "devices": {}
            }
            
            target_devices = device_ips or list(self.traffic_history.keys())
            
            for device_key in target_devices:
                if device_key not in self.traffic_history:
                    continue
                
                device_data = list(self.traffic_history[device_key])
                if not device_data:
                    continue
                
                # 提取设备IP
                device_ip = device_data[0].device_ip if device_data else device_key
                
                # 按接口统计
                interface_stats = defaultdict(lambda: {
                    "last_seen": None,
                    "avg_utilization": 0,
                    "total_bytes": 0
                })
                
                for metric in device_data[-50:]:  # 取最近50个样本
                    interface = metric.interface
                    interface_stats[interface]["last_seen"] = metric.timestamp
                    interface_stats[interface]["total_bytes"] += metric.bytes_in + metric.bytes_out
                
                # 计算平均利用率
                for interface in interface_stats:
                    recent_metrics = [
                        m for m in device_data[-20:] 
                        if m.interface == interface
                    ]
                    if recent_metrics:
                        interface_stats[interface]["avg_utilization"] = np.mean([
                            m.bandwidth_utilization for m in recent_metrics
                        ])
                
                summary["devices"][device_ip] = {
                    "interfaces": dict(interface_stats),
                    "interface_count": len(interface_stats),
                    "last_update": max(
                        [stats["last_seen"] for stats in interface_stats.values()],
                        default=datetime.now()
                    ).isoformat(),
                    "sample_count": len(device_data)
                }
                
                summary["total_interfaces"] += len(interface_stats)
            
            summary["total_devices"] = len(summary["devices"])
            
            return summary
            
        except Exception as e:
            logger.error("Failed to get traffic summary", error=str(e))
            return {"error": str(e)}

# 创建全局实例
traffic_analyzer = TrafficAnalyzer()