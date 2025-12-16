"""
数据模式定义

提供 API 请求/响应的数据验证模式：
- user - 用户相关 Schema
- report - 报表相关 Schema
- settings/ - 设置相关 Schema
"""
from src.schemas.user import UserRole

__all__ = [
    "UserRole",
]
