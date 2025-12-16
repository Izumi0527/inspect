"""
报表分析模块 - 数据模式定义
"""
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum
from pydantic import Field

from src.shared.base_schema import BaseSchema, PaginatedResponse


class ReportType(str, Enum):
    """报表类型"""
    DEVICE_STATUS = "device_status"
    ALERT_SUMMARY = "alert_summary"
    INSPECTION_SUMMARY = "inspection_summary"
    PERFORMANCE = "performance"
    CUSTOM = "custom"


class ExportFormat(str, Enum):
    """导出格式"""
    PDF = "pdf"
    EXCEL = "excel"
    WORD = "word"
    CSV = "csv"


class ReportGenerateRequest(BaseSchema):
    """生成报表请求"""
    name: str = Field(..., min_length=1, max_length=100)
    report_type: ReportType
    start_time: datetime
    end_time: datetime
    device_ids: Optional[List[int]] = None
    include_charts: bool = True
    include_details: bool = True
    custom_config: Optional[Dict[str, Any]] = None


class ReportResponse(BaseSchema):
    """报表响应"""
    id: int
    name: str
    report_type: ReportType
    status: str  # pending, generating, completed, failed
    start_time: datetime
    end_time: datetime
    file_path: Optional[str] = None
    file_size: Optional[int] = None
    created_by: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None


class ReportListResponse(PaginatedResponse[ReportResponse]):
    """报表列表响应"""
    pass


class ReportExportRequest(BaseSchema):
    """导出报表请求"""
    report_id: int
    format: ExportFormat


class StatisticsRequest(BaseSchema):
    """统计查询请求"""
    start_time: datetime
    end_time: datetime
    device_ids: Optional[List[int]] = None
    group_by: str = Field("day", description="分组方式: hour, day, week, month")


class DeviceStatisticsResponse(BaseSchema):
    """设备统计响应"""
    total_devices: int
    online_rate: float
    avg_response_time: float
    by_type: Dict[str, int]
    by_status: Dict[str, int]
    trend_data: List[Dict[str, Any]]


class AlertStatisticsResponse(BaseSchema):
    """告警统计响应"""
    total_alerts: int
    by_severity: Dict[str, int]
    by_device: Dict[str, int]
    avg_resolution_time: float
    trend_data: List[Dict[str, Any]]


class InspectionStatisticsResponse(BaseSchema):
    """巡检统计响应"""
    total_tasks: int
    completed_tasks: int
    pass_rate: float
    by_device_type: Dict[str, int]
    trend_data: List[Dict[str, Any]]


class ScheduledReportCreate(BaseSchema):
    """创建定时报表请求"""
    name: str
    report_type: ReportType
    schedule_type: str = Field(..., description="调度类型: daily, weekly, monthly")
    schedule_config: Dict[str, Any]
    recipients: List[str] = []
    export_format: ExportFormat = ExportFormat.PDF
    enabled: bool = True


class ScheduledReportResponse(BaseSchema):
    """定时报表响应"""
    id: int
    name: str
    report_type: ReportType
    schedule_type: str
    schedule_config: Dict[str, Any]
    recipients: List[str]
    export_format: ExportFormat
    enabled: bool
    last_run_at: Optional[datetime] = None
    next_run_at: Optional[datetime] = None
    created_at: datetime
