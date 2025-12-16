"""
业务异常定义 - 提供统一的异常处理
"""
from typing import Optional, Any, Dict


class BusinessException(Exception):
    """
    业务异常基类
    
    所有业务相关的异常都应继承此类
    """
    
    def __init__(
        self,
        message: str,
        error_code: Optional[str] = None,
        status_code: int = 400,
        details: Optional[Dict[str, Any]] = None,
        **kwargs
    ):
        super().__init__(message)
        self.message = message
        self.error_code = error_code or self.__class__.__name__
        self.status_code = status_code
        self.details = details or {}
        # 将额外的关键字参数添加到details
        self.details.update(kwargs)
    
    def to_dict(self) -> dict:
        """转换为字典格式"""
        return {
            "success": False,
            "message": self.message,
            "error_code": self.error_code,
            "details": self.details if self.details else None
        }


class NotFoundException(BusinessException):
    """资源不存在异常"""
    
    def __init__(self, message: str = "资源不存在", **kwargs):
        super().__init__(
            message=message,
            error_code="NOT_FOUND",
            status_code=404,
            **kwargs
        )


class ValidationException(BusinessException):
    """数据验证异常"""
    
    def __init__(self, message: str = "数据验证失败", **kwargs):
        super().__init__(
            message=message,
            error_code="VALIDATION_ERROR",
            status_code=422,
            **kwargs
        )


class PermissionDeniedException(BusinessException):
    """权限不足异常"""
    
    def __init__(self, message: str = "权限不足", **kwargs):
        super().__init__(
            message=message,
            error_code="PERMISSION_DENIED",
            status_code=403,
            **kwargs
        )


class ConflictException(BusinessException):
    """资源冲突异常"""
    
    def __init__(self, message: str = "资源冲突", **kwargs):
        super().__init__(
            message=message,
            error_code="CONFLICT",
            status_code=409,
            **kwargs
        )


class UnauthorizedException(BusinessException):
    """未授权异常"""
    
    def __init__(self, message: str = "未授权访问", **kwargs):
        super().__init__(
            message=message,
            error_code="UNAUTHORIZED",
            status_code=401,
            **kwargs
        )


# 别名，保持兼容性
AuthenticationException = UnauthorizedException


class ServiceUnavailableException(BusinessException):
    """服务不可用异常"""
    
    def __init__(self, message: str = "服务暂时不可用", **kwargs):
        super().__init__(
            message=message,
            error_code="SERVICE_UNAVAILABLE",
            status_code=503,
            **kwargs
        )


class RateLimitException(BusinessException):
    """请求频率限制异常"""
    
    def __init__(self, message: str = "请求过于频繁", **kwargs):
        super().__init__(
            message=message,
            error_code="RATE_LIMIT_EXCEEDED",
            status_code=429,
            **kwargs
        )


class ExternalServiceException(BusinessException):
    """外部服务异常"""
    
    def __init__(self, message: str = "外部服务调用失败", service_name: str = "", **kwargs):
        super().__init__(
            message=message,
            error_code="EXTERNAL_SERVICE_ERROR",
            status_code=502,
            service_name=service_name,
            **kwargs
        )
