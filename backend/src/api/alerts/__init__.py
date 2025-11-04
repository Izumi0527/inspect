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

class BulkActionRequest(BaseModel):
    action: str  # acknowledge, resolve, assign, delete, comment
    alert_ids: List[int]
    assignee: Optional[str] = None
    comment: Optional[str] = None
    params: Optional[dict] = None

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
    alert_rules_dict = await alert_service.get_alert_rules()
    rules = list(alert_rules_dict.values())

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
    alert_rules_dict = await alert_service.get_alert_rules()
    for existing_rule in alert_rules_dict.values():
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

    # 使用Repository创建规则（自动生成ID）
    new_rule = await alert_service.repository.create_rule(
        rule.dict(),
        created_by=current_user["id"]
    )

    logger.info("Alert rule created",
                rule_id=new_rule["id"],
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
    rule = await alert_service.repository.get_rule_by_id(rule_id)
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
    rule = await alert_service.repository.get_rule_by_id(rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="告警规则不存在")

    # 检查名称冲突
    if rule_update.name:
        alert_rules_dict = await alert_service.get_alert_rules()
        for rid, existing_rule in alert_rules_dict.items():
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

    # 使用Repository更新规则
    update_data = rule_update.dict(exclude_unset=True)
    updated_rule = await alert_service.repository.update_rule(rule_id, update_data)

    logger.info("Alert rule updated",
                rule_id=rule_id,
                fields=list(update_data.keys()),
                updated_by=current_user["id"])

    return AlertRule(**updated_rule)

@router.delete("/rules/{rule_id}", summary="删除告警规则")
async def delete_alert_rule(
    rule_id: int,
    current_user: dict = Depends(require_permission("alerts:delete"))
):
    """
    删除告警规则
    """
    rule = await alert_service.repository.get_rule_by_id(rule_id)
    if not rule:
        raise HTTPException(status_code=404, detail="告警规则不存在")

    await alert_service.repository.delete_rule(rule_id)

    logger.info("Alert rule deleted",
                rule_id=rule_id,
                deleted_by=current_user["id"])

    return {"message": "告警规则删除成功"}

@router.get("/", summary="获取告警列表")
async def get_alerts(
    # 支持新的分页参数（优先）
    page: Optional[int] = Query(None, ge=1, description="页码（从1开始）"),
    page_size: Optional[int] = Query(None, ge=1, le=100, description="每页记录数"),
    # 支持旧的分页参数（向后兼容）
    skip: Optional[int] = Query(None, ge=0, description="跳过的记录数"),
    limit: Optional[int] = Query(None, ge=1, le=100, description="返回的记录数"),
    device_id: Optional[int] = Query(None, description="设备ID过滤"),
    severity: Optional[AlertSeverity] = Query(None, description="严重级别过滤"),
    status: Optional[AlertStatus] = Query(None, description="状态过滤"),
    category: Optional[AlertCategory] = Query(None, description="类别过滤"),
    current_user: dict = Depends(require_permission("alerts:read"))
):
    """
    获取告警列表（带分页信息）
    支持两种分页方式：
    1. page + page_size（前端使用）
    2. skip + limit（向后兼容）
    """
    from src.api.devices.bulk_operations import TEMP_DEVICES

    # 处理分页参数：优先使用 page/page_size，否则使用 skip/limit
    if page is not None and page_size is not None:
        # 使用新的分页参数
        actual_skip = (page - 1) * page_size
        actual_limit = page_size
        actual_page = page
    else:
        # 使用旧的分页参数（或默认值）
        actual_skip = skip if skip is not None else 0
        actual_limit = limit if limit is not None else 20  # 默认改为20以匹配前端
        actual_page = (actual_skip // actual_limit) + 1 if actual_limit > 0 else 1

    # 获取活跃告警
    active_alerts = await alert_service.repository.get_active_alerts(device_id=device_id, severity=severity)

    # 获取历史告警（最近的）
    historical_alerts, _ = await alert_service.repository.get_alert_history(skip=0, limit=100)
    # 不需要再排序，repository返回的数据已按时间倒序

    # 合并告警列表
    all_alerts = active_alerts + historical_alerts

    # 应用其他过滤器
    if status:
        # 转换前端的 'active' 为后端的 'open'
        backend_status = AlertStatus.OPEN if status == "active" else status
        all_alerts = [a for a in all_alerts if a.get("status") == backend_status]
    if category:
        all_alerts = [a for a in all_alerts if a.get("category") == category]

    # 转换数据格式：添加设备名称和timestamp，并统一状态值
    transformed_alerts = []
    for alert in all_alerts:
        alert_device_id = alert.get("device_id")
        device_info = TEMP_DEVICES.get(alert_device_id, {})

        # 转换状态：将后端的 'open' 转为前端的 'active'
        alert_status = alert.get("status")
        if alert_status == AlertStatus.OPEN or alert_status == "open":
            frontend_status = "active"
        else:
            frontend_status = alert_status

        # 获取时间戳
        timestamp = alert.get("first_occurred") or alert.get("created_at") or datetime.now()
        if isinstance(timestamp, datetime):
            timestamp_str = timestamp.isoformat()
        else:
            timestamp_str = str(timestamp)

        transformed_alert = {
            **alert,
            "device": device_info.get("name", f"设备{alert_device_id}"),  # 添加设备名称字符串
            "timestamp": timestamp_str,  # 添加timestamp字段
            "status": frontend_status  # 转换状态为前端格式
        }
        transformed_alerts.append(transformed_alert)

    # 应用分页
    total = len(transformed_alerts)
    paged_alerts = transformed_alerts[actual_skip:actual_skip + actual_limit]

    logger.info("Retrieved alerts",
                count=len(paged_alerts),
                total=total,
                page=actual_page,
                page_size=actual_limit,
                user_id=current_user["id"])

    # 返回包含分页信息的对象（而非直接返回数组）
    return {
        "alerts": paged_alerts,
        "total": total,
        "page": actual_page,
        "page_size": actual_limit,
        "current_page": actual_page,
        "has_next": actual_skip + actual_limit < total,
        "has_prev": actual_skip > 0
    }

@router.get("/recent", summary="获取最新告警")
async def get_recent_alerts(
    limit: int = Query(5, ge=1, le=20, description="返回数量限制"),
    current_user: dict = Depends(require_permission("alerts:read"))
):
    """
    获取最新告警列表
    这是一个便捷端点，等同于调用 GET /alerts?page=1&page_size={limit}&sort=timestamp_desc
    """
    from src.api.devices.bulk_operations import TEMP_DEVICES

    # 获取活跃告警
    active_alerts = await alert_service.repository.get_active_alerts()

    # 获取历史告警（最近的）
    historical_alerts, _ = await alert_service.repository.get_alert_history(skip=0, limit=50)
    # 不需要再排序，repository返回的数据已按时间倒序

    # 合并并按时间排序
    all_alerts = active_alerts + historical_alerts
    all_alerts.sort(key=lambda x: x.get("first_occurred") or x.get("created_at") or datetime.min, reverse=True)

    # 转换数据格式
    transformed_alerts = []
    for alert in all_alerts[:limit]:
        alert_device_id = alert.get("device_id")
        device_info = TEMP_DEVICES.get(alert_device_id, {})

        # 转换状态
        alert_status = alert.get("status")
        if alert_status == AlertStatus.OPEN or alert_status == "open":
            frontend_status = "active"
        else:
            frontend_status = alert_status

        # 获取时间戳
        timestamp = alert.get("first_occurred") or alert.get("created_at") or datetime.now()
        if isinstance(timestamp, datetime):
            timestamp_str = timestamp.isoformat()
        else:
            timestamp_str = str(timestamp)

        transformed_alert = {
            **alert,
            "device": device_info.get("name", f"设备{alert_device_id}"),
            "timestamp": timestamp_str,
            "status": frontend_status
        }
        transformed_alerts.append(transformed_alert)

    logger.info("Retrieved recent alerts",
                count=len(transformed_alerts),
                user_id=current_user["id"])

    return transformed_alerts

@router.get("/stats", summary="获取告警统计")
async def get_alert_stats(
    current_user: dict = Depends(require_permission("alerts:read"))
):
    """
    获取告警统计信息（简化端点）
    这是 /statistics/summary 的别名，提供更简洁的URL
    """
    return await get_alert_statistics(current_user=current_user)

@router.get("/statistics/summary", summary="获取告警统计（完整端点）")
async def get_alert_statistics(
    current_user: dict = Depends(require_permission("alerts:read"))
):
    """
    获取告警统计信息
    返回格式已统一为前端期望的字段名
    """
    stats = await alert_service.get_alert_statistics()

    # 转换为前端期望的格式
    # 从后端格式映射到前端格式
    by_severity = stats.get("by_severity", {})
    by_status = stats.get("by_status", {})

    # 构建符合前端期望的响应
    response = {
        # 总数统计
        "total": stats.get("total_active", 0) + stats.get("total_resolved", 0),

        # 按严重级别统计
        "critical": by_severity.get("critical", 0),
        "warning": by_severity.get("warning", 0),
        "info": by_severity.get("info", 0),

        # 按状态统计
        "active": by_status.get("open", 0),  # 后端的open对应前端的active
        "acknowledged": by_status.get("acknowledged", 0),
        "resolved": by_status.get("resolved", 0),

        # 按分类统计（转换为驼峰命名）
        "byCategory": stats.get("by_category", {}),

        # 按设备统计（转换设备ID为设备名称）
        "byDevice": {},

        # 趋势数据（可选）
        "trends": stats.get("trends", {})
    }

    # 转换设备统计：将设备ID映射为设备名称
    from src.api.devices.bulk_operations import TEMP_DEVICES
    by_device_dict = {}
    for device_id, count in stats.get("by_device", {}).items():
        device_info = TEMP_DEVICES.get(device_id, {})
        device_name = device_info.get("name", f"设备{device_id}")
        by_device_dict[device_name] = count

    response["byDevice"] = by_device_dict

    logger.info("Alert statistics retrieved",
                total=response["total"],
                active=response["active"],
                user_id=current_user["id"])

    return response

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

@router.get("/metric-types", summary="获取支持的指标类型")
async def get_metric_types(
    current_user: dict = Depends(require_permission("alerts:read"))
):
    """
    获取所有支持的监控指标类型
    包含指标名称、单位、建议的条件和阈值等信息
    """
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
    current_user: dict = Depends(require_permission("alerts:read"))
):
    """
    获取所有支持的条件类型
    包含条件值、显示名称、操作符等信息
    """
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
            "value": "gte",
            "display_name": "大于等于",
            "description": "当指标值大于等于阈值时触发",
            "operator": ">="
        },
        {
            "value": "lte",
            "display_name": "小于等于",
            "description": "当指标值小于等于阈值时触发",
            "operator": "<="
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

# ==================== 动态路由（必须放在最后） ====================

@router.get("/{alert_id}", response_model=Alert, summary="获取告警详情")
async def get_alert(
    alert_id: int,
    current_user: dict = Depends(require_permission("alerts:read"))
):
    """
    获取指定告警的详细信息
    """
    # 使用Repository查询告警（自动在活跃和历史中查找）
    alert = await alert_service.repository.get_alert_by_id(alert_id)

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

@router.post("/{alert_id}/reactivate", summary="重新激活告警")
async def reactivate_alert(
    alert_id: int,
    request: AlertResolveRequest,  # 复用请求模型，接受reason字段
    current_user: dict = Depends(require_permission("alerts:update"))
):
    """
    重新激活已解决的告警
    用于问题重新出现或误操作解决的情况
    """
    # 使用 Repository 查找告警（自动在活跃和历史中查找）
    alert = await alert_service.repository.get_alert_by_id(alert_id)

    if not alert:
        raise HTTPException(status_code=404, detail="告警不存在")

    # 如果告警已经是活跃状态，直接返回
    if alert.get("status") == AlertStatus.OPEN:
        return {"message": "告警已处于活跃状态"}

    # 检查是否可以重新激活（只有已解决的告警可以重新激活）
    if alert.get("status") != AlertStatus.RESOLVED:
        raise HTTPException(
            status_code=400,
            detail=f"告警状态为{alert.get('status')}，无法重新激活（只有已解决的告警可以重新激活）"
        )

    # 准备重新激活数据
    reactivation_reason = request.note or "问题重现，重新激活告警"
    update_data = {
        "status": AlertStatus.OPEN,
        "reactivated_at": datetime.now(),
        "reactivated_by": current_user["id"],
        "reactivation_reason": reactivation_reason,
        # 清除解决相关字段
        "resolved_at": None,
        "resolved_by": None,
        "resolution_note": None
    }

    # 使用 Repository 更新告警
    updated_alert = await alert_service.repository.update_alert(alert_id, update_data)

    logger.info("Alert reactivated",
                alert_id=alert_id,
                reason=reactivation_reason,
                user_id=current_user["id"])

    return {"message": "告警已重新激活", "status": "active"}

@router.delete("/{alert_id}", summary="删除/归档告警")
async def delete_alert(
    alert_id: int,
    current_user: dict = Depends(require_permission("alerts:delete"))
):
    """
    删除/归档告警（软删除）
    将告警状态设为closed并移至历史记录，不做物理删除以保留审计记录
    """
    # 使用 Repository 查找告警
    alert = await alert_service.repository.get_alert_by_id(alert_id)

    if not alert:
        raise HTTPException(status_code=404, detail="告警不存在")

    # 如果已经是 CLOSED 状态，直接返回
    if alert.get("status") == AlertStatus.CLOSED:
        return {"message": "告警已归档"}

    # 软删除：设置状态为 CLOSED
    update_data = {
        "status": AlertStatus.CLOSED,
        "closed_at": datetime.now(),
        "closed_by": current_user["id"]
    }

    # 使用 Repository 更新告警
    await alert_service.repository.update_alert(alert_id, update_data)

    logger.info("Alert deleted (soft delete)",
                alert_id=alert_id,
                user_id=current_user["id"])

    return {"message": "告警已归档"}

@router.post("/bulk", summary="批量操作告警")
async def bulk_alert_action(
    request: BulkActionRequest,
    current_user: dict = Depends(require_permission("alerts:update"))
):
    """
    批量操作告警
    支持的操作：acknowledge（确认）、resolve（解决）、assign（分配）、delete（删除）、comment（评论）
    """
    action = request.action
    alert_ids = request.alert_ids

    if not alert_ids:
        raise HTTPException(status_code=400, detail="告警ID列表不能为空")

    success_count = 0
    failed_ids = []

    # 根据操作类型执行批量操作
    if action == "acknowledge":
        for alert_id in alert_ids:
            try:
                success = await alert_service.acknowledge_alert(
                    alert_id=alert_id,
                    user_id=current_user["id"],
                    note=request.comment or "批量确认"
                )
                if success:
                    success_count += 1
                else:
                    failed_ids.append(alert_id)
            except Exception as e:
                logger.error(f"Failed to acknowledge alert {alert_id}", error=str(e))
                failed_ids.append(alert_id)

    elif action == "resolve":
        for alert_id in alert_ids:
            try:
                success = await alert_service.resolve_alert(
                    alert_id=alert_id,
                    user_id=current_user["id"],
                    note=request.comment or "批量解决"
                )
                if success:
                    success_count += 1
                else:
                    failed_ids.append(alert_id)
            except Exception as e:
                logger.error(f"Failed to resolve alert {alert_id}", error=str(e))
                failed_ids.append(alert_id)

    elif action == "delete":
        # 软删除：将告警状态设为 CLOSED
        for alert_id in alert_ids:
            try:
                # 使用 Repository 查找告警
                alert = await alert_service.repository.get_alert_by_id(alert_id)

                if not alert:
                    failed_ids.append(alert_id)
                    continue

                # 如果已经是 CLOSED 状态，跳过
                if alert.get("status") == AlertStatus.CLOSED:
                    success_count += 1
                    continue

                # 软删除：更新状态为 CLOSED
                update_data = {
                    "status": AlertStatus.CLOSED,
                    "closed_at": datetime.now(),
                    "closed_by": current_user["id"]
                }

                await alert_service.repository.update_alert(alert_id, update_data)
                success_count += 1

            except Exception as e:
                logger.error(f"Failed to delete alert {alert_id}", error=str(e))
                failed_ids.append(alert_id)

    elif action == "assign":
        # 分配操作（暂时不实现，返回成功）
        logger.warning(f"Bulk assign action not yet implemented for alerts {alert_ids}")
        success_count = len(alert_ids)

    elif action == "comment":
        # 评论操作（暂时不实现，返回成功）
        logger.warning(f"Bulk comment action not yet implemented for alerts {alert_ids}")
        success_count = len(alert_ids)

    else:
        raise HTTPException(status_code=400, detail=f"不支持的操作类型: {action}")

    logger.info(
        "Bulk alert action completed",
        action=action,
        total=len(alert_ids),
        success=success_count,
        failed=len(failed_ids),
        user_id=current_user["id"]
    )

    response = {
        "success": True,
        "message": f"批量{action}操作完成",
        "total": len(alert_ids),
        "success_count": success_count,
        "failed_count": len(failed_ids)
    }

    if failed_ids:
        response["failed_ids"] = failed_ids

    return response