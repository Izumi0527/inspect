"""
General Settings API Unit Tests
通用配置API单元测试

测试覆盖：6个核心API端点
"""

import pytest
from unittest.mock import patch
from fastapi import FastAPI
from httpx import AsyncClient, ASGITransport
from datetime import datetime

from src.api.settings.general import router
from src.schemas.settings.general import (
    SettingItem,
    BulkUpdateResponse,
    ExportConfigResponse,
    ImportConfigResponse
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
def mock_settings_data():
    """Mock设置数据"""
    return [
        SettingItem(
            key="system.name",
            value="巡检系统",
            category="system",
            description="系统名称"
        ),
        SettingItem(
            key="system.timezone",
            value="Asia/Shanghai",
            category="system",
            description="系统时区"
        )
    ]


# ==================== 测试用例 ====================

@pytest.mark.asyncio
async def test_get_all_settings(app, mock_settings_data):
    """测试获取所有设置"""
    with patch("src.api.settings.general.general_settings_service.get_all_settings") as mock_get:
        mock_get.return_value = mock_settings_data

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/settings/system/settings")

        assert response.status_code == 200
        data = response.json()
        assert len(data) == 2
        assert data[0]["key"] == "system.name"


@pytest.mark.asyncio
async def test_get_setting_by_key(app, mock_settings_data):
    """测试获取单个设置"""
    with patch("src.api.settings.general.general_settings_service.get_setting") as mock_get:
        mock_get.return_value = mock_settings_data[0]

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/settings/system/settings/system.name")

        assert response.status_code == 200
        data = response.json()
        assert data["key"] == "system.name"
        assert data["value"] == "巡检系统"


@pytest.mark.asyncio
async def test_get_setting_not_found(app):
    """测试获取不存在的设置"""
    with patch("src.api.settings.general.general_settings_service.get_setting") as mock_get:
        mock_get.return_value = None

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/settings/system/settings/nonexistent")

        assert response.status_code == 404


@pytest.mark.asyncio
async def test_update_setting(app, mock_settings_data):
    """测试更新设置"""
    updated = mock_settings_data[0]
    updated.value = "新名称"

    with patch("src.api.settings.general.general_settings_service.update_setting") as mock_update:
        mock_update.return_value = updated

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.put(
                "/settings/system/settings/system.name",
                json={"value": "新名称"}
            )

        assert response.status_code == 200
        data = response.json()
        assert data["value"] == "新名称"


@pytest.mark.asyncio
async def test_bulk_update_settings(app):
    """测试批量更新设置"""
    with patch("src.api.settings.general.general_settings_service.bulk_update_settings") as mock_bulk:
        mock_bulk.return_value = BulkUpdateResponse(
            updated_count=2,
            failed_keys=[],
            message="成功更新 2 个配置项"
        )

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/settings/system/settings/bulk",
                json={
                    "settings": {
                        "system.name": "新名称",
                        "system.timezone": "UTC"
                    }
                }
            )

        assert response.status_code == 200
        data = response.json()
        assert data["updated_count"] == 2


@pytest.mark.asyncio
async def test_export_config(app):
    """测试导出配置"""
    with patch("src.api.settings.general.general_settings_service.export_config") as mock_export:
        mock_export.return_value = ExportConfigResponse(
            config_data={"system.name": {"value": "巡检系统"}},
            export_time=datetime.now(),
            total_count=1
        )

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/settings/system/export")

        assert response.status_code == 200
        data = response.json()
        assert "config_data" in data
        assert data["total_count"] == 1


@pytest.mark.asyncio
async def test_import_config(app):
    """测试导入配置"""
    with patch("src.api.settings.general.general_settings_service.import_config") as mock_import:
        mock_import.return_value = ImportConfigResponse(
            imported_count=1,
            skipped_count=0,
            failed_keys=[],
            message="成功导入 1 个配置项"
        )

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/settings/system/import",
                json={
                    "config_data": {"system.name": {"value": "导入的系统名称"}},
                    "overwrite": True
                }
            )

        assert response.status_code == 200
        data = response.json()
        assert data["imported_count"] == 1


@pytest.mark.asyncio
async def test_error_handling(app):
    """测试错误处理"""
    with patch("src.api.settings.general.general_settings_service.get_all_settings") as mock_get:
        mock_get.side_effect = Exception("Database error")

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/settings/system/settings")

        assert response.status_code == 500
        assert "获取配置失败" in response.json()["detail"]


@pytest.mark.asyncio
async def test_get_setting_service_error(app):
    """测试获取单个设置 - 服务层异常"""
    with patch("src.api.settings.general.general_settings_service.get_setting") as mock_get:
        mock_get.side_effect = Exception("Database connection failed")

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/settings/system/settings/system.name")

        assert response.status_code == 500
        assert "获取配置失败" in response.json()["detail"]


@pytest.mark.asyncio
async def test_update_setting_missing_value(app):
    """测试更新设置 - 缺少value字段"""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        # 发送空的请求体或不包含value字段
        response = await client.put(
            "/settings/system/settings/system.name",
            json={"other_field": "some_data"}
        )

    assert response.status_code == 400
    assert "value" in response.json()["detail"]


@pytest.mark.asyncio
async def test_update_setting_service_error(app):
    """测试更新设置 - 服务层异常"""
    with patch("src.api.settings.general.general_settings_service.update_setting") as mock_update:
        mock_update.side_effect = Exception("Database write error")

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.put(
                "/settings/system/settings/system.name",
                json={"value": "新名称"}
            )

        assert response.status_code == 500
        assert "更新配置失败" in response.json()["detail"]


@pytest.mark.asyncio
async def test_bulk_update_error(app):
    """测试批量更新设置 - 异常处理"""
    with patch("src.api.settings.general.general_settings_service.bulk_update_settings") as mock_bulk:
        mock_bulk.side_effect = Exception("Batch operation failed")

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/settings/system/settings/bulk",
                json={
                    "settings": {
                        "system.name": "新名称"
                    }
                }
            )

        assert response.status_code == 500
        assert "批量更新配置失败" in response.json()["detail"]


@pytest.mark.asyncio
async def test_export_config_error(app):
    """测试导出配置 - 异常处理"""
    with patch("src.api.settings.general.general_settings_service.export_config") as mock_export:
        mock_export.side_effect = Exception("Export process failed")

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.get("/settings/system/export")

        assert response.status_code == 500
        assert "导出配置失败" in response.json()["detail"]


@pytest.mark.asyncio
async def test_import_config_error(app):
    """测试导入配置 - 异常处理"""
    with patch("src.api.settings.general.general_settings_service.import_config") as mock_import:
        mock_import.side_effect = Exception("Import validation failed")

        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/settings/system/import",
                json={
                    "config_data": {"system.name": {"value": "导入的系统名称"}},
                    "overwrite": True
                }
            )

        assert response.status_code == 500
        assert "导入配置失败" in response.json()["detail"]


if __name__ == "__main__":
    # 运行测试: pytest backend/tests/api/settings/test_general.py -v
    pass
