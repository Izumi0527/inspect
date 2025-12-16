"""
模块导入测试

验证所有业务模块可以正常导入
"""
import pytest


class TestModulesImport:
    """模块导入测试"""

    def test_import_auth_module(self):
        """测试导入auth模块"""
        from src.modules.auth import router
        assert router is not None

    def test_import_devices_module(self):
        """测试导入devices模块"""
        from src.modules.devices import router
        assert router is not None

    def test_import_monitoring_module(self):
        """测试导入monitoring模块"""
        from src.modules.monitoring import router
        assert router is not None

    def test_import_alerts_module(self):
        """测试导入alerts模块"""
        from src.modules.alerts import router
        assert router is not None

    def test_import_inspection_module(self):
        """测试导入inspection模块"""
        from src.modules.inspection import router
        assert router is not None

    def test_import_dashboard_module(self):
        """测试导入dashboard模块"""
        from src.modules.dashboard import router
        assert router is not None

    def test_import_reports_module(self):
        """测试导入reports模块"""
        from src.modules.reports import router
        assert router is not None

    def test_import_traffic_module(self):
        """测试导入traffic模块"""
        from src.modules.traffic import router
        assert router is not None

    def test_import_scheduler_module(self):
        """测试导入scheduler模块"""
        from src.modules.scheduler import router
        assert router is not None

    def test_import_settings_module(self):
        """测试导入settings模块"""
        from src.modules.settings import router
        assert router is not None

    def test_import_all_from_modules(self):
        """测试从modules包导入所有路由"""
        from src.modules import (
            auth_router,
            devices_router,
            monitoring_router,
            alerts_router,
            inspection_router,
            dashboard_router,
            reports_router,
            traffic_router,
            scheduler_router,
        )
        # settings_router从api/settings导入，避免循环依赖
        assert all([
            auth_router,
            devices_router,
            monitoring_router,
            alerts_router,
            inspection_router,
            dashboard_router,
            reports_router,
            traffic_router,
            scheduler_router,
        ])


class TestNewModulesImport:
    """新迁移模块导入测试"""

    def test_import_alerts_escalation(self):
        """测试导入告警升级模块"""
        from src.modules.alerts.escalation import router
        assert router is not None

    def test_import_monitoring_websocket(self):
        """测试导入WebSocket模块"""
        from src.modules.monitoring.websocket import router, ws_notifier
        assert router is not None
        assert ws_notifier is not None

    def test_import_monitoring_types(self):
        """测试导入监控类型定义"""
        from src.modules.monitoring.types import (
            DeviceMetrics,
            MonitorInfo,
            ConnectivityStatus,
            NetworkOverview,
        )
        assert DeviceMetrics is not None
        assert MonitorInfo is not None

    def test_import_alerts_module_exports(self):
        """测试告警模块导出"""
        from src.modules.alerts import router, escalation_router
        assert router is not None
        assert escalation_router is not None

    def test_import_monitoring_module_exports(self):
        """测试监控模块导出"""
        from src.modules.monitoring import router, websocket_router, ws_notifier
        assert router is not None
        assert websocket_router is not None
        assert ws_notifier is not None


class TestAlertSubModulesImport:
    """告警子模块导入测试"""

    def test_import_alert_engine(self):
        """测试导入告警引擎"""
        from src.modules.alerts.engine import AlertEngine
        assert AlertEngine is not None

    def test_import_alert_evaluator(self):
        """测试导入告警评估器"""
        from src.modules.alerts.evaluator import AlertEvaluator, alert_evaluator
        assert AlertEvaluator is not None
        assert alert_evaluator is not None

    def test_import_alert_notifier(self):
        """测试导入告警通知服务"""
        from src.modules.alerts.notifier import AlertNotifier, alert_notifier
        assert AlertNotifier is not None
        assert alert_notifier is not None

    def test_alerts_module_full_exports(self):
        """测试告警模块完整导出"""
        from src.modules.alerts import (
            router,
            escalation_router,
            AlertEngine,
            AlertEvaluator,
            alert_evaluator,
            AlertNotifier,
            alert_notifier,
        )
        assert all([
            router,
            escalation_router,
            AlertEngine,
            AlertEvaluator,
            alert_evaluator,
            AlertNotifier,
            alert_notifier,
        ])


class TestSettingsSubModulesImport:
    """设置子模块导入测试"""

    def test_import_general_settings_service(self):
        """测试导入通用设置服务"""
        from src.modules.settings.general import GeneralSettingsService, general_settings_service
        assert GeneralSettingsService is not None
        assert general_settings_service is not None

    def test_import_general_settings_router(self):
        """测试导入通用设置路由"""
        from src.modules.settings.general import router
        assert router is not None


class TestAPIRouterIntegration:
    """API路由集成测试"""

    def test_api_router_import(self):
        """测试主API路由导入"""
        from src.api import api_router
        assert api_router is not None
        assert len(api_router.routes) > 0

    def test_v1_router_import(self):
        """测试v1版本路由导入"""
        from src.api.v1 import api_v1_router
        assert api_v1_router is not None
        assert len(api_v1_router.routes) > 0
