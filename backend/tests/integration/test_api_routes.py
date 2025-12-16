"""
API路由集成测试

测试所有API端点是否正确注册和可访问
"""
import pytest
from fastapi.testclient import TestClient


class TestAPIRouteRegistration:
    """API路由注册测试"""

    @pytest.fixture
    def app(self):
        """创建测试应用"""
        from fastapi import FastAPI
        from src.api import api_router

        app = FastAPI()
        app.include_router(api_router, prefix="/api")
        return app

    @pytest.fixture
    def client(self, app):
        """创建测试客户端"""
        return TestClient(app)

    def test_api_router_has_routes(self, app):
        """测试API路由已注册"""
        from src.api import api_router
        assert len(api_router.routes) > 0

    def test_devices_routes_registered(self, app):
        """测试设备路由已注册"""
        routes = [r.path for r in app.routes]
        assert any("/api/devices" in r for r in routes)

    def test_monitoring_routes_registered(self, app):
        """测试监控路由已注册"""
        routes = [r.path for r in app.routes]
        assert any("/api/monitoring" in r for r in routes)

    def test_alerts_routes_registered(self, app):
        """测试告警路由已注册"""
        routes = [r.path for r in app.routes]
        assert any("/api/alerts" in r for r in routes)

    def test_inspection_routes_registered(self, app):
        """测试巡检路由已注册"""
        routes = [r.path for r in app.routes]
        assert any("/api/inspection" in r for r in routes)

    def test_dashboard_routes_registered(self, app):
        """测试仪表板路由已注册"""
        routes = [r.path for r in app.routes]
        assert any("/api/dashboard" in r for r in routes)

    def test_reports_routes_registered(self, app):
        """测试报表路由已注册"""
        routes = [r.path for r in app.routes]
        assert any("/api/reports" in r for r in routes)

    def test_traffic_routes_registered(self, app):
        """测试流量路由已注册"""
        routes = [r.path for r in app.routes]
        assert any("/api/traffic" in r for r in routes)

    def test_auth_routes_registered(self, app):
        """测试认证路由已注册"""
        routes = [r.path for r in app.routes]
        assert any("/api/auth" in r for r in routes)

    def test_scheduler_routes_registered(self, app):
        """测试调度路由已注册"""
        routes = [r.path for r in app.routes]
        assert any("/api/scheduler" in r for r in routes)

    def test_settings_routes_registered(self, app):
        """测试设置路由已注册"""
        routes = [r.path for r in app.routes]
        assert any("/api/settings" in r for r in routes)


class TestV1APIRoutes:
    """V1版本API路由测试"""

    @pytest.fixture
    def app(self):
        """创建测试应用"""
        from fastapi import FastAPI
        from src.api import api_router

        app = FastAPI()
        app.include_router(api_router, prefix="/api")
        return app

    def test_v1_routes_registered(self, app):
        """测试v1版本路由已注册"""
        routes = [r.path for r in app.routes]
        assert any("/api/v1" in r for r in routes)

    def test_v1_devices_routes(self, app):
        """测试v1设备路由"""
        routes = [r.path for r in app.routes]
        assert any("/api/v1/devices" in r for r in routes)

    def test_v1_auth_routes(self, app):
        """测试v1认证路由"""
        routes = [r.path for r in app.routes]
        assert any("/api/v1/auth" in r for r in routes)
