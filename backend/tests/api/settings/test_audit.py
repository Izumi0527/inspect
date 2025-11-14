"""
Audit API Unit Tests
审计日志API单元测试

测试覆盖：1个核心API端点
"""

import pytest
from unittest.mock import patch
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport
from datetime import datetime

from src.api.settings.audit import router
from src.schemas.settings.audit import AuditStats
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
def mock_audit_stats():
    """Mock审计统计数据"""
    return AuditStats(
        total_logs=10000,
        logs_today=150,
        logs_this_week=1200,
        logs_this_month=5000,
        logs_by_action={
            "CREATE": 3000,
            "UPDATE": 4000,
            "DELETE": 2000,
            "LOGIN": 1000
        },
        logs_by_status={
            "SUCCESS": 9500,
            "FAILED": 500
        },
        logs_by_resource_type={
            "USER": 3000,
            "DEVICE": 4000,
            "SETTINGS": 2000,
            "ALERT": 1000
        },
        top_active_users=[
            {"user_id": 1, "username": "admin", "count": 500},
            {"user_id": 2, "username": "operator1", "count": 300}
        ],
        top_actions=[
            {"action": "UPDATE", "count": 4000},
            {"action": "CREATE", "count": 3000}
        ],
        failed_operations_count=500,
        failed_operations_rate=5.0
    )


# ==================== 测试用例 ====================

@pytest.mark.asyncio
async def test_get_audit_stats(app, mock_audit_stats):
    """测试获取审计统计数据"""
    with patch("src.api.settings.audit.audit_settings_service.get_audit_statistics") as mock_get:
        mock_get.return_value = mock_audit_stats

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/settings/audit/stats")

        assert response.status_code == 200
        data = response.json()

        # 验证基础统计
        assert data["total_logs"] == 10000
        assert data["logs_today"] == 150
        assert data["logs_this_week"] == 1200
        assert data["logs_this_month"] == 5000

        # 验证操作类型统计
        assert "logs_by_action" in data
        assert data["logs_by_action"]["CREATE"] == 3000
        assert data["logs_by_action"]["UPDATE"] == 4000

        # 验证状态统计
        assert "logs_by_status" in data
        assert data["logs_by_status"]["SUCCESS"] == 9500
        assert data["logs_by_status"]["FAILED"] == 500

        # 验证资源类型统计
        assert "logs_by_resource_type" in data
        assert data["logs_by_resource_type"]["USER"] == 3000

        # 验证Top列表
        assert "top_active_users" in data
        assert len(data["top_active_users"]) == 2
        assert data["top_active_users"][0]["username"] == "admin"

        assert "top_actions" in data
        assert len(data["top_actions"]) == 2

        # 验证失败率
        assert data["failed_operations_count"] == 500
        assert data["failed_operations_rate"] == 5.0


@pytest.mark.asyncio
async def test_get_audit_stats_empty(app):
    """测试获取审计统计数据 - 空数据"""
    empty_stats = AuditStats(
        total_logs=0,
        logs_today=0,
        logs_this_week=0,
        logs_this_month=0,
        logs_by_action={},
        logs_by_status={},
        logs_by_resource_type={},
        top_active_users=[],
        top_actions=[],
        failed_operations_count=0,
        failed_operations_rate=0.0
    )

    with patch("src.api.settings.audit.audit_settings_service.get_audit_statistics") as mock_get:
        mock_get.return_value = empty_stats

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/settings/audit/stats")

        assert response.status_code == 200
        data = response.json()
        assert data["total_logs"] == 0
        assert len(data["top_active_users"]) == 0


@pytest.mark.asyncio
async def test_get_audit_stats_error(app):
    """测试获取审计统计数据 - 错误处理"""
    with patch("src.api.settings.audit.audit_settings_service.get_audit_statistics") as mock_get:
        mock_get.side_effect = Exception("Database error")

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/settings/audit/stats")

        assert response.status_code == 500
        assert "获取审计统计失败" in response.json()["detail"]


@pytest.mark.asyncio
async def test_audit_stats_service_called(app, mock_audit_stats):
    """测试审计统计服务被正确调用"""
    with patch("src.api.settings.audit.audit_settings_service.get_audit_statistics") as mock_get:
        mock_get.return_value = mock_audit_stats

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            await client.get("/settings/audit/stats")

        # 验证服务方法被调用一次
        mock_get.assert_called_once()


@pytest.mark.asyncio
async def test_audit_stats_response_structure(app, mock_audit_stats):
    """测试审计统计响应结构完整性"""
    with patch("src.api.settings.audit.audit_settings_service.get_audit_statistics") as mock_get:
        mock_get.return_value = mock_audit_stats

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/settings/audit/stats")

        data = response.json()

        # 验证所有必需字段存在
        required_fields = [
            "total_logs", "logs_today", "logs_this_week", "logs_this_month",
            "logs_by_action", "logs_by_status", "logs_by_resource_type",
            "top_active_users", "top_actions",
            "failed_operations_count", "failed_operations_rate"
        ]

        for field in required_fields:
            assert field in data, f"Missing required field: {field}"


if __name__ == "__main__":
    # 运行测试: pytest backend/tests/api/settings/test_audit.py -v
    pass
