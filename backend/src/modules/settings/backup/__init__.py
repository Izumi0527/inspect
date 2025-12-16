"""
备份管理子模块
"""


def __getattr__(name):
    if name == "router":
        from src.modules.settings.backup.api import router
        return router
    elif name == "backup_service":
        from src.services.settings.backup_service import backup_service
        return backup_service
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


__all__ = ["router", "backup_service"]
