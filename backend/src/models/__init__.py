# 导入所有模型，确保它们被SQLAlchemy发现
from src.models.user import User, Role, Permission, UserSession, AuditLog
from src.models.device import (
    Device, DeviceGroup, DeviceInterface, DeviceMetric, NetworkScan, DiscoveredDevice,
    DeviceType, DeviceVendor, DeviceStatus
)
from src.models.inspection import (
    InspectionTemplate, InspectionSchedule, Inspection, InspectionLog, 
    InspectionResult, InspectionStatus, InspectionTrigger, CheckItemStatus
)
from src.models.alert import (
    AlertRule, Alert, AlertNotification, MaintenanceWindow,
    AlertSeverity, AlertStatus, AlertCategory, NotificationType, NotificationStatus
)
from src.models.report import (
    ReportTemplate, ReportSchedule, Report, DashboardWidget,
    ReportType, ReportFormat, ReportStatus
)

# 导出所有模型
__all__ = [
    # 用户模型
    "User", "Role", "Permission", "UserSession", "AuditLog",
    
    # 设备模型
    "Device", "DeviceGroup", "DeviceInterface", "DeviceMetric", 
    "NetworkScan", "DiscoveredDevice", "DeviceType", "DeviceVendor", "DeviceStatus",
    
    # 巡检模型
    "InspectionTemplate", "InspectionSchedule", "Inspection", 
    "InspectionLog", "InspectionResult", "InspectionStatus", 
    "InspectionTrigger", "CheckItemStatus",
    
    # 告警模型
    "AlertRule", "Alert", "AlertNotification", "MaintenanceWindow",
    "AlertSeverity", "AlertStatus", "AlertCategory", 
    "NotificationType", "NotificationStatus",
    
    # 报表模型
    "ReportTemplate", "ReportSchedule", "Report", "DashboardWidget",
    "ReportType", "ReportFormat", "ReportStatus"
]