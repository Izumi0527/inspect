"""
Security Settings API Router
安全设置API路由
"""
from typing import Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Path
from src.schemas.settings.security import (
    TestLdapRequest,
    TestLdapResponse,
    SyncLdapUsersRequest,
    SyncLdapUsersResponse,
    SessionListResponse,
    DeleteSessionResponse
)
from src.schemas.settings.general import SettingItem
from src.services.settings.security_service import security_settings_service
from src.services.settings.general_service import general_settings_service
from src.core.permissions import require_permission
import structlog

logger = structlog.get_logger()

router = APIRouter(prefix="/security", tags=["Security Settings"])


# ============================================================================
# 统一API端点（新增）
# ============================================================================


@router.get("/", response_model=dict, summary="获取安全策略配置列表")
async def get_security_configs(
    current_user: dict = Depends(require_permission("settings:security:read"))
):
    """
    获取安全策略配置列表

    包括密码策略、登录限制、会话管理等安全相关配置

    **权限要求**: settings:security:read
    """
    try:
        settings = await general_settings_service.get_all_settings(category="security")

        logger.info(
            "Retrieved security configs",
            total_count=len(settings),
            user_id=current_user["id"]
        )

        return {
            "items": settings,
            "total": len(settings)
        }

    except Exception as e:
        logger.error("Failed to get security configs", error=str(e))
        raise HTTPException(status_code=500, detail=f"获取安全配置失败: {str(e)}")


@router.get("/stats", response_model=dict, summary="获取安全策略统计信息")
async def get_security_stats(
    current_user: dict = Depends(require_permission("settings:security:read"))
):
    """
    获取安全策略统计信息

    用于仪表板展示聚合数据

    **权限要求**: settings:security:read
    """
    try:
        settings = await general_settings_service.get_all_settings(category="security")

        # 计算启用的配置数量（值为 True 的配置）
        enabled_count = sum(
            1 for setting in settings
            if isinstance(setting.get("value"), bool) and setting.get("value") is True
        )

        # 获取最后更新时间
        updated_times = [s.get("updated_at") for s in settings if s.get("updated_at")]
        last_updated = max(updated_times) if updated_times else None

        stats = {
            "total_count": len(settings),
            "enabled_count": enabled_count,
            "last_updated": last_updated
        }

        logger.info(
            "Retrieved security stats",
            stats=stats,
            user_id=current_user["id"]
        )

        return stats

    except Exception as e:
        logger.error("Failed to get security stats", error=str(e))
        raise HTTPException(status_code=500, detail=f"获取统计信息失败: {str(e)}")


@router.get("/config/{key}", response_model=SettingItem, summary="获取单个安全配置")
async def get_security_setting(
    key: str,
    current_user: dict = Depends(require_permission("settings:security:read"))
):
    """
    获取单个安全配置项

    - **key**: 配置键名（可以带或不带 security. 前缀）

    **权限要求**: settings:security:read
    """
    try:
        # 确保 key 以 security. 开头
        if not key.startswith("security."):
            key = f"security.{key}"

        setting = await general_settings_service.get_setting(key)
        if setting is None:
            raise HTTPException(status_code=404, detail=f"配置项不存在: {key}")

        logger.info(
            "Retrieved security setting",
            key=key,
            user_id=current_user["id"]
        )

        return setting

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get security setting", error=str(e), key=key)
        raise HTTPException(status_code=500, detail=f"获取配置失败: {str(e)}")


@router.put("/config/{key}", response_model=SettingItem, summary="更新单个安全配置")
async def update_security_setting(
    key: str,
    value: Dict[str, Any],
    current_user: dict = Depends(require_permission("settings:security:write"))
):
    """
    更新单个安全配置项

    - **key**: 配置键名（可以带或不带 security. 前缀）
    - **value**: 配置值（JSON格式: {"value": "实际值"}）

    **权限要求**: settings:security:write
    """
    try:
        # 确保 key 以 security. 开头
        if not key.startswith("security."):
            key = f"security.{key}"

        actual_value = value.get("value")
        if actual_value is None:
            raise HTTPException(status_code=400, detail="请求体必须包含 'value' 字段")

        setting = await general_settings_service.update_setting(
            key,
            actual_value,
            current_user["id"]
        )

        logger.info(
            "Security setting updated",
            key=key,
            updated_by=current_user["id"]
        )

        return setting

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to update security setting", error=str(e), key=key)
        raise HTTPException(status_code=500, detail=f"更新配置失败: {str(e)}")


@router.get("/password-policy", summary="获取密码策略")
async def get_password_policy(
    current_user: dict = Depends(require_permission("settings:security:read"))
):
    """
    获取密码策略配置

    包括最小长度、复杂度要求、过期时间等

    **权限要求**: settings:security:read
    """
    try:
        password_keys = [
            "security.password.min_length",
            "security.password.require_uppercase",
            "security.password.require_lowercase",
            "security.password.require_numbers",
            "security.password.require_special_chars",
            "security.password.expiry_days",
            "security.password.history_count",
            "security.password.max_login_attempts"
        ]

        policy = {}
        for key in password_keys:
            setting = await general_settings_service.get_setting(key)
            if setting:
                # 移除 security.password. 前缀
                short_key = key.replace("security.password.", "")
                policy[short_key] = setting.get("value")

        logger.info(
            "Retrieved password policy",
            user_id=current_user["id"]
        )

        return policy

    except Exception as e:
        logger.error("Failed to get password policy", error=str(e))
        raise HTTPException(status_code=500, detail=f"获取密码策略失败: {str(e)}")


@router.put("/password-policy", summary="更新密码策略")
async def update_password_policy(
    policy: Dict[str, Any],
    current_user: dict = Depends(require_permission("settings:security:write"))
):
    """
    批量更新密码策略

    **请求体示例**:
    ```json
    {
      "min_length": 12,
      "require_uppercase": true,
      "require_lowercase": true,
      "require_numbers": true,
      "require_special_chars": true,
      "expiry_days": 90,
      "history_count": 5,
      "max_login_attempts": 5
    }
    ```

    **权限要求**: settings:security:write
    """
    try:
        # 将简短的 key 转换为完整的 key
        full_settings = {}
        for short_key, value in policy.items():
            full_key = f"security.password.{short_key}"
            full_settings[full_key] = value

        # 批量更新
        result = await general_settings_service.bulk_update_settings(
            full_settings,
            current_user["id"]
        )

        successful_count = sum(1 for success in result.values() if success)

        if successful_count != len(full_settings):
            failed_keys = [key for key, success in result.items() if not success]
            raise HTTPException(
                status_code=400,
                detail=f"部分密码策略更新失败: {', '.join(failed_keys)}"
            )

        logger.info(
            "Password policy updated",
            updated_count=successful_count,
            updated_by=current_user["id"]
        )

        return {
            "message": "密码策略更新成功",
            "updated_count": successful_count
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to update password policy", error=str(e))
        raise HTTPException(status_code=500, detail=f"更新密码策略失败: {str(e)}")


# ============================================================================
# LDAP 和会话管理端点（保留原有功能）
# ============================================================================


@router.post("/test-ldap", response_model=TestLdapResponse)
async def test_ldap(
    request: TestLdapRequest,
    current_user: dict = Depends(require_permission("settings:security:test"))
):
    """
    测试LDAP连接

    验证LDAP服务器配置是否正确，并返回可查询到的用户数量。

    权限要求: settings:security:test
    """
    try:
        success, message, user_count = await security_settings_service.test_ldap_connection(
            server_url=request.server_url,
            port=request.port,
            bind_dn=request.bind_dn,
            bind_password=request.bind_password,
            base_dn=request.base_dn,
            use_ssl=request.use_ssl
        )

        logger.info(
            "LDAP connection test executed",
            success=success,
            user_count=user_count,
            user_id=current_user["id"]
        )

        return TestLdapResponse(
            success=success,
            message=message,
            user_count=user_count
        )

    except Exception as e:
        logger.error("Failed to test LDAP", error=str(e), user_id=current_user["id"])
        raise HTTPException(status_code=500, detail=f"LDAP测试失败: {str(e)}")


@router.post("/sync-ldap-users", response_model=SyncLdapUsersResponse)
async def sync_ldap_users(
    request: SyncLdapUsersRequest,
    current_user: dict = Depends(require_permission("settings:security:write"))
):
    """
    同步LDAP用户

    从LDAP服务器同步用户到本地数据库。

    - **dry_run**: 设置为 true 时为模拟运行，不会实际创建/更新用户
    - **user_filter**: 可选的LDAP过滤条件，默认为 (objectClass=person)

    权限要求: settings:security:sync
    """
    try:
        success, message, total, created, updated, skipped, failed = \
            await security_settings_service.sync_ldap_users(
                dry_run=request.dry_run,
                user_filter=request.user_filter
            )

        logger.info(
            "LDAP user sync executed",
            success=success,
            dry_run=request.dry_run,
            total=total,
            created=created,
            updated=updated,
            user_id=current_user["id"]
        )

        return SyncLdapUsersResponse(
            success=success,
            message=message,
            total_found=total,
            created=created,
            updated=updated,
            skipped=skipped,
            failed=failed,
            dry_run=request.dry_run
        )

    except Exception as e:
        logger.error("Failed to sync LDAP users", error=str(e), user_id=current_user["id"])
        raise HTTPException(status_code=500, detail=f"LDAP用户同步失败: {str(e)}")


@router.get("/sessions", response_model=SessionListResponse)
async def get_sessions(
    current_user: dict = Depends(require_permission("settings:security:read"))
):
    """
    获取活跃会话列表

    返回当前所有活跃的用户会话信息。

    权限要求: settings:security:sessions:read
    """
    try:
        sessions = await security_settings_service.get_active_sessions()

        logger.info(
            "Retrieved session list",
            count=len(sessions),
            user_id=current_user["id"]
        )

        return SessionListResponse(
            total=len(sessions),
            sessions=sessions
        )

    except Exception as e:
        logger.error("Failed to get sessions", error=str(e), user_id=current_user["id"])
        raise HTTPException(status_code=500, detail=f"获取会话列表失败: {str(e)}")


@router.delete("/sessions/{session_id}", response_model=DeleteSessionResponse)
async def delete_session(
    session_id: str = Path(..., description="会话ID"),
    current_user: dict = Depends(require_permission("settings:security:write"))
):
    """
    删除指定会话

    强制结束指定的用户会话，用户将被登出。

    权限要求: settings:security:sessions:delete
    """
    try:
        success, message = await security_settings_service.delete_session(session_id)

        logger.info(
            "Session deletion executed",
            success=success,
            session_id=session_id,
            user_id=current_user["id"]
        )

        if not success:
            raise HTTPException(status_code=404, detail=message)

        return DeleteSessionResponse(
            success=success,
            message=message
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to delete session", session_id=session_id, error=str(e), user_id=current_user["id"])
        raise HTTPException(status_code=500, detail=f"删除会话失败: {str(e)}")
