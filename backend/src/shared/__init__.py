"""
共享模块 - 提供基础类和通用工具

包含:
- base_repository: 基础Repository类
- base_service: 基础Service类
- base_schema: 基础Schema类
- pagination: 分页工具
- exceptions: 业务异常定义
- validators: 通用验证器
"""

from src.shared.base_repository import BaseRepository
from src.shared.base_service import BaseService
from src.shared.base_schema import BaseSchema, PaginatedResponse
from src.shared.pagination import Paginator, PaginationParams
from src.shared.exceptions import (
    BusinessException,
    NotFoundException,
    ValidationException,
    PermissionDeniedException,
    ConflictException,
)

__all__ = [
    # 基础类
    "BaseRepository",
    "BaseService",
    "BaseSchema",
    "PaginatedResponse",
    # 分页
    "Paginator",
    "PaginationParams",
    # 异常
    "BusinessException",
    "NotFoundException",
    "ValidationException",
    "PermissionDeniedException",
    "ConflictException",
]
