"""
监控设置子模块
"""


def __getattr__(name):
    if name == "router":
        from src.modules.settings.monitoring.api import router
        return router
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


__all__ = ["router"]
