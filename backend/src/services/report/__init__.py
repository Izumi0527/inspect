# 报告服务模块
"""
报告领域服务

提供报告生成、导出和统计功能：
- ReportGenerator: 巡检报告生成器 (Excel/PDF/HTML/Word)
- ReportExporter: 通用报表导出服务
- StatisticsService: 统计数据查询服务
- StatisticsReportGenerator: 统计报表生成器

推荐导入方式:
    from src.services.report import ReportGenerator, ReportExporter
    from src.services.report import StatisticsService, StatisticsReportGenerator
"""

from .generator import ReportGenerator
from .exporter import ReportExporter, report_exporter
from .statistics_service import StatisticsService
from .statistics_generator import StatisticsReportGenerator, statistics_report_generator

__all__ = [
    # 报告生成
    "ReportGenerator",
    
    # 报表导出
    "ReportExporter",
    "report_exporter",
    
    # 统计服务
    "StatisticsService",
    
    # 统计报表生成
    "StatisticsReportGenerator",
    "statistics_report_generator",
]
