"""
Notification Settings Service
通知配置服务层
"""
from typing import Tuple, Optional, Dict, Any
from datetime import datetime
import aiohttp
import time
import structlog

from src.services.common import system_settings_service

logger = structlog.get_logger()


class NotificationSettingsService:
    """通知配置服务"""

    def __init__(self):
        self.settings_service = system_settings_service

    async def test_email(
        self,
        recipient: Optional[str] = None,
        subject: str = "邮件配置测试",
        content: str = "这是一封测试邮件，用于验证邮件配置是否正确。"
    ) -> Tuple[bool, str]:
        """
        测试邮件配置

        Args:
            recipient: 接收人邮箱（可选）
            subject: 邮件主题
            content: 邮件内容

        Returns:
            (成功标志, 消息)
        """
        try:
            # 使用现有的 test_email_config 方法
            # 注意：现有方法不支持自定义收件人，总是发送给配置的发件人
            # 如果需要支持自定义收件人，需要扩展 system_settings 中的方法
            success, message = await self.settings_service.test_email_config()

            if success and recipient:
                # TODO: 扩展支持自定义收件人
                message += f" (注: 当前版本发送到配置的邮箱，未来将支持发送到: {recipient})"

            return success, message

        except Exception as e:
            logger.error("Failed to test email", error=str(e))
            return False, f"邮件测试失败: {str(e)}"

    async def test_sms(
        self,
        phone_number: Optional[str] = None,
        content: str = "【网络设备巡检系统】这是一条测试短信。"
    ) -> Tuple[bool, str, Optional[str]]:
        """
        测试短信配置

        Args:
            phone_number: 接收人手机号（可选）
            content: 短信内容

        Returns:
            (成功标志, 消息, 短信ID)
        """
        try:
            # 获取短信配置
            sms_enabled = await self.settings_service.get_setting('notification.sms.enabled', False)
            if not sms_enabled:
                return False, "短信通知未启用", None

            sms_provider = await self.settings_service.get_setting('notification.sms.provider')
            api_key = await self.settings_service.get_setting('notification.sms.api_key')
            api_secret = await self.settings_service.get_setting('notification.sms.api_secret')

            if not phone_number:
                phone_number = await self.settings_service.get_setting('notification.sms.test_phone')

            if not phone_number:
                return False, "请提供测试手机号或配置默认测试号码", None

            if not all([sms_provider, api_key, api_secret]):
                return False, "短信配置不完整", None

            # 根据不同的服务商发送测试短信
            if sms_provider == "aliyun":
                return await self._test_aliyun_sms(phone_number, content, api_key, api_secret)
            elif sms_provider == "tencent":
                return await self._test_tencent_sms(phone_number, content, api_key, api_secret)
            else:
                return False, f"不支持的短信服务商: {sms_provider}", None

        except Exception as e:
            logger.error("Failed to test SMS", error=str(e))
            return False, f"短信测试失败: {str(e)}", None

    async def test_webhook(
        self,
        url: Optional[str] = None,
        method: str = "POST",
        headers: Optional[Dict[str, str]] = None,
        payload: Optional[Dict[str, Any]] = None
    ) -> Tuple[bool, str, Optional[int], Optional[str], Optional[int]]:
        """
        测试Webhook配置

        Args:
            url: Webhook URL（可选）
            method: HTTP方法
            headers: 自定义请求头
            payload: 测试数据

        Returns:
            (成功标志, 消息, 状态码, 响应内容, 响应时间ms)
        """
        try:
            # 获取Webhook配置
            if not url:
                url = await self.settings_service.get_setting('notification.webhook.url')

            if not url:
                return False, "请提供Webhook URL或配置默认URL", None, None, None

            # 准备请求头
            default_headers = {
                'Content-Type': 'application/json',
                'User-Agent': 'NetworkInspectionSystem/1.0'
            }
            if headers:
                default_headers.update(headers)

            # 准备测试数据
            if payload is None:
                payload = {
                    "event": "test",
                    "message": "这是一个测试Webhook请求",
                    "timestamp": datetime.now().isoformat()
                }
            else:
                # 填充时间戳
                if 'timestamp' in payload and payload['timestamp'] is None:
                    payload['timestamp'] = datetime.now().isoformat()

            # 发送请求
            start_time = time.time()
            async with aiohttp.ClientSession() as session:
                async with session.request(
                    method=method,
                    url=url,
                    headers=default_headers,
                    json=payload,
                    timeout=aiohttp.ClientTimeout(total=10)
                ) as response:
                    response_time_ms = int((time.time() - start_time) * 1000)
                    status_code = response.status
                    response_body = await response.text()

                    if 200 <= status_code < 300:
                        return (
                            True,
                            f"Webhook测试成功，状态码: {status_code}",
                            status_code,
                            response_body[:500],  # 限制响应内容长度
                            response_time_ms
                        )
                    else:
                        return (
                            False,
                            f"Webhook响应异常，状态码: {status_code}",
                            status_code,
                            response_body[:500],
                            response_time_ms
                        )

        except aiohttp.ClientError as e:
            logger.error("Webhook request failed", error=str(e))
            return False, f"Webhook请求失败: {str(e)}", None, None, None
        except Exception as e:
            logger.error("Failed to test webhook", error=str(e))
            return False, f"Webhook测试失败: {str(e)}", None, None, None

    async def _test_aliyun_sms(
        self,
        phone_number: str,
        content: str,
        api_key: str,
        api_secret: str
    ) -> Tuple[bool, str, Optional[str]]:
        """测试阿里云短信"""
        # TODO: 实现阿里云短信API调用
        # 这里返回模拟结果
        logger.info("Testing Aliyun SMS", phone=phone_number)
        return False, "阿里云短信API暂未实现，请联系管理员", None

    async def _test_tencent_sms(
        self,
        phone_number: str,
        content: str,
        api_key: str,
        api_secret: str
    ) -> Tuple[bool, str, Optional[str]]:
        """测试腾讯云短信"""
        # TODO: 实现腾讯云短信API调用
        # 这里返回模拟结果
        logger.info("Testing Tencent SMS", phone=phone_number)
        return False, "腾讯云短信API暂未实现，请联系管理员", None


# 全局实例
notification_settings_service = NotificationSettingsService()
