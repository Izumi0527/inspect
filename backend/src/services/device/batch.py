"""
设备批量操作服务
提供设备批量添加、删除、配置更新等功能
"""

import asyncio
import csv
import json
from typing import Dict, List, Optional, Any, Tuple, Union
from datetime import datetime, timezone
from enum import Enum
from dataclasses import dataclass, field
from pathlib import Path
import structlog

from src.core.database import get_db_session_context
from src.repositories.device_repository import DeviceRepository
from src.models.device import Device, DeviceType, DeviceStatus
from src.modules.devices.schemas import DeviceCreate, DeviceUpdate
from src.services.device.performance import DeviceCredentials, MonitoringProtocol
from src.core.influxdb import record_user_activity
from src.services.monitoring.service import monitoring_service
from src.services.device.monitoring import device_monitoring_service
from sqlalchemy.ext.asyncio import AsyncSession

logger = structlog.get_logger()


class BatchOperationType(str, Enum):
    """批量操作类型"""
    ADD = "add"
    UPDATE = "update"
    DELETE = "delete"
    IMPORT = "import"
    EXPORT = "export"


class BatchOperationStatus(str, Enum):
    """批量操作状态"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    PARTIALLY_FAILED = "partially_failed"


@dataclass
class BatchOperationResult:
    """批量操作结果"""
    operation_id: str = field(default_factory=lambda: f"batch_{int(datetime.now().timestamp())}")
    operation_type: BatchOperationType = BatchOperationType.ADD
    status: BatchOperationStatus = BatchOperationStatus.PENDING
    
    total_count: int = 0
    success_count: int = 0
    failed_count: int = 0
    
    success_items: List[Dict[str, Any]] = field(default_factory=list)
    failed_items: List[Dict[str, Any]] = field(default_factory=list)
    
    start_time: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    end_time: Optional[datetime] = None
    
    error_message: Optional[str] = None
    details: Dict[str, Any] = field(default_factory=dict)


@dataclass
class DeviceBatchData:
    """设备批量数据"""
    name: str
    ip_address: str
    device_type: str
    description: Optional[str] = None
    location: Optional[str] = None
    manufacturer: Optional[str] = None
    model: Optional[str] = None
    serial_number: Optional[str] = None
    firmware_version: Optional[str] = None
    
    # 监控配置
    snmp_enabled: bool = True
    snmp_port: int = 161
    snmp_community: Optional[str] = "public"
    snmp_version: Optional[str] = "v2c"
    
    ssh_enabled: bool = False
    ssh_port: int = 22
    ssh_username: Optional[str] = None
    ssh_password: Optional[str] = None
    
    # 其他配置
    monitoring_enabled: bool = True
    is_active: bool = True


class DeviceBatchService:
    """设备批量操作服务"""
    
    def __init__(self):
        self.logger = logger.bind(component="device_batch_service")
        self.operations: Dict[str, BatchOperationResult] = {}
        self.running_operations: Dict[str, asyncio.Task] = {}
        
    async def batch_add_devices(
        self,
        devices_data: List[DeviceBatchData],
        user_id: str,
        validate_only: bool = False
    ) -> BatchOperationResult:
        """批量添加设备"""
        operation = BatchOperationResult(
            operation_type=BatchOperationType.ADD,
            total_count=len(devices_data),
            details={"user_id": user_id, "validate_only": validate_only}
        )
        
        self.operations[operation.operation_id] = operation
        
        if not validate_only:
            # 创建异步任务执行批量添加
            task = asyncio.create_task(
                self._execute_batch_add(operation, devices_data, user_id)
            )
            self.running_operations[operation.operation_id] = task
        else:
            # 仅验证数据
            await self._validate_batch_data(operation, devices_data)
        
        return operation
    
    async def _execute_batch_add(
        self,
        operation: BatchOperationResult,
        devices_data: List[DeviceBatchData],
        user_id: str
    ):
        """执行批量添加设备"""
        operation.status = BatchOperationStatus.RUNNING

        try:
            async with get_db_session_context() as session:
                device_repo = DeviceRepository(session)

                for i, device_data in enumerate(devices_data):
                    try:
                        # 检查设备是否已存在
                        existing_device = await device_repo.get_device_by_ip(device_data.ip_address)
                        if existing_device:
                            operation.failed_items.append({
                                "index": i,
                                "data": device_data.__dict__,
                                "error": f"设备IP {device_data.ip_address} 已存在"
                            })
                            operation.failed_count += 1
                            continue
                        
                        # 创建设备对象
                        device_create = DeviceCreate(
                            name=device_data.name,
                            ip_address=device_data.ip_address,
                            device_type=DeviceType(device_data.device_type),
                            description=device_data.description,
                            location=device_data.location,
                            manufacturer=device_data.manufacturer,
                            model=device_data.model,
                            serial_number=device_data.serial_number,
                            firmware_version=device_data.firmware_version,
                            is_active=device_data.is_active,
                            monitoring_enabled=device_data.monitoring_enabled,
                            snmp_enabled=device_data.snmp_enabled,
                            snmp_port=device_data.snmp_port,
                            snmp_community=device_data.snmp_community,
                            snmp_version=device_data.snmp_version,
                            ssh_enabled=device_data.ssh_enabled,
                            ssh_port=device_data.ssh_port,
                            ssh_username=device_data.ssh_username,
                            ssh_password=device_data.ssh_password
                        )
                        
                        # 添加设备到数据库
                        new_device = await device_repo.create_device(device_create.dict(), user_id)
                        
                        operation.success_items.append({
                            "index": i,
                            "device_id": new_device.id,
                            "name": new_device.name,
                            "ip_address": new_device.ip_address
                        })
                        operation.success_count += 1
                        
                        self.logger.info(
                            "Device added successfully",
                            device_id=new_device.id,
                            device_name=new_device.name,
                            operation_id=operation.operation_id
                        )
                        
                    except Exception as e:
                        operation.failed_items.append({
                            "index": i,
                            "data": device_data.__dict__,
                            "error": str(e)
                        })
                        operation.failed_count += 1
                        
                        self.logger.error(
                            "Failed to add device",
                            device_name=device_data.name,
                            error=str(e),
                            operation_id=operation.operation_id
                        )
                
                await session.commit()
            
            # 确定最终状态
            if operation.failed_count == 0:
                operation.status = BatchOperationStatus.COMPLETED
            elif operation.success_count == 0:
                operation.status = BatchOperationStatus.FAILED
            else:
                operation.status = BatchOperationStatus.PARTIALLY_FAILED
            
            # 记录操作日志
            await record_user_activity(
                user_id=user_id,
                action="batch_add_devices",
                resource="device_management",
                details={
                    "operation_id": operation.operation_id,
                    "total_count": operation.total_count,
                    "success_count": operation.success_count,
                    "failed_count": operation.failed_count
                }
            )
            
        except Exception as e:
            operation.status = BatchOperationStatus.FAILED
            operation.error_message = str(e)
            self.logger.error(
                "Batch add operation failed",
                operation_id=operation.operation_id,
                error=str(e)
            )
        
        finally:
            operation.end_time = datetime.now(timezone.utc)
            self.running_operations.pop(operation.operation_id, None)
    
    async def batch_delete_devices(
        self,
        device_ids: List[int],
        user_id: str,
        force_delete: bool = False
    ) -> BatchOperationResult:
        """批量删除设备"""
        operation = BatchOperationResult(
            operation_type=BatchOperationType.DELETE,
            total_count=len(device_ids),
            details={"user_id": user_id, "force_delete": force_delete}
        )

        self.operations[operation.operation_id] = operation
        operation.status = BatchOperationStatus.RUNNING

        try:
            async with get_db_session_context() as session:
                device_repo = DeviceRepository(session)
                
                for i, device_id in enumerate(device_ids):
                    try:
                        # 获取设备信息
                        device = await device_repo.get_device_by_id(device_id)
                        if not device:
                            operation.failed_items.append({
                                "index": i,
                                "device_id": device_id,
                                "error": f"设备ID {device_id} 不存在"
                            })
                            operation.failed_count += 1
                            continue
                        
                        # 检查设备是否可以删除
                        if not force_delete and device.status == DeviceStatus.ONLINE:
                            operation.failed_items.append({
                                "index": i,
                                "device_id": device_id,
                                "name": device.name,
                                "error": "设备在线，请先停用或使用强制删除"
                            })
                            operation.failed_count += 1
                            continue
                        
                        # 删除设备
                        success = await device_repo.delete_device(device_id)
                        if success:
                            try:
                                await monitoring_service.stop_device_monitoring(device_id)
                            except Exception as e:
                                self.logger.warning("Stop monitoring failed during batch delete",
                                                    device_id=device_id, error=str(e))
                            try:
                                await device_monitoring_service.mark_device_deleted(device_id)
                            except Exception as e:
                                self.logger.warning("Clear device cache failed during batch delete",
                                                    device_id=device_id, error=str(e))
                            operation.success_items.append({
                                "index": i,
                                "device_id": device_id,
                                "name": device.name,
                                "ip_address": device.ip_address
                            })
                            operation.success_count += 1
                        else:
                            operation.failed_items.append({
                                "index": i,
                                "device_id": device_id,
                                "name": device.name,
                                "error": "删除失败"
                            })
                            operation.failed_count += 1
                        
                    except Exception as e:
                        operation.failed_items.append({
                            "index": i,
                            "device_id": device_id,
                            "error": str(e)
                        })
                        operation.failed_count += 1
                        
                        self.logger.error(
                            "Failed to delete device",
                            device_id=device_id,
                            error=str(e),
                            operation_id=operation.operation_id
                        )
                
                await session.commit()
            
            # 确定最终状态
            if operation.failed_count == 0:
                operation.status = BatchOperationStatus.COMPLETED
            elif operation.success_count == 0:
                operation.status = BatchOperationStatus.FAILED
            else:
                operation.status = BatchOperationStatus.PARTIALLY_FAILED
            
            # 记录操作日志
            await record_user_activity(
                user_id=user_id,
                action="batch_delete_devices",
                resource="device_management",
                details={
                    "operation_id": operation.operation_id,
                    "total_count": operation.total_count,
                    "success_count": operation.success_count,
                    "failed_count": operation.failed_count,
                    "force_delete": force_delete
                }
            )
            
        except Exception as e:
            operation.status = BatchOperationStatus.FAILED
            operation.error_message = str(e)
            self.logger.error(
                "Batch delete operation failed",
                operation_id=operation.operation_id,
                error=str(e)
            )
        
        finally:
            operation.end_time = datetime.now(timezone.utc)
        
        return operation
    
    async def batch_update_devices(
        self,
        device_updates: List[Dict[str, Any]],
        user_id: str
    ) -> BatchOperationResult:
        """批量更新设备配置"""
        operation = BatchOperationResult(
            operation_type=BatchOperationType.UPDATE,
            total_count=len(device_updates),
            details={"user_id": user_id}
        )

        self.operations[operation.operation_id] = operation
        operation.status = BatchOperationStatus.RUNNING

        try:
            async with get_db_session_context() as session:
                device_repo = DeviceRepository(session)
                
                for i, update_data in enumerate(device_updates):
                    try:
                        device_id = update_data.get("device_id")
                        if not device_id:
                            operation.failed_items.append({
                                "index": i,
                                "data": update_data,
                                "error": "缺少device_id"
                            })
                            operation.failed_count += 1
                            continue
                        
                        # 获取设备
                        device = await device_repo.get_device_by_id(device_id)
                        if not device:
                            operation.failed_items.append({
                                "index": i,
                                "device_id": device_id,
                                "error": f"设备ID {device_id} 不存在"
                            })
                            operation.failed_count += 1
                            continue
                        
                        # 准备更新数据
                        update_fields = {k: v for k, v in update_data.items() if k != "device_id"}
                        
                        # 验证device_type
                        if "device_type" in update_fields:
                            try:
                                update_fields["device_type"] = DeviceType(update_fields["device_type"])
                            except ValueError:
                                operation.failed_items.append({
                                    "index": i,
                                    "device_id": device_id,
                                    "error": f"无效的设备类型: {update_fields['device_type']}"
                                })
                                operation.failed_count += 1
                                continue
                        
                        device_update = DeviceUpdate(**update_fields)
                        
                        # 更新设备
                        updated_device = await device_repo.update_device(device_id, device_update)
                        if updated_device:
                            operation.success_items.append({
                                "index": i,
                                "device_id": device_id,
                                "name": updated_device.name,
                                "updated_fields": list(update_fields.keys())
                            })
                            operation.success_count += 1
                        else:
                            operation.failed_items.append({
                                "index": i,
                                "device_id": device_id,
                                "error": "更新失败"
                            })
                            operation.failed_count += 1
                        
                    except Exception as e:
                        operation.failed_items.append({
                            "index": i,
                            "data": update_data,
                            "error": str(e)
                        })
                        operation.failed_count += 1
                        
                        self.logger.error(
                            "Failed to update device",
                            device_id=update_data.get("device_id"),
                            error=str(e),
                            operation_id=operation.operation_id
                        )
                
                await session.commit()
            
            # 确定最终状态
            if operation.failed_count == 0:
                operation.status = BatchOperationStatus.COMPLETED
            elif operation.success_count == 0:
                operation.status = BatchOperationStatus.FAILED
            else:
                operation.status = BatchOperationStatus.PARTIALLY_FAILED
            
            # 记录操作日志
            await record_user_activity(
                user_id=user_id,
                action="batch_update_devices",
                resource="device_management",
                details={
                    "operation_id": operation.operation_id,
                    "total_count": operation.total_count,
                    "success_count": operation.success_count,
                    "failed_count": operation.failed_count
                }
            )
            
        except Exception as e:
            operation.status = BatchOperationStatus.FAILED
            operation.error_message = str(e)
            self.logger.error(
                "Batch update operation failed",
                operation_id=operation.operation_id,
                error=str(e)
            )
        
        finally:
            operation.end_time = datetime.now(timezone.utc)
        
        return operation
    
    async def import_devices_from_csv(
        self,
        csv_content: str,
        user_id: str,
        validate_only: bool = False
    ) -> BatchOperationResult:
        """从CSV导入设备"""
        operation = BatchOperationResult(
            operation_type=BatchOperationType.IMPORT,
            details={"user_id": user_id, "format": "csv", "validate_only": validate_only}
        )
        
        try:
            # 解析CSV数据
            devices_data = self._parse_csv_devices(csv_content)
            operation.total_count = len(devices_data)
            
            if validate_only:
                # 仅验证数据
                await self._validate_batch_data(operation, devices_data)
            else:
                # 执行导入
                result = await self.batch_add_devices(devices_data, user_id, validate_only=False)
                # 复制结果到当前操作
                operation.status = result.status
                operation.success_count = result.success_count
                operation.failed_count = result.failed_count
                operation.success_items = result.success_items
                operation.failed_items = result.failed_items
                operation.error_message = result.error_message
            
        except Exception as e:
            operation.status = BatchOperationStatus.FAILED
            operation.error_message = str(e)
            self.logger.error(
                "CSV import failed",
                operation_id=operation.operation_id,
                error=str(e)
            )
        
        finally:
            operation.end_time = datetime.now(timezone.utc)
        
        self.operations[operation.operation_id] = operation
        return operation
    
    async def export_devices_to_csv(
        self,
        device_filters: Optional[Dict[str, Any]] = None,
        user_id: Optional[str] = None
    ) -> Tuple[str, int]:
        """导出设备到CSV"""
        try:
            async with get_db_session_context() as session:
                device_repo = DeviceRepository(session)
                
                # 获取设备列表
                devices, total_count = await device_repo.get_devices_paginated(
                    page=1,
                    page_size=10000,  # 导出时获取大量数据
                    **device_filters or {}
                )
                
                # 生成CSV内容
                csv_content = self._generate_csv_content(devices)
                
                # 记录操作日志
                if user_id:
                    await record_user_activity(
                        user_id=user_id,
                        action="export_devices_csv",
                        resource="device_management",
                        details={
                            "total_exported": len(devices),
                            "filters": device_filters
                        }
                    )
                
                return csv_content, len(devices)
                
        except Exception as e:
            self.logger.error("CSV export failed", error=str(e))
            raise
    
    def _parse_csv_devices(self, csv_content: str) -> List[DeviceBatchData]:
        """解析CSV设备数据"""
        devices = []
        reader = csv.DictReader(csv_content.strip().split('\n'))
        
        for row in reader:
            device_data = DeviceBatchData(
                name=row.get('name', '').strip(),
                ip_address=row.get('ip_address', '').strip(),
                device_type=row.get('device_type', 'switch').strip(),
                description=row.get('description', '').strip() or None,
                location=row.get('location', '').strip() or None,
                manufacturer=row.get('manufacturer', '').strip() or None,
                model=row.get('model', '').strip() or None,
                serial_number=row.get('serial_number', '').strip() or None,
                firmware_version=row.get('firmware_version', '').strip() or None,
                snmp_enabled=row.get('snmp_enabled', 'true').lower() == 'true',
                snmp_port=int(row.get('snmp_port', 161)),
                snmp_community=row.get('snmp_community', 'public').strip() or None,
                snmp_version=row.get('snmp_version', 'v2c').strip() or None,
                ssh_enabled=row.get('ssh_enabled', 'false').lower() == 'true',
                ssh_port=int(row.get('ssh_port', 22)),
                ssh_username=row.get('ssh_username', '').strip() or None,
                ssh_password=row.get('ssh_password', '').strip() or None,
                monitoring_enabled=row.get('monitoring_enabled', 'true').lower() == 'true',
                is_active=row.get('is_active', 'true').lower() == 'true'
            )
            devices.append(device_data)
        
        return devices
    
    def _generate_csv_content(self, devices: List[Device]) -> str:
        """生成CSV内容"""
        import io
        
        output = io.StringIO()
        fieldnames = [
            'id', 'name', 'ip_address', 'device_type', 'description', 'location',
            'manufacturer', 'model', 'serial_number', 'firmware_version',
            'status', 'is_active', 'monitoring_enabled',
            'snmp_enabled', 'snmp_port', 'snmp_community', 'snmp_version',
            'ssh_enabled', 'ssh_port', 'ssh_username',
            'created_at', 'updated_at'
        ]
        
        writer = csv.DictWriter(output, fieldnames=fieldnames)
        writer.writeheader()
        
        for device in devices:
            writer.writerow({
                'id': device.id,
                'name': device.name,
                'ip_address': device.ip_address,
                'device_type': device.device_type.value if device.device_type else '',
                'description': device.description or '',
                'location': device.location or '',
                'manufacturer': device.manufacturer or '',
                'model': device.model or '',
                'serial_number': device.serial_number or '',
                'firmware_version': device.firmware_version or '',
                'status': device.status.value if device.status else '',
                'is_active': device.is_active,
                'monitoring_enabled': device.monitoring_enabled,
                'snmp_enabled': device.snmp_enabled,
                'snmp_port': device.snmp_port,
                'snmp_community': device.snmp_community or '',
                'snmp_version': device.snmp_version or '',
                'ssh_enabled': device.ssh_enabled,
                'ssh_port': device.ssh_port,
                'ssh_username': device.ssh_username or '',
                'created_at': device.created_at.isoformat() if device.created_at else '',
                'updated_at': device.updated_at.isoformat() if device.updated_at else ''
            })
        
        return output.getvalue()
    
    async def _validate_batch_data(
        self,
        operation: BatchOperationResult,
        devices_data: List[DeviceBatchData]
    ):
        """验证批量数据"""
        operation.status = BatchOperationStatus.RUNNING
        
        for i, device_data in enumerate(devices_data):
            errors = []
            
            # 验证必填字段
            if not device_data.name:
                errors.append("设备名称不能为空")
            
            if not device_data.ip_address:
                errors.append("IP地址不能为空")
            else:
                # 验证IP地址格式
                import ipaddress
                try:
                    ipaddress.ip_address(device_data.ip_address)
                except ValueError:
                    errors.append("IP地址格式无效")
            
            # 验证设备类型
            try:
                DeviceType(device_data.device_type)
            except ValueError:
                errors.append(f"无效的设备类型: {device_data.device_type}")
            
            # 验证端口范围
            if not (1 <= device_data.snmp_port <= 65535):
                errors.append("SNMP端口范围无效")
            
            if not (1 <= device_data.ssh_port <= 65535):
                errors.append("SSH端口范围无效")
            
            if errors:
                operation.failed_items.append({
                    "index": i,
                    "data": device_data.__dict__,
                    "errors": errors
                })
                operation.failed_count += 1
            else:
                operation.success_items.append({
                    "index": i,
                    "name": device_data.name,
                    "ip_address": device_data.ip_address
                })
                operation.success_count += 1
        
        # 设置验证结果状态
        if operation.failed_count == 0:
            operation.status = BatchOperationStatus.COMPLETED
        elif operation.success_count == 0:
            operation.status = BatchOperationStatus.FAILED
        else:
            operation.status = BatchOperationStatus.PARTIALLY_FAILED
        
        operation.end_time = datetime.now(timezone.utc)
    
    def get_operation_result(self, operation_id: str) -> Optional[BatchOperationResult]:
        """获取操作结果"""
        return self.operations.get(operation_id)
    
    def get_operation_statistics(self) -> Dict[str, Any]:
        """获取操作统计信息"""
        total_operations = len(self.operations)
        running_operations = len(self.running_operations)
        
        status_counts = {}
        for status in BatchOperationStatus:
            status_counts[status.value] = len([
                op for op in self.operations.values() if op.status == status
            ])
        
        type_counts = {}
        for op_type in BatchOperationType:
            type_counts[op_type.value] = len([
                op for op in self.operations.values() if op.operation_type == op_type
            ])
        
        return {
            "total_operations": total_operations,
            "running_operations": running_operations,
            "status_distribution": status_counts,
            "type_distribution": type_counts
        }
    
    async def cleanup_old_operations(self, max_age_hours: int = 24):
        """清理旧的操作记录"""
        cutoff_time = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        cutoff_time = cutoff_time.replace(hour=cutoff_time.hour - max_age_hours)
        
        operations_to_remove = []
        for operation_id, operation in self.operations.items():
            if (operation.end_time and operation.end_time < cutoff_time and 
                operation_id not in self.running_operations):
                operations_to_remove.append(operation_id)
        
        for operation_id in operations_to_remove:
            del self.operations[operation_id]
        
        self.logger.info(f"Cleaned up {len(operations_to_remove)} old batch operations")


# 全局批量服务实例
device_batch_service = DeviceBatchService()
