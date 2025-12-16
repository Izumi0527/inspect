"""
安全设置API路由
"""
from typing import Dict, Any
from fastapi import APIRouter, Depends, HTTPException
from src.schemas.settings.security import (
    TestLdapRequest, TestLdapResponse, SessionListResponse
)
from src.core.permissions import require_permission
import structlog

logger = structlog.get_logger()

router = APIRouter(prefix="/security", tags=["Security Settings"])


def _get_general_service():
    from src.modules.settings.general.service import general_settings_service
    return general_settings_service


def _get_security_service():
    from src.services.settings.security_service import security_settings_service
    return security_settings_service


@router.get("/", response_model=dict)
async def get_security_configs(
    current_user: dict = Depends(require_permission("settings:security:read"))
):
    try:
        settings = await _get_general_service().get_all_settings(category="security")
        return {"items": settings, "total": len(settings)}
    except Exception as e:
        logger.error("Failed to get security configs", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/stats", response_model=dict)
async def get_security_stats(
    current_user: dict = Depends(require_permission("settings:security:read"))
):
    try:
        settings = await _get_general_service().get_all_settings(category="security")
        enabled = sum(1 for s in settings if s.get("value") is True)
        return {"total_count": len(settings), "enabled_count": enabled}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/test-ldap", response_model=TestLdapResponse)
async def test_ldap(
    request: TestLdapRequest,
    current_user: dict = Depends(require_permission("settings:security:test"))
):
    try:
        success, message, count = await _get_security_service().test_ldap_connection(
            server_url=request.server_url, port=request.port,
            bind_dn=request.bind_dn, bind_password=request.bind_password,
            base_dn=request.base_dn, use_ssl=request.use_ssl
        )
        return TestLdapResponse(success=success, message=message, user_count=count)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/sessions", response_model=SessionListResponse)
async def get_sessions(
    current_user: dict = Depends(require_permission("settings:security:read"))
):
    try:
        sessions = await _get_security_service().get_active_sessions()
        return SessionListResponse(total=len(sessions), sessions=sessions)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
