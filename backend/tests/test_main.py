"""
简化的测试API服务
用于测试数据库连接和基础API接口
"""
import asyncio
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
import structlog
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy import text

from src.core.config import settings

logger = structlog.get_logger()

# 创建数据库引擎
engine = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """应用生命周期管理"""
    global engine
    
    try:
        # 初始化数据库连接
        engine = create_async_engine(settings.DATABASE_URL)
        logger.info("Database connection initialized")
        
        yield
        
    except Exception as e:
        logger.error("Application startup failed", error=str(e))
        raise
    finally:
        if engine:
            await engine.dispose()
            logger.info("Database connection closed")

# 创建FastAPI应用
app = FastAPI(
    title="Inspect System API - 测试版",
    description="网络设备巡检系统API（简化测试版）",
    version="1.0.0",
    lifespan=lifespan
)

# 添加CORS中间件
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    """根路由"""
    return {
        "message": "Inspect System API",
        "version": "1.0.0 (测试版)",
        "status": "running"
    }

@app.get("/health")
async def health_check():
    """健康检查"""
    try:
        # 测试数据库连接
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        
        return {
            "status": "healthy",
            "database": "connected",
            "timestamp": "2025-01-25T12:00:00Z"
        }
    except Exception as e:
        logger.error("Health check failed", error=str(e))
        raise HTTPException(status_code=500, detail="Service unhealthy")

@app.get("/api/tables")
async def list_tables():
    """列出数据库中的所有表"""
    try:
        async with engine.connect() as conn:
            result = await conn.execute(text("""
                SELECT table_name 
                FROM information_schema.tables 
                WHERE table_schema = 'public' 
                ORDER BY table_name
            """))
            tables = [row[0] for row in result.fetchall()]
            
        return {
            "tables": tables,
            "total": len(tables)
        }
    except Exception as e:
        logger.error("Failed to list tables", error=str(e))
        raise HTTPException(status_code=500, detail=f"获取表列表失败: {str(e)}")

@app.get("/api/table/{table_name}/count")
async def get_table_count(table_name: str):
    """获取指定表的记录数"""
    try:
        # 简单的SQL注入防护
        if not table_name.replace('_', '').isalnum():
            raise HTTPException(status_code=400, detail="Invalid table name")
            
        async with engine.connect() as conn:
            result = await conn.execute(text(f"SELECT COUNT(*) FROM {table_name}"))
            count = result.fetchone()[0]
            
        return {
            "table": table_name,
            "count": count
        }
    except Exception as e:
        logger.error("Failed to get table count", table=table_name, error=str(e))
        raise HTTPException(status_code=500, detail=f"获取表记录数失败: {str(e)}")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "test_main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
        log_level="info"
    )