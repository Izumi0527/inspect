# 认证服务模块
"""
认证领域服务

提供用户认证和授权功能：
- AuthService: 认证服务（JWT令牌、密码验证）

推荐导入方式:
    from src.services.auth import AuthService
"""

from .service import AuthService

__all__ = ["AuthService"]
