"""
监控数据存储服务

职责：
- 指标数据持久化到InfluxDB
- 本地缓存管理
- 历史数据查询
"""
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
import random
import structlog

from influxdb_client import InfluxDBClient, Point
from influxdb_client.client.write_api import SYNCHRONOUS

from src.core.config import settings

logger = structlog.get_logger()


class MetricsStorage:
    """指标数据存储服务"""
    
    def __init__(self):
        self.device_metrics: Dict[int, Dict] = {}
        self.influx_client: Optional[InfluxDBClient] = None
        self.write_api = None
        
        self._init_influxdb()
    
    def _init_influxdb(self):
        """初始化InfluxDB客户端"""
        if settings.INFLUXDB_URL and settings.INFLUXDB_TOKEN:
            try:
                self.influx_client = InfluxDBClient(
                    url=settings.INFLUXDB_URL,
                    token=settings.INFLUXDB_TOKEN,
                    org=settings.INFLUXDB_ORG
                )
                self.write_api = self.influx_client.write_api(write_options=SYNCHRONOUS)
                logger.info("InfluxDB client initialized")
            except Exception as e:
                logger.warning("Failed to initialize InfluxDB client", error=str(e))
    
    async def store_metrics(self, device_id: int, metrics: dict):
        """存储设备指标"""
        # 更新本地缓存
        self.device_metrics[device_id] = {
            **metrics,
            "collected_at": datetime.now(),
            "device_id": device_id
        }
        
        # 存储到InfluxDB
        await self._store_to_influxdb(device_id, metrics)
    
    async def _store_to_influxdb(self, device_id: int, metrics: dict):
        """存储指标数据到InfluxDB"""
        if not self.influx_client:
            return
        
        try:
            points = []
            timestamp = datetime.now()
            
            # 基础指标
            for key, value in metrics.items():
                if key in ["interfaces", "timestamp"]:
                    continue
                
                if isinstance(value, dict):
                    for sub_key, sub_value in value.items():
                        if isinstance(sub_value, (int, float)):
                            point = Point("device_metrics") \
                                .tag("device_id", str(device_id)) \
                                .tag("metric_type", f"{key}_{sub_key}") \
                                .field("value", sub_value) \
                                .time(timestamp)
                            points.append(point)
                elif isinstance(value, (int, float)):
                    point = Point("device_metrics") \
                        .tag("device_id", str(device_id)) \
                        .tag("metric_type", key) \
                        .field("value", value) \
                        .time(timestamp)
                    points.append(point)
            
            # 接口指标
            if "interfaces" in metrics:
                for interface in metrics["interfaces"]:
                    interface_name = interface.get("name", "unknown")
                    for key, value in interface.items():
                        if key != "name" and isinstance(value, (int, float)):
                            point = Point("interface_metrics") \
                                .tag("device_id", str(device_id)) \
                                .tag("interface", interface_name) \
                                .tag("metric_type", key) \
                                .field("value", value) \
                                .time(timestamp)
                            points.append(point)
            
            # 批量写入
            if points:
                self.write_api.write(bucket=settings.INFLUXDB_BUCKET, record=points)
                
        except Exception as e:
            logger.error("Failed to store metrics to InfluxDB", 
                        device_id=device_id,
                        error=str(e))
    
    async def get_current_metrics(self, device_id: int) -> Optional[dict]:
        """获取设备当前指标"""
        return self.device_metrics.get(device_id)
    
    async def get_historical_metrics(
        self, 
        device_id: int, 
        start_time: datetime, 
        end_time: datetime
    ) -> List[dict]:
        """获取设备历史指标"""
        if not self.influx_client:
            return self._generate_mock_historical_data(device_id, start_time, end_time)
        
        try:
            query = f'''
            from(bucket: "{settings.INFLUXDB_BUCKET}")
              |> range(start: {start_time.isoformat()}, stop: {end_time.isoformat()})
              |> filter(fn: (r) => r._measurement == "device_metrics")
              |> filter(fn: (r) => r.device_id == "{device_id}")
              |> aggregateWindow(every: 5m, fn: mean, createEmpty: false)
              |> yield(name: "mean")
            '''
            
            query_api = self.influx_client.query_api()
            result = query_api.query(query=query)
            
            historical_data = []
            for table in result:
                for record in table.records:
                    historical_data.append({
                        "timestamp": record.get_time().isoformat(),
                        "metric_type": record.values.get("metric_type"),
                        "value": record.get_value(),
                        "device_id": device_id
                    })
            
            return historical_data
            
        except Exception as e:
            logger.error("Failed to query historical metrics", 
                        device_id=device_id,
                        error=str(e))
            return []
    
    def _generate_mock_historical_data(
        self, 
        device_id: int, 
        start_time: datetime, 
        end_time: datetime
    ) -> List[dict]:
        """生成模拟历史数据"""
        data = []
        current = start_time
        interval = timedelta(minutes=5)
        
        metrics = ["cpu_usage", "memory_usage", "bandwidth_utilization", "response_time"]
        
        while current <= end_time:
            for metric in metrics:
                if metric == "response_time":
                    value = random.uniform(1.0, 50.0)
                else:
                    value = random.randint(10, 90)
                
                data.append({
                    "timestamp": current.isoformat(),
                    "metric_type": metric,
                    "value": value,
                    "device_id": device_id
                })
            
            current += interval
        
        return data
    
    def is_influxdb_available(self) -> bool:
        """检查InfluxDB是否可用"""
        return self.influx_client is not None


# 全局存储服务实例
metrics_storage = MetricsStorage()
