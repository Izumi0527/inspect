"""
告警升级管理API

提供告警升级规则配置、状态查询和手动控制功能
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from datetime import datetime
import structlog

from src.core.auth import get_current_user
from src.models.user import User
from src.schemas.user import UserRole
from src.services.alert import (
    alert_escalation_service,
    EscalationRule,
    EscalationLevel,
    NotificationChannel,
    AlertSeverity,
    alert_engine
)

logger = structlog.get_logger()
router = APIRouter(prefix="/escalation", tags=["告警升级"])


# ==================== Schemas ====================

class EscalationRuleRequest(BaseModel):
    """升级规则请求"""
    name: str = Field(..., description="规则名称")
    severity: AlertSeverity = Field(..., description="适用的告警严重级别")
    escalation_enabled: bool = Field(True, description="是否启用升级")

    level_1_timeout: int = Field(1800, ge=60, le=86400, description="一级超时时间(秒)")
    level_2_timeout: int = Field(3600, ge=60, le=86400, description="二级超时时间(秒)")
    level_3_timeout: int = Field(7200, ge=60, le=86400, description="三级超时时间(秒)")
    level_4_timeout: int = Field(14400, ge=60, le=86400, description="四级超时时间(秒)")

    auto_severity_upgrade: bool = Field(False, description="是否自动提升严重级别")
    max_severity: AlertSeverity = Field(AlertSeverity.FATAL, description="最大严重级别")

    notification_channels: List[NotificationChannel] = Field(
        default=[NotificationChannel.EMAIL, NotificationChannel.WEBSOCKET],
        description="通知渠道"
    )

    level_1_recipients: List[str] = Field(default=[], description="一级收件人")
    level_2_recipients: List[str] = Field(default=[], description="二级收件人")
    level_3_recipients: List[str] = Field(default=[], description="三级收件人")
    level_4_recipients: List[str] = Field(default=[], description="四级收件人")


class EscalationRuleResponse(BaseModel):
    """升级规则响应"""
    id: str
    name: str
    severity: str
    escalation_enabled: bool
    level_1_timeout: int
    level_2_timeout: int
    level_3_timeout: int
    level_4_timeout: int
    auto_severity_upgrade: bool
    max_severity: str
    notification_channels: List[str]
    level_1_recipients: List[str]
    level_2_recipients: List[str]
    level_3_recipients: List[str]
    level_4_recipients: List[str]
    created_at: datetime
    updated_at: datetime


class EscalationStatusResponse(BaseModel):
    """升级状态响应"""
    escalation_id: str
    alert_id: str
    current_level: str
    next_escalation_time: Optional[datetime]
    history: List[Dict[str, Any]]
    is_active: bool
    created_at: datetime
    updated_at: datetime


# ==================== Helper Functions ====================

def _rule_to_response(rule: EscalationRule) -> EscalationRuleResponse:
    """将规则对象转换为响应模型"""
    return EscalationRuleResponse(
        id=rule.id,
        name=rule.name,
        severity=rule.severity.value,
        escalation_enabled=rule.escalation_enabled,
        level_1_timeout=rule.level_1_timeout,
        level_2_timeout=rule.level_2_timeout,
        level_3_timeout=rule.level_3_timeout,
        level_4_timeout=rule.level_4_timeout,
        auto_severity_upgrade=rule.auto_severity_upgrade,
        max_severity=rule.max_severity.value,
        notification_channels=[ch.value for ch in rule.notification_channels],
        level_1_recipients=rule.level_1_recipients,
        level_2_recipients=rule.level_2_recipients,
        level_3_recipients=rule.level_3_recipients,
        level_4_recipients=rule.level_4_recipients,
        created_at=rule.created_at,
        updated_at=rule.updated_at
    )


# ==================== API Endpoints ====================

@router.get("/rules", response_model=List[EscalationRuleResponse])
async def get_escalation_rules(
    current_user: User = Depends(get_current_user)
):
    """获取所有升级规则"""
    rules = [
        _rule_to_response(rule)
        for rule in alert_escalation_service.escalation_rules.values()
    ]
    return sorted(rules, key=lambda x: x.created_at, reverse=True)


@router.post("/rules", response_model=EscalationRuleResponse)
async def create_escalation_rule(
    rule_request: EscalationRuleRequest,
    current_user: User = Depends(get_current_user)
):
    """创建升级规则"""
    if current_user.role not in [UserRole.ADMIN, UserRole.OPERATOR]:
        raise HTTPException(status_code=403, detail="权限不足")

    try:
        rule = EscalationRule(
            name=rule_request.name,
            severity=rule_request.severity,
            escalation_enabled=rule_request.escalation_enabled,
            level_1_timeout=rule_request.level_1_timeout,
            level_2_timeout=rule_request.level_2_timeout,
            level_3_timeout=rule_request.level_3_timeout,
            level_4_timeout=rule_request.level_4_timeout,
            auto_severity_upgrade=rule_request.auto_severity_upgrade,
            max_severity=rule_request.max_severity,
            notification_channels=rule_request.notification_channels,
            level_1_recipients=rule_request.level_1_recipients,
            level_2_recipients=rule_request.level_2_recipients,
            level_3_recipients=rule_request.level_3_recipients,
            level_4_recipients=rule_request.level_4_recipients
        )

        alert_escalation_service.escalation_rules[rule.id] = rule

        logger.info(
            "Escalation rule created",
            rule_id=rule.id,
            rule_name=rule.name,
            created_by=current_user.username
        )

        return _rule_to_response(rule)

    except Exception as e:
        logger.error("Failed to create escalation rule", error=str(e))
        raise HTTPException(status_code=500, detail=f"创建升级规则失败: {str(e)}")


@router.put("/rules/{rule_id}", response_model=EscalationRuleResponse)
async def update_escalation_rule(
    rule_id: str,
    rule_request: EscalationRuleRequest,
    current_user: User = Depends(get_current_user)
):
    """更新升级规则"""
    if current_user.role not in [UserRole.ADMIN, UserRole.OPERATOR]:
        raise HTTPException(status_code=403, detail="权限不足")

    rule = alert_escalation_service.escalation_rules.get(rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="升级规则不存在")

    try:
        rule.name = rule_request.name
        rule.severity = rule_request.severity
        rule.escalation_enabled = rule_request.escalation_enabled
        rule.level_1_timeout = rule_request.level_1_timeout
        rule.level_2_timeout = rule_request.level_2_timeout
        rule.level_3_timeout = rule_request.level_3_timeout
        rule.level_4_timeout = rule_request.level_4_timeout
        rule.auto_severity_upgrade = rule_request.auto_severity_upgrade
        rule.max_severity = rule_request.max_severity
        rule.notification_channels = rule_request.notification_channels
        rule.level_1_recipients = rule_request.level_1_recipients
        rule.level_2_recipients = rule_request.level_2_recipients
        rule.level_3_recipients = rule_request.level_3_recipients
        rule.level_4_recipients = rule_request.level_4_recipients
        rule.updated_at = datetime.now()

        logger.info(
            "Escalation rule updated",
            rule_id=rule_id,
            updated_by=current_user.username
        )

        return _rule_to_response(rule)

    except Exception as e:
        logger.error("Failed to update escalation rule", rule_id=rule_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"更新升级规则失败: {str(e)}")


@router.delete("/rules/{rule_id}")
async def delete_escalation_rule(
    rule_id: str,
    current_user: User = Depends(get_current_user)
):
    """删除升级规则"""
    if current_user.role not in [UserRole.ADMIN, UserRole.OPERATOR]:
        raise HTTPException(status_code=403, detail="权限不足")

    if rule_id not in alert_escalation_service.escalation_rules:
        raise HTTPException(status_code=404, detail="升级规则不存在")

    try:
        del alert_escalation_service.escalation_rules[rule_id]

        logger.info(
            "Escalation rule deleted",
            rule_id=rule_id,
            deleted_by=current_user.username
        )

        return {"message": "升级规则已删除", "rule_id": rule_id}

    except Exception as e:
        logger.error("Failed to delete escalation rule", rule_id=rule_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"删除升级规则失败: {str(e)}")


@router.get("/status/{alert_id}", response_model=Optional[EscalationStatusResponse])
async def get_escalation_status(
    alert_id: str,
    current_user: User = Depends(get_current_user)
):
    """获取告警升级状态"""
    try:
        status = await alert_escalation_service.get_escalation_status(alert_id)

        if not status:
            return None

        return EscalationStatusResponse(**status)

    except Exception as e:
        logger.error("Failed to get escalation status", alert_id=alert_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"获取升级状态失败: {str(e)}")


@router.post("/cancel/{alert_id}")
async def cancel_escalation(
    alert_id: str,
    reason: str = Query(..., description="取消原因"),
    current_user: User = Depends(get_current_user)
):
    """手动取消告警升级"""
    if current_user.role not in [UserRole.ADMIN, UserRole.OPERATOR]:
        raise HTTPException(status_code=403, detail="权限不足")

    try:
        success = await alert_escalation_service.cancel_escalation(
            alert_id,
            f"{reason} (用户: {current_user.username})"
        )

        if success:
            logger.info(
                "Alert escalation cancelled manually",
                alert_id=alert_id,
                reason=reason,
                cancelled_by=current_user.username
            )
            return {"message": "告警升级已取消", "alert_id": alert_id}
        else:
            raise HTTPException(status_code=404, detail="未找到活跃的告警升级")

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to cancel escalation", alert_id=alert_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"取消升级失败: {str(e)}")


@router.get("/statistics")
async def get_escalation_statistics(
    current_user: User = Depends(get_current_user)
):
    """获取升级统计信息"""
    try:
        stats = await alert_escalation_service.get_escalation_statistics()
        return stats

    except Exception as e:
        logger.error("Failed to get escalation statistics", error=str(e))
        raise HTTPException(status_code=500, detail=f"获取升级统计失败: {str(e)}")


@router.post("/test/{alert_id}")
async def test_escalation(
    alert_id: str,
    current_user: User = Depends(get_current_user)
):
    """测试告警升级（仅限管理员）"""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="仅限管理员使用")

    alert = alert_engine.alerts.get(alert_id)
    if not alert:
        raise HTTPException(status_code=404, detail="告警不存在")

    try:
        escalation_id = await alert_escalation_service.create_escalation(
            alert_id, alert.severity
        )

        if escalation_id:
            logger.info(
                "Test escalation created",
                alert_id=alert_id,
                escalation_id=escalation_id,
                created_by=current_user.username
            )
            return {
                "message": "测试升级已创建",
                "alert_id": alert_id,
                "escalation_id": escalation_id
            }
        else:
            return {"message": "未找到匹配的升级规则或升级已存在", "alert_id": alert_id}

    except Exception as e:
        logger.error("Failed to create test escalation", alert_id=alert_id, error=str(e))
        raise HTTPException(status_code=500, detail=f"创建测试升级失败: {str(e)}")
