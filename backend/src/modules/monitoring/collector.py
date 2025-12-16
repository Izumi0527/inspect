"""
监控数据采集器

职责：
- 设备指标数据采集
- 连通性检查
- 采集任务调度
"""
import asyncio
import random
from datetime import datetime
from typing import Dict, Any, Optional
import structlog

logger = structlog.get_logger()


class MetricsCollector:
    """指标数据采集器"""
    
    def __init__(self):
        self.active_monitors: Dict[int, Dict[str, Any]] = {}
        self._storage = None
        self._notifier = None
    
    def set_storage(self, storage: "MetricsStorage"):
        """设置存储服务（延迟注入避免循环依赖）"""
        self._storage = storage
    
    def set_notifier(self, notifier):
        """设置通知服务"""
        self._notifier = notifier
    
    async def start_device_monitoring(
        self, 
        device_id: int, 
        device_info: dict, 
        interval: int = 60
    ) -> bool:
        """开始监控设备"""
        if device_id in self.active_monitors:
            logger.warning("Device monitoring already active", device_id=device_id)
            return False
        
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
        return True
    
    async def stop_device_monitoring(self, device_id: int) -> bool:
        """停止监控设备"""
        if device_id not in self.active_monitors:
            return False
        
        self.active_monitors[device_id]["status"] = "stopped"
        del self.active_monitors[device_id]
        logger.info("Device monitoring stopped", device_id=device_id)
        return True
    
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
                metrics = await self.collect_device_metrics(device_info)
                
                # 更新监控状态
                monitor_info["last_collection"] = datetime.now()
                monitor_info["error_count"] = 0
                
                # 存储到时序数据库
                if self._storage:
                    await self._storage.store_metrics(device_id, metrics)
                
                # 发送实时数据到WebSocket客户端
                if self._notifier:
                    await self._notifier.broadcast_metrics(device_id, metrics)
                
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
    
    async def collect_device_metrics(self, device_info: dict) -> dict:
        """收集设备指标数据"""
        device_type = device_info.get("device_type", "unknown")
        ip_address = device_info.get("ip_address")
        
        # 基础指标
        metrics = {
            "timestamp": datetime.now().isoformat(),
            "connectivity": await self._check_connectivity(ip_address),
            "response_time": random.uniform(1.0, 50.0),
        }
        
        # 根据设备类型收集特定指标
        if device_type in ["switch", "router"]:
            metrics.update(await self._collect_network_device_metrics())
        elif device_type == "server":
            metrics.update(await self._collect_server_metrics())
        
        return metrics
    
    async def _check_connectivity(self, ip_address: str) -> dict:
        """检查设备连通性"""
        try:
            await asyncio.sleep(0.1)  # 模拟网络延迟
            is_online = random.random() > 0.1  # 90%概率在线
            
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
    
    async def _collect_network_device_metrics(self) -> dict:
        """收集网络设备指标"""
        metrics = {
            "cpu_usage": random.randint(10, 90),
            "memory_usage": random.randint(20, 85),
            "temperature": random.randint(25, 65),
            "uptime": random.randint(86400, 8640000),
            "packet_loss": random.uniform(0, 0.1),
            "bandwidth_utilization": random.randint(5, 95),
            "interface_count": random.randint(24, 48),
            "active_interfaces": random.randint(20, 45),
        }
        
        # 接口统计
        interfaces = []
        for i in range(1, random.randint(5, 9)):
            interfaces.append({
                "name": f"GigabitEthernet0/{i}",
                "status": random.choice(["up", "down", "admin_down"]),
                "speed": 1000,
                "in_octets": random.randint(1000000, 100000000),
                "out_octets": random.randint(1000000, 100000000),
                "in_packets": random.randint(10000, 1000000),
                "out_packets": random.randint(10000, 1000000),
                "in_errors": random.randint(0, 100),
                "out_errors": random.randint(0, 100),
            })
        metrics["interfaces"] = interfaces
        
        return metrics
    
    async def _collect_server_metrics(self) -> dict:
        """收集服务器指标"""
        return {
            "cpu_usage": random.randint(5, 95),
            "memory_usage": random.randint(10, 90),
            "disk_usage": random.randint(15, 85),
            "network_io": random.randint(1000, 100000),
            "disk_io": random.randint(100, 10000),
            "load_average": random.uniform(0.1, 4.0),
            "process_count": random.randint(50, 300),
            "tcp_connections": random.randint(10, 1000),
        }
    
    def get_monitor_status(self, device_id: int) -> Optional[dict]:
        """获取设备监控状态"""
        return self.active_monitors.get(device_id)
    
    def get_all_monitors_status(self) -> dict:
        """获取所有监控状态"""
        active_count = len([m for m in self.active_monitors.values() if m["status"] == "running"])
        error_count = len([m for m in self.active_monitors.values() if m["status"] == "error"])
        
        return {
            "total_devices": len(self.active_monitors),
            "active_monitoring": active_count,
            "error_monitoring": error_count,
            "last_updated": datetime.now().isoformat()
        }


# 全局采集器实例
metrics_collector = MetricsCollector()
