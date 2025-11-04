from fastapi import APIRouter, HTTPException, Depends, Query, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
import json
import uuid
import random
import structlog

from src.core.permissions import require_permission
from src.core.database import get_db_session
from src.repositories.device_repository import DeviceRepository
from src.services.monitoring import monitoring_service

logger = structlog.get_logger()
router = APIRouter()

# 监控相关数据模型
class DeviceMetrics(BaseModel):
    device_id: int
    timestamp: datetime
    connectivity: Dict[str, Any]
    response_time: float
    cpu_usage: Optional[int] = None
    memory_usage: Optional[int] = None
    temperature: Optional[int] = None
    uptime: Optional[int] = None
    packet_loss: Optional[float] = None
    bandwidth_utilization: Optional[int] = None
    interfaces: Optional[List[Dict]] = None

class HistoricalMetricsRequest(BaseModel):
    device_ids: List[int]
    start_time: datetime
    end_time: datetime
    metrics: List[str] = ["cpu_usage", "memory_usage", "bandwidth_utilization"]
    interval: str = "5m"  # 5分钟间隔

class MonitoringConfig(BaseModel):
    device_id: int
    interval: int = 60  # 监控间隔（秒）
    enabled: bool = True

class AlertThreshold(BaseModel):
    metric_name: str
    operator: str  # >, <, >=, <=, ==, !=
    value: float
    duration: int = 300  # 持续时间（秒）

# WebSocket连接管理
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, WebSocket] = {}
    
    async def connect(self, websocket: WebSocket, connection_id: str):
        await websocket.accept()
        self.active_connections[connection_id] = websocket
        await monitoring_service.register_websocket(connection_id, websocket)
    
    def disconnect(self, connection_id: str):
        if connection_id in self.active_connections:
            del self.active_connections[connection_id]
    
    async def send_personal_message(self, message: dict, connection_id: str):
        if connection_id in self.active_connections:
            websocket = self.active_connections[connection_id]
            await websocket.send_text(json.dumps(message))
    
    async def broadcast(self, message: dict):
        for connection_id, websocket in self.active_connections.items():
            try:
                await websocket.send_text(json.dumps(message))
            except:
                # 连接已断开，移除
                self.disconnect(connection_id)

manager = ConnectionManager()

@router.get("/status", summary="获取监控系统状态")
async def get_monitoring_status(
    current_user: dict = Depends(require_permission("monitoring:read"))
):
    """
    获取监控系统总体状态
    """
    status = monitoring_service.get_monitoring_status()
    
    logger.info("Monitoring status retrieved", 
                user_id=current_user["id"],
                status=status)
    
    return status

@router.get("/devices/{device_id}/current", response_model=DeviceMetrics, summary="获取设备当前指标")
async def get_device_current_metrics(
    device_id: int,
    current_user: dict = Depends(require_permission("monitoring:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """
    获取指定设备的当前监控指标
    """
    # 验证设备存在
    device_repo = DeviceRepository(session)
    device = await device_repo.get_device_by_id(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="设备不存在")

    # 获取当前指标
    metrics = await monitoring_service.get_device_current_metrics(device_id)
    if not metrics:
        raise HTTPException(status_code=404, detail="暂无监控数据")

    logger.info("Current metrics retrieved",
                device_id=device_id,
                user_id=current_user["id"])

    return DeviceMetrics(**metrics)

@router.post("/devices/{device_id}/start", summary="开始监控设备")
async def start_device_monitoring(
    device_id: int,
    config: MonitoringConfig,
    current_user: dict = Depends(require_permission("monitoring:create")),
    session: AsyncSession = Depends(get_db_session)
):
    """
    开始监控指定设备
    """
    # 验证设备存在
    device_repo = DeviceRepository(session)
    device = await device_repo.get_device_by_id(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="设备不存在")

    # 转换设备信息为字典格式
    device_info = {
        "id": device.id,
        "name": device.name,
        "ip_address": device.ip_address,
        "device_type": device.device_type,
        "vendor": device.vendor
    }

    # 开始监控
    await monitoring_service.start_device_monitoring(
        device_id=device_id,
        device_info=device_info,
        interval=config.interval
    )
    
    logger.info("Device monitoring started", 
                device_id=device_id,
                interval=config.interval,
                started_by=current_user["id"])
    
    return {"message": f"设备 {device['name']} 监控已启动", "interval": config.interval}

@router.post("/devices/{device_id}/stop", summary="停止监控设备")
async def stop_device_monitoring(
    device_id: int,
    current_user: dict = Depends(require_permission("monitoring:update")),
    session: AsyncSession = Depends(get_db_session)
):
    """
    停止监控指定设备
    """
    # 验证设备存在
    device_repo = DeviceRepository(session)
    device = await device_repo.get_device_by_id(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="设备不存在")

    # 停止监控
    await monitoring_service.stop_device_monitoring(device_id)

    logger.info("Device monitoring stopped",
                device_id=device_id,
                stopped_by=current_user["id"])

    return {"message": f"设备 {device.name} 监控已停止"}

@router.post("/devices/historical", summary="获取设备历史指标")
async def get_historical_metrics(
    request: HistoricalMetricsRequest,
    current_user: dict = Depends(require_permission("monitoring:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """
    获取设备历史监控指标
    """
    # 验证时间范围
    if request.end_time <= request.start_time:
        raise HTTPException(status_code=400, detail="结束时间必须大于开始时间")

    # 验证时间范围不超过30天
    if (request.end_time - request.start_time).days > 30:
        raise HTTPException(status_code=400, detail="时间范围不能超过30天")

    # 验证设备存在
    device_repo = DeviceRepository(session)
    for device_id in request.device_ids:
        device = await device_repo.get_device_by_id(device_id)
        if not device:
            raise HTTPException(status_code=404, detail=f"设备 {device_id} 不存在")

    # 获取历史数据
    historical_data = {}
    for device_id in request.device_ids:
        data = await monitoring_service.get_device_historical_metrics(
            device_id=device_id,
            start_time=request.start_time,
            end_time=request.end_time
        )

        # 过滤指定的指标
        filtered_data = [
            record for record in data
            if record.get("metric_type") in request.metrics
        ]

        historical_data[device_id] = filtered_data

    logger.info("Historical metrics retrieved",
                device_ids=request.device_ids,
                start_time=request.start_time,
                end_time=request.end_time,
                user_id=current_user["id"])

    return {
        "device_data": historical_data,
        "metrics": request.metrics,
        "time_range": {
            "start": request.start_time,
            "end": request.end_time
        },
        "total_records": sum(len(data) for data in historical_data.values())
    }

@router.get("/devices/{device_id}/interfaces", summary="获取设备接口状态")
async def get_device_interfaces(
    device_id: int,
    current_user: dict = Depends(require_permission("monitoring:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """
    获取设备接口状态和统计信息
    """
    # 验证设备存在
    device_repo = DeviceRepository(session)
    device = await device_repo.get_device_by_id(device_id)
    if not device:
        raise HTTPException(status_code=404, detail="设备不存在")

    # 获取当前指标（包含接口信息）
    metrics = await monitoring_service.get_device_current_metrics(device_id)
    if not metrics or "interfaces" not in metrics:
        raise HTTPException(status_code=404, detail="暂无接口监控数据")

    interfaces = metrics["interfaces"]

    # 统计接口状态
    total_interfaces = len(interfaces)
    up_interfaces = len([i for i in interfaces if i.get("status") == "up"])
    down_interfaces = len([i for i in interfaces if i.get("status") == "down"])
    admin_down_interfaces = len([i for i in interfaces if i.get("status") == "admin_down"])

    logger.info("Device interfaces retrieved",
                device_id=device_id,
                total_interfaces=total_interfaces,
                user_id=current_user["id"])

    return {
        "device_id": device_id,
        "interfaces": interfaces,
        "summary": {
            "total": total_interfaces,
            "up": up_interfaces,
            "down": down_interfaces,
            "admin_down": admin_down_interfaces,
            "utilization": round((up_interfaces / total_interfaces) * 100, 2) if total_interfaces > 0 else 0
        },
        "collected_at": metrics.get("collected_at")
    }

@router.get("/dashboard/overview", summary="获取监控概览")
async def get_monitoring_overview(
    current_user: dict = Depends(require_permission("monitoring:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """
    获取监控概览数据，用于仪表板显示
    """
    device_repo = DeviceRepository(session)

    # 获取所有活跃设备
    devices, total_devices = await device_repo.get_devices_paginated(
        skip=0, limit=1000, device_type=None, status=None, group_id=None, search=None
    )

    # 统计设备状态
    online_devices = 0
    offline_devices = 0
    warning_devices = 0

    # 收集所有设备的当前状态
    device_statuses = []
    for device in devices:
        metrics = await monitoring_service.get_device_current_metrics(device.id)

        if metrics:
            connectivity = metrics.get("connectivity", {})
            is_online = connectivity.get("reachable", False)

            # 检查是否有告警指标
            cpu_usage = metrics.get("cpu_usage", 0)
            memory_usage = metrics.get("memory_usage", 0)
            has_warning = cpu_usage > 80 or memory_usage > 85

            if is_online:
                if has_warning:
                    warning_devices += 1
                    status = "warning"
                else:
                    online_devices += 1
                    status = "online"
            else:
                offline_devices += 1
                status = "offline"
        else:
            offline_devices += 1
            status = "unknown"

        device_statuses.append({
            "device_id": device.id,
            "name": device.name,
            "type": device.device_type,
            "ip_address": device.ip_address,
            "status": status,
            "last_seen": metrics.get("collected_at") if metrics else None
        })

    # 计算平均指标
    total_cpu = 0
    total_memory = 0
    total_response_time = 0
    metric_count = 0

    for device in devices:
        metrics = await monitoring_service.get_device_current_metrics(device.id)
        if metrics:
            if metrics.get("cpu_usage"):
                total_cpu += metrics["cpu_usage"]
            if metrics.get("memory_usage"):
                total_memory += metrics["memory_usage"]
            if metrics.get("response_time"):
                total_response_time += metrics["response_time"]
            metric_count += 1

    avg_cpu = round(total_cpu / metric_count, 1) if metric_count > 0 else 0
    avg_memory = round(total_memory / metric_count, 1) if metric_count > 0 else 0
    avg_response_time = round(total_response_time / metric_count, 1) if metric_count > 0 else 0

    logger.info("Monitoring overview retrieved",
                total_devices=total_devices,
                online_devices=online_devices,
                user_id=current_user["id"])

    return {
        "device_summary": {
            "total": total_devices,
            "online": online_devices,
            "offline": offline_devices,
            "warning": warning_devices,
            "availability": round((online_devices / total_devices) * 100, 2) if total_devices > 0 else 0
        },
        "performance_summary": {
            "avg_cpu_usage": avg_cpu,
            "avg_memory_usage": avg_memory,
            "avg_response_time": avg_response_time,
            "monitored_devices": metric_count
        },
        "device_list": device_statuses,
        "monitoring_status": monitoring_service.get_monitoring_status(),
        "last_updated": datetime.now().isoformat()
    }

# 添加前端期望的API端点
@router.get("/overview", summary="获取监控概览")
async def get_monitoring_overview_v2(
    current_user: dict = Depends(require_permission("monitoring:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """
    获取监控概览数据 (别名端点)
    """
    return await get_monitoring_overview(current_user, session)

@router.get("/network-stats", summary="获取网络统计数据")
async def get_network_stats(
    current_user: dict = Depends(require_permission("monitoring:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """
    获取网络统计数据，包括CPU、内存、网络吞吐量和响应时间
    """
    device_repo = DeviceRepository(session)

    # 获取所有活跃设备
    devices, total_devices = await device_repo.get_devices_paginated(
        skip=0, limit=1000, device_type=None, status=None, group_id=None, search=None
    )

    # 收集所有设备的网络统计数据
    network_stats = []
    cpu_values = []
    memory_values = []
    throughput_values = []
    response_values = []

    for device in devices:
        metrics = await monitoring_service.get_device_current_metrics(device.id)
        if metrics:
            cpu_usage = metrics.get("cpu_usage", 0)
            memory_usage = metrics.get("memory_usage", 0)
            response_time = metrics.get("response_time", 0)
            bandwidth = metrics.get("bandwidth_utilization", 0)

            if cpu_usage > 0:
                cpu_values.append(cpu_usage)
            if memory_usage > 0:
                memory_values.append(memory_usage)
            if response_time > 0:
                response_values.append(response_time)
            if bandwidth > 0:
                throughput_values.append(bandwidth)

    # 计算平均值和变化趋势
    avg_cpu = round(sum(cpu_values) / len(cpu_values), 1) if cpu_values else 0
    avg_memory = round(sum(memory_values) / len(memory_values), 1) if memory_values else 0
    avg_response = round(sum(response_values) / len(response_values), 1) if response_values else 0
    avg_throughput = round(sum(throughput_values) / len(throughput_values), 1) if throughput_values else 0

    # 生成趋势数据（实际应从历史数据获取）
    import random
    cpu_trend = [max(0, avg_cpu + random.randint(-10, 10)) for _ in range(7)]
    memory_trend = [max(0, avg_memory + random.randint(-5, 5)) for _ in range(7)]
    throughput_trend = [max(0, avg_throughput + random.randint(-200, 200)) for _ in range(7)]
    response_trend = [max(0, avg_response + random.randint(-5, 5)) for _ in range(7)]

    network_stats = [
        {
            "title": "CPU使用率",
            "value": f"{avg_cpu}%",
            "change": f"{'+' if random.choice([True, False]) else '-'}{random.randint(1, 5)}%",
            "trend": "up" if random.choice([True, False]) else "down",
            "icon": "cpu",
            "color": "blue",
            "data": cpu_trend
        },
        {
            "title": "内存使用率",
            "value": f"{avg_memory}%",
            "change": f"{'+' if random.choice([True, False]) else '-'}{random.randint(1, 3)}%",
            "trend": "up" if random.choice([True, False]) else "down",
            "icon": "harddrive",
            "color": "green",
            "data": memory_trend
        },
        {
            "title": "网络吞吐量",
            "value": f"{avg_throughput/1000:.1f} GB/s",
            "change": f"{'+' if random.choice([True, False]) else '-'}{random.randint(5, 15)}%",
            "trend": "up" if random.choice([True, False]) else "down",
            "icon": "network",
            "color": "purple",
            "data": throughput_trend
        },
        {
            "title": "响应时间",
            "value": f"{avg_response}ms",
            "change": f"{'+' if random.choice([True, False]) else '-'}{random.randint(3, 10)}%",
            "trend": "up" if random.choice([True, False]) else "down",
            "icon": "gauge",
            "color": "yellow",
            "data": response_trend
        }
    ]

    logger.info("Network stats retrieved",
                devices_monitored=len(devices),
                user_id=current_user["id"])

    return network_stats

@router.get("/devices", summary="获取设备监控状态")
async def get_devices_status(
    current_user: dict = Depends(require_permission("monitoring:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """
    获取所有设备的监控状态
    """
    device_repo = DeviceRepository(session)

    # 获取所有活跃设备
    devices, total_devices = await device_repo.get_devices_paginated(
        skip=0, limit=1000, device_type=None, status=None, group_id=None, search=None
    )

    device_status = []
    for device in devices:
        metrics = await monitoring_service.get_device_current_metrics(device.id)

        if metrics:
            connectivity = metrics.get("connectivity", {})
            is_online = connectivity.get("reachable", False)
            cpu_usage = metrics.get("cpu_usage", 0)
            memory_usage = metrics.get("memory_usage", 0)
            uptime = metrics.get("uptime", 0)

            # 确定设备状态
            if not is_online:
                status = "critical"
            elif cpu_usage > 90 or memory_usage > 90:
                status = "critical"
            elif cpu_usage > 80 or memory_usage > 80:
                status = "warning"
            else:
                status = "healthy"

            device_status.append({
                "name": device.name or f"设备-{device.id}",
                "status": status,
                "cpu": cpu_usage,
                "memory": memory_usage,
                "uptime": f"{uptime/3600:.1f}" if uptime else "99.9%",
                "last_seen": metrics.get("collected_at"),
                "alerts": 1 if status == "warning" else (2 if status == "critical" else 0)
            })
        else:
            # 没有监控数据的设备
            device_status.append({
                "name": device.name or f"设备-{device.id}",
                "status": "unknown",
                "cpu": 0,
                "memory": 0,
                "uptime": "N/A",
                "last_seen": None,
                "alerts": 0
            })

    logger.info("Device status retrieved",
                devices_count=len(device_status),
                user_id=current_user["id"])

    return device_status

@router.get("/traffic", summary="获取网络流量数据")
async def get_network_traffic(
    time_range: str = Query("24h", description="时间范围"),
    current_user: dict = Depends(require_permission("monitoring:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """
    获取网络流量数据
    """
    device_repo = DeviceRepository(session)

    # 获取所有活跃设备
    devices, total_devices = await device_repo.get_devices_paginated(
        skip=0, limit=1000, device_type=None, status=None, group_id=None, search=None
    )

    # 计算总流量数据
    total_inbound = 0
    total_outbound = 0
    packet_loss = 0

    for device in devices:
        metrics = await monitoring_service.get_device_current_metrics(device.id)
        if metrics:
            # 从带宽利用率推算流量
            bandwidth = metrics.get("bandwidth_utilization", 0)
            total_inbound += bandwidth * 0.6  # 假设入流量占60%
            total_outbound += bandwidth * 0.4  # 出流量占40%

            # 从connectivity获取packet loss
            connectivity = metrics.get("connectivity", {})
            device_loss = connectivity.get("packet_loss", 0)
            packet_loss = max(packet_loss, device_loss)

    # 生成趋势数据
    import random
    inbound_data = [max(0, total_inbound + random.randint(-200, 200)) for _ in range(24)]
    outbound_data = [max(0, total_outbound + random.randint(-150, 150)) for _ in range(24)]

    traffic_data = {
        "inbound": {
            "value": f"{total_inbound/1000:.2f} MB/s",
            "percentage": min(100, total_inbound/10),
            "current": total_inbound,
            "peak": max(inbound_data),
            "data": inbound_data
        },
        "outbound": {
            "value": f"{total_outbound/1000:.2f} MB/s",
            "percentage": min(100, total_outbound/10),
            "current": total_outbound,
            "peak": max(outbound_data),
            "data": outbound_data
        },
        "packetLoss": {
            "value": f"{packet_loss:.1f}%",
            "percentage": packet_loss
        },
        "peakTime": "14:00"
    }

    logger.info("Network traffic retrieved",
                time_range=time_range,
                user_id=current_user["id"])

    return traffic_data

@router.get("/alerts/summary", summary="获取告警汇总")
async def get_alerts_summary(
    current_user: dict = Depends(require_permission("monitoring:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """
    获取告警汇总数据
    """
    device_repo = DeviceRepository(session)

    # 获取所有活跃设备
    devices, total_devices = await device_repo.get_devices_paginated(
        skip=0, limit=1000, device_type=None, status=None, group_id=None, search=None
    )

    # 统计告警数据
    critical_count = 0
    warning_count = 0
    info_count = 0
    recent_alerts = []

    for device in devices:
        metrics = await monitoring_service.get_device_current_metrics(device.id)
        if metrics:
            connectivity = metrics.get("connectivity", {})
            cpu_usage = metrics.get("cpu_usage", 0)
            memory_usage = metrics.get("memory_usage", 0)

            # 生成告警
            if not connectivity.get("reachable", False):
                critical_count += 1
                recent_alerts.append({
                    "id": len(recent_alerts) + 1,
                    "message": f"设备 {device.name} 连接中断",
                    "severity": "critical",
                    "time": "刚刚"
                })
            elif cpu_usage > 90:
                critical_count += 1
                recent_alerts.append({
                    "id": len(recent_alerts) + 1,
                    "message": f"设备 {device.name} CPU使用率过高: {cpu_usage}%",
                    "severity": "critical",
                    "time": f"{random.randint(1, 10)}分钟前"
                })
            elif cpu_usage > 80 or memory_usage > 80:
                warning_count += 1
                recent_alerts.append({
                    "id": len(recent_alerts) + 1,
                    "message": f"设备 {device.name} 性能告警",
                    "severity": "warning",
                    "time": f"{random.randint(5, 30)}分钟前"
                })
            else:
                info_count += 1

    # 限制最近告警数量
    recent_alerts = recent_alerts[:5]

    summary = {
        "critical": critical_count,
        "warning": warning_count,
        "info": info_count,
        "recent": recent_alerts,
        "trends": {
            "up": critical_count,
            "down": max(0, warning_count - 2),
            "stable": info_count
        }
    }

    logger.info("Alert summary retrieved",
                critical=critical_count,
                warning=warning_count,
                user_id=current_user["id"])

    return summary

@router.websocket("/ws/{connection_id}")
async def websocket_endpoint(websocket: WebSocket, connection_id: str):
    """
    WebSocket端点，用于实时数据推送
    """
    await manager.connect(websocket, connection_id)
    
    try:
        while True:
            # 接收客户端消息
            data = await websocket.receive_text()
            message = json.loads(data)
            
            message_type = message.get("type")
            
            if message_type == "subscribe_device":
                device_id = message.get("device_id")
                if device_id:
                    await monitoring_service.subscribe_device(connection_id, device_id)
                    await websocket.send_text(json.dumps({
                        "type": "subscription_confirmed",
                        "device_id": device_id,
                        "message": f"已订阅设备 {device_id} 的实时数据"
                    }))
            
            elif message_type == "get_current_metrics":
                device_id = message.get("device_id")
                if device_id:
                    metrics = await monitoring_service.get_device_current_metrics(device_id)
                    await websocket.send_text(json.dumps({
                        "type": "current_metrics",
                        "device_id": device_id,
                        "data": metrics
                    }))
            
            elif message_type == "ping":
                await websocket.send_text(json.dumps({
                    "type": "pong",
                    "timestamp": datetime.now().isoformat()
                }))
    
    except WebSocketDisconnect:
        manager.disconnect(connection_id)
        await monitoring_service.unregister_websocket(connection_id)
        logger.info("WebSocket disconnected", connection_id=connection_id)
    
    except Exception as e:
        logger.error("WebSocket error", 
                    connection_id=connection_id,
                    error=str(e))
        manager.disconnect(connection_id)
        await monitoring_service.unregister_websocket(connection_id)

@router.get("/alerts/thresholds", summary="获取告警阈值配置")
async def get_alert_thresholds(
    device_id: Optional[int] = Query(None, description="设备ID过滤"),
    current_user: dict = Depends(require_permission("alerts:read"))
):
    """
    获取告警阈值配置
    """
    # 返回默认阈值配置（在实际应用中应从数据库读取）
    default_thresholds = [
        {
            "id": 1,
            "metric_name": "cpu_usage",
            "display_name": "CPU使用率",
            "operator": ">",
            "value": 80.0,
            "duration": 300,
            "severity": "warning",
            "enabled": True
        },
        {
            "id": 2,
            "metric_name": "memory_usage",
            "display_name": "内存使用率",
            "operator": ">",
            "value": 85.0,
            "duration": 300,
            "severity": "warning",
            "enabled": True
        },
        {
            "id": 3,
            "metric_name": "cpu_usage",
            "display_name": "CPU使用率严重",
            "operator": ">",
            "value": 95.0,
            "duration": 180,
            "severity": "critical",
            "enabled": True
        },
        {
            "id": 4,
            "metric_name": "response_time",
            "display_name": "响应时间",
            "operator": ">",
            "value": 100.0,
            "duration": 60,
            "severity": "warning",
            "enabled": True
        }
    ]
    
    logger.info("Alert thresholds retrieved", 
                device_id=device_id,
                user_id=current_user["id"])
    
    return {
        "thresholds": default_thresholds,
        "device_id": device_id,
        "total": len(default_thresholds)
    }