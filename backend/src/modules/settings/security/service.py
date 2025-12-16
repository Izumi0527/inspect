"""
安全设置服务

延迟导入以避免循环依赖
"""
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from src.services.settings.security_service import SecuritySettingsService


def _get_security_service():
    """延迟获取安全设置服务"""
    from src.services.settings.security_service import security_settings_service
    return security_settings_service


class _SecurityServiceProxy:
    """安全服务代理，延迟加载实际服务"""
    
    def __getattr__(self, name):
        return getattr(_get_security_service(), name)


security_settings_service = _SecurityServiceProxy()

__all__ = ["security_settings_service"]
