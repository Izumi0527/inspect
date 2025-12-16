from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.trustedhost import TrustedHostMiddleware
from fastapi.responses import JSONResponse
import time
import structlog

from src.core.config import settings
from src.core.logging import setup_logging
from src.core.lifespan import lifespan
from src.core.request_tracking import RequestTrackingMiddleware, get_request_logger
from src.core.exception_handlers import register_exception_handlers
from src.api import api_router

# 设置日志
setup_logging()
logger = structlog.get_logger()

app = FastAPI(
    title="网络设备巡检系统 API",
    description="企业级网络设备巡检与监控平台后端API",
    version="1.0.0",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    lifespan=lifespan
)

# 中间件配置
# 注意：中间件的添加顺序很重要，后添加的先执行

# 1. 请求追踪中间件（最先处理）
app.add_middleware(
    RequestTrackingMiddleware,
    request_id_header="X-Request-ID"
)

# 2. CORS 中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*", "X-Request-ID"],  # 允许请求ID头部
)

# 3. 信任主机中间件
app.add_middleware(
    TrustedHostMiddleware,
    allowed_hosts=settings.ALLOWED_HOSTS,
)

# 注册全局异常处理器
register_exception_handlers(app)

# 健康检查
@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "version": "1.0.0",
        "timestamp": time.time(),
    }

# 注册API路由
app.include_router(api_router, prefix="/api/v1")

# 注册WebSocket路由（从新模块导入）
from src.modules.monitoring.websocket import router as websocket_router
app.include_router(websocket_router, prefix="/api/v1", tags=["WebSocket"])

if __name__ == "__main__":
    import uvicorn
    
    uvicorn.run(
        "src.main:app",
        host="0.0.0.0",
        port=8000,
        reload=settings.DEBUG,
        log_level="info" if not settings.DEBUG else "debug",
    )