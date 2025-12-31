"""
备份管理API路由 - 延迟导入避免循环依赖
"""
from fastapi import APIRouter, Depends, HTTPException
from typing import Optional, List
from datetime import datetime
from pydantic import BaseModel
import structlog

from src.core.permissions import require_permission

router = APIRouter(prefix="/backup", tags=["备份管理"])
logger = structlog.get_logger()


# ============= 数据模型 =============

class BackupConfig(BaseModel):
    autoBackupEnabled: bool = False
    backupFrequency: str = "daily"
    backupTime: str = "02:00"
    retentionDays: int = 30
    backupPath: str = "./data/backups"
    includeDatabase: bool = True
    includeFiles: bool = True
    compressBackup: bool = True


class BackupRecord(BaseModel):
    id: str
    fileName: str  # 前端期望 camelCase
    filePath: str = ""
    fileSize: int = 0  # 前端期望 camelCase
    backupType: str = "manual"  # 前端期望: 'auto' | 'manual'
    status: str = "success"  # 前端期望: 'success' | 'failed' | 'in_progress'
    createdAt: str  # 前端期望 camelCase
    createdBy: str = "system"  # 前端期望 camelCase
    duration: int = 0  # 备份耗时（秒）
    errorMessage: Optional[str] = None  # 错误信息

    class Config:
        from_attributes = True


class DiskUsage(BaseModel):
    used: int = 0
    total: int = 0
    percentage: float = 0.0


class BackupManagementResponse(BaseModel):
    config: BackupConfig
    backups: List[BackupRecord]
    totalCount: int
    diskUsage: DiskUsage


class BackupStats(BaseModel):
    total_backups: int = 0
    successful_backups: int = 0
    failed_backups: int = 0
    total_size: int = 0
    last_backup_time: Optional[str] = None
    last_backup_status: Optional[str] = None


# ============= 模拟数据 =============

_backup_config = BackupConfig()

_backup_records = [
    BackupRecord(
        id="backup_001",
        fileName="系统完整备份_20241226.tar.gz",
        filePath="./data/backups/系统完整备份_20241226.tar.gz",
        fileSize=1024 * 1024 * 256,  # 256MB
        backupType="auto",
        status="success",
        createdAt="2024-12-26T02:00:00",
        createdBy="system",
        duration=120
    ),
    BackupRecord(
        id="backup_002",
        fileName="系统完整备份_20241225.tar.gz",
        filePath="./data/backups/系统完整备份_20241225.tar.gz",
        fileSize=1024 * 1024 * 248,  # 248MB
        backupType="auto",
        status="success",
        createdAt="2024-12-25T02:00:00",
        createdBy="system",
        duration=115
    ),
    BackupRecord(
        id="backup_003",
        fileName="手动备份_20241224.tar.gz",
        filePath="./data/backups/手动备份_20241224.tar.gz",
        fileSize=1024 * 1024 * 252,  # 252MB
        backupType="manual",
        status="success",
        createdAt="2024-12-24T15:30:00",
        createdBy="admin",
        duration=125
    ),
]


# ============= API 端点 =============

@router.get("/management", response_model=BackupManagementResponse, summary="获取备份管理数据")
async def get_backup_management(
    current_user: dict = Depends(require_permission("settings:backup:read"))
):
    """获取备份管理完整数据（配置 + 历史记录 + 磁盘使用情况）"""
    try:
        # 计算磁盘使用情况
        total_size = sum(b.fileSize for b in _backup_records)
        disk_total = 1024 * 1024 * 1024 * 10  # 10GB
        
        return BackupManagementResponse(
            config=_backup_config,
            backups=_backup_records,
            totalCount=len(_backup_records),
            diskUsage=DiskUsage(
                used=total_size,
                total=disk_total,
                percentage=round(total_size / disk_total * 100, 2)
            )
        )
    except Exception as e:
        logger.error("Failed to get backup management data", error=str(e))
        raise HTTPException(status_code=500, detail=f"获取备份管理数据失败: {str(e)}")


@router.get("/config", response_model=BackupConfig, summary="获取备份配置")
async def get_backup_config(
    current_user: dict = Depends(require_permission("settings:backup:read"))
):
    """获取备份配置"""
    return _backup_config


@router.put("/config", summary="更新备份配置")
async def update_backup_config(
    config: BackupConfig,
    current_user: dict = Depends(require_permission("settings:backup:write"))
):
    """更新备份配置"""
    global _backup_config
    _backup_config = config
    return {"success": True, "message": "配置已更新"}


@router.get("/stats", response_model=BackupStats, summary="获取备份统计")
async def get_backup_stats(
    current_user: dict = Depends(require_permission("settings:backup:read"))
):
    """获取备份统计信息"""
    total_size = sum(b.fileSize for b in _backup_records)
    successful = len([b for b in _backup_records if b.status == "success"])
    failed = len([b for b in _backup_records if b.status == "failed"])
    
    last_backup = _backup_records[0] if _backup_records else None
    
    return BackupStats(
        total_backups=len(_backup_records),
        successful_backups=successful,
        failed_backups=failed,
        total_size=total_size,
        last_backup_time=last_backup.createdAt if last_backup else None,
        last_backup_status="success" if last_backup and last_backup.status == "success" else None
    )


@router.get("/history", summary="获取备份历史记录")
async def get_backup_history(
    page: int = 1,
    page_size: int = 20,
    current_user: dict = Depends(require_permission("settings:backup:read"))
):
    """获取备份历史记录"""
    start = (page - 1) * page_size
    end = start + page_size
    
    return {
        "backups": _backup_records[start:end],
        "total_count": len(_backup_records)
    }


@router.post("/create", response_model=BackupRecord, summary="创建备份")
async def create_backup(
    include_database: bool = True,
    include_files: bool = True,
    description: Optional[str] = None,
    current_user: dict = Depends(require_permission("settings:backup:write"))
):
    """创建新备份"""
    backup_id = f"backup_{datetime.now().strftime('%Y%m%d%H%M%S')}"
    
    new_backup = BackupRecord(
        id=backup_id,
        fileName=f"手动备份_{datetime.now().strftime('%Y%m%d_%H%M%S')}.tar.gz",
        filePath=f"./data/backups/手动备份_{datetime.now().strftime('%Y%m%d_%H%M%S')}.tar.gz",
        fileSize=1024 * 1024 * 250,  # 模拟 250MB
        backupType="manual",
        status="success",
        createdAt=datetime.now().isoformat(),
        createdBy=current_user.get("username", "admin"),
        duration=118
    )
    
    _backup_records.insert(0, new_backup)
    
    return new_backup


@router.post("/restore", summary="恢复备份")
async def restore_backup(
    backup_id: str,
    restore_database: bool = True,
    restore_files: bool = True,
    current_user: dict = Depends(require_permission("settings:backup:write"))
):
    """恢复备份"""
    backup = next((b for b in _backup_records if b.id == backup_id), None)
    if not backup:
        raise HTTPException(status_code=404, detail="备份不存在")
    
    return {"success": True, "message": f"备份 {backup.fileName} 恢复成功"}


@router.delete("/{backup_id}", summary="删除备份")
async def delete_backup(
    backup_id: str,
    current_user: dict = Depends(require_permission("settings:backup:write"))
):
    """删除备份"""
    global _backup_records
    
    backup = next((b for b in _backup_records if b.id == backup_id), None)
    if not backup:
        raise HTTPException(status_code=404, detail="备份不存在")
    
    _backup_records = [b for b in _backup_records if b.id != backup_id]
    
    return {"success": True, "message": "备份已删除"}


@router.get("/{backup_id}/download", summary="下载备份")
async def download_backup(
    backup_id: str,
    current_user: dict = Depends(require_permission("settings:backup:read"))
):
    """下载备份文件"""
    backup = next((b for b in _backup_records if b.id == backup_id), None)
    if not backup:
        raise HTTPException(status_code=404, detail="备份不存在")
    
    # 实际实现中应返回文件
    raise HTTPException(status_code=501, detail="备份文件下载功能暂未实现")


__all__ = ["router"]
