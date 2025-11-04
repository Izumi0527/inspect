"""
告警Repository实现类

提供两种实现:
1. InMemoryAlertRepository - 基于内存的实现（当前使用）
2. DatabaseAlertRepository - 基于数据库的实现（待实现）
"""

from typing import Dict, List, Optional, Any, Tuple
from datetime import datetime, timedelta
import structlog

from ..models.alert import AlertSeverity, AlertStatus, AlertCategory

logger = structlog.get_logger()


class InMemoryAlertRepository:
    """
    基于内存的告警仓储实现

    数据存储结构:
    - alert_rules: Dict[int, Dict] - 告警规则（key: rule_id）
    - active_alerts: Dict[int, Dict] - 活跃告警（key: alert_id）
    - alert_history: List[Dict] - 已解决/已关闭的告警历史
    """

    def __init__(self):
        """初始化内存存储"""
        self.alert_rules: Dict[int, Dict[str, Any]] = {}
        self.active_alerts: Dict[int, Dict[str, Any]] = {}
        self.alert_history: List[Dict[str, Any]] = []

        # ID生成器
        self._next_rule_id = 1
        self._next_alert_id = 1

        logger.info("InMemoryAlertRepository initialized")

    # ==================== 告警规则操作 ====================

    async def get_rule_by_id(self, rule_id: int) -> Optional[Dict[str, Any]]:
        """根据ID获取告警规则"""
        return self.alert_rules.get(rule_id)

    async def get_rules(
        self,
        skip: int = 0,
        limit: int = 10,
        category: Optional[AlertCategory] = None,
        severity: Optional[AlertSeverity] = None,
        is_active: Optional[bool] = None
    ) -> Tuple[List[Dict[str, Any]], int]:
        """分页获取告警规则列表"""
        rules = list(self.alert_rules.values())

        # 应用过滤器
        if category:
            rules = [r for r in rules if r.get("category") == category]
        if severity:
            rules = [r for r in rules if r.get("severity") == severity]
        if is_active is not None:
            rules = [r for r in rules if r.get("is_active") == is_active]

        # 获取总数
        total = len(rules)

        # 应用分页
        paged_rules = rules[skip:skip + limit]

        return paged_rules, total

    async def create_rule(self, rule_data: Dict[str, Any], created_by: int) -> Dict[str, Any]:
        """创建告警规则"""
        rule_id = self._next_rule_id
        self._next_rule_id += 1

        now = datetime.now()
        rule = {
            "id": rule_id,
            **rule_data,
            "created_by": created_by,
            "created_at": now,
            "updated_at": now,
            "is_active": True
        }

        self.alert_rules[rule_id] = rule

        logger.info("Alert rule created", rule_id=rule_id, name=rule.get("name"))
        return rule

    async def update_rule(self, rule_id: int, rule_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """更新告警规则"""
        rule = self.alert_rules.get(rule_id)
        if not rule:
            return None

        # 更新字段
        for key, value in rule_data.items():
            if value is not None:
                rule[key] = value

        rule["updated_at"] = datetime.now()

        logger.info("Alert rule updated", rule_id=rule_id)
        return rule

    async def delete_rule(self, rule_id: int) -> bool:
        """删除告警规则"""
        if rule_id not in self.alert_rules:
            return False

        del self.alert_rules[rule_id]
        logger.info("Alert rule deleted", rule_id=rule_id)
        return True

    async def check_rule_name_exists(self, name: str, exclude_rule_id: Optional[int] = None) -> bool:
        """检查规则名称是否已存在"""
        for rule_id, rule in self.alert_rules.items():
            if rule.get("name") == name and rule_id != exclude_rule_id:
                return True
        return False

    # ==================== 告警记录操作 ====================

    async def get_alert_by_id(self, alert_id: int) -> Optional[Dict[str, Any]]:
        """根据ID获取告警（从活跃告警或历史记录中查找）"""
        # 先在活跃告警中查找
        if alert_id in self.active_alerts:
            return self.active_alerts[alert_id]

        # 在历史记录中查找
        for alert in self.alert_history:
            if alert.get("id") == alert_id:
                return alert

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
        """分页获取告警列表（带过滤条件）"""
        # 合并活跃告警和历史告警
        all_alerts = list(self.active_alerts.values()) + self.alert_history

        # 应用过滤器
        if device_id:
            all_alerts = [a for a in all_alerts if a.get("device_id") == device_id]
        if severity:
            all_alerts = [a for a in all_alerts if a.get("severity") == severity]
        if status:
            all_alerts = [a for a in all_alerts if a.get("status") == status]
        if category:
            all_alerts = [a for a in all_alerts if a.get("category") == category]
        if start_date:
            all_alerts = [a for a in all_alerts if a.get("first_occurred", datetime.min) >= start_date]
        if end_date:
            all_alerts = [a for a in all_alerts if a.get("first_occurred", datetime.max) <= end_date]
        if search:
            search_lower = search.lower()
            all_alerts = [
                a for a in all_alerts
                if search_lower in a.get("title", "").lower() or search_lower in a.get("message", "").lower()
            ]

        # 按时间倒序排序
        all_alerts.sort(key=lambda x: x.get("first_occurred", datetime.min), reverse=True)

        # 获取总数
        total = len(all_alerts)

        # 应用分页
        paged_alerts = all_alerts[skip:skip + limit]

        return paged_alerts, total

    async def create_alert(self, alert_data: Dict[str, Any]) -> Dict[str, Any]:
        """创建告警"""
        alert_id = self._next_alert_id
        self._next_alert_id += 1

        now = datetime.now()
        alert = {
            "id": alert_id,
            **alert_data,
            "status": AlertStatus.OPEN,
            "first_occurred": now,
            "last_occurred": now,
            "occurrence_count": 1,
            "notification_count": 0,
            "escalation_level": 0,
            "created_at": now,
            "updated_at": now
        }

        self.active_alerts[alert_id] = alert

        logger.info("Alert created", alert_id=alert_id, device_id=alert.get("device_id"))
        return alert

    async def update_alert(self, alert_id: int, alert_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """更新告警"""
        alert = await self.get_alert_by_id(alert_id)
        if not alert:
            return None

        # 更新字段
        for key, value in alert_data.items():
            if value is not None:
                alert[key] = value

        alert["updated_at"] = datetime.now()

        logger.info("Alert updated", alert_id=alert_id)
        return alert

    async def delete_alert(self, alert_id: int) -> bool:
        """删除告警（物理删除）"""
        # 从活跃告警中删除
        if alert_id in self.active_alerts:
            del self.active_alerts[alert_id]
            logger.info("Alert deleted from active", alert_id=alert_id)
            return True

        # 从历史记录中删除
        for i, alert in enumerate(self.alert_history):
            if alert.get("id") == alert_id:
                self.alert_history.pop(i)
                logger.info("Alert deleted from history", alert_id=alert_id)
                return True

        return False

    # ==================== 状态操作 ====================

    async def acknowledge_alert(self, alert_id: int, user_id: int, note: Optional[str] = None) -> bool:
        """确认告警"""
        alert = self.active_alerts.get(alert_id)
        if not alert or alert.get("status") != AlertStatus.OPEN:
            return False

        alert["status"] = AlertStatus.ACKNOWLEDGED
        alert["acknowledged_at"] = datetime.now()
        alert["acknowledged_by"] = user_id
        if note:
            alert["acknowledge_note"] = note
        alert["updated_at"] = datetime.now()

        logger.info("Alert acknowledged", alert_id=alert_id, user_id=user_id)
        return True

    async def resolve_alert(self, alert_id: int, user_id: int, note: Optional[str] = None) -> bool:
        """解决告警"""
        alert = self.active_alerts.get(alert_id)
        if not alert:
            return False

        alert["status"] = AlertStatus.RESOLVED
        alert["resolved_at"] = datetime.now()
        alert["resolved_by"] = user_id
        if note:
            alert["resolution_note"] = note
        alert["updated_at"] = datetime.now()

        # 移至历史记录
        self.alert_history.append(alert)
        del self.active_alerts[alert_id]

        logger.info("Alert resolved", alert_id=alert_id, user_id=user_id)
        return True

    async def reactivate_alert(self, alert_id: int, user_id: int, reason: Optional[str] = None) -> bool:
        """重新激活告警"""
        # 在活跃告警中查找
        if alert_id in self.active_alerts:
            alert = self.active_alerts[alert_id]
            if alert.get("status") == AlertStatus.OPEN:
                return True  # 已经是活跃状态

            # 重新激活
            alert["status"] = AlertStatus.OPEN
            alert["reactivated_at"] = datetime.now()
            alert["reactivated_by"] = user_id
            if reason:
                alert["reactivation_reason"] = reason

            # 清除解决信息
            alert.pop("resolved_at", None)
            alert.pop("resolved_by", None)
            alert.pop("resolution_note", None)

            logger.info("Alert reactivated", alert_id=alert_id, user_id=user_id)
            return True

        # 在历史记录中查找
        for i, alert in enumerate(self.alert_history):
            if alert.get("id") == alert_id and alert.get("status") == AlertStatus.RESOLVED:
                # 重新激活
                alert["status"] = AlertStatus.OPEN
                alert["reactivated_at"] = datetime.now()
                alert["reactivated_by"] = user_id
                if reason:
                    alert["reactivation_reason"] = reason

                # 清除解决信息
                alert.pop("resolved_at", None)
                alert.pop("resolved_by", None)
                alert.pop("resolution_note", None)

                # 移回活跃告警
                self.active_alerts[alert_id] = alert
                self.alert_history.pop(i)

                logger.info("Alert reactivated from history", alert_id=alert_id, user_id=user_id)
                return True

        return False

    async def close_alert(self, alert_id: int, user_id: int) -> bool:
        """关闭/归档告警（软删除）"""
        alert = self.active_alerts.get(alert_id)
        if not alert:
            # 检查是否已在历史记录中
            for hist_alert in self.alert_history:
                if hist_alert.get("id") == alert_id:
                    return True  # 已经归档
            return False

        alert["status"] = AlertStatus.CLOSED
        alert["closed_at"] = datetime.now()
        alert["closed_by"] = user_id
        alert["updated_at"] = datetime.now()

        # 移至历史记录
        self.alert_history.append(alert)
        del self.active_alerts[alert_id]

        logger.info("Alert closed", alert_id=alert_id, user_id=user_id)
        return True

    # ==================== 批量操作 ====================

    async def bulk_acknowledge(self, alert_ids: List[int], user_id: int, note: Optional[str] = None) -> Tuple[int, List[int]]:
        """批量确认告警"""
        success_count = 0
        failed_ids = []

        for alert_id in alert_ids:
            success = await self.acknowledge_alert(alert_id, user_id, note)
            if success:
                success_count += 1
            else:
                failed_ids.append(alert_id)

        return success_count, failed_ids

    async def bulk_resolve(self, alert_ids: List[int], user_id: int, note: Optional[str] = None) -> Tuple[int, List[int]]:
        """批量解决告警"""
        success_count = 0
        failed_ids = []

        for alert_id in alert_ids:
            success = await self.resolve_alert(alert_id, user_id, note)
            if success:
                success_count += 1
            else:
                failed_ids.append(alert_id)

        return success_count, failed_ids

    async def bulk_close(self, alert_ids: List[int], user_id: int) -> Tuple[int, List[int]]:
        """批量关闭告警"""
        success_count = 0
        failed_ids = []

        for alert_id in alert_ids:
            success = await self.close_alert(alert_id, user_id)
            if success:
                success_count += 1
            else:
                failed_ids.append(alert_id)

        return success_count, failed_ids

    # ==================== 查询操作 ====================

    async def get_active_alerts(
        self,
        device_id: Optional[int] = None,
        severity: Optional[AlertSeverity] = None
    ) -> List[Dict[str, Any]]:
        """获取活跃告警列表"""
        alerts = list(self.active_alerts.values())

        # 应用过滤器
        if device_id:
            alerts = [a for a in alerts if a.get("device_id") == device_id]
        if severity:
            alerts = [a for a in alerts if a.get("severity") == severity]

        return alerts

    async def get_recent_alerts(self, limit: int = 5) -> List[Dict[str, Any]]:
        """获取最新告警列表（按时间倒序）"""
        all_alerts = list(self.active_alerts.values()) + self.alert_history[-50:]
        all_alerts.sort(key=lambda x: x.get("first_occurred", datetime.min), reverse=True)
        return all_alerts[:limit]

    async def get_alerts_by_device(self, device_id: int, limit: int = 100) -> List[Dict[str, Any]]:
        """获取指定设备的告警列表"""
        alerts = [a for a in self.active_alerts.values() if a.get("device_id") == device_id]
        hist_alerts = [a for a in self.alert_history if a.get("device_id") == device_id]

        all_alerts = alerts + hist_alerts
        all_alerts.sort(key=lambda x: x.get("first_occurred", datetime.min), reverse=True)

        return all_alerts[:limit]

    async def get_alerts_by_rule(self, rule_id: int) -> List[Dict[str, Any]]:
        """获取指定规则触发的告警列表"""
        alerts = [a for a in self.active_alerts.values() if a.get("rule_id") == rule_id]
        hist_alerts = [a for a in self.alert_history if a.get("rule_id") == rule_id]

        return alerts + hist_alerts

    # ==================== 统计操作 ====================

    async def get_alert_statistics(self) -> Dict[str, Any]:
        """获取告警统计信息"""
        # 统计活跃告警
        active_count = len(self.active_alerts)

        # 统计已解决告警
        resolved_count = len([a for a in self.alert_history if a.get("status") == AlertStatus.RESOLVED])

        # 按严重级别统计
        by_severity = {}
        for alert in self.active_alerts.values():
            severity = str(alert.get("severity", "unknown"))
            by_severity[severity] = by_severity.get(severity, 0) + 1

        # 按状态统计
        by_status = {}
        for alert in self.active_alerts.values():
            status = str(alert.get("status", "unknown"))
            by_status[status] = by_status.get(status, 0) + 1

        # 按类别统计
        by_category = {}
        for alert in self.active_alerts.values():
            category = str(alert.get("category", "unknown"))
            by_category[category] = by_category.get(category, 0) + 1

        # 按设备统计
        by_device = {}
        for alert in self.active_alerts.values():
            device_id = alert.get("device_id")
            if device_id:
                by_device[device_id] = by_device.get(device_id, 0) + 1

        return {
            "total_active": active_count,
            "total_resolved": resolved_count,
            "by_severity": by_severity,
            "by_status": by_status,
            "by_category": by_category,
            "by_device": by_device,
            "trends": {}  # TODO: 实现趋势统计
        }

    async def get_alert_count_by_status(self, status: AlertStatus) -> int:
        """获取指定状态的告警数量"""
        return len([a for a in self.active_alerts.values() if a.get("status") == status])

    async def get_alert_count_by_severity(self, severity: AlertSeverity) -> int:
        """获取指定严重级别的告警数量"""
        return len([a for a in self.active_alerts.values() if a.get("severity") == severity])

    # ==================== 历史记录操作 ====================

    async def get_alert_history(
        self,
        skip: int = 0,
        limit: int = 100,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> Tuple[List[Dict[str, Any]], int]:
        """获取告警历史记录（已解决/已关闭的告警）"""
        history = self.alert_history.copy()

        # 应用日期过滤
        if start_date:
            history = [a for a in history if a.get("first_occurred", datetime.min) >= start_date]
        if end_date:
            history = [a for a in history if a.get("first_occurred", datetime.max) <= end_date]

        # 按时间倒序排序
        history.sort(key=lambda x: x.get("first_occurred", datetime.min), reverse=True)

        # 获取总数
        total = len(history)

        # 应用分页
        paged_history = history[skip:skip + limit]

        return paged_history, total

    async def archive_old_alerts(self, days: int = 90) -> int:
        """归档旧告警（从历史记录中清理N天前的数据）"""
        cutoff_date = datetime.now() - timedelta(days=days)

        # 保留最近N天的告警
        original_count = len(self.alert_history)
        self.alert_history = [
            a for a in self.alert_history
            if a.get("first_occurred", datetime.now()) >= cutoff_date
        ]

        archived_count = original_count - len(self.alert_history)

        if archived_count > 0:
            logger.info(f"Archived {archived_count} old alerts older than {days} days")

        return archived_count


# ==================== 工厂函数 ====================

_in_memory_repository_instance: Optional[InMemoryAlertRepository] = None


def get_in_memory_alert_repository() -> InMemoryAlertRepository:
    """获取InMemoryAlertRepository单例实例"""
    global _in_memory_repository_instance

    if _in_memory_repository_instance is None:
        _in_memory_repository_instance = InMemoryAlertRepository()

    return _in_memory_repository_instance
