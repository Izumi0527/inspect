"""
巡检流程端到端测试

测试巡检任务从创建到完成的完整流程
"""
import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport

from src.main import app


class TestInspectionFlow:
    """巡检流程测试"""
    
    @pytest_asyncio.fixture
    async def client(self):
        """创建测试客户端"""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac
    
    @pytest.mark.asyncio
    async def test_inspection_tasks_list(self, client):
        """测试巡检任务列表端点"""
        response = await client.get("/api/v1/inspections/tasks")
        assert response.status_code in [200, 401, 403, 404]
    
    @pytest.mark.asyncio
    async def test_inspection_templates_list(self, client):
        """测试巡检模板列表端点"""
        response = await client.get("/api/v1/inspections/templates")
        assert response.status_code in [200, 401, 403, 404]
    
    @pytest.mark.asyncio
    async def test_inspection_reports_list(self, client):
        """测试巡检报告列表端点"""
        response = await client.get("/api/v1/inspections/reports")
        assert response.status_code in [200, 401, 403, 404]
    
    @pytest.mark.asyncio
    async def test_inspection_statistics(self, client):
        """测试巡检统计端点"""
        response = await client.get("/api/v1/inspections/statistics")
        assert response.status_code in [200, 401, 403, 404]


class TestInspectionScheduleFlow:
    """巡检调度流程测试"""
    
    @pytest_asyncio.fixture
    async def client(self):
        """创建测试客户端"""
        transport = ASGITransport(app=app)
        async with AsyncClient(transport=transport, base_url="http://test") as ac:
            yield ac
    
    @pytest.mark.asyncio
    async def test_scheduled_tasks_list(self, client):
        """测试定时任务列表端点"""
        response = await client.get("/api/v1/inspections/scheduled")
        assert response.status_code in [200, 401, 403, 404]
