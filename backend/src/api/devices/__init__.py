from fastapi import APIRouter, HTTPException, Depends, Query, BackgroundTasks
from pydantic import BaseModel, validator
from typing import Optional, List
from datetime import datetime
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from src.core.permissions import (
    get_current_active_user, 
    require_permission,
    check_permission
)
from src.core.database import get_db_session
from src.repositories.device_repository import DeviceRepository
from src.services.network_scanner import network_scanner, NetworkDevice, ScanResult
from src.api.websocket import ws_notifier  # 导入WebSocket通知器

logger = structlog.get_logger()
router = APIRouter()

# 设备相关数据模型
class DeviceCreate(BaseModel):
    name: str
    ip_address: str
    device_type: str  # router, switch, firewall, server
    vendor: str  # cisco, huawei, h3c, juniper
    model: Optional[str] = None
    location: Optional[str] = None
    group_id: Optional[int] = None
    snmp_community: Optional[str] = "public"
    snmp_version: str = "v2c"  # 接受前端格式：v2c, v3
    ssh_username: Optional[str] = None
    ssh_password: Optional[str] = None
    description: Optional[str] = None

    @validator('snmp_version')
    def convert_snmp_version(cls, v):
        """转换SNMP版本格式以匹配数据库约束"""
        if v == 'v2c':
            return '2c'
        elif v == 'v3':
            return '3'
        elif v == '1':
            return '1'
        return v  # 默认返回原值

class DeviceUpdate(BaseModel):
    name: Optional[str] = None
    ip_address: Optional[str] = None
    device_type: Optional[str] = None
    vendor: Optional[str] = None
    model: Optional[str] = None
    location: Optional[str] = None
    group_id: Optional[int] = None
    snmp_community: Optional[str] = None
    snmp_version: Optional[str] = None
    ssh_username: Optional[str] = None
    ssh_password: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None

class Device(BaseModel):
    id: int
    name: str
    ip_address: str
    device_type: str
    vendor: str
    model: Optional[str] = None
    location: Optional[str] = None
    group_id: Optional[int] = None
    status: str  # online, offline, unknown
    last_seen: Optional[datetime] = None
    is_active: bool = True
    created_by: Optional[int] = None
    created_at: datetime
    updated_at: datetime

class DeviceGroup(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    device_count: int = 0
    created_at: datetime

class DiscoveryRequest(BaseModel):
    network: str  # 192.168.1.0/24
    scan_ports: List[int] = [22, 23, 80, 161, 443]
    snmp_communities: List[str] = ["public", "private"]

class NetworkScanRequest(BaseModel):
    target_network: str
    scan_type: str = "ping"  # ping, tcp, full
    port_scan: bool = False
    snmp_scan: bool = False
    deep_scan: bool = False

class NetworkScanResponse(BaseModel):
    scan_id: str
    message: str
    target_network: str
    scan_type: str
    status: str

class ScanResultResponse(BaseModel):
    scan_id: str
    target_network: str
    scan_type: str
    status: str
    started_at: datetime
    completed_at: Optional[datetime] = None
    devices_found: int
    total_hosts_scanned: int
    error_message: Optional[str] = None

class DiscoveredDeviceResponse(BaseModel):
    ip_address: str
    hostname: Optional[str] = None
    mac_address: Optional[str] = None
    vendor: Optional[str] = None
    device_type: Optional[str] = None
    open_ports: List[int] = []
    services: dict = {}
    response_time: Optional[float] = None
    last_seen: Optional[datetime] = None
    os_info: Optional[str] = None
    snmp_available: bool = False

class DeviceBatchImportRequest(BaseModel):
    devices: List[DeviceCreate]
    auto_detect: bool = True
    skip_duplicates: bool = True

# ============= 设备管理端点 =============

@router.get("/", response_model=List[Device], summary="获取设备列表")
async def get_devices(
    skip: int = Query(0, ge=0, description="跳过的记录数"),
    limit: int = Query(10, ge=1, le=100, description="返回的记录数"),
    device_type: Optional[str] = Query(None, description="设备类型过滤"),
    status: Optional[str] = Query(None, description="状态过滤"),
    group_id: Optional[int] = Query(None, description="设备组过滤"),
    search: Optional[str] = Query(None, description="搜索关键词"),
    current_user: dict = Depends(require_permission("devices:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """
    获取设备列表，支持分页和过滤
    """
    device_repo = DeviceRepository(session)
    
    devices, total = await device_repo.get_devices_paginated(
        skip=skip,
        limit=limit,
        device_type=device_type,
        status=status,
        group_id=group_id,
        search=search
    )
    
    logger.info("Retrieved devices", 
                count=len(devices), 
                total=total, 
                user_id=current_user.get("id"))
    
    return [Device(**device.__dict__) for device in devices]

@router.post("/", response_model=Device, summary="添加新设备")
async def create_device(
    device: DeviceCreate,
    current_user: dict = Depends(require_permission("devices:create")),
    session: AsyncSession = Depends(get_db_session)
):
    """
    添加新的网络设备
    """
    device_repo = DeviceRepository(session)
    
    # 检查IP地址是否已存在
    if await device_repo.check_ip_exists(device.ip_address):
        raise HTTPException(
            status_code=400,
            detail=f"IP地址 {device.ip_address} 已存在"
        )
    
    # 创建设备记录
    device_data = device.dict()
    new_device = await device_repo.create_device(device_data, current_user["id"])
    
    logger.info("Device created", 
                device_id=new_device.id, 
                ip_address=device.ip_address,
                created_by=current_user["id"])
    
    # 发送WebSocket通知
    await ws_notifier.notify_system_event(
        "device_created",
        f"设备 {device.name} ({device.ip_address}) 已创建",
        device_id=new_device.id,
        device_name=device.name,
        ip_address=device.ip_address,
        created_by=current_user.get("username", "unknown")
    )
    
    return Device(**new_device.__dict__)

@router.get("/{device_id}", response_model=Device, summary="获取设备详情")
async def get_device(
    device_id: int,
    current_user: dict = Depends(require_permission("devices:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """
    获取指定设备的详细信息
    """
    device_repo = DeviceRepository(session)
    device = await device_repo.get_device_by_id(device_id)
    
    if not device:
        raise HTTPException(status_code=404, detail="设备不存在")
    
    logger.info("Device retrieved", 
                device_id=device_id, 
                user_id=current_user["id"])
    
    return Device(**device.__dict__)

@router.put("/{device_id}", response_model=Device, summary="更新设备信息")
async def update_device(
    device_id: int,
    device_update: DeviceUpdate,
    current_user: dict = Depends(require_permission("devices:update")),
    session: AsyncSession = Depends(get_db_session)
):
    """
    更新设备信息
    """
    device_repo = DeviceRepository(session)
    
    # 检查设备是否存在
    if not await device_repo.get_device_by_id(device_id):
        raise HTTPException(status_code=404, detail="设备不存在")
    
    # 检查IP地址冲突
    if device_update.ip_address and await device_repo.check_ip_exists(device_update.ip_address, device_id):
        raise HTTPException(
            status_code=400,
            detail=f"IP地址 {device_update.ip_address} 已存在"
        )
    
    # 更新设备信息
    update_data = device_update.dict(exclude_unset=True)
    updated_device = await device_repo.update_device(device_id, update_data)
    
    if not updated_device:
        raise HTTPException(status_code=404, detail="设备不存在")
    
    logger.info("Device updated", 
                device_id=device_id, 
                fields=list(update_data.keys()),
                updated_by=current_user["id"])
    
    return Device(**updated_device.__dict__)

@router.delete("/{device_id}", summary="删除设备")
async def delete_device(
    device_id: int,
    current_user: dict = Depends(require_permission("devices:delete")),
    session: AsyncSession = Depends(get_db_session)
):
    """
    删除设备
    """
    device_repo = DeviceRepository(session)
    
    success = await device_repo.delete_device(device_id)
    if not success:
        raise HTTPException(status_code=404, detail="设备不存在")
    
    logger.info("Device deleted", 
                device_id=device_id,
                deleted_by=current_user["id"])
    
    return {"message": "设备删除成功"}

@router.post("/discovery", summary="网络设备发现")
async def discover_devices(
    request: DiscoveryRequest,
    current_user: dict = Depends(require_permission("devices:create"))
):
    """
    扫描网络发现设备
    """
    import uuid
    scan_id = str(uuid.uuid4())
    
    # 发送扫描开始通知
    await ws_notifier.notify_scan_progress(
        scan_id, 0, "starting",
        network=request.network,
        scan_type="discovery"
    )
    
    logger.info("Starting device discovery", 
                scan_id=scan_id,
                network=request.network,
                initiated_by=current_user["id"])
    
    # 模拟扫描进度
    await ws_notifier.notify_scan_progress(
        scan_id, 25, "scanning",
        message="正在扫描网络..."
    )
    
    discovered_devices = [
        {
            "ip_address": "192.168.1.10",
            "mac_address": "00:1a:2b:3c:4d:5e",
            "open_ports": [22, 80, 161],
            "device_type": "switch",
            "vendor": "cisco",
            "model": "Catalyst 2960"
        },
        {
            "ip_address": "192.168.1.20",
            "mac_address": "00:2a:3b:4c:5d:6e",
            "open_ports": [22, 23, 161],
            "device_type": "router",
            "vendor": "huawei",
            "model": "AR2220"
        }
    ]
    
    # 发送扫描完成通知
    await ws_notifier.notify_scan_progress(
        scan_id, 100, "completed",
        message=f"发现 {len(discovered_devices)} 台设备",
        device_count=len(discovered_devices)
    )
    
    logger.info("Device discovery completed", 
                scan_id=scan_id,
                discovered_count=len(discovered_devices),
                user_id=current_user["id"])
    
    return {
        "scan_id": scan_id,
        "network": request.network,
        "discovered_devices": discovered_devices,
        "total_found": len(discovered_devices)
    }

@router.get("/groups/", response_model=List[DeviceGroup], summary="获取设备组列表")
async def get_device_groups(
    current_user: dict = Depends(require_permission("devices:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """
    获取设备组列表
    """
    device_repo = DeviceRepository(session)
    groups = await device_repo.get_device_groups()
    
    logger.info("Retrieved device groups", 
                count=len(groups),
                user_id=current_user["id"])
    
    return [DeviceGroup(**group.__dict__) for group in groups]

# ============= 网络扫描相关端点 =============

@router.post("/scan", response_model=NetworkScanResponse, summary="启动网络扫描")
async def start_network_scan(
    request: NetworkScanRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(require_permission("devices:create"))
):
    """
    启动网络扫描任务
    
    扫描类型说明：
    - ping: 仅进行主机存活检测
    - tcp: 主机存活检测 + TCP端口扫描
    - full: 全面扫描（包含SNMP、设备指纹识别等）
    """
    try:
        # 启动网络扫描
        scan_id = await network_scanner.start_network_scan(
            target_network=request.target_network,
            scan_type=request.scan_type,
            port_scan=request.port_scan,
            snmp_scan=request.snmp_scan,
            deep_scan=request.deep_scan
        )
        
        logger.info("Network scan initiated", 
                   scan_id=scan_id,
                   target_network=request.target_network,
                   scan_type=request.scan_type,
                   initiated_by=current_user["id"])
        
        return NetworkScanResponse(
            scan_id=scan_id,
            message="网络扫描已启动",
            target_network=request.target_network,
            scan_type=request.scan_type,
            status="running"
        )
        
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        logger.error("Failed to start network scan", 
                    target_network=request.target_network,
                    error=str(e))
        raise HTTPException(status_code=500, detail=f"启动网络扫描失败: {str(e)}")

@router.get("/scan/{scan_id}", response_model=ScanResultResponse, summary="获取扫描结果")
async def get_scan_result(
    scan_id: str,
    current_user: dict = Depends(require_permission("devices:read"))
):
    """
    获取指定扫描任务的结果
    """
    try:
        scan_result = network_scanner.get_scan_result(scan_id)
        
        if not scan_result:
            raise HTTPException(status_code=404, detail="扫描任务不存在")
        
        return ScanResultResponse(
            scan_id=scan_result.scan_id,
            target_network=scan_result.target_network,
            scan_type=scan_result.scan_type,
            status=scan_result.status,
            started_at=scan_result.started_at,
            completed_at=scan_result.completed_at,
            devices_found=scan_result.devices_found,
            total_hosts_scanned=scan_result.total_hosts_scanned,
            error_message=scan_result.error_message
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get scan result", 
                    scan_id=scan_id,
                    error=str(e))
        raise HTTPException(status_code=500, detail=f"获取扫描结果失败: {str(e)}")

@router.get("/scan/{scan_id}/devices", response_model=List[DiscoveredDeviceResponse], summary="获取扫描发现的设备")
async def get_scan_devices(
    scan_id: str,
    current_user: dict = Depends(require_permission("devices:read"))
):
    """
    获取扫描任务发现的设备列表
    """
    try:
        scan_result = network_scanner.get_scan_result(scan_id)
        
        if not scan_result:
            raise HTTPException(status_code=404, detail="扫描任务不存在")
        
        if not scan_result.devices:
            return []
        
        # 转换为响应格式
        devices_response = []
        for device in scan_result.devices:
            device_response = DiscoveredDeviceResponse(
                ip_address=device.ip_address,
                hostname=device.hostname,
                mac_address=device.mac_address,
                vendor=device.vendor,
                device_type=device.device_type,
                open_ports=device.open_ports or [],
                services=device.services or {},
                response_time=device.response_time,
                last_seen=device.last_seen,
                os_info=device.os_info,
                snmp_available=161 in (device.open_ports or [])
            )
            devices_response.append(device_response)
        
        logger.info("Retrieved scan devices", 
                   scan_id=scan_id,
                   device_count=len(devices_response),
                   user_id=current_user["id"])
        
        return devices_response
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get scan devices", 
                    scan_id=scan_id,
                    error=str(e))
        raise HTTPException(status_code=500, detail=f"获取扫描设备失败: {str(e)}")

@router.get("/scans", response_model=List[ScanResultResponse], summary="获取扫描任务列表")
async def get_scan_list(
    status: Optional[str] = Query(None, description="状态过滤"),
    limit: int = Query(20, ge=1, le=100, description="返回数量限制"),
    current_user: dict = Depends(require_permission("devices:read"))
):
    """
    获取扫描任务列表
    """
    try:
        all_scans = network_scanner.get_active_scans()
        
        # 状态过滤
        if status:
            all_scans = [scan for scan in all_scans if scan.status == status]
        
        # 按开始时间倒序排列
        all_scans.sort(key=lambda x: x.started_at, reverse=True)
        
        # 应用数量限制
        all_scans = all_scans[:limit]
        
        # 转换为响应格式
        scans_response = []
        for scan in all_scans:
            scan_response = ScanResultResponse(
                scan_id=scan.scan_id,
                target_network=scan.target_network,
                scan_type=scan.scan_type,
                status=scan.status,
                started_at=scan.started_at,
                completed_at=scan.completed_at,
                devices_found=scan.devices_found,
                total_hosts_scanned=scan.total_hosts_scanned,
                error_message=scan.error_message
            )
            scans_response.append(scan_response)
        
        logger.info("Retrieved scan list", 
                   scan_count=len(scans_response),
                   user_id=current_user["id"])
        
        return scans_response
        
    except Exception as e:
        logger.error("Failed to get scan list", 
                    error=str(e))
        raise HTTPException(status_code=500, detail=f"获取扫描列表失败: {str(e)}")

@router.delete("/scan/{scan_id}", summary="停止或删除扫描任务")
async def stop_scan(
    scan_id: str,
    current_user: dict = Depends(require_permission("devices:update"))
):
    """
    停止正在运行的扫描任务
    """
    try:
        success = await network_scanner.stop_scan(scan_id)
        
        if not success:
            raise HTTPException(status_code=404, detail="扫描任务不存在或无法停止")
        
        logger.info("Network scan stopped", 
                   scan_id=scan_id,
                   stopped_by=current_user["id"])
        
        return {"message": "扫描任务已停止", "scan_id": scan_id}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to stop scan", 
                    scan_id=scan_id,
                    error=str(e))
        raise HTTPException(status_code=500, detail=f"停止扫描失败: {str(e)}")

@router.post("/scan/{scan_id}/import", summary="将扫描结果导入为设备")
async def import_scan_devices(
    scan_id: str,
    device_ips: Optional[List[str]] = None,
    auto_assign_names: bool = True,
    default_group_id: Optional[int] = None,
    current_user: dict = Depends(require_permission("devices:create"))
):
    """
    将扫描发现的设备导入到设备管理中
    
    Args:
        scan_id: 扫描任务ID
        device_ips: 要导入的设备IP列表（为空则导入所有）
        auto_assign_names: 是否自动分配设备名称
        default_group_id: 默认设备组ID
    """
    try:
        scan_result = network_scanner.get_scan_result(scan_id)
        
        if not scan_result:
            raise HTTPException(status_code=404, detail="扫描任务不存在")
        
        if scan_result.status != "completed":
            raise HTTPException(status_code=400, detail="扫描任务未完成，无法导入设备")
        
        if not scan_result.devices:
            raise HTTPException(status_code=400, detail="扫描未发现任何设备")
        
        # 筛选要导入的设备
        devices_to_import = scan_result.devices
        if device_ips:
            devices_to_import = [d for d in devices_to_import if d.ip_address in device_ips]
        
        imported_devices = []
        skipped_devices = []
        
        for device in devices_to_import:
            try:
                # 检查设备是否已存在
                existing_device = None
                for existing in TEMP_DEVICES.values():
                    if existing["ip_address"] == device.ip_address:
                        existing_device = existing
                        break
                
                if existing_device:
                    skipped_devices.append({
                        "ip_address": device.ip_address,
                        "reason": "设备已存在"
                    })
                    continue
                
                # 自动分配设备名称
                if auto_assign_names:
                    if device.hostname:
                        device_name = device.hostname
                    elif device.device_type and device.vendor:
                        device_name = f"{device.vendor}_{device.device_type}_{device.ip_address.replace('.', '_')}"
                    else:
                        device_name = f"Device_{device.ip_address.replace('.', '_')}"
                else:
                    device_name = f"Imported_{device.ip_address.replace('.', '_')}"
                
                # 创建设备记录
                new_id = max(TEMP_DEVICES.keys()) + 1 if TEMP_DEVICES else 1
                now = datetime.now()
                
                new_device = {
                    "id": new_id,
                    "name": device_name,
                    "ip_address": device.ip_address,
                    "device_type": device.device_type or "unknown",
                    "vendor": device.vendor or "unknown",
                    "model": None,
                    "location": None,
                    "group_id": default_group_id,
                    "snmp_community": "public" if 161 in (device.open_ports or []) else None,
                    "snmp_version": "2c",
                    "ssh_username": None,
                    "ssh_password": None,
                    "description": f"从网络扫描 {scan_id} 导入",
                    "status": "online",
                    "last_seen": device.last_seen or now,
                    "is_active": True,
                    "created_by": current_user["id"],
                    "created_at": now,
                    "updated_at": now
                }
                
                TEMP_DEVICES[new_id] = new_device
                imported_devices.append(Device(**new_device))
                
            except Exception as e:
                skipped_devices.append({
                    "ip_address": device.ip_address,
                    "reason": f"导入失败: {str(e)}"
                })
        
        logger.info("Devices imported from scan", 
                   scan_id=scan_id,
                   imported_count=len(imported_devices),
                   skipped_count=len(skipped_devices),
                   imported_by=current_user["id"])
        
        return {
            "message": f"设备导入完成，成功导入 {len(imported_devices)} 个设备",
            "scan_id": scan_id,
            "imported_count": len(imported_devices),
            "skipped_count": len(skipped_devices),
            "imported_devices": imported_devices,
            "skipped_devices": skipped_devices
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to import scan devices", 
                    scan_id=scan_id,
                    error=str(e))
        raise HTTPException(status_code=500, detail=f"导入设备失败: {str(e)}")

@router.post("/batch-import", summary="批量导入设备")
async def batch_import_devices(
    request: DeviceBatchImportRequest,
    current_user: dict = Depends(require_permission("devices:create"))
):
    """
    批量导入设备
    """
    try:
        imported_devices = []
        skipped_devices = []
        
        for device_data in request.devices:
            try:
                # 检查IP地址是否已存在
                if request.skip_duplicates:
                    existing_device = None
                    for existing in TEMP_DEVICES.values():
                        if existing["ip_address"] == device_data.ip_address:
                            existing_device = existing
                            break
                    
                    if existing_device:
                        skipped_devices.append({
                            "ip_address": device_data.ip_address,
                            "reason": "设备已存在"
                        })
                        continue
                
                # 创建设备记录
                new_id = max(TEMP_DEVICES.keys()) + 1 if TEMP_DEVICES else 1
                now = datetime.now()
                
                new_device = {
                    "id": new_id,
                    **device_data.dict(),
                    "status": "unknown",
                    "last_seen": None,
                    "is_active": True,
                    "created_by": current_user["id"],
                    "created_at": now,
                    "updated_at": now
                }
                
                TEMP_DEVICES[new_id] = new_device
                imported_devices.append(Device(**new_device))
                
            except Exception as e:
                skipped_devices.append({
                    "ip_address": device_data.ip_address,
                    "reason": f"导入失败: {str(e)}"
                })
        
        logger.info("Batch devices imported", 
                   imported_count=len(imported_devices),
                   skipped_count=len(skipped_devices),
                   imported_by=current_user["id"])
        
        return {
            "message": f"批量导入完成，成功导入 {len(imported_devices)} 个设备",
            "imported_count": len(imported_devices),
            "skipped_count": len(skipped_devices),
            "imported_devices": imported_devices,
            "skipped_devices": skipped_devices
        }
        
    except Exception as e:
        logger.error("Failed to batch import devices", 
                    error=str(e))
        raise HTTPException(status_code=500, detail=f"批量导入设备失败: {str(e)}")

@router.get("/scan/cleanup", summary="清理扫描历史")
async def cleanup_scan_history(
    older_than_hours: int = Query(48, ge=1, le=720, description="清理多少小时前的扫描记录"),
    current_user: dict = Depends(require_permission("devices:admin"))
):
    """
    清理历史扫描记录（管理员权限）
    """
    try:
        network_scanner.cleanup_old_scans(older_than_hours)
        
        logger.info("Scan history cleanup completed", 
                   older_than_hours=older_than_hours,
                   cleaned_by=current_user["id"])
        
        return {"message": f"已清理 {older_than_hours} 小时前的扫描记录"}
        
    except Exception as e:
        logger.error("Failed to cleanup scan history", 
                    error=str(e))
        raise HTTPException(status_code=500, detail=f"清理扫描历史失败: {str(e)}")

# 导入批量操作功能
from .bulk_operations import router as bulk_router

# 将批量操作路由包含到主路由器中
# router.include_router(bulk_router)