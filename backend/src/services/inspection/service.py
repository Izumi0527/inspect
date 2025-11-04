"""
巡检服务核心实现
"""
import asyncio
from datetime import datetime
from typing import Dict, List, Optional, Any
import structlog
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.inspection import InspectionStatus, CheckItemStatus, InspectionTrigger
from src.services.device_connection import SNMPService, SSHService, DeviceInfo
from src.services.device_connection.types import CheckResult
from src.repositories.inspection_repository import InspectionRepository

logger = structlog.get_logger()


class InspectionService:
    """巡检服务类"""

    def __init__(
        self,
        snmp_service: Optional[SNMPService] = None,
        ssh_service: Optional[SSHService] = None,
        db_session: Optional[AsyncSession] = None
    ):
        self.active_inspections: Dict[int, Any] = {}  # 保留用于任务取消
        self.snmp_service = snmp_service or SNMPService()
        self.ssh_service = ssh_service or SSHService()
        self.db_session = db_session
        self.logger = logger.bind(service="InspectionService")

    async def execute_inspection(
        self,
        inspection_id: int,
        device_info: Dict[str, Any],
        template_config: Dict[str, Any],
        db_session: Optional[AsyncSession] = None
    ) -> Dict[str, Any]:
        """执行设备巡检并持久化到数据库"""
        session = db_session or self.db_session
        if not session:
            raise ValueError("Database session is required for inspection execution")

        inspection_repo = InspectionRepository(session)

        self.logger.info("Starting inspection",
                        inspection_id=inspection_id,
                        device_ip=device_info.get("ip_address"))

        try:
            # 更新巡检状态为运行中
            await inspection_repo.update_inspection_status(
                inspection_id,
                InspectionStatus.RUNNING
            )

            # 更新内存中的活动巡检状态（用于取消操作）
            self.active_inspections[inspection_id] = {
                "status": InspectionStatus.RUNNING,
                "started_at": datetime.now(),
                "device_info": device_info,
                "results": [],
                "cancelled": False
            }

            results = []
            check_items = template_config.get("check_items", [])
            total_checks = len(check_items)

            # 执行各项检查
            for index, item in enumerate(check_items):
                # 检查是否已取消
                if self.active_inspections.get(inspection_id, {}).get("cancelled"):
                    self.logger.info("Inspection cancelled by user", inspection_id=inspection_id)
                    await inspection_repo.update_inspection_status(
                        inspection_id,
                        InspectionStatus.CANCELLED,
                        error_message="用户取消执行"
                    )
                    return {
                        "inspection_id": inspection_id,
                        "status": InspectionStatus.CANCELLED,
                        "message": "巡检已取消"
                    }

                try:
                    result = await self._execute_check_item(device_info, item)
                    results.append(result.to_dict())

                    # 保存检查结果到数据库
                    await inspection_repo.save_inspection_result(
                        inspection_id=inspection_id,
                        check_item_name=result.check_item_name,
                        check_item_type=result.check_item_type,
                        status=result.status,
                        expected_value=result.expected_value,
                        actual_value=result.actual_value,
                        message=result.message,
                        description=item.get("description"),
                        execution_time=result.execution_time,
                        error_details=result.error_details
                    )

                    # 记录检查项结果到内存
                    self.active_inspections[inspection_id]["results"].append(result.to_dict())

                    # 更新进度
                    completed = index + 1
                    passed = len([r for r in results if r["status"] == CheckItemStatus.PASS])
                    failed = len([r for r in results if r["status"] == CheckItemStatus.FAIL])
                    warnings = len([r for r in results if r["status"] == CheckItemStatus.WARNING])

                    await inspection_repo.update_inspection_progress(
                        inspection_id=inspection_id,
                        total_checks=total_checks,
                        passed_checks=passed,
                        failed_checks=failed,
                        warning_checks=warnings
                    )

                except Exception as e:
                    error_result = CheckResult(
                        check_item_name=item.get("name", "Unknown"),
                        check_item_type=item.get("type", "Unknown"),
                        status=CheckItemStatus.ERROR,
                        message=f"检查项执行失败: {str(e)}",
                        execution_time=0,
                        error_details={"error": str(e)}
                    )
                    results.append(error_result.to_dict())

                    # 保存错误结果到数据库
                    await inspection_repo.save_inspection_result(
                        inspection_id=inspection_id,
                        check_item_name=error_result.check_item_name,
                        check_item_type=error_result.check_item_type,
                        status=error_result.status,
                        message=error_result.message,
                        error_details=error_result.error_details
                    )

                    self.logger.error("Check item failed",
                                   inspection_id=inspection_id,
                                   check_item=item.get("name"),
                                   error=str(e))

            # 统计结果
            total_checks = len(results)
            passed_checks = len([r for r in results if r["status"] == CheckItemStatus.PASS])
            failed_checks = len([r for r in results if r["status"] == CheckItemStatus.FAIL])
            warning_checks = len([r for r in results if r["status"] == CheckItemStatus.WARNING])

            # 更新巡检状态为完成
            await inspection_repo.update_inspection_progress(
                inspection_id=inspection_id,
                total_checks=total_checks,
                passed_checks=passed_checks,
                failed_checks=failed_checks,
                warning_checks=warning_checks
            )

            await inspection_repo.update_inspection_status(
                inspection_id,
                InspectionStatus.COMPLETED
            )

            # 更新内存状态
            self.active_inspections[inspection_id].update({
                "status": InspectionStatus.COMPLETED,
                "completed_at": datetime.now(),
                "total_checks": total_checks,
                "passed_checks": passed_checks,
                "failed_checks": failed_checks
            })

            self.logger.info("Inspection completed",
                           inspection_id=inspection_id,
                           total_checks=total_checks,
                           passed_checks=passed_checks,
                           failed_checks=failed_checks,
                           warning_checks=warning_checks)

            return {
                "inspection_id": inspection_id,
                "status": InspectionStatus.COMPLETED,
                "total_checks": total_checks,
                "passed_checks": passed_checks,
                "failed_checks": failed_checks,
                "warning_checks": warning_checks,
                "results": results
            }

        except Exception as e:
            # 巡检失败，更新数据库
            await inspection_repo.update_inspection_status(
                inspection_id,
                InspectionStatus.FAILED,
                error_message=str(e),
                error_details={"exception": str(e), "type": type(e).__name__}
            )

            # 更新内存状态
            self.active_inspections[inspection_id] = {
                "status": InspectionStatus.FAILED,
                "error_message": str(e),
                "completed_at": datetime.now()
            }

            self.logger.error("Inspection failed",
                            inspection_id=inspection_id,
                            error=str(e),
                            exc_info=True)

            return {
                "inspection_id": inspection_id,
                "status": InspectionStatus.FAILED,
                "error_message": str(e)
            }
        finally:
            # 清理内存中的活动巡检状态（24小时后）
            # 注意：不立即删除，因为可能需要用于取消操作
            pass

    async def cancel_inspection(self, inspection_id: int):
        """取消正在运行的巡检"""
        if inspection_id in self.active_inspections:
            self.active_inspections[inspection_id]["cancelled"] = True
            self.logger.info("Inspection cancellation requested", inspection_id=inspection_id)
    
    async def _execute_check_item(self, device_info: Dict[str, Any], check_item: Dict[str, Any]) -> CheckResult:
        """执行单个检查项"""
        start_time = datetime.now()
        
        check_type = check_item.get("type")
        check_name = check_item.get("name")
        
        try:
            # 导入检查器
            from .checkers import InspectionCheckers
            
            # 创建检查器实例
            checkers = InspectionCheckers(self.snmp_service, self.ssh_service)
            
            # 根据检查类型调用相应方法
            if check_type == "connectivity":
                result = await checkers.check_connectivity(device_info, check_item)
            elif check_type == "cpu_usage":
                result = await checkers.check_cpu_usage(device_info, check_item)
            elif check_type == "memory_usage":
                result = await checkers.check_memory_usage(device_info, check_item)
            elif check_type == "interface_status":
                result = await checkers.check_interface_status(device_info, check_item)
            elif check_type == "uptime":
                result = await checkers.check_uptime(device_info, check_item)
            elif check_type == "configuration":
                result = await checkers.check_configuration(device_info, check_item)
            else:
                result = CheckResult(
                    check_item_name=check_name,
                    check_item_type=check_type,
                    status=CheckItemStatus.SKIP,
                    message=f"不支持的检查类型: {check_type}"
                )
            
            execution_time = int((datetime.now() - start_time).total_seconds() * 1000)
            
            # 更新执行时间和检查项信息
            result.check_item_name = check_name
            result.check_item_type = check_type
            result.execution_time = execution_time
            result.expected_value = check_item.get("expected_value")
            
            return result
            
        except Exception as e:
            execution_time = int((datetime.now() - start_time).total_seconds() * 1000)
            
            return CheckResult(
                check_item_name=check_name,
                check_item_type=check_type,
                status=CheckItemStatus.ERROR,
                message=f"检查项执行异常: {str(e)}",
                execution_time=execution_time,
                error_details={"exception": str(e)}
            )
    
    async def get_inspection_status(self, inspection_id: int) -> Optional[Dict[str, Any]]:
        """获取巡检状态"""
        return self.active_inspections.get(inspection_id)
    
    def get_default_check_items(self, device_type: str) -> List[Dict[str, Any]]:
        """获取默认检查项"""
        common_checks = [
            {
                "name": "连通性检查",
                "type": "connectivity",
                "description": "检查设备是否可达",
                "enabled": True
            },
            {
                "name": "CPU使用率",
                "type": "cpu_usage", 
                "description": "检查CPU使用率",
                "threshold": 80,
                "enabled": True
            },
            {
                "name": "内存使用率",
                "type": "memory_usage",
                "description": "检查内存使用率",
                "threshold": 85,
                "enabled": True
            },
            {
                "name": "设备运行时间",
                "type": "uptime",
                "description": "检查设备运行时间",
                "min_uptime_days": 1,
                "enabled": True
            }
        ]
        
        # 根据设备类型添加特定检查项
        if device_type in ["switch", "router"]:
            common_checks.extend([
                {
                    "name": "接口状态",
                    "type": "interface_status",
                    "description": "检查网络接口状态",
                    "min_up_interfaces": 1,
                    "up_percentage_threshold": 50,
                    "enabled": True
                },
                {
                    "name": "基础配置检查",
                    "type": "configuration",
                    "description": "检查设备基础配置和SSH连通性",
                    "config_items": [
                        {"name": "version_info", "required": True},
                        {"name": "interface_count", "min_value": 1},
                        {"name": "basic_connectivity", "required": True},
                        {"name": "device_model", "required": False},
                        {"name": "software_version", "required": False}
                    ],
                    "enabled": True
                }
            ])
            
            # 针对路由器添加额外检查项
            if device_type == "router":
                common_checks.append({
                    "name": "路由表检查",
                    "type": "configuration",
                    "description": "检查路由表状态",
                    "config_items": [
                        {
                            "name": "route_summary",
                            "command": "show ip route summary", 
                            "expected_pattern": "total",
                            "required": False
                        }
                    ],
                    "enabled": True
                })
        
        elif device_type == "firewall":
            common_checks.extend([
                {
                    "name": "防火墙策略检查",
                    "type": "configuration",
                    "description": "检查防火墙基础配置",
                    "config_items": [
                        {"name": "version_info", "required": True},
                        {"name": "basic_connectivity", "required": True}
                    ],
                    "enabled": True
                }
            ])
        
        elif device_type == "server":
            common_checks.extend([
                {
                    "name": "磁盘使用率",
                    "type": "disk_usage",
                    "description": "检查磁盘使用率",
                    "threshold": 85,
                    "enabled": True
                },
                {
                    "name": "服务状态检查",
                    "type": "configuration",
                    "description": "检查服务器基础状态",
                    "config_items": [
                        {"name": "version_info", "required": True},
                        {"name": "basic_connectivity", "required": True}
                    ],
                    "enabled": True
                }
            ])
        
        return common_checks
    
    async def cancel_inspection(self, inspection_id: int) -> bool:
        """取消巡检"""
        if inspection_id in self.active_inspections:
            inspection = self.active_inspections[inspection_id]
            if inspection["status"] == InspectionStatus.RUNNING:
                inspection["status"] = InspectionStatus.CANCELLED
                inspection["completed_at"] = datetime.now()
                
                self.logger.info("Inspection cancelled", inspection_id=inspection_id)
                return True
        
        return False
    
    async def get_inspection_summary(self, time_range: str = "24h") -> Dict[str, Any]:
        """获取巡检统计摘要"""
        now = datetime.now()
        
        if time_range == "24h":
            start_time = now - timedelta(days=1)
        elif time_range == "7d":
            start_time = now - timedelta(days=7)
        elif time_range == "30d":
            start_time = now - timedelta(days=30)
        else:
            start_time = now - timedelta(days=1)
        
        # 统计活跃巡检
        completed_inspections = []
        failed_inspections = []
        running_inspections = []
        
        for inspection_id, inspection in self.active_inspections.items():
            started_at = inspection.get("started_at")
            if started_at and started_at >= start_time:
                status = inspection.get("status")
                if status == InspectionStatus.COMPLETED:
                    completed_inspections.append(inspection)
                elif status == InspectionStatus.FAILED:
                    failed_inspections.append(inspection)
                elif status == InspectionStatus.RUNNING:
                    running_inspections.append(inspection)
        
        total_inspections = len(completed_inspections) + len(failed_inspections)
        success_rate = (len(completed_inspections) / total_inspections * 100) if total_inspections > 0 else 0
        
        return {
            "time_range": time_range,
            "total_inspections": total_inspections,
            "completed_inspections": len(completed_inspections),
            "failed_inspections": len(failed_inspections),
            "running_inspections": len(running_inspections),
            "success_rate": round(success_rate, 2),
            "summary_generated_at": now.isoformat()
        }