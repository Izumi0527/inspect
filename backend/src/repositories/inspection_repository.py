"""巡检数据访问层Repository"""
from typing import List, Optional, Dict, Any, Tuple
from datetime import datetime
import sqlalchemy as sa
from sqlalchemy import and_, or_, desc, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload, joinedload
from sqlalchemy.future import select

from ..models.inspection import (
    Inspection,
    InspectionResult,
    InspectionStatus,
    InspectionTrigger,
    CheckItemStatus,
    InspectionTemplate,
    InspectionSchedule,
    InspectionStrategy
)
from ..models.device import Device
from ..models.user import User
from ..core.database import get_db_session_context


class InspectionRepository:
    """巡检数据访问层"""

    def __init__(self, session: AsyncSession):
        self.session = session

    # ==================== 执行记录查询 ====================

    async def get_executions_paginated(
        self,
        page: int = 1,
        page_size: int = 10,
        status: Optional[List[str]] = None,
        strategy_id: Optional[int] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> Tuple[List[Inspection], int]:
        """
        分页获取巡检执行记录列表

        Args:
            page: 页码（从1开始）
            page_size: 每页数量
            status: 状态过滤列表
            strategy_id: 策略ID过滤
            start_date: 开始日期
            end_date: 结束日期

        Returns:
            (执行记录列表, 总数)
        """
        # 构建基础查询
        query = (
            select(Inspection)
            .options(
                joinedload(Inspection.device),
                joinedload(Inspection.template),
                joinedload(Inspection.schedule),
                joinedload(Inspection.creator)
            )
        )
        count_query = select(func.count(Inspection.id))

        # 构建过滤条件
        filters = []

        # 状态过滤
        if status:
            status_enums = [InspectionStatus(s) for s in status if s in [e.value for e in InspectionStatus]]
            if status_enums:
                filters.append(Inspection.status.in_(status_enums))

        # 策略ID过滤 - 通过 schedule_id 关联
        if strategy_id:
            # 查询该策略关联的 schedule_id
            schedule_query = select(InspectionSchedule.id).where(
                InspectionSchedule.id == strategy_id  # 这里简化处理，实际可能需要关联 strategy 表
            )
            schedule_result = await self.session.execute(schedule_query)
            schedule_ids = [row[0] for row in schedule_result.all()]
            if schedule_ids:
                filters.append(Inspection.schedule_id.in_(schedule_ids))

        # 日期范围过滤
        if start_date:
            filters.append(Inspection.started_at >= start_date)
        if end_date:
            filters.append(Inspection.started_at < end_date)

        # 应用过滤条件
        if filters:
            query = query.where(and_(*filters))
            count_query = count_query.where(and_(*filters))

        # 排序：按开始时间倒序
        query = query.order_by(desc(Inspection.started_at))

        # 计算偏移量
        skip = (page - 1) * page_size
        query = query.offset(skip).limit(page_size)

        # 执行查询
        result = await self.session.execute(query)
        inspections = result.unique().scalars().all()

        count_result = await self.session.execute(count_query)
        total = count_result.scalar()

        return list(inspections), total

    async def get_execution_by_id(self, execution_id: int) -> Optional[Inspection]:
        """
        根据ID获取执行记录详情

        Args:
            execution_id: 执行记录ID

        Returns:
            执行记录对象或None
        """
        query = (
            select(Inspection)
            .options(
                joinedload(Inspection.device),
                joinedload(Inspection.template),
                joinedload(Inspection.schedule),
                joinedload(Inspection.creator),
                selectinload(Inspection.results)
            )
            .where(Inspection.id == execution_id)
        )
        result = await self.session.execute(query)
        return result.unique().scalar_one_or_none()

    async def get_execution_results(
        self, execution_id: int
    ) -> List[InspectionResult]:
        """
        获取执行记录的所有检查结果

        Args:
            execution_id: 执行记录ID

        Returns:
            检查结果列表
        """
        query = (
            select(InspectionResult)
            .where(InspectionResult.inspection_id == execution_id)
            .order_by(InspectionResult.created_at)
        )
        result = await self.session.execute(query)
        return list(result.scalars().all())

    # ==================== 执行记录创建和更新 ====================

    async def create_inspection(
        self,
        device_id: int,
        template_id: Optional[int] = None,
        schedule_id: Optional[int] = None,
        name: Optional[str] = None,
        trigger: InspectionTrigger = InspectionTrigger.MANUAL,
        created_by: Optional[str] = None,
    ) -> Inspection:
        """
        创建巡检执行记录

        Args:
            device_id: 设备ID
            template_id: 模板ID
            schedule_id: 调度ID
            name: 巡检任务名称
            trigger: 触发方式
            created_by: 创建者ID

        Returns:
            创建的执行记录
        """
        inspection = Inspection(
            device_id=device_id,
            template_id=template_id,
            schedule_id=schedule_id,
            name=name or f"巡检任务 {datetime.now().strftime('%Y%m%d%H%M%S')}",
            trigger=trigger,
            status=InspectionStatus.PENDING,
            created_by=created_by,
            created_at=datetime.now(),
            updated_at=datetime.now(),
        )

        self.session.add(inspection)
        await self.session.commit()
        await self.session.refresh(inspection)

        return inspection

    async def update_inspection_status(
        self,
        inspection_id: int,
        status: InspectionStatus,
        error_message: Optional[str] = None,
        error_details: Optional[Dict] = None,
    ) -> bool:
        """
        更新巡检状态

        Args:
            inspection_id: 执行记录ID
            status: 新状态
            error_message: 错误消息
            error_details: 错误详情

        Returns:
            是否更新成功
        """
        inspection = await self.get_execution_by_id(inspection_id)
        if not inspection:
            return False

        inspection.status = status
        inspection.updated_at = datetime.now()

        # 更新时间戳
        if status == InspectionStatus.RUNNING and not inspection.started_at:
            inspection.started_at = datetime.now()
        elif status in [
            InspectionStatus.COMPLETED,
            InspectionStatus.FAILED,
            InspectionStatus.CANCELLED,
        ]:
            if not inspection.completed_at:
                inspection.completed_at = datetime.now()
            # 计算持续时间
            if inspection.started_at and inspection.completed_at:
                delta = inspection.completed_at - inspection.started_at
                inspection.duration = int(delta.total_seconds())

        # 更新错误信息
        if error_message:
            inspection.error_message = error_message
        if error_details:
            inspection.error_details = error_details

        await self.session.commit()
        return True

    async def update_inspection_progress(
        self,
        inspection_id: int,
        total_checks: int,
        passed_checks: int,
        failed_checks: int,
        warning_checks: int = 0,
        skipped_checks: int = 0,
    ) -> bool:
        """
        更新巡检进度和结果统计

        Args:
            inspection_id: 执行记录ID
            total_checks: 总检查项数
            passed_checks: 通过检查项数
            failed_checks: 失败检查项数
            warning_checks: 警告检查项数
            skipped_checks: 跳过检查项数

        Returns:
            是否更新成功
        """
        inspection = await self.get_execution_by_id(inspection_id)
        if not inspection:
            return False

        inspection.total_checks = total_checks
        inspection.passed_checks = passed_checks
        inspection.failed_checks = failed_checks
        inspection.warning_checks = warning_checks
        inspection.skipped_checks = skipped_checks
        inspection.updated_at = datetime.now()

        await self.session.commit()
        return True

    async def save_inspection_result(
        self,
        inspection_id: int,
        check_item_name: str,
        check_item_type: str,
        status: CheckItemStatus,
        expected_value: Optional[str] = None,
        actual_value: Optional[str] = None,
        message: Optional[str] = None,
        description: Optional[str] = None,
        execution_time: Optional[int] = None,
        error_details: Optional[Dict] = None,
    ) -> InspectionResult:
        """
        保存巡检检查结果

        Args:
            inspection_id: 执行记录ID
            check_item_name: 检查项名称
            check_item_type: 检查项类型
            status: 检查状态
            expected_value: 期望值
            actual_value: 实际值
            message: 消息
            description: 描述
            execution_time: 执行时间（毫秒）
            error_details: 错误详情

        Returns:
            检查结果对象
        """
        result = InspectionResult(
            inspection_id=inspection_id,
            check_item_name=check_item_name,
            check_item_type=check_item_type,
            description=description,
            status=status,
            expected_value=expected_value,
            actual_value=actual_value,
            message=message,
            execution_time=execution_time,
            error_details=error_details,
            created_at=datetime.now(),
        )

        self.session.add(result)
        await self.session.commit()
        await self.session.refresh(result)

        return result

    async def cancel_inspection(self, inspection_id: int) -> bool:
        """
        取消巡检执行

        Args:
            inspection_id: 执行记录ID

        Returns:
            是否取消成功
        """
        return await self.update_inspection_status(
            inspection_id,
            InspectionStatus.CANCELLED,
            error_message="用户手动取消",
        )

    # ==================== 统计查询 ====================

    async def get_execution_statistics(
        self,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """
        获取执行记录统计信息

        Args:
            start_date: 开始日期
            end_date: 结束日期

        Returns:
            统计信息字典
        """
        # 构建基础查询条件
        filters = []
        if start_date:
            filters.append(Inspection.started_at >= start_date)
        if end_date:
            filters.append(Inspection.started_at < end_date)

        # 总执行数
        total_query = select(func.count(Inspection.id))
        if filters:
            total_query = total_query.where(and_(*filters))
        total_result = await self.session.execute(total_query)
        total_executions = total_result.scalar()

        # 按状态统计
        status_stats = {}
        for status in InspectionStatus:
            status_query = select(func.count(Inspection.id)).where(
                Inspection.status == status.value
            )
            if filters:
                status_query = status_query.where(and_(*filters))
            status_result = await self.session.execute(status_query)
            status_stats[status.value] = status_result.scalar()

        # 平均评分
        avg_score_query = select(
            func.avg(
                func.cast(Inspection.passed_checks, sa.Float)
                / func.nullif(Inspection.total_checks, 0)
                * 100
            )
        ).where(
            and_(
                Inspection.status == InspectionStatus.COMPLETED.value,
                Inspection.total_checks > 0,
                *filters
            )
        )
        avg_score_result = await self.session.execute(avg_score_query)
        avg_score = avg_score_result.scalar() or 0.0

        return {
            "total_executions": total_executions,
            "running": status_stats.get("running", 0),
            "completed": status_stats.get("completed", 0),
            "failed": status_stats.get("failed", 0),
            "cancelled": status_stats.get("cancelled", 0),
            "pending": status_stats.get("pending", 0),
            "avg_score": round(avg_score, 2),
        }

    async def get_stats_summary(
        self,
        start_date: datetime,
        end_date: datetime
    ) -> Dict[str, Any]:
        """
        获取统计摘要数据（用于统计分析页面）

        Args:
            start_date: 开始日期
            end_date: 结束日期

        Returns:
            统计摘要字典，包含总执行次数、成功次数、成功率、平均评分
        """
        # 查询总执行次数
        total_query = select(func.count(Inspection.id)).where(
            Inspection.created_at >= start_date,
            Inspection.created_at <= end_date
        )
        total_result = await self.session.execute(total_query)
        total = total_result.scalar() or 0

        # 查询成功执行次数
        success_query = select(func.count(Inspection.id)).where(
            Inspection.created_at >= start_date,
            Inspection.created_at <= end_date,
            Inspection.status == InspectionStatus.COMPLETED.value
        )
        success_result = await self.session.execute(success_query)
        success = success_result.scalar() or 0

        # 计算平均评分（只统计已完成的巡检）
        avg_score_query = select(
            func.avg(
                func.cast(Inspection.passed_checks, sa.Float) /
                func.nullif(Inspection.total_checks, 0) * 100
            )
        ).where(
            Inspection.created_at >= start_date,
            Inspection.created_at <= end_date,
            Inspection.status == InspectionStatus.COMPLETED.value,
            Inspection.total_checks > 0
        )
        avg_score_result = await self.session.execute(avg_score_query)
        avg_score = avg_score_result.scalar() or 0.0

        return {
            "total_executions": total,
            "successful_executions": success,
            "success_rate": round((success / total * 100) if total > 0 else 0.0, 1),
            "avg_score": round(float(avg_score), 1)
        }

    async def get_trend_data(
        self,
        period: str,  # 'day' | 'week' | 'month'
        start_date: datetime,
        end_date: datetime
    ) -> List[Dict[str, Any]]:
        """
        获取趋势数据（按日期聚合）

        Args:
            period: 时间周期（day/week/month）
            start_date: 开始日期
            end_date: 结束日期

        Returns:
            趋势数据列表，每个元素包含date, executions, success, failed, avgScore
        """
        # 根据周期选择分组函数
        if period == 'day':
            # 按天分组
            date_group = func.date(Inspection.created_at).label('date')
        elif period == 'week':
            # 按周分组（PostgreSQL用date_trunc，其他数据库可能需要调整）
            date_group = func.date_trunc('week', Inspection.created_at).label('date')
        else:  # month
            # 按月分组
            date_group = func.date_trunc('month', Inspection.created_at).label('date')

        # 使用case表达式统计成功和失败次数
        from sqlalchemy import case

        query = select(
            date_group,
            func.count(Inspection.id).label('executions'),
            func.sum(
                case((Inspection.status == InspectionStatus.COMPLETED.value, 1), else_=0)
            ).label('success'),
            func.sum(
                case((Inspection.status == InspectionStatus.FAILED.value, 1), else_=0)
            ).label('failed'),
            func.avg(
                func.cast(Inspection.passed_checks, sa.Float) /
                func.nullif(Inspection.total_checks, 0) * 100
            ).label('avg_score')
        ).where(
            Inspection.created_at >= start_date,
            Inspection.created_at <= end_date
        ).group_by(date_group).order_by(date_group)

        result = await self.session.execute(query)
        rows = result.all()

        return [
            {
                "date": row.date.isoformat() if hasattr(row.date, 'isoformat') else str(row.date),
                "executions": int(row.executions or 0),
                "success": int(row.success or 0),
                "failed": int(row.failed or 0),
                "avgScore": round(float(row.avg_score or 0), 1)
            }
            for row in rows
        ]

    async def get_problem_category_distribution(self) -> List[Dict[str, Any]]:
        """
        获取问题分类分布统计

        Returns:
            问题分类列表，每个元素包含category和count
        """
        # 查询失败和警告的检查结果，按检查项类型分组统计
        query = select(
            InspectionResult.check_item_type.label('category'),
            func.count(InspectionResult.id).label('count')
        ).where(
            or_(
                InspectionResult.status == CheckItemStatus.FAIL.value,
                InspectionResult.status == CheckItemStatus.WARNING.value
            )
        ).group_by(
            InspectionResult.check_item_type
        ).order_by(
            desc(func.count(InspectionResult.id))
        )

        result = await self.session.execute(query)
        rows = result.all()

        # 名称映射（将英文检查项类型转为中文）
        category_names = {
            "connectivity": "网络连通性",
            "cpu_usage": "CPU使用率",
            "memory_usage": "内存使用率",
            "disk_usage": "磁盘空间",
            "interface_status": "端口状态",
            "temperature": "温度告警",
            "snmp": "SNMP检查",
            "ssh": "SSH检查",
            "http": "HTTP检查",
            "ping": "Ping检查",
            "script": "脚本检查"
        }

        return [
            {
                "category": category_names.get(row.category, row.category or "其他"),
                "count": int(row.count or 0)
            }
            for row in rows
        ]

    # ==================== 模板和策略查询 ====================

    async def get_template_by_id(self, template_id: int) -> Optional[InspectionTemplate]:
        """根据ID获取巡检模板"""
        query = select(InspectionTemplate).where(InspectionTemplate.id == template_id)
        result = await self.session.execute(query)
        return result.scalar_one_or_none()

    async def get_strategy_by_id(self, strategy_id: int) -> Optional[InspectionStrategy]:
        """根据ID获取巡检策略"""
        query = select(InspectionStrategy).where(InspectionStrategy.id == strategy_id)
        result = await self.session.execute(query)
        return result.scalar_one_or_none()


# 工厂函数
async def get_inspection_repository(session: AsyncSession = None) -> InspectionRepository:
    """获取巡检仓储实例"""
    if session is None:
        async with get_db_session_context() as db_session:
            return InspectionRepository(db_session)
    else:
        return InspectionRepository(session)
