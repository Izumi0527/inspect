"""
General Settings Service
通用配置服务层

向后兼容层 - 从 modules/settings/general 重导出
"""
from src.modules.settings.general.service import (
    GeneralSettingsService,
    general_settings_service
)

__all__ = ["GeneralSettingsService", "general_settings_service"]
