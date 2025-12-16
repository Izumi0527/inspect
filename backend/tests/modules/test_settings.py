"""
Settings模块测试
"""
import pytest


class TestSettingsModuleImport:
    """Settings模块导入测试"""

    def test_import_settings_module(self):
        """测试导入settings主模块"""
        from src.modules.settings import router
        assert router is not None

    def test_import_general_submodule(self):
        """测试导入general子模块"""
        from src.modules.settings.general import router, general_settings_service
        assert router is not None
        assert general_settings_service is not None

    def test_import_users_submodule(self):
        """测试导入users子模块"""
        from src.modules.settings.users import router, user_settings_service
        assert router is not None
        assert user_settings_service is not None

    def test_import_backup_submodule(self):
        """测试导入backup子模块"""
        from src.modules.settings.backup import router, backup_service
        assert router is not None
        assert backup_service is not None

    def test_import_notifications_submodule(self):
        """测试导入notifications子模块"""
        from src.modules.settings.notifications import router
        assert router is not None

    def test_import_security_submodule(self):
        """测试导入security子模块"""
        from src.modules.settings.security import router
        assert router is not None

    def test_import_audit_submodule(self):
        """测试导入audit子模块"""
        from src.modules.settings.audit import router
        assert router is not None

    def test_import_monitoring_submodule(self):
        """测试导入monitoring子模块"""
        from src.modules.settings.monitoring import router
        assert router is not None


class TestSettingsSchemas:
    """Settings数据模式测试"""

    def test_general_schemas(self):
        """测试general模块的schemas"""
        from src.modules.settings.general.schemas import (
            SettingItem,
            BulkUpdateRequest,
            BulkUpdateResponse,
        )
        assert SettingItem is not None
        assert BulkUpdateRequest is not None
        assert BulkUpdateResponse is not None

    def test_users_schemas(self):
        """测试users模块的schemas"""
        from src.modules.settings.users.schemas import (
            UserRole,
            UserStatus,
            UserCreate,
            UserUpdate,
            UserResponse,
        )
        assert UserRole is not None
        assert UserStatus is not None
        assert UserCreate is not None
        assert UserUpdate is not None
        assert UserResponse is not None

    def test_backup_schemas(self):
        """测试backup模块的schemas"""
        from src.modules.settings.backup.schemas import (
            BackupRestoreOptions,
            RestoreResponse,
        )
        assert BackupRestoreOptions is not None
        assert RestoreResponse is not None
