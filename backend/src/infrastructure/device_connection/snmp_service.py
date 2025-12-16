"""
SNMP设备连接和查询服务

提供SNMP v1/v2c/v3协议支持，包括:
- 单值查询 (GET)
- 批量查询 (WALK)
- 系统信息获取
- 性能指标采集
- 接口状态监控
"""
import asyncio
from datetime import datetime
from typing import Dict, List, Optional, Any, Union
from concurrent.futures import ThreadPoolExecutor
import structlog

from pysnmp.hlapi import *
from pysnmp.proto import rfc1902

from src.infrastructure.device_connection.base import DeviceConnection
from src.infrastructure.device_connection.types import SNMPConfig, DeviceInfo

logger = structlog.get_logger()


class SNMPService(DeviceConnection):
    """SNMP查询服务类"""
    
    def __init__(self):
        super().__init__()
        self.thread_executor = ThreadPoolExecutor(max_workers=10)
        
        # 常用OID映射表
        self.common_oids = {
            "system_description": "1.3.6.1.2.1.1.1.0",
            "system_uptime": "1.3.6.1.2.1.1.3.0",
            "system_name": "1.3.6.1.2.1.1.5.0",
            "cisco_cpu_1min": "1.3.6.1.4.1.9.9.109.1.1.1.1.7.1",
            "cisco_cpu_5min": "1.3.6.1.4.1.9.9.109.1.1.1.1.8.1",
            "huawei_cpu": "1.3.6.1.4.1.2011.5.25.31.1.1.1.1.5",
            "h3c_cpu": "1.3.6.1.4.1.25506.2.6.1.1.1.1.6",
            "cisco_memory_used": "1.3.6.1.4.1.9.9.48.1.1.1.5.1",
            "cisco_memory_free": "1.3.6.1.4.1.9.9.48.1.1.1.6.1",
            "huawei_memory": "1.3.6.1.4.1.2011.5.25.31.1.1.1.1.7",
            "interface_status": "1.3.6.1.2.1.2.2.1.8",
            "interface_admin_status": "1.3.6.1.2.1.2.2.1.7",
            "interface_description": "1.3.6.1.2.1.2.2.1.2",
            "interface_speed": "1.3.6.1.2.1.2.2.1.5",
            "interface_in_octets": "1.3.6.1.2.1.2.2.1.10",
            "interface_out_octets": "1.3.6.1.2.1.2.2.1.16",
        }
        
        self.vendor_oids = {
            "cisco": {"cpu_usage": "cisco_cpu_1min", "memory_usage": "cisco_memory_used"},
            "huawei": {"cpu_usage": "huawei_cpu", "memory_usage": "huawei_memory"},
            "h3c": {"cpu_usage": "h3c_cpu", "memory_usage": "cisco_memory_used"}
        }
        
        self._connected = False
        self._current_config: Optional[SNMPConfig] = None
    
    async def connect(self, device_info: Union[Dict[str, Any], DeviceInfo]) -> bool:
        """连接到SNMP设备"""
        try:
            if isinstance(device_info, dict):
                config = SNMPConfig(
                    ip=device_info["ip_address"],
                    community=device_info.get("snmp_community", "public"),
                    version=device_info.get("snmp_version", "2c"),
                    port=device_info.get("snmp_port", 161),
                    username=device_info.get("snmp_username"),
                    auth_protocol=device_info.get("snmp_auth_protocol"),
                    auth_password=device_info.get("snmp_auth_password"),
                    priv_protocol=device_info.get("snmp_priv_protocol"),
                    priv_password=device_info.get("snmp_priv_password"),
                    security_level=device_info.get("snmp_security_level", "noAuthNoPriv")
                )
            else:
                config = SNMPConfig(
                    ip=device_info.ip_address,
                    community=device_info.snmp_community,
                    version=device_info.snmp_version,
                    port=device_info.snmp_port,
                    username=device_info.snmp_username,
                    auth_protocol=device_info.snmp_auth_protocol,
                    auth_password=device_info.snmp_auth_password,
                    priv_protocol=device_info.snmp_priv_protocol,
                    priv_password=device_info.snmp_priv_password,
                    security_level=device_info.snmp_security_level
                )
            
            success = await self.check_snmp_availability_v3(config)
            if success:
                self._connected = True
                self._current_config = config
                self.logger.info("SNMP connection established", ip=config.ip, version=config.version)
            
            return success
            
        except Exception as e:
            self.logger.error("SNMP connection failed", error=str(e))
            return False
    
    async def disconnect(self) -> None:
        """断开SNMP连接"""
        self._connected = False
        self._current_config = None
        self.logger.info("SNMP connection closed")
    
    async def is_connected(self) -> bool:
        """检查连接状态"""
        return self._connected
    
    async def execute_command(self, command: str) -> Optional[str]:
        """执行SNMP查询（command为OID）"""
        if not self._connected or not self._current_config:
            return None
        
        if self._current_config.version == "3":
            result = await self.snmp_get_v3(self._current_config.ip, command, self._current_config)
        else:
            result = await self.snmp_get(
                self._current_config.ip, command,
                self._current_config.community, self._current_config.version, self._current_config.port
            )
        
        return str(result) if result is not None else None
    
    async def snmp_get(
        self, ip: str, oid: str, community: str = "public",
        version: str = "2c", port: int = 161, timeout: int = 5, retries: int = 1
    ) -> Optional[Union[int, str, bytes]]:
        """执行SNMP GET操作"""
        try:
            result = await asyncio.get_event_loop().run_in_executor(
                self.thread_executor, self._sync_snmp_get,
                ip, oid, community, version, port, timeout, retries
            )
            return result
        except Exception as e:
            self.logger.error("SNMP GET failed", ip=ip, oid=oid, error=str(e))
            return None
    
    def _sync_snmp_get(
        self, ip: str, oid: str, community: str, version: str,
        port: int, timeout: int, retries: int
    ) -> Optional[Union[int, str, bytes]]:
        """同步执行SNMP GET"""
        try:
            mp_model = 0 if version == "1" else 1
            
            for (errorIndication, errorStatus, errorIndex, varBinds) in getCmd(
                SnmpEngine(),
                CommunityData(community, mpModel=mp_model),
                UdpTransportTarget((ip, port), timeout=timeout, retries=retries),
                ContextData(),
                ObjectType(ObjectIdentity(oid))
            ):
                if errorIndication:
                    self.logger.warning("SNMP error indication", ip=ip, error=str(errorIndication))
                    return None
                elif errorStatus:
                    self.logger.warning("SNMP error status", ip=ip, 
                        error=f"{errorStatus.prettyPrint()} at {errorIndex and varBinds[int(errorIndex) - 1][0] or '?'}")
                    return None
                else:
                    for varBind in varBinds:
                        return self._convert_snmp_value(varBind[1])
            return None
        except Exception as e:
            self.logger.error("Sync SNMP GET failed", ip=ip, oid=oid, error=str(e))
            return None
    
    def _convert_snmp_value(self, value) -> Union[int, str]:
        """转换SNMP返回值"""
        if isinstance(value, (rfc1902.Integer, rfc1902.Counter32, rfc1902.Counter64, 
                             rfc1902.Gauge32, rfc1902.TimeTicks)):
            return int(value)
        elif isinstance(value, rfc1902.OctetString):
            try:
                return value.asOctets().decode('utf-8')
            except:
                return str(value)
        else:
            return str(value)
    
    async def snmp_walk(
        self, ip: str, oid: str, community: str = "public",
        version: str = "2c", port: int = 161, timeout: int = 5
    ) -> Dict[str, Union[int, str]]:
        """执行SNMP WALK操作"""
        try:
            result = await asyncio.get_event_loop().run_in_executor(
                self.thread_executor, self._sync_snmp_walk,
                ip, oid, community, version, port, timeout
            )
            return result or {}
        except Exception as e:
            self.logger.error("SNMP WALK failed", ip=ip, oid=oid, error=str(e))
            return {}
    
    def _sync_snmp_walk(
        self, ip: str, oid: str, community: str, version: str, port: int, timeout: int
    ) -> Dict[str, Union[int, str]]:
        """同步执行SNMP WALK"""
        results = {}
        try:
            mp_model = 0 if version == "1" else 1
            
            for (errorIndication, errorStatus, errorIndex, varBinds) in nextCmd(
                SnmpEngine(),
                CommunityData(community, mpModel=mp_model),
                UdpTransportTarget((ip, port), timeout=timeout),
                ContextData(),
                ObjectType(ObjectIdentity(oid)),
                lexicographicMode=False,
                ignoreNonIncreasingOid=True,
                maxRows=100
            ):
                if errorIndication or errorStatus:
                    break
                for varBind in varBinds:
                    oid_str = str(varBind[0])
                    value = self._convert_snmp_value(varBind[1])
                    results[oid_str] = value
            return results
        except Exception as e:
            self.logger.error("Sync SNMP WALK failed", ip=ip, oid=oid, error=str(e))
            return {}
    
    def get_oid_by_metric(self, metric_name: str, vendor: str = "cisco") -> Optional[str]:
        """根据指标名称和厂商获取对应的OID"""
        vendor = vendor.lower()
        if metric_name in self.common_oids:
            return self.common_oids[metric_name]
        if vendor in self.vendor_oids and metric_name in self.vendor_oids[vendor]:
            oid_key = self.vendor_oids[vendor][metric_name]
            return self.common_oids.get(oid_key)
        return None
    
    async def get_system_info(self, ip: str, community: str = "public") -> Dict[str, Any]:
        """获取系统基础信息"""
        info = {}
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
            self.logger.error("Failed to get system info", ip=ip, error=str(e))
            return {}
    
    async def get_performance_metrics(self, ip: str, community: str = "public", vendor: str = "cisco") -> Dict[str, Any]:
        """获取设备性能指标"""
        metrics = {}
        vendor = vendor.lower()
        
        try:
            cpu_oid = self.get_oid_by_metric("cpu_usage", vendor)
            if cpu_oid:
                cpu_usage = await self.snmp_get(ip, cpu_oid, community)
                metrics["cpu_usage"] = cpu_usage
            
            memory_oid = self.get_oid_by_metric("memory_usage", vendor)
            if memory_oid:
                memory_usage = await self.snmp_get(ip, memory_oid, community)
                metrics["memory_usage"] = memory_usage
                
            if vendor == "cisco" and memory_usage:
                memory_free_oid = self.common_oids["cisco_memory_free"]
                memory_free = await self.snmp_get(ip, memory_free_oid, community)
                if memory_free:
                    total_memory = memory_usage + memory_free
                    if total_memory > 0:
                        metrics["memory_usage_percent"] = round((memory_usage / total_memory) * 100, 2)
            return metrics
        except Exception as e:
            self.logger.error("Failed to get performance metrics", ip=ip, vendor=vendor, error=str(e))
            return {}
    
    async def get_interface_status(self, ip: str, community: str = "public") -> List[Dict[str, Any]]:
        """获取接口状态信息"""
        interfaces = []
        try:
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
            
            interface_indices = set()
            for oid in descriptions.keys():
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
            self.logger.error("Failed to get interface status", ip=ip, error=str(e))
            return []
    
    def _convert_interface_status(self, status_code: Optional[int]) -> str:
        """转换接口状态码为可读字符串"""
        if status_code is None:
            return "unknown"
        status_map = {1: "up", 2: "down", 3: "testing", 4: "unknown",
                     5: "dormant", 6: "notPresent", 7: "lowerLayerDown"}
        return status_map.get(status_code, "unknown")
    
    async def check_snmp_availability(self, ip: str, community: str = "public", timeout: int = 3) -> bool:
        """检查SNMP连通性"""
        try:
            result = await self.snmp_get(ip, self.common_oids["system_description"], community, timeout=timeout)
            return result is not None
        except:
            return False
    
    async def check_snmp_availability_v3(self, config: SNMPConfig, timeout: int = 3) -> bool:
        """检查SNMP v3连通性"""
        try:
            if config.version == "3":
                result = await self.snmp_get_v3(config.ip, self.common_oids["system_description"], config, timeout=timeout)
            else:
                result = await self.snmp_get(config.ip, self.common_oids["system_description"], 
                                            config.community, config.version, timeout=timeout)
            return result is not None
        except:
            return False
    
    def _create_auth_data(self, config: SNMPConfig):
        """创建SNMP认证数据对象"""
        if config.version == "3":
            auth_protocol_map = {
                "MD5": usmHMACMD5AuthProtocol, "SHA": usmHMACSHAAuthProtocol,
                "SHA224": usmHMAC128SHA224AuthProtocol, "SHA256": usmHMAC192SHA256AuthProtocol,
                "SHA384": usmHMAC256SHA384AuthProtocol, "SHA512": usmHMAC384SHA512AuthProtocol
            }
            priv_protocol_map = {
                "DES": usmDESPrivProtocol, "3DES": usm3DESEDEPrivProtocol,
                "AES": usmAesCfb128Protocol, "AES192": usmAesCfb192Protocol, "AES256": usmAesCfb256Protocol
            }
            
            if config.security_level == "noAuthNoPriv":
                return UsmUserData(config.username)
            elif config.security_level == "authNoPriv":
                auth_protocol = auth_protocol_map.get(config.auth_protocol.upper(), usmHMACMD5AuthProtocol)
                return UsmUserData(config.username, config.auth_password, authProtocol=auth_protocol)
            elif config.security_level == "authPriv":
                auth_protocol = auth_protocol_map.get(config.auth_protocol.upper(), usmHMACMD5AuthProtocol)
                priv_protocol = priv_protocol_map.get(config.priv_protocol.upper(), usmDESPrivProtocol)
                return UsmUserData(config.username, config.auth_password, config.priv_password,
                                  authProtocol=auth_protocol, privProtocol=priv_protocol)
        else:
            mp_model = 0 if config.version == "1" else 1
            return CommunityData(config.community, mpModel=mp_model)
    
    async def snmp_get_v3(
        self, ip: str, oid: str, config: SNMPConfig, timeout: int = 5, retries: int = 1
    ) -> Optional[Union[int, str, bytes]]:
        """执行SNMP v3 GET操作"""
        try:
            result = await asyncio.get_event_loop().run_in_executor(
                self.thread_executor, self._sync_snmp_get_v3, ip, oid, config, timeout, retries
            )
            return result
        except Exception as e:
            self.logger.error("SNMP v3 GET failed", ip=ip, oid=oid, error=str(e))
            return None
    
    def _sync_snmp_get_v3(
        self, ip: str, oid: str, config: SNMPConfig, timeout: int, retries: int
    ) -> Optional[Union[int, str, bytes]]:
        """同步执行SNMP v3 GET"""
        try:
            auth_data = self._create_auth_data(config)
            
            for (errorIndication, errorStatus, errorIndex, varBinds) in getCmd(
                SnmpEngine(), auth_data,
                UdpTransportTarget((ip, config.port), timeout=timeout, retries=retries),
                ContextData(), ObjectType(ObjectIdentity(oid))
            ):
                if errorIndication or errorStatus:
                    return None
                for varBind in varBinds:
                    return self._convert_snmp_value(varBind[1])
            return None
        except Exception as e:
            self.logger.error("Sync SNMP v3 GET failed", ip=ip, oid=oid, error=str(e))
            return None
