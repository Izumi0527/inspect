"""
Monitoring Service
系统监控服务层
"""
from typing import List, Tuple
from datetime import datetime, timedelta
import time
import platform
import structlog

from src.schemas.settings.monitoring import (
    CpuMetrics,
    MemoryMetrics,
    DiskMetrics,
    NetworkMetrics,
    SystemMetrics,
    SystemInfo,
    ServiceHealthInfo,
    ServiceStatus,
    MetricDataPoint,
    MetricHistory
)

logger = structlog.get_logger()

# 可选依赖：psutil
try:
    import psutil
    PSUTIL_AVAILABLE = True
except ImportError:
    PSUTIL_AVAILABLE = False
    logger.warning("psutil module not available, 系统监控功能将使用模拟数据")

# 进程启动时间
_process_start_time = time.time()


class MonitoringService:
    """系统监控服务"""

    def __init__(self):
        # 用于计算网络速率的缓存
        self._last_network_io = None
        self._last_network_time = None

    async def get_current_metrics(self) -> Tuple[SystemMetrics, List[ServiceHealthInfo], SystemInfo]:
        """
        获取当前系统监控指标

        Returns:
            (系统指标, 服务健康状态列表, 系统信息)
        """
        try:
            # 采集系统指标
            cpu_metrics = await self._get_cpu_metrics()
            memory_metrics = await self._get_memory_metrics()
            disk_metrics = await self._get_disk_metrics()
            network_metrics = await self._get_network_metrics()

            metrics = SystemMetrics(
                cpu=cpu_metrics,
                memory=memory_metrics,
                disk=disk_metrics,
                network=network_metrics
            )

            # 获取服务健康状态
            services = await self._get_service_health()

            # 获取系统信息
            system_info = await self._get_system_info()

            logger.debug(
                "Collected monitoring metrics",
                cpu_usage=cpu_metrics.usage,
                memory_usage=memory_metrics.usage,
                disk_usage=disk_metrics.usage
            )

            return metrics, services, system_info

        except Exception as e:
            logger.error("Failed to collect monitoring metrics", error=str(e))
            raise

    async def _get_cpu_metrics(self) -> CpuMetrics:
        """获取CPU指标"""
        if not PSUTIL_AVAILABLE:
            # 返回模拟数据
            return CpuMetrics(usage=45.5, cores=8, temperature=None)

        cpu_percent = psutil.cpu_percent(interval=0.1)
        cpu_count = psutil.cpu_count()

        # 尝试获取CPU温度（部分系统支持）
        temperature = None
        if hasattr(psutil, 'sensors_temperatures'):
            try:
                temps = psutil.sensors_temperatures()
                if temps:
                    # 尝试获取第一个传感器的温度
                    for name, entries in temps.items():
                        if entries:
                            temperature = entries[0].current
                            break
            except Exception:
                pass

        return CpuMetrics(
            usage=round(cpu_percent, 1),
            cores=cpu_count,
            temperature=temperature
        )

    async def _get_memory_metrics(self) -> MemoryMetrics:
        """获取内存指标"""
        if not PSUTIL_AVAILABLE:
            # 返回模拟数据
            return MemoryMetrics(
                total=16 * 1024 * 1024 * 1024,  # 16GB
                used=8 * 1024 * 1024 * 1024,     # 8GB
                free=8 * 1024 * 1024 * 1024,     # 8GB
                usage=50.0
            )

        mem = psutil.virtual_memory()
        return MemoryMetrics(
            total=mem.total,
            used=mem.used,
            free=mem.available,
            usage=round(mem.percent, 1)
        )

    async def _get_disk_metrics(self) -> DiskMetrics:
        """获取磁盘指标"""
        if not PSUTIL_AVAILABLE:
            # 返回模拟数据
            return DiskMetrics(
                total=500 * 1024 * 1024 * 1024,  # 500GB
                used=300 * 1024 * 1024 * 1024,   # 300GB
                free=200 * 1024 * 1024 * 1024,   # 200GB
                usage=60.0
            )

        disk = psutil.disk_usage('/')
        return DiskMetrics(
            total=disk.total,
            used=disk.used,
            free=disk.free,
            usage=round(disk.percent, 1)
        )

    async def _get_network_metrics(self) -> NetworkMetrics:
        """获取网络指标"""
        if not PSUTIL_AVAILABLE:
            # 返回模拟数据
            return NetworkMetrics(
                bytes_sent=1024 * 1024 * 100,      # 100MB
                bytes_received=1024 * 1024 * 500,  # 500MB
                packets_sent=10000,
                packets_received=50000
            )

        net_io = psutil.net_io_counters()
        return NetworkMetrics(
            bytes_sent=net_io.bytes_sent,
            bytes_received=net_io.bytes_recv,
            packets_sent=net_io.packets_sent,
            packets_received=net_io.packets_recv
        )

    async def _get_service_health(self) -> List[ServiceHealthInfo]:
        """获取服务健康状态"""
        # TODO: 实现实际的服务健康检查
        # 这里返回模拟数据
        current_time = int(time.time() - _process_start_time)

        services = [
            ServiceHealthInfo(
                name="FastAPI",
                status=ServiceStatus.HEALTHY,
                response_time=25,
                uptime=current_time
            ),
            ServiceHealthInfo(
                name="PostgreSQL",
                status=ServiceStatus.HEALTHY,
                response_time=10,
                uptime=current_time + 3600  # 假设数据库启动更早
            ),
            ServiceHealthInfo(
                name="Redis",
                status=ServiceStatus.HEALTHY,
                response_time=5,
                uptime=current_time + 3600
            ),
            ServiceHealthInfo(
                name="InfluxDB",
                status=ServiceStatus.HEALTHY,
                response_time=15,
                uptime=current_time + 3600
            )
        ]

        return services

    async def _get_system_info(self) -> SystemInfo:
        """获取系统信息"""
        if not PSUTIL_AVAILABLE:
            # 返回模拟数据
            return SystemInfo(
                hostname="server-01",
                platform="Linux",
                uptime=86400 * 7,  # 7天
                process_uptime=86400 * 2  # 2天
            )

        hostname = platform.node()
        system_platform = f"{platform.system()} {platform.release()}"

        # 系统启动时间
        boot_time = psutil.boot_time()
        system_uptime = int(time.time() - boot_time)

        # 进程运行时间
        process_uptime = int(time.time() - _process_start_time)

        return SystemInfo(
            hostname=hostname,
            platform=system_platform,
            uptime=system_uptime,
            process_uptime=process_uptime
        )

    async def get_metric_history(self, hours: int = 24) -> MetricHistory:
        """
        获取历史监控数据

        Args:
            hours: 获取多少小时的历史数据

        Returns:
            历史指标数据
        """
        try:
            # TODO: 从数据库或时序数据库（如InfluxDB）获取历史数据
            # 这里返回模拟数据
            now = datetime.now()
            data_points = []

            # 生成过去N小时的模拟数据点
            for i in range(hours):
                timestamp = now - timedelta(hours=hours - i)
                data_points.append(MetricDataPoint(
                    timestamp=timestamp,
                    value=40 + (i % 20) * 2  # 模拟波动的数据
                ))

            history = MetricHistory(
                cpu_usage=data_points,
                memory_usage=[
                    MetricDataPoint(timestamp=dp.timestamp, value=dp.value + 10)
                    for dp in data_points
                ],
                disk_usage=[
                    MetricDataPoint(timestamp=dp.timestamp, value=60.0)
                    for dp in data_points
                ],
                network_io=[
                    MetricDataPoint(timestamp=dp.timestamp, value=dp.value * 10)
                    for dp in data_points
                ]
            )

            logger.info("Retrieved metric history", hours=hours, points=len(data_points))
            return history

        except Exception as e:
            logger.error("Failed to get metric history", error=str(e))
            raise


# 全局实例
monitoring_service = MonitoringService()
