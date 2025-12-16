"""
SSH设备连接和管理服务

提供SSH连接池管理、命令执行、配置备份等功能
"""
import asyncio
from datetime import datetime
from typing import Dict, List, Optional, Any, Union
from concurrent.futures import ThreadPoolExecutor
import structlog
import threading
import time

from netmiko import ConnectHandler
from netmiko.exceptions import NetmikoTimeoutException, NetmikoAuthenticationException

from src.infrastructure.device_connection.base import DeviceConnection
from src.infrastructure.device_connection.types import SSHConfig, DeviceInfo

logger = structlog.get_logger()


class SSHConnectionPool:
    """SSH连接池管理器"""
    
    def __init__(self, max_connections: int = 10, idle_timeout: int = 300):
        self.max_connections = max_connections
        self.idle_timeout = idle_timeout
        self.connections: Dict[str, Dict[str, Any]] = {}
        self.lock = threading.RLock()
        self.cleanup_interval = 60
        self._running = True
        self._start_cleanup_task()
    
    def _start_cleanup_task(self):
        """启动连接清理任务"""
        def cleanup_worker():
            while self._running:
                try:
                    self._cleanup_idle_connections()
                    time.sleep(self.cleanup_interval)
                except Exception as e:
                    logger.error("Connection cleanup error", error=str(e))
        
        self._cleanup_thread = threading.Thread(target=cleanup_worker, daemon=True)
        self._cleanup_thread.start()
    
    def _cleanup_idle_connections(self):
        """清理空闲连接"""
        current_time = time.time()
        to_remove = []
        
        with self.lock:
            for conn_key, conn_info in self.connections.items():
                if current_time - conn_info.get("last_used", 0) > self.idle_timeout:
                    to_remove.append(conn_key)
            
            for conn_key in to_remove:
                conn_info = self.connections.pop(conn_key, None)
                if conn_info and conn_info.get("connection"):
                    try:
                        conn_info["connection"].disconnect()
                    except:
                        pass
    
    def _get_connection_key(self, connection_info: Dict[str, Any]) -> str:
        """生成连接键值"""
        return f"{connection_info['host']}:{connection_info.get('port', 22)}:{connection_info['username']}"
    
    def get_connection(self, connection_info: Dict[str, Any]) -> Optional[ConnectHandler]:
        """获取或创建SSH连接"""
        conn_key = self._get_connection_key(connection_info)
        
        with self.lock:
            if conn_key in self.connections:
                conn_info = self.connections[conn_key]
                connection = conn_info["connection"]
                if self._is_connection_alive(connection):
                    conn_info["last_used"] = time.time()
                    conn_info["usage_count"] += 1
                    return connection
                else:
                    del self.connections[conn_key]
            
            if len(self.connections) >= self.max_connections:
                self._remove_oldest_connection()
            
            try:
                new_connection = ConnectHandler(**connection_info)
                self.connections[conn_key] = {
                    "connection": new_connection,
                    "created_at": time.time(),
                    "last_used": time.time(),
                    "usage_count": 1,
                    "connection_info": connection_info
                }
                return new_connection
            except Exception as e:
                logger.error("Failed to create SSH connection", key=conn_key, error=str(e))
                return None
    
    def _is_connection_alive(self, connection: ConnectHandler) -> bool:
        """检查SSH连接是否存活"""
        try:
            connection.send_command("", expect_string="", read_timeout=1)
            return True
        except:
            return False
    
    def _remove_oldest_connection(self):
        """移除最旧的连接"""
        if not self.connections:
            return
        oldest_key = min(self.connections.keys(), key=lambda k: self.connections[k]["last_used"])
        conn_info = self.connections.pop(oldest_key, None)
        if conn_info and conn_info.get("connection"):
            try:
                conn_info["connection"].disconnect()
            except:
                pass
    
    def release_connection(self, connection: ConnectHandler):
        """释放连接"""
        with self.lock:
            for key, conn_info in self.connections.items():
                if conn_info["connection"] == connection:
                    conn_info["last_used"] = time.time()
                    break
    
    def close_all_connections(self):
        """关闭所有连接"""
        self._running = False
        with self.lock:
            for conn_info in self.connections.values():
                try:
                    conn_info["connection"].disconnect()
                except:
                    pass
            self.connections.clear()
    
    def get_pool_stats(self) -> Dict[str, Any]:
        """获取连接池统计信息"""
        with self.lock:
            return {
                "active_connections": len(self.connections),
                "max_connections": self.max_connections,
                "connections": [
                    {"key": key, "created_at": info["created_at"], 
                     "last_used": info["last_used"], "usage_count": info["usage_count"]}
                    for key, info in self.connections.items()
                ]
            }


class SSHService(DeviceConnection):
    """SSH设备连接服务类"""
    
    def __init__(self, max_connections: int = 10, idle_timeout: int = 300):
        super().__init__()
        self.thread_executor = ThreadPoolExecutor(max_workers=10)
        self.connection_pool = SSHConnectionPool(max_connections, idle_timeout)
        self.max_retries = 3
        self.retry_delay = 2
        
        self.device_type_mapping = {
            "cisco": {"router": "cisco_ios", "switch": "cisco_ios", "firewall": "cisco_asa", "nexus": "cisco_nxos"},
            "huawei": {"router": "huawei", "switch": "huawei", "firewall": "huawei_vrpv8"},
            "h3c": {"router": "hp_comware", "switch": "hp_comware"},
            "juniper": {"router": "juniper_junos", "switch": "juniper_junos", "firewall": "juniper_junos"},
            "arista": {"switch": "arista_eos"}
        }
        
        self.command_mapping = {
            "cisco_ios": {
                "show_version": "show version", "show_interfaces": "show interfaces status",
                "show_running_config": "show running-config", "show_cpu": "show processes cpu",
                "show_memory": "show memory statistics"
            },
            "huawei": {
                "show_version": "display version", "show_interfaces": "display interface brief",
                "show_running_config": "display current-configuration", "show_cpu": "display cpu-usage",
                "show_memory": "display memory-usage"
            },
            "hp_comware": {
                "show_version": "display version", "show_interfaces": "display interface brief",
                "show_running_config": "display current-configuration", "show_cpu": "display cpu-usage",
                "show_memory": "display memory"
            }
        }
        
        self._connected = False
        self._current_config: Optional[SSHConfig] = None
    
    async def connect(self, device_info: Union[Dict[str, Any], DeviceInfo]) -> bool:
        """连接到SSH设备"""
        try:
            if isinstance(device_info, dict):
                config = SSHConfig(
                    host=device_info["ip_address"],
                    username=device_info["ssh_username"],
                    password=device_info["ssh_password"],
                    port=device_info.get("ssh_port", 22),
                    device_type=self._get_netmiko_device_type(
                        device_info.get("vendor", "cisco"), device_info.get("device_type", "switch")
                    )
                )
            else:
                config = SSHConfig(
                    host=device_info.ip_address,
                    username=device_info.ssh_username,
                    password=device_info.ssh_password,
                    port=device_info.ssh_port,
                    device_type=self._get_netmiko_device_type(device_info.vendor, device_info.device_type)
                )
            
            if not config.username or not config.password:
                return False
            
            connection_result = await self.connect_device(
                device_info if isinstance(device_info, dict) else device_info.to_dict()
            )
            
            if connection_result and connection_result.get("connected"):
                self._connected = True
                self._current_config = config
                return True
            return False
        except Exception as e:
            self.logger.error("SSH connection failed", error=str(e))
            return False
    
    async def disconnect(self) -> None:
        """断开SSH连接"""
        self._connected = False
        self._current_config = None
    
    async def is_connected(self) -> bool:
        """检查连接状态"""
        return self._connected
    
    async def execute_command(self, command: str) -> Optional[str]:
        """执行SSH命令"""
        if not self._connected or not self._current_config:
            return None
        device_info = {
            "ip_address": self._current_config.host,
            "ssh_username": self._current_config.username,
            "ssh_password": self._current_config.password,
            "ssh_port": self._current_config.port
        }
        return await self.execute_single_command(device_info, command)
    
    async def connect_device(self, device_info: dict, timeout: int = 30) -> Optional[Dict[str, Any]]:
        """连接到网络设备并获取基础信息"""
        try:
            connection_info = self._prepare_connection_info(device_info, timeout)
            if not connection_info:
                return None
            
            result = await asyncio.get_event_loop().run_in_executor(
                self.thread_executor, self._sync_connect_device, connection_info
            )
            return result
        except Exception as e:
            self.logger.error("SSH connection failed", ip=device_info.get("ip_address"), error=str(e))
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
                return None
            
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
            
            if device_info.get("ssh_port"):
                connection_info["port"] = int(device_info["ssh_port"])
            
            return connection_info
        except Exception as e:
            self.logger.error("Failed to prepare SSH connection info", error=str(e))
            return None
    
    def _get_netmiko_device_type(self, vendor: str, device_type: str) -> str:
        """根据厂商和设备类型获取netmiko设备类型"""
        vendor = vendor.lower()
        device_type = device_type.lower()
        
        if vendor in self.device_type_mapping:
            vendor_mapping = self.device_type_mapping[vendor]
            if device_type in vendor_mapping:
                return vendor_mapping[device_type]
            return list(vendor_mapping.values())[0]
        return "cisco_ios"
    
    def _sync_connect_device(self, connection_info: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """同步执行SSH连接"""
        connection = None
        try:
            connection = ConnectHandler(**connection_info)
            if not connection:
                return None
            
            device_type = connection_info["device_type"]
            commands = self.command_mapping.get(device_type, self.command_mapping["cisco_ios"])
            
            device_info = {
                "connected": True,
                "device_type": device_type,
                "connection_time": datetime.now().isoformat(),
            }
            
            try:
                version_output = connection.send_command(commands["show_version"], use_textfsm=False)
                device_info["version_info"] = version_output[:500]
            except Exception as e:
                device_info["version_error"] = str(e)
            
            return device_info
        except Exception as e:
            return {"connected": False, "error": str(e), "connection_time": datetime.now().isoformat()}
        finally:
            if connection:
                try:
                    connection.disconnect()
                except:
                    pass
    
    async def execute_single_command(self, device_info: dict, command: str, timeout: int = 30) -> Optional[str]:
        """在设备上执行单个命令"""
        for attempt in range(self.max_retries):
            try:
                connection_info = self._prepare_connection_info(device_info, timeout)
                if not connection_info:
                    return None
                
                result = await asyncio.get_event_loop().run_in_executor(
                    self.thread_executor, self._sync_execute_command_with_pool, connection_info, command
                )
                return result
            except (NetmikoTimeoutException, NetmikoAuthenticationException) as e:
                if attempt < self.max_retries - 1:
                    await asyncio.sleep(self.retry_delay)
                else:
                    return None
            except Exception as e:
                self.logger.error("SSH command execution failed", error=str(e))
                return None
        return None
    
    def _sync_execute_command_with_pool(self, connection_info: Dict[str, Any], command: str) -> Optional[str]:
        """同步执行SSH命令（使用连接池）"""
        connection = None
        try:
            connection = self.connection_pool.get_connection(connection_info)
            if not connection:
                return None
            output = connection.send_command(command, use_textfsm=False)
            self.connection_pool.release_connection(connection)
            return output
        except Exception as e:
            self.logger.error("Sync SSH command execution failed", error=str(e))
            return None
    
    async def execute_batch_commands(self, device_info: dict, commands: List[str], timeout: int = 60) -> Dict[str, Optional[str]]:
        """批量执行SSH命令"""
        try:
            connection_info = self._prepare_connection_info(device_info, timeout)
            if not connection_info:
                return {cmd: None for cmd in commands}
            
            result = await asyncio.get_event_loop().run_in_executor(
                self.thread_executor, self._sync_execute_batch_commands, connection_info, commands
            )
            return result
        except Exception as e:
            self.logger.error("SSH batch command execution failed", error=str(e))
            return {cmd: None for cmd in commands}
    
    def _sync_execute_batch_commands(self, connection_info: Dict[str, Any], commands: List[str]) -> Dict[str, Optional[str]]:
        """同步批量执行SSH命令"""
        connection = None
        results = {}
        try:
            connection = self.connection_pool.get_connection(connection_info)
            if not connection:
                return {cmd: None for cmd in commands}
            
            for command in commands:
                try:
                    output = connection.send_command(command, use_textfsm=False)
                    results[command] = output
                except Exception:
                    results[command] = None
            
            self.connection_pool.release_connection(connection)
            return results
        except Exception as e:
            self.logger.error("Sync batch SSH commands failed", error=str(e))
            return {cmd: None for cmd in commands}
    
    async def test_connection_with_retry(self, device_info: dict, max_attempts: int = 3) -> Dict[str, Any]:
        """测试SSH连接"""
        for attempt in range(max_attempts):
            try:
                connection_result = await self.connect_device(device_info, timeout=10)
                if connection_result and connection_result.get("connected"):
                    return {"success": True, "attempt": attempt + 1, "result": connection_result}
            except Exception:
                if attempt < max_attempts - 1:
                    await asyncio.sleep(self.retry_delay)
        return {"success": False, "attempts": max_attempts, "error": "All connection attempts failed"}
    
    async def backup_configuration(self, device_info: dict, timeout: int = 60) -> Optional[str]:
        """备份设备配置"""
        try:
            vendor = device_info.get("vendor", "cisco").lower()
            device_type = device_info.get("device_type", "switch").lower()
            netmiko_type = self._get_netmiko_device_type(vendor, device_type)
            commands = self.command_mapping.get(netmiko_type, self.command_mapping["cisco_ios"])
            config_command = commands.get("show_running_config", "show running-config")
            return await self.execute_single_command(device_info, config_command, timeout)
        except Exception as e:
            self.logger.error("Configuration backup failed", error=str(e))
            return None
    
    async def test_connectivity(self, device_info: dict) -> bool:
        """测试SSH连通性"""
        try:
            connection_result = await self.connect_device(device_info, timeout=10)
            return connection_result is not None and connection_result.get("connected", False)
        except:
            return False
    
    def get_connection_pool_stats(self) -> Dict[str, Any]:
        """获取连接池统计信息"""
        return self.connection_pool.get_pool_stats()
    
    def close_connection_pool(self):
        """关闭连接池"""
        self.connection_pool.close_all_connections()
    
    def __del__(self):
        try:
            self.close_connection_pool()
        except:
            pass
