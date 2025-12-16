"""
设备仓储层测试

测试 DeviceRepository 的所有数据访问方法
"""
import pytest
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch
from sqlalchemy.ext.asyncio import AsyncSession

from src.repositories.device_repository import DeviceRepository
from src.models.device import Device, DeviceType, DeviceVendor, DeviceStatus


class TestDeviceRepository:
    """设备仓储测试类"""
    
    @pytest.fixture
    def mock_session(self):
        """创建模拟的数据库会话"""
        session = AsyncMock(spec=AsyncSession)
        return session
    
    @pytest.fixture
    def repository(self, mock_session):
        """创建仓储实例"""
        return DeviceRepository(mock_session)
    
    @pytest.fixture
    def sample_device(self):
        """创建示例设备"""
        device = MagicMock(spec=Device)
        device.id = 1
        device.name = "测试交换机"
        device.ip_address = "192.168.1.1"
        device.device_type = DeviceType.SWITCH
        device.vendor = DeviceVendor.CISCO
        device.status = DeviceStatus.ONLINE
        device.is_active = True
        device.created_at = datetime.utcnow()
        device.updated_at = datetime.utcnow()
        return device
    
    # ==================== 基础CRUD测试 ====================
    
    @pytest.mark.asyncio
    async def test_get_device_by_id_found(self, repository, mock_session, sample_device):
        """测试根据ID获取设备 - 找到"""
        # 模拟查询结果
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = sample_device
        mock_session.execute.return_value = mock_result
        
        # 执行
        result = await repository.get_device_by_id(1)
        
        # 验证
        assert result is not None
        assert result.id == 1
        assert result.name == "测试交换机"
        mock_session.execute.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_get_device_by_id_not_found(self, repository, mock_session):
        """测试根据ID获取设备 - 未找到"""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_session.execute.return_value = mock_result
        
        result = await repository.get_device_by_id(999)
        
        assert result is None
    
    @pytest.mark.asyncio
    async def test_get_device_by_ip(self, repository, mock_session, sample_device):
        """测试根据IP获取设备"""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = sample_device
        mock_session.execute.return_value = mock_result
        
        result = await repository.get_device_by_ip("192.168.1.1")
        
        assert result is not None
        assert result.ip_address == "192.168.1.1"
    
    @pytest.mark.asyncio
    async def test_check_ip_exists_true(self, repository, mock_session):
        """测试检查IP是否存在 - 存在"""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = 1  # 返回设备ID
        mock_session.execute.return_value = mock_result
        
        result = await repository.check_ip_exists("192.168.1.1")
        
        assert result is True
    
    @pytest.mark.asyncio
    async def test_check_ip_exists_false(self, repository, mock_session):
        """测试检查IP是否存在 - 不存在"""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_session.execute.return_value = mock_result
        
        result = await repository.check_ip_exists("192.168.1.100")
        
        assert result is False
    
    @pytest.mark.asyncio
    async def test_check_ip_exists_exclude_device(self, repository, mock_session):
        """测试检查IP是否存在 - 排除指定设备"""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_session.execute.return_value = mock_result
        
        result = await repository.check_ip_exists("192.168.1.1", exclude_device_id=1)
        
        assert result is False
    
    # ==================== 创建设备测试 ====================
    
    @pytest.mark.asyncio
    async def test_create_device(self, repository, mock_session):
        """测试创建设备"""
        device_data = {
            "name": "新交换机",
            "ip_address": "192.168.1.10",
            "device_type": DeviceType.SWITCH,
            "vendor": DeviceVendor.HUAWEI,
            "model": "S5700",
            "location": "机房A",
        }
        
        # 模拟用户不存在
        mock_session.get.return_value = None
        
        result = await repository.create_device(device_data, created_by="user1")
        
        # 验证调用
        mock_session.add.assert_called_once()
        mock_session.commit.assert_called_once()
        mock_session.refresh.assert_called_once()
    
    # ==================== 更新设备测试 ====================
    
    @pytest.mark.asyncio
    async def test_update_device_success(self, repository, mock_session, sample_device):
        """测试更新设备 - 成功"""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = sample_device
        mock_session.execute.return_value = mock_result
        
        update_data = {"name": "更新后的交换机", "location": "机房B"}
        
        result = await repository.update_device(1, update_data)
        
        assert result is not None
        mock_session.commit.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_update_device_not_found(self, repository, mock_session):
        """测试更新设备 - 设备不存在"""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_session.execute.return_value = mock_result
        
        result = await repository.update_device(999, {"name": "test"})
        
        assert result is None
    
    # ==================== 删除设备测试 ====================
    
    @pytest.mark.asyncio
    async def test_delete_device_success(self, repository, mock_session, sample_device):
        """测试删除设备 - 成功"""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = sample_device
        mock_session.execute.return_value = mock_result
        
        result = await repository.delete_device(1)
        
        assert result is True
        mock_session.delete.assert_called_once_with(sample_device)
        mock_session.commit.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_delete_device_not_found(self, repository, mock_session):
        """测试删除设备 - 设备不存在"""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_session.execute.return_value = mock_result
        
        result = await repository.delete_device(999)
        
        assert result is False
    
    # ==================== 分页查询测试 ====================
    
    @pytest.mark.asyncio
    async def test_get_devices_paginated(self, repository, mock_session, sample_device):
        """测试分页获取设备列表"""
        # 模拟设备列表查询
        mock_devices_result = MagicMock()
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = [sample_device]
        mock_devices_result.scalars.return_value = mock_scalars
        
        # 模拟计数查询
        mock_count_result = MagicMock()
        mock_count_result.scalar.return_value = 1
        
        mock_session.execute.side_effect = [mock_devices_result, mock_count_result]
        
        devices, total = await repository.get_devices_paginated(skip=0, limit=10)
        
        assert len(devices) == 1
        assert total == 1
    
    @pytest.mark.asyncio
    async def test_get_devices_paginated_with_filters(self, repository, mock_session, sample_device):
        """测试分页获取设备列表 - 带过滤条件"""
        mock_devices_result = MagicMock()
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = [sample_device]
        mock_devices_result.scalars.return_value = mock_scalars
        
        mock_count_result = MagicMock()
        mock_count_result.scalar.return_value = 1
        
        mock_session.execute.side_effect = [mock_devices_result, mock_count_result]
        
        devices, total = await repository.get_devices_paginated(
            skip=0, 
            limit=10,
            device_type="switch",
            status="online",
            search="交换机"
        )
        
        assert len(devices) == 1
    
    @pytest.mark.asyncio
    async def test_get_devices_paginated_with_page_params(self, repository, mock_session, sample_device):
        """测试分页获取设备列表 - 使用page/page_size参数"""
        mock_devices_result = MagicMock()
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = [sample_device]
        mock_devices_result.scalars.return_value = mock_scalars
        
        mock_count_result = MagicMock()
        mock_count_result.scalar.return_value = 1
        
        mock_session.execute.side_effect = [mock_devices_result, mock_count_result]
        
        devices, total = await repository.get_devices_paginated(
            page=1, 
            page_size=10
        )
        
        assert len(devices) == 1
    
    # ==================== 状态更新测试 ====================
    
    @pytest.mark.asyncio
    async def test_update_device_status(self, repository, mock_session, sample_device):
        """测试更新设备状态"""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = sample_device
        mock_session.execute.return_value = mock_result
        
        result = await repository.update_device_status(
            1, 
            DeviceStatus.OFFLINE, 
            last_seen=datetime.utcnow()
        )
        
        assert result is True
        mock_session.commit.assert_called_once()
    
    # ==================== 标签处理测试 ====================
    
    def test_normalize_tags_none(self, repository):
        """测试标签规范化 - None"""
        result = repository._normalize_tags(None)
        assert result is None
    
    def test_normalize_tags_dict(self, repository):
        """测试标签规范化 - 字典"""
        tags = {"env": "prod", "team": "network"}
        result = repository._normalize_tags(tags)
        assert result == tags
    
    def test_normalize_tags_json_string(self, repository):
        """测试标签规范化 - JSON字符串"""
        tags_str = '{"env": "prod", "team": "network"}'
        result = repository._normalize_tags(tags_str)
        assert result == {"env": "prod", "team": "network"}
    
    def test_normalize_tags_invalid_json(self, repository):
        """测试标签规范化 - 无效JSON"""
        result = repository._normalize_tags("invalid json")
        assert result is None
    
    # ==================== 统计信息测试 ====================
    
    @pytest.mark.asyncio
    async def test_get_device_statistics(self, repository, mock_session):
        """测试获取设备统计信息"""
        # 模拟各种统计查询
        mock_total = MagicMock()
        mock_total.scalar.return_value = 10
        
        mock_online = MagicMock()
        mock_online.scalar.return_value = 8
        
        mock_offline = MagicMock()
        mock_offline.scalar.return_value = 2
        
        mock_type_stats = MagicMock()
        mock_type_stats.all.return_value = [
            (DeviceType.SWITCH, 5),
            (DeviceType.ROUTER, 3),
            (DeviceType.SERVER, 2)
        ]
        
        mock_session.execute.side_effect = [
            mock_total, mock_online, mock_offline, mock_type_stats
        ]
        
        stats = await repository.get_device_statistics()
        
        assert stats["total_devices"] == 10
        assert stats["online_devices"] == 8
        assert stats["offline_devices"] == 2
        assert "type_distribution" in stats


class TestDeviceGroupOperations:
    """设备组操作测试"""
    
    @pytest.fixture
    def mock_session(self):
        return AsyncMock(spec=AsyncSession)
    
    @pytest.fixture
    def repository(self, mock_session):
        return DeviceRepository(mock_session)
    
    @pytest.mark.asyncio
    async def test_get_device_groups(self, repository, mock_session):
        """测试获取设备组列表"""
        mock_result = MagicMock()
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = []
        mock_result.scalars.return_value = mock_scalars
        mock_session.execute.return_value = mock_result
        
        groups = await repository.get_device_groups()
        
        assert isinstance(groups, list)
    
    @pytest.mark.asyncio
    async def test_create_device_group(self, repository, mock_session):
        """测试创建设备组"""
        result = await repository.create_device_group(
            name="核心设备组",
            description="核心网络设备"
        )
        
        mock_session.add.assert_called_once()
        mock_session.commit.assert_called_once()


class TestNetworkScanOperations:
    """网络扫描操作测试"""
    
    @pytest.fixture
    def mock_session(self):
        return AsyncMock(spec=AsyncSession)
    
    @pytest.fixture
    def repository(self, mock_session):
        return DeviceRepository(mock_session)
    
    @pytest.mark.asyncio
    async def test_create_network_scan(self, repository, mock_session):
        """测试创建网络扫描记录"""
        scan_data = {
            "scan_id": "scan-001",
            "target_network": "192.168.1.0/24",
            "scan_type": "ping",
            "created_by": "admin"
        }
        
        result = await repository.create_network_scan(scan_data)
        
        mock_session.add.assert_called_once()
        mock_session.commit.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_update_scan_status(self, repository, mock_session):
        """测试更新扫描状态"""
        mock_scan = MagicMock()
        mock_scan.status = "running"
        
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = mock_scan
        mock_session.execute.return_value = mock_result
        
        result = await repository.update_scan_status("scan-001", "completed")
        
        assert result is True
        mock_session.commit.assert_called_once()
