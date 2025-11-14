"""
备份管理 API (统一设置路由)
Backup Management API for Unified Settings

提供备份配置、历史记录、创建、恢复、删除、下载等功能
作为适配层，调用现有备份模块的业务逻辑
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Query
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field
from datetime import datetime
import structlog

from src.core.database import get_db_session
from src.core.permissions import require_permission
from src.services.system_settings import system_settings_service, SettingCategory

# 使用新的BackupService
from src.services.settings.backup_service import (
    backup_service,
    BackupIncludeItem,
    BackupCreateRequest as ServiceBackupCreateRequest,
)
from src.schemas.settings.backup import (
    BackupRestoreOptions,
    RestoreResponse,
)

logger = structlog.get_logger()
router = APIRouter(prefix="/backup", tags=["备份管理"])

# ========== Pydantic 模型定义 ==========

class BackupConfig(BaseModel):
    """备份配置"""
    auto_backup_enabled: bool = Field(False, description="是否启用自动备份")
    backup_frequency: str = Field("daily", description="备份频率: daily|weekly|monthly")
    backup_time: str = Field("02:00", description="备份时间 (HH:MM)")
    retention_days: int = Field(30, description="保留天数")
    backup_path: str = Field("./data/backups", description="备份路径")
    include_database: bool = Field(True, description="包含数据库")
    include_files: bool = Field(True, description="包含文件")
    compress_backup: bool = Field(True, description="压缩备份")

    class Config:
        json_schema_extra = {
            "example": {
                "auto_backup_enabled": True,
                "backup_frequency": "daily",
                "backup_time": "02:00",
                "retention_days": 30,
                "backup_path": "./data/backups",
                "include_database": True,
                "include_files": True,
                "compress_backup": True
            }
        }


class BackupRecord(BaseModel):
    """备份记录"""
    id: str = Field(..., description="备份ID")
    name: str = Field(..., description="备份名称")
    description: Optional[str] = Field(None, description="备份描述")
    type: str = Field("full", description="备份类型")
    size: int = Field(0, description="文件大小（字节）")
    status: str = Field("completed", description="备份状态")
    created_at: datetime = Field(..., description="创建时间")
    created_by: Optional[str] = Field(None, description="创建者ID")

    class Config:
        from_attributes = True


class BackupStats(BaseModel):
    """备份统计"""
    total_backups: int = Field(0, description="总备份数")
    successful_backups: int = Field(0, description="成功备份数")
    failed_backups: int = Field(0, description="失败备份数")
    total_size: int = Field(0, description="总大小（字节）")
    last_backup_time: Optional[datetime] = Field(None, description="最后备份时间")
    last_backup_status: Optional[str] = Field(None, description="最后备份状态")


class BackupManagementResponse(BaseModel):
    """备份管理响应（综合数据）"""
    config: BackupConfig
    backups: List[BackupRecord]
    stats: BackupStats
    disk_usage: dict = Field(default_factory=dict, description="磁盘使用情况")


class CreateBackupRequest(BaseModel):
    """创建备份请求"""
    include_database: bool = Field(True, description="包含数据库")
    include_files: bool = Field(True, description="包含文件")
    description: Optional[str] = Field(None, description="备份描述")


class RestoreBackupRequest(BaseModel):
    """恢复备份请求"""
    backup_id: str = Field(..., description="备份ID")
    restore_database: bool = Field(True, description="恢复数据库")
    restore_files: bool = Field(True, description="恢复文件")


# ========== API 路由 ==========

@router.get("/management", response_model=BackupManagementResponse, summary="获取备份管理数据")
async def get_backup_management(
    current_user: dict = Depends(require_permission("settings:backup:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """
    获取备份管理的综合数据，包括：
    - 备份配置
    - 备份历史记录
    - 备份统计信息
    - 磁盘使用情况

    权限要求: settings:backup:read
    """
    try:
        # 获取备份配置（从系统设置服务读取）
        config_data = await system_settings_service.get_settings_by_category(
            category=SettingCategory.BACKUP
        )

        # 构建备份配置对象
        config = BackupConfig(
            auto_backup_enabled=config_data.get('backup.auto_backup_enabled', {}).get('value', False),
            backup_frequency=config_data.get('backup.backup_frequency', {}).get('value', 'daily'),
            backup_time=config_data.get('backup.backup_time', {}).get('value', '02:00'),
            retention_days=config_data.get('backup.retention_days', {}).get('value', 30),
            backup_path=config_data.get('backup.backup_path', {}).get('value', './data/backups'),
            include_database=config_data.get('backup.include_database', {}).get('value', True),
            include_files=config_data.get('backup.include_files', {}).get('value', True),
            compress_backup=config_data.get('backup.compress_backup', {}).get('value', True)
        )

        # 获取备份历史记录（使用BackupService）
        backups_raw = await backup_service.list_all_backups()
        backups = [
            BackupRecord(
                id=b['id'],
                name=b['name'],
                description=b.get('description'),
                type=b.get('type', 'full'),
                size=b.get('size', 0),
                status=b.get('status', 'completed'),
                created_at=datetime.fromisoformat(b['created_at']) if isinstance(b['created_at'], str) else b['created_at'],
                created_by=b.get('created_by')
            ) for b in backups_raw[:20]  # 限制最近20条
        ]

        # 计算统计信息
        all_backups = await backup_service.list_all_backups()
        stats = BackupStats(
            total_backups=len(all_backups),
            successful_backups=sum(1 for b in all_backups if b.get('status') == 'completed'),
            failed_backups=sum(1 for b in all_backups if b.get('status') == 'failed'),
            total_size=sum(b.get('size', 0) for b in all_backups),
            last_backup_time=datetime.fromisoformat(all_backups[0]['created_at']) if all_backups and all_backups[0].get('created_at') else None,
            last_backup_status=all_backups[0].get('status') if all_backups else None
        )

        # 磁盘使用情况（简化实现）
        import shutil
        backup_path = backup_service.get_backup_data_path("").parent
        if backup_path.exists():
            disk_stat = shutil.disk_usage(backup_path)
            disk_usage = {
                "total": disk_stat.total,
                "used": disk_stat.used,
                "free": disk_stat.free,
                "percent": round((disk_stat.used / disk_stat.total) * 100, 2)
            }
        else:
            disk_usage = {}

        logger.info("Retrieved backup management data", user_id=current_user["id"])

        return BackupManagementResponse(
            config=config,
            backups=backups,
            stats=stats,
            disk_usage=disk_usage
        )

    except Exception as e:
        logger.error("Failed to get backup management data", error=str(e), user_id=current_user["id"])
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"获取备份管理数据失败: {str(e)}"
        )


@router.get("/config", response_model=BackupConfig, summary="获取备份配置")
async def get_backup_config(
    current_user: dict = Depends(require_permission("settings:backup:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """
    获取备份配置

    权限要求: settings:backup:read
    """
    try:
        config_data = await system_settings_service.get_settings_by_category(
            category=SettingCategory.BACKUP
        )

        config = BackupConfig(
            auto_backup_enabled=config_data.get('backup.auto_backup_enabled', {}).get('value', False),
            backup_frequency=config_data.get('backup.backup_frequency', {}).get('value', 'daily'),
            backup_time=config_data.get('backup.backup_time', {}).get('value', '02:00'),
            retention_days=config_data.get('backup.retention_days', {}).get('value', 30),
            backup_path=config_data.get('backup.backup_path', {}).get('value', './data/backups'),
            include_database=config_data.get('backup.include_database', {}).get('value', True),
            include_files=config_data.get('backup.include_files', {}).get('value', True),
            compress_backup=config_data.get('backup.compress_backup', {}).get('value', True)
        )

        logger.info("Retrieved backup config", user_id=current_user["id"])
        return config

    except Exception as e:
        logger.error("Failed to get backup config", error=str(e), user_id=current_user["id"])
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"获取备份配置失败: {str(e)}"
        )


@router.put("/config", summary="更新备份配置")
async def update_backup_config(
    config: BackupConfig,
    current_user: dict = Depends(require_permission("settings:backup:write")),
    session: AsyncSession = Depends(get_db_session)
):
    """
    更新备份配置

    权限要求: settings:backup:write
    """
    try:
        # 转换为字典保存到系统设置
        config_dict = config.model_dump()

        for key, value in config_dict.items():
            await system_settings_service.set_setting(
                key=f"backup.{key}",
                value=value,
                user_id=current_user["id"]
            )

        logger.info("Updated backup config", user_id=current_user["id"], config=config_dict)

        return {"message": "备份配置更新成功"}

    except Exception as e:
        logger.error("Failed to update backup config", error=str(e), user_id=current_user["id"])
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"更新备份配置失败: {str(e)}"
        )


@router.get("/history", response_model=dict, summary="获取备份历史记录")
async def get_backup_history(
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
    current_user: dict = Depends(require_permission("settings:backup:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """
    获取备份历史记录（分页）

    权限要求: settings:backup:read
    """
    try:
        all_backups = await backup_service.list_all_backups()

        # 分页处理
        total_count = len(all_backups)
        start_idx = (page - 1) * page_size
        end_idx = start_idx + page_size
        page_backups = all_backups[start_idx:end_idx]

        backups = [
            BackupRecord(
                id=b['id'],
                name=b['name'],
                description=b.get('description'),
                type=b.get('type', 'full'),
                size=b.get('size', 0),
                status=b.get('status', 'completed'),
                created_at=datetime.fromisoformat(b['created_at']) if isinstance(b['created_at'], str) else b['created_at'],
                created_by=b.get('created_by')
            ) for b in page_backups
        ]

        logger.info("Retrieved backup history", page=page, page_size=page_size, user_id=current_user["id"])

        return {
            "backups": backups,
            "total_count": total_count
        }

    except Exception as e:
        logger.error("Failed to get backup history", error=str(e), user_id=current_user["id"])
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"获取备份历史失败: {str(e)}"
        )


@router.post("/create", response_model=BackupRecord, status_code=status.HTTP_201_CREATED, summary="创建备份（手动）")
async def create_backup(
    request: CreateBackupRequest,
    current_user: dict = Depends(require_permission("settings:backup:write")),
    session: AsyncSession = Depends(get_db_session)
):
    """
    手动创建备份

    权限要求: settings:backup:write
    """
    try:
        # 转换为BackupService的请求格式
        includes = []
        if request.include_database:
            includes.append(BackupIncludeItem(type="database", name="数据库"))
        if request.include_files:
            includes.append(BackupIncludeItem(type="files", name="文件"))

        # 生成备份名称
        backup_name = f"manual_backup_{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}"

        # 创建BackupService请求
        service_request = ServiceBackupCreateRequest(
            name=backup_name,
            description=request.description or "手动创建的备份",
            type="full",
            includes=includes
        )

        # 使用BackupService创建备份
        metadata = await backup_service.create_backup(service_request, user_id=current_user["id"])

        # 转换为API响应格式
        backup_record = BackupRecord(
            id=metadata['id'],
            name=metadata['name'],
            description=metadata.get('description'),
            type=metadata['type'],
            size=metadata['size'],
            status=metadata['status'],
            created_at=datetime.fromisoformat(metadata['created_at']),
            created_by=metadata['created_by']
        )

        logger.info("Backup created", backup_id=metadata['id'], created_by=current_user["id"])
        return backup_record

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to create backup", error=str(e), user_id=current_user["id"])
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"创建备份失败: {str(e)}"
        )


@router.post("/restore", response_model=RestoreResponse, summary="恢复备份")
async def restore_backup(
    request: RestoreBackupRequest,
    current_user: dict = Depends(require_permission("settings:backup:write")),
    session: AsyncSession = Depends(get_db_session)
):
    """
    从备份恢复数据

    权限要求: settings:backup:write
    """
    try:
        metadata = await backup_service.load_backup_metadata(request.backup_id)

        if not metadata:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"备份不存在: {request.backup_id}"
            )

        # 执行恢复
        try:
            success = await system_settings_service.restore_backup(
                backup_name=metadata['name'],
                user_id=current_user["id"]
            )

            if not success:
                raise Exception("系统设置恢复失败")

            logger.info("Backup restored", backup_id=request.backup_id, restored_by=current_user["id"])

            return RestoreResponse(
                success=True,
                message=f"备份 {metadata['name']} 恢复成功"
            )

        except Exception as restore_error:
            logger.error("Restore failed", backup_id=request.backup_id, error=str(restore_error))
            return RestoreResponse(
                success=False,
                message=f"恢复失败: {str(restore_error)}"
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to restore backup", error=str(e), user_id=current_user["id"])
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"恢复备份失败: {str(e)}"
        )


@router.delete("/{backup_id}", status_code=status.HTTP_204_NO_CONTENT, summary="删除备份")
async def delete_backup(
    backup_id: str,
    current_user: dict = Depends(require_permission("settings:backup:write")),
    session: AsyncSession = Depends(get_db_session)
):
    """
    删除指定备份

    权限要求: settings:backup:write

    注意: 此操作不可逆
    """
    try:
        # 使用BackupService删除备份
        success = await backup_service.delete_backup(backup_id)

        if not success:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"备份不存在: {backup_id}"
            )

        logger.info("Backup deleted", backup_id=backup_id, deleted_by=current_user["id"])

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to delete backup", backup_id=backup_id, error=str(e), user_id=current_user["id"])
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"删除备份失败: {str(e)}"
        )


@router.get("/{backup_id}/download", summary="下载备份")
async def download_backup(
    backup_id: str,
    current_user: dict = Depends(require_permission("settings:backup:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """
    下载备份文件

    权限要求: settings:backup:read
    """
    try:
        metadata = await backup_service.load_backup_metadata(backup_id)

        if not metadata:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"备份不存在: {backup_id}"
            )

        data_path = backup_service.get_backup_data_path(backup_id)

        if not data_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="备份文件不存在"
            )

        logger.info("Backup downloaded", backup_id=backup_id, downloaded_by=current_user["id"])

        return FileResponse(
            path=str(data_path),
            filename=f"{metadata['name']}.tar.gz",
            media_type="application/gzip"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to download backup", backup_id=backup_id, error=str(e), user_id=current_user["id"])
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"下载备份失败: {str(e)}"
        )


@router.get("/stats", response_model=BackupStats, summary="获取备份统计信息")
async def get_backup_stats(
    current_user: dict = Depends(require_permission("settings:backup:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """
    获取备份统计信息

    权限要求: settings:backup:read
    """
    try:
        # 使用BackupService获取统计信息
        stats_data = await backup_service.get_backup_stats()

        # 转换为API响应格式
        stats = BackupStats(
            total_backups=stats_data['total_backups'],
            successful_backups=stats_data['successful_backups'],
            failed_backups=stats_data['failed_backups'],
            total_size=stats_data['total_size'],
            last_backup_time=datetime.fromisoformat(stats_data['last_backup_time']) if stats_data.get('last_backup_time') else None,
            last_backup_status=stats_data.get('last_backup_status')
        )

        logger.info("Retrieved backup stats", user_id=current_user["id"])
        return stats

    except Exception as e:
        logger.error("Failed to get backup stats", error=str(e), user_id=current_user["id"])
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"获取备份统计失败: {str(e)}"
        )
