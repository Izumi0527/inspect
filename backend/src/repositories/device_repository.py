from typing import List, Optional, Dict, Any, Tuple
from datetime import datetime
from sqlalchemy import and_, or_, desc, asc, func, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.future import select

from ..models.device import Device, DeviceGroup, DeviceInterface, DeviceMetric, NetworkScan, DiscoveredDevice
from ..models.device import DeviceType, DeviceVendor, DeviceStatus
from ..models.user import User
from ..core.database import get_db_session_context


class DeviceRepository:
    """设备数据访问层"""
    
    def __init__(self, session: AsyncSession):
        self.session = session
    
    # ==================== 设备基础操作 ====================
    
    async def get_device_by_id(self, device_id: int) -> Optional[Device]:
        """根据ID获取设备"""
        query = select(Device).where(Device.id == device_id)
        result = await self.session.execute(query)
        return result.scalar_one_or_none()
    
    async def get_device_by_ip(self, ip_address: str) -> Optional[Device]:
        """根据IP地址获取设备"""
        query = select(Device).where(Device.ip_address == ip_address)
        result = await self.session.execute(query)
        return result.scalar_one_or_none()
    
    async def check_ip_exists(self, ip_address: str, exclude_device_id: Optional[int] = None) -> bool:
        """检查IP地址是否存在"""
        query = select(Device.id).where(Device.ip_address == ip_address)
        if exclude_device_id:
            query = query.where(Device.id != exclude_device_id)
        result = await self.session.execute(query)
        return result.scalar_one_or_none() is not None
    
    async def create_device(self, device_data: dict, created_by: str) -> Device:
        """创建设备"""
        creator_id = None
        if created_by:
            existing_user = await self.session.get(User, created_by)
            if existing_user:
                creator_id = created_by

        device = Device(
            name=device_data["name"],
            ip_address=device_data["ip_address"],
            device_type=device_data["device_type"],
            vendor=device_data["vendor"],
            model=device_data.get("model"),
            location=device_data.get("location"),
            group_id=device_data.get("group_id"),
            snmp_community=device_data.get("snmp_community", "public"),
            snmp_version=device_data.get("snmp_version", "2c"),
            ssh_username=device_data.get("ssh_username"),
            ssh_password=device_data.get("ssh_password"),
            description=device_data.get("description"),
            status=DeviceStatus.UNKNOWN,
            is_active=True,
            created_by=creator_id,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        
        self.session.add(device)
        await self.session.commit()
        await self.session.refresh(device)
        
        return device
    
    async def update_device(self, device_id: int, device_data: dict) -> Optional[Device]:
        """更新设备信息"""
        device = await self.get_device_by_id(device_id)
        if not device:
            return None
        
        # 更新字段
        for key, value in device_data.items():
            if hasattr(device, key) and value is not None:
                setattr(device, key, value)
        
        device.updated_at = datetime.utcnow()
        
        await self.session.commit()
        await self.session.refresh(device)
        
        return device
    
    async def delete_device(self, device_id: int) -> bool:
        """删除设备"""
        device = await self.get_device_by_id(device_id)
        if not device:
            return False
        
        await self.session.delete(device)
        await self.session.commit()
        return True
    
    async def get_devices_paginated(
        self,
        skip: int = 0,
        limit: int = 10,
        device_type: Optional[str] = None,
        status: Optional[str] = None,
        group_id: Optional[int] = None,
        search: Optional[str] = None,
        # 支持新的参数命名（用于监控服务）
        page: Optional[int] = None,
        page_size: Optional[int] = None,
        is_active: Optional[bool] = None
    ) -> Tuple[List[Device], int]:
        """分页获取设备列表"""
        
        # 参数转换：支持新的命名约定
        if page is not None and page_size is not None:
            skip = (page - 1) * page_size
            limit = page_size
        
        # 构建基础查询
        query = select(Device)
        count_query = select(func.count(Device.id))
        
        # 构建过滤条件
        filters = []
        
        if device_type:
            filters.append(Device.device_type == device_type)
        if status:
            filters.append(Device.status == status)
        if group_id:
            filters.append(Device.group_id == group_id)
        if is_active is not None:
            filters.append(Device.is_active == is_active)
        if search:
            search_term = f"%{search}%"
            filters.append(
                or_(
                    Device.name.ilike(search_term),
                    Device.ip_address.ilike(search_term),
                    Device.location.ilike(search_term),
                    Device.description.ilike(search_term)
                )
            )
        
        # 应用过滤条件
        if filters:
            query = query.where(and_(*filters))
            count_query = count_query.where(and_(*filters))
        
        # 排序和分页
        query = query.order_by(desc(Device.created_at)).offset(skip).limit(limit)
        
        # 执行查询
        result = await self.session.execute(query)
        devices = result.scalars().all()
        
        count_result = await self.session.execute(count_query)
        total = count_result.scalar()
        
        return list(devices), total
    
    async def update_device_status(self, device_id: int, status: DeviceStatus, last_seen: Optional[datetime] = None) -> bool:
        """更新设备状态"""
        device = await self.get_device_by_id(device_id)
        if not device:
            return False
        
        device.status = status
        if last_seen:
            device.last_seen = last_seen
        device.updated_at = datetime.utcnow()
        
        await self.session.commit()
        return True
    
    # ==================== 设备组操作 ====================
    
    async def get_device_groups(self) -> List[DeviceGroup]:
        """获取所有设备组"""
        query = select(DeviceGroup).order_by(DeviceGroup.name)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def get_group_by_id(self, group_id: int) -> Optional[DeviceGroup]:
        """根据ID获取设备组"""
        query = select(DeviceGroup).where(DeviceGroup.id == group_id)
        result = await self.session.execute(query)
        return result.scalar_one_or_none()
    
    async def create_device_group(self, name: str, description: Optional[str] = None) -> DeviceGroup:
        """创建设备组"""
        group = DeviceGroup(
            name=name,
            description=description,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        
        self.session.add(group)
        await self.session.commit()
        await self.session.refresh(group)
        
        return group
    
    # ==================== 网络扫描操作 ====================
    
    async def create_network_scan(self, scan_data: dict) -> NetworkScan:
        """创建网络扫描记录"""
        scan = NetworkScan(
            scan_id=scan_data["scan_id"],
            target_network=scan_data["target_network"],
            scan_type=scan_data["scan_type"],
            status="running",
            started_at=datetime.utcnow(),
            created_by=scan_data.get("created_by")
        )
        
        self.session.add(scan)
        await self.session.commit()
        await self.session.refresh(scan)
        
        return scan
    
    async def get_scan_by_scan_id(self, scan_id: str) -> Optional[NetworkScan]:
        """根据scan_id获取扫描记录"""
        query = select(NetworkScan).where(NetworkScan.scan_id == scan_id)
        result = await self.session.execute(query)
        return result.scalar_one_or_none()
    
    async def update_scan_status(self, scan_id: str, status: str, error_message: Optional[str] = None) -> bool:
        """更新扫描状态"""
        scan = await self.get_scan_by_scan_id(scan_id)
        if not scan:
            return False
        
        scan.status = status
        if status in ["completed", "failed", "cancelled"]:
            scan.completed_at = datetime.utcnow()
        if error_message:
            scan.error_message = error_message
        
        await self.session.commit()
        return True
    
    async def get_recent_scans(self, limit: int = 20) -> List[NetworkScan]:
        """获取最近的扫描记录"""
        query = select(NetworkScan).order_by(desc(NetworkScan.started_at)).limit(limit)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    # ==================== 发现设备操作 ====================
    
    async def save_discovered_devices(self, scan_id: int, devices: List[dict]) -> List[DiscoveredDevice]:
        """保存扫描发现的设备"""
        discovered_devices = []
        
        for device_data in devices:
            discovered_device = DiscoveredDevice(
                scan_id=scan_id,
                ip_address=device_data["ip_address"],
                hostname=device_data.get("hostname"),
                mac_address=device_data.get("mac_address"),
                vendor=device_data.get("vendor"),
                device_type=device_data.get("device_type"),
                open_ports=device_data.get("open_ports", []),
                services=device_data.get("services", {}),
                response_time=device_data.get("response_time"),
                os_info=device_data.get("os_info"),
                discovered_at=datetime.utcnow()
            )
            
            discovered_devices.append(discovered_device)
        
        self.session.add_all(discovered_devices)
        await self.session.commit()
        
        # 刷新对象
        for device in discovered_devices:
            await self.session.refresh(device)
        
        return discovered_devices
    
    async def get_discovered_devices_by_scan(self, scan_id: int) -> List[DiscoveredDevice]:
        """获取扫描发现的设备"""
        query = select(DiscoveredDevice).where(DiscoveredDevice.scan_id == scan_id)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    # ==================== 统计信息 ====================
    
    async def get_device_statistics(self) -> Dict[str, Any]:
        """获取设备统计信息"""
        # 总设备数
        total_query = select(func.count(Device.id))
        total_result = await self.session.execute(total_query)
        total_devices = total_result.scalar()
        
        # 在线设备数
        online_query = select(func.count(Device.id)).where(Device.status == DeviceStatus.ONLINE)
        online_result = await self.session.execute(online_query)
        online_devices = online_result.scalar()
        
        # 离线设备数
        offline_query = select(func.count(Device.id)).where(Device.status == DeviceStatus.OFFLINE)
        offline_result = await self.session.execute(offline_query)
        offline_devices = offline_result.scalar()
        
        # 按类型统计
        type_query = select(Device.device_type, func.count(Device.id)).group_by(Device.device_type)
        type_result = await self.session.execute(type_query)
        type_stats = {device_type: count for device_type, count in type_result.all()}
        
        return {
            "total_devices": total_devices,
            "online_devices": online_devices,
            "offline_devices": offline_devices,
            "unknown_devices": total_devices - online_devices - offline_devices,
            "type_distribution": type_stats
        }


# 工厂函数
async def get_device_repository(session: AsyncSession = None) -> DeviceRepository:
    """获取设备仓储实例"""
    if session is None:
        async with get_db_session_context() as db_session:
            return DeviceRepository(db_session)
    else:
        return DeviceRepository(session)