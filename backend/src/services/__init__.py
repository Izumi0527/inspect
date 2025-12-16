"""
业务逻辑层

提供各业务领域的服务实现：
- 告警服务: alert/
- 设备服务: device/
- 巡检服务: inspection/
- 报告服务: report/
- 调度服务: scheduler/
- 监控服务: monitoring/
- 认证服务: auth/
- 用户服务: user/
- 公共服务: common/

推荐导入方式:
  - from src.services.alert import AlertService, AlertEngine, alert_escalation_service
  - from src.services.device import DeviceMonitoringService, DeviceConnector, NetworkScanner
  - from src.services.inspection import InspectionService, InspectionReportService
  - from src.services.report import ReportGenerator, ReportExporter, StatisticsService
  - from src.services.scheduler import InspectionScheduler, TaskScheduler
  - from src.services.monitoring import MonitoringService, PerformanceCollector, TrafficAnalyzer
  - from src.services.auth import AuthService
  - from src.services.user import UserService
  - from src.services.common import AnalyticsService, ScriptExecutor, SystemSettingsService
"""

# 使用延迟导入避免循环依赖
def __getattr__(name: str):
    """延迟导入服务实例"""
    service_map = {
        # 监控服务 - 新模块化结构
        "monitoring_service": ("src.services.monitoring.service", "monitoring_service"),
        "performance_collector": ("src.services.monitoring.collector", "performance_collector"),
        "traffic_analyzer": ("src.services.monitoring.traffic", "traffic_analyzer"),
        # 设备服务 - 新模块化结构
        "device_monitoring_service": ("src.services.device.monitoring", "device_monitoring_service"),
        "device_connector": ("src.services.device.connector", "device_connector"),
        "device_performance_collector": ("src.services.device.performance", "device_performance_collector"),
        "device_batch_service": ("src.services.device.batch", "device_batch_service"),
        "network_scanner": ("src.services.device.scanner", "network_scanner"),
        # 告警服务 - 新模块化结构
        "alert_service": ("src.services.alert.service", "alert_service"),
        "alert_engine": ("src.services.alert.engine", "alert_engine"),
        "alert_escalation_service": ("src.services.alert.escalation", "alert_escalation_service"),
        # 巡检服务 - 新模块化结构
        "inspection_service": ("src.services.inspection.service", "InspectionService"),
        "inspection_report_service": ("src.services.inspection.report", "InspectionReportService"),
        "inspection_script_templates": ("src.services.inspection.templates", "InspectionScriptTemplates"),
        # 报告服务 - 新模块化结构
        "report_generator": ("src.services.report.generator", "ReportGenerator"),
        "report_exporter": ("src.services.report.exporter", "report_exporter"),
        "statistics_service": ("src.services.report.statistics_service", "StatisticsService"),
        "statistics_report_generator": ("src.services.report.statistics_generator", "statistics_report_generator"),
        # 调度服务 - 新模块化结构
        "inspection_scheduler": ("src.services.scheduler.inspection_scheduler", "inspection_scheduler"),
        "task_scheduler": ("src.services.scheduler.task_scheduler", "task_scheduler"),
        # 认证服务 - 新模块化结构
        "auth_service": ("src.services.auth.service", "AuthService"),
        # 用户服务 - 新模块化结构
        "user_service": ("src.services.user.service", "UserService"),
        # 公共服务 - 新模块化结构
        "analytics_service": ("src.services.common.analytics", "analytics_service"),
        "script_executor": ("src.services.common.script_executor", "script_executor"),
        "system_settings_service": ("src.services.common.system_settings", "system_settings_service"),
        # 缓存服务 (已迁移到 infrastructure)
        "cache_service": ("src.infrastructure.cache", "cache_service"),
    }
    
    if name in service_map:
        module_path, attr_name = service_map[name]
        import importlib
        module = importlib.import_module(module_path)
        return getattr(module, attr_name)
    
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


__all__ = [
    # 监控服务
    "monitoring_service",
    "performance_collector",
    "traffic_analyzer",
    # 设备服务
    "device_monitoring_service",
    "device_connector",
    "device_performance_collector",
    "device_batch_service",
    "network_scanner",
    # 告警服务
    "alert_service",
    "alert_engine",
    "alert_escalation_service",
    # 巡检服务
    "inspection_service",
    "inspection_report_service",
    "inspection_script_templates",
    # 报告服务
    "report_generator",
    "report_exporter",
    "statistics_service",
    "statistics_report_generator",
    # 调度服务
    "inspection_scheduler",
    "task_scheduler",
    # 认证服务
    "auth_service",
    # 用户服务
    "user_service",
    # 公共服务
    "analytics_service",
    "script_executor",
    "system_settings_service",
    # 缓存服务
    "cache_service",
]
