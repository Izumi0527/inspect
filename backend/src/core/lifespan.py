import asyncio
import structlog
from contextlib import asynccontextmanager

from src.core.database import init_database, close_database
from src.core.redis import init_redis, close_redis
from src.core.influxdb import init_influxdb, close_influxdb
from src.services.common import system_settings_service
from src.services.scheduler import inspection_scheduler, task_scheduler
from src.services.device import device_monitoring_service
from src.services.alert import alert_engine

logger = structlog.get_logger()

class ApplicationLifespan:
    """应用生命周期管理"""
    
    def __init__(self):
        self.services = []
    
    async def startup(self):
        """应用启动时的初始化操作"""
        try:
            logger.info("Starting application initialization...")
            
            # 首先初始化数据库连接和表结构
            await init_database()
            logger.info("Database initialized successfully")
            
            # 初始化Redis缓存
            await init_redis()
            logger.info("Redis cache initialized")
            
            # 初始化InfluxDB时序数据库
            await init_influxdb()
            logger.info("InfluxDB time series database initialized")
            
            # 初始化系统设置服务
            await system_settings_service.initialize()
            logger.info("System settings service initialized")
            
            # 初始化调度器
            await inspection_scheduler.start()
            logger.info("Inspection scheduler started")
            
            # 启动任务调度器
            await task_scheduler.start()
            logger.info("Task scheduler started")
            
            # 启动设备监控服务
            await device_monitoring_service.start_monitoring()
            logger.info("Device monitoring service started")
            
            # 等待设备监控服务初始化和缓存设备列表（1秒延迟）
            await asyncio.sleep(1.0)
            logger.debug("Waiting for device monitoring service to cache device list...")
            
            # 启动告警引擎（此时可以使用缓存的设备列表）
            await alert_engine.start()
            logger.info("Alert engine started")
            
            # 创建必要的目录
            await self._ensure_directories()
            
            logger.info("Application initialization completed successfully")
            
        except Exception as e:
            logger.error("Application initialization failed", error=str(e))
            raise
    
    async def shutdown(self):
        """应用关闭时的清理操作"""
        try:
            logger.info("Starting application shutdown...")
            
            # 停止任务调度器
            await task_scheduler.stop()
            logger.info("Task scheduler stopped")
            
            # 停止设备监控服务
            await device_monitoring_service.stop_monitoring()
            logger.info("Device monitoring service stopped")
            
            # 停止告警引擎
            await alert_engine.stop()
            logger.info("Alert engine stopped")
            
            # 停止调度器
            inspection_scheduler.shutdown()
            logger.info("Inspection scheduler stopped")
            
            # 关闭Redis连接
            await close_redis()
            logger.info("Redis connection closed")
            
            # 关闭InfluxDB连接
            await close_influxdb()
            logger.info("InfluxDB connection closed")
            
            # 关闭数据库连接
            await close_database()
            logger.info("Database connection closed")
            
            logger.info("Application shutdown completed successfully")
            
        except Exception as e:
            logger.error("Application shutdown failed", error=str(e))
    
    async def _ensure_directories(self):
        """确保必要的目录存在"""
        import os
        from pathlib import Path
        
        directories = [
            "./data",
            "./data/backups", 
            "./data/reports",
            "./data/exports",
            "./logs",
            "./backups"
        ]
        
        for directory in directories:
            Path(directory).mkdir(parents=True, exist_ok=True)
        
        logger.info("Required directories ensured", directories=directories)

# 全局生命周期管理器实例
app_lifespan = ApplicationLifespan()

@asynccontextmanager
async def lifespan(app):
    """FastAPI lifespan context manager"""
    # 启动
    await app_lifespan.startup()

    # 🔍 调试：打印所有注册的路由
    logger.info("=" * 60)
    logger.info("已注册的路由列表:")
    for route in app.routes:
        if hasattr(route, 'path') and hasattr(route, 'methods'):
            logger.info(f"  {route.methods} {route.path}")
    logger.info("=" * 60)

    # 专门查找 monitoring 相关路由
    monitoring_routes = [r for r in app.routes if hasattr(r, 'path') and '/monitoring/' in r.path]
    logger.info(f"找到 {len(monitoring_routes)} 个 monitoring 路由:")
    for route in monitoring_routes:
        if hasattr(route, 'methods'):
            logger.info(f"  {route.methods} {route.path}")
    logger.info("=" * 60)

    yield

    # 关闭
    await app_lifespan.shutdown()