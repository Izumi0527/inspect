"""
系统设置模块

提供系统配置、用户管理、安全设置、通知设置等功能
"""


def __getattr__(name):
    if name == "router":
        from src.modules.settings.api import router
        return router
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


__all__ = ["router"]
