"""
通用设置子模块

提供系统通用配置管理功能，包括：
- 配置项CRUD操作
- 批量更新配置
- 配置导入/导出
- 设置类别管理
"""
from src.modules.settings.general.api import router
from src.modules.settings.general.service import GeneralSettingsService, general_settings_service

__all__ = ["router", "GeneralSettingsService", "general_settings_service"]
