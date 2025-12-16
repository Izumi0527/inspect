"""
业务异常测试
"""
import pytest
from src.shared.exceptions import (
    BusinessException,
    NotFoundException,
    ValidationException,
    PermissionDeniedException,
    ConflictException,
    UnauthorizedException,
    RateLimitException,
    ExternalServiceException,
    ServiceUnavailableException,
)


class TestBusinessException:
    """BusinessException 测试"""

    def test_basic_exception(self):
        """测试基本异常"""
        exc = BusinessException("测试错误")
        assert str(exc) == "测试错误"
        assert exc.message == "测试错误"
        assert exc.error_code == "BusinessException"

    def test_custom_code(self):
        """测试自定义错误码"""
        exc = BusinessException("测试错误", error_code="CUSTOM_ERROR")
        assert exc.error_code == "CUSTOM_ERROR"

    def test_with_details(self):
        """测试带详情的异常"""
        exc = BusinessException("测试错误", details={"field": "value"})
        assert exc.details["field"] == "value"

    def test_status_code(self):
        """测试状态码"""
        exc = BusinessException("测试错误", status_code=500)
        assert exc.status_code == 500

    def test_to_dict(self):
        """测试转换为字典"""
        exc = BusinessException("测试错误", error_code="TEST_ERROR")
        result = exc.to_dict()
        assert result["success"] is False
        assert result["message"] == "测试错误"
        assert result["error_code"] == "TEST_ERROR"


class TestNotFoundException:
    """NotFoundException 测试"""

    def test_default_message(self):
        """测试默认消息"""
        exc = NotFoundException()
        assert "不存在" in exc.message
        assert exc.error_code == "NOT_FOUND"
        assert exc.status_code == 404

    def test_custom_message(self):
        """测试自定义消息"""
        exc = NotFoundException(message="设备不存在")
        assert exc.message == "设备不存在"


class TestValidationException:
    """ValidationException 测试"""

    def test_default_message(self):
        """测试默认消息"""
        exc = ValidationException()
        assert exc.error_code == "VALIDATION_ERROR"
        assert exc.status_code == 422

    def test_custom_message(self):
        """测试自定义消息"""
        exc = ValidationException(message="IP地址格式错误")
        assert exc.message == "IP地址格式错误"


class TestPermissionDeniedException:
    """PermissionDeniedException 测试"""

    def test_default_message(self):
        """测试默认消息"""
        exc = PermissionDeniedException()
        assert exc.error_code == "PERMISSION_DENIED"
        assert exc.status_code == 403

    def test_custom_message(self):
        """测试自定义消息"""
        exc = PermissionDeniedException(message="需要管理员权限")
        assert exc.message == "需要管理员权限"


class TestUnauthorizedException:
    """UnauthorizedException 测试"""

    def test_default_message(self):
        """测试默认消息"""
        exc = UnauthorizedException()
        assert exc.error_code == "UNAUTHORIZED"
        assert exc.status_code == 401

    def test_custom_message(self):
        """测试自定义消息"""
        exc = UnauthorizedException(message="令牌已过期")
        assert exc.message == "令牌已过期"


class TestConflictException:
    """ConflictException 测试"""

    def test_default_message(self):
        """测试默认消息"""
        exc = ConflictException()
        assert exc.error_code == "CONFLICT"
        assert exc.status_code == 409

    def test_custom_message(self):
        """测试自定义消息"""
        exc = ConflictException(message="设备IP已存在")
        assert exc.message == "设备IP已存在"


class TestRateLimitException:
    """RateLimitException 测试"""

    def test_default_message(self):
        """测试默认消息"""
        exc = RateLimitException()
        assert exc.error_code == "RATE_LIMIT_EXCEEDED"
        assert exc.status_code == 429

    def test_custom_message(self):
        """测试自定义消息"""
        exc = RateLimitException(message="请求过于频繁，请稍后再试")
        assert exc.message == "请求过于频繁，请稍后再试"


class TestServiceUnavailableException:
    """ServiceUnavailableException 测试"""

    def test_default_message(self):
        """测试默认消息"""
        exc = ServiceUnavailableException()
        assert exc.error_code == "SERVICE_UNAVAILABLE"
        assert exc.status_code == 503

    def test_custom_message(self):
        """测试自定义消息"""
        exc = ServiceUnavailableException(message="数据库维护中")
        assert exc.message == "数据库维护中"


class TestExternalServiceException:
    """ExternalServiceException 测试"""

    def test_with_service_name(self):
        """测试带服务名"""
        exc = ExternalServiceException(service_name="Redis")
        assert exc.error_code == "EXTERNAL_SERVICE_ERROR"
        assert exc.status_code == 502
        assert exc.details.get("service_name") == "Redis"

    def test_custom_message(self):
        """测试自定义消息"""
        exc = ExternalServiceException(
            message="Redis连接失败",
            service_name="Redis"
        )
        assert exc.message == "Redis连接失败"
