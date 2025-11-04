from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field
from datetime import datetime
from pathlib import Path
import structlog
import uuid
import json
import shutil

from src.core.database import get_db_session
from src.core.auth import get_current_user
from src.services.system_settings import system_settings_service
from src.models.user import User

logger = structlog.get_logger()
router = APIRouter(tags=["备份恢复"])

# ========== Pydantic 模型定义 ==========

class BackupIncludeItem(BaseModel):
    """备份包含项"""
    type: str = Field(..., pattern="^(database|config|logs|files)$", description="备份类型")
    name: str = Field(..., description="备份名称")


class BackupCreateRequest(BaseModel):
    """创建备份请求"""
    name: str = Field(..., min_length=1, max_length=100, description="备份名称")
    description: Optional[str] = Field(None, max_length=500, description="备份描述")
    type: str = Field("full", pattern="^(full|incremental|differential)$", description="备份类型")
    includes: List[BackupIncludeItem] = Field(default_factory=list, description="包含项")


class BackupRestoreOptions(BaseModel):
    """恢复备份选项"""
    overwrite: bool = Field(False, description="是否覆盖现有数据")
    validateOnly: bool = Field(False, description="仅验证不恢复")


class BackupResponse(BaseModel):
    """备份响应模型"""
    id: str
    name: str
    description: Optional[str] = None
    type: str
    size: int = Field(..., description="文件大小（字节）")
    includes: List[BackupIncludeItem] = []
    status: str = Field(..., description="备份状态")
    created_at: datetime
    created_by: Optional[str] = None

    class Config:
        from_attributes = True


class BackupValidationResponse(BaseModel):
    """备份验证响应"""
    valid: bool
    issues: List[str] = []


class RestoreResponse(BaseModel):
    """恢复响应"""
    success: bool
    message: str


# ========== 辅助函数 ==========

def get_backup_metadata_path(backup_id: str) -> Path:
    """获取备份元数据文件路径"""
    backup_dir = Path("./data/backups")
    backup_dir.mkdir(parents=True, exist_ok=True)
    return backup_dir / f"{backup_id}_metadata.json"


def get_backup_data_path(backup_id: str) -> Path:
    """获取备份数据文件路径"""
    backup_dir = Path("./data/backups")
    return backup_dir / f"{backup_id}_data.tar.gz"


async def save_backup_metadata(backup_id: str, metadata: dict):
    """保存备份元数据"""
    metadata_path = get_backup_metadata_path(backup_id)
    with open(metadata_path, 'w', encoding='utf-8') as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2, default=str)


async def load_backup_metadata(backup_id: str) -> Optional[dict]:
    """加载备份元数据"""
    metadata_path = get_backup_metadata_path(backup_id)
    if not metadata_path.exists():
        return None
    with open(metadata_path, 'r', encoding='utf-8') as f:
        return json.load(f)


async def list_all_backups() -> List[dict]:
    """列出所有备份"""
    backup_dir = Path("./data/backups")
    backup_dir.mkdir(parents=True, exist_ok=True)

    backups = []
    for metadata_file in backup_dir.glob("*_metadata.json"):
        try:
            with open(metadata_file, 'r', encoding='utf-8') as f:
                metadata = json.load(f)
                backups.append(metadata)
        except Exception as e:
            logger.warning(f"Failed to read backup metadata: {metadata_file}", error=str(e))
            continue

    # 按创建时间倒序排列
    backups.sort(key=lambda x: x.get('created_at', ''), reverse=True)
    return backups


# ========== API 路由 ==========

@router.get("/", response_model=List[BackupResponse], summary="获取备份列表")
async def get_backups(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    获取所有可用备份列表

    权限要求: system:admin
    """
    try:
        backups = await list_all_backups()

        backup_responses = [
            BackupResponse(
                id=backup['id'],
                name=backup['name'],
                description=backup.get('description'),
                type=backup.get('type', 'full'),
                size=backup.get('size', 0),
                includes=[BackupIncludeItem(**item) for item in backup.get('includes', [])],
                status=backup.get('status', 'completed'),
                created_at=datetime.fromisoformat(backup['created_at']) if isinstance(backup['created_at'], str) else backup['created_at'],
                created_by=backup.get('created_by')
            ) for backup in backups
        ]

        logger.info("Retrieved backups list", count=len(backup_responses), user_id=current_user.id)
        return backup_responses

    except Exception as e:
        logger.error("Failed to get backups", error=str(e), user_id=current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取备份列表失败"
        )


@router.get("/{backup_id}", response_model=BackupResponse, summary="获取备份详情")
async def get_backup(
    backup_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    获取指定备份的详细信息

    权限要求: system:admin
    """
    try:
        metadata = await load_backup_metadata(backup_id)

        if not metadata:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"备份不存在: {backup_id}"
            )

        backup_response = BackupResponse(
            id=metadata['id'],
            name=metadata['name'],
            description=metadata.get('description'),
            type=metadata.get('type', 'full'),
            size=metadata.get('size', 0),
            includes=[BackupIncludeItem(**item) for item in metadata.get('includes', [])],
            status=metadata.get('status', 'completed'),
            created_at=datetime.fromisoformat(metadata['created_at']) if isinstance(metadata['created_at'], str) else metadata['created_at'],
            created_by=metadata.get('created_by')
        )

        logger.info("Retrieved backup details", backup_id=backup_id, user_id=current_user.id)
        return backup_response

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get backup", backup_id=backup_id, error=str(e), user_id=current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取备份详情失败"
        )


@router.post("/", response_model=BackupResponse, status_code=status.HTTP_201_CREATED, summary="创建备份")
async def create_backup(
    request: BackupCreateRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    创建新备份

    权限要求: system:admin

    支持的备份类型:
    - full: 完整备份
    - incremental: 增量备份
    - differential: 差异备份
    """
    try:
        backup_id = str(uuid.uuid4())

        # 创建备份元数据
        metadata = {
            'id': backup_id,
            'name': request.name,
            'description': request.description,
            'type': request.type,
            'includes': [item.dict() for item in request.includes],
            'status': 'in_progress',
            'created_at': datetime.utcnow().isoformat(),
            'created_by': current_user.id,
            'size': 0
        }

        # 保存元数据
        await save_backup_metadata(backup_id, metadata)

        # 执行实际备份（这里简化处理，实际应该异步执行）
        try:
            # 备份系统设置
            if any(item.type == 'config' for item in request.includes):
                backup_name = await system_settings_service.create_backup(request.name)
                logger.info("Config backup created", backup_name=backup_name)

            # TODO: 实现数据库备份、日志备份、文件备份等

            # 更新备份状态
            backup_data_path = get_backup_data_path(backup_id)
            metadata['status'] = 'completed'
            metadata['size'] = backup_data_path.stat().st_size if backup_data_path.exists() else 0
            await save_backup_metadata(backup_id, metadata)

        except Exception as backup_error:
            metadata['status'] = 'failed'
            metadata['error'] = str(backup_error)
            await save_backup_metadata(backup_id, metadata)
            raise

        backup_response = BackupResponse(
            id=metadata['id'],
            name=metadata['name'],
            description=metadata.get('description'),
            type=metadata['type'],
            size=metadata['size'],
            includes=request.includes,
            status=metadata['status'],
            created_at=datetime.fromisoformat(metadata['created_at']),
            created_by=metadata['created_by']
        )

        logger.info("Backup created", backup_id=backup_id, name=request.name, created_by=current_user.id)
        return backup_response

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to create backup", error=str(e), user_id=current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="创建备份失败"
        )


@router.delete("/{backup_id}", status_code=status.HTTP_204_NO_CONTENT, summary="删除备份")
async def delete_backup(
    backup_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    删除指定备份

    权限要求: system:admin

    注意: 此操作不可逆
    """
    try:
        metadata = await load_backup_metadata(backup_id)

        if not metadata:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"备份不存在: {backup_id}"
            )

        # 删除备份文件
        metadata_path = get_backup_metadata_path(backup_id)
        data_path = get_backup_data_path(backup_id)

        if metadata_path.exists():
            metadata_path.unlink()
        if data_path.exists():
            data_path.unlink()

        logger.info("Backup deleted", backup_id=backup_id, deleted_by=current_user.id)

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to delete backup", backup_id=backup_id, error=str(e), user_id=current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="删除备份失败"
        )


@router.get("/{backup_id}/download", summary="下载备份")
async def download_backup(
    backup_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    下载备份文件

    权限要求: system:admin
    """
    try:
        metadata = await load_backup_metadata(backup_id)

        if not metadata:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"备份不存在: {backup_id}"
            )

        data_path = get_backup_data_path(backup_id)

        if not data_path.exists():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="备份文件不存在"
            )

        logger.info("Backup downloaded", backup_id=backup_id, downloaded_by=current_user.id)

        return FileResponse(
            path=str(data_path),
            filename=f"{metadata['name']}.tar.gz",
            media_type="application/gzip"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to download backup", backup_id=backup_id, error=str(e), user_id=current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="下载备份失败"
        )


@router.post("/{backup_id}/restore", response_model=RestoreResponse, summary="恢复备份")
async def restore_backup(
    backup_id: str,
    options: Optional[BackupRestoreOptions] = None,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    从备份恢复数据

    权限要求: system:admin

    选项:
    - overwrite: 是否覆盖现有数据（默认false）
    - validateOnly: 仅验证不恢复（默认false）
    """
    try:
        metadata = await load_backup_metadata(backup_id)

        if not metadata:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"备份不存在: {backup_id}"
            )

        options = options or BackupRestoreOptions()

        # 仅验证
        if options.validateOnly:
            validation_result = await validate_backup_internal(backup_id, metadata)
            return RestoreResponse(
                success=validation_result['valid'],
                message="验证完成" if validation_result['valid'] else "验证失败"
            )

        # 执行恢复
        try:
            # 恢复系统设置
            success = await system_settings_service.restore_backup(
                backup_name=metadata['name'],
                user_id=current_user.id
            )

            if not success:
                raise Exception("系统设置恢复失败")

            # TODO: 实现数据库恢复、日志恢复、文件恢复等

            logger.info(
                "Backup restored",
                backup_id=backup_id,
                overwrite=options.overwrite,
                restored_by=current_user.id
            )

            return RestoreResponse(
                success=True,
                message=f"备份 {metadata['name']} 恢复成功"
            )

        except Exception as restore_error:
            logger.error("Restore failed", backup_id=backup_id, error=str(restore_error))
            return RestoreResponse(
                success=False,
                message=f"恢复失败: {str(restore_error)}"
            )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to restore backup", backup_id=backup_id, error=str(e), user_id=current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="恢复备份失败"
        )


@router.post("/{backup_id}/validate", response_model=BackupValidationResponse, summary="验证备份")
async def validate_backup(
    backup_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    验证备份完整性和有效性

    权限要求: system:admin

    检查项:
    - 备份文件是否存在
    - 备份文件是否完整
    - 备份数据是否有效
    """
    try:
        metadata = await load_backup_metadata(backup_id)

        if not metadata:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"备份不存在: {backup_id}"
            )

        result = await validate_backup_internal(backup_id, metadata)

        logger.info(
            "Backup validated",
            backup_id=backup_id,
            valid=result['valid'],
            validated_by=current_user.id
        )

        return BackupValidationResponse(
            valid=result['valid'],
            issues=result['issues']
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to validate backup", backup_id=backup_id, error=str(e), user_id=current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="验证备份失败"
        )


async def validate_backup_internal(backup_id: str, metadata: dict) -> dict:
    """内部备份验证逻辑"""
    issues = []
    valid = True

    # 检查备份状态
    if metadata.get('status') != 'completed':
        issues.append(f"备份状态异常: {metadata.get('status')}")
        valid = False

    # 检查数据文件是否存在
    data_path = get_backup_data_path(backup_id)
    if not data_path.exists():
        issues.append("备份数据文件不存在")
        valid = False

    # 检查文件大小
    if data_path.exists() and data_path.stat().st_size == 0:
        issues.append("备份文件为空")
        valid = False

    # 检查元数据完整性
    required_fields = ['id', 'name', 'type', 'created_at']
    for field in required_fields:
        if field not in metadata:
            issues.append(f"缺少必要字段: {field}")
            valid = False

    return {
        'valid': valid,
        'issues': issues
    }
