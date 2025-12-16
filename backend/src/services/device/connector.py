"""
设备连接服务 - SSH/Telnet设备管理
支持多厂商网络设备的命令行访问
"""
import asyncio
import time
import re
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Union, Tuple
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from enum import Enum
import structlog

from netmiko import ConnectHandler, NetmikoTimeoutException, NetmikoAuthenticationException
from netmiko.exceptions import NetmikoBaseException
import paramiko

from src.core.config import settings

logger = structlog.get_logger()

class ConnectionType(str, Enum):
    SSH = "ssh"
    TELNET = "telnet"

class ConnectionStatus(str, Enum):
    CONNECTED = "connected"
    DISCONNECTED = "disconnected"
    CONNECTING = "connecting"
    ERROR = "error"

@dataclass
class DeviceConnectionInfo:
    """设备连接信息"""
    ip: str
    username: str
    password: str
    device_type: str = "cisco_ios"
    port: int = 22
    connection_type: ConnectionType = ConnectionType.SSH
    timeout: int = 10
    session_timeout: int = 60
    enable_password: Optional[str] = None
    secret: Optional[str] = None

@dataclass
class ConnectionSession:
    """连接会话"""
    connection_info: DeviceConnectionInfo
    connection: Optional[ConnectHandler] = None
    last_used: datetime = None
    status: ConnectionStatus = ConnectionStatus.DISCONNECTED
    error_message: Optional[str] = None
    created_at: datetime = None

    def __post_init__(self):
        if self.last_used is None:
            self.last_used = datetime.now()
        if self.created_at is None:
            self.created_at = datetime.now()

class DeviceConnector:
    """设备连接器 - SSH/Telnet统一接口"""
    
    def __init__(self):
        self.thread_executor = ThreadPoolExecutor(max_workers=20)
        self.connection_pool: Dict[str, ConnectionSession] = {}
        self.max_pool_size = 50
        self.session_timeout = 1800  # 30分钟
        
        # 设备类型映射 - 支持多厂商
        self.device_type_mapping = {
            "cisco": {
                "router": "cisco_ios",
                "switch": "cisco_ios", 
                "firewall": "cisco_asa",
                "nexus": "cisco_nxos",
                "wlc": "cisco_wlc"
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
            },
            "fortinet": {
                "firewall": "fortinet"
            },
            "paloalto": {
                "firewall": "paloalto_panos"
            }
        }
        
        # 常用命令映射
        self.command_templates = {
            "cisco_ios": {
                "show_version": "show version",
                "show_interfaces": "show interfaces status",
                "show_ip_route": "show ip route",
                "show_running_config": "show running-config",
                "show_startup_config": "show startup-config",
                "show_processes_cpu": "show processes cpu",
                "show_memory": "show memory statistics",
                "save_config": "copy running-config startup-config"
            },
            "huawei": {
                "show_version": "display version",
                "show_interfaces": "display interface brief",
                "show_ip_route": "display ip routing-table",
                "show_running_config": "display current-configuration",
                "show_startup_config": "display saved-configuration",
                "show_processes_cpu": "display cpu-usage",
                "show_memory": "display memory",
                "save_config": "save"
            },
            "hp_comware": {
                "show_version": "display version",
                "show_interfaces": "display interface brief",
                "show_ip_route": "display ip routing-table",
                "show_running_config": "display current-configuration",
                "show_startup_config": "display saved-configuration",
                "save_config": "save"
            },
            "juniper_junos": {
                "show_version": "show version",
                "show_interfaces": "show interfaces terse",
                "show_ip_route": "show route",
                "show_running_config": "show configuration",
                "save_config": "commit"
            }
        }
    
    def _get_connection_key(self, ip: str, username: str) -> str:
        """生成连接池键值"""
        return f"{ip}:{username}"
    
    def get_device_type(self, vendor: str, device_type: str) -> str:
        """获取Netmiko设备类型"""
        vendor = vendor.lower()
        device_type = device_type.lower()
        
        if vendor in self.device_type_mapping:
            return self.device_type_mapping[vendor].get(device_type, "cisco_ios")
        return "cisco_ios"
    
    async def connect(self, connection_info: DeviceConnectionInfo) -> bool:
        """建立设备连接"""
        connection_key = self._get_connection_key(connection_info.ip, connection_info.username)
        
        # 检查连接池中是否已有有效连接
        if connection_key in self.connection_pool:
            session = self.connection_pool[connection_key]
            if self._is_session_valid(session):
                session.last_used = datetime.now()
                logger.info("Using existing connection", ip=connection_info.ip)
                return True
            else:
                await self._close_session(session)
                del self.connection_pool[connection_key]
        
        # 清理过期连接
        await self._cleanup_expired_sessions()
        
        # 如果连接池已满，移除最旧的连接
        if len(self.connection_pool) >= self.max_pool_size:
            await self._remove_oldest_session()
        
        # 创建新连接
        try:
            session = ConnectionSession(connection_info=connection_info)
            session.status = ConnectionStatus.CONNECTING
            
            # 在线程池中执行连接
            connection = await asyncio.get_event_loop().run_in_executor(
                self.thread_executor,
                self._sync_connect,
                connection_info
            )
            
            if connection:
                session.connection = connection
                session.status = ConnectionStatus.CONNECTED
                session.last_used = datetime.now()
                self.connection_pool[connection_key] = session
                
                logger.info("Device connected successfully", 
                           ip=connection_info.ip, 
                           device_type=connection_info.device_type)
                return True
            else:
                session.status = ConnectionStatus.ERROR
                return False
                
        except Exception as e:
            logger.error("Failed to connect to device", 
                        ip=connection_info.ip, error=str(e))
            return False
    
    def _sync_connect(self, connection_info: DeviceConnectionInfo) -> Optional[ConnectHandler]:
        """同步建立连接"""
        try:
            device_params = {
                'device_type': connection_info.device_type,
                'host': connection_info.ip,
                'username': connection_info.username,
                'password': connection_info.password,
                'port': connection_info.port,
                'timeout': connection_info.timeout,
                'session_timeout': connection_info.session_timeout,
                'verbose': False,
                'global_delay_factor': 2,
                'banner_timeout': 15,
                'conn_timeout': connection_info.timeout
            }
            
            # 添加可选参数
            if connection_info.enable_password:
                device_params['secret'] = connection_info.enable_password
            if connection_info.secret:
                device_params['secret'] = connection_info.secret
            
            # 建立连接
            connection = ConnectHandler(**device_params)
            
            # 进入特权模式（如果支持）
            if hasattr(connection, 'enable') and connection_info.device_type in ['cisco_ios', 'cisco_asa']:
                try:
                    connection.enable()
                except:
                    pass  # 某些设备可能不需要enable
            
            return connection
            
        except NetmikoAuthenticationException as e:
            logger.error("Authentication failed", 
                        ip=connection_info.ip, error=str(e))
            return None
        except NetmikoTimeoutException as e:
            logger.error("Connection timeout", 
                        ip=connection_info.ip, error=str(e))
            return None
        except NetmikoBaseException as e:
            logger.error("Netmiko error", 
                        ip=connection_info.ip, error=str(e))
            return None
        except Exception as e:
            logger.error("Unexpected connection error", 
                        ip=connection_info.ip, error=str(e))
            return None
    
    async def execute_command(self, ip: str, username: str, command: str, 
                            delay_factor: float = 1, expect_string: Optional[str] = None) -> Optional[str]:
        """执行设备命令"""
        connection_key = self._get_connection_key(ip, username)
        
        if connection_key not in self.connection_pool:
            logger.error("No active connection found", ip=ip, username=username)
            return None
        
        session = self.connection_pool[connection_key]
        if not self._is_session_valid(session):
            logger.error("Session expired", ip=ip)
            return None
        
        try:
            # 更新最后使用时间
            session.last_used = datetime.now()
            
            # 在线程池中执行命令
            result = await asyncio.get_event_loop().run_in_executor(
                self.thread_executor,
                self._sync_execute_command,
                session.connection,
                command,
                delay_factor,
                expect_string
            )
            
            logger.info("Command executed", ip=ip, command=command[:50])
            return result
            
        except Exception as e:
            logger.error("Failed to execute command", 
                        ip=ip, command=command, error=str(e))
            return None
    
    def _sync_execute_command(self, connection: ConnectHandler, command: str, 
                            delay_factor: float, expect_string: Optional[str]) -> str:
        """同步执行命令"""
        try:
            if expect_string:
                result = connection.send_command(
                    command, 
                    delay_factor=delay_factor,
                    expect_string=expect_string
                )
            else:
                result = connection.send_command(command, delay_factor=delay_factor)
            
            return result.strip()
            
        except Exception as e:
            logger.error("Sync command execution failed", 
                        command=command, error=str(e))
            raise e
    
    async def get_device_info(self, ip: str, username: str) -> Dict[str, Any]:
        """获取设备基本信息"""
        connection_key = self._get_connection_key(ip, username)
        
        if connection_key not in self.connection_pool:
            return {}
        
        session = self.connection_pool[connection_key]
        device_type = session.connection_info.device_type
        
        # 获取对应设备类型的命令
        if device_type not in self.command_templates:
            logger.warning("Unsupported device type", device_type=device_type)
            return {}
        
        commands = self.command_templates[device_type]
        
        try:
            # 并发执行多个信息获取命令
            tasks = []
            for info_type, command in [
                ("version", commands.get("show_version")),
                ("interfaces", commands.get("show_interfaces")),
            ]:
                if command:
                    task = self.execute_command(ip, username, command)
                    tasks.append((info_type, task))
            
            # 等待所有任务完成
            results = {}
            for info_type, task in tasks:
                result = await task
                if result:
                    results[info_type] = result
            
            return results
            
        except Exception as e:
            logger.error("Failed to get device info", 
                        ip=ip, error=str(e))
            return {}
    
    async def backup_configuration(self, ip: str, username: str) -> Optional[str]:
        """备份设备配置"""
        connection_key = self._get_connection_key(ip, username)
        
        if connection_key not in self.connection_pool:
            return None
        
        session = self.connection_pool[connection_key]
        device_type = session.connection_info.device_type
        
        # 获取配置查看命令
        if device_type in self.command_templates:
            command = self.command_templates[device_type].get("show_running_config")
            if command:
                config = await self.execute_command(ip, username, command, delay_factor=2)
                if config:
                    logger.info("Configuration backed up", ip=ip, size=len(config))
                    return config
        
        logger.error("Failed to backup configuration", ip=ip)
        return None
    
    async def save_configuration(self, ip: str, username: str) -> bool:
        """保存设备配置"""
        connection_key = self._get_connection_key(ip, username)
        
        if connection_key not in self.connection_pool:
            return False
        
        session = self.connection_pool[connection_key]
        device_type = session.connection_info.device_type
        
        # 获取保存命令
        if device_type in self.command_templates:
            command = self.command_templates[device_type].get("save_config")
            if command:
                result = await self.execute_command(ip, username, command, delay_factor=3)
                if result:
                    logger.info("Configuration saved", ip=ip)
                    return True
        
        logger.error("Failed to save configuration", ip=ip)
        return False
    
    async def disconnect(self, ip: str, username: str) -> bool:
        """断开设备连接"""
        connection_key = self._get_connection_key(ip, username)
        
        if connection_key not in self.connection_pool:
            return True
        
        session = self.connection_pool[connection_key]
        await self._close_session(session)
        del self.connection_pool[connection_key]
        
        logger.info("Device disconnected", ip=ip)
        return True
    
    async def disconnect_all(self) -> None:
        """断开所有连接"""
        logger.info("Disconnecting all connections", count=len(self.connection_pool))
        
        tasks = []
        for session in self.connection_pool.values():
            tasks.append(self._close_session(session))
        
        await asyncio.gather(*tasks, return_exceptions=True)
        self.connection_pool.clear()
    
    async def _close_session(self, session: ConnectionSession) -> None:
        """关闭会话"""
        try:
            if session.connection and session.status == ConnectionStatus.CONNECTED:
                await asyncio.get_event_loop().run_in_executor(
                    self.thread_executor,
                    session.connection.disconnect
                )
            session.status = ConnectionStatus.DISCONNECTED
        except Exception as e:
            logger.error("Error closing session", error=str(e))
    
    def _is_session_valid(self, session: ConnectionSession) -> bool:
        """检查会话是否有效"""
        if session.status != ConnectionStatus.CONNECTED:
            return False
        
        if not session.connection or not session.connection.is_alive():
            return False
        
        # 检查会话是否超时
        if datetime.now() - session.last_used > timedelta(seconds=self.session_timeout):
            return False
        
        return True
    
    async def _cleanup_expired_sessions(self) -> None:
        """清理过期会话"""
        expired_keys = []
        
        for key, session in self.connection_pool.items():
            if not self._is_session_valid(session):
                expired_keys.append(key)
        
        for key in expired_keys:
            session = self.connection_pool[key]
            await self._close_session(session)
            del self.connection_pool[key]
            logger.info("Expired session cleaned up", key=key)
    
    async def _remove_oldest_session(self) -> None:
        """移除最旧的会话"""
        if not self.connection_pool:
            return
        
        # 找到最旧的会话
        oldest_key = min(
            self.connection_pool.keys(),
            key=lambda k: self.connection_pool[k].last_used
        )
        
        session = self.connection_pool[oldest_key]
        await self._close_session(session)
        del self.connection_pool[oldest_key]
        logger.info("Oldest session removed", key=oldest_key)
    
    def get_connection_stats(self) -> Dict[str, Any]:
        """获取连接池统计信息"""
        active_connections = sum(
            1 for session in self.connection_pool.values()
            if session.status == ConnectionStatus.CONNECTED
        )
        
        return {
            "total_connections": len(self.connection_pool),
            "active_connections": active_connections,
            "max_pool_size": self.max_pool_size,
            "session_timeout": self.session_timeout
        }


# 创建全局实例
device_connector = DeviceConnector()