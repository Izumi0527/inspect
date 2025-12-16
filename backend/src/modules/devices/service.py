"""
设备管理模块 - 业务逻辑层
"""
from typing import Optional, List, Dict, Any, Tuple
from datetime import datetime
import structlog

from sqlalchemy.ext.asyncio import AsyncSession

from src.shared.exceptions import NotFoundException, ValidationException, ConflictException
from src.modules.devices.repository import DeviceRepository
from src.modules.devices.schemas import DeviceCreate, DeviceUpdate, DeviceResponse
from src.infrastructure.cache import cache_service

logger = structlog.get_logger()


class DeviceService:
    """设备管理服务"""
    
    def __init__(self, session: AsyncSession):
        self.session = session
        self.repository = DeviceRepository(session)
    
    async def get_device_by_id(self, device_id: int) -> DeviceResponse:
        """
        根据ID获取设备
        
        Raises:
            NotFoundException: 设备不存在
        """
        device = await self.repository.get_device_by_id(device_id)
        if not device:
            raise NotFoundException(f"设备不存在", entity_id=device_id)
        return DeviceResponse.model_validate(device)
    
    async def get_device_by_ip(self, ip_address: str) -> Optional[DeviceResponse]:
        """根据IP地址获取设备"""
        device = await self.repository.get_device_by_ip(ip_address)
        if device:
            return DeviceResponse.model_validate(device)
        return None
    
    async def get_devices_paginated(
        self,
        page: int = 1,
        page_size: int = 20,
        device_type: Optional[str] = None,
        status: Optional[str] = None,
        group_id: Optional[int] = None,
        search: Optional[str] = None,
        is_active: Optional[bool] = None
    ) -> Tuple[List[DeviceResponse], int]:
        """
        分页获取设备列表
        
        Returns:
            (设备列表, 总数)
        """
        devices, total = await self.repository.get_devices_paginated(
            page=page,
            page_size=page_size,
            device_type=device_type,
            status=status,
            group_id=group_id,
            search=search,
            is_active=is_active
        )
        
        device_responses = [DeviceResponse.model_validate(d) for d in devices]
        return device_responses, total
    
    async def create_device(self, device_data: DeviceCreate, created_by: str) -> DeviceResponse:
        """
        创建设备
        
        Raises:
            ConflictException: IP地址已存在
        """
        # 检查IP地址是否已存在
        if await self.repository.check_ip_exists(device_data.ip_address):
            raise ConflictException(f"IP地址 {device_data.ip_address} 已存在")
        
        # 创建设备
        device = await self.repository.create_device(
            device_data.model_dump(),
            created_by
        )
        
        # 清除缓存
        await cache_service.invalidate_active_devices()
        
        logger.info("Device created", 
                   device_id=device.id, 
                   ip_address=device_data.ip_address,
                   created_by=created_by)
        
        return DeviceResponse.model_validate(device)
    
    async def update_device(self, device_id: int, device_data: DeviceUpdate) -> DeviceResponse:
        """
        更新设备
        
        Raises:
            NotFoundException: 设备不存在
            ConflictException: IP地址冲突
        """
        # 检查设备是否存在
        existing = await self.repository.get_device_by_id(device_id)
        if not existing:
            raise NotFoundException(f"设备不存在", entity_id=device_id)
        
        # 检查IP地址冲突
        if device_data.ip_address:
            if await self.repository.check_ip_exists(device_data.ip_address, device_id):
                raise ConflictException(f"IP地址 {device_data.ip_address} 已存在")
        
        # 更新设备
        update_data = device_data.model_dump(exclude_unset=True)
        device = await self.repository.update_device(device_id, update_data)
        
        # 清除缓存
        await cache_service.clear_device_related_cache(device_id)
        
        logger.info("Device updated", device_id=device_id, fields=list(update_data.keys()))
        
        return DeviceResponse.model_validate(device)
    
    async def delete_device(self, device_id: int) -> bool:
        """
        删除设备
        
        Raises:
            NotFoundException: 设备不存在
        """
        # 检查设备是否存在
        existing = await self.repository.get_device_by_id(device_id)
        if not existing:
            raise NotFoundException(f"设备不存在", entity_id=device_id)
        
        # 删除设备
        success = await self.repository.delete_device(device_id)
        
        if success:
            # 清除缓存
            await cache_service.clear_device_related_cache(device_id)
            logger.info("Device deleted", device_id=device_id)
        
        return success
    
    async def get_device_groups(self) -> List[Dict[str, Any]]:
        """获取设备组列表"""
        groups = await self.repository.get_device_groups()
        return [
            {
                "id": g.id,
                "name": g.name,
                "description": g.description,
                "device_count": getattr(g, 'device_count', 0),
                "created_at": g.created_at
            }
            for g in groups
        ]
    
    async def get_device_statistics(self) -> Dict[str, Any]:
        """获取设备统计信息"""
        return await self.repository.get_device_statistics()
    
    async def batch_create_devices(
        self,
        devices: List[DeviceCreate],
        created_by: str,
        skip_duplicates: bool = True
    ) -> Tuple[List[DeviceResponse], List[Dict[str, str]]]:
        """
        批量创建设备
        
        Returns:
            (成功创建的设备列表, 跳过的设备列表)
        """
        imported = []
        skipped = []
        
        for device_data in devices:
            try:
                # 检查IP是否已存在
                if skip_duplicates and await self.repository.check_ip_exists(device_data.ip_address):
                    skipped.append({
                        "ip_address": device_data.ip_address,
                        "reason": "设备已存在"
                    })
                    continue
                
                # 创建设备
                device = await self.repository.create_device(
                    device_data.model_dump(),
                    created_by
                )
                imported.append(DeviceResponse.model_validate(device))
                
            except Exception as e:
                skipped.append({
                    "ip_address": device_data.ip_address,
                    "reason": f"导入失败: {str(e)}"
                })
        
        # 清除缓存
        if imported:
            await cache_service.invalidate_active_devices()
        
        logger.info("Batch devices created",
                   imported_count=len(imported),
                   skipped_count=len(skipped),
                   created_by=created_by)
        
        return imported, skipped


async def get_device_service(session: AsyncSession) -> DeviceService:
    """获取设备服务实例"""
    return DeviceService(session)
