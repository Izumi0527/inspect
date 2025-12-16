"""
设备连接基类和接口定义
"""
from abc import ABC, abstractmethod
from typing import Dict, Any, Optional
import structlog

logger = structlog.get_logger()


class DeviceConnection(ABC):
    """设备连接抽象基类"""
    
    def __init__(self):
        self.logger = logger.bind(service=self.__class__.__name__)
    
    @abstractmethod
    async def connect(self, device_info: Dict[str, Any]) -> bool:
        """
        连接到设备
        
        Args:
            device_info: 设备信息
            
        Returns:
            bool: 连接是否成功
        """
        pass
    
    @abstractmethod
    async def disconnect(self) -> None:
        """断开设备连接"""
        pass
    
    @abstractmethod
    async def is_connected(self) -> bool:
        """检查连接状态"""
        pass
    
    @abstractmethod
    async def execute_command(self, command: str) -> Optional[str]:
        """
        执行命令
        
        Args:
            command: 要执行的命令
            
        Returns:
            Optional[str]: 命令输出，失败时返回None
        """
        pass


class ConnectionManager:
    """连接管理器基类"""
    
    def __init__(self):
        self.connections: Dict[str, DeviceConnection] = {}
        self.logger = logger.bind(service="ConnectionManager")
    
    async def get_connection(self, device_id: str, connection_type: str) -> Optional[DeviceConnection]:
        """获取设备连接"""
        connection_key = f"{device_id}_{connection_type}"
        return self.connections.get(connection_key)
    
    async def add_connection(self, device_id: str, connection_type: str, connection: DeviceConnection):
        """添加设备连接"""
        connection_key = f"{device_id}_{connection_type}"
        self.connections[connection_key] = connection
        self.logger.info("Connection added", device_id=device_id, connection_type=connection_type)
    
    async def remove_connection(self, device_id: str, connection_type: str):
        """移除设备连接"""
        connection_key = f"{device_id}_{connection_type}"
        if connection_key in self.connections:
            connection = self.connections[connection_key]
            await connection.disconnect()
            del self.connections[connection_key]
            self.logger.info("Connection removed", device_id=device_id, connection_type=connection_type)
    
    async def close_all(self):
        """关闭所有连接"""
        for connection in self.connections.values():
            try:
                await connection.disconnect()
            except Exception as e:
                self.logger.warning("Failed to disconnect", error=str(e))
        self.connections.clear()
        self.logger.info("All connections closed")
