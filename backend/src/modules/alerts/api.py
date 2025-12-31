"""
告警中心模块 - API路由

提供告警规则管理、告警查询、告警处理等API端点
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from typing import Optional, List
from datetime import datetime, timedelta
import structlog

from src.core.permissions import require_permission
from src.modules.alerts.schemas import (
    AlertRuleCreate, AlertRuleUpdate, AlertRuleResponse,
    AlertResponse, AlertAcknowledgeRequest, AlertResolveRequest,
    AlertStatistics, AlertSeverity, AlertStatus
)

# 延迟导入避免循环依赖
def get_alert_engine():
    from src.services.alert import alert_engine
    return alert_engine

logger = structlog.get_logger()
router = APIRouter()


# ============= 告警规则管理 =============

@router.get("/rules", response_model=List[AlertRuleResponse], summary="获取告警规则列表")
async def get_alert_rules(
    enabled: Optional[bool] = Query(None, description="是否启用"),
    severity: Optional[AlertSeverity] = Query(None, description="严重级别"),
    current_user: dict = Depends(require_permission("alerts:read"))
):
    """获取所有告警规则"""
    engine = get_alert_engine()
    rules = list(engine.rules.values())
    
    # 过滤
    if enabled is not None:
        rules = [r for r in rules if r.enabled == enabled]
    if severity:
        rules = [r for r in rules if r.severity == severity]
    
    return [
        AlertRuleResponse(
            id=r.id,
            name=r.name,
            description=r.description,
            enabled=r.enabled,
            severity=r.severity,
            metric_name=r.metric_name,
            condition=r.condition,
            threshold=r.threshold,
            duration=r.duration,
            notify_email=r.notify_email,
            notify_websocket=r.notify_websocket,
            email_recipients=r.email_recipients,
            cooldown_minutes=r.cooldown_minutes,
            created_at=r.created_at,
            updated_at=r.updated_at,
            last_triggered=r.last_triggered,
            trigger_count=r.trigger_count
        )
        for r in rules
    ]


@router.get("/rules/{rule_id}", response_model=AlertRuleResponse, summary="获取告警规则详情")
async def get_alert_rule(
    rule_id: str,
    current_user: dict = Depends(require_permission("alerts:read"))
):
    """获取指定告警规则"""
    engine = get_alert_engine()
    rule = engine.rules.get(rule_id)
    
    if not rule:
        raise HTTPException(status_code=404, detail="告警规则不存在")
    
    return AlertRuleResponse(
        id=rule.id,
        name=rule.name,
        description=rule.description,
        enabled=rule.enabled,
        severity=rule.severity,
        metric_name=rule.metric_name,
        condition=rule.condition,
        threshold=rule.threshold,
        duration=rule.duration,
        notify_email=rule.notify_email,
        notify_websocket=rule.notify_websocket,
        email_recipients=rule.email_recipients,
        cooldown_minutes=rule.cooldown_minutes,
        created_at=rule.created_at,
        updated_at=rule.updated_at,
        last_triggered=rule.last_triggered,
        trigger_count=rule.trigger_count
    )


@router.post("/rules", response_model=AlertRuleResponse, summary="创建告警规则")
async def create_alert_rule(
    rule_data: AlertRuleCreate,
    current_user: dict = Depends(require_permission("alerts:create"))
):
    """创建新的告警规则"""
    from src.services.alert import AlertRule
    
    engine = get_alert_engine()
    
    rule = AlertRule(
        name=rule_data.name,
        description=rule_data.description,
        enabled=rule_data.enabled,
        severity=rule_data.severity,
        metric_name=rule_data.metric_name,
        condition=rule_data.condition,
        threshold=rule_data.threshold,
        duration=rule_data.duration,
        notify_email=rule_data.notify_email,
        notify_websocket=rule_data.notify_websocket,
        email_recipients=rule_data.email_recipients,
        cooldown_minutes=rule_data.cooldown_minutes
    )
    
    success = await engine.add_rule(rule)
    if not success:
        raise HTTPException(status_code=500, detail="创建告警规则失败")
    
    logger.info("Alert rule created", rule_id=rule.id, created_by=current_user["id"])
    
    return AlertRuleResponse(
        id=rule.id,
        name=rule.name,
        description=rule.description,
        enabled=rule.enabled,
        severity=rule.severity,
        metric_name=rule.metric_name,
        condition=rule.condition,
        threshold=rule.threshold,
        duration=rule.duration,
        notify_email=rule.notify_email,
        notify_websocket=rule.notify_websocket,
        email_recipients=rule.email_recipients,
        cooldown_minutes=rule.cooldown_minutes,
        created_at=rule.created_at,
        updated_at=rule.updated_at,
        last_triggered=rule.last_triggered,
        trigger_count=rule.trigger_count
    )


@router.delete("/rules/{rule_id}", summary="删除告警规则")
async def delete_alert_rule(
    rule_id: str,
    current_user: dict = Depends(require_permission("alerts:delete"))
):
    """删除告警规则"""
    engine = get_alert_engine()
    success = await engine.remove_rule(rule_id)
    
    if not success:
        raise HTTPException(status_code=404, detail="告警规则不存在")
    
    logger.info("Alert rule deleted", rule_id=rule_id, deleted_by=current_user["id"])
    return {"message": "告警规则已删除"}


# ============= 统计 =============

@router.get("/statistics", response_model=AlertStatistics, summary="获取告警统计")
async def get_alert_statistics(
    current_user: dict = Depends(require_permission("alerts:read"))
):
    """获取告警统计信息"""
    engine = get_alert_engine()
    alerts = list(engine.alerts.values())
    
    now = datetime.now()
    last_24h = now - timedelta(hours=24)
    
    # 统计
    by_severity = {}
    by_device = {}
    
    for alert in alerts:
        # 按严重级别
        sev = alert.severity.value
        by_severity[sev] = by_severity.get(sev, 0) + 1
        
        # 按设备
        if alert.device_name:
            by_device[alert.device_name] = by_device.get(alert.device_name, 0) + 1
    
    return AlertStatistics(
        total_alerts=len(alerts),
        active_alerts=len([a for a in alerts if a.status == AlertStatus.ACTIVE]),
        acknowledged_alerts=len([a for a in alerts if a.status == AlertStatus.ACKNOWLEDGED]),
        resolved_alerts=len([a for a in alerts if a.status == AlertStatus.RESOLVED]),
        by_severity=by_severity,
        by_device=by_device,
        recent_24h=len([a for a in alerts if a.triggered_at >= last_24h])
    )


# ============= 告警查询 =============

@router.get("/", response_model=List[AlertResponse], summary="获取告警列表")
async def get_alerts(
    status: Optional[AlertStatus] = Query(None, description="状态过滤"),
    severity: Optional[AlertSeverity] = Query(None, description="严重级别过滤"),
    device_id: Optional[int] = Query(None, description="设备ID过滤"),
    start_time: Optional[datetime] = Query(None, description="开始时间"),
    end_time: Optional[datetime] = Query(None, description="结束时间"),
    limit: int = Query(50, ge=1, le=200, description="返回数量"),
    current_user: dict = Depends(require_permission("alerts:read"))
):
    """获取告警列表"""
    engine = get_alert_engine()
    alerts = list(engine.alerts.values())
    
    # 过滤
    if status:
        alerts = [a for a in alerts if a.status == status]
    if severity:
        alerts = [a for a in alerts if a.severity == severity]
    if device_id:
        alerts = [a for a in alerts if a.device_id == device_id]
    if start_time:
        alerts = [a for a in alerts if a.triggered_at >= start_time]
    if end_time:
        alerts = [a for a in alerts if a.triggered_at <= end_time]
    
    # 按时间倒序
    alerts.sort(key=lambda x: x.triggered_at, reverse=True)
    alerts = alerts[:limit]
    
    return [
        AlertResponse(
            id=a.id,
            rule_id=a.rule_id,
            rule_name=a.rule_name,
            severity=a.severity,
            status=a.status,
            title=a.title,
            message=a.message,
            details=a.details,
            device_id=a.device_id,
            device_name=a.device_name,
            device_ip=a.device_ip,
            triggered_at=a.triggered_at,
            acknowledged_at=a.acknowledged_at,
            resolved_at=a.resolved_at,
            acknowledged_by=a.acknowledged_by,
            resolved_by=a.resolved_by,
            notes=a.notes
        )
        for a in alerts
    ]


@router.get("/{alert_id}", response_model=AlertResponse, summary="获取告警详情")
async def get_alert(
    alert_id: str,
    current_user: dict = Depends(require_permission("alerts:read"))
):
    """获取指定告警详情"""
    engine = get_alert_engine()
    alert = engine.alerts.get(alert_id)
    
    if not alert:
        raise HTTPException(status_code=404, detail="告警不存在")
    
    return AlertResponse(
        id=alert.id,
        rule_id=alert.rule_id,
        rule_name=alert.rule_name,
        severity=alert.severity,
        status=alert.status,
        title=alert.title,
        message=alert.message,
        details=alert.details,
        device_id=alert.device_id,
        device_name=alert.device_name,
        device_ip=alert.device_ip,
        triggered_at=alert.triggered_at,
        acknowledged_at=alert.acknowledged_at,
        resolved_at=alert.resolved_at,
        acknowledged_by=alert.acknowledged_by,
        resolved_by=alert.resolved_by,
        notes=alert.notes
    )


# ============= 告警处理 =============

@router.post("/{alert_id}/acknowledge", summary="确认告警")
async def acknowledge_alert(
    alert_id: str,
    request: AlertAcknowledgeRequest,
    current_user: dict = Depends(require_permission("alerts:update"))
):
    """确认告警"""
    engine = get_alert_engine()
    success = await engine.acknowledge_alert(
        alert_id,
        current_user["id"],
        request.notes
    )
    
    if not success:
        raise HTTPException(status_code=404, detail="告警不存在")
    
    logger.info("Alert acknowledged", alert_id=alert_id, acknowledged_by=current_user["id"])
    return {"message": "告警已确认"}


@router.post("/{alert_id}/resolve", summary="解决告警")
async def resolve_alert(
    alert_id: str,
    request: AlertResolveRequest,
    current_user: dict = Depends(require_permission("alerts:update"))
):
    """解决告警"""
    engine = get_alert_engine()
    success = await engine.resolve_alert(
        alert_id,
        current_user["id"],
        request.notes
    )
    
    if not success:
        raise HTTPException(status_code=404, detail="告警不存在")
    
    logger.info("Alert resolved", alert_id=alert_id, resolved_by=current_user["id"])
    return {"message": "告警已解决"}
