"""
系统管理相关数据模型
包括备份记录、系统设置、系统日志等
"""
from sqlalchemy import Column, Integer, String, Text, Boolean, BigInteger, DateTime, ForeignKey
from sqlalchemy.sql import func
from sqlalchemy.orm import relationship

from src.core.database import Base


class SystemBackup(Base):
    """系统备份记录模型"""

    __tablename__ = 'system_backups'
    __table_args__ = {'comment': '系统备份记录表'}

    # 主键
    id = Column(Integer, primary_key=True, autoincrement=True, comment='备份ID')

    # 基本信息
    backup_name = Column(String(200), unique=True, nullable=False, comment='备份名称')
    backup_type = Column(String(20), nullable=False, comment='备份类型')
    description = Column(Text, comment='备份描述')

    # 备份内容标志
    include_database = Column(Boolean, default=True, comment='包含数据库')
    include_settings = Column(Boolean, default=True, comment='包含设置')
    include_logs = Column(Boolean, default=False, comment='包含日志')
    include_files = Column(Boolean, default=False, comment='包含文件')

    # 文件信息
    file_path = Column(String(500), comment='备份文件路径')
    file_size = Column(BigInteger, comment='文件大小(字节)')
    file_checksum = Column(String(100), comment='文件校验和')
    compression_type = Column(String(20), comment='压缩类型')

    # 状态信息
    status = Column(String(20), default='pending', comment='备份状态')
    progress = Column(Integer, default=0, comment='备份进度(0-100)')
    error_message = Column(Text, comment='错误消息')

    # 时间信息
    started_at = Column(DateTime(timezone=True), comment='开始时间')
    completed_at = Column(DateTime(timezone=True), comment='完成时间')
    duration_seconds = Column(Integer, comment='耗时(秒)')

    # 过期信息
    retention_days = Column(Integer, default=30, comment='保留天数')
    expires_at = Column(DateTime(timezone=True), comment='过期时间')
    auto_delete = Column(Boolean, default=True, comment='自动删除')

    # 审计信息
    created_by = Column(String(36), ForeignKey('users.id', ondelete='SET NULL'), comment='创建人')
    created_at = Column(DateTime(timezone=True), server_default=func.now(), comment='创建时间')
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), comment='更新时间')

    # 关系
    creator = relationship("User", foreign_keys=[created_by], backref="backups")

    def __repr__(self):
        return f"<SystemBackup(id={self.id}, name={self.backup_name}, status={self.status})>"

    def to_dict(self):
        """转换为字典"""
        return {
            'id': self.id,
            'backup_name': self.backup_name,
            'backup_type': self.backup_type,
            'description': self.description,
            'status': self.status,
            'file_size': self.file_size,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'completed_at': self.completed_at.isoformat() if self.completed_at else None,
        }
