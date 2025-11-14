"""
Notifications API Unit Tests
通知配置API单元测试

测试覆盖：3个核心API端点
"""

import pytest
from unittest.mock import patch
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport

from src.api.settings.notifications import router
from src.schemas.settings.notifications import (
    TestEmailResponse,
    TestSmsResponse,
    TestWebhookResponse
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


# ==================== 测试用例 ====================

@pytest.mark.asyncio
async def test_email_success(app):
    """测试邮件配置 - 成功"""
    with patch("src.api.settings.notifications.notification_settings_service.test_email") as mock_test:
        mock_test.return_value = (True, "邮件发送成功")

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/settings/notifications/test-email",
                json={
                    "recipient": "user@example.com",
                    "subject": "测试邮件",
                    "content": "这是一封测试邮件"
                }
            )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert "发送成功" in data["message"]


@pytest.mark.asyncio
async def test_email_failure(app):
    """测试邮件配置 - 失败"""
    with patch("src.api.settings.notifications.notification_settings_service.test_email") as mock_test:
        mock_test.return_value = (False, "SMTP连接失败")

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/settings/notifications/test-email",
                json={
                    "recipient": "invalid@example.com",
                    "subject": "测试",
                    "content": "测试内容"
                }
            )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is False
        assert "失败" in data["message"]


@pytest.mark.asyncio
async def test_email_invalid_email_format(app):
    """测试邮件配置 - 无效邮箱格式"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 测试无效的邮箱格式
        response = await client.post(
            "/settings/notifications/test-email",
            json={
                "recipient": "invalid-email-format",  # 无效的邮箱格式
                "subject": "测试",
                "content": "测试内容"
            }
        )

    assert response.status_code == 422  # Validation error


@pytest.mark.asyncio
async def test_email_error(app):
    """测试邮件配置 - 错误处理"""
    with patch("src.api.settings.notifications.notification_settings_service.test_email") as mock_test:
        mock_test.side_effect = Exception("SMTP server error")

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/settings/notifications/test-email",
                json={
                    "recipient": "test@example.com",
                    "subject": "Test",
                    "content": "Test content"
                }
            )

        assert response.status_code == 500
        assert "邮件测试失败" in response.json()["detail"]


@pytest.mark.asyncio
async def test_sms_success(app):
    """测试短信配置 - 成功"""
    with patch("src.api.settings.notifications.notification_settings_service.test_sms") as mock_test:
        mock_test.return_value = (True, "短信发送成功", "sms_12345")

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/settings/notifications/test-sms",
                json={
                    "phone_number": "13800138000",
                    "content": "测试短信"
                }
            )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["sms_id"] == "sms_12345"
        assert "成功" in data["message"]


@pytest.mark.asyncio
async def test_sms_failure(app):
    """测试短信配置 - 失败"""
    with patch("src.api.settings.notifications.notification_settings_service.test_sms") as mock_test:
        mock_test.return_value = (False, "短信配置未启用", None)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/settings/notifications/test-sms",
                json={
                    "phone_number": "13800138000",
                    "content": "测试"
                }
            )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is False
        assert data["sms_id"] is None


@pytest.mark.asyncio
async def test_sms_error(app):
    """测试短信配置 - 错误处理"""
    with patch("src.api.settings.notifications.notification_settings_service.test_sms") as mock_test:
        mock_test.side_effect = Exception("SMS service unavailable")

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/settings/notifications/test-sms",
                json={
                    "phone_number": "13800138000",
                    "content": "Test"
                }
            )

        assert response.status_code == 500
        assert "短信测试失败" in response.json()["detail"]


@pytest.mark.asyncio
async def test_webhook_success(app):
    """测试Webhook配置 - 成功"""
    with patch("src.api.settings.notifications.notification_settings_service.test_webhook") as mock_test:
        mock_test.return_value = (True, "Webhook调用成功", 200, '{"status":"ok"}', 150)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/settings/notifications/test-webhook",
                json={
                    "url": "https://example.com/webhook",
                    "method": "POST",
                    "headers": {"Content-Type": "application/json"},
                    "payload": {"test": True}
                }
            )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True
        assert data["status_code"] == 200
        assert data["response_time_ms"] == 150
        assert data["response_body"] == '{"status":"ok"}'


@pytest.mark.asyncio
async def test_webhook_failure(app):
    """测试Webhook配置 - 失败"""
    with patch("src.api.settings.notifications.notification_settings_service.test_webhook") as mock_test:
        mock_test.return_value = (False, "连接超时", None, None, 5000)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/settings/notifications/test-webhook",
                json={
                    "url": "https://invalid-url.com/webhook",
                    "method": "POST",
                    "headers": {},
                    "payload": {}
                }
            )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is False
        assert "超时" in data["message"]


@pytest.mark.asyncio
async def test_webhook_different_methods(app):
    """测试Webhook配置 - 不同HTTP方法"""
    methods = ["GET", "POST", "PUT", "PATCH"]

    for method in methods:
        with patch("src.api.settings.notifications.notification_settings_service.test_webhook") as mock_test:
            mock_test.return_value = (True, f"{method} 成功", 200, "{}", 100)

            transport = ASGITransport(app=app)
            async with AsyncClient(transport=transport, base_url="http://test") as client:
                response = await client.post(
                    "/settings/notifications/test-webhook",
                    json={
                        "url": "https://example.com/api",
                        "method": method,
                        "headers": {},
                        "payload": {}
                    }
                )

            assert response.status_code == 200, f"Failed for method: {method}"
            assert response.json()["success"] is True


@pytest.mark.asyncio
async def test_webhook_with_custom_headers(app):
    """测试Webhook配置 - 自定义请求头"""
    with patch("src.api.settings.notifications.notification_settings_service.test_webhook") as mock_test:
        mock_test.return_value = (True, "成功", 200, '{"result":"ok"}', 120)

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/settings/notifications/test-webhook",
                json={
                    "url": "https://api.example.com/webhook",
                    "method": "POST",
                    "headers": {
                        "Authorization": "Bearer token123",
                        "X-Custom-Header": "custom-value"
                    },
                    "payload": {"event": "test"}
                }
            )

        assert response.status_code == 200
        data = response.json()
        assert data["success"] is True


@pytest.mark.asyncio
async def test_webhook_error(app):
    """测试Webhook配置 - 错误处理"""
    with patch("src.api.settings.notifications.notification_settings_service.test_webhook") as mock_test:
        mock_test.side_effect = Exception("Network error")

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/settings/notifications/test-webhook",
                json={
                    "url": "https://example.com/webhook",
                    "method": "POST",
                    "headers": {},
                    "payload": {}
                }
            )

        assert response.status_code == 500
        assert "Webhook测试失败" in response.json()["detail"]


if __name__ == "__main__":
    # 运行测试: pytest backend/tests/api/settings/test_notifications.py -v
    pass
