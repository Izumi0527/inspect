"""
设备管理模块 - API路由

提供设备CRUD、网络扫描、批量操作等API端点
"""
from fastapi import APIRouter, HTTPException, Depends, Query, BackgroundTasks
from typing import Optional, List
from sqlalchemy.ext.asyncio import AsyncSession
import structlog

from src.core.permissions import require_permission
from src.core.database import get_db_session
from src.shared.exceptions import NotFoundException, ConflictException
from src.shared.pagination import get_pagination_params, PaginationParams

from src.modules.devices.service import DeviceService, get_device_service
from src.modules.devices.schemas import (
    DeviceCreate, DeviceUpdate, DeviceResponse, DeviceListResponse,
    DeviceGroupResponse, DeviceStatistics,
    NetworkScanRequest, NetworkScanResponse, ScanResultResponse,
    DiscoveredDeviceResponse, DeviceBatchImportRequest, DeviceBatchImportResponse,
    DeviceProbeResponse, DeviceBatchProbeRequest, DeviceBatchProbeResponse
)

# 延迟导入避免循环依赖
def get_ws_notifier():
    from src.modules.monitoring.websocket import ws_notifier
    return ws_notifier

def get_network_scanner():
    from src.services.device import network_scanner
    return network_scanner

def get_monitoring_service():
    from src.services.monitoring import monitoring_service
    return monitoring_service

def get_device_monitoring_service():
    from src.services.device import device_monitoring_service
    return device_monitoring_service

def get_device_probe_service():
    from src.services.device.probe import device_probe_service
    return device_probe_service

logger = structlog.get_logger()
router = APIRouter()


# ============= 设备CRUD端点 =============

@router.get("/", response_model=List[DeviceResponse], summary="获取设备列表")
async def get_devices(
    skip: int = Query(0, ge=0, description="跳过的记录数"),
    limit: int = Query(100, ge=1, le=1000, description="返回的记录数"),
    page: Optional[int] = Query(None, ge=1, description="页码（与page_size配合使用）"),
    page_size: Optional[int] = Query(None, ge=1, le=1000, description="每页数量"),
    device_type: Optional[str] = Query(None, description="设备类型过滤"),
    status: Optional[str] = Query(None, description="状态过滤"),
    group_id: Optional[int] = Query(None, description="设备组过滤"),
    search: Optional[str] = Query(None, description="搜索关键词"),
    current_user: dict = Depends(require_permission("devices:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """获取设备列表，支持分页和过滤
    
    分页参数支持两种方式：
    1. skip/limit: 传统分页方式
    2. page/page_size: 页码分页方式（优先使用）
    """
    service = DeviceService(session)
    
    # 优先使用 page/page_size 参数
    if page is not None and page_size is not None:
        final_page = page
        final_page_size = page_size
    else:
        # 使用 skip/limit 转换为 page/page_size
        final_page_size = limit
        final_page = (skip // limit) + 1 if limit > 0 else 1
    
    devices, total = await service.get_devices_paginated(
        page=final_page,
        page_size=final_page_size,
        device_type=device_type,
        status=status,
        group_id=group_id,
        search=search
    )
    
    # 获取设备告警数量
    try:
        from src.repositories.alert_repository_db import AlertRepositoryDB
        alert_repo = AlertRepositoryDB(session)
        alert_stats = await alert_repo.get_alert_statistics()
        alerts_by_device = alert_stats.get("by_device", {})
        
        # 为每个设备添加告警数量
        for device in devices:
            device.alert_count = alerts_by_device.get(device.id, 0)
    except Exception as e:
        logger.warning("Failed to get alert counts for devices", error=str(e))
        # 如果获取告警数量失败，设置为0
        for device in devices:
            device.alert_count = 0
    
    logger.info("Retrieved devices", count=len(devices), total=total, user_id=current_user.get("id"))
    return devices


@router.post("/", response_model=DeviceResponse, summary="添加新设备")
async def create_device(
    device: DeviceCreate,
    current_user: dict = Depends(require_permission("devices:create")),
    session: AsyncSession = Depends(get_db_session)
):
    """添加新的网络设备"""
    service = DeviceService(session)
    
    try:
        new_device = await service.create_device(device, current_user["id"])
        
        # 发送WebSocket通知
        ws_notifier = get_ws_notifier()
        await ws_notifier.notify_system_event(
            "device_created",
            f"设备 {device.name} ({device.ip_address}) 已创建",
            device_id=new_device.id,
            device_name=device.name,
            ip_address=device.ip_address,
            created_by=current_user.get("username", "unknown")
        )
        
        return new_device
        
    except ConflictException as e:
        raise HTTPException(status_code=400, detail=e.message)


@router.get("/{device_id}", response_model=DeviceResponse, summary="获取设备详情")
async def get_device(
    device_id: int,
    current_user: dict = Depends(require_permission("devices:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """获取指定设备的详细信息"""
    service = DeviceService(session)
    
    try:
        device = await service.get_device_by_id(device_id)
        logger.info("Device retrieved", device_id=device_id, user_id=current_user["id"])
        return device
    except NotFoundException as e:
        raise HTTPException(status_code=404, detail=e.message)


@router.put("/{device_id}", response_model=DeviceResponse, summary="更新设备信息")
async def update_device(
    device_id: int,
    device_update: DeviceUpdate,
    current_user: dict = Depends(require_permission("devices:update")),
    session: AsyncSession = Depends(get_db_session)
):
    """更新设备信息"""
    service = DeviceService(session)
    
    try:
        updated_device = await service.update_device(device_id, device_update)
        logger.info("Device updated", device_id=device_id, updated_by=current_user["id"])
        return updated_device
    except NotFoundException as e:
        raise HTTPException(status_code=404, detail=e.message)
    except ConflictException as e:
        raise HTTPException(status_code=400, detail=e.message)


@router.delete("/{device_id}", summary="删除设备")
async def delete_device(
    device_id: int,
    current_user: dict = Depends(require_permission("devices:delete")),
    session: AsyncSession = Depends(get_db_session)
):
    """删除设备"""
    service = DeviceService(session)
    
    try:
        await service.delete_device(device_id)
        
        # 停止监控并清理缓存
        try:
            monitoring_service = get_monitoring_service()
            await monitoring_service.stop_device_monitoring(device_id)
        except Exception as e:
            logger.warning("Stop realtime monitoring failed", device_id=device_id, error=str(e))
        
        try:
            device_monitoring_service = get_device_monitoring_service()
            await device_monitoring_service.mark_device_deleted(device_id)
        except Exception as e:
            logger.warning("Clear device cache failed", device_id=device_id, error=str(e))
        
        logger.info("Device deleted", device_id=device_id, deleted_by=current_user["id"])
        return {"message": "设备删除成功"}
        
    except NotFoundException as e:
        raise HTTPException(status_code=404, detail=e.message)


# ============= 设备组端点 =============

@router.get("/groups/", response_model=List[DeviceGroupResponse], summary="获取设备组列表")
async def get_device_groups(
    current_user: dict = Depends(require_permission("devices:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """获取设备组列表"""
    service = DeviceService(session)
    groups = await service.get_device_groups()
    logger.info("Retrieved device groups", count=len(groups), user_id=current_user["id"])
    return groups


# ============= 网络扫描端点 =============

@router.post("/scan", response_model=NetworkScanResponse, summary="启动网络扫描")
async def start_network_scan(
    request: NetworkScanRequest,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(require_permission("devices:create"))
):
    """启动网络扫描任务"""
    try:
        network_scanner = get_network_scanner()
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
        logger.error("Failed to start network scan", error=str(e))
        raise HTTPException(status_code=500, detail=f"启动网络扫描失败: {str(e)}")


@router.get("/scan/{scan_id}", response_model=ScanResultResponse, summary="获取扫描结果")
async def get_scan_result(
    scan_id: str,
    current_user: dict = Depends(require_permission("devices:read"))
):
    """获取指定扫描任务的结果"""
    network_scanner = get_network_scanner()
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


@router.get("/scan/{scan_id}/devices", response_model=List[DiscoveredDeviceResponse], summary="获取扫描发现的设备")
async def get_scan_devices(
    scan_id: str,
    current_user: dict = Depends(require_permission("devices:read"))
):
    """获取扫描任务发现的设备列表"""
    network_scanner = get_network_scanner()
    scan_result = network_scanner.get_scan_result(scan_id)
    
    if not scan_result:
        raise HTTPException(status_code=404, detail="扫描任务不存在")
    
    if not scan_result.devices:
        return []
    
    devices_response = []
    for device in scan_result.devices:
        devices_response.append(DiscoveredDeviceResponse(
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
        ))
    
    return devices_response


@router.get("/scans", response_model=List[ScanResultResponse], summary="获取扫描任务列表")
async def get_scan_list(
    status: Optional[str] = Query(None, description="状态过滤"),
    limit: int = Query(20, ge=1, le=100, description="返回数量限制"),
    current_user: dict = Depends(require_permission("devices:read"))
):
    """获取扫描任务列表"""
    network_scanner = get_network_scanner()
    all_scans = network_scanner.get_active_scans()
    
    if status:
        all_scans = [scan for scan in all_scans if scan.status == status]
    
    all_scans.sort(key=lambda x: x.started_at, reverse=True)
    all_scans = all_scans[:limit]
    
    return [
        ScanResultResponse(
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
        for scan in all_scans
    ]


@router.delete("/scan/{scan_id}", summary="停止扫描任务")
async def stop_scan(
    scan_id: str,
    current_user: dict = Depends(require_permission("devices:update"))
):
    """停止正在运行的扫描任务"""
    network_scanner = get_network_scanner()
    success = await network_scanner.stop_scan(scan_id)
    
    if not success:
        raise HTTPException(status_code=404, detail="扫描任务不存在或无法停止")
    
    logger.info("Network scan stopped", scan_id=scan_id, stopped_by=current_user["id"])
    return {"message": "扫描任务已停止", "scan_id": scan_id}


# ============= 批量操作端点 =============

@router.post("/batch-import", response_model=DeviceBatchImportResponse, summary="批量导入设备")
async def batch_import_devices(
    request: DeviceBatchImportRequest,
    current_user: dict = Depends(require_permission("devices:create")),
    session: AsyncSession = Depends(get_db_session)
):
    """批量导入设备"""
    service = DeviceService(session)
    
    imported, skipped = await service.batch_create_devices(
        devices=request.devices,
        created_by=current_user["id"],
        skip_duplicates=request.skip_duplicates
    )
    
    return DeviceBatchImportResponse(
        message=f"批量导入完成，成功导入 {len(imported)} 个设备",
        imported_count=len(imported),
        skipped_count=len(skipped),
        imported_devices=imported,
        skipped_devices=skipped
    )


@router.post("/scan/{scan_id}/import", summary="将扫描结果导入为设备")
async def import_scan_devices(
    scan_id: str,
    device_ips: Optional[List[str]] = None,
    auto_assign_names: bool = True,
    default_group_id: Optional[int] = None,
    current_user: dict = Depends(require_permission("devices:create")),
    session: AsyncSession = Depends(get_db_session)
):
    """将扫描发现的设备导入到设备管理中"""
    network_scanner = get_network_scanner()
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
    
    # 转换为DeviceCreate对象
    device_creates = []
    for device in devices_to_import:
        if auto_assign_names:
            if device.hostname:
                device_name = device.hostname
            elif device.device_type and device.vendor:
                device_name = f"{device.vendor}_{device.device_type}_{device.ip_address.replace('.', '_')}"
            else:
                device_name = f"Device_{device.ip_address.replace('.', '_')}"
        else:
            device_name = f"Imported_{device.ip_address.replace('.', '_')}"
        
        device_creates.append(DeviceCreate(
            name=device_name,
            ip_address=device.ip_address,
            device_type=device.device_type or "unknown",
            vendor=device.vendor or "unknown",
            group_id=default_group_id,
            snmp_community="public" if 161 in (device.open_ports or []) else None,
            snmp_version="2c",
            description=f"从网络扫描 {scan_id} 导入"
        ))
    
    # 批量导入
    service = DeviceService(session)
    imported, skipped = await service.batch_create_devices(
        devices=device_creates,
        created_by=current_user["id"],
        skip_duplicates=True
    )
    
    logger.info("Devices imported from scan",
               scan_id=scan_id,
               imported_count=len(imported),
               skipped_count=len(skipped),
               imported_by=current_user["id"])
    
    return {
        "message": f"设备导入完成，成功导入 {len(imported)} 个设备",
        "scan_id": scan_id,
        "imported_count": len(imported),
        "skipped_count": len(skipped),
        "imported_devices": imported,
        "skipped_devices": skipped
    }


@router.post("/batch-delete", summary="批量删除设备")
async def batch_delete_devices(
    device_ids: List[int],
    current_user: dict = Depends(require_permission("devices:delete")),
    session: AsyncSession = Depends(get_db_session)
):
    """批量删除设备"""
    if not device_ids:
        raise HTTPException(status_code=400, detail="请选择要删除的设备")
    
    service = DeviceService(session)
    deleted_count = 0
    failed_items = []
    
    for device_id in device_ids:
        try:
            await service.delete_device(device_id)
            deleted_count += 1
            
            # 停止监控并清理缓存
            try:
                monitoring_service = get_monitoring_service()
                await monitoring_service.stop_device_monitoring(device_id)
            except Exception as e:
                logger.warning("Stop monitoring failed", device_id=device_id, error=str(e))
            
            try:
                device_monitoring_service = get_device_monitoring_service()
                await device_monitoring_service.mark_device_deleted(device_id)
            except Exception as e:
                logger.warning("Clear device cache failed", device_id=device_id, error=str(e))
                
        except Exception as e:
            failed_items.append({"device_id": device_id, "error": str(e)})
    
    logger.info("Batch delete completed", 
               deleted_count=deleted_count, 
               failed_count=len(failed_items),
               deleted_by=current_user["id"])
    
    return {
        "success": True,
        "message": f"成功删除 {deleted_count} 台设备",
        "deleted_count": deleted_count,
        "failed_count": len(failed_items),
        "failed_items": failed_items
    }


# ============= 统计端点 =============

@router.get("/statistics", response_model=DeviceStatistics, summary="获取设备统计")
async def get_device_statistics(
    current_user: dict = Depends(require_permission("devices:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """获取设备统计信息"""
    service = DeviceService(session)
    stats = await service.get_device_statistics()
    return DeviceStatistics(**stats)



# ============= 设备探测端点 =============

@router.post("/{device_id}/probe", response_model=DeviceProbeResponse, summary="探测设备连接状态")
async def probe_device(
    device_id: int,
    update_status: bool = Query(True, description="是否更新设备状态"),
    current_user: dict = Depends(require_permission("devices:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """
    探测设备的ICMP和SNMP连接状态
    
    - ICMP: 通过ping检测设备是否在线
    - SNMP: 检测SNMP连接是否可用
    - update_status: 是否将探测结果更新到设备状态（默认True）
    """
    service = DeviceService(session)
    probe_service = get_device_probe_service()
    
    try:
        # 获取设备信息
        device = await service.get_device_by_id(device_id)
        
        # 执行探测
        probe_result = await probe_service.probe_device(
            device_id=device.id,
            ip_address=device.ip_address,
            snmp_community=device.snmp_community,
            snmp_version=device.snmp_version or "2c",
            snmp_port=device.snmp_port or 161,
            tags=device.tags,
            use_cache=False  # 手动探测不使用缓存
        )
        
        # 更新设备状态到数据库
        if update_status:
            await service.update_device_probe_status(
                device_id=device_id,
                status=probe_result.status,
                icmp_status=probe_result.icmp_status,
                snmp_status=probe_result.snmp_status,
                response_time=probe_result.icmp_response_time,
                last_seen=probe_result.probed_at if probe_result.icmp_reachable else None,
                last_probe_time=probe_result.probed_at
            )
        
        logger.info("Device probed", 
                   device_id=device_id,
                   icmp_reachable=probe_result.icmp_reachable,
                   snmp_reachable=probe_result.snmp_reachable,
                   status_updated=update_status,
                   user_id=current_user["id"])
        
        return DeviceProbeResponse(
            device_id=probe_result.device_id,
            ip_address=probe_result.ip_address,
            icmp_reachable=probe_result.icmp_reachable,
            icmp_response_time=probe_result.icmp_response_time,
            icmp_error=probe_result.icmp_error,
            snmp_reachable=probe_result.snmp_reachable,
            snmp_response_time=probe_result.snmp_response_time,
            snmp_error=probe_result.snmp_error,
            snmp_system_info=probe_result.snmp_system_info,
            probed_at=probe_result.probed_at
        )
        
    except NotFoundException as e:
        raise HTTPException(status_code=404, detail=e.message)
    except Exception as e:
        logger.error("Device probe failed", device_id=device_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"设备探测失败: {str(e)}")


@router.post("/batch-probe", response_model=DeviceBatchProbeResponse, summary="批量探测设备")
async def batch_probe_devices(
    request: DeviceBatchProbeRequest,
    update_status: bool = Query(True, description="是否更新设备状态"),
    current_user: dict = Depends(require_permission("devices:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """
    批量探测多个设备的连接状态
    
    支持同时探测多个设备的ICMP和SNMP连接状态，并更新设备状态
    """
    service = DeviceService(session)
    probe_service = get_device_probe_service()
    
    try:
        # 获取设备信息
        devices_data = []
        for device_id in request.device_ids:
            try:
                device = await service.get_device_by_id(device_id)
                devices_data.append({
                    "id": device.id,
                    "ip_address": device.ip_address,
                    "snmp_community": device.snmp_community,
                    "snmp_version": device.snmp_version or "2c",
                    "snmp_port": device.snmp_port or 161,
                    "tags": device.tags
                })
            except NotFoundException:
                logger.warning("Device not found for probe", device_id=device_id)
                continue
        
        if not devices_data:
            raise HTTPException(status_code=400, detail="没有找到有效的设备")
        
        # 批量探测
        probe_results = await probe_service.batch_probe_devices(
            devices=devices_data,
            max_concurrent=request.max_concurrent
        )
        
        # 更新设备状态到数据库
        if update_status:
            for device_id, probe_result in probe_results.items():
                try:
                    await service.update_device_probe_status(
                        device_id=device_id,
                        status=probe_result.status,
                        icmp_status=probe_result.icmp_status,
                        snmp_status=probe_result.snmp_status,
                        response_time=probe_result.icmp_response_time,
                        last_seen=probe_result.probed_at if probe_result.icmp_reachable else None,
                        last_probe_time=probe_result.probed_at
                    )
                except Exception as e:
                    logger.warning("Failed to update device status", device_id=device_id, error=str(e))
        
        # 转换为响应格式
        results = []
        for device_id, probe_result in probe_results.items():
            results.append(DeviceProbeResponse(
                device_id=probe_result.device_id,
                ip_address=probe_result.ip_address,
                icmp_reachable=probe_result.icmp_reachable,
                icmp_response_time=probe_result.icmp_response_time,
                icmp_error=probe_result.icmp_error,
                snmp_reachable=probe_result.snmp_reachable,
                snmp_response_time=probe_result.snmp_response_time,
                snmp_error=probe_result.snmp_error,
                snmp_system_info=probe_result.snmp_system_info,
                probed_at=probe_result.probed_at
            ))
        
        logger.info("Batch probe completed",
                   total_devices=len(request.device_ids),
                   probed_devices=len(results),
                   status_updated=update_status,
                   user_id=current_user["id"])
        
        return DeviceBatchProbeResponse(
            total=len(request.device_ids),
            probed=len(results),
            results=results
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Batch probe failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"批量探测失败: {str(e)}")
