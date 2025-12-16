"""
告警模块服务测试
"""
import pytest


class TestAlertServiceImport:
    """告警服务导入测试"""

    def test_import_alert_service(self):
        """测试导入告警服务"""
        from src.services.alert import AlertService
        assert AlertService is not None

    def test_import_alert_repository(self):
        """测试导入告警仓储"""
        from src.repositories.alert_repository_impl import InMemoryAlertRepository
        assert InMemoryAlertRepository is not None


class TestAlertSchemas:
    """告警数据模式测试"""

    def test_import_alert_schemas(self):
        """测试导入告警schemas"""
        from src.modules.alerts.schemas import (
            AlertRuleCreate,
            AlertResponse,
            AlertListResponse,
            AlertSeverity,
            AlertStatus,
        )
        assert AlertRuleCreate is not None
        assert AlertResponse is not None
        assert AlertListResponse is not None
        assert AlertSeverity is not None
        assert AlertStatus is not None

    def test_alert_severity_enum(self):
        """测试告警级别枚举"""
        from src.modules.alerts.schemas import AlertSeverity
        assert hasattr(AlertSeverity, "CRITICAL")
        assert hasattr(AlertSeverity, "WARNING")
        assert hasattr(AlertSeverity, "INFO")


class TestAlertDependencies:
    """告警依赖注入测试"""

    def test_get_alert_service(self):
        """测试获取告警服务"""
        from src.core.dependencies import get_alert_service
        service = get_alert_service()
        assert service is not None

    def test_get_alert_repository(self):
        """测试获取告警仓储"""
        from src.core.dependencies import get_alert_repository
        repo = get_alert_repository()
        assert repo is not None
