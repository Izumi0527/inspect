"""
Security API Unit Tests
安全配置API单元测试

测试覆盖：4个核心API端点
"""

import pytest
from unittest.mock import patch
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport
from datetime import datetime

from src.api.settings.security import router
from src.schemas.settings.security import (
    TestLdapResponse,
    SyncLdapUsersResponse,
    SessionListResponse,
    DeleteSessionResponse,
    SessionInfo
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
def mock_session_info():
    """Mock会话信息"""
    return [
        SessionInfo(
            session_id="session_123",
            user_id=1,
            username="admin",
            ip_address="192.168.1.100",
            user_agent="Mozilla/5.0",
            created_at=datetime.now(),
            last_activity=datetime.now(),
            expires_at=None,
            is_active=True
        ),
        SessionInfo(
            session_id="session_456",
            user_id=2,
            username="operator",
            ip_address="192.168.1.101",
            user_agent="Chrome/120.0",
            created_at=datetime.now(),
            last_activity=datetime.now(),
            expires_at=None,
            is_active=True
        )
    ]


# ==================== LDAP测试用例 ====================

@pytest.mark.asyncio
async def test_ldap_connection_success(app):
    """测试LDAP连接 - 成功"""
    with patch("src.api.settings.security.security_settings_service.test_ldap_connection") as mock_test:
        mock_test.return_value = (True, "LDAP连接成功", 50)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/settings/security/test-ldap",
                json={
                    "server_url": "ldap://192.168.1.100",
                    "port": 389,
                    "bind_dn": "cn=admin,dc=example,dc=com",
                    "bind_password": "password",
                    "base_dn": "dc=example,dc=com",
                    "use_ssl": False
                }
            )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "成功" in data["message"]
        assert data["user_count"] == 50


@pytest.mark.asyncio
async def test_ldap_connection_failure(app):
    """测试LDAP连接 - 失败"""
    with patch("src.api.settings.security.security_settings_service.test_ldap_connection") as mock_test:
        mock_test.return_value = (False, "无法连接到LDAP服务器", None)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/settings/security/test-ldap",
                json={
                    "server_url": "ldap://invalid-server",
                    "port": 389,
                    "bind_dn": "cn=admin,dc=example,dc=com",
                    "bind_password": "wrong_password",
                    "base_dn": "dc=example,dc=com",
                    "use_ssl": False
                }
            )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is False
        assert "连接" in data["message"]
        assert data["user_count"] is None


@pytest.mark.asyncio
async def test_ldap_connection_error(app):
    """测试LDAP连接 - 错误处理"""
    with patch("src.api.settings.security.security_settings_service.test_ldap_connection") as mock_test:
        mock_test.side_effect = Exception("LDAP server timeout")

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/settings/security/test-ldap",
                json={
                    "server_url": "ldap://192.168.1.100",
                    "port": 389
                }
            )

        assert response.status_code == 500
        assert "LDAP测试失败" in response.json()["detail"]


# ==================== LDAP同步用例 ====================

@pytest.mark.asyncio
async def test_sync_ldap_users_success(app):
    """测试LDAP用户同步 - 成功"""
    with patch("src.api.settings.security.security_settings_service.sync_ldap_users") as mock_sync:
        mock_sync.return_value = (True, "同步成功", 100, 20, 30, 40, 10)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/settings/security/sync-ldap-users",
                json={
                    "dry_run": False,
                    "user_filter": "(objectClass=person)"
                }
            )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["total_found"] == 100
        assert data["created"] == 20
        assert data["updated"] == 30
        assert data["skipped"] == 40
        assert data["failed"] == 10
        assert data["dry_run"] is False


@pytest.mark.asyncio
async def test_sync_ldap_users_dry_run(app):
    """测试LDAP用户同步 - 模拟运行"""
    with patch("src.api.settings.security.security_settings_service.sync_ldap_users") as mock_sync:
        mock_sync.return_value = (True, "模拟运行完成", 100, 0, 0, 0, 0)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/settings/security/sync-ldap-users",
                json={
                    "dry_run": True,
                    "user_filter": "(objectClass=person)"
                }
            )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["dry_run"] is True
        assert data["created"] == 0
        assert data["updated"] == 0


@pytest.mark.asyncio
async def test_sync_ldap_users_failure(app):
    """测试LDAP用户同步 - 失败"""
    with patch("src.api.settings.security.security_settings_service.sync_ldap_users") as mock_sync:
        mock_sync.return_value = (False, "LDAP连接失败", 0, 0, 0, 0, 0)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/settings/security/sync-ldap-users",
                json={
                    "dry_run": False
                }
            )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is False
        assert "失败" in data["message"]


@pytest.mark.asyncio
async def test_sync_ldap_users_error(app):
    """测试LDAP用户同步 - 错误处理"""
    with patch("src.api.settings.security.security_settings_service.sync_ldap_users") as mock_sync:
        mock_sync.side_effect = Exception("Database error")

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/settings/security/sync-ldap-users",
                json={
                    "dry_run": False
                }
            )

        assert response.status_code == 500
        assert "LDAP用户同步失败" in response.json()["detail"]


# ==================== 会话管理用例 ====================

@pytest.mark.asyncio
async def test_get_sessions(app, mock_session_info):
    """测试获取活跃会话列表"""
    with patch("src.api.settings.security.security_settings_service.get_active_sessions") as mock_get:
        mock_get.return_value = mock_session_info

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/settings/security/sessions")

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 2
        assert len(data["sessions"]) == 2
        assert data["sessions"][0]["session_id"] == "session_123"
        assert data["sessions"][0]["username"] == "admin"
        assert data["sessions"][1]["session_id"] == "session_456"


@pytest.mark.asyncio
async def test_get_sessions_empty(app):
    """测试获取活跃会话列表 - 空列表"""
    with patch("src.api.settings.security.security_settings_service.get_active_sessions") as mock_get:
        mock_get.return_value = []

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/settings/security/sessions")

        assert response.status_code == 200
        data = response.json()
        assert data["total"] == 0
        assert len(data["sessions"]) == 0


@pytest.mark.asyncio
async def test_get_sessions_error(app):
    """测试获取活跃会话列表 - 错误处理"""
    with patch("src.api.settings.security.security_settings_service.get_active_sessions") as mock_get:
        mock_get.side_effect = Exception("Redis connection error")

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/settings/security/sessions")

        assert response.status_code == 500
        assert "获取会话列表失败" in response.json()["detail"]


@pytest.mark.asyncio
async def test_delete_session_success(app):
    """测试删除会话 - 成功"""
    with patch("src.api.settings.security.security_settings_service.delete_session") as mock_delete:
        mock_delete.return_value = (True, "会话已删除")

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.delete("/settings/security/sessions/session_123")

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "删除" in data["message"]


@pytest.mark.asyncio
async def test_delete_session_not_found(app):
    """测试删除会话 - 会话不存在"""
    with patch("src.api.settings.security.security_settings_service.delete_session") as mock_delete:
        mock_delete.return_value = (False, "会话不存在")

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.delete("/settings/security/sessions/invalid_session")

        assert response.status_code == 404
        assert "不存在" in response.json()["detail"]


@pytest.mark.asyncio
async def test_delete_session_error(app):
    """测试删除会话 - 错误处理"""
    with patch("src.api.settings.security.security_settings_service.delete_session") as mock_delete:
        mock_delete.side_effect = Exception("Redis error")

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.delete("/settings/security/sessions/session_123")

        assert response.status_code == 500
        assert "删除会话失败" in response.json()["detail"]


if __name__ == "__main__":
    # 运行测试: pytest backend/tests/api/settings/test_security.py -v
    pass
