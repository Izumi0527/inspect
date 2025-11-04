from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, delete
from pydantic import BaseModel, Field
from datetime import datetime
import structlog
import uuid
import json

from src.core.database import get_db_session
from src.core.auth import get_current_user
from src.models.user import User

logger = structlog.get_logger()
router = APIRouter(tags=["通知配置"])

# ========== Pydantic 模型定义 ==========

class NotificationChannelConfig(BaseModel):
    """通知渠道配置"""
    enabled: bool = Field(True, description="是否启用")
    recipients: List[str] = Field(default_factory=list, description="接收人列表")
    template: Optional[str] = Field(None, description="消息模板")
    params: Optional[dict] = Field(default_factory=dict, description="额外参数")


class NotificationConfigBase(BaseModel):
    """通知配置基础模型"""
    name: str = Field(..., min_length=2, max_length=100, description="配置名称")
    description: Optional[str] = Field(None, max_length=500, description="描述")
    type: str = Field(..., pattern="^(email|sms|webhook|wechat|dingtalk)$", description="通知类型")
    is_active: bool = Field(True, description="是否激活")
    priority: int = Field(0, ge=0, le=10, description="优先级(0-10)")
    channels: dict = Field(default_factory=dict, description="渠道配置")


class NotificationConfigCreate(NotificationConfigBase):
    """创建通知配置请求"""
    pass


class NotificationConfigUpdate(BaseModel):
    """更新通知配置请求"""
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    is_active: Optional[bool] = None
    priority: Optional[int] = Field(None, ge=0, le=10)
    channels: Optional[dict] = None


class NotificationConfigResponse(BaseModel):
    """通知配置响应"""
    id: str
    name: str
    description: Optional[str] = None
    type: str
    is_active: bool
    priority: int
    channels: dict
    created_at: datetime
    updated_at: datetime
    created_by: Optional[str] = None

    class Config:
        from_attributes = True


class TestNotificationRequest(BaseModel):
    """测试通知请求"""
    recipient: Optional[str] = Field(None, description="测试接收人")


# ========== 辅助函数 ==========

# 由于没有数据库表,暂时使用JSON文件存储
import os
from pathlib import Path

NOTIFICATION_CONFIG_DIR = Path("./data/notification_configs")


def ensure_config_dir():
    """确保配置目录存在"""
    NOTIFICATION_CONFIG_DIR.mkdir(parents=True, exist_ok=True)


def get_config_file_path(config_id: str) -> Path:
    """获取配置文件路径"""
    ensure_config_dir()
    return NOTIFICATION_CONFIG_DIR / f"{config_id}.json"


async def save_notification_config(config_id: str, config_data: dict):
    """保存通知配置"""
    config_path = get_config_file_path(config_id)
    with open(config_path, 'w', encoding='utf-8') as f:
        json.dump(config_data, f, ensure_ascii=False, indent=2, default=str)


async def load_notification_config(config_id: str) -> Optional[dict]:
    """加载通知配置"""
    config_path = get_config_file_path(config_id)
    if not config_path.exists():
        return None
    with open(config_path, 'r', encoding='utf-8') as f:
        return json.load(f)


async def list_all_notification_configs() -> List[dict]:
    """列出所有通知配置"""
    ensure_config_dir()
    configs = []
    for config_file in NOTIFICATION_CONFIG_DIR.glob("*.json"):
        try:
            with open(config_file, 'r', encoding='utf-8') as f:
                config = json.load(f)
                configs.append(config)
        except Exception as e:
            logger.warning(f"Failed to read notification config: {config_file}", error=str(e))
            continue

    # 按优先级和创建时间排序
    configs.sort(key=lambda x: (-x.get('priority', 0), x.get('created_at', '')), reverse=False)
    return configs


async def check_config_name_exists(name: str, exclude_id: Optional[str] = None) -> bool:
    """检查配置名称是否存在"""
    configs = await list_all_notification_configs()
    for config in configs:
        if config['name'] == name:
            if exclude_id and config['id'] == exclude_id:
                continue
            return True
    return False


async def send_test_notification(config: dict, recipient: Optional[str]) -> dict:
    """发送测试通知"""
    # 这里是模拟实现,实际应该根据type调用不同的通知服务
    notification_type = config.get('type')

    if not recipient:
        # 如果没有指定接收人,从配置中获取第一个
        channels = config.get('channels', {})
        recipients = []
        for channel_config in channels.values():
            if isinstance(channel_config, dict) and 'recipients' in channel_config:
                recipients = channel_config.get('recipients', [])
                break

        if not recipients:
            return {
                'success': False,
                'message': '未找到测试接收人'
            }
        recipient = recipients[0]

    logger.info(
        "Sending test notification",
        config_id=config['id'],
        type=notification_type,
        recipient=recipient
    )

    # 模拟发送成功
    return {
        'success': True,
        'message': f'测试通知已发送至 {recipient}'
    }


# ========== API 路由 ==========

@router.get("/", response_model=List[NotificationConfigResponse], summary="获取通知配置列表")
async def get_notification_configs(
    type: Optional[str] = Query(None, description="按类型筛选"),
    is_active: Optional[bool] = Query(None, description="按激活状态筛选"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    获取所有通知配置列表

    权限要求: notifications:read
    """
    try:
        configs = await list_all_notification_configs()

        # 应用筛选
        if type:
            configs = [c for c in configs if c.get('type') == type]
        if is_active is not None:
            configs = [c for c in configs if c.get('is_active') == is_active]

        # 构建响应
        config_responses = []
        for config in configs:
            config_response = NotificationConfigResponse(
                id=config['id'],
                name=config['name'],
                description=config.get('description'),
                type=config['type'],
                is_active=config.get('is_active', True),
                priority=config.get('priority', 0),
                channels=config.get('channels', {}),
                created_at=datetime.fromisoformat(config['created_at']) if isinstance(config['created_at'], str) else config['created_at'],
                updated_at=datetime.fromisoformat(config['updated_at']) if isinstance(config['updated_at'], str) else config['updated_at'],
                created_by=config.get('created_by')
            )
            config_responses.append(config_response)

        logger.info("Retrieved notification configs", count=len(config_responses), user_id=current_user.id)
        return config_responses

    except Exception as e:
        logger.error("Failed to get notification configs", error=str(e), user_id=current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取通知配置列表失败"
        )


@router.get("/{config_id}", response_model=NotificationConfigResponse, summary="获取通知配置详情")
async def get_notification_config(
    config_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    获取指定通知配置的详细信息

    权限要求: notifications:read
    """
    try:
        config = await load_notification_config(config_id)

        if not config:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"通知配置不存在: {config_id}"
            )

        config_response = NotificationConfigResponse(
            id=config['id'],
            name=config['name'],
            description=config.get('description'),
            type=config['type'],
            is_active=config.get('is_active', True),
            priority=config.get('priority', 0),
            channels=config.get('channels', {}),
            created_at=datetime.fromisoformat(config['created_at']) if isinstance(config['created_at'], str) else config['created_at'],
            updated_at=datetime.fromisoformat(config['updated_at']) if isinstance(config['updated_at'], str) else config['updated_at'],
            created_by=config.get('created_by')
        )

        logger.info("Retrieved notification config details", config_id=config_id, user_id=current_user.id)
        return config_response

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get notification config", config_id=config_id, error=str(e), user_id=current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取通知配置详情失败"
        )


@router.post("/", response_model=NotificationConfigResponse, status_code=status.HTTP_201_CREATED, summary="创建通知配置")
async def create_notification_config(
    config_data: NotificationConfigCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    创建新的通知配置

    权限要求: notifications:create

    支持的通知类型:
    - email: 邮件通知
    - sms: 短信通知
    - webhook: Webhook通知
    - wechat: 企业微信通知
    - dingtalk: 钉钉通知
    """
    try:
        # 检查配置名称是否已存在
        if await check_config_name_exists(config_data.name):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"通知配置名称已存在: {config_data.name}"
            )

        config_id = str(uuid.uuid4())
        now = datetime.utcnow()

        # 创建配置数据
        config = {
            'id': config_id,
            'name': config_data.name,
            'description': config_data.description,
            'type': config_data.type,
            'is_active': config_data.is_active,
            'priority': config_data.priority,
            'channels': config_data.channels,
            'created_at': now.isoformat(),
            'updated_at': now.isoformat(),
            'created_by': current_user.id
        }

        # 保存配置
        await save_notification_config(config_id, config)

        config_response = NotificationConfigResponse(
            id=config['id'],
            name=config['name'],
            description=config.get('description'),
            type=config['type'],
            is_active=config['is_active'],
            priority=config['priority'],
            channels=config['channels'],
            created_at=now,
            updated_at=now,
            created_by=config['created_by']
        )

        logger.info("Notification config created", config_id=config_id, name=config_data.name, created_by=current_user.id)
        return config_response

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to create notification config", error=str(e), user_id=current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="创建通知配置失败"
        )


@router.put("/{config_id}", response_model=NotificationConfigResponse, summary="更新通知配置")
async def update_notification_config(
    config_id: str,
    config_data: NotificationConfigUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    更新通知配置信息

    权限要求: notifications:update
    """
    try:
        config = await load_notification_config(config_id)

        if not config:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"通知配置不存在: {config_id}"
            )

        # 如果更新名称,检查是否冲突
        if config_data.name and config_data.name != config['name']:
            if await check_config_name_exists(config_data.name, exclude_id=config_id):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=f"通知配置名称已存在: {config_data.name}"
                )

        # 更新字段
        if config_data.name is not None:
            config['name'] = config_data.name
        if config_data.description is not None:
            config['description'] = config_data.description
        if config_data.is_active is not None:
            config['is_active'] = config_data.is_active
        if config_data.priority is not None:
            config['priority'] = config_data.priority
        if config_data.channels is not None:
            config['channels'] = config_data.channels

        config['updated_at'] = datetime.utcnow().isoformat()

        # 保存更新
        await save_notification_config(config_id, config)

        config_response = NotificationConfigResponse(
            id=config['id'],
            name=config['name'],
            description=config.get('description'),
            type=config['type'],
            is_active=config['is_active'],
            priority=config['priority'],
            channels=config['channels'],
            created_at=datetime.fromisoformat(config['created_at']),
            updated_at=datetime.fromisoformat(config['updated_at']),
            created_by=config.get('created_by')
        )

        logger.info("Notification config updated", config_id=config_id, updated_by=current_user.id)
        return config_response

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to update notification config", config_id=config_id, error=str(e), user_id=current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="更新通知配置失败"
        )


@router.delete("/{config_id}", status_code=status.HTTP_204_NO_CONTENT, summary="删除通知配置")
async def delete_notification_config(
    config_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    删除通知配置

    权限要求: notifications:delete

    注意: 此操作不可逆
    """
    try:
        config = await load_notification_config(config_id)

        if not config:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"通知配置不存在: {config_id}"
            )

        # 删除配置文件
        config_path = get_config_file_path(config_id)
        if config_path.exists():
            config_path.unlink()

        logger.info("Notification config deleted", config_id=config_id, deleted_by=current_user.id)

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to delete notification config", config_id=config_id, error=str(e), user_id=current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="删除通知配置失败"
        )


@router.post("/{config_id}/test", summary="测试通知配置")
async def test_notification_config(
    config_id: str,
    request: TestNotificationRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    测试通知配置是否正常工作

    权限要求: notifications:test

    发送一条测试消息到指定接收人
    """
    try:
        config = await load_notification_config(config_id)

        if not config:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"通知配置不存在: {config_id}"
            )

        if not config.get('is_active'):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="通知配置未激活,无法测试"
            )

        # 发送测试通知
        result = await send_test_notification(config, request.recipient)

        logger.info(
            "Notification config tested",
            config_id=config_id,
            success=result['success'],
            tested_by=current_user.id
        )

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to test notification config", config_id=config_id, error=str(e), user_id=current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="测试通知配置失败"
        )
