"""
User Settings Service
用户管理扩展服务层

向后兼容层 - 从 modules/settings/users 重导出
"""
from src.modules.settings.users.service import UserSettingsService, user_settings_service

__all__ = ["UserSettingsService", "user_settings_service"]
