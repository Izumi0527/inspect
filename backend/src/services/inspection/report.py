"""
巡检报告服务
负责生成巡检报告数据和管理报表生成流程
"""
import asyncio
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from pathlib import Path
import structlog
from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import joinedload

from src.models.device import Device
from src.models.inspection import (
    Inspection,
    InspectionResult,
    InspectionStatus,
    CheckItemStatus,
    InspectionStrategy
)
from src.models.report import Report, ReportStatus, ReportType, ReportFormat as DBReportFormat
from src.services.report.generator import ReportGenerator
from src.schemas.report import (
    InspectionReportDataSchema,
    InspectionSummarySchema,
    DeviceReportResultSchema,
    ExecutionTrendDataSchema,
    ProblemAnalysisDataSchema,
    RecommendationDataSchema,
    PerformanceMetricsSchema,
    IssueDataSchema,
    ImplementationSchema,
    ReportFormat,
    GenerateInspectionReportRequest
)
from src.core.config import settings

logger = structlog.get_logger()


class InspectionReportService:
    """巡检报告服务类"""

    def __init__(self, db_session: AsyncSession):
        self.db = db_session
        self.report_generator = ReportGenerator()
        self.logger = logger.bind(service="InspectionReportService")

    async def generate_inspection_report_data(
        self,
        start_date: datetime,
        end_date: datetime,
        device_ids: Optional[List[str]] = None,
        strategy_ids: Optional[List[int]] = None,
        execution_ids: Optional[List[int]] = None
    ) -> InspectionReportDataSchema:
        """
        生成巡检报告数据

        Args:
            start_date: 开始日期
            end_date: 结束日期
            device_ids: 设备ID列表（可选）
            strategy_ids: 策略ID列表（可选）
            execution_ids: 执行记录ID列表（可选）

        Returns:
            InspectionReportDataSchema: 报告数据
        """
        self.logger.info("Generating inspection report data",
                        start_date=start_date,
                        end_date=end_date,
                        device_count=len(device_ids) if device_ids else "all")

        # 构建查询条件
        conditions = [
            Inspection.executed_at >= start_date,
            Inspection.executed_at <= end_date
        ]

        if execution_ids:
            conditions.append(Inspection.id.in_(execution_ids))
        if strategy_ids:
            conditions.append(Inspection.strategy_id.in_(strategy_ids))
        if device_ids:
            conditions.append(Inspection.device_id.in_(device_ids))

        # 查询巡检执行记录
        executions_query = select(Inspection).where(
            and_(*conditions)
        ).options(
            joinedload(Inspection.device),
            joinedload(Inspection.strategy)
        )
        result = await self.db.execute(executions_query)
        executions = result.scalars().unique().all()

        # 生成各部分数据
        summary = await self._generate_summary(executions)
        device_results = await self._generate_device_results(executions)
        execution_trends = await self._generate_execution_trends(executions, start_date, end_date)
        problem_analysis = await self._generate_problem_analysis(executions)
        recommendations = await self._generate_recommendations(device_results, problem_analysis)

        return InspectionReportDataSchema(
            summary=summary,
            device_results=device_results,
            execution_trends=execution_trends,
            problem_analysis=problem_analysis,
            recommendations=recommendations
        )

    async def _generate_summary(
        self,
        executions: List[Inspection]
    ) -> InspectionSummarySchema:
        """生成汇总数据"""
        total_devices = len(set(ex.device_id for ex in executions if ex.device_id))
        total_executions = len(executions)

        # 统计检查项
        total_checks = 0
        passed_checks = 0
        failed_checks = 0
        warning_checks = 0
        total_score = 0.0

        for execution in executions:
            if execution.total_checks:
                total_checks += execution.total_checks
            if execution.passed_checks:
                passed_checks += execution.passed_checks
            if execution.failed_checks:
                failed_checks += execution.failed_checks
            if execution.warning_checks:
                warning_checks += execution.warning_checks
            if execution.score:
                total_score += execution.score

        avg_score = total_score / len(executions) if executions else 0.0
        success_rate = (passed_checks / total_checks * 100) if total_checks > 0 else 0.0

        return InspectionSummarySchema(
            total_devices=total_devices,
            total_executions=total_executions,
            total_checks=total_checks,
            passed_checks=passed_checks,
            failed_checks=failed_checks,
            warning_checks=warning_checks,
            avg_score=round(avg_score, 2),
            success_rate=round(success_rate, 2)
        )

    async def _generate_device_results(
        self,
        executions: List[Inspection]
    ) -> List[DeviceReportResultSchema]:
        """生成设备结果数据"""
        # 按设备分组
        device_executions = {}
        for execution in executions:
            if execution.device_id:
                if execution.device_id not in device_executions:
                    device_executions[execution.device_id] = []
                device_executions[execution.device_id].append(execution)

        device_results = []
        for device_id, dev_execs in device_executions.items():
            # 获取最新的执行记录
            latest_exec = max(dev_execs, key=lambda x: x.executed_at or datetime.min)
            device = latest_exec.device

            if not device:
                continue

            # 聚合统计
            total_checks = sum(e.total_checks or 0 for e in dev_execs)
            passed_checks = sum(e.passed_checks or 0 for e in dev_execs)
            failed_checks = sum(e.failed_checks or 0 for e in dev_execs)
            warning_checks = sum(e.warning_checks or 0 for e in dev_execs)
            avg_score = sum(e.score or 0 for e in dev_execs) / len(dev_execs) if dev_execs else 0

            # 计算可用性（基于成功执行的比例）
            successful_execs = sum(1 for e in dev_execs if e.status == InspectionStatus.COMPLETED)
            uptime = (successful_execs / len(dev_execs) * 100) if dev_execs else 0

            # 计算平均响应时间
            durations = [e.duration for e in dev_execs if e.duration]
            avg_response_time = sum(durations) / len(durations) if durations else 0

            # 确定设备状态
            if latest_exec.status == InspectionStatus.COMPLETED:
                if failed_checks > 0:
                    status = "error"
                elif warning_checks > 0:
                    status = "warning"
                else:
                    status = "online"
            else:
                status = "offline"

            # 获取问题列表
            issues = await self._get_device_issues(device_id, dev_execs)

            # 获取性能指标
            performance_metrics = await self._get_performance_metrics(device_id, dev_execs)

            device_result = DeviceReportResultSchema(
                device_id=str(device.id),
                device_name=device.name,
                device_type=device.device_type or "未知",
                device_group=device.device_group or "默认",
                status=status,
                total_checks=total_checks,
                passed_checks=passed_checks,
                failed_checks=failed_checks,
                warning_checks=warning_checks,
                score=round(avg_score, 2),
                uptime=round(uptime, 2),
                avg_response_time=round(avg_response_time, 2),
                last_check_time=latest_exec.executed_at.isoformat() if latest_exec.executed_at else "",
                issues=issues,
                performance_metrics=performance_metrics
            )
            device_results.append(device_result)

        return device_results

    async def _get_device_issues(
        self,
        device_id: str,
        executions: List[Inspection]
    ) -> List[IssueDataSchema]:
        """获取设备问题列表"""
        issues = []

        # 查询失败的检查项
        execution_ids = [e.id for e in executions if e.id]
        if not execution_ids:
            return issues

        results_query = select(InspectionResult).where(
            and_(
                InspectionResult.inspection_execution_id.in_(execution_ids),
                InspectionResult.status == CheckItemStatus.FAILED
            )
        )
        result = await self.db.execute(results_query)
        failed_results = result.scalars().all()

        # 按检查项分组统计
        issue_map = {}
        for failed_result in failed_results:
            key = failed_result.check_item_name
            if key not in issue_map:
                issue_map[key] = {
                    "results": [],
                    "first_detected": failed_result.checked_at,
                    "last_detected": failed_result.checked_at,
                    "count": 0
                }

            issue_map[key]["results"].append(failed_result)
            issue_map[key]["count"] += 1

            if failed_result.checked_at:
                if failed_result.checked_at < issue_map[key]["first_detected"]:
                    issue_map[key]["first_detected"] = failed_result.checked_at
                if failed_result.checked_at > issue_map[key]["last_detected"]:
                    issue_map[key]["last_detected"] = failed_result.checked_at

        # 转换为Issue对象
        for check_name, issue_data in issue_map.items():
            latest_result = issue_data["results"][-1]

            issue = IssueDataSchema(
                id=f"issue_{device_id}_{check_name}",
                type=latest_result.check_item_type or "configuration",
                severity="high" if issue_data["count"] > 5 else "medium",
                title=check_name,
                description=latest_result.message or "检查项失败",
                first_detected=issue_data["first_detected"].isoformat(),
                last_detected=issue_data["last_detected"].isoformat(),
                occurrence_count=issue_data["count"],
                status="active",
                resolution=latest_result.description
            )
            issues.append(issue)

        return issues

    async def _get_performance_metrics(
        self,
        device_id: str,
        executions: List[Inspection]
    ) -> PerformanceMetricsSchema:
        """获取性能指标"""
        # 这里简化实现，实际应该从监控数据中获取
        return PerformanceMetricsSchema(
            cpu={"current": 0.0, "average": 0.0, "peak": 0.0},
            memory={"current": 0.0, "average": 0.0, "peak": 0.0},
            disk_space={"used": 0, "total": 0, "percentage": 0.0},
            network_traffic={"inbound": 0.0, "outbound": 0.0, "utilization": 0.0}
        )

    async def _generate_execution_trends(
        self,
        executions: List[Inspection],
        start_date: datetime,
        end_date: datetime
    ) -> List[ExecutionTrendDataSchema]:
        """生成执行趋势数据"""
        trends = []

        # 按日期分组
        date_executions = {}
        for execution in executions:
            if execution.executed_at:
                date_key = execution.executed_at.date().isoformat()
                if date_key not in date_executions:
                    date_executions[date_key] = []
                date_executions[date_key].append(execution)

        # 生成每天的趋势数据
        current_date = start_date.date()
        end_date_val = end_date.date()

        while current_date <= end_date_val:
            date_key = current_date.isoformat()
            day_execs = date_executions.get(date_key, [])

            total_executions = len(day_execs)
            successful_executions = sum(1 for e in day_execs if e.status == InspectionStatus.COMPLETED)
            failed_executions = total_executions - successful_executions

            avg_score = sum(e.score or 0 for e in day_execs) / len(day_execs) if day_execs else 0
            avg_duration = sum(e.duration or 0 for e in day_execs) / len(day_execs) if day_execs else 0
            device_count = len(set(e.device_id for e in day_execs if e.device_id))

            trend = ExecutionTrendDataSchema(
                date=date_key,
                total_executions=total_executions,
                successful_executions=successful_executions,
                failed_executions=failed_executions,
                avg_score=round(avg_score, 2),
                avg_duration=round(avg_duration, 2),
                device_count=device_count
            )
            trends.append(trend)

            current_date += timedelta(days=1)

        return trends

    async def _generate_problem_analysis(
        self,
        executions: List[Inspection]
    ) -> List[ProblemAnalysisDataSchema]:
        """生成问题分析数据"""
        # 查询所有失败的检查项
        execution_ids = [e.id for e in executions if e.id]
        if not execution_ids:
            return []

        results_query = select(InspectionResult).where(
            and_(
                InspectionResult.inspection_execution_id.in_(execution_ids),
                InspectionResult.status == CheckItemStatus.FAILED
            )
        )
        result = await self.db.execute(results_query)
        failed_results = result.scalars().all()

        # 按类型分组统计
        problem_categories = {}
        total_problems = len(failed_results)

        for failed_result in failed_results:
            category = failed_result.check_item_type or "其他"

            if category not in problem_categories:
                problem_categories[category] = {
                    "count": 0,
                    "devices": set(),
                    "severity_counts": {"low": 0, "medium": 0, "high": 0, "critical": 0}
                }

            problem_categories[category]["count"] += 1

            if failed_result.inspection_execution:
                device_id = failed_result.inspection_execution.device_id
                if device_id:
                    problem_categories[category]["devices"].add(device_id)

            # 简化的严重程度判断
            problem_categories[category]["severity_counts"]["medium"] += 1

        # 转换为ProblemAnalysisData
        problems = []
        for category, data in problem_categories.items():
            percentage = (data["count"] / total_problems * 100) if total_problems > 0 else 0

            # 确定主要严重程度
            severity_counts = data["severity_counts"]
            if severity_counts["critical"] > 0:
                severity = "critical"
            elif severity_counts["high"] > 0:
                severity = "high"
            elif severity_counts["medium"] > 0:
                severity = "medium"
            else:
                severity = "low"

            problem = ProblemAnalysisDataSchema(
                category=category,
                count=data["count"],
                percentage=round(percentage, 2),
                severity=severity,
                trend="stable",
                affected_devices=list(data["devices"]),
                description=f"{category}类问题共{data['count']}个",
                solutions=[f"检查{category}配置", "联系技术支持"]
            )
            problems.append(problem)

        return sorted(problems, key=lambda x: x.count, reverse=True)

    async def _generate_recommendations(
        self,
        device_results: List[DeviceReportResultSchema],
        problem_analysis: List[ProblemAnalysisDataSchema]
    ) -> List[RecommendationDataSchema]:
        """生成优化建议"""
        recommendations = []

        # 基于设备问题生成建议
        high_error_devices = [d for d in device_results if d.failed_checks > 10]
        if high_error_devices:
            recommendations.append(RecommendationDataSchema(
                id="rec_high_errors",
                type="maintenance",
                priority="high",
                title="高错误率设备需要维护",
                description=f"发现{len(high_error_devices)}台设备错误率较高，建议进行专项检查和维护",
                affected_devices=[d.device_id for d in high_error_devices],
                estimated_impact="可提升系统整体稳定性20%",
                implementation=ImplementationSchema(
                    steps=[
                        "检查设备配置是否正确",
                        "更新设备固件到最新版本",
                        "清理设备缓存和临时文件",
                        "重启设备并观察运行状态"
                    ],
                    estimated_time="2-4小时",
                    resources=["运维工程师", "设备维护文档"]
                )
            ))

        # 基于问题分析生成建议
        for problem in problem_analysis[:3]:  # 取前3个最严重的问题
            if problem.severity in ["high", "critical"]:
                recommendations.append(RecommendationDataSchema(
                    id=f"rec_{problem.category}",
                    type="optimization",
                    priority="medium" if problem.severity == "high" else "urgent",
                    title=f"优化{problem.category}配置",
                    description=problem.description,
                    affected_devices=problem.affected_devices,
                    estimated_impact=f"可减少{problem.category}类问题{min(80, problem.percentage)}%",
                    implementation=ImplementationSchema(
                        steps=problem.solutions or ["联系技术支持"],
                        estimated_time="1-2天",
                        resources=["技术文档", "配置脚本"]
                    )
                ))

        return recommendations

    async def generate_and_save_report(
        self,
        request: GenerateInspectionReportRequest,
        generated_by: str
    ) -> Report:
        """
        生成并保存巡检报告

        Args:
            request: 生成报告请求
            generated_by: 生成人ID

        Returns:
            Report: 报表记录
        """
        self.logger.info("Starting report generation", title=request.title)

        # 解析日期
        start_date = datetime.fromisoformat(request.date_range.start_date)
        end_date = datetime.fromisoformat(request.date_range.end_date)

        # 创建报表记录
        report = Report(
            title=request.title,
            description=request.description,
            report_type=ReportType.INSPECTION,
            category="custom",  # 新字段
            start_date=start_date,
            end_date=end_date,
            device_filters={
                "devices": request.devices or [],
                "strategies": request.strategies or []
            },
            status=ReportStatus.GENERATING,
            generated_by=generated_by,
            file_formats=[],
            file_paths={},
            file_sizes={}
        )

        self.db.add(report)
        await self.db.commit()
        await self.db.refresh(report)

        try:
            # 生成报告数据
            report_data = await self.generate_inspection_report_data(
                start_date=start_date,
                end_date=end_date,
                device_ids=request.devices,
                strategy_ids=[int(s) for s in request.strategies] if request.strategies else None,
                execution_ids=[int(e) for e in request.execution_ids] if request.execution_ids else None
            )

            # 转换为report_generator需要的格式
            inspection_data = self._convert_to_generator_format(report_data, request)

            # 生成文件
            format_str = request.format.value.lower()
            file_path = await self.report_generator.generate_inspection_report(
                inspection_data=inspection_data,
                format_type=format_str,
                include_charts=request.include_charts
            )

            # 更新报表记录
            report.status = ReportStatus.COMPLETED
            report.generated_at = datetime.now()
            report.file_formats = [format_str]
            report.file_paths = {format_str: file_path}

            # 获取文件大小
            file_size = Path(file_path).stat().st_size if Path(file_path).exists() else 0
            report.file_sizes = {format_str: file_size}

            report.total_devices = report_data.summary.total_devices
            report.data_points = report_data.summary.total_checks

            await self.db.commit()
            await self.db.refresh(report)

            self.logger.info("Report generated successfully", report_id=report.id)
            return report

        except Exception as e:
            self.logger.error("Report generation failed", error=str(e))
            report.status = ReportStatus.FAILED
            report.error_message = str(e)
            await self.db.commit()
            raise

    def _convert_to_generator_format(
        self,
        report_data: InspectionReportDataSchema,
        request: GenerateInspectionReportRequest
    ) -> Dict[str, Any]:
        """将InspectionReportData转换为report_generator需要的格式"""
        return {
            "inspection_name": request.title,
            "inspection_id": "",
            "inspection_time": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            "devices": [
                {
                    "device_name": device.device_name,
                    "ip_address": "",
                    "device_type": device.device_type,
                    "check_results": [
                        {
                            "check_name": issue.title,
                            "status": "failed",
                            "message": issue.description
                        }
                        for issue in device.issues[:5]  # 限制数量
                    ],
                    "performance_metrics": {
                        "cpu_usage": device.performance_metrics.cpu.get("current", 0),
                        "memory_usage": device.performance_metrics.memory.get("current", 0)
                    }
                }
                for device in report_data.device_results
            ],
            "summary_stats": {
                "total_checks": report_data.summary.total_checks,
                "passed_checks": report_data.summary.passed_checks,
                "failed_checks": report_data.summary.failed_checks,
                "warning_checks": report_data.summary.warning_checks,
                "success_rate": report_data.summary.success_rate
            }
        }
