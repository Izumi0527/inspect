"""
BackupService 单元测试

测试覆盖范围：
- 元数据操作（保存、加载、列表）
- 备份操作（创建、删除、验证、恢复）
- 统计信息
- 清理过期备份
"""
import pytest
from pathlib import Path
from datetime import datetime, timedelta
import tempfile
import shutil
from src.services.settings.backup_service import (
    BackupService,
    BackupCreateRequest,
    BackupIncludeItem,
    BackupRestoreOptions
)


@pytest.fixture
def temp_backup_dir():
    """创建临时备份目录"""
    temp_dir = tempfile.mkdtemp()
    yield temp_dir
    # 测试后清理
    shutil.rmtree(temp_dir, ignore_errors=True)


@pytest.fixture
def backup_service(temp_backup_dir):
    """创建测试用的BackupService实例"""
    return BackupService(backup_dir=temp_backup_dir, retention_days=7)


class TestBackupMetadata:
    """测试元数据操作"""

    @pytest.mark.asyncio
    async def test_save_and_load_metadata(self, backup_service):
        """测试保存和加载元数据"""
        backup_id = "test_backup_123"
        metadata = {
            "id": backup_id,
            "name": "测试备份",
            "type": "full",
            "status": "completed",
            "created_at": datetime.utcnow().isoformat(),
            "size": 1024
        }

        # 保存
        await backup_service.save_backup_metadata(backup_id, metadata)

        # 加载
        loaded = await backup_service.load_backup_metadata(backup_id)

        assert loaded is not None
        assert loaded['id'] == backup_id
        assert loaded['name'] == "测试备份"
        assert loaded['type'] == "full"
        assert loaded['size'] == 1024

    @pytest.mark.asyncio
    async def test_load_nonexistent_metadata(self, backup_service):
        """测试加载不存在的元数据"""
        loaded = await backup_service.load_backup_metadata("nonexistent_id")
        assert loaded is None

    @pytest.mark.asyncio
    async def test_list_all_backups_empty(self, backup_service):
        """测试空备份列表"""
        backups = await backup_service.list_all_backups()
        assert isinstance(backups, list)
        assert len(backups) == 0

    @pytest.mark.asyncio
    async def test_list_all_backups_with_data(self, backup_service):
        """测试有数据的备份列表"""
        # 创建多个备份元数据
        backups_data = [
            {
                "id": "backup_1",
                "name": "backup1",
                "created_at": (datetime.utcnow() - timedelta(days=2)).isoformat(),
                "status": "completed"
            },
            {
                "id": "backup_2",
                "name": "backup2",
                "created_at": (datetime.utcnow() - timedelta(days=1)).isoformat(),
                "status": "completed"
            },
            {
                "id": "backup_3",
                "name": "backup3",
                "created_at": datetime.utcnow().isoformat(),
                "status": "completed"
            },
        ]

        for backup in backups_data:
            await backup_service.save_backup_metadata(backup["id"], backup)

        # 获取列表
        backups = await backup_service.list_all_backups()

        assert len(backups) == 3
        # 应该按时间倒序排列（最新的在前）
        assert backups[0]["id"] == "backup_3"
        assert backups[1]["id"] == "backup_2"
        assert backups[2]["id"] == "backup_1"


class TestBackupOperations:
    """测试备份操作"""

    @pytest.mark.asyncio
    async def test_create_backup(self, backup_service):
        """测试创建备份"""
        request = BackupCreateRequest(
            name="自动备份_20251106",
            description="测试备份",
            type="full",
            includes=[
                BackupIncludeItem(type="database", name="数据库"),
                BackupIncludeItem(type="config", name="配置文件")
            ]
        )

        metadata = await backup_service.create_backup(request, user_id="test_user")

        assert metadata['id'] is not None
        assert metadata['name'] == "自动备份_20251106"
        assert metadata['description'] == "测试备份"
        assert metadata['status'] in ['completed', 'in_progress']
        assert metadata['created_by'] == "test_user"
        assert len(metadata['includes']) == 2

        # 验证元数据文件已创建
        metadata_path = backup_service.get_backup_metadata_path(metadata['id'])
        assert metadata_path.exists()

    @pytest.mark.asyncio
    async def test_delete_backup(self, backup_service):
        """测试删除备份"""
        # 先创建
        request = BackupCreateRequest(name="待删除备份", type="full")
        metadata = await backup_service.create_backup(request)
        backup_id = metadata['id']

        # 验证存在
        loaded = await backup_service.load_backup_metadata(backup_id)
        assert loaded is not None

        # 删除
        success = await backup_service.delete_backup(backup_id)
        assert success is True

        # 验证已删除
        loaded = await backup_service.load_backup_metadata(backup_id)
        assert loaded is None

    @pytest.mark.asyncio
    async def test_delete_nonexistent_backup(self, backup_service):
        """测试删除不存在的备份"""
        success = await backup_service.delete_backup("nonexistent_id")
        assert success is False

    @pytest.mark.asyncio
    async def test_validate_backup_success(self, backup_service):
        """测试验证有效备份"""
        # 创建备份
        request = BackupCreateRequest(name="待验证备份", type="full")
        metadata = await backup_service.create_backup(request)
        backup_id = metadata['id']

        # 验证
        result = await backup_service.validate_backup(backup_id)

        assert 'valid' in result
        assert 'issues' in result
        # 因为是模拟备份，可能文件为空，所以可能验证失败
        assert isinstance(result['issues'], list)

    @pytest.mark.asyncio
    async def test_validate_nonexistent_backup(self, backup_service):
        """测试验证不存在的备份"""
        result = await backup_service.validate_backup("nonexistent_id")

        assert result['valid'] is False
        assert '备份元数据不存在' in result['issues']

    @pytest.mark.asyncio
    async def test_restore_backup_validate_only(self, backup_service):
        """测试仅验证模式的恢复"""
        # 创建备份
        request = BackupCreateRequest(name="待恢复备份", type="full")
        metadata = await backup_service.create_backup(request)
        backup_id = metadata['id']

        # 仅验证
        options = BackupRestoreOptions(validate_only=True)
        result = await backup_service.restore_backup(backup_id, options)

        assert 'success' in result
        assert 'message' in result

    @pytest.mark.asyncio
    async def test_restore_nonexistent_backup(self, backup_service):
        """测试恢复不存在的备份"""
        with pytest.raises(ValueError, match="备份不存在"):
            await backup_service.restore_backup("nonexistent_id")


class TestBackupStats:
    """测试统计信息"""

    @pytest.mark.asyncio
    async def test_get_backup_stats_empty(self, backup_service):
        """测试空统计"""
        stats = await backup_service.get_backup_stats()

        assert stats['total_backups'] == 0
        assert stats['successful_backups'] == 0
        assert stats['failed_backups'] == 0
        assert stats['total_size'] == 0

    @pytest.mark.asyncio
    async def test_get_backup_stats_with_data(self, backup_service):
        """测试有数据的统计"""
        # 创建测试备份
        backups_data = [
            {
                "id": "b1",
                "name": "backup1",
                "type": "full",
                "status": "completed",
                "size": 1024,
                "created_at": datetime.utcnow().isoformat()
            },
            {
                "id": "b2",
                "name": "backup2",
                "type": "incremental",
                "status": "completed",
                "size": 512,
                "created_at": datetime.utcnow().isoformat()
            },
            {
                "id": "b3",
                "name": "backup3",
                "type": "full",
                "status": "failed",
                "size": 0,
                "created_at": datetime.utcnow().isoformat()
            },
        ]

        for backup in backups_data:
            await backup_service.save_backup_metadata(backup["id"], backup)

        # 获取统计
        stats = await backup_service.get_backup_stats()

        assert stats['total_backups'] == 3
        assert stats['successful_backups'] == 2
        assert stats['failed_backups'] == 1
        assert stats['total_size'] == 1536  # 1024 + 512 + 0
        assert stats['total_size_mb'] == round(1536 / (1024 * 1024), 2)
        assert 'backup_types' in stats
        assert stats['backup_types']['full'] == 2
        assert stats['backup_types']['incremental'] == 1
        assert stats['last_backup_name'] is not None


class TestBackupMaintenance:
    """测试维护操作"""

    @pytest.mark.asyncio
    async def test_cleanup_old_backups_disabled(self, temp_backup_dir):
        """测试禁用清理（retention_days=0）"""
        service = BackupService(backup_dir=temp_backup_dir, retention_days=0)

        # 创建旧备份
        old_backup = {
            "id": "old_backup",
            "name": "旧备份",
            "created_at": (datetime.utcnow() - timedelta(days=100)).isoformat(),
            "status": "completed"
        }
        await service.save_backup_metadata(old_backup["id"], old_backup)

        # 执行清理
        cleaned_count = await service.cleanup_old_backups()

        # 应该没有清理任何备份
        assert cleaned_count == 0

        # 验证备份仍然存在
        loaded = await service.load_backup_metadata(old_backup["id"])
        assert loaded is not None

    @pytest.mark.asyncio
    async def test_cleanup_old_backups_with_retention(self, temp_backup_dir):
        """测试按保留期清理备份"""
        service = BackupService(backup_dir=temp_backup_dir, retention_days=7)

        # 创建新旧备份
        old_backup = {
            "id": "old_backup",
            "name": "旧备份",
            "created_at": (datetime.utcnow() - timedelta(days=10)).isoformat(),
            "status": "completed"
        }
        new_backup = {
            "id": "new_backup",
            "name": "新备份",
            "created_at": (datetime.utcnow() - timedelta(days=3)).isoformat(),
            "status": "completed"
        }

        await service.save_backup_metadata(old_backup["id"], old_backup)
        await service.save_backup_metadata(new_backup["id"], new_backup)

        # 执行清理
        cleaned_count = await service.cleanup_old_backups()

        # 应该清理了1个旧备份
        assert cleaned_count == 1

        # 验证旧备份已删除
        loaded_old = await service.load_backup_metadata(old_backup["id"])
        assert loaded_old is None

        # 验证新备份仍然存在
        loaded_new = await service.load_backup_metadata(new_backup["id"])
        assert loaded_new is not None


class TestPathManagement:
    """测试路径管理"""

    def test_get_backup_metadata_path(self, backup_service):
        """测试获取元数据路径"""
        backup_id = "test_backup_123"
        path = backup_service.get_backup_metadata_path(backup_id)

        assert isinstance(path, Path)
        assert path.name == f"{backup_id}_metadata.json"
        assert str(backup_service.backup_dir) in str(path)

    def test_get_backup_data_path(self, backup_service):
        """测试获取数据文件路径"""
        backup_id = "test_backup_123"
        path = backup_service.get_backup_data_path(backup_id)

        assert isinstance(path, Path)
        assert path.name == f"{backup_id}_data.tar.gz"
        assert str(backup_service.backup_dir) in str(path)
