from typing import List, Optional, Dict, Any, Tuple
from datetime import datetime
from sqlalchemy import and_, or_, desc, asc, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select

from ..models.inspection import InspectionTemplate


class TemplateRepository:
    """巡检模板数据访问层"""

    def __init__(self, session: AsyncSession):
        self.session = session

    # ==================== 基础操作 ====================

    async def get_by_id(self, template_id: int) -> Optional[InspectionTemplate]:
        """根据ID获取模板"""
        query = select(InspectionTemplate).where(InspectionTemplate.id == template_id)
        result = await self.session.execute(query)
        return result.scalar_one_or_none()

    async def get_by_name(self, name: str) -> Optional[InspectionTemplate]:
        """根据名称获取模板"""
        query = select(InspectionTemplate).where(InspectionTemplate.name == name)
        result = await self.session.execute(query)
        return result.scalar_one_or_none()

    async def check_name_exists(self, name: str, exclude_id: Optional[int] = None) -> bool:
        """检查模板名称是否已存在"""
        query = select(InspectionTemplate.id).where(InspectionTemplate.name == name)
        if exclude_id:
            query = query.where(InspectionTemplate.id != exclude_id)
        result = await self.session.execute(query)
        return result.scalar_one_or_none() is not None

    async def create(self, template_data: dict) -> InspectionTemplate:
        """创建巡检模板"""
        template = InspectionTemplate(
            name=template_data["name"],
            description=template_data.get("description", ""),
            category=template_data.get("category", "custom"),
            device_types=template_data.get("device_types", []),
            check_items=template_data.get("check_items", []),
            is_default=template_data.get("is_default", False),
            is_active=template_data.get("is_active", True),
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )

        self.session.add(template)
        await self.session.commit()
        await self.session.refresh(template)

        return template

    async def update(self, template_id: int, template_data: dict) -> Optional[InspectionTemplate]:
        """更新巡检模板"""
        template = await self.get_by_id(template_id)
        if not template:
            return None

        # 更新字段
        for key, value in template_data.items():
            if hasattr(template, key) and value is not None:
                setattr(template, key, value)

        template.updated_at = datetime.utcnow()

        await self.session.commit()
        await self.session.refresh(template)

        return template

    async def delete(self, template_id: int) -> bool:
        """删除巡检模板"""
        template = await self.get_by_id(template_id)
        if not template:
            return False

        await self.session.delete(template)
        await self.session.commit()

        return True

    async def toggle_active(self, template_id: int, is_active: bool) -> Optional[InspectionTemplate]:
        """切换模板启用状态"""
        template = await self.get_by_id(template_id)
        if not template:
            return None

        template.is_active = is_active
        template.updated_at = datetime.utcnow()

        await self.session.commit()
        await self.session.refresh(template)

        return template

    # ==================== 查询操作 ====================

    async def list_templates(
        self,
        page: int = 1,
        page_size: int = 10,
        filters: Optional[Dict[str, Any]] = None,
        order_by: str = "created_at",
        order_direction: str = "desc"
    ) -> Tuple[List[InspectionTemplate], int]:
        """分页查询模板列表"""
        query = select(InspectionTemplate)

        # 应用筛选条件
        if filters:
            if "device_type" in filters and filters["device_type"]:
                # 使用 JSON 包含查询
                query = query.where(
                    InspectionTemplate.device_types.contains([filters["device_type"]])
                )
            if "is_active" in filters:
                query = query.where(InspectionTemplate.is_active == filters["is_active"])
            if "is_default" in filters:
                query = query.where(InspectionTemplate.is_default == filters["is_default"])
            if "search" in filters and filters["search"]:
                search_term = f"%{filters['search']}%"
                query = query.where(
                    or_(
                        InspectionTemplate.name.ilike(search_term),
                        InspectionTemplate.description.ilike(search_term)
                    )
                )

        # 获取总数
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await self.session.execute(count_query)
        total = total_result.scalar()

        # 应用排序
        order_column = getattr(InspectionTemplate, order_by, InspectionTemplate.created_at)
        if order_direction == "desc":
            query = query.order_by(desc(order_column))
        else:
            query = query.order_by(asc(order_column))

        # 应用分页
        query = query.offset((page - 1) * page_size).limit(page_size)

        # 执行查询
        result = await self.session.execute(query)
        templates = result.scalars().all()

        return list(templates), total

    async def get_active_templates(self) -> List[InspectionTemplate]:
        """获取所有启用的模板"""
        query = select(InspectionTemplate).where(
            InspectionTemplate.is_active == True
        ).order_by(InspectionTemplate.created_at)

        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def get_default_templates(self) -> List[InspectionTemplate]:
        """获取所有默认模板"""
        query = select(InspectionTemplate).where(
            InspectionTemplate.is_default == True
        ).order_by(InspectionTemplate.created_at)

        result = await self.session.execute(query)
        return list(result.scalars().all())

    async def get_templates_by_device_type(self, device_type: str) -> List[InspectionTemplate]:
        """根据设备类型获取模板"""
        query = select(InspectionTemplate).where(
            and_(
                InspectionTemplate.device_types.contains([device_type]),
                InspectionTemplate.is_active == True
            )
        ).order_by(InspectionTemplate.created_at)

        result = await self.session.execute(query)
        return list(result.scalars().all())
