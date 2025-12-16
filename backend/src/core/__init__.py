"""
核心基础设施模块

提供应用程序的核心功能，包括：
- 配置管理 (config)
- 数据库连接 (database)
- 认证授权 (auth, permissions)
- 缓存服务 (redis)
- 时序数据库 (influxdb)
- 日志系统 (logging)
- 异常处理 (exceptions, exception_handlers)
- 依赖注入 (container, dependencies)
- 设备连接 (snmp, ssh)
- WebSocket (websocket)
- 请求追踪 (request_tracking)
- 应用生命周期 (lifespan)
"""

# 配置（无循环依赖风险）
from src.core.config import settings

# 异常（无循环依赖风险）
from src.core.exceptions import (
    BusinessException,
    AuthenticationException,
    AuthorizationException,
    NotFoundException,
    ValidationException,
)


def __getattr__(name: str):
    """延迟导入避免循环依赖"""
    # 数据库
    if name == "get_db_session":
        from src.core.database import get_db_session
        return get_db_session
    if name == "get_db_session_context":
        from src.core.database import get_db_session_context
        return get_db_session_context
    
    # 认证授权
    if name == "get_current_user_ws":
        from src.core.auth import get_current_user_ws
        return get_current_user_ws
    if name == "get_current_user":
        from src.core.permissions import get_current_user
        return get_current_user
    if name == "get_current_active_user":
        from src.core.permissions import get_current_active_user
        return get_current_active_user
    if name == "require_permission":
        from src.core.permissions import require_permission
        return require_permission
    if name == "check_permission":
        from src.core.permissions import check_permission
        return check_permission
    
    # WebSocket
    if name == "websocket_manager":
        from src.core.websocket import websocket_manager
        return websocket_manager
    if name == "MessageType":
        from src.core.websocket import MessageType
        return MessageType
    
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


__all__ = [
    # 配置
    "settings",
    # 数据库
    "get_db_session",
    "get_db_session_context",
    # 认证授权
    "get_current_user_ws",
    "get_current_user",
    "get_current_active_user",
    "require_permission",
    "check_permission",
    # 异常
    "BusinessException",
    "AuthenticationException",
    "AuthorizationException",
    "NotFoundException",
    "ValidationException",
    # WebSocket
    "websocket_manager",
    "MessageType",
]
