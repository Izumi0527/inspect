"""
分页工具测试
"""
import pytest
from src.shared.pagination import (
    PaginationParams,
    Paginator,
    get_pagination_params,
)


class TestPaginationParams:
    """PaginationParams 测试"""

    def test_default_values(self):
        """测试默认值"""
        params = PaginationParams()
        assert params.page == 1
        assert params.page_size == 20
        assert params.offset == 0

    def test_custom_values(self):
        """测试自定义值"""
        params = PaginationParams(page=3, page_size=50)
        assert params.page == 3
        assert params.page_size == 50
        assert params.offset == 100  # (3-1) * 50

    def test_offset_calculation(self):
        """测试offset计算"""
        params = PaginationParams(page=5, page_size=10)
        assert params.offset == 40  # (5-1) * 10

    def test_limit_property(self):
        """测试limit属性"""
        params = PaginationParams(page=1, page_size=30)
        assert params.limit == 30

    def test_validate_page_size_limit(self):
        """测试page_size上限验证"""
        params = PaginationParams(page=1, page_size=200).validate()
        assert params.page_size == 100  # 最大100

    def test_validate_page_minimum(self):
        """测试page最小值验证"""
        params = PaginationParams(page=0, page_size=20).validate()
        assert params.page == 1  # 最小1


class TestPaginator:
    """Paginator 测试"""

    def test_paginate_list(self):
        """测试列表分页"""
        items = list(range(10, 20))  # 第2页的数据
        paginator = Paginator(items, total=100, page=2, page_size=10)

        result = paginator.to_dict()
        assert result["items"] == list(range(10, 20))
        assert result["total"] == 100
        assert result["page"] == 2
        assert result["page_size"] == 10
        assert result["total_pages"] == 10

    def test_paginate_empty_list(self):
        """测试空列表分页"""
        items = []
        paginator = Paginator(items, total=0, page=1, page_size=10)

        result = paginator.to_dict()
        assert result["items"] == []
        assert result["total"] == 0
        assert result["total_pages"] == 0

    def test_total_pages_calculation(self):
        """测试总页数计算"""
        # 25条数据，每页10条，应该是3页
        paginator = Paginator([], total=25, page=1, page_size=10)
        assert paginator.total_pages == 3

        # 30条数据，每页10条，应该是3页
        paginator = Paginator([], total=30, page=1, page_size=10)
        assert paginator.total_pages == 3

    def test_has_next_and_previous(self):
        """测试是否有上一页/下一页"""
        # 第一页
        paginator = Paginator([], total=30, page=1, page_size=10)
        assert paginator.has_prev is False
        assert paginator.has_next is True

        # 中间页
        paginator = Paginator([], total=30, page=2, page_size=10)
        assert paginator.has_prev is True
        assert paginator.has_next is True

        # 最后一页
        paginator = Paginator([], total=30, page=3, page_size=10)
        assert paginator.has_prev is True
        assert paginator.has_next is False

    def test_from_query_result(self):
        """测试从查询结果创建分页器"""
        items = [1, 2, 3]
        result = (items, 100)
        paginator = Paginator.from_query_result(result, page=1, page_size=10)

        assert paginator.items == items
        assert paginator.total == 100
        assert paginator.page == 1
        assert paginator.page_size == 10


class TestGetPaginationParams:
    """get_pagination_params 函数测试"""

    def test_with_explicit_params(self):
        """测试显式传入参数（模拟FastAPI依赖注入）"""
        # 直接传入整数值，模拟FastAPI解析后的参数
        params = get_pagination_params(page=1, page_size=20)
        assert params.page == 1
        assert params.page_size == 20

    def test_custom_params(self):
        """测试自定义参数"""
        params = get_pagination_params(page=5, page_size=30)
        assert params.page == 5
        assert params.page_size == 30

    def test_params_validation(self):
        """测试参数验证"""
        # 超过最大page_size会被限制
        params = get_pagination_params(page=1, page_size=200)
        assert params.page_size == 100  # 被限制为最大值
