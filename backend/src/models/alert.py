from sqlalchemy import Column, Integer, String, Boolean, DateTime, Text, ForeignKey, Enum as SQLEnum, JSON, Float
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from enum import Enum
from src.core.database import Base

class AlertSeverity(str, Enum):
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"
    FATAL = "fatal"

class AlertStatus(str, Enum):
    OPEN = "open"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"
    CLOSED = "closed"

class AlertCategory(str, Enum):
    CONNECTIVITY = "connectivity"
    PERFORMANCE = "performance"
    SECURITY = "security"
    CONFIGURATION = "configuration"
    HARDWARE = "hardware"
    OTHER = "other"

class AlertRule(Base):
    __tablename__ = "alert_rules"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text)
    category = Column(String(20), nullable=False)
    
    # 规则配置
    metric_name = Column(String(100), nullable=False)  # CPU使用率、内存使用率等
    operator = Column(String(20), nullable=False)      # >, <, =, !=, >=, <=
    threshold_value = Column(Float, nullable=False)
    duration = Column(Integer, default=300)            # 持续时间（秒）
    
    # 适用范围
    device_types = Column(JSON)      # 适用的设备类型
    device_groups = Column(JSON)     # 适用的设备组
    specific_devices = Column(JSON)  # 特定设备ID列表
    
    # 告警配置
    severity = Column(String(20), default=AlertSeverity.WARNING.value)
    auto_resolve = Column(Boolean, default=True)      # 自动恢复
    notification_enabled = Column(Boolean, default=True)
    escalation_time = Column(Integer, default=3600)   # 升级时间（秒）
    
    # 通知配置
    email_enabled = Column(Boolean, default=True)
    sms_enabled = Column(Boolean, default=False)
    webhook_enabled = Column(Boolean, default=False)
    webhook_url = Column(String(500))
    
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # 关系
    alerts = relationship("Alert", back_populates="rule")

class Alert(Base):
    __tablename__ = "alerts"
    
    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id"), nullable=False)
    rule_id = Column(Integer, ForeignKey("alert_rules.id"))
    
    # 告警信息
    title = Column(String(200), nullable=False)
    message = Column(Text, nullable=False)
    category = Column(String(20), nullable=False)
    severity = Column(String(20), nullable=False)
    status = Column(String(20), default=AlertStatus.OPEN.value)
    
    # 指标信息
    metric_name = Column(String(100))
    current_value = Column(Float)
    threshold_value = Column(Float)
    
    # 时间信息
    first_occurred = Column(DateTime(timezone=True), nullable=False)
    last_occurred = Column(DateTime(timezone=True), nullable=False)
    acknowledged_at = Column(DateTime(timezone=True))
    resolved_at = Column(DateTime(timezone=True))
    closed_at = Column(DateTime(timezone=True))
    
    # 处理信息
    acknowledged_by = Column(String(36), ForeignKey("users.id"))
    resolved_by = Column(String(36), ForeignKey("users.id"))
    resolution_note = Column(Text)
    
    # 计数信息
    occurrence_count = Column(Integer, default=1)
    notification_count = Column(Integer, default=0)
    escalation_level = Column(Integer, default=0)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # 关系
    device = relationship("Device", back_populates="alerts")
    rule = relationship("AlertRule", back_populates="alerts")
    acknowledger = relationship("User", foreign_keys=[acknowledged_by])
    resolver = relationship("User", foreign_keys=[resolved_by])
    notifications = relationship("AlertNotification", back_populates="alert")

class NotificationType(str, Enum):
    EMAIL = "email"
    SMS = "sms"
    WEBHOOK = "webhook"
    SLACK = "slack"
    DINGTALK = "dingtalk"
    WECHAT = "wechat"

class NotificationStatus(str, Enum):
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"
    RETRY = "retry"

class AlertNotification(Base):
    __tablename__ = "alert_notifications"
    
    id = Column(Integer, primary_key=True, index=True)
    alert_id = Column(Integer, ForeignKey("alerts.id"), nullable=False)
    
    # 通知信息
    notification_type = Column(String(20), nullable=False)
    recipient = Column(String(200), nullable=False)  # 邮箱、手机号、webhook URL等
    subject = Column(String(200))
    content = Column(Text, nullable=False)
    
    # 状态信息
    status = Column(String(20), default=NotificationStatus.PENDING.value)
    sent_at = Column(DateTime(timezone=True))
    retry_count = Column(Integer, default=0)
    error_message = Column(Text)
    
    # 响应信息
    response_code = Column(String(20))
    response_body = Column(Text)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # 关系
    alert = relationship("Alert", back_populates="notifications")

class MaintenanceWindow(Base):
    __tablename__ = "maintenance_windows"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text)
    
    # 时间配置
    start_time = Column(DateTime(timezone=True), nullable=False)
    end_time = Column(DateTime(timezone=True), nullable=False)
    is_recurring = Column(Boolean, default=False)
    recurrence_pattern = Column(String(100))  # Cron表达式
    
    # 适用范围
    device_ids = Column(JSON)     # 设备ID列表
    device_groups = Column(JSON)  # 设备组ID列表
    alert_rules = Column(JSON)    # 告警规则ID列表
    
    # 状态
    is_active = Column(Boolean, default=True)
    suppress_alerts = Column(Boolean, default=True)
    
    created_by = Column(String(36), ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # 关系
    creator = relationship("User")