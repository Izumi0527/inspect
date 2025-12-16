"""
告警通知服务

负责告警通知的队列管理和发送
"""
import asyncio
from datetime import datetime
from typing import Dict, List, Optional, Any
import structlog

logger = structlog.get_logger()


class AlertNotifier:
    """告警通知服务"""

    def __init__(self):
        self.notification_queue: List[Dict] = []
        self._email_enabled = True
        self._webhook_enabled = True

    async def queue_notification(self, alert: dict) -> None:
        """将告警加入通知队列
        
        Args:
            alert: 告警信息
        """
        notification = {
            "alert_id": alert["id"],
            "notification_type": "email",
            "recipient": "admin@example.com",  # 应从配置或用户设置获取
            "subject": f"[{alert['severity'].upper()}] {alert['title']}",
            "content": alert["message"],
            "status": "pending",
            "created_at": datetime.now()
        }
        
        self.notification_queue.append(notification)
        logger.debug("Notification queued", alert_id=alert["id"])

    async def process_queue(self, repository=None, max_batch: int = 10) -> int:
        """处理通知队列
        
        Args:
            repository: 告警Repository（用于更新通知计数）
            max_batch: 每次最多处理的通知数量
            
        Returns:
            成功发送的通知数量
        """
        pending = [n for n in self.notification_queue if n.get("status") == "pending"]
        sent_count = 0

        for notification in pending[:max_batch]:
            try:
                await self._send_notification(notification)
                notification["status"] = "sent"
                notification["sent_at"] = datetime.now()
                sent_count += 1

                # 更新告警的通知计数
                if repository:
                    alert_id = notification["alert_id"]
                    alert = await repository.get_alert_by_id(alert_id)
                    if alert:
                        notification_count = alert.get("notification_count", 0) + 1
                        await repository.update_alert(
                            alert_id,
                            {"notification_count": notification_count}
                        )

            except Exception as e:
                notification["status"] = "failed"
                notification["error"] = str(e)
                logger.error("Failed to send notification",
                           alert_id=notification.get("alert_id"),
                           error=str(e))

        return sent_count

    async def _send_notification(self, notification: dict) -> None:
        """发送通知
        
        Args:
            notification: 通知信息
        """
        notification_type = notification.get("notification_type")
        
        if notification_type == "email":
            await self._send_email(notification)
        elif notification_type == "webhook":
            await self._send_webhook(notification)
        elif notification_type == "sms":
            await self._send_sms(notification)
        else:
            logger.warning("Unknown notification type", type=notification_type)

    async def _send_email(self, notification: dict) -> None:
        """发送邮件通知"""
        if not self._email_enabled:
            logger.debug("Email notifications disabled")
            return
            
        # TODO: 实现实际的邮件发送逻辑
        await asyncio.sleep(0.1)  # 模拟发送延迟
        logger.info("Email notification sent", 
                   recipient=notification.get("recipient"),
                   subject=notification.get("subject"))

    async def _send_webhook(self, notification: dict) -> None:
        """发送Webhook通知"""
        if not self._webhook_enabled:
            logger.debug("Webhook notifications disabled")
            return
            
        # TODO: 实现实际的Webhook调用逻辑
        await asyncio.sleep(0.1)
        logger.info("Webhook notification sent", 
                   url=notification.get("webhook_url"))

    async def _send_sms(self, notification: dict) -> None:
        """发送短信通知"""
        # TODO: 实现实际的短信发送逻辑
        await asyncio.sleep(0.1)
        logger.info("SMS notification sent", 
                   phone=notification.get("phone"))

    def get_pending_count(self) -> int:
        """获取待处理通知数量"""
        return len([n for n in self.notification_queue if n.get("status") == "pending"])

    def get_queue_stats(self) -> Dict[str, int]:
        """获取通知队列统计"""
        stats = {"pending": 0, "sent": 0, "failed": 0}
        for notification in self.notification_queue:
            status = notification.get("status", "pending")
            if status in stats:
                stats[status] += 1
        return stats

    def clear_sent_notifications(self, older_than_hours: int = 24) -> int:
        """清理已发送的通知
        
        Args:
            older_than_hours: 清理多少小时前的通知
            
        Returns:
            清理的通知数量
        """
        cutoff = datetime.now()
        original_count = len(self.notification_queue)
        
        self.notification_queue = [
            n for n in self.notification_queue
            if n.get("status") != "sent" or 
               (n.get("sent_at") and (cutoff - n["sent_at"]).total_seconds() < older_than_hours * 3600)
        ]
        
        cleared = original_count - len(self.notification_queue)
        if cleared > 0:
            logger.info("Cleared sent notifications", count=cleared)
        return cleared


# 全局实例
alert_notifier = AlertNotifier()
