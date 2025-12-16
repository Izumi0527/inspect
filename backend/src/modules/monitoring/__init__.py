"""
实时监控模块

提供设备实时监控、性能数据采集、WebSocket推送等功能

模块结构：
- collector.py: 数据采集器
- storage.py: 数据存储服务
- aggregator.py: 数据聚合器
- websocket.py: WebSocket推送
- api.py: API路由
"""


def __getattr__(name):
    """延迟导入避免循环依赖"""
    if name == "router":
        from src.modules.monitoring.api import router
        return router
    if name == "websocket_router":
        from src.modules.monitoring.websocket import router
        return router
    if name == "ws_notifier":
        from src.modules.monitoring.websocket import ws_notifier
        return ws_notifier
    if name == "WebSocketNotifier":
        from src.modules.monitoring.websocket import WebSocketNotifier
        return WebSocketNotifier
    if name == "MetricsCollector":
        from src.modules.monitoring.collector import MetricsCollector
        return MetricsCollector
    if name == "metrics_collector":
        from src.modules.monitoring.collector import metrics_collector
        return metrics_collector
    if name == "MetricsStorage":
        from src.modules.monitoring.storage import MetricsStorage
        return MetricsStorage
    if name == "metrics_storage":
        from src.modules.monitoring.storage import metrics_storage
        return metrics_storage
    if name == "MetricsAggregator":
        from src.modules.monitoring.aggregator import MetricsAggregator
        return MetricsAggregator
    if name == "metrics_aggregator":
        from src.modules.monitoring.aggregator import metrics_aggregator
        return metrics_aggregator
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


__all__ = [
    "router",
    "websocket_router", 
    "ws_notifier", 
    "WebSocketNotifier",
    "MetricsCollector",
    "metrics_collector",
    "MetricsStorage",
    "metrics_storage",
    "MetricsAggregator",
    "metrics_aggregator",
]
