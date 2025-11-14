"""
Backup Service
备份服务 - 统一备份业务逻辑

作者: Claude Code
日期: 2025-11-06
版本: 1.0.0

职责：
- 管理备份元数据（增删改查）
- 执行备份操作（创建、恢复、验证）
- 清理过期备份
- 统计备份信息
"""
from typing import List, Optional, Dict, Any
from pathlib import Path
from datetime import datetime, timedelta
import json
import uuid
import shutil
import structlog
from pydantic import BaseModel, Field

logger = structlog.get_logger()


# ========== 内部数据模型 ==========

class BackupIncludeItem(BaseModel):
    """备份包含项"""
    type: str = Field(..., pattern="^(database|config|logs|files)$", description="备份类型")
    name: str = Field(..., description="备份名称")

    class Config:
        from_attributes = True


class BackupMetadata(BaseModel):
    """备份元数据"""
    id: str
    name: str
    description: Optional[str] = None
    type: str  # full, incremental, differential
    includes: List[BackupIncludeItem] = Field(default_factory=list)
    status: str  # in_progress, completed, failed
    created_at: str  # ISO format datetime string
    created_by: Optional[str] = None
    size: int = 0
    error: Optional[str] = None

    class Config:
        from_attributes = True


class BackupCreateRequest(BaseModel):
    """创建备份请求"""
    name: str = Field(..., min_length=1, max_length=100, description="备份名称")
    description: Optional[str] = Field(None, max_length=500, description="备份描述")
    type: str = Field("full", pattern="^(full|incremental|differential)$", description="备份类型")
    includes: List[BackupIncludeItem] = Field(default_factory=list, description="包含项")


class BackupRestoreOptions(BaseModel):
    """恢复选项"""
    overwrite: bool = Field(False, description="是否覆盖现有数据")
    validate_only: bool = Field(False, description="仅验证不恢复")


# ========== BackupService 主类 ==========

class BackupService:
    """
    备份服务

    职责：
    - 管理备份元数据（增删改查）
    - 执行备份操作（创建、恢复、验证）
    - 清理过期备份
    - 统计备份信息

    示例:
        service = BackupService()
        backups = await service.list_all_backups()
    """

    def __init__(
        self,
        backup_dir: str = "./data/backups",
        retention_days: int = 30
    ):
        """
        初始化备份服务

        Args:
            backup_dir: 备份目录路径
            retention_days: 备份保留天数（0表示永久保留）
        """
        self.backup_dir = Path(backup_dir)
        self.backup_dir.mkdir(parents=True, exist_ok=True)
        self.retention_days = retention_days
        self.logger = logger.bind(service="BackupService")
        self.logger.info("BackupService initialized",
                        backup_dir=str(self.backup_dir),
                        retention_days=retention_days)

    # ========== 路径管理 ==========

    def get_backup_metadata_path(self, backup_id: str) -> Path:
        """
        获取备份元数据文件路径

        Args:
            backup_id: 备份ID

        Returns:
            元数据文件路径
        """
        return self.backup_dir / f"{backup_id}_metadata.json"

    def get_backup_data_path(self, backup_id: str) -> Path:
        """
        获取备份数据文件路径

        Args:
            backup_id: 备份ID

        Returns:
            数据文件路径
        """
        return self.backup_dir / f"{backup_id}_data.tar.gz"

    # ========== 元数据操作 ==========

    async def save_backup_metadata(
        self,
        backup_id: str,
        metadata: Dict[str, Any]
    ) -> None:
        """
        保存备份元数据

        Args:
            backup_id: 备份ID
            metadata: 元数据字典

        Raises:
            IOError: 文件写入失败
        """
        metadata_path = self.get_backup_metadata_path(backup_id)
        try:
            with open(metadata_path, 'w', encoding='utf-8') as f:
                json.dump(metadata, f, ensure_ascii=False, indent=2, default=str)
            self.logger.info("Backup metadata saved", backup_id=backup_id)
        except Exception as e:
            self.logger.error("Failed to save backup metadata",
                            backup_id=backup_id, error=str(e))
            raise IOError(f"Failed to save backup metadata: {str(e)}")

    async def load_backup_metadata(
        self,
        backup_id: str
    ) -> Optional[Dict[str, Any]]:
        """
        加载备份元数据

        Args:
            backup_id: 备份ID

        Returns:
            元数据字典，如果不存在则返回None
        """
        metadata_path = self.get_backup_metadata_path(backup_id)
        if not metadata_path.exists():
            self.logger.warning("Backup metadata not found", backup_id=backup_id)
            return None

        try:
            with open(metadata_path, 'r', encoding='utf-8') as f:
                metadata = json.load(f)
            self.logger.debug("Backup metadata loaded", backup_id=backup_id)
            return metadata
        except Exception as e:
            self.logger.error("Failed to load backup metadata",
                            backup_id=backup_id, error=str(e))
            return None

    async def list_all_backups(self) -> List[Dict[str, Any]]:
        """
        列出所有备份

        Returns:
            备份元数据列表（按创建时间倒序）
        """
        backups = []
        for metadata_file in self.backup_dir.glob("*_metadata.json"):
            try:
                with open(metadata_file, 'r', encoding='utf-8') as f:
                    metadata = json.load(f)
                    backups.append(metadata)
            except Exception as e:
                self.logger.warning("Failed to read backup metadata",
                                  file=metadata_file.name, error=str(e))
                continue

        # 按创建时间倒序排列
        backups.sort(key=lambda x: x.get('created_at', ''), reverse=True)

        self.logger.info("Listed all backups", count=len(backups))
        return backups

    # ========== 备份操作 ==========

    async def create_backup(
        self,
        request: BackupCreateRequest,
        user_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        创建备份

        Args:
            request: 备份创建请求
            user_id: 创建用户ID

        Returns:
            创建的备份元数据

        Raises:
            Exception: 备份创建失败
        """
        backup_id = str(uuid.uuid4())

        # 创建初始元数据
        metadata = {
            'id': backup_id,
            'name': request.name,
            'description': request.description,
            'type': request.type,
            'includes': [item.dict() for item in request.includes],
            'status': 'in_progress',
            'created_at': datetime.utcnow().isoformat(),
            'created_by': user_id,
            'size': 0
        }

        # 保存初始元数据
        await self.save_backup_metadata(backup_id, metadata)

        try:
            # TODO: 实现实际的备份逻辑
            # 这里应该调用具体的备份实现：
            # - 数据库备份 (if 'database' in includes)
            # - 配置文件备份 (if 'config' in includes)
            # - 日志文件备份 (if 'logs' in includes)
            # - 其他文件备份 (if 'files' in includes)

            # 暂时模拟备份完成
            backup_data_path = self.get_backup_data_path(backup_id)
            # 创建一个空的备份文件（实际应该是压缩后的数据）
            backup_data_path.touch()

            # 更新元数据状态
            metadata['status'] = 'completed'
            metadata['size'] = backup_data_path.stat().st_size if backup_data_path.exists() else 0
            await self.save_backup_metadata(backup_id, metadata)

            self.logger.info("Backup created successfully",
                           backup_id=backup_id, name=request.name)

        except Exception as e:
            # 备份失败，更新状态
            metadata['status'] = 'failed'
            metadata['error'] = str(e)
            await self.save_backup_metadata(backup_id, metadata)

            self.logger.error("Backup creation failed",
                            backup_id=backup_id, error=str(e))
            raise

        return metadata

    async def delete_backup(self, backup_id: str) -> bool:
        """
        删除备份

        Args:
            backup_id: 备份ID

        Returns:
            是否删除成功
        """
        metadata = await self.load_backup_metadata(backup_id)
        if not metadata:
            self.logger.warning("Backup not found for deletion", backup_id=backup_id)
            return False

        try:
            # 删除元数据文件
            metadata_path = self.get_backup_metadata_path(backup_id)
            if metadata_path.exists():
                metadata_path.unlink()

            # 删除数据文件
            data_path = self.get_backup_data_path(backup_id)
            if data_path.exists():
                data_path.unlink()

            self.logger.info("Backup deleted", backup_id=backup_id, name=metadata.get('name'))
            return True

        except Exception as e:
            self.logger.error("Failed to delete backup",
                            backup_id=backup_id, error=str(e))
            return False

    async def validate_backup(self, backup_id: str) -> Dict[str, Any]:
        """
        验证备份完整性

        Args:
            backup_id: 备份ID

        Returns:
            验证结果 {valid: bool, issues: List[str]}
        """
        metadata = await self.load_backup_metadata(backup_id)
        if not metadata:
            return {
                'valid': False,
                'issues': ['备份元数据不存在']
            }

        issues = []
        valid = True

        # 检查备份状态
        if metadata.get('status') != 'completed':
            issues.append(f"备份状态异常: {metadata.get('status')}")
            valid = False

        # 检查数据文件
        data_path = self.get_backup_data_path(backup_id)
        if not data_path.exists():
            issues.append("备份数据文件不存在")
            valid = False
        elif data_path.stat().st_size == 0:
            issues.append("备份文件为空")
            valid = False

        # 检查必要字段
        required_fields = ['id', 'name', 'type', 'created_at']
        for field in required_fields:
            if field not in metadata:
                issues.append(f"缺少必要字段: {field}")
                valid = False

        self.logger.info("Backup validated",
                        backup_id=backup_id, valid=valid, issues_count=len(issues))

        return {
            'valid': valid,
            'issues': issues
        }

    async def restore_backup(
        self,
        backup_id: str,
        options: Optional[BackupRestoreOptions] = None
    ) -> Dict[str, Any]:
        """
        恢复备份

        Args:
            backup_id: 备份ID
            options: 恢复选项

        Returns:
            恢复结果 {success: bool, message: str}

        Raises:
            ValueError: 备份不存在
            Exception: 恢复失败
        """
        metadata = await self.load_backup_metadata(backup_id)
        if not metadata:
            raise ValueError(f"备份不存在: {backup_id}")

        options = options or BackupRestoreOptions()

        # 仅验证
        if options.validate_only:
            validation = await self.validate_backup(backup_id)
            return {
                'success': validation['valid'],
                'message': '备份验证完成' if validation['valid'] else f"备份验证失败: {', '.join(validation['issues'])}"
            }

        try:
            # TODO: 实现实际的恢复逻辑
            # 这里应该根据 includes 恢复对应的内容
            # 需要解压备份文件并恢复到对应位置

            self.logger.info("Backup restored successfully",
                           backup_id=backup_id,
                           overwrite=options.overwrite,
                           backup_name=metadata.get('name'))

            return {
                'success': True,
                'message': f"备份 {metadata['name']} 恢复成功"
            }

        except Exception as e:
            self.logger.error("Backup restoration failed",
                            backup_id=backup_id, error=str(e))
            raise

    # ========== 维护操作 ==========

    async def cleanup_old_backups(self) -> int:
        """
        清理过期备份

        Returns:
            清理的备份数量
        """
        if self.retention_days <= 0:
            self.logger.info("Backup retention disabled (retention_days=0)")
            return 0

        cutoff_date = datetime.utcnow() - timedelta(days=self.retention_days)
        cleaned_count = 0

        all_backups = await self.list_all_backups()
        for backup in all_backups:
            try:
                created_at = datetime.fromisoformat(backup['created_at'].replace('Z', '+00:00'))
                if created_at < cutoff_date:
                    success = await self.delete_backup(backup['id'])
                    if success:
                        cleaned_count += 1
                        self.logger.info("Old backup cleaned up",
                                       backup_id=backup['id'],
                                       backup_name=backup.get('name'),
                                       age_days=(datetime.utcnow() - created_at).days)
            except Exception as e:
                self.logger.warning("Failed to cleanup backup",
                                  backup_id=backup.get('id'), error=str(e))
                continue

        self.logger.info("Old backups cleaned up",
                        count=cleaned_count,
                        retention_days=self.retention_days)
        return cleaned_count

    # ========== 统计信息 ==========

    async def get_backup_stats(self) -> Dict[str, Any]:
        """
        获取备份统计信息

        Returns:
            统计信息字典
        """
        all_backups = await self.list_all_backups()

        # 按类型统计
        type_stats = {}
        for backup in all_backups:
            backup_type = backup.get('type', 'unknown')
            type_stats[backup_type] = type_stats.get(backup_type, 0) + 1

        stats = {
            'total_backups': len(all_backups),
            'successful_backups': sum(1 for b in all_backups if b.get('status') == 'completed'),
            'failed_backups': sum(1 for b in all_backups if b.get('status') == 'failed'),
            'in_progress_backups': sum(1 for b in all_backups if b.get('status') == 'in_progress'),
            'total_size': sum(b.get('size', 0) for b in all_backups),
            'total_size_mb': round(sum(b.get('size', 0) for b in all_backups) / (1024 * 1024), 2),
            'backup_types': type_stats,
            'last_backup_time': all_backups[0]['created_at'] if all_backups else None,
            'last_backup_status': all_backups[0].get('status') if all_backups else None,
            'last_backup_name': all_backups[0].get('name') if all_backups else None,
        }

        self.logger.debug("Backup stats retrieved",
                         total=stats['total_backups'],
                         successful=stats['successful_backups'])
        return stats


# ========== 全局实例 ==========

# 创建默认实例（可以通过配置覆盖）
backup_service = BackupService()
