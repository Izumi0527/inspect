import asyncio
import json
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Union
from enum import Enum
import structlog
import subprocess
import platform
from concurrent.futures import ThreadPoolExecutor
from netmiko import ConnectHandler
from pysnmp.hlapi import *
from pysnmp.proto import rfc1902
from src.core.config import settings
from src.models.inspection import InspectionStatus, CheckItemStatus

logger = structlog.get_logger()

class DeviceConnectionType(str, Enum):
    SNMP = "snmp"
    SSH = "ssh"
    TELNET = "telnet"
    HTTP = "http"

class SNMPService:
    """SNMP查询服务类"""
    
    def __init__(self):
        self.thread_executor = ThreadPoolExecutor(max_workers=10)
        
        # 常用OID映射表
        self.common_oids = {
            # 系统信息
            "system_description": "1.3.6.1.2.1.1.1.0",
            "system_uptime": "1.3.6.1.2.1.1.3.0",
            "system_name": "1.3.6.1.2.1.1.5.0",
            
            # CPU使用率 (不同厂商)
            "cisco_cpu_1min": "1.3.6.1.4.1.9.9.109.1.1.1.1.7.1",
            "cisco_cpu_5min": "1.3.6.1.4.1.9.9.109.1.1.1.1.8.1",
            "huawei_cpu": "1.3.6.1.4.1.2011.5.25.31.1.1.1.1.5",
            "h3c_cpu": "1.3.6.1.4.1.25506.2.6.1.1.1.1.6",
            
            # 内存使用率
            "cisco_memory_used": "1.3.6.1.4.1.9.9.48.1.1.1.5.1",
            "cisco_memory_free": "1.3.6.1.4.1.9.9.48.1.1.1.6.1",
            "huawei_memory": "1.3.6.1.4.1.2011.5.25.31.1.1.1.1.7",
            
            # 接口信息
            "interface_status": "1.3.6.1.2.1.2.2.1.8",  # ifOperStatus
            "interface_admin_status": "1.3.6.1.2.1.2.2.1.7",  # ifAdminStatus
            "interface_description": "1.3.6.1.2.1.2.2.1.2",  # ifDescr
            "interface_speed": "1.3.6.1.2.1.2.2.1.5",  # ifSpeed
            
            # 流量统计
            "interface_in_octets": "1.3.6.1.2.1.2.2.1.10",  # ifInOctets
            "interface_out_octets": "1.3.6.1.2.1.2.2.1.16",  # ifOutOctets
        }
        
        # 厂商特定的OID选择
        self.vendor_oids = {
            "cisco": {
                "cpu_usage": "cisco_cpu_1min",
                "memory_usage": "cisco_memory_used"
            },
            "huawei": {
                "cpu_usage": "huawei_cpu",
                "memory_usage": "huawei_memory"
            },
            "h3c": {
                "cpu_usage": "h3c_cpu",
                "memory_usage": "cisco_memory_used"  # H3C使用类似Cisco的内存OID
            }
        }
    
    async def snmp_get(
        self, 
        ip: str, 
        oid: str, 
        community: str = "public",
        version: str = "2c",
        port: int = 161,
        timeout: int = 5,
        retries: int = 1
    ) -> Optional[Union[int, str, bytes]]:
        """执行SNMP GET操作"""
        try:
            # 使用线程池执行同步的SNMP查询
            result = await asyncio.get_event_loop().run_in_executor(
                self.thread_executor,
                self._sync_snmp_get,
                ip, oid, community, version, port, timeout, retries
            )
            return result
        except Exception as e:
            logger.error("SNMP GET failed", 
                        ip=ip, oid=oid, error=str(e))
            return None
    
    def _sync_snmp_get(
        self, 
        ip: str, 
        oid: str, 
        community: str,
        version: str,
        port: int,
        timeout: int,
        retries: int
    ) -> Optional[Union[int, str, bytes]]:
        """同步执行SNMP GET"""
        try:
            # 构建SNMP版本对象
            if version == "1":
                mp_model = 0
            elif version == "2c":
                mp_model = 1
            else:
                mp_model = 1  # 默认使用v2c
            
            # 执行SNMP查询
            for (errorIndication, errorStatus, errorIndex, varBinds) in getCmd(
                SnmpEngine(),
                CommunityData(community, mpModel=mp_model),
                UdpTransportTarget((ip, port), timeout=timeout, retries=retries),
                ContextData(),
                ObjectType(ObjectIdentity(oid))
            ):
                if errorIndication:
                    logger.warning("SNMP error indication", 
                                 ip=ip, error=str(errorIndication))
                    return None
                elif errorStatus:
                    logger.warning("SNMP error status",
                                 ip=ip, error=f"{errorStatus.prettyPrint()} at {errorIndex and varBinds[int(errorIndex) - 1][0] or '?'}")
                    return None
                else:
                    # 成功获取数据
                    for varBind in varBinds:
                        value = varBind[1]
                        
                        # 转换数据类型
                        if isinstance(value, rfc1902.Integer):
                            return int(value)
                        elif isinstance(value, rfc1902.Counter32):
                            return int(value)
                        elif isinstance(value, rfc1902.Counter64):
                            return int(value)
                        elif isinstance(value, rfc1902.Gauge32):
                            return int(value)
                        elif isinstance(value, rfc1902.OctetString):
                            try:
                                return value.asOctets().decode('utf-8')
                            except:
                                return str(value)
                        elif isinstance(value, rfc1902.TimeTicks):
                            return int(value)
                        else:
                            return str(value)
                            
            return None
            
        except Exception as e:
            logger.error("Sync SNMP GET failed", 
                        ip=ip, oid=oid, error=str(e))
            return None
    
    async def snmp_walk(
        self, 
        ip: str, 
        oid: str, 
        community: str = "public",
        version: str = "2c",
        port: int = 161,
        timeout: int = 5
    ) -> Dict[str, Union[int, str]]:
        """执行SNMP WALK操作"""
        try:
            result = await asyncio.get_event_loop().run_in_executor(
                self.thread_executor,
                self._sync_snmp_walk,
                ip, oid, community, version, port, timeout
            )
            return result or {}
        except Exception as e:
            logger.error("SNMP WALK failed", 
                        ip=ip, oid=oid, error=str(e))
            return {}
    
    def _sync_snmp_walk(
        self, 
        ip: str, 
        oid: str, 
        community: str,
        version: str,
        port: int,
        timeout: int
    ) -> Dict[str, Union[int, str]]:
        """同步执行SNMP WALK"""
        results = {}
        
        try:
            # 构建SNMP版本对象
            if version == "1":
                mp_model = 0
            elif version == "2c":
                mp_model = 1
            else:
                mp_model = 1
            
            # 执行SNMP WALK
            for (errorIndication, errorStatus, errorIndex, varBinds) in nextCmd(
                SnmpEngine(),
                CommunityData(community, mpModel=mp_model),
                UdpTransportTarget((ip, port), timeout=timeout),
                ContextData(),
                ObjectType(ObjectIdentity(oid)),
                lexicographicMode=False,
                ignoreNonIncreasingOid=True,
                maxRows=100  # 限制最大返回行数
            ):
                if errorIndication:
                    logger.warning("SNMP WALK error indication", 
                                 ip=ip, error=str(errorIndication))
                    break
                elif errorStatus:
                    logger.warning("SNMP WALK error status",
                                 ip=ip, error=f"{errorStatus.prettyPrint()} at {errorIndex and varBinds[int(errorIndex) - 1][0] or '?'}")
                    break
                else:
                    # 处理返回的数据
                    for varBind in varBinds:
                        oid_str = str(varBind[0])
                        value = varBind[1]
                        
                        # 转换数据类型
                        if isinstance(value, rfc1902.Integer):
                            results[oid_str] = int(value)
                        elif isinstance(value, rfc1902.Counter32):
                            results[oid_str] = int(value)
                        elif isinstance(value, rfc1902.Counter64):
                            results[oid_str] = int(value)
                        elif isinstance(value, rfc1902.Gauge32):
                            results[oid_str] = int(value)
                        elif isinstance(value, rfc1902.OctetString):
                            try:
                                results[oid_str] = value.asOctets().decode('utf-8')
                            except:
                                results[oid_str] = str(value)
                        elif isinstance(value, rfc1902.TimeTicks):
                            results[oid_str] = int(value)
                        else:
                            results[oid_str] = str(value)
            
            return results
            
        except Exception as e:
            logger.error("Sync SNMP WALK failed", 
                        ip=ip, oid=oid, error=str(e))
            return {}
    
    def get_oid_by_metric(self, metric_name: str, vendor: str = "cisco") -> Optional[str]:
        """根据指标名称和厂商获取对应的OID"""
        vendor = vendor.lower()
        
        # 直接匹配通用OID
        if metric_name in self.common_oids:
            return self.common_oids[metric_name]
        
        # 根据厂商匹配特定OID
        if vendor in self.vendor_oids and metric_name in self.vendor_oids[vendor]:
            oid_key = self.vendor_oids[vendor][metric_name]
            return self.common_oids.get(oid_key)
        
        return None
    
    async def get_system_info(self, ip: str, community: str = "public") -> Dict[str, Any]:
        """获取系统基础信息"""
        info = {}
        
        # 并发获取系统信息
        tasks = [
            self.snmp_get(ip, self.common_oids["system_description"], community),
            self.snmp_get(ip, self.common_oids["system_uptime"], community),
            self.snmp_get(ip, self.common_oids["system_name"], community),
        ]
        
        try:
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            info["system_description"] = results[0] if not isinstance(results[0], Exception) else None
            info["system_uptime"] = results[1] if not isinstance(results[1], Exception) else None
            info["system_name"] = results[2] if not isinstance(results[2], Exception) else None
            
            # 尝试从系统描述中识别厂商
            if info["system_description"]:
                desc = info["system_description"].lower()
                if "cisco" in desc:
                    info["detected_vendor"] = "cisco"
                elif "huawei" in desc:
                    info["detected_vendor"] = "huawei"
                elif "h3c" in desc or "3com" in desc:
                    info["detected_vendor"] = "h3c"
                else:
                    info["detected_vendor"] = "unknown"
            
            return info
            
        except Exception as e:
            logger.error("Failed to get system info", 
                        ip=ip, error=str(e))
            return {}
    
    async def get_performance_metrics(self, ip: str, community: str = "public", vendor: str = "cisco") -> Dict[str, Any]:
        """获取设备性能指标"""
        metrics = {}
        vendor = vendor.lower()
        
        try:
            # 获取CPU使用率
            cpu_oid = self.get_oid_by_metric("cpu_usage", vendor)
            if cpu_oid:
                cpu_usage = await self.snmp_get(ip, cpu_oid, community)
                metrics["cpu_usage"] = cpu_usage
            
            # 获取内存使用率
            memory_oid = self.get_oid_by_metric("memory_usage", vendor)
            if memory_oid:
                memory_usage = await self.snmp_get(ip, memory_oid, community)
                metrics["memory_usage"] = memory_usage
                
            # 如果是Cisco设备，还需要获取内存总量来计算使用率
            if vendor == "cisco" and memory_usage:
                memory_free_oid = self.common_oids["cisco_memory_free"]
                memory_free = await self.snmp_get(ip, memory_free_oid, community)
                if memory_free:
                    total_memory = memory_usage + memory_free
                    if total_memory > 0:
                        metrics["memory_usage_percent"] = round((memory_usage / total_memory) * 100, 2)
            
            return metrics
            
        except Exception as e:
            logger.error("Failed to get performance metrics", 
                        ip=ip, vendor=vendor, error=str(e))
            return {}
    
    async def get_interface_status(self, ip: str, community: str = "public") -> List[Dict[str, Any]]:
        """获取接口状态信息"""
        interfaces = []
        
        try:
            # 并发获取接口信息
            tasks = [
                self.snmp_walk(ip, self.common_oids["interface_description"], community),
                self.snmp_walk(ip, self.common_oids["interface_status"], community),
                self.snmp_walk(ip, self.common_oids["interface_admin_status"], community),
                self.snmp_walk(ip, self.common_oids["interface_speed"], community),
            ]
            
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            descriptions = results[0] if not isinstance(results[0], Exception) else {}
            oper_status = results[1] if not isinstance(results[1], Exception) else {}
            admin_status = results[2] if not isinstance(results[2], Exception) else {}
            speeds = results[3] if not isinstance(results[3], Exception) else {}
            
            # 整合接口信息
            interface_indices = set()
            for oid in descriptions.keys():
                # 从OID中提取接口索引 (e.g., 1.3.6.1.2.1.2.2.1.2.1 -> 1)
                index = oid.split('.')[-1]
                interface_indices.add(index)
            
            for index in interface_indices:
                interface_info = {
                    "index": index,
                    "description": descriptions.get(f"{self.common_oids['interface_description']}.{index}", ""),
                    "operational_status": self._convert_interface_status(
                        oper_status.get(f"{self.common_oids['interface_status']}.{index}")
                    ),
                    "admin_status": self._convert_interface_status(
                        admin_status.get(f"{self.common_oids['interface_admin_status']}.{index}")
                    ),
                    "speed": speeds.get(f"{self.common_oids['interface_speed']}.{index}", 0),
                }
                interfaces.append(interface_info)
            
            return interfaces
            
        except Exception as e:
            logger.error("Failed to get interface status", 
                        ip=ip, error=str(e))
            return []
    
    def _convert_interface_status(self, status_code: Optional[int]) -> str:
        """转换接口状态码为可读字符串"""
        if status_code is None:
            return "unknown"
        
        status_map = {
            1: "up",
            2: "down", 
            3: "testing",
            4: "unknown",
            5: "dormant",
            6: "notPresent",
            7: "lowerLayerDown"
        }
        return status_map.get(status_code, "unknown")
    
    async def get_interface_traffic(self, ip: str, community: str = "public") -> List[Dict[str, Any]]:
        """获取接口流量统计"""
        traffic_stats = []
        
        try:
            # 并发获取接口流量数据
            tasks = [
                self.snmp_walk(ip, self.common_oids["interface_description"], community),
                self.snmp_walk(ip, self.common_oids["interface_in_octets"], community),
                self.snmp_walk(ip, self.common_oids["interface_out_octets"], community),
            ]
            
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            descriptions = results[0] if not isinstance(results[0], Exception) else {}
            in_octets = results[1] if not isinstance(results[1], Exception) else {}
            out_octets = results[2] if not isinstance(results[2], Exception) else {}
            
            # 提取接口索引
            interface_indices = set()
            for oid in descriptions.keys():
                index = oid.split('.')[-1]
                interface_indices.add(index)
            
            for index in interface_indices:
                traffic_info = {
                    "index": index,
                    "description": descriptions.get(f"{self.common_oids['interface_description']}.{index}", ""),
                    "in_octets": in_octets.get(f"{self.common_oids['interface_in_octets']}.{index}", 0),
                    "out_octets": out_octets.get(f"{self.common_oids['interface_out_octets']}.{index}", 0),
                    "timestamp": datetime.now().isoformat()
                }
                traffic_stats.append(traffic_info)
            
            return traffic_stats
            
        except Exception as e:
            logger.error("Failed to get interface traffic", 
                        ip=ip, error=str(e))
            return []
    
    async def batch_snmp_get(self, ip: str, oids: List[str], community: str = "public") -> Dict[str, Any]:
        """批量SNMP查询优化"""
        try:
            tasks = [self.snmp_get(ip, oid, community) for oid in oids]
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # 组装结果
            batch_results = {}
            for i, oid in enumerate(oids):
                if not isinstance(results[i], Exception):
                    batch_results[oid] = results[i]
                else:
                    batch_results[oid] = None
                    logger.warning("Batch SNMP GET failed for OID", 
                                 ip=ip, oid=oid, error=str(results[i]))
            
            return batch_results
            
        except Exception as e:
            logger.error("Batch SNMP GET failed", 
                        ip=ip, error=str(e))
            return {}
    
    async def check_snmp_availability(self, ip: str, community: str = "public", timeout: int = 3) -> bool:
        """检查SNMP连通性"""
        try:
            result = await self.snmp_get(ip, self.common_oids["system_description"], community, timeout=timeout)
            return result is not None
        except:
            return False

class SSHService:
    """SSH设备连接服务类"""
    
    def __init__(self):
        self.thread_executor = ThreadPoolExecutor(max_workers=5)
        
        # 厂商设备类型映射
        self.device_type_mapping = {
            "cisco": {
                "router": "cisco_ios",
                "switch": "cisco_ios", 
                "firewall": "cisco_asa",
                "nexus": "cisco_nxos"
            },
            "huawei": {
                "router": "huawei",
                "switch": "huawei",
                "firewall": "huawei_vrpv8"
            },
            "h3c": {
                "router": "hp_comware",
                "switch": "hp_comware"
            },
            "juniper": {
                "router": "juniper_junos",
                "switch": "juniper_junos",
                "firewall": "juniper_junos"
            },
            "arista": {
                "switch": "arista_eos"
            }
        }
        
        # 常用命令映射
        self.command_mapping = {
            "cisco_ios": {
                "show_version": "show version",
                "show_interfaces": "show interfaces status",
                "show_running_config": "show running-config",
                "show_cpu": "show processes cpu",
                "show_memory": "show memory statistics",
                "show_inventory": "show inventory",
                "show_ip_route": "show ip route summary"
            },
            "huawei": {
                "show_version": "display version",
                "show_interfaces": "display interface brief",
                "show_running_config": "display current-configuration",
                "show_cpu": "display cpu-usage",
                "show_memory": "display memory-usage",
                "show_device": "display device",
                "show_ip_route": "display ip routing-table statistics"
            },
            "hp_comware": {
                "show_version": "display version",
                "show_interfaces": "display interface brief",
                "show_running_config": "display current-configuration",
                "show_cpu": "display cpu-usage",
                "show_memory": "display memory",
                "show_device": "display device manuinfo"
            },
            "juniper_junos": {
                "show_version": "show version",
                "show_interfaces": "show interfaces terse",
                "show_running_config": "show configuration",
                "show_cpu": "show chassis routing-engine",
                "show_memory": "show system memory",
                "show_chassis": "show chassis hardware"
            }
        }
    
    async def connect_device(
        self, 
        device_info: dict, 
        timeout: int = 30
    ) -> Optional[Dict[str, Any]]:
        """连接到网络设备并获取基础信息"""
        try:
            connection_info = self._prepare_connection_info(device_info, timeout)
            if not connection_info:
                return None
            
            # 使用线程池执行SSH连接
            result = await asyncio.get_event_loop().run_in_executor(
                self.thread_executor,
                self._sync_connect_device,
                connection_info
            )
            
            return result
            
        except Exception as e:
            logger.error("SSH connection failed", 
                        ip=device_info.get("ip_address"),
                        error=str(e))
            return None
    
    def _prepare_connection_info(self, device_info: dict, timeout: int) -> Optional[Dict[str, Any]]:
        """准备SSH连接信息"""
        try:
            ip_address = device_info.get("ip_address")
            username = device_info.get("ssh_username")
            password = device_info.get("ssh_password")
            vendor = device_info.get("vendor", "cisco").lower()
            device_type = device_info.get("device_type", "switch").lower()
            
            if not all([ip_address, username, password]):
                logger.warning("SSH credentials incomplete", 
                             ip=ip_address, 
                             has_username=bool(username),
                             has_password=bool(password))
                return None
            
            # 获取netmiko设备类型
            netmiko_device_type = self._get_netmiko_device_type(vendor, device_type)
            
            connection_info = {
                "device_type": netmiko_device_type,
                "host": ip_address,
                "username": username,
                "password": password,
                "timeout": timeout,
                "session_timeout": timeout * 2,
                "banner_timeout": 15,
                "conn_timeout": 15,
                "auth_timeout": 15
            }
            
            # 添加可选的SSH端口
            if device_info.get("ssh_port"):
                connection_info["port"] = int(device_info["ssh_port"])
            
            return connection_info
            
        except Exception as e:
            logger.error("Failed to prepare SSH connection info", 
                        device_info=device_info, error=str(e))
            return None
    
    def _get_netmiko_device_type(self, vendor: str, device_type: str) -> str:
        """根据厂商和设备类型获取netmiko设备类型"""
        vendor = vendor.lower()
        device_type = device_type.lower()
        
        if vendor in self.device_type_mapping:
            vendor_mapping = self.device_type_mapping[vendor]
            if device_type in vendor_mapping:
                return vendor_mapping[device_type]
            else:
                # 返回该厂商的默认设备类型
                return list(vendor_mapping.values())[0]
        
        # 默认返回cisco_ios
        return "cisco_ios"
    
    def _sync_connect_device(self, connection_info: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """同步执行SSH连接"""
        connection = None
        try:
            # 建立SSH连接
            connection = ConnectHandler(**connection_info)
            
            if not connection:
                logger.error("Failed to establish SSH connection")
                return None
            
            # 获取设备类型以确定命令
            device_type = connection_info["device_type"]
            commands = self.command_mapping.get(device_type, self.command_mapping["cisco_ios"])
            
            # 收集设备基础信息
            device_info = {
                "connected": True,
                "device_type": device_type,
                "connection_time": datetime.now().isoformat(),
                "commands_available": list(commands.keys())
            }
            
            # 获取版本信息
            try:
                version_output = connection.send_command(
                    commands["show_version"], 
                    use_textfsm=False
                )
                device_info["version_info"] = version_output[:500]  # 限制长度
                
                # 尝试解析版本信息
                device_info.update(self._parse_version_info(version_output, device_type))
                
            except Exception as e:
                logger.warning("Failed to get version info", error=str(e))
                device_info["version_error"] = str(e)
            
            # 获取接口信息
            try:
                interface_output = connection.send_command(
                    commands["show_interfaces"], 
                    use_textfsm=False
                )
                device_info["interface_count"] = self._count_interfaces(interface_output, device_type)
                
            except Exception as e:
                logger.warning("Failed to get interface info", error=str(e))
            
            return device_info
            
        except Exception as e:
            logger.error("SSH connection execution failed", 
                        host=connection_info.get("host"),
                        error=str(e))
            return {
                "connected": False,
                "error": str(e),
                "connection_time": datetime.now().isoformat()
            }
        
        finally:
            if connection:
                try:
                    connection.disconnect()
                except:
                    pass
    
    def _parse_version_info(self, version_output: str, device_type: str) -> Dict[str, str]:
        """解析版本信息"""
        info = {}
        try:
            lines = version_output.lower()
            
            if "cisco" in device_type:
                if "cisco ios software" in lines:
                    # 解析Cisco IOS信息
                    for line in version_output.split('\n'):
                        if 'version' in line.lower() and 'cisco ios' in line.lower():
                            info["software_version"] = line.strip()[:100]
                            break
                elif "cisco nx-os" in lines:
                    info["software_type"] = "Cisco NX-OS"
                
            elif "huawei" in device_type:
                for line in version_output.split('\n'):
                    if 'vrp' in line.lower() or 'version' in line.lower():
                        if len(line.strip()) > 10:
                            info["software_version"] = line.strip()[:100]
                            break
            
            # 尝试提取设备型号
            model_keywords = ["model", "product", "hardware", "device"]
            for line in version_output.split('\n'):
                line_lower = line.lower()
                for keyword in model_keywords:
                    if keyword in line_lower and len(line.strip()) < 200:
                        info["device_model"] = line.strip()[:100]
                        break
                if "device_model" in info:
                    break
                    
        except Exception as e:
            logger.warning("Failed to parse version info", error=str(e))
        
        return info
    
    def _count_interfaces(self, interface_output: str, device_type: str) -> int:
        """统计接口数量"""
        try:
            lines = interface_output.split('\n')
            interface_count = 0
            
            for line in lines:
                line = line.strip().lower()
                if not line:
                    continue
                    
                # 跳过标题行和分隔符
                if any(keyword in line for keyword in ["interface", "port", "status", "----", "name"]):
                    if "----" in line or "interface" in line:
                        continue
                
                # 统计有效的接口行
                if any(interface_type in line for interface_type in 
                       ["gigabitethernet", "fastethernet", "ethernet", "ge", "fe", "eth", "port"]):
                    interface_count += 1
                elif any(status in line for status in ["up", "down", "disabled"]):
                    interface_count += 1
                    
            return min(interface_count, 100)  # 限制最大值
            
        except Exception as e:
            logger.warning("Failed to count interfaces", error=str(e))
            return 0
    
    async def execute_command(
        self, 
        device_info: dict, 
        command: str, 
        timeout: int = 30
    ) -> Optional[str]:
        """在设备上执行单个命令"""
        try:
            connection_info = self._prepare_connection_info(device_info, timeout)
            if not connection_info:
                return None
                
            result = await asyncio.get_event_loop().run_in_executor(
                self.thread_executor,
                self._sync_execute_command,
                connection_info,
                command
            )
            
            return result
            
        except Exception as e:
            logger.error("SSH command execution failed", 
                        ip=device_info.get("ip_address"),
                        command=command,
                        error=str(e))
            return None
    
    def _sync_execute_command(
        self, 
        connection_info: Dict[str, Any], 
        command: str
    ) -> Optional[str]:
        """同步执行SSH命令"""
        connection = None
        try:
            connection = ConnectHandler(**connection_info)
            
            # 执行命令
            output = connection.send_command(command, use_textfsm=False)
            
            return output
            
        except Exception as e:
            logger.error("Sync SSH command execution failed", 
                        host=connection_info.get("host"),
                        command=command,
                        error=str(e))
            return None
        
        finally:
            if connection:
                try:
                    connection.disconnect()
                except:
                    pass
    
    async def backup_configuration(
        self, 
        device_info: dict, 
        timeout: int = 60
    ) -> Optional[str]:
        """备份设备配置"""
        try:
            vendor = device_info.get("vendor", "cisco").lower()
            device_type = device_info.get("device_type", "switch").lower()
            netmiko_type = self._get_netmiko_device_type(vendor, device_type)
            
            commands = self.command_mapping.get(netmiko_type, self.command_mapping["cisco_ios"])
            config_command = commands.get("show_running_config", "show running-config")
            
            # 执行配置备份命令
            config_output = await self.execute_command(device_info, config_command, timeout)
            
            if config_output:
                logger.info("Configuration backup successful", 
                           ip=device_info.get("ip_address"),
                           config_length=len(config_output))
                return config_output
            else:
                logger.warning("Configuration backup failed - no output", 
                             ip=device_info.get("ip_address"))
                return None
                
        except Exception as e:
            logger.error("Configuration backup failed", 
                        ip=device_info.get("ip_address"),
                        error=str(e))
            return None

class InspectionService:
    """巡检服务类"""
    
    def __init__(self):
        self.active_inspections: Dict[int, Any] = {}
        self.snmp_service = SNMPService()  # 初始化SNMP服务
        self.ssh_service = SSHService()    # 初始化SSH服务
    
    async def execute_inspection(self, inspection_id: int, device_info: dict, template_config: dict) -> dict:
        """执行设备巡检"""
        logger.info("Starting inspection", 
                   inspection_id=inspection_id, 
                   device_ip=device_info.get("ip_address"))
        
        try:
            # 更新巡检状态为运行中
            self.active_inspections[inspection_id] = {
                "status": InspectionStatus.RUNNING,
                "started_at": datetime.now(),
                "device_info": device_info,
                "results": []
            }
            
            results = []
            check_items = template_config.get("check_items", [])
            
            # 执行各项检查
            for item in check_items:
                try:
                    result = await self._execute_check_item(device_info, item)
                    results.append(result)
                    
                    # 记录检查项结果
                    self.active_inspections[inspection_id]["results"].append(result)
                    
                except Exception as e:
                    error_result = {
                        "check_item_name": item.get("name", "Unknown"),
                        "check_item_type": item.get("type", "Unknown"),
                        "status": CheckItemStatus.ERROR,
                        "message": f"检查项执行失败: {str(e)}",
                        "execution_time": 0,
                        "error_details": {"error": str(e)}
                    }
                    results.append(error_result)
                    logger.error("Check item failed", 
                               inspection_id=inspection_id,
                               check_item=item.get("name"),
                               error=str(e))
            
            # 统计结果
            total_checks = len(results)
            passed_checks = len([r for r in results if r["status"] == CheckItemStatus.PASS])
            failed_checks = len([r for r in results if r["status"] == CheckItemStatus.FAIL])
            
            # 更新巡检状态为完成
            self.active_inspections[inspection_id].update({
                "status": InspectionStatus.COMPLETED,
                "completed_at": datetime.now(),
                "total_checks": total_checks,
                "passed_checks": passed_checks,
                "failed_checks": failed_checks
            })
            
            logger.info("Inspection completed", 
                       inspection_id=inspection_id,
                       total_checks=total_checks,
                       passed_checks=passed_checks,
                       failed_checks=failed_checks)
            
            return {
                "inspection_id": inspection_id,
                "status": InspectionStatus.COMPLETED,
                "total_checks": total_checks,
                "passed_checks": passed_checks,
                "failed_checks": failed_checks,
                "results": results
            }
            
        except Exception as e:
            # 巡检失败
            self.active_inspections[inspection_id] = {
                "status": InspectionStatus.FAILED,
                "error_message": str(e),
                "completed_at": datetime.now()
            }
            
            logger.error("Inspection failed", 
                        inspection_id=inspection_id, 
                        error=str(e))
            
            return {
                "inspection_id": inspection_id,
                "status": InspectionStatus.FAILED,
                "error_message": str(e)
            }
    
    async def _execute_check_item(self, device_info: dict, check_item: dict) -> dict:
        """执行单个检查项"""
        start_time = datetime.now()
        
        check_type = check_item.get("type")
        check_name = check_item.get("name")
        
        try:
            if check_type == "connectivity":
                result = await self._check_connectivity(device_info, check_item)
            elif check_type == "cpu_usage":
                result = await self._check_cpu_usage(device_info, check_item)
            elif check_type == "memory_usage":
                result = await self._check_memory_usage(device_info, check_item)
            elif check_type == "interface_status":
                result = await self._check_interface_status(device_info, check_item)
            elif check_type == "uptime":
                result = await self._check_uptime(device_info, check_item)
            elif check_type == "configuration":
                result = await self._check_configuration(device_info, check_item)
            else:
                result = {
                    "status": CheckItemStatus.SKIP,
                    "message": f"不支持的检查类型: {check_type}"
                }
            
            execution_time = int((datetime.now() - start_time).total_seconds() * 1000)
            
            return {
                "check_item_name": check_name,
                "check_item_type": check_type,
                "status": result["status"],
                "expected_value": check_item.get("expected_value"),
                "actual_value": result.get("actual_value"),
                "message": result.get("message", ""),
                "execution_time": execution_time,
                "error_details": result.get("error_details")
            }
            
        except Exception as e:
            execution_time = int((datetime.now() - start_time).total_seconds() * 1000)
            
            return {
                "check_item_name": check_name,
                "check_item_type": check_type,
                "status": CheckItemStatus.ERROR,
                "message": f"检查项执行异常: {str(e)}",
                "execution_time": execution_time,
                "error_details": {"exception": str(e)}
            }
    
    async def _check_connectivity(self, device_info: dict, check_item: dict) -> dict:
        """检查设备连通性"""
        ip_address = device_info.get("ip_address")
        
        # 简单的ping检查（在实际环境中应该使用真正的ping）
        import subprocess
        import platform
        
        try:
            # 根据操作系统选择ping命令
            ping_cmd = ["ping", "-n", "1"] if platform.system() == "Windows" else ["ping", "-c", "1"]
            ping_cmd.append(ip_address)
            
            result = subprocess.run(ping_cmd, capture_output=True, text=True, timeout=5)
            
            if result.returncode == 0:
                return {
                    "status": CheckItemStatus.PASS,
                    "actual_value": "可达",
                    "message": "设备连通正常"
                }
            else:
                return {
                    "status": CheckItemStatus.FAIL,
                    "actual_value": "不可达",
                    "message": "设备连通失败"
                }
                
        except subprocess.TimeoutExpired:
            return {
                "status": CheckItemStatus.FAIL,
                "actual_value": "超时",
                "message": "连通性检查超时"
            }
        except Exception as e:
            return {
                "status": CheckItemStatus.ERROR,
                "message": f"连通性检查异常: {str(e)}",
                "error_details": {"exception": str(e)}
            }
    
    async def _check_cpu_usage(self, device_info: dict, check_item: dict) -> dict:
        """检查CPU使用率"""
        try:
            ip_address = device_info.get("ip_address")
            vendor = device_info.get("vendor", "cisco").lower()
            
            # 获取适当的CPU使用率OID
            cpu_oid = self.snmp_service.get_oid_by_metric("cpu_usage", vendor)
            
            if not cpu_oid:
                # 如果找不到特定厂商的OID，尝试常用的Cisco OID
                cpu_oid = self.snmp_service.common_oids["cisco_cpu_1min"]
            
            # 通过SNMP获取CPU使用率
            cpu_usage = await self._get_snmp_value(device_info, cpu_oid)
            
            if cpu_usage is not None and isinstance(cpu_usage, (int, float)):
                threshold = check_item.get("threshold", 80)
                
                if cpu_usage <= threshold:
                    status = CheckItemStatus.PASS
                    message = f"CPU使用率正常: {cpu_usage}%"
                else:
                    status = CheckItemStatus.FAIL
                    message = f"CPU使用率过高: {cpu_usage}% (阈值: {threshold}%)"
                
                return {
                    "status": status,
                    "actual_value": f"{cpu_usage}%",
                    "message": message
                }
            else:
                # SNMP查询失败，尝试备选方案或返回错误
                if vendor == "cisco":
                    # 尝试5分钟平均值
                    fallback_oid = self.snmp_service.common_oids["cisco_cpu_5min"]
                    cpu_usage = await self._get_snmp_value(device_info, fallback_oid)
                    
                    if cpu_usage is not None and isinstance(cpu_usage, (int, float)):
                        threshold = check_item.get("threshold", 80)
                        status = CheckItemStatus.PASS if cpu_usage <= threshold else CheckItemStatus.FAIL
                        message = f"CPU使用率(5min平均): {cpu_usage}%"
                        
                        return {
                            "status": status,
                            "actual_value": f"{cpu_usage}%",
                            "message": message
                        }
                
                return {
                    "status": CheckItemStatus.ERROR,
                    "message": f"无法获取CPU使用率数据 (厂商: {vendor})"
                }
                
        except Exception as e:
            return {
                "status": CheckItemStatus.ERROR,
                "message": f"CPU检查异常: {str(e)}",
                "error_details": {"exception": str(e)}
            }
    
    async def _check_memory_usage(self, device_info: dict, check_item: dict) -> dict:
        """检查内存使用率"""
        try:
            vendor = device_info.get("vendor", "cisco").lower()
            
            # 获取内存使用率，不同厂商处理方式不同
            if vendor == "cisco":
                # Cisco设备需要计算已用内存 / (已用内存 + 空闲内存)
                used_oid = self.snmp_service.common_oids["cisco_memory_used"]
                free_oid = self.snmp_service.common_oids["cisco_memory_free"]
                
                # 并发获取已用和空闲内存
                used_memory, free_memory = await asyncio.gather(
                    self._get_snmp_value(device_info, used_oid),
                    self._get_snmp_value(device_info, free_oid),
                    return_exceptions=True
                )
                
                if (used_memory is not None and free_memory is not None and 
                    not isinstance(used_memory, Exception) and 
                    not isinstance(free_memory, Exception)):
                    
                    total_memory = used_memory + free_memory
                    if total_memory > 0:
                        memory_usage = round((used_memory / total_memory) * 100, 2)
                    else:
                        memory_usage = 0
                        
                elif used_memory is not None and not isinstance(used_memory, Exception):
                    # 如果只能获取已用内存，假设它是百分比形式
                    memory_usage = used_memory
                else:
                    memory_usage = None
                    
            else:
                # 华为、H3C等其他厂商
                memory_oid = self.snmp_service.get_oid_by_metric("memory_usage", vendor)
                if memory_oid:
                    memory_usage = await self._get_snmp_value(device_info, memory_oid)
                else:
                    memory_usage = None
            
            if memory_usage is not None and isinstance(memory_usage, (int, float)):
                threshold = check_item.get("threshold", 85)
                
                if memory_usage <= threshold:
                    status = CheckItemStatus.PASS
                    message = f"内存使用率正常: {memory_usage}%"
                else:
                    status = CheckItemStatus.FAIL
                    message = f"内存使用率过高: {memory_usage}% (阈值: {threshold}%)"
                
                return {
                    "status": status,
                    "actual_value": f"{memory_usage}%",
                    "message": message
                }
            else:
                return {
                    "status": CheckItemStatus.ERROR,
                    "message": f"无法获取内存使用率数据 (厂商: {vendor})"
                }
            
        except Exception as e:
            return {
                "status": CheckItemStatus.ERROR,
                "message": f"内存检查异常: {str(e)}",
                "error_details": {"exception": str(e)}
            }
    
    async def _check_interface_status(self, device_info: dict, check_item: dict) -> dict:
        """检查接口状态"""
        try:
            # 获取接口操作状态和管理状态
            interface_status_oid = self.snmp_service.common_oids["interface_status"]
            interface_admin_oid = self.snmp_service.common_oids["interface_admin_status"]
            interface_desc_oid = self.snmp_service.common_oids["interface_description"]
            
            # 并发获取接口信息
            status_data, admin_data, desc_data = await asyncio.gather(
                self.snmp_service.snmp_walk(
                    device_info.get("ip_address"), 
                    interface_status_oid, 
                    device_info.get("snmp_community", "public")
                ),
                self.snmp_service.snmp_walk(
                    device_info.get("ip_address"), 
                    interface_admin_oid, 
                    device_info.get("snmp_community", "public")
                ),
                self.snmp_service.snmp_walk(
                    device_info.get("ip_address"), 
                    interface_desc_oid, 
                    device_info.get("snmp_community", "public")
                ),
                return_exceptions=True
            )
            
            if isinstance(status_data, Exception) or not status_data:
                return {
                    "status": CheckItemStatus.ERROR,
                    "message": "无法获取接口状态数据"
                }
            
            # 分析接口状态
            interfaces = {}
            total_interfaces = 0
            up_interfaces = 0
            down_interfaces = 0
            admin_down_interfaces = 0
            
            # 处理接口操作状态 (1=up, 2=down, 3=testing, 4=unknown, 5=dormant, 6=notPresent, 7=lowerLayerDown)
            for oid, status in status_data.items():
                if isinstance(status, int):
                    interface_index = oid.split('.')[-1]
                    interfaces[interface_index] = {"oper_status": status}
                    total_interfaces += 1
                    if status == 1:  # up
                        up_interfaces += 1
                    elif status == 2:  # down
                        down_interfaces += 1
            
            # 处理接口管理状态 (1=up, 2=down, 3=testing)
            if not isinstance(admin_data, Exception) and admin_data:
                for oid, admin_status in admin_data.items():
                    if isinstance(admin_status, int):
                        interface_index = oid.split('.')[-1]
                        if interface_index in interfaces:
                            interfaces[interface_index]["admin_status"] = admin_status
                            if admin_status == 2:  # admin down
                                admin_down_interfaces += 1
            
            # 处理接口描述
            if not isinstance(desc_data, Exception) and desc_data:
                for oid, desc in desc_data.items():
                    interface_index = oid.split('.')[-1]
                    if interface_index in interfaces:
                        interfaces[interface_index]["description"] = str(desc)
            
            if total_interfaces == 0:
                return {
                    "status": CheckItemStatus.WARNING,
                    "actual_value": "0/0",
                    "message": "未发现网络接口"
                }
            
            # 计算有效接口（排除loopback等虚拟接口）
            effective_interfaces = []
            for idx, info in interfaces.items():
                desc = info.get("description", "").lower()
                # 过滤掉loopback、null、管理接口等
                if not any(keyword in desc for keyword in ["loopback", "null", "vlan", "tunnel", "management"]):
                    if len(desc) > 0:  # 有描述的接口通常是物理接口
                        effective_interfaces.append((idx, info))
            
            effective_total = len(effective_interfaces)
            effective_up = sum(1 for idx, info in effective_interfaces if info.get("oper_status") == 1)
            
            # 设置阈值检查
            min_up_interfaces = check_item.get("min_up_interfaces", 1)
            up_percentage_threshold = check_item.get("up_percentage_threshold", 50)  # 50%的接口应该是up状态
            
            if effective_total == 0:
                status = CheckItemStatus.WARNING
                message = "未发现有效的物理网络接口"
                actual_value = f"0/0"
            else:
                up_percentage = (effective_up / effective_total) * 100
                
                if effective_up >= min_up_interfaces and up_percentage >= up_percentage_threshold:
                    status = CheckItemStatus.PASS
                    message = f"接口状态正常: {effective_up}/{effective_total} 个接口UP ({up_percentage:.1f}%)"
                elif effective_up >= min_up_interfaces:
                    status = CheckItemStatus.WARNING
                    message = f"接口状态警告: {effective_up}/{effective_total} 个接口UP ({up_percentage:.1f}%)"
                else:
                    status = CheckItemStatus.FAIL
                    message = f"接口状态异常: {effective_up}/{effective_total} 个接口UP ({up_percentage:.1f}%)"
                
                actual_value = f"{effective_up}/{effective_total}"
            
            return {
                "status": status,
                "actual_value": actual_value,
                "message": message,
                "additional_info": {
                    "total_interfaces": total_interfaces,
                    "effective_interfaces": effective_total,
                    "up_interfaces": effective_up,
                    "down_interfaces": effective_total - effective_up,
                    "admin_down_interfaces": admin_down_interfaces
                }
            }
            
        except Exception as e:
            return {
                "status": CheckItemStatus.ERROR,
                "message": f"接口检查异常: {str(e)}",
                "error_details": {"exception": str(e)}
            }
    
    async def _check_uptime(self, device_info: dict, check_item: dict) -> dict:
        """检查设备运行时间"""
        try:
            # 获取系统运行时间 (sysUpTime)
            uptime_oid = self.snmp_service.common_oids["system_uptime"]
            uptime_ticks = await self._get_snmp_value(device_info, uptime_oid)
            
            if uptime_ticks is not None and isinstance(uptime_ticks, (int, float)):
                # sysUpTime返回的是百分之一秒的ticks，转换为天数
                uptime_seconds = uptime_ticks / 100
                uptime_days = uptime_seconds / 86400
                uptime_hours = (uptime_seconds % 86400) / 3600
                uptime_minutes = (uptime_seconds % 3600) / 60
                
                # 格式化运行时间显示
                if uptime_days >= 1:
                    uptime_str = f"{int(uptime_days)}天{int(uptime_hours)}小时{int(uptime_minutes)}分钟"
                elif uptime_hours >= 1:
                    uptime_str = f"{int(uptime_hours)}小时{int(uptime_minutes)}分钟"
                else:
                    uptime_str = f"{int(uptime_minutes)}分钟"
                
                min_uptime_days = check_item.get("min_uptime_days", 1)
                
                if uptime_days >= min_uptime_days:
                    status = CheckItemStatus.PASS
                    message = f"设备运行时间正常: {uptime_str}"
                elif uptime_days >= 0.5:  # 12小时以上但不足最小要求
                    status = CheckItemStatus.WARNING
                    message = f"设备运行时间较短: {uptime_str} (最小要求: {min_uptime_days}天)"
                else:
                    status = CheckItemStatus.FAIL
                    message = f"设备刚重启: {uptime_str} (最小要求: {min_uptime_days}天)"
                
                return {
                    "status": status,
                    "actual_value": uptime_str,
                    "message": message,
                    "additional_info": {
                        "uptime_days": round(uptime_days, 2),
                        "uptime_seconds": int(uptime_seconds),
                        "uptime_ticks": uptime_ticks
                    }
                }
            else:
                return {
                    "status": CheckItemStatus.ERROR,
                    "message": "无法获取设备运行时间数据"
                }
            
        except Exception as e:
            return {
                "status": CheckItemStatus.ERROR,
                "message": f"运行时间检查异常: {str(e)}",
                "error_details": {"exception": str(e)}
            }
    
    async def _check_configuration(self, device_info: dict, check_item: dict) -> dict:
        """检查设备配置"""
        try:
            # 检查是否配置了SSH凭据
            if not all([device_info.get("ssh_username"), device_info.get("ssh_password")]):
                return {
                    "status": CheckItemStatus.SKIP,
                    "message": "配置检查需要SSH凭据，已跳过"
                }
            
            # 尝试SSH连接并获取设备信息
            ssh_info = await self.ssh_service.connect_device(device_info)
            
            if not ssh_info or not ssh_info.get("connected"):
                return {
                    "status": CheckItemStatus.ERROR,
                    "message": f"SSH连接失败: {ssh_info.get('error', 'Unknown error') if ssh_info else 'Connection failed'}"
                }
            
            # 获取配置检查项
            config_items = check_item.get("config_items", [])
            if not config_items:
                # 默认配置检查项
                config_items = [
                    {"name": "version_info", "required": True},
                    {"name": "interface_count", "min_value": 1},
                    {"name": "basic_connectivity", "required": True}
                ]
            
            passed_items = 0
            total_items = len(config_items)
            check_results = []
            
            # 执行各项配置检查
            for item in config_items:
                item_name = item.get("name", "unknown")
                required = item.get("required", False)
                min_value = item.get("min_value")
                
                try:
                    if item_name == "version_info":
                        # 检查版本信息
                        if ssh_info.get("version_info"):
                            passed_items += 1
                            check_results.append(f"✓ 版本信息获取成功")
                        else:
                            if required:
                                check_results.append(f"✗ 版本信息获取失败 (必需)")
                            else:
                                check_results.append(f"⚠ 版本信息获取失败 (可选)")
                                passed_items += 0.5
                                
                    elif item_name == "interface_count":
                        # 检查接口数量
                        interface_count = ssh_info.get("interface_count", 0)
                        if min_value and interface_count >= min_value:
                            passed_items += 1
                            check_results.append(f"✓ 接口数量正常 ({interface_count}个)")
                        elif min_value:
                            check_results.append(f"✗ 接口数量不足 ({interface_count}个, 最小: {min_value}个)")
                        else:
                            passed_items += 1
                            check_results.append(f"✓ 接口检测完成 ({interface_count}个)")
                            
                    elif item_name == "basic_connectivity":
                        # 基础连通性已通过SSH连接验证
                        passed_items += 1
                        check_results.append(f"✓ SSH连通性正常")
                        
                    elif item_name == "device_model":
                        # 检查设备型号信息
                        if ssh_info.get("device_model"):
                            passed_items += 1
                            model = ssh_info["device_model"][:50] + "..." if len(ssh_info["device_model"]) > 50 else ssh_info["device_model"]
                            check_results.append(f"✓ 设备型号: {model}")
                        else:
                            if required:
                                check_results.append(f"✗ 设备型号信息缺失 (必需)")
                            else:
                                check_results.append(f"⚠ 设备型号信息缺失 (可选)")
                                passed_items += 0.5
                                
                    elif item_name == "software_version":
                        # 检查软件版本
                        if ssh_info.get("software_version"):
                            passed_items += 1
                            version = ssh_info["software_version"][:50] + "..." if len(ssh_info["software_version"]) > 50 else ssh_info["software_version"]
                            check_results.append(f"✓ 软件版本: {version}")
                        else:
                            if required:
                                check_results.append(f"✗ 软件版本信息缺失 (必需)")
                            else:
                                check_results.append(f"⚠ 软件版本信息缺失 (可选)")
                                passed_items += 0.5
                    
                    else:
                        # 自定义配置项检查
                        command = item.get("command")
                        if command:
                            output = await self.ssh_service.execute_command(device_info, command)
                            if output:
                                expected = item.get("expected_pattern", "")
                                if not expected or expected.lower() in output.lower():
                                    passed_items += 1
                                    check_results.append(f"✓ {item_name}: 检查通过")
                                else:
                                    check_results.append(f"✗ {item_name}: 检查失败")
                            else:
                                check_results.append(f"✗ {item_name}: 命令执行失败")
                        else:
                            check_results.append(f"⚠ {item_name}: 未配置检查命令")
                            passed_items += 0.5
                
                except Exception as e:
                    logger.warning("Configuration item check failed", 
                                 item=item_name, error=str(e))
                    check_results.append(f"✗ {item_name}: 检查异常 - {str(e)}")
            
            # 计算通过率
            pass_rate = (passed_items / total_items) * 100 if total_items > 0 else 0
            
            # 确定检查状态
            if pass_rate >= 90:
                status = CheckItemStatus.PASS
                message = f"配置检查通过: {passed_items:.1f}/{total_items} 项 ({pass_rate:.1f}%)"
            elif pass_rate >= 70:
                status = CheckItemStatus.WARNING
                message = f"配置检查警告: {passed_items:.1f}/{total_items} 项 ({pass_rate:.1f}%)"
            else:
                status = CheckItemStatus.FAIL
                message = f"配置检查失败: {passed_items:.1f}/{total_items} 项 ({pass_rate:.1f}%)"
            
            return {
                "status": status,
                "actual_value": f"{passed_items:.1f}/{total_items}",
                "message": message,
                "additional_info": {
                    "pass_rate": round(pass_rate, 1),
                    "check_results": check_results,
                    "ssh_connection_info": {
                        "device_type": ssh_info.get("device_type"),
                        "connection_time": ssh_info.get("connection_time"),
                        "commands_available": ssh_info.get("commands_available", [])
                    }
                }
            }
            
        except Exception as e:
            return {
                "status": CheckItemStatus.ERROR,
                "message": f"配置检查异常: {str(e)}",
                "error_details": {"exception": str(e)}
            }
    
    async def _get_snmp_value(self, device_info: dict, oid: str) -> Optional[Union[int, str]]:
        """通过SNMP获取设备数据"""
        try:
            ip_address = device_info.get("ip_address")
            if not ip_address:
                logger.warning("Device IP address not found", device_info=device_info)
                return None
            
            # 获取SNMP配置
            community = device_info.get("snmp_community", "public")
            version = device_info.get("snmp_version", "2c")
            
            # 执行SNMP查询
            result = await self.snmp_service.snmp_get(
                ip=ip_address,
                oid=oid,
                community=community,
                version=version
            )
            
            if result is not None:
                logger.debug("SNMP query successful", 
                           ip=ip_address, oid=oid, value=result)
                return result
            else:
                logger.warning("SNMP query returned no data", 
                             ip=ip_address, oid=oid)
                return None
                
        except Exception as e:
            logger.error("SNMP query failed", 
                        device_ip=device_info.get("ip_address"),
                        oid=oid,
                        error=str(e))
            return None
    
    async def get_inspection_status(self, inspection_id: int) -> Optional[dict]:
        """获取巡检状态"""
        return self.active_inspections.get(inspection_id)
    
    def get_default_check_items(self, device_type: str) -> List[dict]:
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
            
            # 针对路由器添加额外的检查项
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
            # 服务器类型设备的特殊检查项
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

# 全局巡检服务实例
inspection_service = InspectionService()