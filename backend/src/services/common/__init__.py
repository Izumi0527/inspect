# 公共服务模块
"""
公共服务

提供通用基础设施服务：
- AnalyticsService: 数据分析服务
- ScriptExecutor: 脚本执行器
- SystemSettingsService: 系统设置服务

推荐导入方式:
    from src.services.common import AnalyticsService, analytics_service
    from src.services.common import ScriptExecutor, script_executor
    from src.services.common import SystemSettingsService, system_settings_service
"""

from .analytics import AnalyticsService, analytics_service
from .script_executor import ScriptExecutor, script_executor
from .system_settings import (
    SystemSettingsService, 
    system_settings_service,
    SettingCategory,
    SettingLevel,
    SystemSetting,
)

__all__ = [
    "AnalyticsService",
    "analytics_service",
    "ScriptExecutor",
    "script_executor",
    "SystemSettingsService",
    "system_settings_service",
    "SettingCategory",
    "SettingLevel",
    "SystemSetting",
]
