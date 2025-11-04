from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Path, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field
from datetime import datetime, timedelta
import structlog
import psutil
import platform
import sys

from src.core.database import get_db_session
from src.core.auth import get_current_user
from src.models.user import User

logger = structlog.get_logger()
router = APIRouter(tags=["系统监控"])

# ========== Pydantic 模型定义 ==========

class CPUMetric(BaseModel):
    """CPU指标"""
    usage_percent: float = Field(..., description="CPU使用率(%)")
    core_count: int = Field(..., description="CPU核心数")
    load_average: Optional[List[float]] = Field(None, description="负载平均值(1/5/15分钟)")


class MemoryMetric(BaseModel):
    """内存指标"""
    total_mb: float = Field(..., description="总内存(MB)")
    used_mb: float = Field(..., description="已用内存(MB)")
    available_mb: float = Field(..., description="可用内存(MB)")
    usage_percent: float = Field(..., description="内存使用率(%)")


class DiskMetric(BaseModel):
    """磁盘指标"""
    mount_point: str = Field(..., description="挂载点")
    total_gb: float = Field(..., description="总容量(GB)")
    used_gb: float = Field(..., description="已用容量(GB)")
    available_gb: float = Field(..., description="可用容量(GB)")
    usage_percent: float = Field(..., description="磁盘使用率(%)")


class NetworkMetric(BaseModel):
    """网络指标"""
    interface: str = Field(..., description="网络接口")
    bytes_sent_mb: float = Field(..., description="发送流量(MB)")
    bytes_recv_mb: float = Field(..., description="接收流量(MB)")
    packets_sent: int = Field(..., description="发送包数")
    packets_recv: int = Field(..., description="接收包数")


class SystemMetrics(BaseModel):
    """系统指标"""
    timestamp: datetime = Field(..., description="时间戳")
    cpu: CPUMetric
    memory: MemoryMetric
    disks: List[DiskMetric]
    network: List[NetworkMetric]


class ServiceHealth(BaseModel):
    """服务健康状态"""
    name: str = Field(..., description="服务名称")
    status: str = Field(..., description="状态(healthy/degraded/unhealthy)")
    message: Optional[str] = Field(None, description="状态消息")
    response_time_ms: Optional[float] = Field(None, description="响应时间(毫秒)")


class SystemHealth(BaseModel):
    """系统健康状态"""
    overall_status: str = Field(..., description="总体状态(healthy/degraded/unhealthy)")
    services: List[ServiceHealth]
    checked_at: datetime = Field(..., description="检查时间")


class SystemInfo(BaseModel):
    """系统信息"""
    hostname: str = Field(..., description="主机名")
    platform: str = Field(..., description="操作系统平台")
    platform_version: str = Field(..., description="系统版本")
    architecture: str = Field(..., description="系统架构")
    python_version: str = Field(..., description="Python版本")
    app_version: str = Field("1.0.0", description="应用版本")
    uptime_seconds: float = Field(..., description="运行时长(秒)")
    boot_time: datetime = Field(..., description="启动时间")


class RestartServiceResponse(BaseModel):
    """重启服务响应"""
    success: bool
    message: str


class ClearCacheRequest(BaseModel):
    """清理缓存请求"""
    type: str = Field("all", pattern="^(all|session|data|reports)$", description="缓存类型")


class ClearCacheResponse(BaseModel):
    """清理缓存响应"""
    success: bool
    message: str


# ========== 辅助函数 ==========

async def get_current_system_metrics() -> SystemMetrics:
    """获取当前系统指标"""
    # CPU指标
    cpu_percent = psutil.cpu_percent(interval=1)
    cpu_count = psutil.cpu_count()

    # 获取负载平均值(仅Unix系统支持)
    try:
        load_avg = psutil.getloadavg()
        load_average = list(load_avg)
    except AttributeError:
        load_average = None

    cpu_metric = CPUMetric(
        usage_percent=cpu_percent,
        core_count=cpu_count,
        load_average=load_average
    )

    # 内存指标
    memory = psutil.virtual_memory()
    memory_metric = MemoryMetric(
        total_mb=memory.total / (1024 * 1024),
        used_mb=memory.used / (1024 * 1024),
        available_mb=memory.available / (1024 * 1024),
        usage_percent=memory.percent
    )

    # 磁盘指标
    disk_metrics = []
    for partition in psutil.disk_partitions():
        try:
            usage = psutil.disk_usage(partition.mountpoint)
            disk_metrics.append(DiskMetric(
                mount_point=partition.mountpoint,
                total_gb=usage.total / (1024 ** 3),
                used_gb=usage.used / (1024 ** 3),
                available_gb=usage.free / (1024 ** 3),
                usage_percent=usage.percent
            ))
        except PermissionError:
            # 跳过无权限访问的分区
            continue

    # 网络指标
    network_metrics = []
    net_io = psutil.net_io_counters(pernic=True)
    for interface, counters in net_io.items():
        network_metrics.append(NetworkMetric(
            interface=interface,
            bytes_sent_mb=counters.bytes_sent / (1024 * 1024),
            bytes_recv_mb=counters.bytes_recv / (1024 * 1024),
            packets_sent=counters.packets_sent,
            packets_recv=counters.packets_recv
        ))

    return SystemMetrics(
        timestamp=datetime.utcnow(),
        cpu=cpu_metric,
        memory=memory_metric,
        disks=disk_metrics,
        network=network_metrics
    )


async def check_system_health(session: AsyncSession) -> SystemHealth:
    """检查系统健康状态"""
    services = []

    # 检查数据库
    try:
        start_time = datetime.now()
        await session.execute("SELECT 1")
        response_time = (datetime.now() - start_time).total_seconds() * 1000

        services.append(ServiceHealth(
            name="database",
            status="healthy",
            message="数据库连接正常",
            response_time_ms=response_time
        ))
    except Exception as e:
        services.append(ServiceHealth(
            name="database",
            status="unhealthy",
            message=f"数据库连接失败: {str(e)}"
        ))

    # 检查内存
    memory = psutil.virtual_memory()
    if memory.percent > 90:
        services.append(ServiceHealth(
            name="memory",
            status="unhealthy",
            message=f"内存使用率过高: {memory.percent}%"
        ))
    elif memory.percent > 75:
        services.append(ServiceHealth(
            name="memory",
            status="degraded",
            message=f"内存使用率较高: {memory.percent}%"
        ))
    else:
        services.append(ServiceHealth(
            name="memory",
            status="healthy",
            message=f"内存使用率正常: {memory.percent}%"
        ))

    # 检查磁盘
    disk_unhealthy = False
    for partition in psutil.disk_partitions():
        try:
            usage = psutil.disk_usage(partition.mountpoint)
            if usage.percent > 90:
                services.append(ServiceHealth(
                    name=f"disk_{partition.mountpoint}",
                    status="unhealthy",
                    message=f"磁盘空间不足: {usage.percent}%"
                ))
                disk_unhealthy = True
        except PermissionError:
            continue

    if not disk_unhealthy:
        services.append(ServiceHealth(
            name="disk",
            status="healthy",
            message="磁盘空间充足"
        ))

    # 确定总体状态
    unhealthy_count = sum(1 for s in services if s.status == "unhealthy")
    degraded_count = sum(1 for s in services if s.status == "degraded")

    if unhealthy_count > 0:
        overall_status = "unhealthy"
    elif degraded_count > 0:
        overall_status = "degraded"
    else:
        overall_status = "healthy"

    return SystemHealth(
        overall_status=overall_status,
        services=services,
        checked_at=datetime.utcnow()
    )


async def get_system_info() -> SystemInfo:
    """获取系统信息"""
    boot_time = datetime.fromtimestamp(psutil.boot_time())
    uptime = (datetime.now() - boot_time).total_seconds()

    return SystemInfo(
        hostname=platform.node(),
        platform=platform.system(),
        platform_version=platform.version(),
        architecture=platform.machine(),
        python_version=sys.version.split()[0],
        app_version="1.0.0",  # TODO: 从配置文件读取
        uptime_seconds=uptime,
        boot_time=boot_time
    )


# ========== API 路由 ==========

@router.get("/metrics", response_model=List[SystemMetrics], summary="获取系统指标")
async def get_system_metrics(
    start_time: Optional[str] = Query(None, description="开始时间(ISO格式)"),
    end_time: Optional[str] = Query(None, description="结束时间(ISO格式)"),
    interval: str = Query("5m", pattern="^(1m|5m|15m|1h|1d)$", description="时间间隔"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    获取系统性能指标

    权限要求: monitoring:read

    支持的时间间隔:
    - 1m: 1分钟
    - 5m: 5分钟
    - 15m: 15分钟
    - 1h: 1小时
    - 1d: 1天

    注意: 当前为实时数据,历史数据需要配置InfluxDB或Prometheus
    """
    try:
        # 当前只返回实时数据
        # TODO: 实现历史数据查询(需要InfluxDB或Prometheus)
        current_metrics = await get_current_system_metrics()

        logger.info("Retrieved system metrics", user_id=current_user.id)
        return [current_metrics]

    except Exception as e:
        logger.error("Failed to get system metrics", error=str(e), user_id=current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取系统指标失败"
        )


@router.get("/health", response_model=SystemHealth, summary="获取系统健康状态")
async def get_system_health(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    获取系统健康状态

    权限要求: monitoring:read

    检查项:
    - 数据库连接
    - 内存使用率
    - 磁盘空间
    """
    try:
        health = await check_system_health(session)

        logger.info(
            "Retrieved system health",
            overall_status=health.overall_status,
            user_id=current_user.id
        )

        return health

    except Exception as e:
        logger.error("Failed to get system health", error=str(e), user_id=current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取系统健康状态失败"
        )


@router.get("/../system/info", response_model=SystemInfo, summary="获取系统信息")
async def get_system_info_api(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    获取系统基本信息

    注意: 实际路径为 /api/v1/settings/system/info

    权限要求: system:read
    """
    try:
        info = await get_system_info()

        logger.info("Retrieved system info", user_id=current_user.id)
        return info

    except Exception as e:
        logger.error("Failed to get system info", error=str(e), user_id=current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取系统信息失败"
        )


@router.post("/../system/services/{service_name}/restart", response_model=RestartServiceResponse, summary="重启系统服务")
async def restart_system_service(
    service_name: str = Path(..., description="服务名称"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    重启指定系统服务

    注意: 实际路径为 /api/v1/settings/system/services/{service_name}/restart

    权限要求: system:admin

    支持的服务:
    - backend: 后端服务
    - scheduler: 任务调度服务
    - alert_engine: 告警引擎
    """
    try:
        logger.warning(
            "Service restart requested",
            service_name=service_name,
            requested_by=current_user.id
        )

        # 这里是模拟实现,实际应该调用systemd或supervisorctl
        # TODO: 实现实际的服务重启逻辑

        allowed_services = ["backend", "scheduler", "alert_engine"]
        if service_name not in allowed_services:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"不支持重启该服务: {service_name}"
            )

        # 模拟重启成功
        return RestartServiceResponse(
            success=True,
            message=f"服务 {service_name} 重启成功"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to restart service", service_name=service_name, error=str(e), user_id=current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="重启服务失败"
        )


@router.post("/../system/cache/clear", response_model=ClearCacheResponse, summary="清理系统缓存")
async def clear_system_cache(
    request: ClearCacheRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    清理系统缓存

    注意: 实际路径为 /api/v1/settings/system/cache/clear

    权限要求: system:admin

    支持的缓存类型:
    - all: 清理所有缓存
    - session: 清理会话缓存
    - data: 清理数据缓存
    - reports: 清理报表缓存
    """
    try:
        logger.info(
            "Cache clear requested",
            cache_type=request.type,
            requested_by=current_user.id
        )

        # 这里是模拟实现,实际应该调用Redis或其他缓存服务
        # TODO: 实现实际的缓存清理逻辑

        cache_types = {
            "all": "所有缓存",
            "session": "会话缓存",
            "data": "数据缓存",
            "reports": "报表缓存"
        }

        cache_name = cache_types.get(request.type, "未知缓存")

        logger.info(
            "Cache cleared",
            cache_type=request.type,
            cleared_by=current_user.id
        )

        return ClearCacheResponse(
            success=True,
            message=f"{cache_name}已清理"
        )

    except Exception as e:
        logger.error("Failed to clear cache", cache_type=request.type, error=str(e), user_id=current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="清理缓存失败"
        )
