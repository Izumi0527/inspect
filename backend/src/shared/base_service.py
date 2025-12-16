"""
基础Service类 - 提供通用的业务逻辑方法
"""
from typing import TypeVar, Generic, Type, Optional, List, Any, Tuple
import structlog

from src.shared.base_repository import BaseRepository
from src.shared.exceptions import NotFoundException, ValidationException

T = TypeVar("T")
R = TypeVar("R", bound=BaseRepository)

logger = structlog.get_logger()


class BaseService(Generic[T, R]):
    """
    基础Service类
    
    提供通用的业务逻辑操作，包括CRUD和分页查询
    
    Usage:
        class DeviceService(BaseService[Device, DeviceRepository]):
            def __init__(self, repository: DeviceRepository):
                super().__init__(repository, "设备")
    """
    
    def __init__(self, repository: R, entity_name: str = "实体"):
        self.repository = repository
        self.entity_name = entity_name
    
    async def get_by_id(self, id: Any) -> T:
        """
        根据ID获取实体
        
        Raises:
            NotFoundException: 实体不存在时抛出
        """
        entity = await self.repository.get_by_id(id)
        if not entity:
            raise NotFoundException(f"{self.entity_name}不存在", entity_id=id)
        return entity
    
    async def get_by_id_optional(self, id: Any) -> Optional[T]:
        """根据ID获取实体（可选，不抛异常）"""
        return await self.repository.get_by_id(id)
    
    async def get_all(self, limit: int = 100) -> List[T]:
        """获取所有实体"""
        return await self.repository.get_all(limit)
    
    async def get_paginated(
        self,
        page: int = 1,
        page_size: int = 20,
        filters: Optional[List] = None,
        order_by: Optional[str] = None,
        order_desc: bool = True
    ) -> Tuple[List[T], int]:
        """分页查询"""
        return await self.repository.get_paginated(
            page=page,
            page_size=page_size,
            filters=filters,
            order_by=order_by,
            order_desc=order_desc
        )
    
    async def create(self, entity: T) -> T:
        """创建实体"""
        created = await self.repository.create(entity)
        logger.info(f"{self.entity_name}创建成功", entity_id=getattr(created, 'id', None))
        return created
    
    async def update(self, entity: T) -> T:
        """更新实体"""
        updated = await self.repository.update(entity)
        logger.info(f"{self.entity_name}更新成功", entity_id=getattr(updated, 'id', None))
        return updated
    
    async def delete(self, id: Any) -> bool:
        """删除实体"""
        entity = await self.get_by_id(id)  # 确保存在
        result = await self.repository.delete(entity)
        if result:
            logger.info(f"{self.entity_name}删除成功", entity_id=id)
        return result
    
    async def exists(self, id: Any) -> bool:
        """检查实体是否存在"""
        return await self.repository.exists(id)
    
    async def count(self, filters: Optional[List] = None) -> int:
        """统计数量"""
        return await self.repository.count(filters)
    
    def validate(self, data: dict, required_fields: List[str]) -> None:
        """
        验证数据
        
        Args:
            data: 待验证数据
            required_fields: 必填字段列表
            
        Raises:
            ValidationException: 验证失败时抛出
        """
        missing_fields = [f for f in required_fields if not data.get(f)]
        if missing_fields:
            raise ValidationException(
                f"缺少必填字段: {', '.join(missing_fields)}",
                fields=missing_fields
            )
