"""
设备模块服务测试
"""
import pytest


class TestDeviceServiceImport:
    """设备服务导入测试"""

    def test_import_device_service(self):
        """测试导入设备服务"""
        from src.modules.devices.service import DeviceService
        assert DeviceService is not None

    def test_import_device_repository(self):
        """测试导入设备仓储"""
        from src.modules.devices.repository import DeviceRepository
        assert DeviceRepository is not None


class TestDeviceSchemas:
    """设备数据模式测试"""

    def test_import_device_schemas(self):
        """测试导入设备schemas"""
        from src.modules.devices.schemas import (
            DeviceCreate,
            DeviceUpdate,
            DeviceResponse,
            DeviceListResponse,
            DeviceStatistics,
        )
        assert DeviceCreate is not None
        assert DeviceUpdate is not None
        assert DeviceResponse is not None
        assert DeviceListResponse is not None
        assert DeviceStatistics is not None

    def test_device_response_fields(self):
        """测试设备响应字段"""
        from src.modules.devices.schemas import DeviceResponse
        # 检查DeviceResponse有status字段
        assert "status" in DeviceResponse.model_fields
