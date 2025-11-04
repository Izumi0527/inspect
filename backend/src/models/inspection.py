from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey, Enum as SQLEnum, JSON
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from enum import Enum
from src.core.database import Base

class InspectionStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"

class InspectionTrigger(str, Enum):
    MANUAL = "manual"
    SCHEDULED = "scheduled"
    ALERT = "alert"

class StrategyType(str, Enum):
    SCHEDULED = "scheduled"
    MANUAL = "manual"

class InspectionTemplate(Base):
    __tablename__ = "inspection_templates"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text)
    category = Column(String(50), default='custom', nullable=False)  # 模板分类: network, system, security, custom
    device_types = Column(JSON)  # 适用的设备类型列表
    check_items = Column(JSON)   # 检查项目配置
    is_default = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # 关系
    inspections = relationship("Inspection", back_populates="template")

class InspectionSchedule(Base):
    __tablename__ = "inspection_schedules"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text)
    
    # 调度配置
    cron_expression = Column(String(100), nullable=False)  # Cron表达式
    device_group_id = Column(Integer, ForeignKey("device_groups.id"))
    template_id = Column(Integer, ForeignKey("inspection_templates.id"))
    
    # 状态
    is_active = Column(Boolean, default=True)
    last_run = Column(DateTime(timezone=True))
    next_run = Column(DateTime(timezone=True))
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # 关系
    device_group = relationship("DeviceGroup")
    template = relationship("InspectionTemplate")
    inspections = relationship("Inspection", back_populates="schedule")

class Inspection(Base):
    __tablename__ = "inspections"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id"), nullable=False)
    template_id = Column(Integer, ForeignKey("inspection_templates.id"))
    schedule_id = Column(Integer, ForeignKey("inspection_schedules.id"))

    # 基本信息
    name = Column(String(200))
    trigger = Column(String(20), nullable=False)
    status = Column(String(20), default=InspectionStatus.PENDING.value)

    # 时间信息
    scheduled_at = Column(DateTime(timezone=True))
    started_at = Column(DateTime(timezone=True))
    completed_at = Column(DateTime(timezone=True))
    duration = Column(Integer)  # 执行耗时（秒）

    # 结果信息
    total_checks = Column(Integer, default=0)
    passed_checks = Column(Integer, default=0)
    failed_checks = Column(Integer, default=0)
    warning_checks = Column(Integer, default=0)  # 警告检查项数
    skipped_checks = Column(Integer, default=0)  # 跳过检查项数
    error_message = Column(Text)
    error_details = Column(JSON)  # 错误详情

    # 执行配置
    timeout = Column(Integer, default=300)  # 超时时间（秒）
    retry_count = Column(Integer, default=0)  # 当前重试次数
    max_retries = Column(Integer, default=3)  # 最大重试次数

    # 审计信息
    created_by = Column(String(36), ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    # 关系
    device = relationship("Device", back_populates="inspections")
    template = relationship("InspectionTemplate", back_populates="inspections")
    schedule = relationship("InspectionSchedule", back_populates="inspections")
    logs = relationship("InspectionLog", back_populates="inspection")
    results = relationship("InspectionResult", back_populates="inspection")
    creator = relationship("User", foreign_keys=[created_by])

class InspectionLog(Base):
    __tablename__ = "inspection_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    inspection_id = Column(Integer, ForeignKey("inspections.id"), nullable=False)
    operator_id = Column(String(36), ForeignKey("users.id"))
    
    # 日志信息
    level = Column(String(20), nullable=False)  # INFO, WARNING, ERROR
    message = Column(Text, nullable=False)
    details = Column(JSON)  # 详细信息（JSON格式）
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # 关系
    inspection = relationship("Inspection", back_populates="logs")
    operator = relationship("User", back_populates="inspection_logs")

class CheckItemStatus(str, Enum):
    PASS = "pass"
    FAIL = "fail"
    WARNING = "warning"
    SKIP = "skip"
    ERROR = "error"

class InspectionResult(Base):
    __tablename__ = "inspection_results"
    
    id = Column(Integer, primary_key=True, index=True)
    inspection_id = Column(Integer, ForeignKey("inspections.id"), nullable=False)
    
    # 检查项信息
    check_item_name = Column(String(100), nullable=False)
    check_item_type = Column(String(50), nullable=False)
    description = Column(Text)
    
    # 结果信息
    status = Column(String(20), nullable=False)
    expected_value = Column(Text)
    actual_value = Column(Text)
    message = Column(Text)
    
    # 执行信息
    execution_time = Column(Integer)  # 毫秒
    error_details = Column(JSON)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    # 关系
    inspection = relationship("Inspection", back_populates="results")

class InspectionStrategy(Base):
    """巡检策略模型 - 用于管理定时和手动巡检策略"""
    __tablename__ = "inspection_strategies"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, index=True)
    description = Column(Text)

    # 策略类型: scheduled(定时) 或 manual(手动)
    type = Column(String(20), nullable=False, default=StrategyType.MANUAL.value)

    # Cron表达式(仅用于定时策略)
    cron = Column(String(100))

    # 关联的设备ID列表(JSON数组)
    devices = Column(JSON, nullable=False, default=list)

    # 关联的模板ID列表(JSON数组)
    templates = Column(JSON, nullable=False, default=list)

    # 策略状态
    enabled = Column(Boolean, default=True, nullable=False)

    # 执行时间记录
    last_run_time = Column(DateTime(timezone=True))
    next_run_time = Column(DateTime(timezone=True))

    # 时间戳
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    def __repr__(self):
        return f"<InspectionStrategy(id={self.id}, name='{self.name}', type='{self.type}', enabled={self.enabled})>"