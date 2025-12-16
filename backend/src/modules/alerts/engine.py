"""
告警引擎

负责告警规则检查循环和自动解决
"""
import asyncio
from datetime import datetime
from typing import Dict, List, Optional, Any, TYPE_CHECKING
import structlog

from src.models.alert import AlertSeverity, AlertStatus, AlertCategory
from src.modules.alerts.evaluator import alert_evaluator
from src.modules.alerts.notifier import alert_notifier

if TYPE_CHECKING:
    from src.repositories.alert_repository_impl import InMemoryAlertRepository

logger = structlog.get_logger()


class AlertEngine:
    """告警引擎
    
    负责：
    - 定期检查告警规则
    - 触发告警
    - 自动解决告警
    - 处理通知队列
    """

    def __init__(self, repository: "InMemoryAlertRepository"):
        self.repository = repository
        self.notifier = alert_notifier
        self.evaluator = alert_evaluator
        self._running = False
        self._check_interval = 30  # 秒

    @property
    def is_running(self) -> bool:
        return self._running

    async def start(self) -> None:
        """启动告警引擎"""
        if self._running:
            logger.warning("Alert engine already running")
            return
        
        self._running = True
        asyncio.create_task(self._engine_loop())
        logger.info("Alert engine started")

    async def stop(self) -> None:
        """停止告警引擎"""
        self._running = False
        logger.info("Alert engine stopped")

    async def _engine_loop(self) -> None:
        """告警引擎主循环"""
        while self._running:
            try:
                await self._check_alert_rules()
                await self.notifier.process_queue(self.repository)
                await self._auto_resolve_alerts()
                await asyncio.sleep(self._check_interval)
            except Exception as e:
                logger.error("Alert engine error", error=str(e))
                await asyncio.sleep(60)

    async def _check_alert_rules(self) -> None:
        """检查告警规则"""
        from src.core.database import get_db_session_context
        from src.repositories.device_repository import DeviceRepository
        from src.services.monitoring import monitoring_service

        rules, _ = await self.repository.get_rules(skip=0, limit=100, is_active=True)

        try:
            async with get_db_session_context() as session:
                device_repo = DeviceRepository(session)
                devices, _ = await device_repo.get_devices_paginated(
                    skip=0, limit=1000, is_active=True
                )
                
                for rule in rules:
                    try:
                        applicable_devices = self._get_applicable_devices(devices, rule)
                        for device_id, device_info in applicable_devices:
                            await self._check_device_rule(
                                device_id, device_info, rule, monitoring_service
                            )
                    except Exception as e:
                        logger.error("Error checking alert rule",
                                   rule_id=rule.get("id"),
                                   error=str(e))
        except Exception as e:
            logger.error("Failed to get devices for alert checking", error=str(e))

    def _get_applicable_devices(self, devices: List, rule: dict) -> List[tuple]:
        """获取适用于规则的设备列表"""
        applicable = []
        device_types = rule.get("device_types", [])

        for device in devices:
            device_type = device.device_type.value if hasattr(device.device_type, 'value') else str(device.device_type)
            if not device_types or device_type in device_types:
                device_info = {
                    "id": device.id,
                    "name": device.name,
                    "ip_address": device.ip_address,
                    "device_type": device_type,
                }
                applicable.append((device.id, device_info))

        return applicable

    async def _check_device_rule(
        self, 
        device_id: int, 
        device_info: dict, 
        rule: dict,
        monitoring_service
    ) -> None:
        """检查单个设备的告警规则"""
        metrics = await monitoring_service.get_device_current_metrics(device_id)
        if not metrics:
            return

        metric_value = self.evaluator.get_metric_value(metrics, rule["metric_name"])
        if metric_value is None:
            return

        is_triggered = self.evaluator.evaluate_condition(
            metric_value, rule["operator"], rule["threshold_value"]
        )

        if is_triggered:
            await self._handle_triggered_alert(device_id, device_info, rule, metric_value)
        elif rule.get("auto_resolve", True):
            await self._auto_resolve_device_alerts(device_id, rule["id"])

    async def _handle_triggered_alert(
        self, 
        device_id: int, 
        device_info: dict, 
        rule: dict, 
        metric_value: Any
    ) -> None:
        """处理触发的告警"""
        active_alerts = await self.repository.get_active_alerts(device_id=device_id)
        existing_alert = None
        
        for alert in active_alerts:
            if (alert.get("rule_id") == rule["id"] and
                alert.get("status") == AlertStatus.OPEN):
                existing_alert = alert
                break

        if existing_alert:
            await self.repository.update_alert(
                existing_alert["id"],
                {
                    "last_occurred": datetime.now(),
                    "occurrence_count": existing_alert.get("occurrence_count", 1) + 1,
                    "current_value": metric_value
                }
            )
        else:
            await self._create_alert(device_id, device_info, rule, metric_value)

    async def _create_alert(
        self, 
        device_id: int, 
        device_info: dict, 
        rule: dict, 
        current_value: Any
    ) -> None:
        """创建新告警"""
        title = f"{device_info.get('name', f'设备{device_id}')} - {rule['name']}"
        message = self.evaluator.generate_alert_message(device_info, rule, current_value)

        alert_data = {
            "device_id": device_id,
            "rule_id": rule["id"],
            "title": title,
            "message": message,
            "category": rule["category"],
            "severity": rule["severity"],
            "metric_name": rule["metric_name"],
            "current_value": current_value,
            "threshold_value": rule["threshold_value"]
        }

        alert = await self.repository.create_alert(alert_data)

        if rule.get("notification_enabled", True):
            await self.notifier.queue_notification(alert)

        logger.info("Alert created",
                   alert_id=alert["id"],
                   device_id=device_id,
                   rule_name=rule["name"])

    async def _auto_resolve_alerts(self) -> None:
        """自动解决告警"""
        from src.services.monitoring import monitoring_service
        
        active_alerts = await self.repository.get_active_alerts()

        for alert in active_alerts:
            if alert.get("status") != AlertStatus.OPEN:
                continue

            try:
                rule = await self.repository.get_rule_by_id(alert["rule_id"])
                if not rule or not rule.get("auto_resolve", True):
                    continue

                metrics = await monitoring_service.get_device_current_metrics(alert["device_id"])
                if not metrics:
                    continue

                metric_value = self.evaluator.get_metric_value(metrics, rule["metric_name"])
                if metric_value is None:
                    continue

                is_triggered = self.evaluator.evaluate_condition(
                    metric_value, rule["operator"], rule["threshold_value"]
                )

                if not is_triggered:
                    await self.repository.resolve_alert(
                        alert["id"],
                        user_id=0,
                        note="告警条件已恢复正常，自动解决"
                    )
                    logger.info("Alert auto-resolved", alert_id=alert["id"])

            except Exception as e:
                logger.error("Error auto-resolving alert",
                           alert_id=alert.get("id"),
                           error=str(e))

    async def _auto_resolve_device_alerts(self, device_id: int, rule_id: int) -> None:
        """自动解决特定设备和规则的告警"""
        active_alerts = await self.repository.get_active_alerts(device_id=device_id)

        for alert in active_alerts:
            if (alert.get("rule_id") == rule_id and
                alert.get("status") == AlertStatus.OPEN):

                await self.repository.resolve_alert(
                    alert["id"],
                    user_id=0,
                    note="告警条件已恢复正常，自动解决"
                )
                logger.info("Device alert auto-resolved",
                           alert_id=alert["id"],
                           device_id=device_id)
