"""
请求追踪中间件
提供端到端的请求ID追踪功能，支持前后端关联日志
"""

import uuid
import time
import contextvars
from typing import Optional
import structlog
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware

# 创建上下文变量来存储请求ID
request_id_context_var: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    'request_id', default=None
)

logger = structlog.get_logger(__name__)

class RequestTrackingMiddleware(BaseHTTPMiddleware):
    """
    请求追踪中间件
    功能：
    1. 从请求头中提取或生成请求ID
    2. 将请求ID存储到上下文中供日志使用
    3. 记录请求开始和结束
    4. 在响应头中返回请求ID
    5. 记录请求处理时间和状态
    """

    def __init__(self, app, request_id_header: str = "X-Request-ID"):
        super().__init__(app)
        self.request_id_header = request_id_header

    async def dispatch(self, request: Request, call_next):
        # 提取或生成请求ID
        request_id = self._get_or_generate_request_id(request)

        # 将请求ID存储到上下文变量中
        request_id_context_var.set(request_id)

        # 记录请求开始
        start_time = time.time()

        # 创建带有请求ID的结构化日志记录器
        request_logger = logger.bind(request_id=request_id)

        # 记录请求详情
        await self._log_request_start(request_logger, request, request_id)

        try:
            # 处理请求
            response = await call_next(request)

            # 计算处理时间
            process_time = time.time() - start_time

            # 在响应头中添加请求ID
            response.headers[self.request_id_header] = request_id
            response.headers["X-Process-Time"] = str(round(process_time, 4))

            # 记录请求完成
            await self._log_request_complete(request_logger, request, response, process_time, request_id)

            return response

        except Exception as exc:
            # 计算处理时间
            process_time = time.time() - start_time

            # 记录请求错误
            await self._log_request_error(request_logger, request, exc, process_time, request_id)

            # 重新抛出异常
            raise exc

    def _get_or_generate_request_id(self, request: Request) -> str:
        """
        从请求头中提取请求ID，如果不存在则生成新的
        """
        # 尝试从请求头获取
        request_id = request.headers.get(self.request_id_header)

        if request_id:
            # 验证请求ID格式
            if self._is_valid_request_id(request_id):
                return request_id
            else:
                logger.warning("收到无效的请求ID，将生成新的",
                             invalid_request_id=request_id,
                             client_ip=self._get_client_ip(request))

        # 生成新的请求ID
        return self._generate_request_id()

    def _is_valid_request_id(self, request_id: str) -> bool:
        """
        验证请求ID格式
        """
        if not request_id or len(request_id) < 8 or len(request_id) > 128:
            return False

        # 检查是否包含有害字符
        if any(char in request_id for char in ['\n', '\r', '\t', '\0']):
            return False

        return True

    def _generate_request_id(self) -> str:
        """
        生成新的请求ID
        格式: req_timestamp_uuid
        """
        timestamp = int(time.time() * 1000)  # 毫秒时间戳
        short_uuid = str(uuid.uuid4()).replace('-', '')[:12]  # 12位UUID
        return f"req_{timestamp}_{short_uuid}"

    def _get_client_ip(self, request: Request) -> str:
        """
        获取客户端IP地址
        """
        # 优先从代理头中获取真实IP
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            return forwarded_for.split(',')[0].strip()

        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            return real_ip

        # 从连接信息获取
        if hasattr(request, 'client') and request.client:
            return request.client.host

        return "unknown"

    async def _log_request_start(self, logger_instance, request: Request, request_id: str):
        """
        记录请求开始
        """
        # 获取请求的基本信息
        method = request.method
        url = str(request.url)
        client_ip = self._get_client_ip(request)
        user_agent = request.headers.get("User-Agent", "")
        content_length = request.headers.get("Content-Length", 0)

        # 检查是否为健康检查请求
        is_health_check = url.endswith("/health") or url.endswith("/ping")

        if is_health_check:
            # 健康检查请求使用debug级别
            logger_instance.debug(
                "HTTP request started",
                method=method,
                url=url,
                client_ip=client_ip,
                user_agent=user_agent[:100],  # 限制长度
                content_length=content_length,
                request_type="health_check"
            )
        else:
            logger_instance.info(
                "HTTP request started",
                method=method,
                url=url,
                client_ip=client_ip,
                user_agent=user_agent[:100],
                content_length=content_length,
                request_type="api"
            )

    async def _log_request_complete(self, logger_instance, request: Request,
                                  response: Response, process_time: float, request_id: str):
        """
        记录请求完成
        """
        method = request.method
        url = str(request.url)
        status_code = response.status_code
        client_ip = self._get_client_ip(request)

        # 获取响应大小
        content_length = response.headers.get("Content-Length", "unknown")

        # 根据状态码确定日志级别
        if status_code >= 500:
            log_level = "error"
        elif status_code >= 400:
            log_level = "warning"
        elif str(request.url).endswith(("/health", "/ping")):
            log_level = "debug"
        else:
            log_level = "info"

        getattr(logger_instance, log_level)(
            "HTTP request completed",
            method=method,
            url=url,
            status_code=status_code,
            client_ip=client_ip,
            process_time=round(process_time, 4),
            content_length=content_length,
            response_size=len(response.body) if hasattr(response, 'body') else 0
        )

    async def _log_request_error(self, logger_instance, request: Request,
                               exception: Exception, process_time: float, request_id: str):
        """
        记录请求错误
        """
        method = request.method
        url = str(request.url)
        client_ip = self._get_client_ip(request)

        logger_instance.error(
            "HTTP request failed",
            method=method,
            url=url,
            client_ip=client_ip,
            process_time=round(process_time, 4),
            error_type=type(exception).__name__,
            error_message=str(exception),
            exception=exception
        )


def get_current_request_id() -> Optional[str]:
    """
    获取当前请求的请求ID
    """
    return request_id_context_var.get()


def set_request_id(request_id: str):
    """
    设置当前请求的请求ID
    """
    request_id_context_var.set(request_id)


# 创建结构化日志处理器，自动包含请求ID
def get_request_logger(module: str = __name__) -> structlog.stdlib.BoundLogger:
    """
    获取包含当前请求ID的日志记录器
    """
    logger_instance = structlog.get_logger(module)
    request_id = get_current_request_id()

    if request_id:
        return logger_instance.bind(request_id=request_id)
    else:
        return logger_instance