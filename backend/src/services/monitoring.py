import asyncio
import json
import random
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from influxdb_client import InfluxDBClient, Point
from influxdb_client.client.write_api import SYNCHRONOUS
import structlog

from src.core.config import settings

logger = structlog.get_logger()

class MonitoringService:
    """监控服务类"""
    
    def __init__(self):
        self.active_monitors: Dict[int, Any] = {}
        self.device_metrics: Dict[int, Dict] = {}
        self.websocket_connections: Dict[str, Any] = {}
        
        # InfluxDB客户端（如果配置了）
        self.influx_client = None
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
    
    async def start_device_monitoring(self, device_id: int, device_info: dict, interval: int = 60):
        """开始监控设备"""
        if device_id in self.active_monitors:
            logger.warning("Device monitoring already active", device_id=device_id)
            return
        
        monitor_info = {
            "device_id": device_id,
            "device_info": device_info,
            "interval": interval,
            "started_at": datetime.now(),
            "last_collection": None,
            "status": "running",
            "error_count": 0
        }
        
        self.active_monitors[device_id] = monitor_info
        
        # 启动监控任务
        asyncio.create_task(self._monitor_device_loop(device_id))
        
        logger.info("Device monitoring started", 
                   device_id=device_id, 
                   interval=interval)
    
    async def stop_device_monitoring(self, device_id: int):
        """停止监控设备"""
        if device_id in self.active_monitors:
            self.active_monitors[device_id]["status"] = "stopped"
            del self.active_monitors[device_id]
            logger.info("Device monitoring stopped", device_id=device_id)
    
    async def _monitor_device_loop(self, device_id: int):
        """设备监控循环"""
        monitor_info = self.active_monitors.get(device_id)
        if not monitor_info:
            return
        
        device_info = monitor_info["device_info"]
        interval = monitor_info["interval"]
        
        while device_id in self.active_monitors and monitor_info["status"] == "running":
            try:
                # 收集设备指标
                metrics = await self._collect_device_metrics(device_info)
                
                # 更新本地缓存
                self.device_metrics[device_id] = {
                    **metrics,
                    "collected_at": datetime.now(),
                    "device_id": device_id
                }
                
                # 存储到时序数据库
                await self._store_metrics_to_influxdb(device_id, metrics)
                
                # 更新监控状态
                monitor_info["last_collection"] = datetime.now()
                monitor_info["error_count"] = 0
                
                # 发送实时数据到WebSocket客户端
                await self._broadcast_metrics(device_id, metrics)
                
                logger.debug("Device metrics collected", 
                            device_id=device_id,
                            metrics_count=len(metrics))
                
            except Exception as e:
                monitor_info["error_count"] += 1
                logger.error("Failed to collect device metrics", 
                           device_id=device_id,
                           error=str(e),
                           error_count=monitor_info["error_count"])
                
                # 如果连续错误过多，暂停监控
                if monitor_info["error_count"] > 5:
                    monitor_info["status"] = "error"
                    logger.warning("Device monitoring paused due to errors", 
                                 device_id=device_id)
                    break
            
            # 等待下次收集
            await asyncio.sleep(interval)
    
    async def _collect_device_metrics(self, device_info: dict) -> dict:
        """收集设备指标数据"""
        device_type = device_info.get("device_type", "unknown")
        ip_address = device_info.get("ip_address")
        
        # 模拟数据收集（在实际环境中应该通过SNMP、SSH等方式获取真实数据）
        metrics = {
            "timestamp": datetime.now().isoformat(),
            "connectivity": await self._check_connectivity(ip_address),
            "response_time": random.uniform(1.0, 50.0),  # 响应时间（毫秒）
        }
        
        if device_type in ["switch", "router"]:
            metrics.update({
                "cpu_usage": random.randint(10, 90),      # CPU使用率
                "memory_usage": random.randint(20, 85),   # 内存使用率
                "temperature": random.randint(25, 65),    # 温度
                "uptime": random.randint(86400, 8640000), # 运行时间（秒）
                "packet_loss": random.uniform(0, 0.1),    # 丢包率
                "bandwidth_utilization": random.randint(5, 95), # 带宽利用率
                "interface_count": random.randint(24, 48),
                "active_interfaces": random.randint(20, 45),
            })
            
            # 接口统计
            interfaces = []
            for i in range(1, random.randint(5, 9)):
                interfaces.append({
                    "name": f"GigabitEthernet0/{i}",
                    "status": random.choice(["up", "down", "admin_down"]),
                    "speed": 1000,  # Mbps
                    "in_octets": random.randint(1000000, 100000000),
                    "out_octets": random.randint(1000000, 100000000),
                    "in_packets": random.randint(10000, 1000000),
                    "out_packets": random.randint(10000, 1000000),
                    "in_errors": random.randint(0, 100),
                    "out_errors": random.randint(0, 100),
                })
            metrics["interfaces"] = interfaces
            
        elif device_type == "server":
            metrics.update({
                "cpu_usage": random.randint(5, 95),
                "memory_usage": random.randint(10, 90),
                "disk_usage": random.randint(15, 85),
                "network_io": random.randint(1000, 100000),  # KB/s
                "disk_io": random.randint(100, 10000),       # IOPS
                "load_average": random.uniform(0.1, 4.0),
                "process_count": random.randint(50, 300),
                "tcp_connections": random.randint(10, 1000),
            })
        
        return metrics
    
    async def _check_connectivity(self, ip_address: str) -> dict:
        """检查设备连通性"""
        try:
            # 模拟ping检查
            await asyncio.sleep(0.1)  # 模拟网络延迟
            
            # 90%的概率返回在线
            is_online = random.random() > 0.1
            
            return {
                "status": "online" if is_online else "offline",
                "reachable": is_online,
                "last_check": datetime.now().isoformat()
            }
        except Exception as e:
            return {
                "status": "error",
                "reachable": False,
                "error": str(e),
                "last_check": datetime.now().isoformat()
            }
    
    async def _store_metrics_to_influxdb(self, device_id: int, metrics: dict):
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
                    # 处理嵌套对象（如connectivity）
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
    
    async def _broadcast_metrics(self, device_id: int, metrics: dict):
        """广播指标数据到WebSocket客户端"""
        message = {
            "type": "device_metrics",
            "device_id": device_id,
            "data": metrics,
            "timestamp": datetime.now().isoformat()
        }
        
        # 这里应该发送到所有订阅此设备的WebSocket连接
        # 现在只是记录日志
        logger.debug("Broadcasting metrics", 
                    device_id=device_id,
                    connections=len(self.websocket_connections))
    
    async def get_device_current_metrics(self, device_id: int) -> Optional[dict]:
        """获取设备当前指标"""
        return self.device_metrics.get(device_id)
    
    async def get_device_historical_metrics(self, device_id: int, start_time: datetime, end_time: datetime) -> List[dict]:
        """获取设备历史指标"""
        if not self.influx_client:
            # 如果没有InfluxDB，返回模拟数据
            return self._generate_mock_historical_data(device_id, start_time, end_time)
        
        try:
            # 查询InfluxDB
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
            
            # 处理查询结果
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
    
    def _generate_mock_historical_data(self, device_id: int, start_time: datetime, end_time: datetime) -> List[dict]:
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
    
    def get_monitoring_status(self) -> dict:
        """获取监控系统状态"""
        active_count = len([m for m in self.active_monitors.values() if m["status"] == "running"])
        error_count = len([m for m in self.active_monitors.values() if m["status"] == "error"])
        
        return {
            "total_devices": len(self.active_monitors),
            "active_monitoring": active_count,
            "error_monitoring": error_count,
            "websocket_connections": len(self.websocket_connections),
            "influxdb_available": self.influx_client is not None,
            "last_updated": datetime.now().isoformat()
        }
    
    async def register_websocket(self, connection_id: str, websocket):
        """注册WebSocket连接"""
        self.websocket_connections[connection_id] = {
            "websocket": websocket,
            "connected_at": datetime.now(),
            "subscribed_devices": set()
        }
        logger.info("WebSocket connection registered", connection_id=connection_id)
    
    async def unregister_websocket(self, connection_id: str):
        """注销WebSocket连接"""
        if connection_id in self.websocket_connections:
            del self.websocket_connections[connection_id]
            logger.info("WebSocket connection unregistered", connection_id=connection_id)
    
    async def subscribe_device(self, connection_id: str, device_id: int):
        """订阅设备实时数据"""
        if connection_id in self.websocket_connections:
            self.websocket_connections[connection_id]["subscribed_devices"].add(device_id)
            logger.info("Device subscription added",
                       connection_id=connection_id,
                       device_id=device_id)

    async def get_network_overview(self) -> dict:
        """获取网络概览数据"""
        try:
            # 获取所有设备的当前指标
            total_traffic = 0
            total_cpu = 0
            device_count = 0

            for device_id, metrics in self.device_metrics.items():
                if metrics and 'collected_at' in metrics:
                    # 检查数据是否过期（5分钟内的数据才有效）
                    if (datetime.now() - metrics['collected_at']).seconds < 300:
                        device_count += 1

                        # 累加网络流量
                        if 'bandwidth_utilization' in metrics:
                            total_traffic += metrics['bandwidth_utilization']

                        # 累加CPU使用率
                        if 'cpu_usage' in metrics:
                            total_cpu += metrics['cpu_usage']

            # 计算平均值和格式化
            if device_count > 0:
                avg_traffic = total_traffic / device_count
                avg_cpu = total_cpu / device_count

                # 格式化网络流量
                if avg_traffic < 1024:
                    traffic_str = f"{avg_traffic:.1f} MB/s"
                else:
                    traffic_str = f"{avg_traffic/1024:.1f} GB/s"

                cpu_str = f"{avg_cpu:.0f}%"
            else:
                # 没有活跃设备时返回默认值
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
            # 返回安全的默认值
            return {
                'total_traffic': "0 MB/s",
                'avg_cpu_usage': "0%",
                'active_devices': 0,
                'monitoring_status': {}
            }

# 全局监控服务实例
monitoring_service = MonitoringService()