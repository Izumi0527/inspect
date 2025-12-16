"""
全局异常处理器

统一处理业务异常，返回标准化的错误响应
"""
from fastapi import Request, status
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from starlette.exceptions import HTTPException as StarletteHTTPException
import structlog

from src.shared.exceptions import (
    BusinessException,
    NotFoundException,
    ValidationException,
    PermissionDeniedException,
    ConflictException,
    AuthenticationException,
    RateLimitException,
    ServiceUnavailableException,
)

logger = structlog.get_logger()


def create_error_response(
    status_code: int,
    error_type: str,
    message: str,
    details: dict = None
) -> JSONResponse:
    """创建标准化错误响应"""
    content = {
        "success": False,
        "error": {
            "type": error_type,
            "message": message,
        }
    }
    if details:
        content["error"]["details"] = details
    
    return JSONResponse(status_code=status_code, content=content)


async def business_exception_handler(request: Request, exc: BusinessException) -> JSONResponse:
    """处理业务异常"""
    logger.warning(
        "Business exception",
        error_type=exc.__class__.__name__,
        message=exc.message,
        details=exc.details,
        path=str(request.url),
    )
    
    # 根据异常类型确定状态码
    status_code_map = {
        NotFoundException: status.HTTP_404_NOT_FOUND,
        ValidationException: status.HTTP_400_BAD_REQUEST,
        PermissionDeniedException: status.HTTP_403_FORBIDDEN,
        ConflictException: status.HTTP_409_CONFLICT,
        AuthenticationException: status.HTTP_401_UNAUTHORIZED,
        RateLimitException: status.HTTP_429_TOO_MANY_REQUESTS,
        ServiceUnavailableException: status.HTTP_503_SERVICE_UNAVAILABLE,
    }
    
    status_code = status_code_map.get(type(exc), status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    return create_error_response(
        status_code=status_code,
        error_type=exc.__class__.__name__,
        message=exc.message,
        details=exc.details
    )


async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
    """处理HTTP异常"""
    logger.warning(
        "HTTP exception",
        status_code=exc.status_code,
        detail=exc.detail,
        path=str(request.url),
    )
    
    return create_error_response(
        status_code=exc.status_code,
        error_type="HTTPException",
        message=str(exc.detail)
    )


async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    """处理请求验证异常"""
    errors = []
    for error in exc.errors():
        field = ".".join(str(loc) for loc in error["loc"])
        errors.append({
            "field": field,
            "message": error["msg"],
            "type": error["type"]
        })
    
    logger.warning(
        "Validation error",
        errors=errors,
        path=str(request.url),
    )
    
    return create_error_response(
        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
        error_type="ValidationError",
        message="请求参数验证失败",
        details={"errors": errors}
    )


async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """处理未捕获的异常"""
    logger.error(
        "Unhandled exception",
        exc_info=exc,
        path=str(request.url),
        method=request.method,
    )
    
    # 生产环境不暴露详细错误信息
    from src.core.config import settings
    message = str(exc) if settings.DEBUG else "服务器内部错误"
    
    return create_error_response(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        error_type="InternalServerError",
        message=message
    )


def register_exception_handlers(app):
    """注册所有异常处理器"""
    # 业务异常
    app.add_exception_handler(BusinessException, business_exception_handler)
    app.add_exception_handler(NotFoundException, business_exception_handler)
    app.add_exception_handler(ValidationException, business_exception_handler)
    app.add_exception_handler(PermissionDeniedException, business_exception_handler)
    app.add_exception_handler(ConflictException, business_exception_handler)
    
    # HTTP异常
    app.add_exception_handler(StarletteHTTPException, http_exception_handler)
    
    # 验证异常
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    
    # 通用异常（放在最后）
    app.add_exception_handler(Exception, generic_exception_handler)
