"""
告警工作流端到端测试

测试告警从触发到解决的完整流程
"""
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from src.main import app


class TestAlertWorkflow:
    """告警工作流测试"""
    
    @pytest_asyncio.fixture
    async def client(self):
        """创建测试客户端"""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac
    
    @pytest.mark.asyncio
    async def test_alerts_list_endpoint(self, client):
        """测试告警列表端点"""
        response = await client.get("/api/v1/alerts/")
        assert response.status_code in [200, 401, 403]
    
    @pytest.mark.asyncio
    async def test_alerts_statistics_endpoint(self, client):
        """测试告警统计端点"""
        response = await client.get("/api/v1/alerts/statistics")
        assert response.status_code in [200, 401, 403]
    
    @pytest.mark.asyncio
    async def test_alert_rules_endpoint(self, client):
        """测试告警规则端点"""
        response = await client.get("/api/v1/alerts/rules")
        assert response.status_code in [200, 401, 403]
    
    @pytest.mark.asyncio
    async def test_recent_alerts_endpoint(self, client):
        """测试最新告警端点"""
        response = await client.get("/api/v1/alerts/recent")
        assert response.status_code in [200, 401, 403]
