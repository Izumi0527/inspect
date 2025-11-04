from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
import structlog

from src.core.permissions import require_permission
from src.services.alert import alert_service
from src.models.alert import AlertSeverity, AlertStatus, AlertCategory

logger = structlog.get_logger()
router = APIRouter()

# 告警相关数据模型
class AlertRuleCreate(BaseModel):
    name: str
    category: AlertCategory
    metric_name: str
    operator: str  # >, <, >=, <=, ==, !=
    threshold_value: float
    duration: int = 300  # 持续时间（秒）
    severity: AlertSeverity = AlertSeverity.WARNING
    device_types: List[str] = []
    device_groups: List[int] = []
    specific_devices: List[int] = []
    auto_resolve: bool = True
    notification_enabled: bool = True
    email_enabled: bool = True
    webhook_enabled: bool = False
    webhook_url: Optional[str] = None

class AlertRuleUpdate(BaseModel):
    name: Optional[str] = None
    category: Optional[AlertCategory] = None
    metric_name: Optional[str] = None
    operator: Optional[str] = None
    threshold_value: Optional[float] = None
    duration: Optional[int] = None
    severity: Optional[AlertSeverity] = None
    device_types: Optional[List[str]] = None
    device_groups: Optional[List[int]] = None
    specific_devices: Optional[List[int]] = None
    auto_resolve: Optional[bool] = None
    notification_enabled: Optional[bool] = None
    email_enabled: Optional[bool] = None
    webhook_enabled: Optional[bool] = None
    webhook_url: Optional[str] = None
    is_active: Optional[bool] = None

class AlertRule(BaseModel):
    id: int
    name: str
    category: AlertCategory
    metric_name: str
    operator: str
    threshold_value: float
    duration: int
    severity: AlertSeverity
    device_types: List[str] = []
    auto_resolve: bool = True
    notification_enabled: bool = True
    is_active: bool = True

class Alert(BaseModel):
    id: int
    device_id: int
    rule_id: Optional[int] = None
    title: str
    message: str
    category: AlertCategory
    severity: AlertSeverity
    status: AlertStatus
    metric_name: Optional[str] = None
    current_value: Optional[float] = None
    threshold_value: Optional[float] = None
    first_occurred: datetime
    last_occurred: datetime
    occurrence_count: int = 1
    notification_count: int = 0
    escalation_level: int = 0
    acknowledged_at: Optional[datetime] = None
    acknowledged_by: Optional[int] = None
    resolved_at: Optional[datetime] = None
    resolved_by: Optional[int] = None
    resolution_note: Optional[str] = None

class AlertAcknowledgeRequest(BaseModel):
    note: Optional[str] = None

class AlertResolveRequest(BaseModel):
    note: Optional[str] = None

@router.get("/rules", response_model=List[AlertRule], summary="获取告警规则列表")
async def get_alert_rules(
    skip: int = Query(0, ge=0, description="跳过的记录数"),
    limit: int = Query(10, ge=1, le=100, description="返回的记录数"),
    category: Optional[AlertCategory] = Query(None, description="告警类别过滤"),
    severity: Optional[AlertSeverity] = Query(None, description="严重级别过滤"),
    is_active: Optional[bool] = Query(None, description="是否启用过滤"),
    current_user: dict = Depends(require_permission("alerts:read"))
):
    """
    获取告警规则列表
    """
    rules = list(alert_service.alert_rules.values())
    
    # 应用过滤器
    if category:
        rules = [r for r in rules if r.get("category") == category]
    if severity:
        rules = [r for r in rules if r.get("severity") == severity]
    if is_active is not None:
        rules = [r for r in rules if r.get("is_active") == is_active]
    
    # 应用分页
    total = len(rules)
    rules = rules[skip:skip + limit]
    
    logger.info("Retrieved alert rules", 
                count=len(rules), 
                total=total,
                user_id=current_user["id"])
    
    return [AlertRule(**rule) for rule in rules]

@router.post("/rules", response_model=AlertRule, summary="创建告警规则")
async def create_alert_rule(
    rule: AlertRuleCreate,
    current_user: dict = Depends(require_permission("alerts:create"))
):
    """
    创建新的告警规则
    """
    # 检查规则名称是否已存在
    for existing_rule in alert_service.alert_rules.values():
        if existing_rule["name"] == rule.name:
            raise HTTPException(
                status_code=400,
                detail=f"告警规则名称 {rule.name} 已存在"
            )
    
    # 验证操作符
    valid_operators = [">", "<", ">=", "<=", "==", "!="]
    if rule.operator not in valid_operators:
        raise HTTPException(
            status_code=400,
            detail=f"无效的操作符 {rule.operator}，支持的操作符: {', '.join(valid_operators)}"
        )
    
    # 生成新ID
    new_id = max(alert_service.alert_rules.keys()) + 1 if alert_service.alert_rules else 1
    
    # 创建规则记录
    new_rule = {
        "id": new_id,
        **rule.dict(),
        "is_active": True,
        "created_at": datetime.now(),
        "updated_at": datetime.now()
    }
    
    alert_service.alert_rules[new_id] = new_rule
    
    logger.info("Alert rule created", 
                rule_id=new_id, 
                name=rule.name,
                created_by=current_user["id"])
    
    return AlertRule(**new_rule)

@router.get("/rules/{rule_id}", response_model=AlertRule, summary="获取告警规则详情")
async def get_alert_rule(
    rule_id: int,
    current_user: dict = Depends(require_permission("alerts:read"))
):
    """
    获取指定告警规则的详细信息
    """
    rule = alert_service.alert_rules.get(rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="告警规则不存在")
    
    return AlertRule(**rule)

@router.put("/rules/{rule_id}", response_model=AlertRule, summary="更新告警规则")
async def update_alert_rule(
    rule_id: int,
    rule_update: AlertRuleUpdate,
    current_user: dict = Depends(require_permission("alerts:update"))
):
    """
    更新告警规则
    """
    rule = alert_service.alert_rules.get(rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="告警规则不存在")
    
    # 检查名称冲突
    if rule_update.name:
        for rid, existing_rule in alert_service.alert_rules.items():
            if rid != rule_id and existing_rule["name"] == rule_update.name:
                raise HTTPException(
                    status_code=400,
                    detail=f"告警规则名称 {rule_update.name} 已存在"
                )
    
    # 验证操作符
    if rule_update.operator:
        valid_operators = [">", "<", ">=", "<=", "==", "!="]
        if rule_update.operator not in valid_operators:
            raise HTTPException(
                status_code=400,
                detail=f"无效的操作符 {rule_update.operator}，支持的操作符: {', '.join(valid_operators)}"
            )
    
    # 更新规则信息
    update_data = rule_update.dict(exclude_unset=True)
    rule.update(update_data)
    rule["updated_at"] = datetime.now()
    
    logger.info("Alert rule updated", 
                rule_id=rule_id,
                fields=list(update_data.keys()),
                updated_by=current_user["id"])
    
    return AlertRule(**rule)

@router.delete("/rules/{rule_id}", summary="删除告警规则")
async def delete_alert_rule(
    rule_id: int,
    current_user: dict = Depends(require_permission("alerts:delete"))
):
    """
    删除告警规则
    """
    rule = alert_service.alert_rules.get(rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="告警规则不存在")
    
    del alert_service.alert_rules[rule_id]
    
    logger.info("Alert rule deleted", 
                rule_id=rule_id,
                deleted_by=current_user["id"])
    
    return {"message": "告警规则删除成功"}

@router.get("/", response_model=List[Alert], summary="获取告警列表")
async def get_alerts(
    skip: int = Query(0, ge=0, description="跳过的记录数"),
    limit: int = Query(10, ge=1, le=100, description="返回的记录数"),
    device_id: Optional[int] = Query(None, description="设备ID过滤"),
    severity: Optional[AlertSeverity] = Query(None, description="严重级别过滤"),
    status: Optional[AlertStatus] = Query(None, description="状态过滤"),
    category: Optional[AlertCategory] = Query(None, description="类别过滤"),
    current_user: dict = Depends(require_permission("alerts:read"))
):
    """
    获取告警列表
    """
    # 获取活跃告警
    active_alerts = alert_service.get_active_alerts(device_id=device_id, severity=severity)
    
    # 获取历史告警（最近的）
    historical_alerts = alert_service.alert_history[-100:]  # 最近100条
    historical_alerts.sort(key=lambda x: x.get("created_at", datetime.min), reverse=True)
    
    # 合并告警列表
    all_alerts = active_alerts + historical_alerts
    
    # 应用其他过滤器
    if status:
        all_alerts = [a for a in all_alerts if a.get("status") == status]
    if category:
        all_alerts = [a for a in all_alerts if a.get("category") == category]
    
    # 应用分页
    total = len(all_alerts)
    alerts = all_alerts[skip:skip + limit]
    
    logger.info("Retrieved alerts", 
                count=len(alerts), 
                total=total,
                user_id=current_user["id"])
    
    return [Alert(**alert) for alert in alerts]

@router.get("/{alert_id}", response_model=Alert, summary="获取告警详情")
async def get_alert(
    alert_id: int,
    current_user: dict = Depends(require_permission("alerts:read"))
):
    """
    获取指定告警的详细信息
    """
    # 在活跃告警中查找
    alert = alert_service.active_alerts.get(alert_id)
    
    # 如果不在活跃告警中，在历史记录中查找
    if not alert:
        for historical_alert in alert_service.alert_history:
            if historical_alert.get("id") == alert_id:
                alert = historical_alert
                break
    
    if not alert:
        raise HTTPException(status_code=404, detail="告警不存在")
    
    return Alert(**alert)

@router.post("/{alert_id}/acknowledge", summary="确认告警")
async def acknowledge_alert(
    alert_id: int,
    request: AlertAcknowledgeRequest,
    current_user: dict = Depends(require_permission("alerts:acknowledge"))
):
    """
    确认告警
    """
    success = await alert_service.acknowledge_alert(
        alert_id=alert_id,
        user_id=current_user["id"],
        note=request.note
    )
    
    if not success:
        raise HTTPException(status_code=404, detail="告警不存在或状态不允许确认")
    
    logger.info("Alert acknowledged", 
                alert_id=alert_id,
                user_id=current_user["id"])
    
    return {"message": "告警确认成功"}

@router.post("/{alert_id}/resolve", summary="解决告警")
async def resolve_alert(
    alert_id: int,
    request: AlertResolveRequest,
    current_user: dict = Depends(require_permission("alerts:resolve"))
):
    """
    手动解决告警
    """
    success = await alert_service.resolve_alert(
        alert_id=alert_id,
        user_id=current_user["id"],
        note=request.note
    )
    
    if not success:
        raise HTTPException(status_code=404, detail="告警不存在")
    
    logger.info("Alert resolved", 
                alert_id=alert_id,
                user_id=current_user["id"])
    
    return {"message": "告警解决成功"}

@router.get("/statistics/summary", summary="获取告警统计")
async def get_alert_statistics(
    current_user: dict = Depends(require_permission("alerts:read"))
):
    """
    获取告警统计信息
    """
    stats = alert_service.get_alert_statistics()
    
    # 添加设备名称信息
    from src.api.devices import TEMP_DEVICES
    device_stats = []
    for device_id, count in stats["by_device"].items():
        device_info = TEMP_DEVICES.get(device_id, {})
        device_stats.append({
            "device_id": device_id,
            "device_name": device_info.get("name", f"设备{device_id}"),
            "device_type": device_info.get("device_type", "unknown"),
            "alert_count": count
        })
    
    # 按告警数量排序
    device_stats.sort(key=lambda x: x["alert_count"], reverse=True)
    
    logger.info("Alert statistics retrieved", 
                total_active=stats["total_active"],
                user_id=current_user["id"])
    
    return {
        **stats,
        "device_details": device_stats[:10]  # 返回前10个设备
    }

@router.post("/engine/start", summary="启动告警引擎")
async def start_alert_engine(
    current_user: dict = Depends(require_permission("alerts:update"))
):
    """
    启动告警引擎
    """
    await alert_service.start_alert_engine()
    
    logger.info("Alert engine started", 
                user_id=current_user["id"])
    
    return {"message": "告警引擎启动成功"}

@router.post("/engine/stop", summary="停止告警引擎")
async def stop_alert_engine(
    current_user: dict = Depends(require_permission("alerts:update"))
):
    """
    停止告警引擎
    """
    await alert_service.stop_alert_engine()
    
    logger.info("Alert engine stopped", 
                user_id=current_user["id"])
    
    return {"message": "告警引擎停止成功"}

@router.get("/engine/status", summary="获取告警引擎状态")
async def get_alert_engine_status(
    current_user: dict = Depends(require_permission("alerts:read"))
):
    """
    获取告警引擎状态
    """
    status = {
        "running": alert_service.rule_engine_running,
        "total_rules": len(alert_service.alert_rules),
        "active_rules": len([r for r in alert_service.alert_rules.values() if r.get("is_active", True)]),
        "active_alerts": len(alert_service.active_alerts),
        "notification_queue_size": len([n for n in alert_service.notification_queue if n.get("status") == "pending"])
    }
    
    return status

@router.get("/categories", summary="获取告警类别列表")
async def get_alert_categories(
    current_user: dict = Depends(require_permission("alerts:read"))
):
    """
    获取告警类别列表
    """
    categories = [
        {
            "value": AlertCategory.CONNECTIVITY,
            "label": "连通性",
            "description": "设备连通性相关告警"
        },
        {
            "value": AlertCategory.PERFORMANCE,
            "label": "性能",
            "description": "设备性能指标相关告警"
        },
        {
            "value": AlertCategory.SECURITY,
            "label": "安全",
            "description": "安全相关告警"
        },
        {
            "value": AlertCategory.CONFIGURATION,
            "label": "配置",
            "description": "配置变更相关告警"
        },
        {
            "value": AlertCategory.HARDWARE,
            "label": "硬件",
            "description": "硬件故障相关告警"
        },
        {
            "value": AlertCategory.OTHER,
            "label": "其他",
            "description": "其他类型告警"
        }
    ]
    
    return categories

@router.get("/severities", summary="获取告警严重级别列表")
async def get_alert_severities(
    current_user: dict = Depends(require_permission("alerts:read"))
):
    """
    获取告警严重级别列表
    """
    severities = [
        {
            "value": AlertSeverity.INFO,
            "label": "信息",
            "color": "blue",
            "description": "信息性告警"
        },
        {
            "value": AlertSeverity.WARNING,
            "label": "警告",
            "color": "yellow",
            "description": "警告级别告警"
        },
        {
            "value": AlertSeverity.CRITICAL,
            "label": "严重",
            "color": "red",
            "description": "严重级别告警"
        },
        {
            "value": AlertSeverity.FATAL,
            "label": "致命",
            "color": "red",
            "description": "致命级别告警"
        }
    ]
    
    return severities