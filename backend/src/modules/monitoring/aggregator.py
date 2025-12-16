"""
监控数据聚合器

职责：
- 网络概览数据聚合
- 统计信息计算
- 监控状态汇总
"""
from datetime import datetime
from typing import Dict, Any
import structlog

logger = structlog.get_logger()


class MetricsAggregator:
    """指标数据聚合器"""
    
    def __init__(self):
        self._storage = None
        self._collector = None
    
    def set_storage(self, storage: "MetricsStorage"):
        """设置存储服务"""
        self._storage = storage
    
    def set_collector(self, collector: "MetricsCollector"):
        """设置采集器"""
        self._collector = collector
    
    async def get_network_overview(self) -> dict:
        """获取网络概览数据"""
        try:
            if not self._storage:
                return self._get_default_overview()
            
            device_metrics = self._storage.device_metrics
            
            total_traffic = 0
            total_cpu = 0
            device_count = 0

            for device_id, metrics in device_metrics.items():
                if metrics and 'collected_at' in metrics:
                    # 检查数据是否过期（5分钟内的数据才有效）
                    if (datetime.now() - metrics['collected_at']).seconds < 300:
                        device_count += 1

                        if 'bandwidth_utilization' in metrics:
                            total_traffic += metrics['bandwidth_utilization']

                        if 'cpu_usage' in metrics:
                            total_cpu += metrics['cpu_usage']

            # 计算平均值和格式化
            if device_count > 0:
                avg_traffic = total_traffic / device_count
                avg_cpu = total_cpu / device_count

                if avg_traffic < 1024:
                    traffic_str = f"{avg_traffic:.1f} MB/s"
                else:
                    traffic_str = f"{avg_traffic/1024:.1f} GB/s"

                cpu_str = f"{avg_cpu:.0f}%"
            else:
                traffic_str = "0 MB/s"
                cpu_str = "0%"

            return {
                'total_traffic': traffic_str,
                'avg_cpu_usage': cpu_str,
                'active_devices': device_count,
                'monitoring_status': self.get_monitoring_status()
            }

        except Exception as e:
            logger.error("Failed to get network overview", error=str(e))
            return self._get_default_overview()
    
    def _get_default_overview(self) -> dict:
        """获取默认概览数据"""
        return {
            'total_traffic': "0 MB/s",
            'avg_cpu_usage': "0%",
            'active_devices': 0,
            'monitoring_status': {}
        }
    
    def get_monitoring_status(self) -> dict:
        """获取监控系统状态"""
        if not self._collector:
            return {
                "total_devices": 0,
                "active_monitoring": 0,
                "error_monitoring": 0,
                "websocket_connections": 0,
                "influxdb_available": False,
                "last_updated": datetime.now().isoformat()
            }
        
        collector_status = self._collector.get_all_monitors_status()
        
        return {
            **collector_status,
            "websocket_connections": 0,  # 由WebSocket模块管理
            "influxdb_available": self._storage.is_influxdb_available() if self._storage else False,
        }
    
    async def get_device_summary(self, device_id: int) -> dict:
        """获取设备监控摘要"""
        if not self._storage:
            return {"error": "Storage not available"}
        
        current_metrics = await self._storage.get_current_metrics(device_id)
        
        if not current_metrics:
            return {
                "device_id": device_id,
                "status": "no_data",
                "message": "No metrics available for this device"
            }
        
        # 提取关键指标
        summary = {
            "device_id": device_id,
            "status": "active",
            "collected_at": current_metrics.get("collected_at"),
            "connectivity": current_metrics.get("connectivity", {}).get("status", "unknown"),
            "response_time": current_metrics.get("response_time"),
        }
        
        # 添加性能指标（如果有）
        if "cpu_usage" in current_metrics:
            summary["cpu_usage"] = current_metrics["cpu_usage"]
        if "memory_usage" in current_metrics:
            summary["memory_usage"] = current_metrics["memory_usage"]
        if "bandwidth_utilization" in current_metrics:
            summary["bandwidth_utilization"] = current_metrics["bandwidth_utilization"]
        
        return summary
    
    async def get_alerts_summary(self) -> dict:
        """获取告警摘要（与告警模块集成）"""
        # 这里可以与告警模块集成
        return {
            "total_active": 0,
            "critical": 0,
            "warning": 0,
            "info": 0
        }


# 全局聚合器实例
metrics_aggregator = MetricsAggregator()
