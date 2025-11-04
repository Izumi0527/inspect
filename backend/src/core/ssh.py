"""
SSH协议核心模块

提供SSH协议连接支持，用于远程连接网络设备执行命令和采集数据。
支持密码认证、密钥认证，以及批量命令执行。
"""

import asyncio
import socket
import io
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, Dict, List, Any, Tuple, Union, BinaryIO
from pathlib import Path
import structlog

import paramiko
from paramiko import SSHClient as ParamikoSSHClient, AutoAddPolicy, RSAKey, ECDSAKey, Ed25519Key
from paramiko.ssh_exception import (
    AuthenticationException, 
    SSHException, 
    NoValidConnectionsError
)

logger = structlog.get_logger()


class SSHAuthMethod(Enum):
    """SSH认证方法"""
    PASSWORD = "password"
    PUBLIC_KEY = "publickey" 
    KEYBOARD_INTERACTIVE = "keyboard-interactive"


class SSHKeyType(Enum):
    """SSH密钥类型"""
    RSA = "rsa"
    ECDSA = "ecdsa"
    ED25519 = "ed25519"


@dataclass
class SSHCredentials:
    """SSH认证凭据"""
    username: str
    password: Optional[str] = None
    private_key_path: Optional[str] = None
    private_key_content: Optional[str] = None
    key_passphrase: Optional[str] = None
    auth_method: SSHAuthMethod = SSHAuthMethod.PASSWORD


@dataclass
class SSHConfig:
    """SSH连接配置"""
    host: str
    port: int = 22
    timeout: float = 30.0
    banner_timeout: float = 30.0
    auth_timeout: float = 30.0
    keepalive: int = 60
    compression: bool = False
    allow_agent: bool = True
    look_for_keys: bool = True
    auto_add_host_keys: bool = True


@dataclass
class SSHCommandResult:
    """SSH命令执行结果"""
    command: str
    stdout: str
    stderr: str
    exit_code: int
    execution_time: float
    error: Optional[str] = None


class SSHClient:
    """
    异步SSH客户端
    
    提供SSH连接管理、命令执行、文件传输等功能
    """

    def __init__(self, config: SSHConfig, credentials: SSHCredentials):
        self.config = config
        self.credentials = credentials
        self._client = None
        self._sftp_client = None
        self._connected = False
        self.logger = logger.bind(
            host=config.host,
            port=config.port,
            username=credentials.username
        )

    async def __aenter__(self):
        """异步上下文管理器入口"""
        await self.connect()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """异步上下文管理器出口"""
        await self.disconnect()

    async def connect(self) -> bool:
        """
        建立SSH连接
        
        Returns:
            连接是否成功
        """
        try:
            if self._connected:
                await self.disconnect()

            self._client = ParamikoSSHClient()
            
            # 配置SSH客户端
            if self.config.auto_add_host_keys:
                self._client.set_missing_host_key_policy(AutoAddPolicy())
            
            self.logger.info("正在建立SSH连接...")
            
            # 在线程池中执行同步连接操作
            await asyncio.get_event_loop().run_in_executor(
                None, self._sync_connect
            )
            
            self._connected = True
            self.logger.info("SSH连接建立成功")
            return True
            
        except AuthenticationException as e:
            self.logger.error(f"SSH认证失败: {e}")
            return False
        except NoValidConnectionsError as e:
            self.logger.error(f"SSH连接失败，无法连接到主机: {e}")
            return False
        except SSHException as e:
            self.logger.error(f"SSH协议错误: {e}")
            return False
        except socket.timeout as e:
            self.logger.error(f"SSH连接超时: {e}")
            return False
        except Exception as e:
            self.logger.error(f"SSH连接异常: {e}")
            return False

    def _sync_connect(self):
        """同步连接方法（在线程池中执行）"""
        connect_kwargs = {
            'hostname': self.config.host,
            'port': self.config.port,
            'username': self.credentials.username,
            'timeout': self.config.timeout,
            'banner_timeout': self.config.banner_timeout,
            'auth_timeout': self.config.auth_timeout,
            'compress': self.config.compression,
            'allow_agent': self.config.allow_agent,
            'look_for_keys': self.config.look_for_keys
        }

        # 验证基本连接参数
        if not self.credentials.username:
            raise ValueError("SSH连接需要提供用户名")

        # 根据认证方法设置认证参数
        if self.credentials.auth_method == SSHAuthMethod.PASSWORD:
            if not self.credentials.password:
                raise ValueError("使用密码认证时必须提供密码")
            connect_kwargs['password'] = self.credentials.password
            
        elif self.credentials.auth_method == SSHAuthMethod.PUBLIC_KEY:
            pkey = self._load_private_key()
            if pkey:
                connect_kwargs['pkey'] = pkey
            else:
                raise ValueError("无法加载私钥")

        self._client.connect(**connect_kwargs)

    def _load_private_key(self) -> Optional[paramiko.PKey]:
        """加载私钥"""
        try:
            if self.credentials.private_key_content:
                # 从内容加载私钥
                key_file = io.StringIO(self.credentials.private_key_content)
                return self._try_load_key_from_file(key_file)
            elif self.credentials.private_key_path:
                # 从文件加载私钥
                key_path = Path(self.credentials.private_key_path)
                if not key_path.exists():
                    self.logger.error(f"私钥文件不存在: {key_path}")
                    return None
                with open(key_path, 'r') as key_file:
                    return self._try_load_key_from_file(key_file)
            else:
                self.logger.error("未提供私钥路径或内容")
                return None
                
        except Exception as e:
            self.logger.error(f"加载私钥失败: {e}")
            return None

    def _try_load_key_from_file(self, key_file) -> Optional[paramiko.PKey]:
        """尝试使用不同的密钥类型加载私钥"""
        key_types = [RSAKey, ECDSAKey, Ed25519Key]
        
        for key_type in key_types:
            try:
                key_file.seek(0)
                return key_type.from_private_key(
                    key_file, 
                    password=self.credentials.key_passphrase
                )
            except Exception:
                continue
        
        self.logger.error("无法识别私钥类型")
        return None

    async def disconnect(self):
        """断开SSH连接"""
        try:
            if self._sftp_client:
                self._sftp_client.close()
                self._sftp_client = None
                
            if self._client:
                self._client.close()
                self._client = None
                
            self._connected = False
            self.logger.info("SSH连接已断开")
            
        except Exception as e:
            self.logger.error(f"断开SSH连接时发生错误: {e}")

    async def execute_command(
        self, 
        command: str, 
        timeout: Optional[float] = None,
        environment: Optional[Dict[str, str]] = None
    ) -> SSHCommandResult:
        """
        执行SSH命令
        
        Args:
            command: 要执行的命令
            timeout: 命令超时时间
            environment: 环境变量
            
        Returns:
            命令执行结果
        """
        if not self._connected:
            return SSHCommandResult(
                command=command,
                stdout="",
                stderr="",
                exit_code=-1,
                execution_time=0.0,
                error="SSH未连接"
            )

        start_time = asyncio.get_event_loop().time()
        
        try:
            self.logger.debug(f"执行SSH命令: {command}")
            
            # 在线程池中执行同步命令
            result = await asyncio.get_event_loop().run_in_executor(
                None, 
                self._sync_execute_command,
                command,
                timeout,
                environment
            )
            
            execution_time = asyncio.get_event_loop().time() - start_time
            result.execution_time = execution_time
            
            self.logger.debug(
                f"命令执行完成",
                command=command,
                exit_code=result.exit_code,
                execution_time=execution_time
            )
            
            return result
            
        except Exception as e:
            execution_time = asyncio.get_event_loop().time() - start_time
            self.logger.error(f"执行SSH命令失败: {e}")
            return SSHCommandResult(
                command=command,
                stdout="",
                stderr="",
                exit_code=-1,
                execution_time=execution_time,
                error=str(e)
            )

    def _sync_execute_command(
        self, 
        command: str, 
        timeout: Optional[float],
        environment: Optional[Dict[str, str]]
    ) -> SSHCommandResult:
        """同步执行命令方法（在线程池中执行）"""
        stdin, stdout, stderr = self._client.exec_command(
            command,
            timeout=timeout,
            environment=environment
        )
        
        # 读取输出
        stdout_data = stdout.read().decode('utf-8', errors='replace')
        stderr_data = stderr.read().decode('utf-8', errors='replace')
        exit_code = stdout.channel.recv_exit_status()
        
        # 关闭通道
        stdin.close()
        stdout.close()
        stderr.close()
        
        return SSHCommandResult(
            command=command,
            stdout=stdout_data,
            stderr=stderr_data,
            exit_code=exit_code,
            execution_time=0.0  # 将在上层设置
        )

    async def execute_commands(
        self, 
        commands: List[str],
        timeout: Optional[float] = None,
        stop_on_error: bool = False
    ) -> List[SSHCommandResult]:
        """
        批量执行SSH命令
        
        Args:
            commands: 命令列表
            timeout: 单个命令的超时时间
            stop_on_error: 遇到错误时是否停止执行
            
        Returns:
            命令执行结果列表
        """
        results = []
        
        for command in commands:
            result = await self.execute_command(command, timeout)
            results.append(result)
            
            if stop_on_error and (result.exit_code != 0 or result.error):
                self.logger.warning(f"命令执行失败，停止后续命令执行: {command}")
                break
                
        return results

    async def get_sftp_client(self):
        """获取SFTP客户端"""
        if not self._connected:
            raise RuntimeError("SSH未连接")
            
        if not self._sftp_client:
            self._sftp_client = await asyncio.get_event_loop().run_in_executor(
                None, self._client.open_sftp
            )
            
        return self._sftp_client

    async def upload_file(self, local_path: str, remote_path: str) -> bool:
        """
        上传文件到远程服务器
        
        Args:
            local_path: 本地文件路径
            remote_path: 远程文件路径
            
        Returns:
            上传是否成功
        """
        try:
            sftp = await self.get_sftp_client()
            await asyncio.get_event_loop().run_in_executor(
                None, sftp.put, local_path, remote_path
            )
            self.logger.info(f"文件上传成功: {local_path} -> {remote_path}")
            return True
        except Exception as e:
            self.logger.error(f"文件上传失败: {e}")
            return False

    async def download_file(self, remote_path: str, local_path: str) -> bool:
        """
        从远程服务器下载文件
        
        Args:
            remote_path: 远程文件路径
            local_path: 本地文件路径
            
        Returns:
            下载是否成功
        """
        try:
            sftp = await self.get_sftp_client()
            await asyncio.get_event_loop().run_in_executor(
                None, sftp.get, remote_path, local_path
            )
            self.logger.info(f"文件下载成功: {remote_path} -> {local_path}")
            return True
        except Exception as e:
            self.logger.error(f"文件下载失败: {e}")
            return False

    async def test_connection(self) -> bool:
        """
        测试SSH连接
        
        Returns:
            连接是否成功
        """
        try:
            if not self._connected:
                success = await self.connect()
                if not success:
                    return False
            
            # 执行简单命令测试连接
            result = await self.execute_command("echo 'SSH connection test'", timeout=5.0)
            
            if result.error or result.exit_code != 0:
                self.logger.error(f"SSH连接测试失败: {result.error or result.stderr}")
                return False
            
            self.logger.info("SSH连接测试成功")
            return True
            
        except Exception as e:
            self.logger.error(f"SSH连接测试异常: {e}")
            return False

    @property
    def is_connected(self) -> bool:
        """检查是否已连接"""
        return self._connected and self._client is not None

    async def get_system_info(self) -> Dict[str, str]:
        """
        获取系统基本信息
        
        Returns:
            系统信息字典
        """
        info = {}
        
        try:
            commands = {
                'hostname': 'hostname',
                'uname': 'uname -a',
                'uptime': 'uptime',
                'whoami': 'whoami',
                'pwd': 'pwd',
                'date': 'date',
            }
            
            for key, cmd in commands.items():
                result = await self.execute_command(cmd, timeout=10.0)
                if result.exit_code == 0 and not result.error:
                    info[key] = result.stdout.strip()
                else:
                    info[key] = f"Error: {result.error or result.stderr}"
                    
        except Exception as e:
            self.logger.error(f"获取系统信息失败: {e}")
            info['error'] = str(e)
            
        return info


# 常用的设备命令模板
class DeviceCommands:
    """常用网络设备命令模板"""
    
    # 通用Linux/Unix命令
    LINUX = {
        'system_info': [
            'hostname',
            'uname -a',
            'cat /etc/os-release',
            'uptime',
            'date'
        ],
        'network_info': [
            'ip addr show',
            'ip route show',
            'netstat -rn',
            'cat /proc/net/dev',
            'ss -tuln'
        ],
        'hardware_info': [
            'lscpu',
            'free -h',
            'df -h',
            'lsblk',
            'cat /proc/meminfo',
            'cat /proc/cpuinfo'
        ],
        'process_info': [
            'ps aux',
            'top -b -n 1',
            'systemctl status'
        ]
    }
    
    # Cisco设备命令
    CISCO = {
        'basic_info': [
            'show version',
            'show inventory',
            'show system',
            'show hostname'
        ],
        'interface_info': [
            'show interfaces status',
            'show interfaces summary',
            'show ip interface brief',
            'show interfaces description'
        ],
        'routing_info': [
            'show ip route',
            'show ip arp',
            'show mac address-table',
            'show spanning-tree'
        ],
        'configuration': [
            'show running-config',
            'show startup-config'
        ],
        'monitoring': [
            'show processes cpu',
            'show memory',
            'show environment',
            'show logging'
        ]
    }
    
    # Huawei设备命令
    HUAWEI = {
        'basic_info': [
            'display version',
            'display device',
            'display system',
            'display sysname'
        ],
        'interface_info': [
            'display interface brief',
            'display ip interface brief',
            'display interface description'
        ],
        'routing_info': [
            'display ip routing-table',
            'display arp',
            'display mac-address',
            'display stp brief'
        ],
        'configuration': [
            'display current-configuration',
            'display saved-configuration'
        ],
        'monitoring': [
            'display cpu-usage',
            'display memory-usage',
            'display environment',
            'display logbuffer'
        ]
    }


async def create_ssh_client(
    host: str,
    username: str,
    password: Optional[str] = None,
    private_key_path: Optional[str] = None,
    port: int = 22,
    timeout: float = 30.0,
    auth_method: SSHAuthMethod = SSHAuthMethod.PASSWORD
) -> SSHClient:
    """
    创建SSH客户端的便捷函数
    
    Args:
        host: 目标主机
        username: 用户名
        password: 密码
        private_key_path: 私钥文件路径
        port: 端口号
        timeout: 超时时间
        auth_method: 认证方法
        
    Returns:
        配置好的SSH客户端
    """
    config = SSHConfig(host=host, port=port, timeout=timeout)
    credentials = SSHCredentials(
        username=username,
        password=password,
        private_key_path=private_key_path,
        auth_method=auth_method
    )
    
    return SSHClient(config, credentials)