"""
Notification Settings API Router
通知配置API路由
"""
from fastapi import APIRouter, Depends, HTTPException
from src.schemas.settings.notifications import (
    TestEmailRequest,
    TestEmailResponse,
    TestSmsRequest,
    TestSmsResponse,
    TestWebhookRequest,
    TestWebhookResponse
)
from src.schemas.settings.system import (
    EmailSettingsRequest,
    EmailTestResponse,
    NotificationSettingsRequest
)
from src.services.settings.notifications_service import notification_settings_service
from src.services.settings.general_service import general_settings_service
from src.services.system_settings import system_settings_service
from src.core.permissions import require_permission
import structlog

logger = structlog.get_logger()

router = APIRouter(prefix="/notifications", tags=["Notification Settings"])


# ============================================================================
# 统一API端点（新增）
# ============================================================================


@router.get("/", response_model=dict, summary="获取通知配置列表")
async def get_notification_configs(
    current_user: dict = Depends(require_permission("settings:notifications:read"))
):
    """
    获取通知配置列表

    包括邮件通知、短信通知、Webhook 通知等相关配置

    **权限要求**: settings:notifications:read
    """
    try:
        # 获取 notification 和 email 分类的配置
        notification_settings = await general_settings_service.get_all_settings(category="notification")
        email_settings = await general_settings_service.get_all_settings(category="email")

        all_settings = notification_settings + email_settings

        logger.info(
            "Retrieved notification configs",
            total_count=len(all_settings),
            user_id=current_user["id"]
        )

        return {
            "items": all_settings,
            "total": len(all_settings)
        }

    except Exception as e:
        logger.error("Failed to get notification configs", error=str(e))
        raise HTTPException(status_code=500, detail=f"获取通知配置失败: {str(e)}")


@router.get("/stats", response_model=dict, summary="获取通知配置统计信息")
async def get_notification_stats(
    current_user: dict = Depends(require_permission("settings:notifications:read"))
):
    """
    获取通知配置统计信息

    用于仪表板展示聚合数据

    **权限要求**: settings:notifications:read
    """
    try:
        notification_settings = await general_settings_service.get_all_settings(category="notification")
        email_settings = await general_settings_service.get_all_settings(category="email")

        stats = {
            "total_count": len(notification_settings) + len(email_settings),
            "notification_count": len(notification_settings),
            "email_count": len(email_settings)
        }

        logger.info(
            "Retrieved notification stats",
            stats=stats,
            user_id=current_user["id"]
        )

        return stats

    except Exception as e:
        logger.error("Failed to get notification stats", error=str(e))
        raise HTTPException(status_code=500, detail=f"获取统计信息失败: {str(e)}")


# ============================================================================
# 测试端点（保留原有功能）
# ============================================================================


@router.post("/test-email", response_model=TestEmailResponse)
async def test_email(
    request: TestEmailRequest,
    current_user: dict = Depends(require_permission("settings:notifications:test"))
):
    """
    测试邮件配置

    发送一封测试邮件以验证邮件配置是否正确。

    权限要求: settings:notifications:test
    """
    try:
        success, message = await notification_settings_service.test_email(
            recipient=request.recipient,
            subject=request.subject,
            content=request.content
        )

        logger.info(
            "Email test executed",
            success=success,
            recipient=request.recipient,
            user_id=current_user["id"]
        )

        return TestEmailResponse(
            success=success,
            message=message
        )

    except Exception as e:
        logger.error("Failed to test email", error=str(e), user_id=current_user["id"])
        raise HTTPException(status_code=500, detail=f"邮件测试失败: {str(e)}")


@router.post("/test-sms", response_model=TestSmsResponse)
async def test_sms(
    request: TestSmsRequest,
    current_user: dict = Depends(require_permission("settings:notifications:test"))
):
    """
    测试短信配置

    发送一条测试短信以验证短信配置是否正确。

    支持的短信服务商:
    - aliyun: 阿里云短信
    - tencent: 腾讯云短信

    权限要求: settings:notifications:test
    """
    try:
        success, message, sms_id = await notification_settings_service.test_sms(
            phone_number=request.phone_number,
            content=request.content
        )

        logger.info(
            "SMS test executed",
            success=success,
            phone=request.phone_number,
            sms_id=sms_id,
            user_id=current_user["id"]
        )

        return TestSmsResponse(
            success=success,
            message=message,
            sms_id=sms_id
        )

    except Exception as e:
        logger.error("Failed to test SMS", error=str(e), user_id=current_user["id"])
        raise HTTPException(status_code=500, detail=f"短信测试失败: {str(e)}")


@router.post("/test-webhook", response_model=TestWebhookResponse)
async def test_webhook(
    request: TestWebhookRequest,
    current_user: dict = Depends(require_permission("settings:notifications:test"))
):
    """
    测试Webhook配置

    发送一个测试Webhook请求以验证配置是否正确。

    支持的HTTP方法: GET, POST, PUT, PATCH

    权限要求: settings:notifications:test
    """
    try:
        success, message, status_code, response_body, response_time_ms = \
            await notification_settings_service.test_webhook(
                url=request.url,
                method=request.method,
                headers=request.headers,
                payload=request.payload
            )

        logger.info(
            "Webhook test executed",
            success=success,
            url=request.url,
            status_code=status_code,
            response_time_ms=response_time_ms,
            user_id=current_user["id"]
        )

        return TestWebhookResponse(
            success=success,
            message=message,
            status_code=status_code,
            response_body=response_body,
            response_time_ms=response_time_ms
        )

    except Exception as e:
        logger.error("Failed to test webhook", error=str(e), user_id=current_user["id"])
        raise HTTPException(status_code=500, detail=f"Webhook测试失败: {str(e)}")


# ============================================================================
# 邮件和通知配置端点（从 general.py 迁移）
# ============================================================================

@router.post("/email/config", summary="配置邮件设置")
async def configure_email_settings(
    request: EmailSettingsRequest,
    current_user: dict = Depends(require_permission("settings:notifications:write"))
):
    """
    配置邮件服务器设置

    - **smtp_server**: SMTP服务器地址
    - **smtp_port**: SMTP端口
    - **smtp_username**: SMTP用户名
    - **smtp_password**: SMTP密码
    - **use_tls**: 是否使用TLS
    - **use_ssl**: 是否使用SSL
    - **sender_name**: 发件人名称
    - **sender_email**: 发件人邮箱
    """
    try:
        # 更新邮件设置
        email_settings = {
            "email.smtp_server": request.smtp_server,
            "email.smtp_port": request.smtp_port,
            "email.smtp_username": request.smtp_username,
            "email.smtp_password": request.smtp_password,
            "email.use_tls": request.use_tls,
            "email.use_ssl": request.use_ssl,
            "email.sender_name": request.sender_name,
            "email.sender_email": request.sender_email or request.smtp_username
        }

        results = await system_settings_service.bulk_update_settings(
            settings=email_settings,
            user_id=current_user["id"]
        )

        successful_count = sum(1 for success in results.values() if success)

        if successful_count != len(email_settings):
            raise HTTPException(status_code=400, detail="部分邮件设置更新失败")

        logger.info("Email settings configured",
                   smtp_server=request.smtp_server,
                   configured_by=current_user["id"])

        return {"message": "邮件设置配置成功"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to configure email settings", error=str(e))
        raise HTTPException(status_code=500, detail=f"配置邮件设置失败: {str(e)}")


@router.post("/email/test", response_model=EmailTestResponse, summary="测试邮件配置")
async def test_email_configuration(
    current_user: dict = Depends(require_permission("settings:notifications:test"))
):
    """
    测试当前的邮件配置是否正确

    发送测试邮件以验证SMTP配置
    """
    try:
        success, message = await system_settings_service.test_email_config()

        logger.info("Email configuration test completed",
                   success=success,
                   message=message,
                   tested_by=current_user["id"])

        return EmailTestResponse(success=success, message=message)

    except Exception as e:
        logger.error("Failed to test email configuration", error=str(e))
        return EmailTestResponse(success=False, message=f"邮件配置测试失败: {str(e)}")


@router.post("/config", summary="配置通知设置")
async def configure_notification_settings(
    request: NotificationSettingsRequest,
    current_user: dict = Depends(require_permission("settings:notifications:write"))
):
    """
    配置通知相关设置

    - **email_enabled**: 启用邮件通知
    - **sms_enabled**: 启用短信通知
    - **webhook_enabled**: 启用Webhook通知
    - **email_recipients**: 邮件收件人列表
    - **sms_recipients**: 短信接收者列表
    - **webhook_urls**: Webhook URL列表
    - **notification_levels**: 通知级别列表
    """
    try:
        # 更新通知设置
        notification_settings = {
            "notification.email_enabled": request.email_enabled,
            "notification.sms_enabled": request.sms_enabled,
            "notification.webhook_enabled": request.webhook_enabled,
            "notification.email_recipients": request.email_recipients,
            "notification.sms_recipients": request.sms_recipients,
            "notification.webhook_urls": request.webhook_urls,
            "notification.levels": request.notification_levels
        }

        results = await system_settings_service.bulk_update_settings(
            settings=notification_settings,
            user_id=current_user["id"]
        )

        successful_count = sum(1 for success in results.values() if success)

        if successful_count != len(notification_settings):
            raise HTTPException(status_code=400, detail="部分通知设置更新失败")

        logger.info("Notification settings configured",
                   configured_by=current_user["id"])

        return {"message": "通知设置配置成功"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to configure notification settings", error=str(e))
        raise HTTPException(status_code=500, detail=f"配置通知设置失败: {str(e)}")
