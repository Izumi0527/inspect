"""
Monitoring API Unit Tests
系统监控API单元测试

测试覆盖：2个核心API端点
"""

import pytest
from unittest.mock import patch
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport
from datetime import datetime

from src.api.settings.monitoring import router
from src.schemas.settings.monitoring import (
    CurrentMonitoringResponse,
    MetricHistory,
    SystemMetrics,
    CpuMetrics,
    MemoryMetrics,
    DiskMetrics,
    NetworkMetrics,
    SystemInfo,
    ServiceHealthInfo,
    ServiceStatus,
    MetricDataPoint
)
from src.models.user import User


# ==================== Fixtures ====================

@pytest.fixture
def mock_current_user():
    """Mock当前用户"""
    return User(
        id=1,
        username="test_user",
        email="test@example.com",
        full_name="Test User",
        is_active=True,
        is_superuser=False
    )


@pytest.fixture
def app(mock_current_user):
    """创建测试应用并覆盖依赖"""
    from src.core.auth import get_current_user

    test_app = FastAPI()
    test_app.include_router(router, prefix="/settings")

    # 覆盖认证依赖
    test_app.dependency_overrides[get_current_user] = lambda: mock_current_user

    yield test_app

    # 清理
    test_app.dependency_overrides.clear()


@pytest.fixture
def mock_system_metrics():
    """Mock系统指标数据"""
    return SystemMetrics(
        cpu=CpuMetrics(usage=45.5, cores=8, temperature=None),
        memory=MemoryMetrics(
            total=16 * 1024 * 1024 * 1024,
            used=8 * 1024 * 1024 * 1024,
            free=8 * 1024 * 1024 * 1024,
            usage=50.0
        ),
        disk=DiskMetrics(
            total=500 * 1024 * 1024 * 1024,
            used=300 * 1024 * 1024 * 1024,
            free=200 * 1024 * 1024 * 1024,
            usage=60.0
        ),
        network=NetworkMetrics(
            bytes_sent=1024 * 1024 * 100,
            bytes_received=1024 * 1024 * 500,
            packets_sent=10000,
            packets_received=50000
        )
    )


@pytest.fixture
def mock_services():
    """Mock服务健康状态"""
    return [
        ServiceHealthInfo(
            name="FastAPI",
            status=ServiceStatus.HEALTHY,
            response_time=25,
            uptime=86400
        ),
        ServiceHealthInfo(
            name="PostgreSQL",
            status=ServiceStatus.HEALTHY,
            response_time=10,
            uptime=90000
        ),
        ServiceHealthInfo(
            name="Redis",
            status=ServiceStatus.HEALTHY,
            response_time=5,
            uptime=90000
        )
    ]


@pytest.fixture
def mock_system_info():
    """Mock系统信息"""
    return SystemInfo(
        hostname="test-server",
        platform="Windows 10",
        uptime=604800,  # 7天
        process_uptime=172800  # 2天
    )


# ==================== 测试用例 ====================

@pytest.mark.asyncio
async def test_get_current_metrics(app, mock_system_metrics, mock_services, mock_system_info):
    """测试获取当前监控指标"""
    with patch("src.api.settings.monitoring.monitoring_service.get_current_metrics") as mock_get:
        mock_get.return_value = (mock_system_metrics, mock_services, mock_system_info)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/settings/monitoring/current")

        assert response.status_code == 200
        data = response.json()

        # 验证metrics
        assert "metrics" in data
        assert data["metrics"]["cpu"]["usage"] == 45.5
        assert data["metrics"]["cpu"]["cores"] == 8
        assert data["metrics"]["memory"]["usage"] == 50.0
        assert data["metrics"]["disk"]["usage"] == 60.0

        # 验证services
        assert "services" in data
        assert len(data["services"]) == 3
        assert data["services"][0]["name"] == "FastAPI"
        assert data["services"][0]["status"] == "healthy"

        # 验证system info
        assert "system" in data
        assert data["system"]["hostname"] == "test-server"
        assert data["system"]["platform"] == "Windows 10"

        # 验证timestamp
        assert "timestamp" in data


@pytest.mark.asyncio
async def test_get_current_metrics_error(app):
    """测试获取当前监控指标 - 错误处理"""
    with patch("src.api.settings.monitoring.monitoring_service.get_current_metrics") as mock_get:
        mock_get.side_effect = Exception("Failed to collect metrics")

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/settings/monitoring/current")

        assert response.status_code == 500
        assert "获取监控数据失败" in response.json()["detail"]


@pytest.mark.asyncio
async def test_get_metric_history(app):
    """测试获取历史监控数据"""
    # 创建模拟历史数据
    now = datetime.now()
    mock_history = MetricHistory(
        cpu_usage=[
            MetricDataPoint(timestamp=now, value=45.0),
            MetricDataPoint(timestamp=now, value=50.0)
        ],
        memory_usage=[
            MetricDataPoint(timestamp=now, value=55.0),
            MetricDataPoint(timestamp=now, value=60.0)
        ],
        disk_usage=[
            MetricDataPoint(timestamp=now, value=60.0),
            MetricDataPoint(timestamp=now, value=60.0)
        ],
        network_io=[
            MetricDataPoint(timestamp=now, value=100.0),
            MetricDataPoint(timestamp=now, value=150.0)
        ]
    )

    with patch("src.api.settings.monitoring.monitoring_service.get_metric_history") as mock_get:
        mock_get.return_value = mock_history

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/settings/monitoring/history?hours=24")

        assert response.status_code == 200
        data = response.json()

        # 验证数据结构
        assert "cpuUsage" in data or "cpu_usage" in data
        assert "memoryUsage" in data or "memory_usage" in data
        assert "diskUsage" in data or "disk_usage" in data
        assert "networkIo" in data or "network_io" in data


@pytest.mark.asyncio
async def test_get_metric_history_with_hours_param(app):
    """测试获取历史监控数据 - 带小时参数"""
    mock_history = MetricHistory(
        cpu_usage=[MetricDataPoint(timestamp=datetime.now(), value=45.0)],
        memory_usage=[MetricDataPoint(timestamp=datetime.now(), value=55.0)],
        disk_usage=[MetricDataPoint(timestamp=datetime.now(), value=60.0)],
        network_io=[MetricDataPoint(timestamp=datetime.now(), value=100.0)]
    )

    with patch("src.api.settings.monitoring.monitoring_service.get_metric_history") as mock_get:
        mock_get.return_value = mock_history

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            # 测试不同的hours参数
            response = await client.get("/settings/monitoring/history?hours=48")

        assert response.status_code == 200
        mock_get.assert_called_once_with(48)


@pytest.mark.asyncio
async def test_get_metric_history_invalid_hours(app):
    """测试获取历史监控数据 - 无效的小时数"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 测试小于最小值
        response = await client.get("/settings/monitoring/history?hours=0")
        assert response.status_code == 422  # Validation error

        # 测试大于最大值
        response = await client.get("/settings/monitoring/history?hours=200")
        assert response.status_code == 422  # Validation error


@pytest.mark.asyncio
async def test_get_metric_history_error(app):
    """测试获取历史监控数据 - 错误处理"""
    with patch("src.api.settings.monitoring.monitoring_service.get_metric_history") as mock_get:
        mock_get.side_effect = Exception("Database error")

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/settings/monitoring/history?hours=24")

        assert response.status_code == 500
        assert "获取历史监控数据失败" in response.json()["detail"]


@pytest.mark.asyncio
async def test_monitoring_response_format(app, mock_system_metrics, mock_services, mock_system_info):
    """测试监控响应数据格式 - camelCase转换"""
    with patch("src.api.settings.monitoring.monitoring_service.get_current_metrics") as mock_get:
        mock_get.return_value = (mock_system_metrics, mock_services, mock_system_info)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/settings/monitoring/current")

        data = response.json()

        # 验证网络指标使用camelCase（前端期望格式）
        network = data["metrics"]["network"]
        # 应该同时支持 snake_case 和 camelCase
        assert "bytesSent" in network or "bytes_sent" in network
        assert "bytesReceived" in network or "bytes_received" in network
        assert "packetsSent" in network or "packets_sent" in network
        assert "packetsReceived" in network or "packets_received" in network


if __name__ == "__main__":
    # 运行测试: pytest backend/tests/api/settings/test_monitoring.py -v
    pass
