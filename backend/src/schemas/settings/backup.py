"""
Backup Schemas
备份相关的Pydantic Schema定义

用于API层的请求和响应数据验证
"""
from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import datetime


class BackupIncludeItem(BaseModel):
    """备份包含项"""
    type: str = Field(..., pattern="^(database|config|logs|files)$", description="备份类型")
    name: str = Field(..., description="备份名称")

    class Config:
        from_attributes = True


class BackupCreateRequest(BaseModel):
    """创建备份请求"""
    name: str = Field(..., min_length=1, max_length=100, description="备份名称")
    description: Optional[str] = Field(None, max_length=500, description="备份描述")
    type: str = Field("full", pattern="^(full|incremental|differential)$", description="备份类型")
    includes: List[BackupIncludeItem] = Field(default_factory=list, description="包含项")


class BackupRestoreOptions(BaseModel):
    """恢复备份选项"""
    overwrite: bool = Field(False, description="是否覆盖现有数据")
    validate_only: bool = Field(False, description="仅验证不恢复")


class BackupResponse(BaseModel):
    """备份响应模型"""
    id: str
    name: str
    description: Optional[str] = None
    type: str
    size: int = Field(..., description="文件大小（字节）")
    includes: List[BackupIncludeItem] = Field(default_factory=list)
    status: str = Field(..., description="备份状态: in_progress|completed|failed")
    created_at: str  # ISO format datetime string
    created_by: Optional[str] = None
    error: Optional[str] = None

    class Config:
        from_attributes = True


class BackupValidationResponse(BaseModel):
    """备份验证响应"""
    valid: bool
    issues: List[str] = Field(default_factory=list)


class RestoreResponse(BaseModel):
    """恢复响应"""
    success: bool
    message: str


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
        from_attributes = True


class BackupRecord(BaseModel):
    """备份记录（列表展示用）"""
    id: str
    name: str
    description: Optional[str] = None
    type: str = "full"
    size: int = 0
    status: str = "completed"
    created_at: str  # ISO format datetime string
    created_by: Optional[str] = None

    class Config:
        from_attributes = True


class BackupStats(BaseModel):
    """备份统计"""
    total_backups: int = 0
    successful_backups: int = 0
    failed_backups: int = 0
    in_progress_backups: int = 0
    total_size: int = 0
    total_size_mb: float = 0.0
    backup_types: dict = Field(default_factory=dict, description="按类型统计")
    last_backup_time: Optional[str] = None
    last_backup_status: Optional[str] = None
    last_backup_name: Optional[str] = None

    class Config:
        from_attributes = True


class BackupManagementResponse(BaseModel):
    """备份管理响应（综合数据）"""
    config: BackupConfig
    backups: List[BackupRecord]
    stats: BackupStats
    disk_usage: dict = Field(default_factory=dict, description="磁盘使用情况")

    class Config:
        from_attributes = True


class BackupHistoryResponse(BaseModel):
    """备份历史响应"""
    items: List[BackupRecord]
    total: int
    page: int
    page_size: int

    class Config:
        from_attributes = True


class BackupCreateResponse(BaseModel):
    """创建备份响应"""
    success: bool
    message: str
    backup_id: str
    created_at: str

    class Config:
        from_attributes = True


class BackupRestoreRequest(BaseModel):
    """恢复备份请求"""
    backup_id: str = Field(..., description="备份ID")
    overwrite: bool = Field(False, description="是否覆盖现有数据")
    options: Optional[dict] = Field(None, description="其他恢复选项")


class BackupRestoreResponse(BaseModel):
    """恢复备份响应"""
    success: bool
    message: str
    restored_at: Optional[str] = None

    class Config:
        from_attributes = True


class BackupDeleteResponse(BaseModel):
    """删除备份响应"""
    success: bool
    message: str

    class Config:
        from_attributes = True
