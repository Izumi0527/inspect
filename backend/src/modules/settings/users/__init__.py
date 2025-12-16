"""
用户管理子模块

提供用户CRUD、批量操作、统计等功能
"""
from src.modules.settings.users.api import router
from src.modules.settings.users.service import UserSettingsService, user_settings_service

__all__ = ["router", "UserSettingsService", "user_settings_service"]
