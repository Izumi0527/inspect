"""
分页工具 - 提供统一的分页参数处理
"""
from typing import Optional, Tuple, List, TypeVar, Generic
from dataclasses import dataclass
from fastapi import Query


@dataclass
class PaginationParams:
    """
    分页参数
    
    Usage:
        @router.get("/devices")
        async def list_devices(
            pagination: PaginationParams = Depends(get_pagination_params)
        ):
            ...
    """
    page: int = 1
    page_size: int = 20
    
    @property
    def offset(self) -> int:
        """计算偏移量"""
        return (self.page - 1) * self.page_size
    
    @property
    def limit(self) -> int:
        """获取限制数量"""
        return self.page_size
    
    def validate(self) -> "PaginationParams":
        """验证并修正参数"""
        if self.page < 1:
            self.page = 1
        if self.page_size < 1:
            self.page_size = 20
        if self.page_size > 100:
            self.page_size = 100
        return self


def get_pagination_params(
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量")
) -> PaginationParams:
    """
    FastAPI依赖注入函数 - 获取分页参数
    
    Usage:
        @router.get("/items")
        async def list_items(
            pagination: PaginationParams = Depends(get_pagination_params)
        ):
            items, total = await service.get_paginated(
                page=pagination.page,
                page_size=pagination.page_size
            )
    """
    return PaginationParams(page=page, page_size=page_size).validate()


T = TypeVar("T")


class Paginator(Generic[T]):
    """
    分页器 - 用于处理分页逻辑
    
    Usage:
        paginator = Paginator(items, total=100, page=1, page_size=20)
        response = paginator.to_response()
    """
    
    def __init__(
        self,
        items: List[T],
        total: int,
        page: int = 1,
        page_size: int = 20
    ):
        self.items = items
        self.total = total
        self.page = page
        self.page_size = page_size
    
    @property
    def total_pages(self) -> int:
        """总页数"""
        if self.page_size <= 0:
            return 0
        return (self.total + self.page_size - 1) // self.page_size
    
    @property
    def has_next(self) -> bool:
        """是否有下一页"""
        return self.page < self.total_pages
    
    @property
    def has_prev(self) -> bool:
        """是否有上一页"""
        return self.page > 1
    
    def to_dict(self) -> dict:
        """转换为字典"""
        return {
            "items": self.items,
            "total": self.total,
            "page": self.page,
            "page_size": self.page_size,
            "total_pages": self.total_pages,
            "has_next": self.has_next,
            "has_prev": self.has_prev
        }
    
    @classmethod
    def from_query_result(
        cls,
        result: Tuple[List[T], int],
        page: int = 1,
        page_size: int = 20
    ) -> "Paginator[T]":
        """
        从查询结果创建分页器
        
        Args:
            result: (items, total) 元组
            page: 当前页码
            page_size: 每页数量
        """
        items, total = result
        return cls(items=items, total=total, page=page, page_size=page_size)
