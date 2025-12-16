"""
基础Schema类 - 提供通用的数据模式定义
"""
from typing import TypeVar, Generic, List, Optional, Any
from datetime import datetime
from pydantic import BaseModel, ConfigDict


class BaseSchema(BaseModel):
    """
    基础Schema类
    
    所有API数据模式的基类，提供通用配置
    """
    model_config = ConfigDict(
        from_attributes=True,  # 支持从ORM模型转换
        populate_by_name=True,  # 支持别名填充
        str_strip_whitespace=True,  # 自动去除字符串空白
    )


class TimestampMixin(BaseModel):
    """时间戳混入类"""
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class IDMixin(BaseModel):
    """ID混入类"""
    id: int


T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    """
    分页响应模型
    
    Usage:
        PaginatedResponse[DeviceSchema](
            items=devices,
            total=100,
            page=1,
            page_size=20
        )
    """
    items: List[T]
    total: int
    page: int
    page_size: int
    total_pages: int = 0
    has_next: bool = False
    has_prev: bool = False
    
    def __init__(self, **data):
        super().__init__(**data)
        # 计算总页数
        if self.page_size > 0:
            self.total_pages = (self.total + self.page_size - 1) // self.page_size
        # 计算是否有上下页
        self.has_next = self.page < self.total_pages
        self.has_prev = self.page > 1


class SuccessResponse(BaseModel):
    """成功响应模型"""
    success: bool = True
    message: str = "操作成功"
    data: Optional[Any] = None


class ErrorResponse(BaseModel):
    """错误响应模型"""
    success: bool = False
    message: str
    error_code: Optional[str] = None
    details: Optional[dict] = None


class ListResponse(BaseModel, Generic[T]):
    """列表响应模型（不分页）"""
    items: List[T]
    total: int
