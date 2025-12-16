"""
认证授权服务

重导出原有认证服务，保持向后兼容
"""
from src.services.auth import (
    AuthService,
    create_access_token,
    verify_password,
    get_password_hash,
)

__all__ = [
    "AuthService",
    "create_access_token",
    "verify_password",
    "get_password_hash",
]
