"""
安全设置子模块

提供安全策略配置、LDAP集成、会话管理等功能
"""


def __getattr__(name):
    """延迟导入以避免循环依赖"""
    if name == "router":
        from src.modules.settings.security.api import router
        return router
    elif name == "security_settings_service":
        from src.modules.settings.security.service import security_settings_service
        return security_settings_service
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


__all__ = ["router", "security_settings_service"]
