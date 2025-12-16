"""
基础Repository类 - 提供通用的数据访问方法
"""
from typing import TypeVar, Generic, Type, Optional, List, Dict, Any, Tuple
from datetime import datetime
from sqlalchemy import select, func, and_, or_, desc, asc
from sqlalchemy.ext.asyncio import AsyncSession

T = TypeVar("T")


class BaseRepository(Generic[T]):
    """
    基础Repository类
    
    提供通用的CRUD操作和分页查询功能
    
    Usage:
        class DeviceRepository(BaseRepository[Device]):
            def __init__(self, session: AsyncSession):
                super().__init__(session, Device)
    """
    
    def __init__(self, session: AsyncSession, model_class: Type[T]):
        self.session = session
        self.model_class = model_class
    
    async def get_by_id(self, id: Any) -> Optional[T]:
        """根据ID获取单个实体"""
        query = select(self.model_class).where(self.model_class.id == id)
        result = await self.session.execute(query)
        return result.scalar_one_or_none()
    
    async def get_all(self, limit: int = 100) -> List[T]:
        """获取所有实体（带限制）"""
        query = select(self.model_class).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def get_paginated(
        self,
        page: int = 1,
        page_size: int = 20,
        filters: Optional[List] = None,
        order_by: Optional[str] = None,
        order_desc: bool = True
    ) -> Tuple[List[T], int]:
        """
        分页查询
        
        Args:
            page: 页码（从1开始）
            page_size: 每页数量
            filters: SQLAlchemy过滤条件列表
            order_by: 排序字段名
            order_desc: 是否降序
            
        Returns:
            (实体列表, 总数)
        """
        # 构建基础查询
        query = select(self.model_class)
        count_query = select(func.count(self.model_class.id))
        
        # 应用过滤条件
        if filters:
            query = query.where(and_(*filters))
            count_query = count_query.where(and_(*filters))
        
        # 排序
        if order_by and hasattr(self.model_class, order_by):
            order_column = getattr(self.model_class, order_by)
            query = query.order_by(desc(order_column) if order_desc else asc(order_column))
        elif hasattr(self.model_class, 'created_at'):
            query = query.order_by(desc(self.model_class.created_at))
        
        # 分页
        offset = (page - 1) * page_size
        query = query.offset(offset).limit(page_size)
        
        # 执行查询
        result = await self.session.execute(query)
        items = list(result.scalars().all())
        
        count_result = await self.session.execute(count_query)
        total = count_result.scalar() or 0
        
        return items, total
    
    async def create(self, entity: T) -> T:
        """创建实体"""
        self.session.add(entity)
        await self.session.commit()
        await self.session.refresh(entity)
        return entity
    
    async def create_many(self, entities: List[T]) -> List[T]:
        """批量创建实体"""
        self.session.add_all(entities)
        await self.session.commit()
        for entity in entities:
            await self.session.refresh(entity)
        return entities
    
    async def update(self, entity: T) -> T:
        """更新实体"""
        if hasattr(entity, 'updated_at'):
            entity.updated_at = datetime.utcnow()
        await self.session.commit()
        await self.session.refresh(entity)
        return entity
    
    async def delete(self, entity: T) -> bool:
        """删除实体"""
        await self.session.delete(entity)
        await self.session.commit()
        return True
    
    async def delete_by_id(self, id: Any) -> bool:
        """根据ID删除实体"""
        entity = await self.get_by_id(id)
        if entity:
            return await self.delete(entity)
        return False
    
    async def exists(self, id: Any) -> bool:
        """检查实体是否存在"""
        query = select(func.count(self.model_class.id)).where(self.model_class.id == id)
        result = await self.session.execute(query)
        return (result.scalar() or 0) > 0
    
    async def count(self, filters: Optional[List] = None) -> int:
        """统计数量"""
        query = select(func.count(self.model_class.id))
        if filters:
            query = query.where(and_(*filters))
        result = await self.session.execute(query)
        return result.scalar() or 0
