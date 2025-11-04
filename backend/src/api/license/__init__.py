from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel, Field, validator
from datetime import datetime, timedelta
import structlog
import json
import hashlib
from pathlib import Path

from src.core.database import get_db_session
from src.core.auth import get_current_user
from src.models.user import User

logger = structlog.get_logger()
router = APIRouter(tags=["许可证管理"])

# ========== 配置存储路径 ==========

LICENSE_FILE = Path("./data/license.json")


def ensure_data_dir():
    """确保数据目录存在"""
    LICENSE_FILE.parent.mkdir(parents=True, exist_ok=True)


# ========== Pydantic 模型定义 ==========

class LicenseFeature(BaseModel):
    """许可证功能"""
    name: str = Field(..., description="功能名称")
    enabled: bool = Field(..., description="是否启用")
    limit: Optional[int] = Field(None, description="功能限制(如设备数量)")


class License(BaseModel):
    """许可证信息"""
    license_key: str = Field(..., description="许可证密钥")
    license_type: str = Field(..., description="许可证类型(trial/standard/professional/enterprise)")
    company_name: str = Field(..., description="公司名称")
    contact_email: str = Field(..., description="联系邮箱")
    issued_at: datetime = Field(..., description="颁发时间")
    expires_at: datetime = Field(..., description="过期时间")
    max_devices: int = Field(..., description="最大设备数")
    max_users: int = Field(..., description="最大用户数")
    features: List[LicenseFeature] = Field(default_factory=list, description="功能列表")
    is_active: bool = Field(True, description="是否激活")
    is_trial: bool = Field(False, description="是否试用版")
    activated_at: Optional[datetime] = Field(None, description="激活时间")

    @property
    def is_expired(self) -> bool:
        """是否过期"""
        return datetime.utcnow() > self.expires_at

    @property
    def days_remaining(self) -> int:
        """剩余天数"""
        delta = self.expires_at - datetime.utcnow()
        return max(0, delta.days)

    class Config:
        from_attributes = True


class UpdateLicenseRequest(BaseModel):
    """更新许可证请求"""
    licenseKey: str = Field(..., min_length=16, description="许可证密钥")


class ValidateLicenseResponse(BaseModel):
    """验证许可证响应"""
    valid: bool
    message: str


# ========== 辅助函数 ==========

def generate_license_key(company_name: str, license_type: str, expires_at: datetime) -> str:
    """生成许可证密钥(简化版)"""
    # 这是一个简化的实现,实际应该使用更安全的加密算法
    data = f"{company_name}:{license_type}:{expires_at.isoformat()}"
    hash_value = hashlib.sha256(data.encode()).hexdigest()
    # 格式化为XXXX-XXXX-XXXX-XXXX格式
    key_parts = [hash_value[i:i+4].upper() for i in range(0, 16, 4)]
    return "-".join(key_parts)


def validate_license_key_format(license_key: str) -> bool:
    """验证许可证密钥格式"""
    # 简单验证格式: XXXX-XXXX-XXXX-XXXX
    parts = license_key.split("-")
    if len(parts) != 4:
        return False
    for part in parts:
        if len(part) != 4 or not part.isalnum():
            return False
    return True


def parse_license_key(license_key: str) -> Optional[dict]:
    """解析许可证密钥(简化版)"""
    # 这里是模拟实现,实际应该解密许可证密钥
    # TODO: 实现真实的许可证解密逻辑

    if not validate_license_key_format(license_key):
        return None

    # 模拟解析结果
    return {
        'license_type': 'professional',
        'company_name': 'Test Company',
        'contact_email': 'contact@example.com',
        'max_devices': 1000,
        'max_users': 100,
        'expires_at': datetime.utcnow() + timedelta(days=365),
        'features': [
            {'name': 'advanced_monitoring', 'enabled': True, 'limit': None},
            {'name': 'custom_reports', 'enabled': True, 'limit': None},
            {'name': 'api_access', 'enabled': True, 'limit': None},
            {'name': 'ldap_integration', 'enabled': True, 'limit': None}
        ]
    }


async def load_license() -> Optional[License]:
    """加载许可证"""
    ensure_data_dir()

    if not LICENSE_FILE.exists():
        return None

    try:
        with open(LICENSE_FILE, 'r', encoding='utf-8') as f:
            data = json.load(f)
            # 将ISO格式字符串转换回datetime
            if 'issued_at' in data and isinstance(data['issued_at'], str):
                data['issued_at'] = datetime.fromisoformat(data['issued_at'])
            if 'expires_at' in data and isinstance(data['expires_at'], str):
                data['expires_at'] = datetime.fromisoformat(data['expires_at'])
            if 'activated_at' in data and isinstance(data['activated_at'], str):
                data['activated_at'] = datetime.fromisoformat(data['activated_at'])

            return License(**data)
    except Exception as e:
        logger.error("Failed to load license", error=str(e))
        return None


async def save_license(license_info: License):
    """保存许可证"""
    ensure_data_dir()

    try:
        with open(LICENSE_FILE, 'w', encoding='utf-8') as f:
            json.dump(
                license_info.dict(),
                f,
                ensure_ascii=False,
                indent=2,
                default=str
            )
    except Exception as e:
        logger.error("Failed to save license", error=str(e))
        raise


async def create_trial_license(company_name: str, contact_email: str) -> License:
    """创建试用许可证"""
    now = datetime.utcnow()
    expires_at = now + timedelta(days=30)  # 试用期30天

    license_key = generate_license_key(company_name, "trial", expires_at)

    return License(
        license_key=license_key,
        license_type="trial",
        company_name=company_name,
        contact_email=contact_email,
        issued_at=now,
        expires_at=expires_at,
        max_devices=10,
        max_users=5,
        features=[
            LicenseFeature(name="basic_monitoring", enabled=True, limit=None),
            LicenseFeature(name="reports", enabled=True, limit=10)
        ],
        is_active=True,
        is_trial=True,
        activated_at=now
    )


# ========== API 路由 ==========

@router.get("/", response_model=License, summary="获取许可证信息")
async def get_license(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    获取当前许可证信息

    权限要求: license:read
    """
    try:
        license_info = await load_license()

        if not license_info:
            # 如果没有许可证,创建试用许可证
            license_info = await create_trial_license(
                company_name="Default Company",
                contact_email="admin@example.com"
            )
            await save_license(license_info)

        logger.info("Retrieved license info", user_id=current_user.id)
        return license_info

    except Exception as e:
        logger.error("Failed to get license", error=str(e), user_id=current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取许可证信息失败"
        )


@router.put("/", response_model=License, summary="更新许可证")
async def update_license(
    request: UpdateLicenseRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    更新许可证密钥

    权限要求: license:update

    提供新的许可证密钥,系统会验证并激活
    """
    try:
        # 验证许可证密钥格式
        if not validate_license_key_format(request.licenseKey):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="许可证密钥格式不正确"
            )

        # 解析许可证密钥
        parsed_data = parse_license_key(request.licenseKey)

        if not parsed_data:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="无法解析许可证密钥"
            )

        # 创建许可证对象
        now = datetime.utcnow()
        license_info = License(
            license_key=request.licenseKey,
            license_type=parsed_data['license_type'],
            company_name=parsed_data['company_name'],
            contact_email=parsed_data['contact_email'],
            issued_at=now,
            expires_at=parsed_data['expires_at'],
            max_devices=parsed_data['max_devices'],
            max_users=parsed_data['max_users'],
            features=[LicenseFeature(**f) for f in parsed_data['features']],
            is_active=True,
            is_trial=False,
            activated_at=now
        )

        # 保存许可证
        await save_license(license_info)

        logger.info(
            "License updated",
            license_type=license_info.license_type,
            updated_by=current_user.id
        )

        return license_info

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to update license", error=str(e), user_id=current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="更新许可证失败"
        )


@router.post("/validate", response_model=ValidateLicenseResponse, summary="验证许可证")
async def validate_license(
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    验证当前许可证的有效性

    权限要求: license:read

    检查项:
    - 许可证是否存在
    - 许可证是否过期
    - 许可证是否激活
    - 设备数是否超限
    - 用户数是否超限
    """
    try:
        license_info = await load_license()

        if not license_info:
            return ValidateLicenseResponse(
                valid=False,
                message="许可证不存在"
            )

        if not license_info.is_active:
            return ValidateLicenseResponse(
                valid=False,
                message="许可证未激活"
            )

        if license_info.is_expired:
            return ValidateLicenseResponse(
                valid=False,
                message=f"许可证已过期(过期时间: {license_info.expires_at.strftime('%Y-%m-%d')})"
            )

        # TODO: 检查设备数和用户数是否超限
        # from sqlalchemy import select, func
        # device_count = await session.scalar(select(func.count()).select_from(Device))
        # user_count = await session.scalar(select(func.count()).select_from(User))
        #
        # if device_count > license_info.max_devices:
        #     return ValidateLicenseResponse(
        #         valid=False,
        #         message=f"设备数超限(当前: {device_count}, 限制: {license_info.max_devices})"
        #     )
        #
        # if user_count > license_info.max_users:
        #     return ValidateLicenseResponse(
        #         valid=False,
        #         message=f"用户数超限(当前: {user_count}, 限制: {license_info.max_users})"
        #     )

        # 许可证有效
        days_remaining = license_info.days_remaining
        if license_info.is_trial:
            message = f"试用许可证有效,剩余{days_remaining}天"
        else:
            message = f"许可证有效,剩余{days_remaining}天"

        logger.info(
            "License validated",
            valid=True,
            days_remaining=days_remaining,
            validated_by=current_user.id
        )

        return ValidateLicenseResponse(
            valid=True,
            message=message
        )

    except Exception as e:
        logger.error("Failed to validate license", error=str(e), user_id=current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="验证许可证失败"
        )
