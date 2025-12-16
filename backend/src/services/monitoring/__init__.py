# 监控服务模块
"""
监控领域服务

提供系统监控、性能采集和流量分析功能：
- MonitoringService: 设备监控服务
- PerformanceCollector: 性能数据采集器
- TrafficAnalyzer: 流量分析器

推荐导入方式:
    from src.services.monitoring import MonitoringService, monitoring_service
    from src.services.monitoring import PerformanceCollector, performance_collector
    from src.services.monitoring import TrafficAnalyzer, traffic_analyzer
"""

# 监控服务
from .service import MonitoringService, monitoring_service

# 性能采集器
from .collector import (
    PerformanceCollector,
    performance_collector,
    MetricType,
    DataSource,
    PerformanceMetric,
    CollectionTask,
)

# 流量分析器
from .traffic import (
    TrafficAnalyzer,
    traffic_analyzer,
    TrafficMetrics,
    TrafficPattern,
    TrafficAnomaly,
)

__all__ = [
    # 监控服务
    "MonitoringService",
    "monitoring_service",
    # 性能采集器
    "PerformanceCollector",
    "performance_collector",
    "MetricType",
    "DataSource",
    "PerformanceMetric",
    "CollectionTask",
    # 流量分析器
    "TrafficAnalyzer",
    "traffic_analyzer",
    "TrafficMetrics",
    "TrafficPattern",
    "TrafficAnomaly",
]
