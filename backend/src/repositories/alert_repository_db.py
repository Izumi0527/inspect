"""
数据库告警仓储实现

使用SQLAlchemy和PostgreSQL实现AlertRepository接口，提供持久化数据存储
"""
from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, timedelta
from sqlalchemy import select, update, delete, func, and_, or_, desc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
import structlog

from ..models.alert import (
    AlertRule,
    Alert,
    AlertOperationHistory,
    AlertSeverity,
    AlertStatus,
    AlertCategory
)
from .alert_repository import (
    AlertRuleRepositoryInterface,
    AlertRepositoryInterface
)

logger = structlog.get_logger()


class DatabaseAlertRepository(AlertRuleRepositoryInterface, AlertRepositoryInterface):
    """基于PostgreSQL数据库的告警仓储实现

    职责：
    - 实现Repository接口的所有方法
    - 使用SQLAlchemy ORM进行数据库操作
    - 管理事务和会话生命周期
    - 提供查询优化和索引利用
    """

    def __init__(self, db_session: AsyncSession):
        """初始化数据库仓储

        Args:
            db_session: SQLAlchemy异步会话
        """
        self.db = db_session
        logger.info("DatabaseAlertRepository initialized")

    # ==================== 告警规则相关方法 ====================

    async def get_rule_by_id(self, rule_id: int) -> Optional[Dict[str, Any]]:
        """根据ID获取告警规则"""
        stmt = select(AlertRule).where(AlertRule.id == rule_id)
        result = await self.db.execute(stmt)
        rule = result.scalar_one_or_none()

        if rule:
            return self._rule_to_dict(rule)
        return None

    async def get_rules(
        self,
        skip: int = 0,
        limit: int = 10,
        category: Optional[AlertCategory] = None,
        severity: Optional[AlertSeverity] = None,
        is_active: Optional[bool] = None
    ) -> Tuple[List[Dict[str, Any]], int]:
        """获取告警规则列表（分页）"""
        # 构建查询条件
        conditions = []
        if category:
            conditions.append(AlertRule.category == category.value)
        if severity:
            conditions.append(AlertRule.severity == severity.value)
        if is_active is not None:
            conditions.append(AlertRule.is_active == is_active)

        # 查询总数
        count_stmt = select(func.count(AlertRule.id))
        if conditions:
            count_stmt = count_stmt.where(and_(*conditions))
        total = await self.db.scalar(count_stmt)

        # 查询数据
        stmt = select(AlertRule)
        if conditions:
            stmt = stmt.where(and_(*conditions))
        stmt = stmt.order_by(desc(AlertRule.created_at)).offset(skip).limit(limit)

        result = await self.db.execute(stmt)
        rules = result.scalars().all()

        return [self._rule_to_dict(rule) for rule in rules], total or 0

    async def create_rule(self, rule_data: Dict[str, Any], created_by: int) -> Dict[str, Any]:
        """创建告警规则"""
        rule = AlertRule(
            name=rule_data["name"],
            description=rule_data.get("description"),
            category=rule_data["category"].value if isinstance(rule_data["category"], AlertCategory) else rule_data["category"],
            metric_name=rule_data["metric_name"],
            operator=rule_data["operator"],
            threshold_value=rule_data["threshold_value"],
            duration=rule_data.get("duration", 300),
            device_types=rule_data.get("device_types", []),
            device_groups=rule_data.get("device_groups", []),
            specific_devices=rule_data.get("specific_devices", []),
            severity=rule_data["severity"].value if isinstance(rule_data["severity"], AlertSeverity) else rule_data["severity"],
            auto_resolve=rule_data.get("auto_resolve", True),
            notification_enabled=rule_data.get("notification_enabled", True),
            email_enabled=rule_data.get("email_enabled", False),
            webhook_enabled=rule_data.get("webhook_enabled", False),
            webhook_url=rule_data.get("webhook_url"),
            is_active=rule_data.get("is_active", True),
            created_by=created_by
        )

        self.db.add(rule)
        await self.db.flush()  # 获取ID但不提交事务
        await self.db.refresh(rule)

        logger.info("Alert rule created in database", rule_id=rule.id, name=rule.name)
        return self._rule_to_dict(rule)

    async def update_rule(self, rule_id: int, rule_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """更新告警规则"""
        stmt = select(AlertRule).where(AlertRule.id == rule_id)
        result = await self.db.execute(stmt)
        rule = result.scalar_one_or_none()

        if not rule:
            return None

        # 更新字段
        for key, value in rule_data.items():
            if hasattr(rule, key):
                # 处理枚举类型
                if isinstance(value, (AlertSeverity, AlertCategory)):
                    value = value.value
                setattr(rule, key, value)

        rule.updated_at = datetime.now()
        await self.db.flush()
        await self.db.refresh(rule)

        logger.info("Alert rule updated in database", rule_id=rule_id)
        return self._rule_to_dict(rule)

    async def delete_rule(self, rule_id: int) -> bool:
        """删除告警规则（软删除）"""
        stmt = update(AlertRule).where(AlertRule.id == rule_id).values(is_active=False)
        result = await self.db.execute(stmt)

        if result.rowcount > 0:
            logger.info("Alert rule soft-deleted in database", rule_id=rule_id)
            return True
        return False

    async def check_rule_name_exists(self, name: str, exclude_rule_id: Optional[int] = None) -> bool:
        """检查规则名称是否已存在"""
        stmt = select(func.count(AlertRule.id)).where(AlertRule.name == name)
        if exclude_rule_id:
            stmt = stmt.where(AlertRule.id != exclude_rule_id)

        count = await self.db.scalar(stmt)
        return (count or 0) > 0

    # ==================== 告警记录相关方法 ====================

    async def get_alert_by_id(self, alert_id: int) -> Optional[Dict[str, Any]]:
        """根据ID获取告警"""
        stmt = select(Alert).where(Alert.id == alert_id).options(
            selectinload(Alert.device),
            selectinload(Alert.rule)
        )
        result = await self.db.execute(stmt)
        alert = result.scalar_one_or_none()

        if alert:
            return self._alert_to_dict(alert)
        return None

    async def get_alerts(
        self,
        skip: int = 0,
        limit: int = 20,
        device_id: Optional[int] = None,
        severity: Optional[AlertSeverity] = None,
        status: Optional[AlertStatus] = None,
        category: Optional[AlertCategory] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        search: Optional[str] = None
    ) -> Tuple[List[Dict[str, Any]], int]:
        """获取告警列表（分页、过滤）"""
        # 构建查询条件
        conditions = []
        if device_id:
            conditions.append(Alert.device_id == device_id)
        if severity:
            conditions.append(Alert.severity == severity.value)
        if status:
            conditions.append(Alert.status == status.value)
        if category:
            conditions.append(Alert.category == category.value)
        if start_date:
            conditions.append(Alert.first_occurred >= start_date)
        if end_date:
            conditions.append(Alert.first_occurred <= end_date)
        if search:
            search_pattern = f"%{search}%"
            conditions.append(
                or_(
                    Alert.title.ilike(search_pattern),
                    Alert.message.ilike(search_pattern)
                )
            )

        # 查询总数
        count_stmt = select(func.count(Alert.id))
        if conditions:
            count_stmt = count_stmt.where(and_(*conditions))
        total = await self.db.scalar(count_stmt)

        # 查询数据
        stmt = select(Alert).options(
            selectinload(Alert.device),
            selectinload(Alert.rule)
        )
        if conditions:
            stmt = stmt.where(and_(*conditions))
        stmt = stmt.order_by(desc(Alert.first_occurred)).offset(skip).limit(limit)

        result = await self.db.execute(stmt)
        alerts = result.scalars().all()

        return [self._alert_to_dict(alert) for alert in alerts], total or 0

    async def get_active_alerts(
        self,
        device_id: Optional[int] = None,
        severity: Optional[AlertSeverity] = None
    ) -> List[Dict[str, Any]]:
        """获取活跃告警"""
        conditions = [Alert.status.in_([AlertStatus.OPEN.value, AlertStatus.ACKNOWLEDGED.value])]
        if device_id:
            conditions.append(Alert.device_id == device_id)
        if severity:
            conditions.append(Alert.severity == severity.value)

        stmt = select(Alert).where(and_(*conditions)).options(
            selectinload(Alert.device),
            selectinload(Alert.rule)
        ).order_by(desc(Alert.first_occurred))

        result = await self.db.execute(stmt)
        alerts = result.scalars().all()

        return [self._alert_to_dict(alert) for alert in alerts]

    async def get_alert_history(
        self,
        skip: int = 0,
        limit: int = 100,
        device_id: Optional[int] = None,
        severity: Optional[AlertSeverity] = None
    ) -> Tuple[List[Dict[str, Any]], int]:
        """获取告警历史"""
        conditions = [Alert.status.in_([AlertStatus.RESOLVED.value, AlertStatus.CLOSED.value])]
        if device_id:
            conditions.append(Alert.device_id == device_id)
        if severity:
            conditions.append(Alert.severity == severity.value)

        # 查询总数
        count_stmt = select(func.count(Alert.id)).where(and_(*conditions))
        total = await self.db.scalar(count_stmt)

        # 查询数据
        stmt = select(Alert).where(and_(*conditions)).options(
            selectinload(Alert.device),
            selectinload(Alert.rule)
        ).order_by(desc(Alert.resolved_at)).offset(skip).limit(limit)

        result = await self.db.execute(stmt)
        alerts = result.scalars().all()

        return [self._alert_to_dict(alert) for alert in alerts], total or 0

    async def create_alert(self, alert_data: Dict[str, Any]) -> Dict[str, Any]:
        """创建告警"""
        now = datetime.now()

        alert = Alert(
            device_id=alert_data["device_id"],
            rule_id=alert_data.get("rule_id"),
            title=alert_data["title"],
            message=alert_data["message"],
            category=alert_data["category"].value if isinstance(alert_data["category"], AlertCategory) else alert_data["category"],
            severity=alert_data["severity"].value if isinstance(alert_data["severity"], AlertSeverity) else alert_data["severity"],
            status=AlertStatus.OPEN.value,
            metric_name=alert_data.get("metric_name"),
            current_value=alert_data.get("current_value"),
            threshold_value=alert_data.get("threshold_value"),
            first_occurred=now,
            last_occurred=now
        )

        self.db.add(alert)
        await self.db.flush()
        await self.db.refresh(alert)

        # 记录操作历史
        await self._record_operation(
            alert.id,
            "create",
            operator_id=0,
            operator_name="System",
            new_status=AlertStatus.OPEN.value
        )

        logger.info("Alert created in database", alert_id=alert.id, title=alert.title)
        return self._alert_to_dict(alert)

    async def update_alert(self, alert_id: int, alert_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """更新告警"""
        stmt = select(Alert).where(Alert.id == alert_id)
        result = await self.db.execute(stmt)
        alert = result.scalar_one_or_none()

        if not alert:
            return None

        # 记录原始状态
        previous_status = alert.status

        # 更新字段
        for key, value in alert_data.items():
            if hasattr(alert, key):
                if isinstance(value, (AlertSeverity, AlertStatus, AlertCategory)):
                    value = value.value
                setattr(alert, key, value)

        alert.updated_at = datetime.now()
        await self.db.flush()

        # 记录操作历史
        if "status" in alert_data:
            await self._record_operation(
                alert_id,
                "update",
                operator_id=0,
                operator_name="System",
                previous_status=previous_status,
                new_status=alert.status
            )

        await self.db.refresh(alert)
        logger.info("Alert updated in database", alert_id=alert_id)
        return self._alert_to_dict(alert)

    async def delete_alert(self, alert_id: int) -> bool:
        """删除告警（硬删除）"""
        stmt = delete(Alert).where(Alert.id == alert_id)
        result = await self.db.execute(stmt)

        if result.rowcount > 0:
            logger.info("Alert deleted from database", alert_id=alert_id)
            return True
        return False

    # ==================== 告警状态操作 ====================

    async def acknowledge_alert(self, alert_id: int, user_id: int, note: Optional[str] = None) -> bool:
        """确认告警"""
        stmt = select(Alert).where(Alert.id == alert_id)
        result = await self.db.execute(stmt)
        alert = result.scalar_one_or_none()

        if not alert or alert.status != AlertStatus.OPEN.value:
            return False

        previous_status = alert.status
        alert.status = AlertStatus.ACKNOWLEDGED.value
        alert.acknowledged_at = datetime.now()
        alert.acknowledged_by = user_id
        alert.updated_at = datetime.now()

        await self.db.flush()

        # 记录操作历史
        await self._record_operation(
            alert_id,
            "acknowledge",
            operator_id=user_id,
            operator_name=f"User_{user_id}",
            note=note,
            previous_status=previous_status,
            new_status=AlertStatus.ACKNOWLEDGED.value
        )

        logger.info("Alert acknowledged in database", alert_id=alert_id, user_id=user_id)
        return True

    async def resolve_alert(self, alert_id: int, user_id: int, note: Optional[str] = None) -> bool:
        """解决告警"""
        stmt = select(Alert).where(Alert.id == alert_id)
        result = await self.db.execute(stmt)
        alert = result.scalar_one_or_none()

        if not alert or alert.status not in [AlertStatus.OPEN.value, AlertStatus.ACKNOWLEDGED.value]:
            return False

        previous_status = alert.status
        alert.status = AlertStatus.RESOLVED.value
        alert.resolved_at = datetime.now()
        alert.resolved_by = user_id
        alert.resolution_note = note
        alert.updated_at = datetime.now()

        await self.db.flush()

        # 记录操作历史
        await self._record_operation(
            alert_id,
            "resolve",
            operator_id=user_id,
            operator_name=f"User_{user_id}",
            note=note,
            previous_status=previous_status,
            new_status=AlertStatus.RESOLVED.value
        )

        logger.info("Alert resolved in database", alert_id=alert_id, user_id=user_id)
        return True

    async def reactivate_alert(self, alert_id: int, user_id: int, reason: Optional[str] = None) -> bool:
        """重新激活告警"""
        stmt = select(Alert).where(Alert.id == alert_id)
        result = await self.db.execute(stmt)
        alert = result.scalar_one_or_none()

        if not alert or alert.status != AlertStatus.RESOLVED.value:
            return False

        previous_status = alert.status
        alert.status = AlertStatus.OPEN.value
        alert.reactivated_at = datetime.now()
        alert.reactivated_by = user_id
        alert.reactivation_reason = reason
        alert.updated_at = datetime.now()

        await self.db.flush()

        # 记录操作历史
        await self._record_operation(
            alert_id,
            "reactivate",
            operator_id=user_id,
            operator_name=f"User_{user_id}",
            note=reason,
            previous_status=previous_status,
            new_status=AlertStatus.OPEN.value
        )

        logger.info("Alert reactivated in database", alert_id=alert_id, user_id=user_id)
        return True

    async def close_alert(self, alert_id: int, user_id: int) -> bool:
        """关闭告警"""
        stmt = select(Alert).where(Alert.id == alert_id)
        result = await self.db.execute(stmt)
        alert = result.scalar_one_or_none()

        if not alert:
            return False

        previous_status = alert.status
        alert.status = AlertStatus.CLOSED.value
        alert.closed_at = datetime.now()
        alert.closed_by = user_id
        alert.updated_at = datetime.now()

        await self.db.flush()

        # 记录操作历史
        await self._record_operation(
            alert_id,
            "close",
            operator_id=user_id,
            operator_name=f"User_{user_id}",
            previous_status=previous_status,
            new_status=AlertStatus.CLOSED.value
        )

        logger.info("Alert closed in database", alert_id=alert_id, user_id=user_id)
        return True

    # ==================== 批量操作 ====================

    async def batch_acknowledge_alerts(self, alert_ids: List[int], user_id: int, note: Optional[str] = None) -> int:
        """批量确认告警"""
        count = 0
        for alert_id in alert_ids:
            if await self.acknowledge_alert(alert_id, user_id, note):
                count += 1
        return count

    async def batch_resolve_alerts(self, alert_ids: List[int], user_id: int, note: Optional[str] = None) -> int:
        """批量解决告警"""
        count = 0
        for alert_id in alert_ids:
            if await self.resolve_alert(alert_id, user_id, note):
                count += 1
        return count

    async def batch_close_alerts(self, alert_ids: List[int], user_id: int) -> int:
        """批量关闭告警"""
        count = 0
        for alert_id in alert_ids:
            if await self.close_alert(alert_id, user_id):
                count += 1
        return count

    async def batch_delete_alerts(self, alert_ids: List[int]) -> int:
        """批量删除告警"""
        stmt = delete(Alert).where(Alert.id.in_(alert_ids))
        result = await self.db.execute(stmt)
        return result.rowcount or 0

    # ==================== 查询和统计 ====================

    async def get_alerts_by_device(self, device_id: int, status: Optional[AlertStatus] = None) -> List[Dict[str, Any]]:
        """获取指定设备的告警"""
        conditions = [Alert.device_id == device_id]
        if status:
            conditions.append(Alert.status == status.value)

        stmt = select(Alert).where(and_(*conditions)).options(
            selectinload(Alert.rule)
        ).order_by(desc(Alert.first_occurred))

        result = await self.db.execute(stmt)
        alerts = result.scalars().all()

        return [self._alert_to_dict(alert) for alert in alerts]

    async def get_alerts_by_rule(self, rule_id: int, limit: int = 100) -> List[Dict[str, Any]]:
        """获取指定规则触发的告警"""
        stmt = select(Alert).where(Alert.rule_id == rule_id).options(
            selectinload(Alert.device)
        ).order_by(desc(Alert.first_occurred)).limit(limit)

        result = await self.db.execute(stmt)
        alerts = result.scalars().all()

        return [self._alert_to_dict(alert) for alert in alerts]

    async def get_alerts_by_severity(self, severity: AlertSeverity, status: Optional[AlertStatus] = None) -> List[Dict[str, Any]]:
        """获取指定严重级别的告警"""
        conditions = [Alert.severity == severity.value]
        if status:
            conditions.append(Alert.status == status.value)

        stmt = select(Alert).where(and_(*conditions)).options(
            selectinload(Alert.device),
            selectinload(Alert.rule)
        ).order_by(desc(Alert.first_occurred))

        result = await self.db.execute(stmt)
        alerts = result.scalars().all()

        return [self._alert_to_dict(alert) for alert in alerts]

    async def search_alerts(
        self,
        keyword: str,
        skip: int = 0,
        limit: int = 20
    ) -> Tuple[List[Dict[str, Any]], int]:
        """搜索告警"""
        search_pattern = f"%{keyword}%"
        conditions = [
            or_(
                Alert.title.ilike(search_pattern),
                Alert.message.ilike(search_pattern)
            )
        ]

        # 查询总数
        count_stmt = select(func.count(Alert.id)).where(and_(*conditions))
        total = await self.db.scalar(count_stmt)

        # 查询数据
        stmt = select(Alert).where(and_(*conditions)).options(
            selectinload(Alert.device),
            selectinload(Alert.rule)
        ).order_by(desc(Alert.first_occurred)).offset(skip).limit(limit)

        result = await self.db.execute(stmt)
        alerts = result.scalars().all()

        return [self._alert_to_dict(alert) for alert in alerts], total or 0

    async def get_alert_statistics(self) -> Dict[str, Any]:
        """获取告警统计信息"""
        # 活跃告警总数
        active_count_stmt = select(func.count(Alert.id)).where(
            Alert.status.in_([AlertStatus.OPEN.value, AlertStatus.ACKNOWLEDGED.value])
        )
        active_count = await self.db.scalar(active_count_stmt) or 0

        # 已解决告警总数
        resolved_count_stmt = select(func.count(Alert.id)).where(
            Alert.status == AlertStatus.RESOLVED.value
        )
        resolved_count = await self.db.scalar(resolved_count_stmt) or 0

        # 按严重级别统计（活跃告警）
        severity_stmt = select(
            Alert.severity,
            func.count(Alert.id)
        ).where(
            Alert.status.in_([AlertStatus.OPEN.value, AlertStatus.ACKNOWLEDGED.value])
        ).group_by(Alert.severity)
        severity_result = await self.db.execute(severity_stmt)
        by_severity = {row[0]: row[1] for row in severity_result}

        # 按状态统计
        status_stmt = select(
            Alert.status,
            func.count(Alert.id)
        ).group_by(Alert.status)
        status_result = await self.db.execute(status_stmt)
        by_status = {row[0]: row[1] for row in status_result}

        # 按类别统计（活跃告警）
        category_stmt = select(
            Alert.category,
            func.count(Alert.id)
        ).where(
            Alert.status.in_([AlertStatus.OPEN.value, AlertStatus.ACKNOWLEDGED.value])
        ).group_by(Alert.category)
        category_result = await self.db.execute(category_stmt)
        by_category = {row[0]: row[1] for row in category_result}

        # 按设备统计（活跃告警）
        device_stmt = select(
            Alert.device_id,
            func.count(Alert.id)
        ).where(
            Alert.status.in_([AlertStatus.OPEN.value, AlertStatus.ACKNOWLEDGED.value])
        ).group_by(Alert.device_id).order_by(desc(func.count(Alert.id))).limit(10)
        device_result = await self.db.execute(device_stmt)
        by_device = {row[0]: row[1] for row in device_result}

        # 趋势统计（最近7天）
        seven_days_ago = datetime.now() - timedelta(days=7)
        trend_stmt = select(
            func.date(Alert.created_at).label("date"),
            func.count(Alert.id).label("count")
        ).where(
            Alert.created_at >= seven_days_ago
        ).group_by(func.date(Alert.created_at)).order_by(func.date(Alert.created_at))
        trend_result = await self.db.execute(trend_stmt)
        trends = {str(row[0]): row[1] for row in trend_result}

        return {
            "total_active": active_count,
            "total_resolved": resolved_count,
            "by_severity": by_severity,
            "by_status": by_status,
            "by_category": by_category,
            "by_device": by_device,
            "trends": trends
        }

    # ==================== 辅助方法 ====================

    def _rule_to_dict(self, rule: AlertRule) -> Dict[str, Any]:
        """将AlertRule模型转换为字典"""
        return {
            "id": rule.id,
            "name": rule.name,
            "description": rule.description,
            "category": rule.category,
            "metric_name": rule.metric_name,
            "operator": rule.operator,
            "threshold_value": rule.threshold_value,
            "duration": rule.duration,
            "device_types": rule.device_types or [],
            "device_groups": rule.device_groups or [],
            "specific_devices": rule.specific_devices or [],
            "severity": rule.severity,
            "auto_resolve": rule.auto_resolve,
            "notification_enabled": rule.notification_enabled,
            "email_enabled": rule.email_enabled,
            "webhook_enabled": rule.webhook_enabled,
            "webhook_url": rule.webhook_url,
            "is_active": rule.is_active,
            "created_by": rule.created_by,
            "created_at": rule.created_at,
            "updated_at": rule.updated_at
        }

    def _alert_to_dict(self, alert: Alert) -> Dict[str, Any]:
        """将Alert模型转换为字典"""
        return {
            "id": alert.id,
            "device_id": alert.device_id,
            "rule_id": alert.rule_id,
            "title": alert.title,
            "message": alert.message,
            "category": alert.category,
            "severity": alert.severity,
            "status": alert.status,
            "metric_name": alert.metric_name,
            "current_value": alert.current_value,
            "threshold_value": alert.threshold_value,
            "first_occurred": alert.first_occurred,
            "last_occurred": alert.last_occurred,
            "acknowledged_at": alert.acknowledged_at,
            "acknowledged_by": alert.acknowledged_by,
            "resolved_at": alert.resolved_at,
            "resolved_by": alert.resolved_by,
            "resolution_note": alert.resolution_note,
            "reactivated_at": alert.reactivated_at,
            "reactivated_by": alert.reactivated_by,
            "reactivation_reason": alert.reactivation_reason,
            "closed_at": alert.closed_at,
            "closed_by": alert.closed_by,
            "occurrence_count": alert.occurrence_count,
            "notification_count": alert.notification_count,
            "escalation_level": alert.escalation_level,
            "created_at": alert.created_at,
            "updated_at": alert.updated_at
        }

    async def _record_operation(
        self,
        alert_id: int,
        operation_type: str,
        operator_id: int,
        operator_name: str,
        note: Optional[str] = None,
        previous_status: Optional[str] = None,
        new_status: Optional[str] = None,
        operation_metadata: Optional[Dict[str, Any]] = None
    ):
        """记录告警操作历史"""
        history = AlertOperationHistory(
            alert_id=alert_id,
            operation_type=operation_type,
            operator_id=operator_id,
            operator_name=operator_name,
            note=note,
            previous_status=previous_status,
            new_status=new_status,
            operation_metadata=operation_metadata or {}
        )

        self.db.add(history)
        await self.db.flush()


# ==================== 工厂函数 ====================

async def get_database_alert_repository(db_session: AsyncSession) -> DatabaseAlertRepository:
    """
    获取DatabaseAlertRepository实例（依赖注入）

    Args:
        db_session: SQLAlchemy异步会话

    Returns:
        DatabaseAlertRepository: 数据库告警仓储实例

    使用示例:
        @router.get("/alerts")
        async def get_alerts(
            db: AsyncSession = Depends(get_db_session),
            repo: DatabaseAlertRepository = Depends(get_database_alert_repository)
        ):
            alerts, total = await repo.get_alerts(skip=0, limit=20)
            return {"alerts": alerts, "total": total}
    """
    return DatabaseAlertRepository(db_session)
