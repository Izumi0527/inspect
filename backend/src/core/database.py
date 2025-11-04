import asyncio
from typing import AsyncGenerator, Optional
from contextlib import asynccontextmanager

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    create_async_engine,
    AsyncEngine,
    async_sessionmaker
)
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.pool import StaticPool
import structlog

from src.core.config import settings

logger = structlog.get_logger()

# SQLAlchemy基类
Base = declarative_base()

# 导入所有模型以确保它们被发现
from src.models import *  # noqa: F403,F401

class DatabaseManager:
    """数据库管理器"""
    
    def __init__(self):
        self.engine: Optional[AsyncEngine] = None
        self.session_factory: Optional[async_sessionmaker[AsyncSession]] = None
        
    async def initialize(self):
        """初始化数据库连接"""
        try:
            # 创建异步引擎
            # 在生产环境中自动禁用SQL日志输出，提高性能
            echo_enabled = settings.DATABASE_ECHO and settings.DEBUG
            
            self.engine = create_async_engine(
                settings.DATABASE_URL,
                echo=echo_enabled,
                future=True,
                pool_size=settings.DATABASE_POOL_SIZE,
                max_overflow=settings.DATABASE_MAX_OVERFLOW,
                pool_pre_ping=True,  # 连接前验证
                pool_recycle=settings.DATABASE_POOL_RECYCLE,
                # SQLite特殊配置（开发环境）
                poolclass=StaticPool if "sqlite" in settings.DATABASE_URL else None,
                connect_args={"check_same_thread": False} if "sqlite" in settings.DATABASE_URL else {}
            )
            
            # 创建会话工厂
            self.session_factory = async_sessionmaker(
                bind=self.engine,
                class_=AsyncSession,
                expire_on_commit=False,
                autoflush=True,
                autocommit=False
            )
            
            logger.info("Database connection initialized", 
                       database_url=settings.DATABASE_URL.split("://")[0] + "://***")
            
        except Exception as e:
            logger.error("Failed to initialize database connection", error=str(e))
            raise
    
    async def create_tables(self):
        """创建所有表"""
        try:
            if not self.engine:
                raise RuntimeError("Database engine not initialized")
                
            async with self.engine.begin() as conn:
                await conn.run_sync(Base.metadata.create_all)
                
            logger.info("Database tables created successfully")
            
        except Exception as e:
            logger.error("Failed to create database tables", error=str(e))
            raise
    
    async def drop_tables(self):
        """删除所有表（慎用）"""
        try:
            if not self.engine:
                raise RuntimeError("Database engine not initialized")
                
            async with self.engine.begin() as conn:
                await conn.run_sync(Base.metadata.drop_all)
                
            logger.warning("All database tables dropped")
            
        except Exception as e:
            logger.error("Failed to drop database tables", error=str(e))
            raise
    
    @asynccontextmanager
    async def get_session(self) -> AsyncGenerator[AsyncSession, None]:
        """获取数据库会话上下文管理器"""
        if not self.session_factory:
            raise RuntimeError("Database not initialized")
            
        async with self.session_factory() as session:
            try:
                yield session
                await session.commit()
            except Exception as e:
                await session.rollback()
                logger.error("Database session error", error=str(e))
                raise
            finally:
                await session.close()
    
    async def get_session_simple(self) -> AsyncSession:
        """获取简单数据库会话（需要手动管理）"""
        if not self.session_factory:
            raise RuntimeError("Database not initialized")
            
        return self.session_factory()
    
    async def close(self):
        """关闭数据库连接"""
        if self.engine:
            await self.engine.dispose()
            logger.info("Database connection closed")

# 全局数据库管理器
db_manager = DatabaseManager()

# 依赖注入函数
async def get_db_session() -> AsyncGenerator[AsyncSession, None]:
    """FastAPI依赖注入用的数据库会话"""
    if not db_manager.session_factory:
        raise RuntimeError("Database not initialized")

    async with db_manager.session_factory() as session:
        try:
            yield session
            await session.commit()
        except Exception as e:
            await session.rollback()
            logger.error("Database session error in dependency", error=str(e))
            raise
        finally:
            await session.close()

# 内部代码使用的上下文管理器
def get_db_session_context():
    """内部代码用的数据库会话上下文管理器"""
    return db_manager.get_session()

# 辅助函数
async def init_database():
    """初始化数据库（用于应用启动）"""
    await db_manager.initialize()
    await db_manager.create_tables()

async def close_database():
    """关闭数据库连接（用于应用关闭）"""
    await db_manager.close()