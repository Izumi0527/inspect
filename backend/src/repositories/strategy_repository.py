from typing import List, Optional, Dict, Any, Tuple
from datetime import datetime
from sqlalchemy import and_, or_, desc, asc, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ..models.inspection import InspectionStrategy, StrategyType


class StrategyRepository:
    """巡检策略数据访问层"""

    def __init__(self, session: AsyncSession):
        self.session = session

    # ==================== 基础操作 ====================

    async def get_by_id(self, strategy_id: int) -> Optional[InspectionStrategy]:
        """根据ID获取策略"""
        query = select(InspectionStrategy).where(InspectionStrategy.id == strategy_id)
        result = await self.session.execute(query)
        return result.scalar_one_or_none()

    async def get_by_name(self, name: str) -> Optional[InspectionStrategy]:
        """根据名称获取策略"""
        query = select(InspectionStrategy).where(InspectionStrategy.name == name)
        result = await self.session.execute(query)
        return result.scalar_one_or_none()

    async def check_name_exists(self, name: str, exclude_id: Optional[int] = None) -> bool:
        """检查策略名称是否已存在"""
        query = select(InspectionStrategy.id).where(InspectionStrategy.name == name)
        if exclude_id:
            query = query.where(InspectionStrategy.id != exclude_id)
        result = await self.session.execute(query)
        return result.scalar_one_or_none() is not None

    async def create(self, strategy_data: dict) -> InspectionStrategy:
        """创建巡检策略"""
        strategy = InspectionStrategy(
            name=strategy_data["name"],
            description=strategy_data.get("description", ""),
            type=StrategyType(strategy_data["type"]),
            cron=strategy_data.get("cron"),
            devices=strategy_data.get("devices", []),
            templates=strategy_data.get("templates", []),
            enabled=strategy_data.get("enabled", True),
            next_run_time=strategy_data.get("next_run_time"),
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )

        self.session.add(strategy)
        await self.session.commit()
        await self.session.refresh(strategy)

        return strategy

    async def update(self, strategy_id: int, strategy_data: dict) -> Optional[InspectionStrategy]:
        """更新巡检策略"""
        strategy = await self.get_by_id(strategy_id)
        if not strategy:
            return None

        # 更新字段
        for key, value in strategy_data.items():
            if hasattr(strategy, key) and value is not None:
                # 特殊处理 type 字段
                if key == "type":
                    setattr(strategy, key, StrategyType(value))
                else:
                    setattr(strategy, key, value)

        strategy.updated_at = datetime.utcnow()

        await self.session.commit()
        await self.session.refresh(strategy)

        return strategy

    async def delete(self, strategy_id: int) -> bool:
        """删除巡检策略"""
        strategy = await self.get_by_id(strategy_id)
        if not strategy:
            return False

        await self.session.delete(strategy)
        await self.session.commit()

        return True

    async def toggle_enabled(self, strategy_id: int, enabled: bool) -> Optional[InspectionStrategy]:
        """切换策略启用状态"""
        strategy = await self.get_by_id(strategy_id)
        if not strategy:
            return None

        strategy.enabled = enabled
        strategy.updated_at = datetime.utcnow()

        await self.session.commit()
        await self.session.refresh(strategy)

        return strategy

    # ==================== 查询操作 ====================

    async def list_strategies(
        self,
        page: int = 1,
        page_size: int = 10,
        filters: Optional[Dict[str, Any]] = None,
        order_by: str = "created_at",
        order_direction: str = "desc"
    ) -> Tuple[List[InspectionStrategy], int]:
        """分页查询策略列表"""
        query = select(InspectionStrategy)

        # 应用筛选条件
        if filters:
            if "type" in filters:
                query = query.where(InspectionStrategy.type == StrategyType(filters["type"]))
            if "enabled" in filters:
                query = query.where(InspectionStrategy.enabled == filters["enabled"])
            if "search" in filters and filters["search"]:
                search_term = f"%{filters['search']}%"
                query = query.where(
                    or_(
                        InspectionStrategy.name.ilike(search_term),
                        InspectionStrategy.description.ilike(search_term)
                    )
                )

        # 获取总数
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await self.session.execute(count_query)
        total = total_result.scalar()

        # 应用排序
        order_column = getattr(InspectionStrategy, order_by, InspectionStrategy.created_at)
        if order_direction == "desc":
            query = query.order_by(desc(order_column))
        else:
            query = query.order_by(asc(order_column))

        # 应用分页
        query = query.offset((page - 1) * page_size).limit(page_size)

        # 执行查询
        result = await self.session.execute(query)
        strategies = result.scalars().all()

        return list(strategies), total

    async def get_enabled_strategies(self) -> List[InspectionStrategy]:
        """获取所有启用的策略"""
        query = select(InspectionStrategy).where(
            InspectionStrategy.enabled == True
        ).order_by(InspectionStrategy.created_at)

        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def get_scheduled_strategies(self) -> List[InspectionStrategy]:
        """获取所有定时策略"""
        query = select(InspectionStrategy).where(
            and_(
                InspectionStrategy.type == StrategyType.SCHEDULED,
                InspectionStrategy.enabled == True
            )
        ).order_by(InspectionStrategy.next_run_time)

        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def update_run_time(
        self,
        strategy_id: int,
        last_run_time: Optional[datetime] = None,
        next_run_time: Optional[datetime] = None
    ) -> Optional[InspectionStrategy]:
        """更新策略执行时间"""
        strategy = await self.get_by_id(strategy_id)
        if not strategy:
            return None

        if last_run_time is not None:
            strategy.last_run_time = last_run_time
        if next_run_time is not None:
            strategy.next_run_time = next_run_time

        strategy.updated_at = datetime.utcnow()

        await self.session.commit()
        await self.session.refresh(strategy)

        return strategy

    # ==================== 统计操作 ====================

    async def get_strategy_statistics(self) -> Dict[str, Any]:
        """
        获取策略统计信息（用于统计分析页面）

        Returns:
            策略统计字典，包含总策略数、活跃策略数
        """
        # 查询总策略数
        total_query = select(func.count(InspectionStrategy.id))
        total_result = await self.session.execute(total_query)
        total_strategies = total_result.scalar() or 0

        # 查询活跃策略数
        active_query = select(func.count(InspectionStrategy.id)).where(
            InspectionStrategy.enabled == True
        )
        active_result = await self.session.execute(active_query)
        active_strategies = active_result.scalar() or 0

        return {
            "total_strategies": total_strategies,
            "active_strategies": active_strategies
        }
