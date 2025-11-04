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
    """告警规则模型

    存储告警规则配置，用于自动触发告警
    """
    __tablename__ = "alert_rules"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, unique=True, comment="规则名称")
    description = Column(Text, comment="规则描述")
    category = Column(String(50), nullable=False, index=True, comment="告警类别")

    # 规则条件配置
    metric_name = Column(String(100), nullable=False, comment="监控指标名称")
    operator = Column(String(10), nullable=False, comment="比较运算符")
    threshold_value = Column(Float, nullable=False, comment="阈值")
    duration = Column(Integer, default=300, nullable=False, comment="持续时间（秒）")

    # 适用范围（JSON数组）
    device_types = Column(JSON, comment="适用的设备类型")
    device_groups = Column(JSON, comment="适用的设备组")
    specific_devices = Column(JSON, comment="特定设备ID列表")

    # 告警配置
    severity = Column(String(20), default=AlertSeverity.WARNING.value, nullable=False, index=True, comment="严重级别")
    auto_resolve = Column(Boolean, default=True, nullable=False, comment="是否自动解决")

    # 通知配置
    notification_enabled = Column(Boolean, default=True, nullable=False, comment="是否启用通知")
    email_enabled = Column(Boolean, default=False, comment="是否发送邮件")
    email_recipients = Column(JSON, comment="邮件收件人列表")
    webhook_enabled = Column(Boolean, default=False, comment="是否调用Webhook")
    webhook_url = Column(String(500), comment="Webhook URL")
    cooldown_minutes = Column(Integer, default=30, nullable=False, comment="冷却时间（分钟）")

    # 状态
    is_active = Column(Boolean, default=True, nullable=False, index=True, comment="是否启用")

    # 审计字段
    created_by = Column(String(36), ForeignKey("users.id"), nullable=False, comment="创建人ID")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True, comment="创建时间")
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False, comment="更新时间")

    # 关系
    alerts = relationship("Alert", back_populates="rule")

class Alert(Base):
    """告警记录模型

    存储所有告警记录（活跃告警和历史告警）
    """
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    device_id = Column(Integer, ForeignKey("devices.id"), nullable=False, index=True, comment="设备ID")
    rule_id = Column(Integer, ForeignKey("alert_rules.id"), index=True, comment="告警规则ID")

    # 告警信息
    title = Column(String(500), nullable=False, comment="告警标题")
    message = Column(Text, nullable=False, comment="告警消息")
    category = Column(String(50), nullable=False, index=True, comment="告警类别")
    severity = Column(String(20), nullable=False, index=True, comment="严重级别")
    status = Column(String(20), default=AlertStatus.OPEN.value, nullable=False, index=True, comment="告警状态")

    # 指标信息
    metric_name = Column(String(100), comment="指标名称")
    current_value = Column(Float, comment="当前值")
    threshold_value = Column(Float, comment="阈值")

    # 时间信息
    first_occurred = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), index=True, comment="首次发生时间")
    last_occurred = Column(DateTime(timezone=True), nullable=False, server_default=func.now(), comment="最后发生时间")
    acknowledged_at = Column(DateTime(timezone=True), comment="确认时间")
    resolved_at = Column(DateTime(timezone=True), comment="解决时间")
    reactivated_at = Column(DateTime(timezone=True), comment="重新激活时间")
    closed_at = Column(DateTime(timezone=True), comment="关闭时间")

    # 处理信息
    acknowledged_by = Column(String(36), ForeignKey("users.id"), comment="确认人ID")
    resolved_by = Column(String(36), ForeignKey("users.id"), comment="解决人ID")
    resolution_note = Column(Text, comment="解决备注")
    reactivated_by = Column(String(36), ForeignKey("users.id"), comment="重新激活人ID")
    reactivation_reason = Column(Text, comment="重新激活原因")
    closed_by = Column(String(36), ForeignKey("users.id"), comment="关闭人ID")

    # 计数信息
    occurrence_count = Column(Integer, default=1, nullable=False, comment="发生次数")
    notification_count = Column(Integer, default=0, nullable=False, comment="通知次数")
    escalation_level = Column(Integer, default=0, nullable=False, comment="升级级别")

    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True, comment="创建时间")
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False, comment="更新时间")

    # 关系
    device = relationship("Device", back_populates="alerts")
    rule = relationship("AlertRule", back_populates="alerts")
    acknowledger = relationship("User", foreign_keys=[acknowledged_by])
    resolver = relationship("User", foreign_keys=[resolved_by])
    reactivator = relationship("User", foreign_keys=[reactivated_by])
    closer = relationship("User", foreign_keys=[closed_by])
    notifications = relationship("AlertNotification", back_populates="alert")
    operation_history = relationship("AlertOperationHistory", back_populates="alert", cascade="all, delete-orphan")

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
    """维护窗口模型

    定义维护窗口期间抑制告警的策略
    """
    __tablename__ = "maintenance_windows"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False, comment="维护窗口名称")
    description = Column(Text, comment="描述")

    # 时间配置
    start_time = Column(DateTime(timezone=True), nullable=False, comment="开始时间")
    end_time = Column(DateTime(timezone=True), nullable=False, comment="结束时间")
    is_recurring = Column(Boolean, default=False, nullable=False, comment="是否循环")
    recurrence_pattern = Column(String(100), comment="循环模式（Cron表达式）")

    # 适用范围
    device_ids = Column(JSON, comment="设备ID列表")
    device_groups = Column(JSON, comment="设备组ID列表")
    alert_rules = Column(JSON, comment="告警规则ID列表")

    # 状态
    is_active = Column(Boolean, default=True, nullable=False, index=True, comment="是否启用")
    suppress_alerts = Column(Boolean, default=True, nullable=False, comment="是否抑制告警")

    created_by = Column(String(36), ForeignKey("users.id"), comment="创建人ID")
    created_at = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True, comment="创建时间")
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False, comment="更新时间")

    # 关系
    creator = relationship("User")

class AlertOperationHistory(Base):
    """告警操作历史模型

    记录所有告警操作，用于审计追踪
    """
    __tablename__ = "alert_operation_history"

    id = Column(Integer, primary_key=True, index=True)
    alert_id = Column(Integer, ForeignKey("alerts.id", ondelete="CASCADE"), nullable=False, index=True, comment="告警ID")

    # 操作信息
    operation_type = Column(String(50), nullable=False, index=True, comment="操作类型")  # create, acknowledge, resolve, reactivate, close, delete, update
    operator_id = Column(String(36), nullable=False, index=True, comment="操作人ID")
    operator_name = Column(String(100), nullable=False, comment="操作人名称")
    operation_time = Column(DateTime(timezone=True), server_default=func.now(), nullable=False, index=True, comment="操作时间")

    # 操作内容
    note = Column(Text, comment="操作备注")
    previous_status = Column(String(20), comment="操作前状态")
    new_status = Column(String(20), comment="操作后状态")

    # 元数据（JSON格式存储额外信息）
    operation_metadata = Column(JSON, comment="操作元数据")

    # 关系
    alert = relationship("Alert", back_populates="operation_history")