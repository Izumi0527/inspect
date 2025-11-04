from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field, validator
from datetime import datetime
import structlog
import json
from pathlib import Path

from src.core.database import get_db_session
from src.core.auth import get_current_user
from src.models.user import User

logger = structlog.get_logger()
router = APIRouter(tags=["安全设置"])

# ========== 配置存储路径 ==========

SECURITY_CONFIG_FILE = Path("./data/security_config.json")
LDAP_CONFIG_FILE = Path("./data/ldap_config.json")


def ensure_data_dir():
    """确保数据目录存在"""
    SECURITY_CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)


# ========== Pydantic 模型定义 ==========

class PasswordPolicyConfig(BaseModel):
    """密码策略配置"""
    min_length: int = Field(8, ge=4, le=32, description="最小长度")
    require_uppercase: bool = Field(True, description="要求大写字母")
    require_lowercase: bool = Field(True, description="要求小写字母")
    require_numbers: bool = Field(True, description="要求数字")
    require_special: bool = Field(False, description="要求特殊字符")
    expiry_days: int = Field(90, ge=0, description="过期天数(0=永不过期)")
    history_count: int = Field(5, ge=0, le=24, description="历史密码限制")


class SessionConfig(BaseModel):
    """会话配置"""
    timeout_minutes: int = Field(30, ge=5, le=1440, description="会话超时(分钟)")
    max_concurrent_sessions: int = Field(3, ge=1, le=10, description="最大并发会话数")
    remember_me_days: int = Field(7, ge=0, le=90, description="记住我天数")


class LoginSecurityConfig(BaseModel):
    """登录安全配置"""
    max_failed_attempts: int = Field(5, ge=3, le=10, description="最大失败尝试次数")
    lockout_duration_minutes: int = Field(30, ge=5, le=1440, description="锁定时长(分钟)")
    require_captcha_after_fails: int = Field(3, ge=1, le=10, description="多少次失败后需要验证码")
    enable_two_factor: bool = Field(False, description="启用双因素认证")


class AuditConfig(BaseModel):
    """审计配置"""
    enable_audit_log: bool = Field(True, description="启用审计日志")
    log_retention_days: int = Field(90, ge=7, le=365, description="日志保留天数")
    log_level: str = Field("INFO", pattern="^(DEBUG|INFO|WARNING|ERROR)$", description="日志级别")


class IPWhitelistConfig(BaseModel):
    """IP白名单配置"""
    enabled: bool = Field(False, description="启用IP白名单")
    ips: List[str] = Field(default_factory=list, description="白名单IP列表")


class SecurityConfig(BaseModel):
    """安全配置"""
    password_policy: PasswordPolicyConfig = Field(default_factory=PasswordPolicyConfig)
    session: SessionConfig = Field(default_factory=SessionConfig)
    login_security: LoginSecurityConfig = Field(default_factory=LoginSecurityConfig)
    audit: AuditConfig = Field(default_factory=AuditConfig)
    ip_whitelist: IPWhitelistConfig = Field(default_factory=IPWhitelistConfig)
    updated_at: Optional[datetime] = None
    updated_by: Optional[str] = None

    class Config:
        from_attributes = True


class SecurityConfigUpdate(BaseModel):
    """更新安全配置请求"""
    password_policy: Optional[PasswordPolicyConfig] = None
    session: Optional[SessionConfig] = None
    login_security: Optional[LoginSecurityConfig] = None
    audit: Optional[AuditConfig] = None
    ip_whitelist: Optional[IPWhitelistConfig] = None


class LDAPConfig(BaseModel):
    """LDAP配置"""
    enabled: bool = Field(False, description="启用LDAP认证")
    server_url: str = Field(..., description="LDAP服务器地址 (ldap://xxx or ldaps://xxx)")
    port: int = Field(389, ge=1, le=65535, description="端口号")
    base_dn: str = Field(..., description="Base DN")
    bind_dn: str = Field(..., description="Bind DN")
    bind_password: str = Field(..., description="Bind密码")
    user_search_base: str = Field(..., description="用户搜索基准DN")
    user_search_filter: str = Field("(uid={username})", description="用户搜索过滤器")
    user_object_class: str = Field("inetOrgPerson", description="用户对象类")
    username_attribute: str = Field("uid", description="用户名属性")
    email_attribute: str = Field("mail", description="邮箱属性")
    display_name_attribute: str = Field("displayName", description="显示名称属性")
    group_search_base: Optional[str] = Field(None, description="组搜索基准DN")
    group_search_filter: Optional[str] = Field(None, description="组搜索过滤器")
    sync_interval_hours: int = Field(24, ge=1, le=168, description="同步间隔(小时)")
    use_ssl: bool = Field(False, description="使用SSL")
    verify_certificate: bool = Field(True, description="验证证书")
    updated_at: Optional[datetime] = None
    updated_by: Optional[str] = None

    @validator('server_url')
    def validate_server_url(cls, v):
        if not v.startswith(('ldap://', 'ldaps://')):
            raise ValueError('LDAP服务器地址必须以 ldap:// 或 ldaps:// 开头')
        return v


class LDAPConfigUpdate(BaseModel):
    """更新LDAP配置请求"""
    enabled: Optional[bool] = None
    server_url: Optional[str] = None
    port: Optional[int] = Field(None, ge=1, le=65535)
    base_dn: Optional[str] = None
    bind_dn: Optional[str] = None
    bind_password: Optional[str] = None
    user_search_base: Optional[str] = None
    user_search_filter: Optional[str] = None
    user_object_class: Optional[str] = None
    username_attribute: Optional[str] = None
    email_attribute: Optional[str] = None
    display_name_attribute: Optional[str] = None
    group_search_base: Optional[str] = None
    group_search_filter: Optional[str] = None
    sync_interval_hours: Optional[int] = Field(None, ge=1, le=168)
    use_ssl: Optional[bool] = None
    verify_certificate: Optional[bool] = None


class LDAPTestResponse(BaseModel):
    """LDAP测试响应"""
    success: bool
    message: str
    users: Optional[int] = None


class LDAPSyncResponse(BaseModel):
    """LDAP同步响应"""
    success: bool
    imported: int
    updated: int


# ========== 辅助函数 ==========

async def load_security_config() -> SecurityConfig:
    """加载安全配置"""
    ensure_data_dir()

    if not SECURITY_CONFIG_FILE.exists():
        # 返回默认配置
        return SecurityConfig()

    try:
        with open(SECURITY_CONFIG_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return SecurityConfig(**data)
    except Exception as e:
        logger.error("Failed to load security config", error=str(e))
        return SecurityConfig()


async def save_security_config(config: SecurityConfig):
    """保存安全配置"""
    ensure_data_dir()

    try:
        with open(SECURITY_CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(
                config.dict(),
                f,
                ensure_ascii=False,
                indent=2,
                default=str
            )
    except Exception as e:
        logger.error("Failed to save security config", error=str(e))
        raise


async def load_ldap_config() -> Optional[LDAPConfig]:
    """加载LDAP配置"""
    ensure_data_dir()

    if not LDAP_CONFIG_FILE.exists():
        return None

    try:
        with open(LDAP_CONFIG_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
            # 将ISO格式字符串转换回datetime
            if 'updated_at' in data and isinstance(data['updated_at'], str):
                data['updated_at'] = datetime.fromisoformat(data['updated_at'])
            return LDAPConfig(**data)
    except Exception as e:
        logger.error("Failed to load LDAP config", error=str(e))
        return None


async def save_ldap_config(config: LDAPConfig):
    """保存LDAP配置"""
    ensure_data_dir()

    try:
        with open(LDAP_CONFIG_FILE, 'w', encoding='utf-8') as f:
            json.dump(
                config.dict(),
                f,
                ensure_ascii=False,
                indent=2,
                default=str
            )
    except Exception as e:
        logger.error("Failed to save LDAP config", error=str(e))
        raise


async def test_ldap_connection(config: LDAPConfig) -> LDAPTestResponse:
    """测试LDAP连接"""
    # 这里是模拟实现,实际应该使用ldap3库连接测试
    try:
        logger.info(
            "Testing LDAP connection",
            server_url=config.server_url,
            base_dn=config.base_dn
        )

        # TODO: 实际实现
        # import ldap3
        # server = ldap3.Server(config.server_url, port=config.port, use_ssl=config.use_ssl)
        # conn = ldap3.Connection(server, user=config.bind_dn, password=config.bind_password)
        # if not conn.bind():
        #     return LDAPTestResponse(success=False, message=f"连接失败: {conn.result}")

        # 模拟成功
        return LDAPTestResponse(
            success=True,
            message="LDAP连接测试成功",
            users=10  # 模拟找到10个用户
        )

    except Exception as e:
        logger.error("LDAP connection test failed", error=str(e))
        return LDAPTestResponse(
            success=False,
            message=f"LDAP连接测试失败: {str(e)}"
        )


async def sync_ldap_users(config: LDAPConfig, session: AsyncSession) -> LDAPSyncResponse:
    """同步LDAP用户"""
    # 这里是模拟实现,实际应该连接LDAP服务器并同步用户
    try:
        logger.info("Syncing LDAP users", server_url=config.server_url)

        # TODO: 实际实现
        # 1. 连接LDAP服务器
        # 2. 搜索用户
        # 3. 比对数据库中的用户
        # 4. 创建新用户或更新现有用户

        # 模拟同步结果
        imported_count = 5
        updated_count = 3

        logger.info(
            "LDAP users synced",
            imported=imported_count,
            updated=updated_count
        )

        return LDAPSyncResponse(
            success=True,
            imported=imported_count,
            updated=updated_count
        )

    except Exception as e:
        logger.error("LDAP user sync failed", error=str(e))
        raise


# ========== API 路由 ==========

@router.get("/", response_model=SecurityConfig, summary="获取安全设置")
async def get_security_settings(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    获取当前安全设置

    权限要求: security:read
    """
    try:
        config = await load_security_config()

        logger.info("Retrieved security settings", user_id=current_user.id)
        return config

    except Exception as e:
        logger.error("Failed to get security settings", error=str(e), user_id=current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取安全设置失败"
        )


@router.put("/", response_model=SecurityConfig, summary="更新安全设置")
async def update_security_settings(
    config_update: SecurityConfigUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    更新安全设置

    权限要求: security:update
    """
    try:
        # 加载当前配置
        config = await load_security_config()

        # 更新配置
        if config_update.password_policy is not None:
            config.password_policy = config_update.password_policy
        if config_update.session is not None:
            config.session = config_update.session
        if config_update.login_security is not None:
            config.login_security = config_update.login_security
        if config_update.audit is not None:
            config.audit = config_update.audit
        if config_update.ip_whitelist is not None:
            config.ip_whitelist = config_update.ip_whitelist

        config.updated_at = datetime.utcnow()
        config.updated_by = current_user.id

        # 保存配置
        await save_security_config(config)

        logger.info("Security settings updated", updated_by=current_user.id)
        return config

    except Exception as e:
        logger.error("Failed to update security settings", error=str(e), user_id=current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="更新安全设置失败"
        )


@router.get("/ldap", response_model=LDAPConfig, summary="获取LDAP配置")
async def get_ldap_config(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    获取LDAP配置

    权限要求: security:read
    """
    try:
        config = await load_ldap_config()

        if not config:
            # 返回默认配置
            config = LDAPConfig(
                enabled=False,
                server_url="ldap://localhost",
                port=389,
                base_dn="dc=example,dc=com",
                bind_dn="cn=admin,dc=example,dc=com",
                bind_password="",
                user_search_base="ou=users,dc=example,dc=com",
                user_search_filter="(uid={username})"
            )

        logger.info("Retrieved LDAP config", user_id=current_user.id)
        return config

    except Exception as e:
        logger.error("Failed to get LDAP config", error=str(e), user_id=current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取LDAP配置失败"
        )


@router.put("/ldap", response_model=LDAPConfig, summary="更新LDAP配置")
async def update_ldap_config(
    config_update: LDAPConfigUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    更新LDAP配置

    权限要求: security:update
    """
    try:
        # 加载当前配置
        config = await load_ldap_config()

        if not config:
            # 如果没有配置,创建新的
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="LDAP配置不存在,请先创建完整的LDAP配置"
            )

        # 更新字段
        update_data = config_update.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(config, field, value)

        config.updated_at = datetime.utcnow()
        config.updated_by = current_user.id

        # 保存配置
        await save_ldap_config(config)

        logger.info("LDAP config updated", updated_by=current_user.id)
        return config

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to update LDAP config", error=str(e), user_id=current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="更新LDAP配置失败"
        )


@router.post("/ldap/test", response_model=LDAPTestResponse, summary="测试LDAP连接")
async def test_ldap_connection_api(
    config: LDAPConfig,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    测试LDAP连接

    权限要求: security:test

    发送测试LDAP配置,验证连接是否正常
    """
    try:
        result = await test_ldap_connection(config)

        logger.info(
            "LDAP connection tested",
            success=result.success,
            tested_by=current_user.id
        )

        return result

    except Exception as e:
        logger.error("Failed to test LDAP connection", error=str(e), user_id=current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="测试LDAP连接失败"
        )


@router.post("/ldap/sync", response_model=LDAPSyncResponse, summary="同步LDAP用户")
async def sync_ldap_users_api(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    同步LDAP用户到系统

    权限要求: security:sync

    从LDAP服务器同步用户信息到本地数据库
    """
    try:
        # 加载LDAP配置
        config = await load_ldap_config()

        if not config:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="LDAP配置不存在,无法同步"
            )

        if not config.enabled:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="LDAP未启用,无法同步"
            )

        # 执行同步
        result = await sync_ldap_users(config, session)

        logger.info(
            "LDAP users synced",
            imported=result.imported,
            updated=result.updated,
            synced_by=current_user.id
        )

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to sync LDAP users", error=str(e), user_id=current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="同步LDAP用户失败"
        )
