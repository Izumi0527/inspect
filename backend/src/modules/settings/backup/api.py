"""
备份管理API路由 - 延迟导入避免循环依赖
"""
from fastapi import APIRouter

router = APIRouter(prefix="/backup", tags=["备份管理"])

_original_router = None


def _get_original_router():
    global _original_router
    if _original_router is None:
        # 延迟导入原始路由的端点
        from src.services.settings.backup_service import backup_service
        from src.services.common import system_settings_service, SettingCategory
        from src.core.database import get_db_session
        from src.core.permissions import require_permission
        from fastapi import Depends, HTTPException, status, Query
        from fastapi.responses import FileResponse
        from sqlalchemy.ext.asyncio import AsyncSession
        from pydantic import BaseModel, Field
        from typing import List, Optional
        from datetime import datetime
        import structlog
        import shutil

        logger = structlog.get_logger()

        # 定义模型
        class BackupConfig(BaseModel):
            auto_backup_enabled: bool = False
            backup_frequency: str = "daily"
            backup_time: str = "02:00"
            retention_days: int = 30
            backup_path: str = "./data/backups"
            include_database: bool = True
            include_files: bool = True
            compress_backup: bool = True

        class BackupRecord(BaseModel):
            id: str
            name: str
            description: Optional[str] = None
            type: str = "full"
            size: int = 0
            status: str = "completed"
            created_at: datetime
            created_by: Optional[str] = None

            class Config:
                from_attributes = True

        class BackupStats(BaseModel):
            total_backups: int = 0
            successful_backups: int = 0
            failed_backups: int = 0
            total_size: int = 0
            last_backup_time: Optional[datetime] = None
            last_backup_status: Optional[str] = None

        @router.get("/config", response_model=BackupConfig)
        async def get_backup_config(
            current_user: dict = Depends(require_permission("settings:backup:read")),
            session: AsyncSession = Depends(get_db_session)
        ):
            try:
                config_data = await system_settings_service.get_settings_by_category(SettingCategory.BACKUP)
                return BackupConfig(
                    auto_backup_enabled=config_data.get('backup.auto_backup_enabled', {}).get('value', False),
                    backup_frequency=config_data.get('backup.backup_frequency', {}).get('value', 'daily'),
                    backup_time=config_data.get('backup.backup_time', {}).get('value', '02:00'),
                    retention_days=config_data.get('backup.retention_days', {}).get('value', 30),
                    backup_path=config_data.get('backup.backup_path', {}).get('value', './data/backups'),
                    include_database=config_data.get('backup.include_database', {}).get('value', True),
                    include_files=config_data.get('backup.include_files', {}).get('value', True),
                    compress_backup=config_data.get('backup.compress_backup', {}).get('value', True)
                )
            except Exception as e:
                logger.error("Failed to get backup config", error=str(e))
                raise HTTPException(status_code=500, detail=f"获取备份配置失败: {str(e)}")

        @router.get("/stats", response_model=BackupStats)
        async def get_backup_stats(
            current_user: dict = Depends(require_permission("settings:backup:read")),
            session: AsyncSession = Depends(get_db_session)
        ):
            try:
                stats_data = await backup_service.get_backup_stats()
                return BackupStats(
                    total_backups=stats_data['total_backups'],
                    successful_backups=stats_data['successful_backups'],
                    failed_backups=stats_data['failed_backups'],
                    total_size=stats_data['total_size'],
                    last_backup_time=datetime.fromisoformat(stats_data['last_backup_time']) if stats_data.get('last_backup_time') else None,
                    last_backup_status=stats_data.get('last_backup_status')
                )
            except Exception as e:
                logger.error("Failed to get backup stats", error=str(e))
                raise HTTPException(status_code=500, detail=f"获取备份统计失败: {str(e)}")

        _original_router = True
    return _original_router


# 在首次访问时注册路由
_get_original_router()

__all__ = ["router"]
