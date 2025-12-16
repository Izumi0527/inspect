"""
监控模块服务测试
"""
import pytest


class TestMonitoringServiceImport:
    """监控服务导入测试"""

    def test_import_monitoring_module(self):
        """测试导入监控模块"""
        from src.modules.monitoring import router
        assert router is not None

    def test_import_monitoring_service(self):
        """测试导入监控服务"""
        from src.modules.monitoring.service import monitoring_service
        assert monitoring_service is not None


class TestMonitoringSchemas:
    """监控数据模式测试"""

    def test_import_monitoring_schemas(self):
        """测试导入监控schemas"""
        from src.modules.monitoring.schemas import (
            MonitoringStatsResponse,
            DeviceMetricsResponse,
            DeviceStatusResponse,
        )
        assert MonitoringStatsResponse is not None
        assert DeviceMetricsResponse is not None
        assert DeviceStatusResponse is not None
