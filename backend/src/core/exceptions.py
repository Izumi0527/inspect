"""
自定义异常类定义
"""

class BusinessException(Exception):
    """业务逻辑异常基类"""
    pass


class ValidationException(BusinessException):
    """验证异常"""
    pass


class NotFoundException(BusinessException):
    """资源未找到异常"""
    pass


class ConflictException(BusinessException):
    """资源冲突异常"""
    pass


class AuthenticationException(BusinessException):
    """认证异常"""
    pass


class AuthorizationException(BusinessException):
    """授权异常"""
    pass


class DatabaseException(BusinessException):
    """数据库异常"""
    pass


class ExternalServiceException(BusinessException):
    """外部服务异常"""
    pass