"""
统计报表服务
提供统计数据的查询、聚合和分析功能
"""
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
from collections import defaultdict, Counter
import structlog
from sqlalchemy import select, func, and_, or_, case, distinct, Float
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.device import Device, DeviceStatus
from src.models.inspection import Inspection, InspectionStatus, CheckItemStatus, InspectionResult
from src.models.alert import Alert, AlertSeverity, AlertStatus, AlertCategory
from src.schemas.report import (
    StatisticsDataSchema,
    StatisticsRequestSchema,
    DeviceTypeDistributionSchema,
    PerformanceRatingSchema,
    DeviceRankingSchema,
    TrendPointSchema,
    IssuesByCategorySchema,
    KPIDataSchema,
    KPIMetricSchema,
    RankingsDataSchema,
    RankingCategorySchema,
    DateRangeSchema
)

logger = structlog.get_logger()


class StatisticsService:
    """统计报表服务类"""

    def __init__(self):
        self.cache = {}
        self.cache_ttl = 300  # 缓存5分钟

    async def get_statistics_data(
        self,
        db: AsyncSession,
        request: StatisticsRequestSchema
    ) -> StatisticsDataSchema:
        """
        获取统计数据

        Args:
            db: 数据库会话
            request: 统计请求参数

        Returns:
            统计数据响应
        """
        try:
            # 解析时间范围
            start_date = datetime.fromisoformat(request.start_date.replace('Z', '+00:00'))
            end_date = datetime.fromisoformat(request.end_date.replace('Z', '+00:00'))

            logger.info("Getting statistics data",
                       start_date=start_date,
                       end_date=end_date,
                       device_types=request.device_types)

            # 构建设备查询过滤器
            device_filters = self._build_device_filters(request)

            # 并行查询各项统计数据
            total_devices, online_devices, offline_devices = await self._get_device_counts(db, device_filters)
            inspection_stats = await self._get_inspection_statistics(db, start_date, end_date, device_filters)
            issue_stats = await self._get_issue_statistics(db, start_date, end_date, device_filters)

            # 设备类型分布
            device_type_distribution = await self._get_device_type_distribution(db, device_filters)

            # 性能评级分布
            performance_ratings = await self._get_performance_ratings(db, start_date, end_date, device_filters)

            # 问题分类统计
            issues_by_category = await self._get_issues_by_category(db, start_date, end_date, device_filters)

            # 设备排名
            top_devices = await self._get_device_rankings(db, start_date, end_date, device_filters, limit=10, order='desc')
            worst_devices = await self._get_device_rankings(db, start_date, end_date, device_filters, limit=10, order='asc')

            # 趋势数据（如果需要）
            recent_trends = []
            if request.include_trends:
                recent_trends = await self._get_trend_data(db, start_date, end_date, device_filters, request.group_by)

            # 计算比率指标
            inspection_success_rate = (
                (inspection_stats['successful'] / inspection_stats['total'] * 100)
                if inspection_stats['total'] > 0 else 0.0
            )
            issue_resolution_rate = (
                (issue_stats['resolved'] / issue_stats['total'] * 100)
                if issue_stats['total'] > 0 else 0.0
            )

            # 计算设备健康分数
            device_health_score = await self._calculate_device_health_score(
                db, start_date, end_date, device_filters
            )

            # 构建响应
            stats_data = StatisticsDataSchema(
                # 总览指标
                total_devices=total_devices,
                online_devices=online_devices,
                offline_devices=offline_devices,
                total_inspections=inspection_stats['total'],
                successful_inspections=inspection_stats['successful'],
                failed_inspections=inspection_stats['failed'],
                total_issues=issue_stats['total'],
                resolved_issues=issue_stats['resolved'],
                pending_issues=issue_stats['pending'],
                critical_issues=issue_stats['critical'],

                # 比率指标
                inspection_success_rate=round(inspection_success_rate, 2),
                issue_resolution_rate=round(issue_resolution_rate, 2),
                device_health_score=round(device_health_score, 2),
                avg_response_time=inspection_stats['avg_response_time'],

                # 分布数据
                device_type_distribution=device_type_distribution,
                performance_ratings=performance_ratings,
                issues_by_category=issues_by_category,

                # 排名数据
                top_devices=top_devices,
                worst_devices=worst_devices,

                # 趋势数据
                recent_trends=recent_trends,

                # 元数据
                generated_at=datetime.now().isoformat(),
                time_range=DateRangeSchema(
                    start_date=request.start_date,
                    end_date=request.end_date
                )
            )

            logger.info("Statistics data generated successfully",
                       total_devices=total_devices,
                       total_inspections=inspection_stats['total'])

            return stats_data

        except Exception as e:
            logger.error("Failed to get statistics data", error=str(e))
            raise

    async def get_kpi_data(
        self,
        db: AsyncSession,
        start_date: str,
        end_date: str,
        device_types: Optional[List[str]] = None,
        comparison_period: Optional[str] = None
    ) -> KPIDataSchema:
        """
        获取KPI指标数据

        Args:
            db: 数据库会话
            start_date: 开始日期
            end_date: 结束日期
            device_types: 设备类型筛选
            comparison_period: 对比周期

        Returns:
            KPI数据响应
        """
        try:
            # 解析时间范围
            start = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            end = datetime.fromisoformat(end_date.replace('Z', '+00:00'))

            # 构建过滤器
            device_filters = []
            if device_types:
                device_filters.append(Device.device_type.in_(device_types))

            # 计算对比期
            previous_start, previous_end = None, None
            if comparison_period == "previous_period":
                period_length = end - start
                previous_end = start
                previous_start = start - period_length
            elif comparison_period == "previous_year":
                previous_start = start - timedelta(days=365)
                previous_end = end - timedelta(days=365)

            # 获取当前期数据
            current_metrics = await self._calculate_kpi_metrics(db, start, end, device_filters)

            # 获取对比期数据
            previous_metrics = {}
            if previous_start and previous_end:
                previous_metrics = await self._calculate_kpi_metrics(db, previous_start, previous_end, device_filters)

            # 构建KPI响应
            def create_kpi_metric(
                name: str,
                display_name: str,
                value: float,
                unit: str,
                target: Optional[float] = None
            ) -> KPIMetricSchema:
                """创建KPI指标"""
                previous_value = previous_metrics.get(name, value)
                change_rate = ((value - previous_value) / previous_value * 100) if previous_value != 0 else 0.0

                # 确定趋势
                if change_rate > 2:
                    trend = "up"
                elif change_rate < -2:
                    trend = "down"
                else:
                    trend = "stable"

                # 确定状态
                if target:
                    if value >= target:
                        status = "excellent"
                    elif value >= target * 0.9:
                        status = "good"
                    elif value >= target * 0.7:
                        status = "warning"
                    else:
                        status = "critical"
                else:
                    status = "normal"

                return KPIMetricSchema(
                    name=name,
                    display_name=display_name,
                    value=round(value, 2),
                    unit=unit,
                    target=target,
                    previous_value=round(previous_value, 2) if previous_metrics else None,
                    change_rate=round(change_rate, 2),
                    trend=trend,
                    status=status
                )

            kpi_data = KPIDataSchema(
                inspection_completion_rate=create_kpi_metric(
                    "inspection_completion_rate",
                    "巡检完成率",
                    current_metrics.get("inspection_completion_rate", 0),
                    "%",
                    100.0
                ),
                inspection_success_rate=create_kpi_metric(
                    "inspection_success_rate",
                    "巡检成功率",
                    current_metrics.get("inspection_success_rate", 0),
                    "%",
                    95.0
                ),
                avg_inspection_duration=create_kpi_metric(
                    "avg_inspection_duration",
                    "平均巡检时长",
                    current_metrics.get("avg_inspection_duration", 0),
                    "分钟",
                    30.0
                ),
                device_availability=create_kpi_metric(
                    "device_availability",
                    "设备可用率",
                    current_metrics.get("device_availability", 0),
                    "%",
                    99.5
                ),
                device_health_score=create_kpi_metric(
                    "device_health_score",
                    "设备健康分数",
                    current_metrics.get("device_health_score", 0),
                    "分",
                    90.0
                ),
                issue_resolution_rate=create_kpi_metric(
                    "issue_resolution_rate",
                    "问题解决率",
                    current_metrics.get("issue_resolution_rate", 0),
                    "%",
                    90.0
                ),
                avg_resolution_time=create_kpi_metric(
                    "avg_resolution_time",
                    "平均解决时间",
                    current_metrics.get("avg_resolution_time", 0),
                    "小时",
                    24.0
                ),
                mttr=create_kpi_metric(
                    "mttr",
                    "平均修复时间(MTTR)",
                    current_metrics.get("mttr", 0),
                    "小时",
                    4.0
                ),
                mtbf=create_kpi_metric(
                    "mtbf",
                    "平均无故障时间(MTBF)",
                    current_metrics.get("mtbf", 0),
                    "小时",
                    720.0
                ),
                critical_issues_count=create_kpi_metric(
                    "critical_issues_count",
                    "严重问题数",
                    current_metrics.get("critical_issues_count", 0),
                    "个",
                    0.0
                ),
                sla_compliance_rate=create_kpi_metric(
                    "sla_compliance_rate",
                    "SLA达标率",
                    current_metrics.get("sla_compliance_rate", 0),
                    "%",
                    99.0
                ),
                avg_response_time=create_kpi_metric(
                    "avg_response_time",
                    "平均响应时间",
                    current_metrics.get("avg_response_time", 0),
                    "毫秒",
                    100.0
                ),
                generated_at=datetime.now().isoformat(),
                time_range=DateRangeSchema(start_date=start_date, end_date=end_date)
            )

            logger.info("KPI data generated successfully")
            return kpi_data

        except Exception as e:
            logger.error("Failed to get KPI data", error=str(e))
            raise

    async def get_rankings_data(
        self,
        db: AsyncSession,
        start_date: str,
        end_date: str,
        ranking_type: str = "performance",
        device_types: Optional[List[str]] = None,
        top_n: int = 10,
        include_bottom: bool = True
    ) -> RankingsDataSchema:
        """
        获取设备排名数据

        Args:
            db: 数据库会话
            start_date: 开始日期
            end_date: 结束日期
            ranking_type: 排名类型
            device_types: 设备类型筛选
            top_n: 返回前N名
            include_bottom: 包含后N名

        Returns:
            排名数据响应
        """
        try:
            # 解析时间范围
            start = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            end = datetime.fromisoformat(end_date.replace('Z', '+00:00'))

            # 构建过滤器
            device_filters = []
            if device_types:
                device_filters.append(Device.device_type.in_(device_types))

            # 综合排名
            overall_rankings = await self._get_device_rankings(
                db, start, end, device_filters, limit=top_n, order='desc'
            )

            # 按性能排名
            by_performance = await self._get_device_rankings(
                db, start, end, device_filters, limit=top_n, order='desc', rank_by='performance'
            )

            # 按可靠性排名
            by_reliability = await self._get_device_rankings(
                db, start, end, device_filters, limit=top_n, order='desc', rank_by='reliability'
            )

            # 按效率排名
            by_efficiency = await self._get_device_rankings(
                db, start, end, device_filters, limit=top_n, order='desc', rank_by='efficiency'
            )

            # 按设备类型分组的排名
            by_device_type = await self._get_rankings_by_device_type(
                db, start, end, device_filters, top_n
            )

            # 统计参与排名的设备总数
            total_devices_query = select(func.count(distinct(Device.id))).where(
                and_(*device_filters) if device_filters else True
            )
            result = await db.execute(total_devices_query)
            total_devices = result.scalar() or 0

            rankings_data = RankingsDataSchema(
                overall_rankings=overall_rankings,
                by_performance=by_performance,
                by_reliability=by_reliability,
                by_efficiency=by_efficiency,
                by_device_type=by_device_type,
                total_devices=total_devices,
                generated_at=datetime.now().isoformat(),
                time_range=DateRangeSchema(start_date=start_date, end_date=end_date)
            )

            logger.info("Rankings data generated successfully", total_devices=total_devices)
            return rankings_data

        except Exception as e:
            logger.error("Failed to get rankings data", error=str(e))
            raise

    # ========================================================================
    # 私有辅助方法
    # ========================================================================

    def _build_device_filters(self, request: StatisticsRequestSchema) -> List:
        """构建设备查询过滤器"""
        filters = []

        if request.device_types:
            filters.append(Device.device_type.in_(request.device_types))

        if request.locations:
            filters.append(Device.location.in_(request.locations))

        if request.device_groups:
            filters.append(Device.group_id.in_(request.device_groups))

        return filters

    async def _get_device_counts(
        self,
        db: AsyncSession,
        device_filters: List
    ) -> Tuple[int, int, int]:
        """获取设备总数、在线数、离线数"""
        # 总设备数
        total_query = select(func.count(Device.id)).where(
            and_(*device_filters) if device_filters else True
        )
        result = await db.execute(total_query)
        total = result.scalar() or 0

        # 在线设备数
        online_query = select(func.count(Device.id)).where(
            and_(
                Device.status == DeviceStatus.ONLINE,
                *(device_filters if device_filters else [])
            )
        )
        result = await db.execute(online_query)
        online = result.scalar() or 0

        # 离线设备数
        offline = total - online

        return total, online, offline

    async def _get_inspection_statistics(
        self,
        db: AsyncSession,
        start_date: datetime,
        end_date: datetime,
        device_filters: List
    ) -> Dict[str, Any]:
        """获取巡检统计数据"""
        # 构建查询（包含设备过滤）
        query_filters = [
            Inspection.started_at >= start_date,
            Inspection.started_at <= end_date
        ]

        if device_filters:
            query_filters.append(
                Inspection.device_id.in_(
                    select(Device.id).where(and_(*device_filters))
                )
            )

        # 总巡检数
        total_query = select(func.count(Inspection.id)).where(and_(*query_filters))
        result = await db.execute(total_query)
        total = result.scalar() or 0

        # 成功巡检数
        successful_query = select(func.count(Inspection.id)).where(
            and_(
                *query_filters,
                Inspection.status == InspectionStatus.COMPLETED
            )
        )
        result = await db.execute(successful_query)
        successful = result.scalar() or 0

        # 失败巡检数
        failed_query = select(func.count(Inspection.id)).where(
            and_(
                *query_filters,
                Inspection.status == InspectionStatus.FAILED
            )
        )
        result = await db.execute(failed_query)
        failed = result.scalar() or 0

        # 平均响应时间（假设Inspection有duration字段）
        avg_response_query = select(func.avg(Inspection.duration)).where(
            and_(*query_filters)
        )
        result = await db.execute(avg_response_query)
        avg_response_time = float(result.scalar() or 0.0)

        return {
            'total': total,
            'successful': successful,
            'failed': failed,
            'avg_response_time': round(avg_response_time, 2)
        }

    async def _get_issue_statistics(
        self,
        db: AsyncSession,
        start_date: datetime,
        end_date: datetime,
        device_filters: List
    ) -> Dict[str, Any]:
        """获取问题统计数据"""
        query_filters = [
            Alert.created_at >= start_date,
            Alert.created_at <= end_date
        ]

        if device_filters:
            query_filters.append(
                Alert.device_id.in_(
                    select(Device.id).where(and_(*device_filters))
                )
            )

        # 总问题数
        total_query = select(func.count(Alert.id)).where(and_(*query_filters))
        result = await db.execute(total_query)
        total = result.scalar() or 0

        # 已解决问题数
        resolved_query = select(func.count(Alert.id)).where(
            and_(
                *query_filters,
                Alert.status == AlertStatus.RESOLVED
            )
        )
        result = await db.execute(resolved_query)
        resolved = result.scalar() or 0

        # 待处理问题数
        pending = total - resolved

        # 严重问题数
        critical_query = select(func.count(Alert.id)).where(
            and_(
                *query_filters,
                Alert.severity == AlertSeverity.CRITICAL
            )
        )
        result = await db.execute(critical_query)
        critical = result.scalar() or 0

        return {
            'total': total,
            'resolved': resolved,
            'pending': pending,
            'critical': critical
        }

    async def _get_device_type_distribution(
        self,
        db: AsyncSession,
        device_filters: List
    ) -> List[DeviceTypeDistributionSchema]:
        """获取设备类型分布"""
        # 按设备类型分组统计
        query = select(
            Device.device_type,
            func.count(Device.id).label('count')
        ).where(
            and_(*device_filters) if device_filters else True
        ).group_by(Device.device_type)

        result = await db.execute(query)
        rows = result.all()

        # 计算总数用于百分比
        total = sum(row.count for row in rows)

        distribution = []
        for row in rows:
            percentage = (row.count / total * 100) if total > 0 else 0.0
            distribution.append(DeviceTypeDistributionSchema(
                device_type=row.device_type or "Unknown",
                count=row.count,
                percentage=round(percentage, 2),
                avg_health_score=85.0  # TODO: 从实际数据计算
            ))

        return distribution

    async def _get_performance_ratings(
        self,
        db: AsyncSession,
        start_date: datetime,
        end_date: datetime,
        device_filters: List
    ) -> List[PerformanceRatingSchema]:
        """
        获取性能评级分布

        评级标准（基于巡检通过率）：
        - excellent: 通过率 >= 95%
        - good: 通过率 >= 80% 且 < 95%
        - fair: 通过率 >= 60% 且 < 80%
        - poor: 通过率 < 60%
        """
        # 构建查询条件
        query_filters = [
            Inspection.started_at >= start_date,
            Inspection.started_at <= end_date,
            Inspection.status == InspectionStatus.COMPLETED
        ]

        if device_filters:
            query_filters.append(
                Inspection.device_id.in_(
                    select(Device.id).where(and_(*device_filters))
                )
            )

        # 计算每个设备的平均通过率
        # pass_rate = passed_checks / total_checks * 100
        query = select(
            Inspection.device_id,
            (func.sum(Inspection.passed_checks).cast(Float) /
             func.sum(Inspection.total_checks).cast(Float) * 100).label('pass_rate')
        ).where(
            and_(
                *query_filters,
                Inspection.total_checks > 0  # 避免除零
            )
        ).group_by(Inspection.device_id)

        result = await db.execute(query)
        device_pass_rates = result.all()

        # 按评级分类
        excellent_count = 0
        good_count = 0
        fair_count = 0
        poor_count = 0

        for _, pass_rate in device_pass_rates:
            if pass_rate is None:
                poor_count += 1
            elif pass_rate >= 95.0:
                excellent_count += 1
            elif pass_rate >= 80.0:
                good_count += 1
            elif pass_rate >= 60.0:
                fair_count += 1
            else:
                poor_count += 1

        total = len(device_pass_rates)

        # 如果没有数据，返回空列表
        if total == 0:
            return [
                PerformanceRatingSchema(rating="excellent", count=0, percentage=0.0),
                PerformanceRatingSchema(rating="good", count=0, percentage=0.0),
                PerformanceRatingSchema(rating="fair", count=0, percentage=0.0),
                PerformanceRatingSchema(rating="poor", count=0, percentage=0.0)
            ]

        # 计算百分比
        ratings = [
            PerformanceRatingSchema(
                rating="excellent",
                count=excellent_count,
                percentage=round(excellent_count / total * 100, 2)
            ),
            PerformanceRatingSchema(
                rating="good",
                count=good_count,
                percentage=round(good_count / total * 100, 2)
            ),
            PerformanceRatingSchema(
                rating="fair",
                count=fair_count,
                percentage=round(fair_count / total * 100, 2)
            ),
            PerformanceRatingSchema(
                rating="poor",
                count=poor_count,
                percentage=round(poor_count / total * 100, 2)
            )
        ]

        return ratings

    async def _get_issues_by_category(
        self,
        db: AsyncSession,
        start_date: datetime,
        end_date: datetime,
        device_filters: List
    ) -> List[IssuesByCategorySchema]:
        """获取问题分类统计"""
        query_filters = [
            Alert.created_at >= start_date,
            Alert.created_at <= end_date
        ]

        if device_filters:
            query_filters.append(
                Alert.device_id.in_(
                    select(Device.id).where(and_(*device_filters))
                )
            )

        # 按告警类型分组统计
        query = select(
            Alert.category.label('category'),
            func.count(Alert.id).label('count'),
            func.sum(case((Alert.severity == AlertSeverity.CRITICAL, 1), else_=0)).label('critical_count'),
            func.sum(case((Alert.severity == AlertSeverity.FATAL, 1), else_=0)).label('fatal_count'),
            func.sum(case((Alert.severity == AlertSeverity.WARNING, 1), else_=0)).label('warning_count'),
            func.sum(case((Alert.severity == AlertSeverity.INFO, 1), else_=0)).label('info_count')
        ).where(
            and_(*query_filters)
        ).group_by(Alert.category)

        result = await db.execute(query)
        rows = result.all()

        # 计算总数用于百分比
        total = sum(row.count for row in rows)

        categories = []
        for row in rows:
            percentage = (row.count / total * 100) if total > 0 else 0.0
            categories.append(IssuesByCategorySchema(
                category=row.category or "其他",
                count=row.count,
                percentage=round(percentage, 2),
                critical_count=row.critical_count or 0,
                high_count=row.high_count or 0,
                medium_count=row.medium_count or 0,
                low_count=row.low_count or 0
            ))

        return categories

    async def _get_device_rankings(
        self,
        db: AsyncSession,
        start_date: datetime,
        end_date: datetime,
        device_filters: List,
        limit: int = 10,
        order: str = 'desc',
        rank_by: str = 'overall'
    ) -> List[DeviceRankingSchema]:
        """
        获取设备排名

        Args:
            rank_by: 排名依据 - overall/performance/reliability/efficiency

        排名算法：
        - overall: 综合评分 = 通过率30% + 在线率25% + 问题数(反向)25% + 响应时间(反向)20%
        - performance: 性能评分 = 通过率60% + 响应时间(反向)40%
        - reliability: 可靠性评分 = 在线率50% + 失败率(反向)30% + 问题数(反向)20%
        - efficiency: 效率评分 = 响应时间(反向)50% + 检查完成度50%
        """
        # 构建设备子查询（用于过滤）
        device_subquery = select(Device.id).where(
            and_(*device_filters) if device_filters else True
        )

        # 查询巡检统计数据（子查询）
        inspection_stats_subquery = select(
            Inspection.device_id,
            func.count(Inspection.id).label('total_inspections'),
            func.sum(Inspection.total_checks).label('total_checks'),
            func.sum(Inspection.passed_checks).label('passed_checks'),
            func.sum(Inspection.failed_checks).label('failed_checks')
        ).where(
            and_(
                Inspection.started_at >= start_date,
                Inspection.started_at <= end_date,
                Inspection.status == InspectionStatus.COMPLETED,
                Inspection.device_id.in_(device_subquery)
            )
        ).group_by(Inspection.device_id).subquery()

        # 查询告警统计数据（子查询）
        alert_stats_subquery = select(
            Alert.device_id,
            func.count(Alert.id).label('issues_count'),
            func.sum(case((Alert.severity == AlertSeverity.CRITICAL, 1), else_=0)).label('critical_count')
        ).where(
            and_(
                Alert.created_at >= start_date,
                Alert.created_at <= end_date,
                Alert.device_id.in_(device_subquery)
            )
        ).group_by(Alert.device_id).subquery()

        # 主查询：关联设备、巡检统计、告警统计
        main_query = select(
            Device.id,
            Device.name,
            Device.device_type,
            Device.status,
            Device.uptime,
            Device.response_time,
            Device.last_seen,
            func.coalesce(inspection_stats_subquery.c.total_checks, 0).label('total_checks'),
            func.coalesce(inspection_stats_subquery.c.passed_checks, 0).label('passed_checks'),
            func.coalesce(inspection_stats_subquery.c.failed_checks, 0).label('failed_checks'),
            func.coalesce(alert_stats_subquery.c.issues_count, 0).label('issues_count'),
            func.coalesce(alert_stats_subquery.c.critical_count, 0).label('critical_count')
        ).outerjoin(
            inspection_stats_subquery,
            Device.id == inspection_stats_subquery.c.device_id
        ).outerjoin(
            alert_stats_subquery,
            Device.id == alert_stats_subquery.c.device_id
        ).where(
            Device.id.in_(device_subquery)
        )

        result = await db.execute(main_query)
        device_data = result.all()

        # 计算得分和排名
        ranked_devices = []
        for row in device_data:
            # 提取数据
            total_checks = row.total_checks or 0
            passed_checks = row.passed_checks or 0
            failed_checks = row.failed_checks or 0
            issues_count = row.issues_count or 0
            critical_count = row.critical_count or 0
            uptime = row.uptime or 0.0
            response_time = row.response_time or 0.0

            # 计算通过率 (0-100)
            pass_rate = (passed_checks / total_checks * 100) if total_checks > 0 else 0.0

            # 根据不同的rank_by使用不同的权重计算得分
            if rank_by == 'performance':
                # 性能排名：更关注通过率和响应时间
                performance_score = pass_rate * 0.6  # 通过率权重60%
                response_score = max(0, 100 - response_time / 10) * 0.4  # 响应时间权重40%
                score = performance_score + response_score

            elif rank_by == 'reliability':
                # 可靠性排名：更关注在线率和故障率
                uptime_score = uptime * 0.5  # 在线率权重50%
                failure_score = max(0, 100 - (failed_checks / max(total_checks, 1)) * 100) * 0.3  # 失败率权重30%
                issue_score = max(0, 100 - issues_count * 10) * 0.2  # 问题数量权重20%
                score = uptime_score + failure_score + issue_score

            elif rank_by == 'efficiency':
                # 效率排名：更关注响应时间和检查完成率
                response_score = max(0, 100 - response_time / 10) * 0.5  # 响应时间权重50%
                # 假设目标是每个设备至少完成100次检查
                completion_rate = min(total_checks / 100 * 100, 100)
                completion_score = completion_rate * 0.5  # 完成度权重50%
                score = response_score + completion_score

            else:  # overall（综合排名）
                # 综合排名：平衡各项指标
                performance_score = pass_rate * 0.3  # 通过率权重30%
                uptime_score = uptime * 0.25  # 在线率权重25%
                issue_score = max(0, 100 - issues_count * 10) * 0.25  # 问题数量权重25%
                response_score = max(0, 100 - response_time / 10) * 0.2  # 响应时间权重20%
                score = performance_score + uptime_score + issue_score + response_score

            # 计算设备健康分数（综合指标，与score独立）
            health_score = (
                pass_rate * 0.4 +  # 通过率权重40%
                uptime * 0.3 +  # 在线率权重30%
                max(0, 100 - issues_count * 10) * 0.3  # 问题数量权重30%
            )

            # 确定设备状态
            if critical_count > 0:
                status = "error"  # 有严重问题
            elif row.status == DeviceStatus.ONLINE:
                status = "online"
            elif row.status == DeviceStatus.OFFLINE:
                status = "offline"
            elif row.status == DeviceStatus.MAINTENANCE:
                status = "maintenance"
            else:
                status = "unknown"

            ranked_devices.append({
                'device_id': str(row.id),
                'device_name': row.name,
                'device_type': row.device_type or "Unknown",
                'score': round(score, 2),
                'health_score': round(health_score, 2),
                'uptime': round(uptime, 2),
                'avg_response_time': round(response_time, 2),
                'total_checks': total_checks,
                'failed_checks': failed_checks,
                'issues_count': issues_count,
                'last_check_time': row.last_seen.isoformat() if row.last_seen else datetime.now().isoformat(),
                'status': status
            })

        # 排序（根据order参数）
        ranked_devices.sort(key=lambda x: x['score'], reverse=(order == 'desc'))

        # 限制数量并添加排名
        rankings = []
        for idx, device in enumerate(ranked_devices[:limit]):
            rankings.append(DeviceRankingSchema(
                rank=idx + 1,
                **device
            ))

        return rankings

    async def _get_trend_data(
        self,
        db: AsyncSession,
        start_date: datetime,
        end_date: datetime,
        device_filters: List,
        group_by: str = "day"
    ) -> List[TrendPointSchema]:
        """
        获取趋势数据

        Args:
            group_by: 时间分组粒度 - hour/day/week/month

        Returns:
            按时间分组的趋势数据点列表
        """
        # 构建设备ID列表
        device_query = select(Device.id).where(
            and_(*device_filters) if device_filters else True
        )
        device_result = await db.execute(device_query)
        device_ids = [row[0] for row in device_result.all()]

        if not device_ids:
            return []

        # 根据group_by确定SQL的date_trunc参数
        trunc_unit_map = {
            "hour": "hour",
            "day": "day",
            "week": "week",
            "month": "month"
        }
        trunc_unit = trunc_unit_map.get(group_by, "day")

        # ========== 查询巡检趋势数据 ==========
        inspection_trend_query = select(
            func.date_trunc(trunc_unit, Inspection.started_at).label('period'),
            func.count(Inspection.id).label('total_inspections'),
            func.sum(case((Inspection.status == InspectionStatus.COMPLETED, 1), else_=0)).label('successful_inspections'),
            func.sum(case((Inspection.status == InspectionStatus.FAILED, 1), else_=0)).label('failed_inspections'),
            func.avg(
                case(
                    (Inspection.total_checks > 0,
                     (Inspection.passed_checks.cast(Float) / Inspection.total_checks.cast(Float) * 100)),
                    else_=0
                )
            ).label('avg_pass_rate')
        ).where(
            and_(
                Inspection.device_id.in_(device_ids),
                Inspection.started_at >= start_date,
                Inspection.started_at <= end_date
            )
        ).group_by('period').order_by('period')

        inspection_result = await db.execute(inspection_trend_query)
        inspection_trends = {row.period: row for row in inspection_result.all()}

        # ========== 查询告警趋势数据 ==========
        alert_trend_query = select(
            func.date_trunc(trunc_unit, Alert.created_at).label('period'),
            func.count(Alert.id).label('issues_detected'),
            func.sum(case((Alert.status == AlertStatus.RESOLVED, 1), else_=0)).label('issues_resolved')
        ).where(
            and_(
                Alert.device_id.in_(device_ids),
                Alert.created_at >= start_date,
                Alert.created_at <= end_date
            )
        ).group_by('period').order_by('period')

        alert_result = await db.execute(alert_trend_query)
        alert_trends = {row.period: row for row in alert_result.all()}

        # ========== 合并数据并构建趋势点 ==========
        # 获取所有时间点（合并inspection和alert的时间点）
        all_periods = sorted(set(list(inspection_trends.keys()) + list(alert_trends.keys())))

        trends = []
        for period in all_periods:
            inspection_data = inspection_trends.get(period)
            alert_data = alert_trends.get(period)

            # 从巡检数据中提取指标
            total_inspections = inspection_data.total_inspections if inspection_data else 0
            successful_inspections = inspection_data.successful_inspections if inspection_data else 0
            failed_inspections = inspection_data.failed_inspections if inspection_data else 0
            avg_pass_rate = inspection_data.avg_pass_rate if inspection_data else 0.0

            # 从告警数据中提取指标
            issues_detected = alert_data.issues_detected if alert_data else 0
            issues_resolved = alert_data.issues_resolved if alert_data else 0

            # 计算该时间段的健康分数（简化版）
            # 基于巡检通过率和问题数量
            issue_penalty = min(50, issues_detected * 2)  # 每个问题扣2分，最多扣50分
            avg_health_score = (avg_pass_rate * 0.7 + max(0, 100 - issue_penalty) * 0.3)

            trends.append(TrendPointSchema(
                date=period.isoformat(),
                total_inspections=total_inspections,
                successful_inspections=successful_inspections,
                failed_inspections=failed_inspections,
                avg_health_score=round(avg_health_score, 2),
                issues_detected=issues_detected,
                issues_resolved=issues_resolved
            ))

        return trends

    async def _calculate_device_health_score(
        self,
        db: AsyncSession,
        start_date: datetime,
        end_date: datetime,
        device_filters: List
    ) -> float:
        """
        计算设备健康分数（0-100）

        健康分数算法：
        - 巡检通过率 40%
        - 设备在线率 30%
        - 问题严重程度 20%
        - 响应时间 10%
        """
        # 构建设备过滤条件
        device_query = select(Device.id).where(
            and_(*device_filters) if device_filters else True
        )
        device_result = await db.execute(device_query)
        device_ids = [row[0] for row in device_result.all()]

        if not device_ids:
            return 0.0

        # 1. 计算巡检通过率
        inspection_query = select(
            func.sum(Inspection.passed_checks).label('total_passed'),
            func.sum(Inspection.total_checks).label('total_checks')
        ).where(
            and_(
                Inspection.device_id.in_(device_ids),
                Inspection.started_at >= start_date,
                Inspection.started_at <= end_date,
                Inspection.status == InspectionStatus.COMPLETED
            )
        )
        inspection_result = await db.execute(inspection_query)
        inspection_row = inspection_result.first()

        total_passed = inspection_row.total_passed or 0
        total_checks = inspection_row.total_checks or 0
        pass_rate = (total_passed / total_checks * 100) if total_checks > 0 else 0.0

        # 2. 计算设备在线率
        device_stats_query = select(
            func.avg(Device.uptime).label('avg_uptime')
        ).where(Device.id.in_(device_ids))
        device_stats_result = await db.execute(device_stats_query)
        avg_uptime = device_stats_result.scalar() or 0.0

        # 3. 计算问题严重程度得分（基于告警）
        alert_query = select(
            func.count(Alert.id).label('total_alerts'),
            func.sum(case((Alert.severity == AlertSeverity.CRITICAL, 1), else_=0)).label('critical_count'),
            func.sum(case((Alert.severity == AlertSeverity.WARNING, 1), else_=0)).label('warning_count')
        ).where(
            and_(
                Alert.device_id.in_(device_ids),
                Alert.created_at >= start_date,
                Alert.created_at <= end_date
            )
        )
        alert_result = await db.execute(alert_query)
        alert_row = alert_result.first()

        total_alerts = alert_row.total_alerts or 0
        critical_count = alert_row.critical_count or 0
        warning_count = alert_row.warning_count or 0

        # 问题严重程度得分：严重问题扣分更多
        # 假设每个设备平均10个告警是正常的
        alert_penalty = min(100, (critical_count * 10 + warning_count * 3) / len(device_ids))
        issue_score = max(0, 100 - alert_penalty)

        # 4. 计算响应时间得分
        response_query = select(
            func.avg(Device.response_time).label('avg_response_time')
        ).where(Device.id.in_(device_ids))
        response_result = await db.execute(response_query)
        avg_response_time = response_result.scalar() or 0.0

        # 响应时间得分：假设100ms以下是满分，每增加10ms扣1分
        response_score = max(0, 100 - (avg_response_time - 100) / 10) if avg_response_time > 100 else 100.0

        # 综合计算健康分数
        health_score = (
            pass_rate * 0.4 +  # 巡检通过率权重40%
            avg_uptime * 0.3 +  # 在线率权重30%
            issue_score * 0.2 +  # 问题严重程度权重20%
            response_score * 0.1  # 响应时间权重10%
        )

        return round(health_score, 2)

    async def _calculate_kpi_metrics(
        self,
        db: AsyncSession,
        start_date: datetime,
        end_date: datetime,
        device_filters: List
    ) -> Dict[str, float]:
        """
        计算12个核心KPI指标

        KPI列表：
        1. inspection_completion_rate - 巡检完成率
        2. inspection_success_rate - 巡检成功率
        3. avg_inspection_duration - 平均巡检时长（分钟）
        4. device_availability - 设备可用率
        5. device_health_score - 设备健康分数
        6. issue_resolution_rate - 问题解决率
        7. avg_resolution_time - 平均解决时间（小时）
        8. mttr - 平均修复时间（小时）
        9. mtbf - 平均无故障时间（小时）
        10. critical_issues_count - 严重问题数
        11. sla_compliance_rate - SLA达标率
        12. avg_response_time - 平均响应时间（毫秒）
        """
        # 构建设备ID列表
        device_query = select(Device.id).where(
            and_(*device_filters) if device_filters else True
        )
        device_result = await db.execute(device_query)
        device_ids = [row[0] for row in device_result.all()]

        if not device_ids:
            # 返回全0的KPI
            return {
                "inspection_completion_rate": 0.0,
                "inspection_success_rate": 0.0,
                "avg_inspection_duration": 0.0,
                "device_availability": 0.0,
                "device_health_score": 0.0,
                "issue_resolution_rate": 0.0,
                "avg_resolution_time": 0.0,
                "mttr": 0.0,
                "mtbf": 0.0,
                "critical_issues_count": 0,
                "sla_compliance_rate": 0.0,
                "avg_response_time": 0.0
            }

        # ========== 1. 巡检相关KPI ==========
        # 查询巡检统计数据
        inspection_stats_query = select(
            func.count(Inspection.id).label('total_inspections'),
            func.sum(case((Inspection.status == InspectionStatus.COMPLETED, 1), else_=0)).label('completed_inspections'),
            func.sum(case((Inspection.status == InspectionStatus.FAILED, 1), else_=0)).label('failed_inspections'),
            func.avg(Inspection.duration).label('avg_duration'),
            func.sum(Inspection.passed_checks).label('total_passed'),
            func.sum(Inspection.total_checks).label('total_checks')
        ).where(
            and_(
                Inspection.device_id.in_(device_ids),
                Inspection.started_at >= start_date,
                Inspection.started_at <= end_date
            )
        )
        inspection_result = await db.execute(inspection_stats_query)
        inspection_row = inspection_result.first()

        total_inspections = inspection_row.total_inspections or 0
        completed_inspections = inspection_row.completed_inspections or 0
        failed_inspections = inspection_row.failed_inspections or 0
        avg_duration = inspection_row.avg_duration or 0.0
        total_passed = inspection_row.total_passed or 0
        total_checks = inspection_row.total_checks or 0

        # KPI 1: 巡检完成率
        inspection_completion_rate = (completed_inspections / total_inspections * 100) if total_inspections > 0 else 0.0

        # KPI 2: 巡检成功率（基于检查项通过率）
        inspection_success_rate = (total_passed / total_checks * 100) if total_checks > 0 else 0.0

        # KPI 3: 平均巡检时长（秒转分钟）
        avg_inspection_duration = avg_duration / 60.0 if avg_duration > 0 else 0.0

        # ========== 2. 设备相关KPI ==========
        # 查询设备统计数据
        device_stats_query = select(
            func.avg(Device.uptime).label('avg_uptime'),
            func.avg(Device.response_time).label('avg_response_time'),
            func.count(Device.id).label('total_devices'),
            func.sum(case((Device.status == DeviceStatus.ONLINE, 1), else_=0)).label('online_devices')
        ).where(Device.id.in_(device_ids))
        device_result = await db.execute(device_stats_query)
        device_row = device_result.first()

        avg_uptime = device_row.avg_uptime or 0.0
        avg_response_time = device_row.avg_response_time or 0.0
        total_devices = device_row.total_devices or 0
        online_devices = device_row.online_devices or 0

        # KPI 4: 设备可用率
        device_availability = avg_uptime

        # KPI 5: 设备健康分数（调用已实现的方法）
        device_health_score = await self._calculate_device_health_score(
            db, start_date, end_date, device_filters
        )

        # KPI 12: 平均响应时间
        avg_response_time_kpi = avg_response_time

        # ========== 3. 问题/告警相关KPI ==========
        # 查询告警统计数据
        alert_stats_query = select(
            func.count(Alert.id).label('total_alerts'),
            func.sum(case((Alert.status == AlertStatus.RESOLVED, 1), else_=0)).label('resolved_alerts'),
            func.sum(case((Alert.severity == AlertSeverity.CRITICAL, 1), else_=0)).label('critical_count'),
            func.avg(
                case(
                    (Alert.resolved_at.isnot(None),
                     func.extract('epoch', Alert.resolved_at - Alert.created_at) / 3600.0),
                    else_=None
                )
            ).label('avg_resolution_hours')
        ).where(
            and_(
                Alert.device_id.in_(device_ids),
                Alert.created_at >= start_date,
                Alert.created_at <= end_date
            )
        )
        alert_result = await db.execute(alert_stats_query)
        alert_row = alert_result.first()

        total_alerts = alert_row.total_alerts or 0
        resolved_alerts = alert_row.resolved_alerts or 0
        critical_count = alert_row.critical_count or 0
        avg_resolution_hours = alert_row.avg_resolution_hours or 0.0

        # KPI 6: 问题解决率
        issue_resolution_rate = (resolved_alerts / total_alerts * 100) if total_alerts > 0 else 0.0

        # KPI 7: 平均解决时间（小时）
        avg_resolution_time = avg_resolution_hours

        # KPI 10: 严重问题数
        critical_issues_count = critical_count

        # ========== 4. 可靠性指标（MTTR/MTBF） ==========
        # MTTR (Mean Time To Repair) - 平均修复时间
        # 计算所有已解决告警的平均修复时间
        mttr_query = select(
            func.avg(
                func.extract('epoch', Alert.resolved_at - Alert.created_at) / 3600.0
            ).label('mttr')
        ).where(
            and_(
                Alert.device_id.in_(device_ids),
                Alert.created_at >= start_date,
                Alert.created_at <= end_date,
                Alert.resolved_at.isnot(None),
                Alert.severity.in_([AlertSeverity.CRITICAL, AlertSeverity.WARNING])
            )
        )
        mttr_result = await db.execute(mttr_query)
        mttr = mttr_result.scalar() or 0.0

        # MTBF (Mean Time Between Failures) - 平均无故障时间
        # 计算方法：总运行时间 / 故障次数
        time_period_hours = (end_date - start_date).total_seconds() / 3600.0
        failure_count = critical_count + failed_inspections
        mtbf = (time_period_hours * len(device_ids) / failure_count) if failure_count > 0 else time_period_hours

        # ========== 5. SLA达标率 ==========
        # SLA标准：设备可用率 >= 99.5%
        sla_threshold = 99.5
        sla_compliant_query = select(
            func.count(Device.id).label('compliant_devices')
        ).where(
            and_(
                Device.id.in_(device_ids),
                Device.uptime >= sla_threshold
            )
        )
        sla_result = await db.execute(sla_compliant_query)
        compliant_devices = sla_result.scalar() or 0

        # KPI 11: SLA达标率
        sla_compliance_rate = (compliant_devices / total_devices * 100) if total_devices > 0 else 0.0

        # 返回所有KPI指标
        return {
            "inspection_completion_rate": round(inspection_completion_rate, 2),
            "inspection_success_rate": round(inspection_success_rate, 2),
            "avg_inspection_duration": round(avg_inspection_duration, 2),
            "device_availability": round(device_availability, 2),
            "device_health_score": round(device_health_score, 2),
            "issue_resolution_rate": round(issue_resolution_rate, 2),
            "avg_resolution_time": round(avg_resolution_time, 2),
            "mttr": round(mttr, 2),
            "mtbf": round(mtbf, 2),
            "critical_issues_count": critical_count,
            "sla_compliance_rate": round(sla_compliance_rate, 2),
            "avg_response_time": round(avg_response_time_kpi, 2)
        }

    async def _get_rankings_by_device_type(
        self,
        db: AsyncSession,
        start_date: datetime,
        end_date: datetime,
        device_filters: List,
        top_n: int
    ) -> List[RankingCategorySchema]:
        """按设备类型获取排名"""
        # TODO: 实现完整的分类排名逻辑
        # 这里返回模拟数据
        return [
            RankingCategorySchema(
                category_name="服务器",
                category_type="server",
                rankings=await self._get_device_rankings(
                    db, start_date, end_date, device_filters, limit=5, order='desc'
                )
            )
        ]


# 单例实例
statistics_service = StatisticsService()
