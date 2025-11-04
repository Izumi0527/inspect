"""
报表相关的Pydantic Schema定义
支持前后端数据格式转换（snake_case <-> camelCase）
"""
from datetime import datetime
from typing import List, Optional, Dict, Any, Union
from pydantic import BaseModel, Field, field_validator, ConfigDict
from enum import Enum


def to_camel(string: str) -> str:
    """将snake_case转换为camelCase"""
    components = string.split('_')
    return components[0] + ''.join(x.title() for x in components[1:])


class CamelCaseModel(BaseModel):
    """支持camelCase别名的基础模型"""
    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,  # 允许使用原始名称和别名
        from_attributes=True
    )


# ============================================================================
# 枚举类型
# ============================================================================

class ReportType(str, Enum):
    """报表类型"""
    INSPECTION = "inspection"
    TREND = "trend"
    STATISTICS = "statistics"
    CUSTOM = "custom"


class ReportCategory(str, Enum):
    """报表类别"""
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    YEARLY = "yearly"
    CUSTOM = "custom"


class ReportFormat(str, Enum):
    """报表格式"""
    PDF = "pdf"
    EXCEL = "excel"
    HTML = "html"
    WORD = "word"


class ReportStatus(str, Enum):
    """报表状态"""
    GENERATING = "generating"
    COMPLETED = "completed"
    FAILED = "failed"
    SCHEDULED = "scheduled"


class ScheduleFrequency(str, Enum):
    """调度频率"""
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"


# ============================================================================
# 报表参数相关Schema
# ============================================================================

class DateRangeSchema(CamelCaseModel):
    """日期范围"""
    start_date: str = Field(..., description="开始日期")
    end_date: str = Field(..., description="结束日期")


class ReportParametersSchema(CamelCaseModel):
    """报表参数"""
    date_range: DateRangeSchema = Field(..., description="日期范围")
    devices: Optional[List[str]] = Field(None, description="设备ID列表")
    device_groups: Optional[List[str]] = Field(None, description="设备组ID列表")
    strategies: Optional[List[str]] = Field(None, description="巡检策略ID列表")
    templates: Optional[List[str]] = Field(None, description="模板ID列表")
    include_charts: bool = Field(True, description="包含图表")
    include_detail_data: bool = Field(True, description="包含详细数据")
    include_recommendations: bool = Field(True, description="包含建议")
    custom_fields: Optional[Dict[str, Any]] = Field(None, description="自定义字段")


class ReportScheduleSchema(CamelCaseModel):
    """报表调度配置"""
    enabled: bool = Field(False, description="是否启用")
    frequency: ScheduleFrequency = Field(..., description="调度频率")
    day_of_week: Optional[int] = Field(None, ge=0, le=6, description="星期几(0-6)")
    day_of_month: Optional[int] = Field(None, ge=1, le=31, description="月份中的第几天")
    time: str = Field(..., pattern=r"^\d{2}:\d{2}$", description="执行时间 HH:mm")
    recipients: List[str] = Field(default_factory=list, description="收件人邮箱列表")
    last_run: Optional[str] = Field(None, description="上次运行时间")
    next_run: Optional[str] = Field(None, description="下次运行时间")


# ============================================================================
# 报表基础Schema
# ============================================================================

class ReportBase(CamelCaseModel):
    """报表基础信息"""
    title: str = Field(..., min_length=1, max_length=200, description="报表标题")
    description: Optional[str] = Field(None, description="报表描述")
    type: ReportType = Field(..., description="报表类型")
    category: ReportCategory = Field(..., description="报表类别")
    format: ReportFormat = Field(..., description="报表格式")


class ReportCreate(ReportBase):
    """创建报表请求"""
    parameters: ReportParametersSchema = Field(..., description="报表参数")
    schedule: Optional[ReportScheduleSchema] = Field(None, description="调度配置")


class ReportUpdate(CamelCaseModel):
    """更新报表请求"""
    title: Optional[str] = Field(None, min_length=1, max_length=200)
    description: Optional[str] = None
    category: Optional[ReportCategory] = None
    format: Optional[ReportFormat] = None
    parameters: Optional[ReportParametersSchema] = None
    schedule: Optional[ReportScheduleSchema] = None


class ReportResponse(ReportBase):
    """报表响应"""
    id: str = Field(..., description="报表ID")
    status: ReportStatus = Field(..., description="报表状态")
    created_at: str = Field(..., description="创建时间")
    updated_at: str = Field(..., description="更新时间")
    generated_by: str = Field(..., description="生成人")
    file_path: Optional[str] = Field(None, description="文件路径")
    file_size: Optional[int] = Field(None, description="文件大小（字节）")
    download_url: Optional[str] = Field(None, description="下载链接")
    parameters: ReportParametersSchema = Field(..., description="报表参数")
    schedule: Optional[ReportScheduleSchema] = Field(None, description="调度配置")


class ReportListResponse(CamelCaseModel):
    """报表列表响应"""
    items: List[ReportResponse]
    total: int
    page: int = 1
    page_size: int = 20


# ============================================================================
# 巡检报告数据Schema
# ============================================================================

class InspectionSummarySchema(CamelCaseModel):
    """巡检摘要"""
    total_devices: int = Field(0, description="设备总数")
    total_executions: int = Field(0, description="执行总数")
    total_checks: int = Field(0, description="检查总数")
    passed_checks: int = Field(0, description="通过检查数")
    failed_checks: int = Field(0, description="失败检查数")
    warning_checks: int = Field(0, description="警告检查数")
    avg_score: float = Field(0.0, description="平均分数")
    success_rate: float = Field(0.0, description="成功率")


class PerformanceMetricsSchema(CamelCaseModel):
    """性能指标"""
    cpu: Dict[str, float] = Field(default_factory=dict, description="CPU指标")
    memory: Dict[str, float] = Field(default_factory=dict, description="内存指标")
    disk_space: Dict[str, Union[int, float]] = Field(default_factory=dict, description="磁盘空间")
    network_traffic: Dict[str, float] = Field(default_factory=dict, description="网络流量")
    temperature: Optional[float] = Field(None, description="温度")
    power_consumption: Optional[float] = Field(None, description="功耗")


class IssueDataSchema(CamelCaseModel):
    """问题数据"""
    id: str
    type: str = Field(..., description="问题类型")
    severity: str = Field(..., description="严重程度")
    title: str = Field(..., description="标题")
    description: str = Field(..., description="描述")
    first_detected: str = Field(..., description="首次发现时间")
    last_detected: str = Field(..., description="最后发现时间")
    occurrence_count: int = Field(0, description="出现次数")
    status: str = Field(..., description="状态")
    resolution: Optional[str] = Field(None, description="解决方案")


class DeviceReportResultSchema(CamelCaseModel):
    """设备报告结果"""
    device_id: str = Field(..., description="设备ID")
    device_name: str = Field(..., description="设备名称")
    device_type: str = Field(..., description="设备类型")
    device_group: str = Field(..., description="设备组")
    status: str = Field(..., description="状态")
    total_checks: int = Field(0, description="检查总数")
    passed_checks: int = Field(0, description="通过检查数")
    failed_checks: int = Field(0, description="失败检查数")
    warning_checks: int = Field(0, description="警告检查数")
    score: float = Field(0.0, description="得分")
    uptime: float = Field(0.0, description="可用性百分比")
    avg_response_time: float = Field(0.0, description="平均响应时间(ms)")
    last_check_time: str = Field(..., description="最后检查时间")
    issues: List[IssueDataSchema] = Field(default_factory=list, description="问题列表")
    performance_metrics: PerformanceMetricsSchema = Field(default_factory=PerformanceMetricsSchema, description="性能指标")


class ExecutionTrendDataSchema(CamelCaseModel):
    """执行趋势数据"""
    date: str = Field(..., description="日期")
    total_executions: int = Field(0, description="总执行数")
    successful_executions: int = Field(0, description="成功执行数")
    failed_executions: int = Field(0, description="失败执行数")
    avg_score: float = Field(0.0, description="平均分数")
    avg_duration: float = Field(0.0, description="平均持续时间")
    device_count: int = Field(0, description="设备数量")


class ProblemAnalysisDataSchema(CamelCaseModel):
    """问题分析数据"""
    category: str = Field(..., description="类别")
    count: int = Field(0, description="数量")
    percentage: float = Field(0.0, description="百分比")
    severity: str = Field(..., description="严重程度")
    trend: str = Field(..., description="趋势")
    affected_devices: List[str] = Field(default_factory=list, description="受影响设备")
    description: str = Field(..., description="描述")
    solutions: Optional[List[str]] = Field(None, description="解决方案")


class ImplementationSchema(CamelCaseModel):
    """实施方案"""
    steps: List[str] = Field(default_factory=list, description="步骤")
    estimated_time: str = Field(..., description="预计时间")
    resources: List[str] = Field(default_factory=list, description="所需资源")


class RecommendationDataSchema(CamelCaseModel):
    """建议数据"""
    id: str
    type: str = Field(..., description="建议类型")
    priority: str = Field(..., description="优先级")
    title: str = Field(..., description="标题")
    description: str = Field(..., description="描述")
    affected_devices: List[str] = Field(default_factory=list, description="受影响设备")
    estimated_impact: str = Field(..., description="预计影响")
    implementation: ImplementationSchema = Field(..., description="实施方案")


class InspectionReportDataSchema(CamelCaseModel):
    """巡检报告数据"""
    summary: InspectionSummarySchema = Field(..., description="摘要")
    device_results: List[DeviceReportResultSchema] = Field(default_factory=list, description="设备结果")
    execution_trends: List[ExecutionTrendDataSchema] = Field(default_factory=list, description="执行趋势")
    problem_analysis: List[ProblemAnalysisDataSchema] = Field(default_factory=list, description="问题分析")
    recommendations: List[RecommendationDataSchema] = Field(default_factory=list, description="建议")


# ============================================================================
# 巡检报告生成请求Schema
# ============================================================================

class GenerateInspectionReportRequest(CamelCaseModel):
    """生成巡检报告请求"""
    title: str = Field(..., description="报表标题")
    description: Optional[str] = Field(None, description="报表描述")
    date_range: DateRangeSchema = Field(..., description="日期范围")
    devices: Optional[List[str]] = Field(None, description="设备ID列表")
    strategies: Optional[List[str]] = Field(None, description="策略ID列表")
    execution_ids: Optional[List[str]] = Field(None, description="执行记录ID列表")
    format: ReportFormat = Field(ReportFormat.PDF, description="报表格式")
    include_charts: bool = Field(True, description="包含图表")
    include_detail_data: bool = Field(True, description="包含详细数据")
    include_recommendations: bool = Field(True, description="包含建议")


class InspectionReportDataRequest(CamelCaseModel):
    """获取巡检报告数据请求"""
    date_range: DateRangeSchema = Field(..., description="日期范围")
    devices: Optional[List[str]] = Field(None, description="设备ID列表")
    strategies: Optional[List[str]] = Field(None, description="策略ID列表")
    execution_ids: Optional[List[str]] = Field(None, description="执行记录ID列表")


class CompareDeviceReportsRequest(CamelCaseModel):
    """设备报告对比请求"""
    device_ids: List[str] = Field(..., min_items=2, description="设备ID列表")
    date_range: DateRangeSchema = Field(..., description="日期范围")
    metrics: Optional[List[str]] = Field(None, description="对比指标")


# ============================================================================
# 查询参数Schema
# ============================================================================

class ReportQueryParams(CamelCaseModel):
    """报表查询参数"""
    page: int = Field(1, ge=1, description="页码")
    page_size: int = Field(20, ge=1, le=100, description="每页数量")
    type: Optional[ReportType] = Field(None, description="报表类型筛选")
    status: Optional[ReportStatus] = Field(None, description="状态筛选")
    format: Optional[ReportFormat] = Field(None, description="格式筛选")
    search: Optional[str] = Field(None, description="搜索关键词")
    start_date: Optional[str] = Field(None, description="开始日期筛选")
    end_date: Optional[str] = Field(None, description="结束日期筛选")


# ============================================================================
# 响应包装Schema
# ============================================================================

class ApiResponse(BaseModel):
    """API通用响应"""
    code: int = Field(200, description="状态码")
    message: str = Field("success", description="消息")
    data: Any = Field(None, description="数据")

    model_config = ConfigDict(from_attributes=True)


# ============================================================================
# 数据转换工具函数
# ============================================================================

def convert_report_to_response(report_db, base_url: str = "") -> dict:
    """
    将数据库Report模型转换为前端响应格式

    Args:
        report_db: 数据库Report对象
        base_url: 基础URL，用于生成下载链接

    Returns:
        dict: 前端格式的报表数据
    """
    # 基础数据
    data = {
        "id": str(report_db.id),
        "title": report_db.title,
        "description": report_db.description,
        "type": report_db.report_type.value if report_db.report_type else "inspection",
        "category": getattr(report_db, 'category', 'custom'),  # 新字段，可能不存在
        "status": report_db.status.value if report_db.status else "completed",
        "createdAt": report_db.created_at.isoformat() if report_db.created_at else None,
        "updatedAt": report_db.updated_at.isoformat() if report_db.updated_at else None,
        "generatedBy": report_db.generated_by or "",
    }

    # 处理文件格式（从JSON数组转换为单一值）
    if report_db.file_formats:
        if isinstance(report_db.file_formats, list) and len(report_db.file_formats) > 0:
            data["format"] = report_db.file_formats[0]
        else:
            data["format"] = "pdf"
    else:
        data["format"] = "pdf"

    # 处理文件路径和大小
    if report_db.file_paths and isinstance(report_db.file_paths, dict):
        # 获取第一个格式的文件路径
        format_key = data["format"]
        file_path = report_db.file_paths.get(format_key)
        if file_path:
            data["filePath"] = file_path
            # 生成下载URL
            data["downloadUrl"] = f"{base_url}/api/reports/{report_db.id}/download?format={format_key}"

    if report_db.file_sizes and isinstance(report_db.file_sizes, dict):
        format_key = data["format"]
        data["fileSize"] = report_db.file_sizes.get(format_key, 0)

    # 构建参数对象
    data["parameters"] = {
        "dateRange": {
            "startDate": report_db.start_date.isoformat() if report_db.start_date else "",
            "endDate": report_db.end_date.isoformat() if report_db.end_date else "",
        },
        "devices": report_db.device_filters.get("devices", []) if report_db.device_filters else [],
        "includeCharts": True,
        "includeDetailData": True,
        "includeRecommendations": True,
    }

    # 调度信息（如果有）
    if report_db.schedule:
        data["schedule"] = {
            "enabled": report_db.schedule.is_active,
            "frequency": "daily",  # 需要从cron表达式解析
            "recipients": report_db.schedule.recipients if report_db.schedule.recipients else [],
            "lastRun": report_db.schedule.last_run.isoformat() if report_db.schedule.last_run else None,
            "nextRun": report_db.schedule.next_run.isoformat() if report_db.schedule.next_run else None,
        }

    return data


def convert_snake_to_camel_dict(data: dict) -> dict:
    """
    递归地将字典的snake_case键转换为camelCase
    同时将numpy类型转换为Python原生类型（兜底机制）

    Args:
        data: 输入字典

    Returns:
        dict: 转换后的字典
    """
    import numpy as np

    def convert_value(value):
        """递归转换值，处理numpy类型和嵌套结构"""
        # 处理numpy类型（兜底机制）
        if isinstance(value, np.integer):
            return int(value)
        elif isinstance(value, np.floating):
            return float(value)
        elif isinstance(value, np.ndarray):
            # 递归处理数组元素，确保元素也被转换
            return [convert_value(item) for item in value.tolist()]
        elif isinstance(value, dict):
            return convert_snake_to_camel_dict(value)
        elif isinstance(value, list):
            return [convert_value(item) for item in value]
        else:
            return value

    if not isinstance(data, dict):
        return convert_value(data)

    result = {}
    for key, value in data.items():
        # 转换键名
        camel_key = to_camel(key)
        # 转换值（包括类型转换和递归处理）
        result[camel_key] = convert_value(value)

    return result


# ============================================================================
# 趋势分析Schema
# ============================================================================

class TrendDataPointSchema(CamelCaseModel):
    """趋势数据点"""
    timestamp: str = Field(..., description="时间戳")
    value: float = Field(..., description="数值")
    predicted: bool = Field(False, description="是否为预测值")
    confidence_upper: Optional[float] = Field(None, description="置信区间上限")
    confidence_lower: Optional[float] = Field(None, description="置信区间下限")


class TrendMetricSchema(CamelCaseModel):
    """趋势指标数据"""
    metric_name: str = Field(..., description="指标名称")
    display_name: str = Field(..., description="显示名称")
    unit: str = Field(..., description="单位")
    data_points: List[TrendDataPointSchema] = Field(default_factory=list, description="数据点")
    trend_direction: str = Field(..., description="趋势方向: up/down/stable")
    change_rate: float = Field(0.0, description="变化率百分比")
    current_value: float = Field(0.0, description="当前值")
    average_value: float = Field(0.0, description="平均值")
    min_value: float = Field(0.0, description="最小值")
    max_value: float = Field(0.0, description="最大值")
    anomaly_count: int = Field(0, description="异常点数量")


class PredictionDataSchema(CamelCaseModel):
    """预测数据"""
    metric: str = Field(..., description="指标名称")
    forecasted_values: List[TrendDataPointSchema] = Field(default_factory=list, description="预测值")
    confidence_level: float = Field(0.95, description="置信水平")
    prediction_period: str = Field(..., description="预测周期")
    accuracy_score: Optional[float] = Field(None, description="准确度评分")
    method: str = Field("moving_average", description="预测方法")


class TrendAlertDataSchema(CamelCaseModel):
    """趋势告警数据"""
    id: str = Field(..., description="告警ID")
    type: str = Field(..., description="告警类型")
    severity: str = Field(..., description="严重程度: info/warning/error/critical")
    metric: str = Field(..., description="相关指标")
    message: str = Field(..., description="告警消息")
    description: str = Field(..., description="详细描述")
    detected_at: str = Field(..., description="检测时间")
    status: str = Field("active", description="状态: active/acknowledged/resolved")
    affected_devices: List[str] = Field(default_factory=list, description="受影响设备")
    threshold_value: Optional[float] = Field(None, description="阈值")
    actual_value: Optional[float] = Field(None, description="实际值")
    recommended_action: Optional[str] = Field(None, description="建议操作")


class CorrelationDataSchema(CamelCaseModel):
    """相关性数据"""
    metric_a: str = Field(..., description="指标A")
    metric_b: str = Field(..., description="指标B")
    correlation_coefficient: float = Field(0.0, ge=-1.0, le=1.0, description="相关系数")
    significance_level: str = Field(..., description="显著性水平: high/medium/low")
    relationship: str = Field(..., description="关系类型: positive/negative/none")


class TrendSummarySchema(CamelCaseModel):
    """趋势分析摘要"""
    total_metrics: int = Field(0, description="指标总数")
    time_range_days: int = Field(0, description="时间跨度（天）")
    total_data_points: int = Field(0, description="数据点总数")
    anomalies_detected: int = Field(0, description="检测到的异常数")
    alerts_generated: int = Field(0, description="生成的告警数")
    improving_metrics: int = Field(0, description="改善中的指标数")
    degrading_metrics: int = Field(0, description="恶化中的指标数")
    stable_metrics: int = Field(0, description="稳定的指标数")


class TrendAnalysisDataSchema(CamelCaseModel):
    """趋势分析完整数据"""
    summary: TrendSummarySchema = Field(..., description="摘要")
    metrics: List[TrendMetricSchema] = Field(default_factory=list, description="指标趋势")
    predictions: List[PredictionDataSchema] = Field(default_factory=list, description="预测数据")
    alerts: List[TrendAlertDataSchema] = Field(default_factory=list, description="趋势告警")
    correlations: List[CorrelationDataSchema] = Field(default_factory=list, description="相关性分析")
    generated_at: str = Field(..., description="生成时间")


class TrendAnalysisRequestSchema(CamelCaseModel):
    """趋势分析请求（前端格式）"""
    metrics: List[str] = Field(..., description="分析指标列表")
    date_range: DateRangeSchema = Field(..., description="日期范围")
    devices: Optional[List[str]] = Field(None, description="设备ID列表")
    granularity: str = Field("day", description="数据粒度: hour/day/week/month")


class GenerateTrendReportRequestSchema(CamelCaseModel):
    """生成趋势报告请求（前端格式）"""
    title: str = Field(..., description="报告标题")
    metrics: List[str] = Field(..., description="分析指标列表")
    date_range: DateRangeSchema = Field(..., description="日期范围")
    devices: Optional[List[str]] = Field(None, description="设备ID列表")
    format: ReportFormat = Field(ReportFormat.PDF, description="报告格式")
    include_predictions: bool = Field(True, description="是否包含预测分析")


class PredictionsRequestSchema(CamelCaseModel):
    """预测数据请求（前端格式）"""
    metrics: List[str] = Field(..., description="预测指标列表")
    devices: Optional[List[str]] = Field(None, description="设备ID列表")
    timeframe: str = Field("week", description="预测时间范围: week/month/quarter")


class AnomalyDetectionRequestSchema(CamelCaseModel):
    """异常检测请求（前端格式）"""
    metrics: List[str] = Field(..., description="检测指标列表")
    devices: Optional[List[str]] = Field(None, description="设备ID列表")
    date_range: DateRangeSchema = Field(..., description="日期范围")
    sensitivity: str = Field("medium", description="灵敏度: low/medium/high")


# ============================================================================
# 统计报表Schema
# ============================================================================

class StatisticsRequestSchema(CamelCaseModel):
    """统计数据请求"""
    start_date: str = Field(..., description="开始日期 (ISO格式)")
    end_date: str = Field(..., description="结束日期 (ISO格式)")
    device_types: Optional[List[str]] = Field(None, description="设备类型筛选")
    locations: Optional[List[str]] = Field(None, description="位置筛选")
    device_groups: Optional[List[str]] = Field(None, description="设备组筛选")
    group_by: str = Field("day", description="分组方式: hour/day/week/month")
    include_trends: bool = Field(True, description="包含趋势数据")


class DeviceTypeDistributionSchema(CamelCaseModel):
    """设备类型分布"""
    device_type: str = Field(..., description="设备类型")
    count: int = Field(0, description="数量")
    percentage: float = Field(0.0, description="百分比")
    avg_health_score: float = Field(0.0, description="平均健康分数")


class PerformanceRatingSchema(CamelCaseModel):
    """性能评级分布"""
    rating: str = Field(..., description="评级: excellent/good/fair/poor")
    count: int = Field(0, description="数量")
    percentage: float = Field(0.0, description="百分比")


class DeviceRankingSchema(CamelCaseModel):
    """设备排名数据"""
    rank: int = Field(..., description="排名")
    device_id: str = Field(..., description="设备ID")
    device_name: str = Field(..., description="设备名称")
    device_type: str = Field(..., description="设备类型")
    score: float = Field(0.0, description="分数")
    health_score: float = Field(0.0, description="健康分数")
    uptime: float = Field(0.0, description="在线率 (%)")
    avg_response_time: float = Field(0.0, description="平均响应时间 (ms)")
    total_checks: int = Field(0, description="总检查次数")
    failed_checks: int = Field(0, description="失败检查次数")
    issues_count: int = Field(0, description="问题数量")
    last_check_time: str = Field(..., description="最后检查时间")
    status: str = Field("unknown", description="状态: online/offline/warning/error")


class TrendPointSchema(CamelCaseModel):
    """趋势数据点"""
    date: str = Field(..., description="日期")
    total_inspections: int = Field(0, description="巡检总数")
    successful_inspections: int = Field(0, description="成功巡检数")
    failed_inspections: int = Field(0, description="失败巡检数")
    avg_health_score: float = Field(0.0, description="平均健康分数")
    issues_detected: int = Field(0, description="检测到的问题数")
    issues_resolved: int = Field(0, description="已解决的问题数")


class IssuesByCategorySchema(CamelCaseModel):
    """问题分类统计"""
    category: str = Field(..., description="问题类别")
    count: int = Field(0, description="数量")
    percentage: float = Field(0.0, description="百分比")
    critical_count: int = Field(0, description="严重问题数")
    high_count: int = Field(0, description="高级问题数")
    medium_count: int = Field(0, description="中级问题数")
    low_count: int = Field(0, description="低级问题数")


class StatisticsDataSchema(CamelCaseModel):
    """统计数据响应"""
    # 总览指标
    total_devices: int = Field(0, description="设备总数")
    online_devices: int = Field(0, description="在线设备数")
    offline_devices: int = Field(0, description="离线设备数")
    total_inspections: int = Field(0, description="巡检总数")
    successful_inspections: int = Field(0, description="成功巡检数")
    failed_inspections: int = Field(0, description="失败巡检数")
    total_issues: int = Field(0, description="问题总数")
    resolved_issues: int = Field(0, description="已解决问题数")
    pending_issues: int = Field(0, description="待处理问题数")
    critical_issues: int = Field(0, description="严重问题数")

    # 比率指标
    inspection_success_rate: float = Field(0.0, description="巡检成功率 (%)")
    issue_resolution_rate: float = Field(0.0, description="问题解决率 (%)")
    device_health_score: float = Field(0.0, description="设备健康分数 (0-100)")
    avg_response_time: float = Field(0.0, description="平均响应时间 (ms)")

    # 分布数据
    device_type_distribution: List[DeviceTypeDistributionSchema] = Field(
        default_factory=list,
        description="设备类型分布"
    )
    performance_ratings: List[PerformanceRatingSchema] = Field(
        default_factory=list,
        description="性能评级分布"
    )
    issues_by_category: List[IssuesByCategorySchema] = Field(
        default_factory=list,
        description="问题分类统计"
    )

    # 排名数据
    top_devices: List[DeviceRankingSchema] = Field(
        default_factory=list,
        description="表现最佳设备"
    )
    worst_devices: List[DeviceRankingSchema] = Field(
        default_factory=list,
        description="表现最差设备"
    )

    # 趋势数据
    recent_trends: List[TrendPointSchema] = Field(
        default_factory=list,
        description="近期趋势"
    )

    # 元数据
    generated_at: str = Field(..., description="生成时间")
    time_range: DateRangeSchema = Field(..., description="时间范围")


class GenerateStatisticsReportRequest(CamelCaseModel):
    """生成统计报表请求"""
    title: str = Field(..., description="报表标题")
    description: Optional[str] = Field(None, description="报表描述")
    start_date: str = Field(..., description="开始日期")
    end_date: str = Field(..., description="结束日期")
    device_types: Optional[List[str]] = Field(None, description="设备类型筛选")
    locations: Optional[List[str]] = Field(None, description="位置筛选")
    format: ReportFormat = Field(ReportFormat.PDF, description="报表格式")
    include_charts: bool = Field(True, description="包含图表")
    include_trends: bool = Field(True, description="包含趋势分析")
    include_rankings: bool = Field(True, description="包含排名数据")


class KPIRequestSchema(CamelCaseModel):
    """KPI数据请求"""
    start_date: str = Field(..., description="开始日期")
    end_date: str = Field(..., description="结束日期")
    device_types: Optional[List[str]] = Field(None, description="设备类型筛选")
    comparison_period: Optional[str] = Field(None, description="对比周期: previous_period/previous_year")


class KPIMetricSchema(CamelCaseModel):
    """单个KPI指标"""
    name: str = Field(..., description="指标名称")
    display_name: str = Field(..., description="显示名称")
    value: float = Field(0.0, description="当前值")
    unit: str = Field("", description="单位")
    target: Optional[float] = Field(None, description="目标值")
    previous_value: Optional[float] = Field(None, description="上期值")
    change_rate: float = Field(0.0, description="变化率 (%)")
    trend: str = Field("stable", description="趋势: up/down/stable")
    status: str = Field("normal", description="状态: excellent/good/warning/critical")
    description: Optional[str] = Field(None, description="描述")


class KPIDataSchema(CamelCaseModel):
    """KPI数据响应"""
    # 核心KPI
    inspection_completion_rate: KPIMetricSchema = Field(..., description="巡检完成率")
    inspection_success_rate: KPIMetricSchema = Field(..., description="巡检成功率")
    avg_inspection_duration: KPIMetricSchema = Field(..., description="平均巡检时长")
    device_availability: KPIMetricSchema = Field(..., description="设备可用率")
    device_health_score: KPIMetricSchema = Field(..., description="设备健康分数")
    issue_resolution_rate: KPIMetricSchema = Field(..., description="问题解决率")
    avg_resolution_time: KPIMetricSchema = Field(..., description="平均解决时间")
    mttr: KPIMetricSchema = Field(..., description="平均修复时间 (MTTR)")
    mtbf: KPIMetricSchema = Field(..., description="平均无故障时间 (MTBF)")

    # 次要KPI
    critical_issues_count: KPIMetricSchema = Field(..., description="严重问题数")
    sla_compliance_rate: KPIMetricSchema = Field(..., description="SLA达标率")
    avg_response_time: KPIMetricSchema = Field(..., description="平均响应时间")

    # 元数据
    generated_at: str = Field(..., description="生成时间")
    time_range: DateRangeSchema = Field(..., description="时间范围")


class RankingsRequestSchema(CamelCaseModel):
    """排名数据请求"""
    start_date: str = Field(..., description="开始日期")
    end_date: str = Field(..., description="结束日期")
    ranking_type: str = Field("performance", description="排名类型: performance/reliability/efficiency")
    device_types: Optional[List[str]] = Field(None, description="设备类型筛选")
    top_n: int = Field(10, ge=1, le=100, description="返回前N名")
    include_bottom: bool = Field(True, description="包含后N名")


class RankingCategorySchema(CamelCaseModel):
    """排名分类"""
    category_name: str = Field(..., description="分类名称")
    category_type: str = Field(..., description="分类类型")
    rankings: List[DeviceRankingSchema] = Field(default_factory=list, description="排名列表")


class RankingsDataSchema(CamelCaseModel):
    """排名数据响应"""
    # 综合排名
    overall_rankings: List[DeviceRankingSchema] = Field(
        default_factory=list,
        description="综合排名"
    )

    # 分类排名
    by_performance: List[DeviceRankingSchema] = Field(
        default_factory=list,
        description="按性能排名"
    )
    by_reliability: List[DeviceRankingSchema] = Field(
        default_factory=list,
        description="按可靠性排名"
    )
    by_efficiency: List[DeviceRankingSchema] = Field(
        default_factory=list,
        description="按效率排名"
    )

    # 按类型分组的排名
    by_device_type: List[RankingCategorySchema] = Field(
        default_factory=list,
        description="按设备类型的排名"
    )

    # 元数据
    total_devices: int = Field(0, description="参与排名的设备总数")
    generated_at: str = Field(..., description="生成时间")
    time_range: DateRangeSchema = Field(..., description="时间范围")


class ExportRequestSchema(CamelCaseModel):
    """导出请求（通用）"""
    report_id: Optional[int] = Field(None, description="报表ID（如果基于现有报表）")
    report_type: str = Field(..., description="报表类型: inspection/trend/statistics/custom")
    data: Dict[str, Any] = Field(..., description="报表数据")
    template_id: Optional[int] = Field(None, description="模板ID")
    file_name: Optional[str] = Field(None, description="文件名")
    title: str = Field("Report", description="报表标题")
    description: Optional[str] = Field(None, description="报表描述")


class ExportResponseSchema(CamelCaseModel):
    """导出响应"""
    success: bool = Field(True, description="是否成功")
    file_url: str = Field(..., description="文件下载URL")
    file_name: str = Field(..., description="文件名")
    file_size: int = Field(0, description="文件大小（字节）")
    download_token: str = Field(..., description="下载令牌")
    expires_at: str = Field(..., description="过期时间")
    format: str = Field(..., description="文件格式")
