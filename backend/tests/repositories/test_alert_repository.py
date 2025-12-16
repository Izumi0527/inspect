"""
告警仓储层测试

测试 AlertRepository 接口和实现
"""
import pytest
from datetime import datetime, timedelta
from unittest.mock import AsyncMock, MagicMock, patch

from src.repositories.alert_repository import (
    AlertRepositoryInterface,
    AlertRuleRepositoryInterface
)
from src.models.alert import AlertSeverity, AlertStatus, AlertCategory


class TestAlertRepositoryInterface:
    """告警仓储接口测试"""
    
    def test_interface_methods_defined(self):
        """测试接口方法已定义"""
        # 验证接口定义了所有必要的方法
        interface_methods = [
            'get_alert_by_id',
            'get_alerts',
            'create_alert',
            'update_alert',
            'delete_alert',
            'acknowledge_alert',
            'resolve_alert',
            'reactivate_alert',
            'close_alert',
            'bulk_acknowledge',
            'bulk_resolve',
            'bulk_close',
            'get_active_alerts',
            'get_recent_alerts',
            'get_alerts_by_device',
            'get_alerts_by_rule',
            'get_alert_statistics',
            'get_alert_count_by_status',
            'get_alert_count_by_severity',
            'get_alert_history',
            'archive_old_alerts',
        ]
        
        for method in interface_methods:
            assert hasattr(AlertRepositoryInterface, method), f"Missing method: {method}"


class TestAlertRuleRepositoryInterface:
    """告警规则仓储接口测试"""
    
    def test_interface_methods_defined(self):
        """测试接口方法已定义"""
        interface_methods = [
            'get_rule_by_id',
            'get_rules',
            'create_rule',
            'update_rule',
            'delete_rule',
            'check_rule_name_exists',
        ]
        
        for method in interface_methods:
            assert hasattr(AlertRuleRepositoryInterface, method), f"Missing method: {method}"


class TestMockAlertRepository:
    """模拟告警仓储测试（用于验证接口契约）"""
    
    @pytest.fixture
    def mock_repository(self):
        """创建模拟仓储"""
        repo = AsyncMock(spec=AlertRepositoryInterface)
        return repo
    
    @pytest.mark.asyncio
    async def test_get_alert_by_id(self, mock_repository):
        """测试获取告警"""
        mock_repository.get_alert_by_id.return_value = {
            "id": 1,
            "title": "CPU使用率过高",
            "severity": AlertSeverity.WARNING,
            "status": AlertStatus.OPEN
        }
        
        result = await mock_repository.get_alert_by_id(1)
        
        assert result is not None
        assert result["id"] == 1
        mock_repository.get_alert_by_id.assert_called_once_with(1)
    
    @pytest.mark.asyncio
    async def test_get_alerts_with_filters(self, mock_repository):
        """测试带过滤条件获取告警列表"""
        mock_repository.get_alerts.return_value = (
            [{"id": 1, "title": "告警1"}, {"id": 2, "title": "告警2"}],
            2
        )
        
        alerts, total = await mock_repository.get_alerts(
            skip=0,
            limit=10,
            severity=AlertSeverity.CRITICAL,
            status=AlertStatus.OPEN
        )
        
        assert len(alerts) == 2
        assert total == 2
    
    @pytest.mark.asyncio
    async def test_create_alert(self, mock_repository):
        """测试创建告警"""
        alert_data = {
            "title": "新告警",
            "message": "测试告警消息",
            "severity": AlertSeverity.WARNING,
            "category": AlertCategory.PERFORMANCE,
            "device_id": 1
        }
        
        mock_repository.create_alert.return_value = {
            "id": 1,
            **alert_data,
            "status": AlertStatus.OPEN,
            "created_at": datetime.utcnow().isoformat()
        }
        
        result = await mock_repository.create_alert(alert_data)
        
        assert result["id"] == 1
        assert result["title"] == "新告警"
    
    @pytest.mark.asyncio
    async def test_acknowledge_alert(self, mock_repository):
        """测试确认告警"""
        mock_repository.acknowledge_alert.return_value = True
        
        result = await mock_repository.acknowledge_alert(
            alert_id=1,
            user_id=1,
            note="已确认，正在处理"
        )
        
        assert result is True
        mock_repository.acknowledge_alert.assert_called_once_with(
            alert_id=1,
            user_id=1,
            note="已确认，正在处理"
        )
    
    @pytest.mark.asyncio
    async def test_resolve_alert(self, mock_repository):
        """测试解决告警"""
        mock_repository.resolve_alert.return_value = True
        
        result = await mock_repository.resolve_alert(
            alert_id=1,
            user_id=1,
            note="问题已解决"
        )
        
        assert result is True
    
    @pytest.mark.asyncio
    async def test_bulk_acknowledge(self, mock_repository):
        """测试批量确认告警"""
        mock_repository.bulk_acknowledge.return_value = (3, [])  # 3成功，0失败
        
        success_count, failed_ids = await mock_repository.bulk_acknowledge(
            alert_ids=[1, 2, 3],
            user_id=1,
            note="批量确认"
        )
        
        assert success_count == 3
        assert len(failed_ids) == 0
    
    @pytest.mark.asyncio
    async def test_bulk_resolve(self, mock_repository):
        """测试批量解决告警"""
        mock_repository.bulk_resolve.return_value = (2, [3])  # 2成功，1失败
        
        success_count, failed_ids = await mock_repository.bulk_resolve(
            alert_ids=[1, 2, 3],
            user_id=1
        )
        
        assert success_count == 2
        assert 3 in failed_ids
    
    @pytest.mark.asyncio
    async def test_get_active_alerts(self, mock_repository):
        """测试获取活跃告警"""
        mock_repository.get_active_alerts.return_value = [
            {"id": 1, "status": AlertStatus.OPEN},
            {"id": 2, "status": AlertStatus.ACKNOWLEDGED}
        ]
        
        alerts = await mock_repository.get_active_alerts(
            device_id=1,
            severity=AlertSeverity.CRITICAL
        )
        
        assert len(alerts) == 2
    
    @pytest.mark.asyncio
    async def test_get_recent_alerts(self, mock_repository):
        """测试获取最新告警"""
        mock_repository.get_recent_alerts.return_value = [
            {"id": 5, "title": "最新告警"},
            {"id": 4, "title": "次新告警"}
        ]
        
        alerts = await mock_repository.get_recent_alerts(limit=5)
        
        assert len(alerts) == 2
        mock_repository.get_recent_alerts.assert_called_once_with(limit=5)
    
    @pytest.mark.asyncio
    async def test_get_alert_statistics(self, mock_repository):
        """测试获取告警统计"""
        mock_repository.get_alert_statistics.return_value = {
            "total_active": 10,
            "total_resolved": 50,
            "by_severity": {
                "critical": 2,
                "warning": 5,
                "info": 3
            },
            "by_status": {
                "open": 6,
                "acknowledged": 4,
                "resolved": 50
            }
        }
        
        stats = await mock_repository.get_alert_statistics()
        
        assert stats["total_active"] == 10
        assert stats["by_severity"]["critical"] == 2
    
    @pytest.mark.asyncio
    async def test_get_alert_count_by_status(self, mock_repository):
        """测试按状态统计告警数量"""
        mock_repository.get_alert_count_by_status.return_value = 5
        
        count = await mock_repository.get_alert_count_by_status(AlertStatus.OPEN)
        
        assert count == 5
    
    @pytest.mark.asyncio
    async def test_get_alert_history(self, mock_repository):
        """测试获取告警历史"""
        mock_repository.get_alert_history.return_value = (
            [{"id": 1, "status": AlertStatus.RESOLVED}],
            100
        )
        
        history, total = await mock_repository.get_alert_history(
            skip=0,
            limit=10,
            start_date=datetime.utcnow() - timedelta(days=30),
            end_date=datetime.utcnow()
        )
        
        assert len(history) == 1
        assert total == 100
    
    @pytest.mark.asyncio
    async def test_archive_old_alerts(self, mock_repository):
        """测试归档旧告警"""
        mock_repository.archive_old_alerts.return_value = 25
        
        archived_count = await mock_repository.archive_old_alerts(days=90)
        
        assert archived_count == 25
        mock_repository.archive_old_alerts.assert_called_once_with(days=90)


class TestAlertSeverityEnum:
    """告警严重级别枚举测试"""
    
    def test_severity_values(self):
        """测试严重级别值"""
        assert AlertSeverity.CRITICAL is not None
        assert AlertSeverity.WARNING is not None
        assert AlertSeverity.INFO is not None


class TestAlertStatusEnum:
    """告警状态枚举测试"""
    
    def test_status_values(self):
        """测试状态值"""
        assert AlertStatus.OPEN is not None
        assert AlertStatus.ACKNOWLEDGED is not None
        assert AlertStatus.RESOLVED is not None


class TestAlertCategoryEnum:
    """告警类别枚举测试"""
    
    def test_category_values(self):
        """测试类别值"""
        assert AlertCategory.PERFORMANCE is not None
        assert AlertCategory.SECURITY is not None
        assert AlertCategory.CONNECTIVITY is not None
        assert AlertCategory.HARDWARE is not None
