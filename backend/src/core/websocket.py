"""
WebSocket连接管理器
"""
import json
import time
import asyncio
from typing import Dict, List, Optional, Any, Set
from fastapi import WebSocket, WebSocketDisconnect
from enum import Enum
import structlog

logger = structlog.get_logger()


class MessageType(str, Enum):
    """WebSocket消息类型"""
    DEVICE_STATUS = "device_status"
    SCAN_PROGRESS = "scan_progress"
    ALERT = "alert"
    SYSTEM_STATUS = "system_status"
    HEARTBEAT = "heartbeat"
    USER_NOTIFICATION = "user_notification"
    DEVICE_METRICS = "device_metrics"
    ERROR = "error"


class WebSocketManager:
    """WebSocket连接管理器"""
    
    def __init__(self):
        # 存储活跃连接：{connection_id: {"websocket": ws, "user_id": str, "subscriptions": set}}
        self.active_connections: Dict[str, Dict] = {}
        # 用户订阅：{user_id: {connection_ids}}
        self.user_connections: Dict[str, Set[str]] = {}
        # 房间订阅：{room: {connection_ids}}
        self.room_connections: Dict[str, Set[str]] = {}
        # 连接统计
        self.connection_count = 0
        self.message_count = 0
    
    def _generate_connection_id(self) -> str:
        """生成连接ID"""
        return f"conn_{int(time.time() * 1000)}_{self.connection_count}"
    
    async def connect(
        self, 
        websocket: WebSocket, 
        user_id: str, 
        subscriptions: Optional[Set[str]] = None
    ) -> str:
        """建立WebSocket连接"""
        await websocket.accept()
        
        connection_id = self._generate_connection_id()
        self.connection_count += 1
        
        # 存储连接信息
        self.active_connections[connection_id] = {
            "websocket": websocket,
            "user_id": user_id,
            "subscriptions": subscriptions or set(),
            "connected_at": time.time(),
            "last_heartbeat": time.time()
        }
        
        # 更新用户连接映射
        if user_id not in self.user_connections:
            self.user_connections[user_id] = set()
        self.user_connections[user_id].add(connection_id)
        
        # 订阅房间
        if subscriptions:
            for room in subscriptions:
                if room not in self.room_connections:
                    self.room_connections[room] = set()
                self.room_connections[room].add(connection_id)
        
        logger.info(
            "WebSocket connection established",
            connection_id=connection_id,
            user_id=user_id,
            subscriptions=subscriptions,
            total_connections=len(self.active_connections)
        )
        
        # 发送连接确认消息
        await self.send_to_connection(connection_id, {
            "type": MessageType.SYSTEM_STATUS,
            "data": {
                "status": "connected",
                "connection_id": connection_id,
                "server_time": int(time.time())
            }
        })
        
        return connection_id
    
    async def disconnect(self, connection_id: str) -> None:
        """断开WebSocket连接"""
        if connection_id not in self.active_connections:
            return
        
        connection_info = self.active_connections[connection_id]
        user_id = connection_info["user_id"]
        subscriptions = connection_info["subscriptions"]
        
        # 清理连接记录
        del self.active_connections[connection_id]
        
        # 清理用户连接映射
        if user_id in self.user_connections:
            self.user_connections[user_id].discard(connection_id)
            if not self.user_connections[user_id]:
                del self.user_connections[user_id]
        
        # 清理房间订阅
        for room in subscriptions:
            if room in self.room_connections:
                self.room_connections[room].discard(connection_id)
                if not self.room_connections[room]:
                    del self.room_connections[room]
        
        logger.info(
            "WebSocket connection closed",
            connection_id=connection_id,
            user_id=user_id,
            total_connections=len(self.active_connections)
        )
    
    async def send_to_connection(
        self, 
        connection_id: str, 
        message: Dict[str, Any]
    ) -> bool:
        """发送消息到指定连接"""
        if connection_id not in self.active_connections:
            return False
        
        try:
            websocket = self.active_connections[connection_id]["websocket"]
            message_data = {
                "timestamp": int(time.time()),
                "message_id": f"msg_{int(time.time() * 1000)}",
                **message
            }
            
            await websocket.send_text(json.dumps(message_data, ensure_ascii=False))
            self.message_count += 1
            return True
            
        except Exception as e:
            logger.error(
                "Failed to send message to connection",
                connection_id=connection_id,
                error=str(e)
            )
            # 连接异常，清理连接
            await self.disconnect(connection_id)
            return False
    
    async def send_to_user(self, user_id: str, message: Dict[str, Any]) -> int:
        """发送消息到指定用户的所有连接"""
        if user_id not in self.user_connections:
            return 0
        
        sent_count = 0
        connection_ids = list(self.user_connections[user_id])  # 复制以避免迭代时修改
        
        for connection_id in connection_ids:
            if await self.send_to_connection(connection_id, message):
                sent_count += 1
        
        return sent_count
    
    async def send_to_room(self, room: str, message: Dict[str, Any]) -> int:
        """发送消息到指定房间的所有连接"""
        if room not in self.room_connections:
            return 0
        
        sent_count = 0
        connection_ids = list(self.room_connections[room])  # 复制以避免迭代时修改
        
        for connection_id in connection_ids:
            if await self.send_to_connection(connection_id, message):
                sent_count += 1
        
        return sent_count
    
    async def broadcast(self, message: Dict[str, Any]) -> int:
        """广播消息到所有连接"""
        sent_count = 0
        connection_ids = list(self.active_connections.keys())  # 复制以避免迭代时修改
        
        for connection_id in connection_ids:
            if await self.send_to_connection(connection_id, message):
                sent_count += 1
        
        return sent_count
    
    async def subscribe_to_room(self, connection_id: str, room: str) -> bool:
        """订阅房间"""
        if connection_id not in self.active_connections:
            return False
        
        # 更新连接订阅
        self.active_connections[connection_id]["subscriptions"].add(room)
        
        # 更新房间订阅
        if room not in self.room_connections:
            self.room_connections[room] = set()
        self.room_connections[room].add(connection_id)
        
        logger.debug("Connection subscribed to room", connection_id=connection_id, room=room)
        return True
    
    async def unsubscribe_from_room(self, connection_id: str, room: str) -> bool:
        """取消订阅房间"""
        if connection_id not in self.active_connections:
            return False
        
        # 更新连接订阅
        self.active_connections[connection_id]["subscriptions"].discard(room)
        
        # 更新房间订阅
        if room in self.room_connections:
            self.room_connections[room].discard(connection_id)
            if not self.room_connections[room]:
                del self.room_connections[room]
        
        logger.debug("Connection unsubscribed from room", connection_id=connection_id, room=room)
        return True
    
    async def update_heartbeat(self, connection_id: str) -> bool:
        """更新心跳时间"""
        if connection_id not in self.active_connections:
            return False
        
        self.active_connections[connection_id]["last_heartbeat"] = time.time()
        return True
    
    async def cleanup_inactive_connections(self, timeout: int = 300) -> int:
        """清理非活跃连接（默认5分钟超时）"""
        current_time = time.time()
        inactive_connections = []
        
        for connection_id, info in self.active_connections.items():
            if current_time - info["last_heartbeat"] > timeout:
                inactive_connections.append(connection_id)
        
        # 清理非活跃连接
        for connection_id in inactive_connections:
            await self.disconnect(connection_id)
        
        if inactive_connections:
            logger.info(
                "Cleaned up inactive WebSocket connections",
                count=len(inactive_connections),
                timeout=timeout
            )
        
        return len(inactive_connections)
    
    def get_connection_stats(self) -> Dict[str, Any]:
        """获取连接统计信息"""
        return {
            "total_connections": len(self.active_connections),
            "unique_users": len(self.user_connections),
            "active_rooms": len(self.room_connections),
            "messages_sent": self.message_count,
            "connection_details": {
                connection_id: {
                    "user_id": info["user_id"],
                    "subscriptions": list(info["subscriptions"]),
                    "connected_at": info["connected_at"],
                    "last_heartbeat": info["last_heartbeat"]
                }
                for connection_id, info in self.active_connections.items()
            }
        }


# 全局WebSocket管理器实例
websocket_manager = WebSocketManager()


# 后台任务：定期清理非活跃连接
async def cleanup_task():
    """定期清理非活跃连接的后台任务"""
    while True:
        try:
            await asyncio.sleep(60)  # 每分钟检查一次
            await websocket_manager.cleanup_inactive_connections()
        except Exception as e:
            logger.error("WebSocket cleanup task error", error=str(e))