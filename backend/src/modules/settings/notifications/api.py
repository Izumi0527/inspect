"""
通知设置API路由 - 完整实现
"""
from fastapi import APIRouter, Depends, HTTPException
from src.schemas.settings.notifications import (
    TestEmailRequest, TestEmailResponse,
    TestSmsRequest, TestSmsResponse,
    TestWebhookRequest, TestWebhookResponse
)
from src.core.permissions import require_permission
import structlog

logger = structlog.get_logger()

router = APIRouter(prefix="/notifications", tags=["Notification Settings"])


def _get_general_service():
    from src.modules.settings.general.service import general_settings_service
    return general_settings_service


def _get_notification_service():
    from src.services.settings.notifications_service import notification_settings_service
    return notification_settings_service


@router.get("/", response_model=dict, summary="获取通知配置列表")
async def get_notification_configs(
    current_user: dict = Depends(require_permission("settings:notifications:read"))
):
    try:
        general_service = _get_general_service()
        notification_settings = await general_service.get_all_settings(category="notification")
        email_settings = await general_service.get_all_settings(category="email")
        all_settings = notification_settings + email_settings
        return {"items": all_settings, "total": len(all_settings)}
    except Exception as e:
        logger.error("Failed to get notification configs", error=str(e))
        raise HTTPException(status_code=500, detail=f"获取通知配置失败: {str(e)}")


@router.get("/stats", response_model=dict, summary="获取通知配置统计信息")
async def get_notification_stats(
    current_user: dict = Depends(require_permission("settings:notifications:read"))
):
    try:
        general_service = _get_general_service()
        notification_settings = await general_service.get_all_settings(category="notification")
        email_settings = await general_service.get_all_settings(category="email")
        return {
            "total_count": len(notification_settings) + len(email_settings),
            "notification_count": len(notification_settings),
            "email_count": len(email_settings)
        }
    except Exception as e:
        logger.error("Failed to get notification stats", error=str(e))
        raise HTTPException(status_code=500, detail=f"获取统计信息失败: {str(e)}")


@router.post("/test-email", response_model=TestEmailResponse)
async def test_email(
    request: TestEmailRequest,
    current_user: dict = Depends(require_permission("settings:notifications:test"))
):
    try:
        success, message = await _get_notification_service().test_email(
            recipient=request.recipient, subject=request.subject, content=request.content
        )
        return TestEmailResponse(success=success, message=message)
    except Exception as e:
        logger.error("Failed to test email", error=str(e))
        raise HTTPException(status_code=500, detail=f"邮件测试失败: {str(e)}")


@router.post("/test-sms", response_model=TestSmsResponse)
async def test_sms(
    request: TestSmsRequest,
    current_user: dict = Depends(require_permission("settings:notifications:test"))
):
    try:
        success, message, sms_id = await _get_notification_service().test_sms(
            phone_number=request.phone_number, content=request.content
        )
        return TestSmsResponse(success=success, message=message, sms_id=sms_id)
    except Exception as e:
        logger.error("Failed to test SMS", error=str(e))
        raise HTTPException(status_code=500, detail=f"短信测试失败: {str(e)}")


@router.post("/test-webhook", response_model=TestWebhookResponse)
async def test_webhook(
    request: TestWebhookRequest,
    current_user: dict = Depends(require_permission("settings:notifications:test"))
):
    try:
        success, message, status_code, response_body, response_time_ms = \
            await _get_notification_service().test_webhook(
                url=request.url, method=request.method,
                headers=request.headers, payload=request.payload
            )
        return TestWebhookResponse(
            success=success, message=message, status_code=status_code,
            response_body=response_body, response_time_ms=response_time_ms
        )
    except Exception as e:
        logger.error("Failed to test webhook", error=str(e))
        raise HTTPException(status_code=500, detail=f"Webhook测试失败: {str(e)}")

__all__ = ["router"]
