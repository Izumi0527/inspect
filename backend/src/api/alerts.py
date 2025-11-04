"""
告警管理API路由
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
from datetime import datetime
import structlog

from src.services.alert_engine import (
    alert_engine,
    AlertRule,
    Alert,
    AlertSeverity,
    AlertStatus,
    RuleCondition
)
from src.core.auth import get_current_active_user
from src.models.user import User

logger = structlog.get_logger()
router = APIRouter()


class RuleCreateRequest(BaseModel):
    """告警规则创建请求"""
    name: str
    description: str
    metric_name: str
    condition: RuleCondition
    threshold: float
    duration: int = 300
    severity: AlertSeverity = AlertSeverity.WARNING
    enabled: bool = True
    notify_email: bool = True
    notify_websocket: bool = True
    email_recipients: List[str] = []
    cooldown_minutes: int = 30


class RuleUpdateRequest(BaseModel):
    """告警规则更新请求"""
    name: Optional[str] = None
    description: Optional[str] = None
    metric_name: Optional[str] = None
    condition: Optional[RuleCondition] = None
    threshold: Optional[float] = None
    duration: Optional[int] = None
    severity: Optional[AlertSeverity] = None
    enabled: Optional[bool] = None
    notify_email: Optional[bool] = None
    notify_websocket: Optional[bool] = None
    email_recipients: Optional[List[str]] = None
    cooldown_minutes: Optional[int] = None


class AlertActionRequest(BaseModel):
    """告警操作请求"""
    notes: Optional[str] = None


class RuleResponse(BaseModel):
    """告警规则响应"""
    id: str
    name: str
    description: str
    enabled: bool
    severity: str
    metric_name: str
    condition: str
    threshold: float
    duration: int
    cooldown_minutes: int
    notify_email: bool
    notify_websocket: bool
    email_recipients: List[str]
    created_at: str
    updated_at: str
    last_triggered: Optional[str]
    trigger_count: int


class AlertResponse(BaseModel):
    """告警响应"""
    id: str
    rule_id: str
    rule_name: str
    severity: str
    status: str
    title: str
    message: str
    details: Dict[str, Any]
    device_id: Optional[int]
    device_name: Optional[str]
    device_ip: Optional[str]
    triggered_at: str
    acknowledged_at: Optional[str]
    resolved_at: Optional[str]
    acknowledged_by: Optional[str]
    resolved_by: Optional[str]
    notes: List[str]


class AlertStatsResponse(BaseModel):
    """告警统计响应"""
    total_alerts: int
    active_alerts: int
    severity_distribution: Dict[str, int]
    total_rules: int
    enabled_rules: int
    is_running: bool
    email_enabled: bool


@router.get("/stats", response_model=AlertStatsResponse, summary="获取告警统计")
async def get_alert_stats(
    current_user: User = Depends(get_current_active_user)
):
    """获取告警系统统计信息"""
    stats = await alert_engine.get_alert_stats()
    return AlertStatsResponse(**stats)


@router.get("/rules", response_model=List[RuleResponse], summary="获取告警规则")
async def get_alert_rules(
    current_user: User = Depends(get_current_active_user)
):
    """获取所有告警规则"""
    rules = []
    
    for rule in alert_engine.rules.values():
        rules.append(RuleResponse(
            id=rule.id,
            name=rule.name,
            description=rule.description,
            enabled=rule.enabled,
            severity=rule.severity.value,
            metric_name=rule.metric_name,
            condition=rule.condition.value,
            threshold=rule.threshold,
            duration=rule.duration,
            cooldown_minutes=rule.cooldown_minutes,
            notify_email=rule.notify_email,
            notify_websocket=rule.notify_websocket,
            email_recipients=rule.email_recipients,
            created_at=rule.created_at.isoformat(),
            updated_at=rule.updated_at.isoformat(),
            last_triggered=rule.last_triggered.isoformat() if rule.last_triggered else None,
            trigger_count=rule.trigger_count
        ))
    
    return sorted(rules, key=lambda r: r.created_at, reverse=True)


@router.post("/rules", response_model=RuleResponse, summary="创建告警规则")
async def create_alert_rule(
    rule_request: RuleCreateRequest,
    current_user: User = Depends(get_current_active_user)
):
    """创建新的告警规则（需要管理员权限）"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin permission required")
    
    try:
        # 创建告警规则
        new_rule = AlertRule(
            name=rule_request.name,
            description=rule_request.description,
            metric_name=rule_request.metric_name,
            condition=rule_request.condition,
            threshold=rule_request.threshold,
            duration=rule_request.duration,
            severity=rule_request.severity,
            enabled=rule_request.enabled,
            notify_email=rule_request.notify_email,
            notify_websocket=rule_request.notify_websocket,
            email_recipients=rule_request.email_recipients,
            cooldown_minutes=rule_request.cooldown_minutes
        )
        
        success = await alert_engine.add_rule(new_rule)
        
        if not success:
            raise HTTPException(status_code=400, detail="Failed to create alert rule")
        
        logger.info(
            "Alert rule created",
            rule_id=new_rule.id,
            rule_name=rule_request.name,
            created_by=current_user.id
        )
        
        return RuleResponse(
            id=new_rule.id,
            name=new_rule.name,
            description=new_rule.description,
            enabled=new_rule.enabled,
            severity=new_rule.severity.value,
            metric_name=new_rule.metric_name,
            condition=new_rule.condition.value,
            threshold=new_rule.threshold,
            duration=new_rule.duration,
            cooldown_minutes=new_rule.cooldown_minutes,
            notify_email=new_rule.notify_email,
            notify_websocket=new_rule.notify_websocket,
            email_recipients=new_rule.email_recipients,
            created_at=new_rule.created_at.isoformat(),
            updated_at=new_rule.updated_at.isoformat(),
            last_triggered=None,
            trigger_count=0
        )
        
    except Exception as e:
        logger.error("Failed to create alert rule", error=str(e), user_id=current_user.id)
        raise HTTPException(status_code=500, detail="Internal server error")


@router.put("/rules/{rule_id}", response_model=RuleResponse, summary="更新告警规则")
async def update_alert_rule(
    rule_id: str,
    rule_request: RuleUpdateRequest,
    current_user: User = Depends(get_current_active_user)
):
    """更新告警规则（需要管理员权限）"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin permission required")
    
    if rule_id not in alert_engine.rules:
        raise HTTPException(status_code=404, detail="Alert rule not found")
    
    try:
        rule = alert_engine.rules[rule_id]
        
        # 更新规则属性
        if rule_request.name is not None:
            rule.name = rule_request.name
        if rule_request.description is not None:
            rule.description = rule_request.description
        if rule_request.metric_name is not None:
            rule.metric_name = rule_request.metric_name
        if rule_request.condition is not None:
            rule.condition = rule_request.condition
        if rule_request.threshold is not None:
            rule.threshold = rule_request.threshold
        if rule_request.duration is not None:
            rule.duration = rule_request.duration
        if rule_request.severity is not None:
            rule.severity = rule_request.severity
        if rule_request.enabled is not None:
            rule.enabled = rule_request.enabled
        if rule_request.notify_email is not None:
            rule.notify_email = rule_request.notify_email
        if rule_request.notify_websocket is not None:
            rule.notify_websocket = rule_request.notify_websocket
        if rule_request.email_recipients is not None:
            rule.email_recipients = rule_request.email_recipients
        if rule_request.cooldown_minutes is not None:
            rule.cooldown_minutes = rule_request.cooldown_minutes
        
        rule.updated_at = datetime.now()
        
        logger.info(
            "Alert rule updated",
            rule_id=rule_id,
            updated_by=current_user.id
        )
        
        return RuleResponse(
            id=rule.id,
            name=rule.name,
            description=rule.description,
            enabled=rule.enabled,
            severity=rule.severity.value,
            metric_name=rule.metric_name,
            condition=rule.condition.value,
            threshold=rule.threshold,
            duration=rule.duration,
            cooldown_minutes=rule.cooldown_minutes,
            notify_email=rule.notify_email,
            notify_websocket=rule.notify_websocket,
            email_recipients=rule.email_recipients,
            created_at=rule.created_at.isoformat(),
            updated_at=rule.updated_at.isoformat(),
            last_triggered=rule.last_triggered.isoformat() if rule.last_triggered else None,
            trigger_count=rule.trigger_count
        )
        
    except Exception as e:
        logger.error("Failed to update alert rule", rule_id=rule_id, error=str(e))
        raise HTTPException(status_code=500, detail="Internal server error")


@router.delete("/rules/{rule_id}", summary="删除告警规则")
async def delete_alert_rule(
    rule_id: str,
    current_user: User = Depends(get_current_active_user)
):
    """删除告警规则（需要管理员权限）"""
    if current_user.role != "admin":
        raise HTTPException(status_code=403, detail="Admin permission required")
    
    success = await alert_engine.remove_rule(rule_id)
    
    if not success:
        raise HTTPException(status_code=404, detail="Alert rule not found")
    
    logger.info("Alert rule deleted", rule_id=rule_id, deleted_by=current_user.id)
    
    return {
        "success": True,
        "message": "Alert rule deleted successfully"
    }


@router.get("/alerts", response_model=List[AlertResponse], summary="获取告警列表")
async def get_alerts(
    status: Optional[AlertStatus] = Query(None, description="告警状态筛选"),
    severity: Optional[AlertSeverity] = Query(None, description="严重级别筛选"),
    limit: int = Query(100, description="返回数量限制", ge=1, le=1000),
    current_user: User = Depends(get_current_active_user)
):
    """获取告警列表，支持状态和严重级别筛选"""
    alerts = await alert_engine.get_alerts(status, severity, limit)
    
    return [
        AlertResponse(
            id=alert.id,
            rule_id=alert.rule_id,
            rule_name=alert.rule_name,
            severity=alert.severity.value,
            status=alert.status.value,
            title=alert.title,
            message=alert.message,
            details=alert.details,
            device_id=alert.device_id,
            device_name=alert.device_name,
            device_ip=alert.device_ip,
            triggered_at=alert.triggered_at.isoformat(),
            acknowledged_at=alert.acknowledged_at.isoformat() if alert.acknowledged_at else None,
            resolved_at=alert.resolved_at.isoformat() if alert.resolved_at else None,
            acknowledged_by=alert.acknowledged_by,
            resolved_by=alert.resolved_by,
            notes=alert.notes
        )
        for alert in alerts
    ]


@router.post("/alerts/{alert_id}/acknowledge", summary="确认告警")
async def acknowledge_alert(
    alert_id: str,
    action_request: AlertActionRequest,
    current_user: User = Depends(get_current_active_user)
):
    """确认告警"""
    success = await alert_engine.acknowledge_alert(
        alert_id, 
        current_user.id,
        action_request.notes
    )
    
    if not success:
        raise HTTPException(status_code=404, detail="Alert not found")
    
    logger.info("Alert acknowledged", alert_id=alert_id, user_id=current_user.id)
    
    return {
        "success": True,
        "message": "Alert acknowledged successfully"
    }


@router.post("/alerts/{alert_id}/resolve", summary="解决告警")
async def resolve_alert(
    alert_id: str,
    action_request: AlertActionRequest,
    current_user: User = Depends(get_current_active_user)
):
    """解决告警"""
    success = await alert_engine.resolve_alert(
        alert_id,
        current_user.id,
        action_request.notes
    )
    
    if not success:
        raise HTTPException(status_code=404, detail="Alert not found")
    
    logger.info("Alert resolved", alert_id=alert_id, user_id=current_user.id)
    
    return {
        "success": True,
        "message": "Alert resolved successfully"
    }


@router.get("/metric-types", summary="获取支持的指标类型")
async def get_metric_types(
    current_user: User = Depends(get_current_active_user)
):
    """获取所有支持的监控指标类型"""
    metric_types = [
        {
            "name": "device_status",
            "display_name": "设备状态",
            "description": "设备在线/离线状态",
            "unit": "状态码",
            "suggested_conditions": ["eq", "ne"],
            "suggested_thresholds": [0, 1]
        },
        {
            "name": "cpu_usage",
            "display_name": "CPU使用率",
            "description": "设备CPU使用百分比",
            "unit": "%",
            "suggested_conditions": ["gt", "lt"],
            "suggested_thresholds": [80, 90, 95]
        },
        {
            "name": "memory_usage",
            "display_name": "内存使用率",
            "description": "设备内存使用百分比",
            "unit": "%",
            "suggested_conditions": ["gt", "lt"],
            "suggested_thresholds": [80, 90, 95]
        },
        {
            "name": "disk_usage",
            "display_name": "磁盘使用率",
            "description": "设备磁盘使用百分比",
            "unit": "%",
            "suggested_conditions": ["gt", "lt"],
            "suggested_thresholds": [80, 90, 95]
        },
        {
            "name": "response_time",
            "display_name": "响应时间",
            "description": "设备网络响应时间",
            "unit": "ms",
            "suggested_conditions": ["gt", "lt"],
            "suggested_thresholds": [100, 500, 1000]
        },
        {
            "name": "network_in",
            "display_name": "网络入口流量",
            "description": "设备网络入口流量",
            "unit": "bytes/s",
            "suggested_conditions": ["gt", "lt"],
            "suggested_thresholds": [1000000, 10000000, 100000000]
        },
        {
            "name": "network_out",
            "display_name": "网络出口流量",
            "description": "设备网络出口流量",
            "unit": "bytes/s",
            "suggested_conditions": ["gt", "lt"],
            "suggested_thresholds": [1000000, 10000000, 100000000]
        }
    ]
    
    return metric_types


@router.get("/condition-types", summary="获取条件类型")
async def get_condition_types(
    current_user: User = Depends(get_current_active_user)
):
    """获取所有支持的条件类型"""
    condition_types = [
        {
            "value": "gt",
            "display_name": "大于",
            "description": "当指标值大于阈值时触发",
            "operator": ">"
        },
        {
            "value": "lt",
            "display_name": "小于",
            "description": "当指标值小于阈值时触发",
            "operator": "<"
        },
        {
            "value": "eq",
            "display_name": "等于",
            "description": "当指标值等于阈值时触发",
            "operator": "=="
        },
        {
            "value": "ne",
            "display_name": "不等于",
            "description": "当指标值不等于阈值时触发",
            "operator": "!="
        },
        {
            "value": "contains",
            "display_name": "包含",
            "description": "当指标值包含阈值内容时触发",
            "operator": "contains"
        },
        {
            "value": "not_contains",
            "display_name": "不包含",
            "description": "当指标值不包含阈值内容时触发",
            "operator": "not contains"
        }
    ]
    
    return condition_types


@router.get("/severity-levels", summary="获取严重级别")
async def get_severity_levels(
    current_user: User = Depends(get_current_active_user)
):
    """获取所有严重级别"""
    severity_levels = [
        {
            "value": "info",
            "display_name": "信息",
            "description": "一般性信息提醒",
            "color": "#17a2b8",
            "priority": 1
        },
        {
            "value": "warning",
            "display_name": "警告",
            "description": "需要关注的问题",
            "color": "#ffc107",
            "priority": 2
        },
        {
            "value": "critical",
            "display_name": "严重",
            "description": "影响业务的严重问题",
            "color": "#dc3545",
            "priority": 3
        },
        {
            "value": "emergency",
            "display_name": "紧急",
            "description": "需要立即处理的紧急问题",
            "color": "#6f42c1",
            "priority": 4
        }
    ]
    
    return severity_levels