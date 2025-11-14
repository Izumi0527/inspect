"""
Users API Unit Tests
用户管理API单元测试

测试覆盖：2个核心API端点
"""

import pytest
from unittest.mock import patch
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport

from src.api.settings.users import router
from src.schemas.settings.users import (
    BatchUserOperationResponse,
    BatchOperationResult,
    BatchOperationType,
    UserStats
)
from src.models.user import User


# ==================== Fixtures ====================

@pytest.fixture
def mock_current_user():
    """Mock当前用户"""
    return User(
        id=1,
        username="test_admin",
        email="admin@example.com",
        full_name="Test Admin",
        is_active=True,
        is_superuser=True
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
def mock_user_stats():
    """Mock用户统计数据"""
    return UserStats(
        total_users=100,
        active_users=85,
        inactive_users=10,
        locked_users=5,
        online_users=15,
        users_by_role={
            "admin": 5,
            "operator": 30,
            "viewer": 65
        },
        new_users_today=2,
        new_users_this_week=8,
        new_users_this_month=25,
        login_count_today=45,
        login_count_this_week=320,
        recent_active_users=[
            {"user_id": 10, "username": "user1", "last_login": "2025-01-25T10:00:00"},
            {"user_id": 11, "username": "user2", "last_login": "2025-01-25T09:30:00"}
        ]
    )


# ==================== 测试用例 ====================

@pytest.mark.asyncio
async def test_batch_operate_users_activate(app):
    """测试批量激活用户"""
    mock_response = BatchUserOperationResponse(
        success_count=3,
        failed_count=0,
        results=[
            BatchOperationResult(user_id=1, success=True, message="激活成功"),
            BatchOperationResult(user_id=2, success=True, message="激活成功"),
            BatchOperationResult(user_id=3, success=True, message="激活成功")
        ],
        message="批量操作完成：成功 3 个，失败 0 个"
    )

    with patch("src.api.settings.users.user_settings_service.batch_operate_users") as mock_batch:
        mock_batch.return_value = (3, 0, mock_response.results)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/settings/users/batch",
                json={
                    "user_ids": [1, 2, 3],
                    "operation": "activate",
                    "params": {}
                }
            )

        assert response.status_code == 200
        data = response.json()
        assert data["success_count"] == 3
        assert data["failed_count"] == 0
        assert len(data["results"]) == 3


@pytest.mark.asyncio
async def test_batch_operate_users_partial_failure(app):
    """测试批量操作用户 - 部分失败"""
    mock_results = [
        BatchOperationResult(user_id=1, success=True, message="停用成功"),
        BatchOperationResult(user_id=2, success=False, message="用户不存在"),
        BatchOperationResult(user_id=3, success=True, message="停用成功")
    ]

    with patch("src.api.settings.users.user_settings_service.batch_operate_users") as mock_batch:
        mock_batch.return_value = (2, 1, mock_results)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/settings/users/batch",
                json={
                    "user_ids": [1, 2, 3],
                    "operation": "deactivate"
                }
            )

        assert response.status_code == 200
        data = response.json()
        assert data["success_count"] == 2
        assert data["failed_count"] == 1
        assert not data["results"][1]["success"]


@pytest.mark.asyncio
async def test_batch_operate_users_assign_role(app):
    """测试批量分配角色"""
    mock_results = [
        BatchOperationResult(user_id=1, success=True, message="角色分配成功")
    ]

    with patch("src.api.settings.users.user_settings_service.batch_operate_users") as mock_batch:
        mock_batch.return_value = (1, 0, mock_results)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/settings/users/batch",
                json={
                    "user_ids": [1],
                    "operation": "assign_role",
                    "params": {"role": "admin"}
                }
            )

        assert response.status_code == 200
        data = response.json()
        assert data["success_count"] == 1


@pytest.mark.asyncio
async def test_batch_operate_users_invalid_request(app):
    """测试批量操作用户 - 无效请求"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 空的user_ids列表
        response = await client.post(
            "/settings/users/batch",
            json={
                "user_ids": [],
                "operation": "activate"
            }
        )

    assert response.status_code == 422  # Validation error


@pytest.mark.asyncio
async def test_batch_operate_users_error(app):
    """测试批量操作用户 - 错误处理"""
    with patch("src.api.settings.users.user_settings_service.batch_operate_users") as mock_batch:
        mock_batch.side_effect = Exception("Database error")

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/settings/users/batch",
                json={
                    "user_ids": [1, 2],
                    "operation": "activate"
                }
            )

        assert response.status_code == 500
        assert "批量操作失败" in response.json()["detail"]


@pytest.mark.asyncio
async def test_get_user_stats(app, mock_user_stats):
    """测试获取用户统计数据"""
    with patch("src.api.settings.users.user_settings_service.get_user_statistics") as mock_get:
        mock_get.return_value = mock_user_stats

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/settings/users/stats")

        assert response.status_code == 200
        data = response.json()

        # 验证基础统计
        assert data["total_users"] == 100
        assert data["active_users"] == 85
        assert data["inactive_users"] == 10
        assert data["locked_users"] == 5
        assert data["online_users"] == 15

        # 验证角色统计
        assert "users_by_role" in data
        assert data["users_by_role"]["admin"] == 5
        assert data["users_by_role"]["operator"] == 30
        assert data["users_by_role"]["viewer"] == 65

        # 验证时间统计
        assert data["new_users_today"] == 2
        assert data["new_users_this_week"] == 8
        assert data["new_users_this_month"] == 25

        # 验证登录统计
        assert data["login_count_today"] == 45
        assert data["login_count_this_week"] == 320

        # 验证最近活跃用户
        assert "recent_active_users" in data
        assert len(data["recent_active_users"]) == 2


@pytest.mark.asyncio
async def test_get_user_stats_empty(app):
    """测试获取用户统计数据 - 空数据"""
    empty_stats = UserStats(
        total_users=0,
        active_users=0,
        inactive_users=0,
        locked_users=0,
        online_users=0,
        users_by_role={},
        new_users_today=0,
        new_users_this_week=0,
        new_users_this_month=0,
        login_count_today=0,
        login_count_this_week=0,
        recent_active_users=[]
    )

    with patch("src.api.settings.users.user_settings_service.get_user_statistics") as mock_get:
        mock_get.return_value = empty_stats

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/settings/users/stats")

        assert response.status_code == 200
        data = response.json()
        assert data["total_users"] == 0
        assert len(data["recent_active_users"]) == 0


@pytest.mark.asyncio
async def test_get_user_stats_error(app):
    """测试获取用户统计数据 - 错误处理"""
    with patch("src.api.settings.users.user_settings_service.get_user_statistics") as mock_get:
        mock_get.side_effect = Exception("Database error")

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/settings/users/stats")

        assert response.status_code == 500
        assert "获取用户统计失败" in response.json()["detail"]


@pytest.mark.asyncio
async def test_batch_operation_types(app):
    """测试所有批量操作类型"""
    operations = [
        "activate",
        "deactivate",
        "delete",
        "reset_password",
        "unlock",
        "assign_role"
    ]

    mock_results = [BatchOperationResult(user_id=1, success=True, message="操作成功")]

    for operation in operations:
        with patch("src.api.settings.users.user_settings_service.batch_operate_users") as mock_batch:
            mock_batch.return_value = (1, 0, mock_results)

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                payload = {
                    "user_ids": [1],
                    "operation": operation
                }
                if operation == "assign_role":
                    payload["params"] = {"role": "admin"}

                response = await client.post("/settings/users/batch", json=payload)

            assert response.status_code == 200, f"Failed for operation: {operation}"


if __name__ == "__main__":
    # 运行测试: pytest backend/tests/api/settings/test_users.py -v
    pass
