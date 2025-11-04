from sqlalchemy import Column, Integer, String, DateTime, Text, ForeignKey, Enum as SQLEnum, JSON, Boolean
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from enum import Enum
from src.core.database import Base

class ReportType(str, Enum):
    INSPECTION = "inspection"
    PERFORMANCE = "performance"
    AVAILABILITY = "availability"
    ALERT = "alert"
    CUSTOM = "custom"
    TREND = "trend"  # 新增：趋势分析
    STATISTICS = "statistics"  # 新增：统计报表

class ReportCategory(str, Enum):
    """报表类别"""
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    YEARLY = "yearly"
    CUSTOM = "custom"

class ReportFormat(str, Enum):
    PDF = "pdf"
    EXCEL = "excel"
    CSV = "csv"
    JSON = "json"
    HTML = "html"  # 新增：HTML格式
    WORD = "word"  # 新增：Word格式

class ReportStatus(str, Enum):
    PENDING = "pending"
    GENERATING = "generating"
    COMPLETED = "completed"
    FAILED = "failed"

class ReportTemplate(Base):
    __tablename__ = "report_templates"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text)
    report_type = Column(SQLEnum(ReportType), nullable=False)
    
    # 模板配置
    config = Column(JSON, nullable=False)  # 报表配置（图表类型、数据源等）
    chart_configs = Column(JSON)           # 图表配置
    table_configs = Column(JSON)           # 表格配置
    
    # 样式配置
    theme = Column(String(50), default="default")
    logo_url = Column(String(500))
    header_text = Column(Text)
    footer_text = Column(Text)
    
    is_default = Column(Boolean, default=False)
    is_active = Column(Boolean, default=True)
    created_by = Column(String(36), ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # 关系
    creator = relationship("User")
    reports = relationship("Report", back_populates="template")

class ReportSchedule(Base):
    __tablename__ = "report_schedules"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    description = Column(Text)
    template_id = Column(Integer, ForeignKey("report_templates.id"), nullable=False)
    
    # 调度配置
    cron_expression = Column(String(100), nullable=False)
    timezone = Column(String(50), default="Asia/Shanghai")
    
    # 数据范围
    data_range = Column(JSON)  # 数据时间范围配置
    device_filters = Column(JSON)  # 设备过滤条件
    
    # 输出配置
    output_formats = Column(JSON)  # 输出格式列表
    recipients = Column(JSON)      # 接收人列表（邮箱）
    
    # 状态
    is_active = Column(Boolean, default=True)
    last_run = Column(DateTime(timezone=True))
    next_run = Column(DateTime(timezone=True))
    
    created_by = Column(String(36), ForeignKey("users.id"))
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # 关系
    template = relationship("ReportTemplate")
    creator = relationship("User")
    reports = relationship("Report", back_populates="schedule")

class Report(Base):
    __tablename__ = "reports"

    id = Column(Integer, primary_key=True, index=True)
    template_id = Column(Integer, ForeignKey("report_templates.id"), nullable=True)  # 改为可空
    schedule_id = Column(Integer, ForeignKey("report_schedules.id"))

    # 基本信息
    title = Column(String(200), nullable=False)
    description = Column(Text)
    report_type = Column(SQLEnum(ReportType), nullable=False)
    category = Column(SQLEnum(ReportCategory), default=ReportCategory.CUSTOM)  # 新增字段

    # 数据范围
    start_date = Column(DateTime(timezone=True), nullable=False)
    end_date = Column(DateTime(timezone=True), nullable=False)
    device_filters = Column(JSON)
    
    # 生成信息
    status = Column(String(20), default='pending')
    generated_by = Column(String(36), ForeignKey("users.id"))
    generated_at = Column(DateTime(timezone=True))
    
    # 文件信息
    file_formats = Column(JSON)  # 已生成的文件格式
    file_paths = Column(JSON)    # 文件路径映射
    file_sizes = Column(JSON)    # 文件大小映射
    
    # 统计信息
    total_devices = Column(Integer, default=0)
    data_points = Column(Integer, default=0)
    generation_time = Column(Integer)  # 生成耗时（秒）
    
    # 错误信息
    error_message = Column(Text)
    error_details = Column(JSON)
    
    # 访问控制
    is_public = Column(Boolean, default=False)
    shared_users = Column(JSON)  # 共享用户ID列表
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # 关系
    template = relationship("ReportTemplate", back_populates="reports")
    schedule = relationship("ReportSchedule", back_populates="reports")
    generator = relationship("User", foreign_keys=[generated_by])

class DashboardWidget(Base):
    __tablename__ = "dashboard_widgets"
    
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False)
    
    # 组件信息
    widget_type = Column(String(50), nullable=False)  # chart, metric, table, map等
    title = Column(String(100), nullable=False)
    description = Column(Text)
    
    # 布局信息
    position_x = Column(Integer, default=0)
    position_y = Column(Integer, default=0)
    width = Column(Integer, default=6)
    height = Column(Integer, default=4)
    
    # 配置信息
    data_source = Column(String(100), nullable=False)
    query_config = Column(JSON)
    display_config = Column(JSON)
    refresh_interval = Column(Integer, default=60)  # 刷新间隔（秒）
    
    # 状态
    is_active = Column(Boolean, default=True)
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    # 关系
    user = relationship("User")