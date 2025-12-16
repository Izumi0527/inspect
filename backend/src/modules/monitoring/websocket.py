"""
WebSocket API路由

提供实时数据推送功能，包括设备状态、告警通知、扫描进度等
"""
import json
import asyncio
from typing import Optional, Set, Dict, Any
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends, Query, HTTPException
from fastapi.responses import JSONResponse
import structlog

from src.core.websocket import websocket_manager, MessageType, cleanup_task
from src.core.auth import get_current_user_ws
from src.models.user import User

logger = structlog.get_logger()
router = APIRouter(tags=["WebSocket"])

# 启动清理任务（仅启动一次）
_cleanup_task_started = False


async def start_cleanup_task() -> None:
    """启动WebSocket清理任务"""
    global _cleanup_task_started
    if not _cleanup_task_started:
        asyncio.create_task(cleanup_task())
        _cleanup_task_started = True


@router.websocket("/ws/{user_id}")
async def websocket_endpoint(
    websocket: WebSocket,
    user_id: str,
    rooms: Optional[str] = Query(None, description="订阅的房间，用逗号分隔")
) -> None:
    """
    WebSocket连接端点

    参数:
        user_id: 用户ID
        rooms: 订阅的房间列表，用逗号分隔，如: "device_status,alerts,system"

    支持的房间类型:
        - device_status: 设备状态更新
        - alerts: 告警通知
        - system: 系统通知
        - scan_progress: 扫描进度
        - device_metrics: 设备性能指标
    """
    await start_cleanup_task()

    # 解析订阅房间
    subscriptions: Set[str] = set()
    if rooms:
        subscriptions = {room.strip() for room in rooms.split(",") if room.strip()}

    # 建立连接
    connection_id = await websocket_manager.connect(websocket, user_id, subscriptions)

    try:
        while True:
            data = await websocket.receive_text()

            try:
                message = json.loads(data)
                await _handle_client_message(connection_id, message)

            except json.JSONDecodeError:
                await websocket_manager.send_to_connection(connection_id, {
                    "type": MessageType.ERROR,
                    "data": {"message": "Invalid JSON format"}
                })

            except Exception as e:
                logger.error(
                    "Error handling client message",
                    connection_id=connection_id,
                    error=str(e)
                )
                await websocket_manager.send_to_connection(connection_id, {
                    "type": MessageType.ERROR,
                    "data": {"message": "Internal server error"}
                })

    except WebSocketDisconnect:
        await websocket_manager.disconnect(connection_id)

    except Exception as e:
        logger.error(
            "WebSocket connection error",
            connection_id=connection_id,
            user_id=user_id,
            error=str(e)
        )
        await websocket_manager.disconnect(connection_id)


async def _handle_client_message(connection_id: str, message: Dict[str, Any]) -> None:
    """处理客户端消息"""
    message_type = message.get("type")
    data = message.get("data", {})

    if message_type == "heartbeat":
        await websocket_manager.update_heartbeat(connection_id)
        await websocket_manager.send_to_connection(connection_id, {
            "type": MessageType.HEARTBEAT,
            "data": {"status": "ok"}
        })

    elif message_type == "subscribe":
        room = data.get("room")
        if room:
            success = await websocket_manager.subscribe_to_room(connection_id, room)
            await websocket_manager.send_to_connection(connection_id, {
                "type": MessageType.SYSTEM_STATUS,
                "data": {
                    "action": "subscribe",
                    "room": room,
                    "success": success
                }
            })

    elif message_type == "unsubscribe":
        room = data.get("room")
        if room:
            success = await websocket_manager.unsubscribe_from_room(connection_id, room)
            await websocket_manager.send_to_connection(connection_id, {
                "type": MessageType.SYSTEM_STATUS,
                "data": {
                    "action": "unsubscribe",
                    "room": room,
                    "success": success
                }
            })

    else:
        logger.warning(
            "Unknown message type from client",
            connection_id=connection_id,
            message_type=message_type
        )


@router.get("/ws/stats")
async def get_websocket_stats() -> JSONResponse:
    """获取WebSocket连接统计信息"""
    return JSONResponse(content=websocket_manager.get_connection_stats())


@router.post("/ws/broadcast")
async def broadcast_message(
    message_type: MessageType,
    data: dict,
    current_user: User = Depends(get_current_user_ws)
) -> JSONResponse:
    """广播消息到所有连接（需要管理员权限）"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin permission required")

    message = {
        "type": message_type,
        "data": data,
        "sender": current_user.username
    }

    sent_count = await websocket_manager.broadcast(message)

    return JSONResponse(content={
        "success": True,
        "message": "Message broadcasted",
        "recipients": sent_count
    })


@router.post("/ws/send-to-user/{user_id}")
async def send_message_to_user(
    user_id: str,
    message_type: MessageType,
    data: dict,
    current_user: User = Depends(get_current_user_ws)
) -> JSONResponse:
    """发送消息到指定用户"""
    message = {
        "type": message_type,
        "data": data,
        "sender": current_user.username
    }

    sent_count = await websocket_manager.send_to_user(user_id, message)

    return JSONResponse(content={
        "success": True,
        "message": "Message sent to user",
        "user_id": user_id,
        "recipients": sent_count
    })


@router.post("/ws/send-to-room/{room}")
async def send_message_to_room(
    room: str,
    message_type: MessageType,
    data: dict,
    current_user: User = Depends(get_current_user_ws)
) -> JSONResponse:
    """发送消息到指定房间"""
    message = {
        "type": message_type,
        "data": data,
        "sender": current_user.username
    }

    sent_count = await websocket_manager.send_to_room(room, message)

    return JSONResponse(content={
        "success": True,
        "message": "Message sent to room",
        "room": room,
        "recipients": sent_count
    })


# ==================== WebSocket通知器 ====================

class WebSocketNotifier:
    """WebSocket通知器 - 提供便捷的消息发送方法"""

    @staticmethod
    async def notify_device_status_change(
        device_id: int,
        status: str,
        **kwargs: Any
    ) -> None:
        """通知设备状态变更"""
        message = {
            "type": MessageType.DEVICE_STATUS,
            "data": {
                "device_id": device_id,
                "status": status,
                **kwargs
            }
        }
        await websocket_manager.send_to_room("device_status", message)
        logger.info("Device status notification sent", device_id=device_id, status=status)

    @staticmethod
    async def notify_scan_progress(
        scan_id: str,
        progress: int,
        status: str,
        **kwargs: Any
    ) -> None:
        """通知扫描进度"""
        message = {
            "type": MessageType.SCAN_PROGRESS,
            "data": {
                "scan_id": scan_id,
                "progress": progress,
                "status": status,
                **kwargs
            }
        }
        await websocket_manager.send_to_room("scan_progress", message)
        logger.info("Scan progress notification sent", scan_id=scan_id, progress=progress)

    @staticmethod
    async def notify_alert(
        alert_type: str,
        severity: str,
        message_text: str,
        **kwargs: Any
    ) -> None:
        """发送告警通知"""
        message = {
            "type": MessageType.ALERT,
            "data": {
                "alert_type": alert_type,
                "severity": severity,
                "message": message_text,
                **kwargs
            }
        }
        await websocket_manager.send_to_room("alerts", message)
        logger.info("Alert notification sent", alert_type=alert_type, severity=severity)

    @staticmethod
    async def notify_system_event(
        event_type: str,
        message_text: str,
        **kwargs: Any
    ) -> None:
        """发送系统事件通知"""
        message = {
            "type": MessageType.SYSTEM_STATUS,
            "data": {
                "event_type": event_type,
                "message": message_text,
                **kwargs
            }
        }
        await websocket_manager.send_to_room("system", message)
        logger.info("System event notification sent", event_type=event_type)

    @staticmethod
    async def notify_user(
        user_id: str,
        notification_type: str,
        message_text: str,
        **kwargs: Any
    ) -> None:
        """发送用户个人通知"""
        message = {
            "type": MessageType.USER_NOTIFICATION,
            "data": {
                "notification_type": notification_type,
                "message": message_text,
                **kwargs
            }
        }
        sent_count = await websocket_manager.send_to_user(user_id, message)
        logger.info("User notification sent", user_id=user_id, recipients=sent_count)

    @staticmethod
    async def notify_alert_escalation(
        alert_id: str,
        from_level: str,
        to_level: str,
        severity: str,
        message: str,
        **kwargs: Any
    ) -> None:
        """发送告警升级通知"""
        message_data = {
            "type": MessageType.ALERT,
            "data": {
                "alert_type": "escalation",
                "alert_id": alert_id,
                "from_level": from_level,
                "to_level": to_level,
                "severity": severity,
                "message": message,
                "escalated_at": kwargs.get("escalated_at", ""),
                **kwargs
            }
        }
        await websocket_manager.send_to_room("alerts", message_data)
        logger.info(
            "Alert escalation notification sent",
            alert_id=alert_id,
            from_level=from_level,
            to_level=to_level
        )

    @staticmethod
    async def notify_device_metrics(
        device_id: int,
        metrics: Dict[str, Any],
        **kwargs: Any
    ) -> None:
        """发送设备性能指标"""
        message = {
            "type": MessageType.DEVICE_STATUS,
            "data": {
                "device_id": device_id,
                "metrics": metrics,
                **kwargs
            }
        }
        await websocket_manager.send_to_room("device_metrics", message)
        logger.debug("Device metrics notification sent", device_id=device_id)


# 全局通知器实例
ws_notifier = WebSocketNotifier()
