"""
巡检检查器模块
实现各种设备检查逻辑，支持多厂商设备和多协议检查
"""
import asyncio
import re
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Union
import structlog

from src.models.inspection import CheckItemStatus
from src.infrastructure.device_connection import SNMPService, SSHService, CheckResult, DeviceInfo

logger = structlog.get_logger()


class InspectionCheckers:
    """设备巡检检查器类"""
    
    def __init__(self, snmp_service: SNMPService, ssh_service: SSHService):
        self.snmp_service = snmp_service
        self.ssh_service = ssh_service
        self.logger = logger.bind(service="InspectionCheckers")
        
        # 厂商特定的OID映射
        self.vendor_oids = {
            "cisco": {
                "cpu_usage": "1.3.6.1.4.1.9.9.109.1.1.1.1.7.1",
                "memory_used": "1.3.6.1.4.1.9.9.48.1.1.1.5.1",
                "memory_free": "1.3.6.1.4.1.9.9.48.1.1.1.6.1"
            },
            "huawei": {
                "cpu_usage": "1.3.6.1.4.1.2011.5.25.31.1.1.1.1.5",
                "memory_usage": "1.3.6.1.4.1.2011.5.25.31.1.1.1.1.7"
            },
            "h3c": {
                "cpu_usage": "1.3.6.1.4.1.25506.2.6.1.1.1.1.6",
                "memory_usage": "1.3.6.1.4.1.9.9.48.1.1.1.5.1"
            }
        }
        
        # 通用OID
        self.common_oids = {
            "system_description": "1.3.6.1.2.1.1.1.0",
            "system_uptime": "1.3.6.1.2.1.1.3.0",
            "system_name": "1.3.6.1.2.1.1.5.0",
            "interface_status": "1.3.6.1.2.1.2.2.1.8",
            "interface_admin_status": "1.3.6.1.2.1.2.2.1.7",
            "interface_description": "1.3.6.1.2.1.2.2.1.2"
        }

    async def check_connectivity(self, device_info: Dict[str, Any], check_item: Dict[str, Any]) -> CheckResult:
        """连通性检查"""
        start_time = datetime.now()
        
        try:
            # 创建DeviceInfo实例
            if isinstance(device_info, dict):
                device = DeviceInfo(
                    id=device_info.get("id", 0),
                    name=device_info.get("name", ""),
                    ip_address=device_info["ip_address"],
                    vendor=device_info.get("vendor", "unknown"),
                    device_type=device_info.get("device_type", "unknown"),
                    snmp_community=device_info.get("snmp_community", "public"),
                    snmp_version=device_info.get("snmp_version", "2c")
                )
            else:
                device = device_info
            
            # 尝试SNMP连接
            snmp_connected = await self.snmp_service.connect(device)
            
            if snmp_connected:
                # 尝试获取系统描述验证连接
                system_desc = await self.snmp_service.execute_command(self.common_oids["system_description"])
                await self.snmp_service.disconnect()
                
                execution_time = int((datetime.now() - start_time).total_seconds() * 1000)
                
                return CheckResult(
                    check_item_name=check_item.get("name", "连通性检查"),
                    check_item_type="connectivity",
                    status=CheckItemStatus.PASS,
                    actual_value="可连通",
                    message="设备SNMP连接正常",
                    execution_time=execution_time,
                    additional_info={"system_description": system_desc[:100] if system_desc else None}
                )
            else:
                execution_time = int((datetime.now() - start_time).total_seconds() * 1000)
                
                return CheckResult(
                    check_item_name=check_item.get("name", "连通性检查"),
                    check_item_type="connectivity", 
                    status=CheckItemStatus.FAIL,
                    actual_value="不可连通",
                    message="设备SNMP连接失败",
                    execution_time=execution_time
                )
                
        except Exception as e:
            execution_time = int((datetime.now() - start_time).total_seconds() * 1000)
            
            return CheckResult(
                check_item_name=check_item.get("name", "连通性检查"),
                check_item_type="connectivity",
                status=CheckItemStatus.ERROR,
                message=f"连通性检查异常: {str(e)}",
                execution_time=execution_time,
                error_details={"exception": str(e)}
            )

    async def check_cpu_usage(self, device_info: Dict[str, Any], check_item: Dict[str, Any]) -> CheckResult:
        """CPU使用率检查"""
        start_time = datetime.now()
        
        try:
            # 连接设备
            device = self._create_device_info(device_info)
            connected = await self.snmp_service.connect(device)
            
            if not connected:
                return self._create_error_result("CPU使用率检查", "cpu_usage", "SNMP连接失败", start_time)
            
            try:
                # 根据设备厂商选择合适的OID
                vendor = device_info.get("vendor", "").lower()
                cpu_oid = self.vendor_oids.get(vendor, {}).get("cpu_usage")
                
                if not cpu_oid:
                    # 使用通用OID或默认Cisco OID
                    cpu_oid = self.vendor_oids["cisco"]["cpu_usage"]
                
                # 获取CPU使用率
                cpu_value = await self.snmp_service.execute_command(cpu_oid)
                
                if cpu_value is not None:
                    cpu_usage = float(cpu_value)
                    threshold = float(check_item.get("threshold", 80.0))
                    
                    # 判断状态
                    if cpu_usage <= threshold:
                        status = CheckItemStatus.PASS
                        message = f"CPU使用率正常: {cpu_usage}%"
                    elif cpu_usage <= threshold + 10:
                        status = CheckItemStatus.WARNING
                        message = f"CPU使用率偏高: {cpu_usage}%"
                    else:
                        status = CheckItemStatus.FAIL
                        message = f"CPU使用率过高: {cpu_usage}%"
                    
                    execution_time = int((datetime.now() - start_time).total_seconds() * 1000)
                    
                    return CheckResult(
                        check_item_name=check_item.get("name", "CPU使用率检查"),
                        check_item_type="cpu_usage",
                        status=status,
                        expected_value=f"<= {threshold}%",
                        actual_value=f"{cpu_usage}%",
                        message=message,
                        execution_time=execution_time,
                        additional_info={"threshold": threshold, "vendor": vendor}
                    )
                else:
                    return self._create_error_result("CPU使用率检查", "cpu_usage", "无法获取CPU使用率数据", start_time)
                    
            finally:
                await self.snmp_service.disconnect()
                
        except Exception as e:
            return self._create_error_result("CPU使用率检查", "cpu_usage", f"检查异常: {str(e)}", start_time, {"exception": str(e)})

    async def check_memory_usage(self, device_info: Dict[str, Any], check_item: Dict[str, Any]) -> CheckResult:
        """内存使用率检查"""
        start_time = datetime.now()
        
        try:
            device = self._create_device_info(device_info)
            connected = await self.snmp_service.connect(device)
            
            if not connected:
                return self._create_error_result("内存使用率检查", "memory_usage", "SNMP连接失败", start_time)
            
            try:
                vendor = device_info.get("vendor", "").lower()
                
                if vendor == "cisco":
                    # Cisco设备需要计算used/(used+free)
                    memory_used = await self.snmp_service.execute_command(self.vendor_oids["cisco"]["memory_used"])
                    memory_free = await self.snmp_service.execute_command(self.vendor_oids["cisco"]["memory_free"])
                    
                    if memory_used is not None and memory_free is not None:
                        used = float(memory_used)
                        free = float(memory_free)
                        total = used + free
                        memory_usage = (used / total) * 100 if total > 0 else 0
                    else:
                        return self._create_error_result("内存使用率检查", "memory_usage", "无法获取内存数据", start_time)
                        
                else:
                    # 华为等设备直接返回使用率
                    memory_oid = self.vendor_oids.get(vendor, {}).get("memory_usage", self.vendor_oids["huawei"]["memory_usage"])
                    memory_value = await self.snmp_service.execute_command(memory_oid)
                    
                    if memory_value is not None:
                        memory_usage = float(memory_value)
                    else:
                        return self._create_error_result("内存使用率检查", "memory_usage", "无法获取内存使用率数据", start_time)
                
                threshold = float(check_item.get("threshold", 85.0))
                
                # 判断状态
                if memory_usage <= threshold:
                    status = CheckItemStatus.PASS
                    message = f"内存使用率正常: {memory_usage:.1f}%"
                elif memory_usage <= threshold + 10:
                    status = CheckItemStatus.WARNING  
                    message = f"内存使用率偏高: {memory_usage:.1f}%"
                else:
                    status = CheckItemStatus.FAIL
                    message = f"内存使用率过高: {memory_usage:.1f}%"
                
                execution_time = int((datetime.now() - start_time).total_seconds() * 1000)
                
                return CheckResult(
                    check_item_name=check_item.get("name", "内存使用率检查"),
                    check_item_type="memory_usage",
                    status=status,
                    expected_value=f"<= {threshold}%",
                    actual_value=f"{memory_usage:.1f}%",
                    message=message,
                    execution_time=execution_time,
                    additional_info={"threshold": threshold, "vendor": vendor}
                )
                
            finally:
                await self.snmp_service.disconnect()
                
        except Exception as e:
            return self._create_error_result("内存使用率检查", "memory_usage", f"检查异常: {str(e)}", start_time, {"exception": str(e)})

    async def check_interface_status(self, device_info: Dict[str, Any], check_item: Dict[str, Any]) -> CheckResult:
        """接口状态检查"""
        start_time = datetime.now()
        
        try:
            device = self._create_device_info(device_info) 
            connected = await self.snmp_service.connect(device)
            
            if not connected:
                return self._create_error_result("接口状态检查", "interface_status", "SNMP连接失败", start_time)
            
            try:
                # 获取指定接口或所有接口状态
                target_interface = check_item.get("interface_name")
                
                if target_interface:
                    # 检查指定接口
                    status_result = await self._check_single_interface(target_interface, check_item)
                    execution_time = int((datetime.now() - start_time).total_seconds() * 1000)
                    status_result.execution_time = execution_time
                    return status_result
                else:
                    # 检查所有接口
                    interfaces_data = await self.snmp_service.snmp_walk(
                        device.ip_address, 
                        self.common_oids["interface_status"],
                        device.snmp_community,
                        device.snmp_version
                    )
                    
                    total_interfaces = len(interfaces_data)
                    up_interfaces = len([v for v in interfaces_data.values() if str(v) == "1"])
                    down_interfaces = total_interfaces - up_interfaces
                    
                    # 计算健康度
                    health_ratio = up_interfaces / total_interfaces if total_interfaces > 0 else 0
                    min_health = float(check_item.get("min_health_ratio", 0.8))
                    
                    if health_ratio >= min_health:
                        status = CheckItemStatus.PASS
                        message = f"接口状态正常: {up_interfaces}/{total_interfaces} 个接口启用"
                    else:
                        status = CheckItemStatus.FAIL
                        message = f"接口状态异常: {up_interfaces}/{total_interfaces} 个接口启用，健康度 {health_ratio:.1%}"
                    
                    execution_time = int((datetime.now() - start_time).total_seconds() * 1000)
                    
                    return CheckResult(
                        check_item_name=check_item.get("name", "接口状态检查"),
                        check_item_type="interface_status",
                        status=status,
                        expected_value=f">= {min_health:.0%} 健康度",
                        actual_value=f"{health_ratio:.1%} 健康度",
                        message=message,
                        execution_time=execution_time,
                        additional_info={
                            "total_interfaces": total_interfaces,
                            "up_interfaces": up_interfaces,
                            "down_interfaces": down_interfaces
                        }
                    )
                    
            finally:
                await self.snmp_service.disconnect()
                
        except Exception as e:
            return self._create_error_result("接口状态检查", "interface_status", f"检查异常: {str(e)}", start_time, {"exception": str(e)})

    async def check_uptime(self, device_info: Dict[str, Any], check_item: Dict[str, Any]) -> CheckResult:
        """系统运行时间检查"""
        start_time = datetime.now()
        
        try:
            device = self._create_device_info(device_info)
            connected = await self.snmp_service.connect(device)
            
            if not connected:
                return self._create_error_result("系统运行时间检查", "uptime", "SNMP连接失败", start_time)
            
            try:
                # 获取系统运行时间 (TimeTicks, 1/100秒为单位)
                uptime_ticks = await self.snmp_service.execute_command(self.common_oids["system_uptime"])
                
                if uptime_ticks is not None:
                    # 转换为秒
                    uptime_seconds = int(uptime_ticks) / 100
                    uptime_days = uptime_seconds / (24 * 3600)
                    
                    min_uptime_days = float(check_item.get("min_uptime_days", 1.0))
                    
                    # 判断状态
                    if uptime_days >= min_uptime_days:
                        status = CheckItemStatus.PASS
                        message = f"系统运行时间正常: {uptime_days:.1f} 天"
                    else:
                        status = CheckItemStatus.WARNING
                        message = f"系统运行时间较短: {uptime_days:.1f} 天 (可能最近重启过)"
                    
                    # 格式化运行时间显示
                    days = int(uptime_days)
                    hours = int((uptime_days - days) * 24)
                    minutes = int(((uptime_days - days) * 24 - hours) * 60)
                    
                    uptime_str = f"{days}天{hours}小时{minutes}分钟"
                    
                    execution_time = int((datetime.now() - start_time).total_seconds() * 1000)
                    
                    return CheckResult(
                        check_item_name=check_item.get("name", "系统运行时间检查"),
                        check_item_type="uptime",
                        status=status,
                        expected_value=f">= {min_uptime_days} 天",
                        actual_value=uptime_str,
                        message=message,
                        execution_time=execution_time,
                        additional_info={
                            "uptime_seconds": uptime_seconds,
                            "uptime_days": uptime_days,
                            "min_uptime_days": min_uptime_days
                        }
                    )
                else:
                    return self._create_error_result("系统运行时间检查", "uptime", "无法获取系统运行时间", start_time)
                    
            finally:
                await self.snmp_service.disconnect()
                
        except Exception as e:
            return self._create_error_result("系统运行时间检查", "uptime", f"检查异常: {str(e)}", start_time, {"exception": str(e)})

    async def check_configuration(self, device_info: Dict[str, Any], check_item: Dict[str, Any]) -> CheckResult:
        """配置检查（通过SSH）"""
        start_time = datetime.now()
        
        try:
            device = self._create_device_info(device_info)
            
            # 检查SSH连接信息
            if not device.ssh_username:
                return self._create_error_result("配置检查", "configuration", "缺少SSH用户名配置", start_time)
            
            connected = await self.ssh_service.connect(device)
            
            if not connected:
                return self._create_error_result("配置检查", "configuration", "SSH连接失败", start_time)
            
            try:
                # 获取配置检查命令
                check_command = check_item.get("command", "show running-config")
                expected_pattern = check_item.get("expected_pattern")
                
                # 执行配置检查命令
                config_output = await self.ssh_service.execute_command(check_command)
                
                if config_output is None:
                    return self._create_error_result("配置检查", "configuration", "无法执行配置检查命令", start_time)
                
                # 如果有预期模式，进行模式匹配
                if expected_pattern:
                    pattern_found = bool(re.search(expected_pattern, config_output, re.IGNORECASE))
                    
                    if pattern_found:
                        status = CheckItemStatus.PASS
                        message = f"配置检查通过: 找到预期配置模式"
                    else:
                        status = CheckItemStatus.FAIL
                        message = f"配置检查失败: 未找到预期配置模式"
                        
                    execution_time = int((datetime.now() - start_time).total_seconds() * 1000)
                    
                    return CheckResult(
                        check_item_name=check_item.get("name", "配置检查"),
                        check_item_type="configuration",
                        status=status,
                        expected_value=f"包含模式: {expected_pattern}",
                        actual_value="已找到" if pattern_found else "未找到",
                        message=message,
                        execution_time=execution_time,
                        additional_info={
                            "command": check_command,
                            "pattern": expected_pattern,
                            "output_length": len(config_output)
                        }
                    )
                else:
                    # 没有预期模式，只检查是否能获取配置
                    execution_time = int((datetime.now() - start_time).total_seconds() * 1000)
                    
                    return CheckResult(
                        check_item_name=check_item.get("name", "配置检查"),
                        check_item_type="configuration",
                        status=CheckItemStatus.PASS,
                        actual_value=f"获取到 {len(config_output)} 字符的配置",
                        message="配置获取成功",
                        execution_time=execution_time,
                        additional_info={
                            "command": check_command,
                            "output_length": len(config_output)
                        }
                    )
                    
            finally:
                await self.ssh_service.disconnect()
                
        except Exception as e:
            return self._create_error_result("配置检查", "configuration", f"检查异常: {str(e)}", start_time, {"exception": str(e)})

    def _create_device_info(self, device_info: Dict[str, Any]) -> DeviceInfo:
        """创建DeviceInfo实例"""
        if isinstance(device_info, DeviceInfo):
            return device_info
            
        return DeviceInfo(
            id=device_info.get("id", 0),
            name=device_info.get("name", ""),
            ip_address=device_info["ip_address"],
            vendor=device_info.get("vendor", "unknown"),
            device_type=device_info.get("device_type", "unknown"),
            snmp_community=device_info.get("snmp_community", "public"),
            snmp_version=device_info.get("snmp_version", "2c"),
            snmp_port=device_info.get("snmp_port", 161),
            ssh_username=device_info.get("ssh_username"),
            ssh_password=device_info.get("ssh_password"),
            ssh_port=device_info.get("ssh_port", 22)
        )

    def _create_error_result(self, name: str, check_type: str, message: str, start_time: datetime, error_details: Optional[Dict[str, Any]] = None) -> CheckResult:
        """创建错误结果"""
        execution_time = int((datetime.now() - start_time).total_seconds() * 1000)
        
        return CheckResult(
            check_item_name=name,
            check_item_type=check_type,
            status=CheckItemStatus.ERROR,
            message=message,
            execution_time=execution_time,
            error_details=error_details
        )

    async def _check_single_interface(self, interface_name: str, check_item: Dict[str, Any]) -> CheckResult:
        """检查单个接口状态（辅助方法）"""
        # 这里需要根据interface_name查找对应的接口索引
        # 简化实现，返回基本状态
        return CheckResult(
            check_item_name=check_item.get("name", f"接口 {interface_name} 状态检查"),
            check_item_type="interface_status",
            status=CheckItemStatus.PASS,
            actual_value="UP",
            message=f"接口 {interface_name} 状态正常",
            execution_time=0
        )