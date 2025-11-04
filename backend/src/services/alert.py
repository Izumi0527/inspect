import asyncio
import json
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any
from enum import Enum
import structlog

from src.models.alert import AlertSeverity, AlertStatus, AlertCategory
from src.services.monitoring import monitoring_service

logger = structlog.get_logger()

class AlertService:
    """告警服务类"""
    
    def __init__(self):
        self.active_alerts: Dict[int, Dict] = {}
        self.alert_rules: Dict[int, Dict] = {}
        self.alert_history: List[Dict] = []
        self.notification_queue: List[Dict] = []
        self.rule_engine_running = False
        
        # 初始化默认告警规则
        self._initialize_default_rules()
    
    def _initialize_default_rules(self):
        """初始化默认告警规则"""
        default_rules = [
            {
                "id": 1,
                "name": "CPU使用率告警",
                "category": AlertCategory.PERFORMANCE,
                "metric_name": "cpu_usage",
                "operator": ">",
                "threshold_value": 80.0,
                "duration": 300,  # 5分钟
                "severity": AlertSeverity.WARNING,
                "device_types": ["switch", "router", "server"],
                "auto_resolve": True,
                "notification_enabled": True,
                "email_enabled": True,
                "is_active": True
            },
            {
                "id": 2,
                "name": "内存使用率告警",
                "category": AlertCategory.PERFORMANCE,
                "metric_name": "memory_usage",
                "operator": ">",
                "threshold_value": 85.0,
                "duration": 300,
                "severity": AlertSeverity.WARNING,
                "device_types": ["switch", "router", "server"],
                "auto_resolve": True,
                "notification_enabled": True,
                "email_enabled": True,
                "is_active": True
            },
            {
                "id": 3,
                "name": "CPU使用率严重告警",
                "category": AlertCategory.PERFORMANCE,
                "metric_name": "cpu_usage",
                "operator": ">",
                "threshold_value": 95.0,
                "duration": 180,  # 3分钟
                "severity": AlertSeverity.CRITICAL,
                "device_types": ["switch", "router", "server"],
                "auto_resolve": True,
                "notification_enabled": True,
                "email_enabled": True,
                "is_active": True
            },
            {
                "id": 4,
                "name": "设备连通性告警",
                "category": AlertCategory.CONNECTIVITY,
                "metric_name": "connectivity.reachable",
                "operator": "==",
                "threshold_value": False,
                "duration": 60,  # 1分钟
                "severity": AlertSeverity.CRITICAL,
                "device_types": ["switch", "router", "server"],
                "auto_resolve": True,
                "notification_enabled": True,
                "email_enabled": True,
                "is_active": True
            },
            {
                "id": 5,
                "name": "响应时间告警",
                "category": AlertCategory.PERFORMANCE,
                "metric_name": "response_time",
                "operator": ">",
                "threshold_value": 100.0,  # 100ms
                "duration": 120,  # 2分钟
                "severity": AlertSeverity.WARNING,
                "device_types": ["switch", "router", "server"],
                "auto_resolve": True,
                "notification_enabled": True,
                "email_enabled": True,
                "is_active": True
            }
        ]
        
        for rule in default_rules:
            self.alert_rules[rule["id"]] = rule
    
    async def start_alert_engine(self):
        """启动告警引擎"""
        if self.rule_engine_running:
            logger.warning("Alert engine already running")
            return
        
        self.rule_engine_running = True
        asyncio.create_task(self._alert_engine_loop())
        logger.info("Alert engine started")
    
    async def stop_alert_engine(self):
        """停止告警引擎"""
        self.rule_engine_running = False
        logger.info("Alert engine stopped")
    
    async def _alert_engine_loop(self):
        """告警引擎主循环"""
        while self.rule_engine_running:
            try:
                # 检查所有活跃的告警规则
                await self._check_alert_rules()
                
                # 处理通知队列
                await self._process_notification_queue()
                
                # 自动解决告警
                await self._auto_resolve_alerts()
                
                # 等待下次检查
                await asyncio.sleep(30)  # 30秒检查一次
                
            except Exception as e:
                logger.error("Alert engine error", error=str(e))
                await asyncio.sleep(60)  # 出错时等待1分钟再继续
    
    async def _check_alert_rules(self):
        """检查告警规则"""
        from src.api.devices import TEMP_DEVICES
        
        for rule_id, rule in self.alert_rules.items():
            if not rule.get("is_active", True):
                continue
            
            try:
                # 获取适用的设备列表
                applicable_devices = []
                device_types = rule.get("device_types", [])
                
                for device_id, device_info in TEMP_DEVICES.items():
                    if not device_types or device_info.get("device_type") in device_types:
                        applicable_devices.append((device_id, device_info))
                
                # 检查每个设备
                for device_id, device_info in applicable_devices:
                    await self._check_device_rule(device_id, device_info, rule)
                    
            except Exception as e:
                logger.error("Error checking alert rule", 
                           rule_id=rule_id,
                           rule_name=rule.get("name"),
                           error=str(e))
    
    async def _check_device_rule(self, device_id: int, device_info: dict, rule: dict):
        """检查单个设备的告警规则"""
        # 获取设备当前指标
        metrics = await monitoring_service.get_device_current_metrics(device_id)
        if not metrics:
            return
        
        metric_name = rule["metric_name"]
        operator = rule["operator"]
        threshold_value = rule["threshold_value"]
        
        # 获取指标值
        metric_value = self._get_metric_value(metrics, metric_name)
        if metric_value is None:
            return
        
        # 评估告警条件
        is_triggered = self._evaluate_condition(metric_value, operator, threshold_value)
        
        # 生成告警键
        alert_key = f"{device_id}_{rule['id']}"
        
        if is_triggered:
            # 检查是否已存在相同告警
            existing_alert = None
            for alert_id, alert in self.active_alerts.items():
                if (alert.get("device_id") == device_id and 
                    alert.get("rule_id") == rule["id"] and 
                    alert.get("status") == AlertStatus.OPEN):
                    existing_alert = alert
                    break
            
            if existing_alert:
                # 更新现有告警
                existing_alert["last_occurred"] = datetime.now()
                existing_alert["occurrence_count"] += 1
                existing_alert["current_value"] = metric_value
            else:
                # 创建新告警
                await self._create_alert(device_id, device_info, rule, metric_value)
        
        else:
            # 检查是否需要自动解决告警
            if rule.get("auto_resolve", True):
                await self._auto_resolve_device_alerts(device_id, rule["id"])
    
    def _get_metric_value(self, metrics: dict, metric_name: str):
        """从指标数据中获取指定指标的值"""
        try:
            # 支持嵌套属性，如 "connectivity.reachable"
            keys = metric_name.split(".")
            value = metrics
            
            for key in keys:
                if isinstance(value, dict) and key in value:
                    value = value[key]
                else:
                    return None
            
            return value
        except:
            return None
    
    def _evaluate_condition(self, current_value, operator: str, threshold_value) -> bool:
        """评估告警条件"""
        try:
            if operator == ">":
                return current_value > threshold_value
            elif operator == "<":
                return current_value < threshold_value
            elif operator == ">=":
                return current_value >= threshold_value
            elif operator == "<=":
                return current_value <= threshold_value
            elif operator == "==":
                return current_value == threshold_value
            elif operator == "!=":
                return current_value != threshold_value
            else:
                return False
        except:
            return False
    
    async def _create_alert(self, device_id: int, device_info: dict, rule: dict, current_value):
        """创建新告警"""
        alert_id = len(self.active_alerts) + len(self.alert_history) + 1
        now = datetime.now()
        
        # 生成告警标题和消息
        title = f"{device_info.get('name', f'设备{device_id}')} - {rule['name']}"
        message = self._generate_alert_message(device_info, rule, current_value)
        
        alert = {
            "id": alert_id,
            "device_id": device_id,
            "rule_id": rule["id"],
            "title": title,
            "message": message,
            "category": rule["category"],
            "severity": rule["severity"],
            "status": AlertStatus.OPEN,
            "metric_name": rule["metric_name"],
            "current_value": current_value,
            "threshold_value": rule["threshold_value"],
            "first_occurred": now,
            "last_occurred": now,
            "occurrence_count": 1,
            "notification_count": 0,
            "escalation_level": 0,
            "created_at": now,
            "updated_at": now
        }
        
        self.active_alerts[alert_id] = alert
        
        # 添加到通知队列
        if rule.get("notification_enabled", True):
            await self._queue_notification(alert)
        
        logger.info("Alert created", 
                   alert_id=alert_id,
                   device_id=device_id,
                   rule_name=rule["name"],
                   severity=rule["severity"])
    
    def _generate_alert_message(self, device_info: dict, rule: dict, current_value) -> str:
        """生成告警消息"""
        device_name = device_info.get("name", f"设备{device_info.get('id')}")
        ip_address = device_info.get("ip_address", "Unknown")
        metric_name = rule["metric_name"]
        operator = rule["operator"]
        threshold = rule["threshold_value"]
        
        if metric_name == "connectivity.reachable":
            return f"设备 {device_name} ({ip_address}) 连通性异常，设备不可达"
        elif metric_name == "cpu_usage":
            return f"设备 {device_name} ({ip_address}) CPU使用率 {current_value}% 超过阈值 {threshold}%"
        elif metric_name == "memory_usage":
            return f"设备 {device_name} ({ip_address}) 内存使用率 {current_value}% 超过阈值 {threshold}%"
        elif metric_name == "response_time":
            return f"设备 {device_name} ({ip_address}) 响应时间 {current_value}ms 超过阈值 {threshold}ms"
        else:
            return f"设备 {device_name} ({ip_address}) {metric_name} {current_value} {operator} {threshold}"
    
    async def _queue_notification(self, alert: dict):
        """将告警加入通知队列"""
        notification = {
            "alert_id": alert["id"],
            "notification_type": "email",  # 可以扩展为多种类型
            "recipient": "admin@example.com",  # 应从配置或用户设置获取
            "subject": f"[{alert['severity'].upper()}] {alert['title']}",
            "content": alert["message"],
            "status": "pending",
            "created_at": datetime.now()
        }
        
        self.notification_queue.append(notification)
    
    async def _process_notification_queue(self):
        """处理通知队列"""
        pending_notifications = [n for n in self.notification_queue if n.get("status") == "pending"]
        
        for notification in pending_notifications[:10]:  # 每次最多处理10个通知
            try:
                await self._send_notification(notification)
                notification["status"] = "sent"
                notification["sent_at"] = datetime.now()
                
                # 更新告警的通知计数
                alert_id = notification["alert_id"]
                if alert_id in self.active_alerts:
                    self.active_alerts[alert_id]["notification_count"] += 1
                
            except Exception as e:
                notification["status"] = "failed"
                notification["error"] = str(e)
                logger.error("Failed to send notification", 
                           notification_id=notification.get("id"),
                           error=str(e))
    
    async def _send_notification(self, notification: dict):
        """发送通知（模拟实现）"""
        # 这里应该实现实际的通知发送逻辑
        # 例如：发送邮件、短信、webhook等
        
        notification_type = notification.get("notification_type")
        
        if notification_type == "email":
            # 模拟邮件发送
            await asyncio.sleep(0.1)
            logger.info("Email notification sent", 
                       recipient=notification.get("recipient"),
                       subject=notification.get("subject"))
        
        elif notification_type == "webhook":
            # 模拟webhook调用
            await asyncio.sleep(0.1)
            logger.info("Webhook notification sent", 
                       url=notification.get("webhook_url"))
    
    async def _auto_resolve_alerts(self):
        """自动解决告警"""
        resolved_alerts = []
        
        for alert_id, alert in self.active_alerts.items():
            if alert.get("status") != AlertStatus.OPEN:
                continue
            
            # 检查告警条件是否仍然满足
            device_id = alert["device_id"]
            rule_id = alert["rule_id"]
            
            rule = self.alert_rules.get(rule_id)
            if not rule or not rule.get("auto_resolve", True):
                continue
            
            # 获取当前指标
            metrics = await monitoring_service.get_device_current_metrics(device_id)
            if not metrics:
                continue
            
            metric_value = self._get_metric_value(metrics, rule["metric_name"])
            if metric_value is None:
                continue
            
            # 检查条件是否不再满足
            is_triggered = self._evaluate_condition(
                metric_value, 
                rule["operator"], 
                rule["threshold_value"]
            )
            
            if not is_triggered:
                # 自动解决告警
                alert["status"] = AlertStatus.RESOLVED
                alert["resolved_at"] = datetime.now()
                alert["resolution_note"] = "告警条件已恢复正常，自动解决"
                alert["updated_at"] = datetime.now()
                
                resolved_alerts.append(alert_id)
                
                logger.info("Alert auto-resolved", 
                           alert_id=alert_id,
                           device_id=device_id)
        
        # 移动已解决的告警到历史记录
        for alert_id in resolved_alerts:
            self.alert_history.append(self.active_alerts.pop(alert_id))
    
    async def _auto_resolve_device_alerts(self, device_id: int, rule_id: int):
        """自动解决特定设备和规则的告警"""
        resolved_alerts = []
        
        for alert_id, alert in self.active_alerts.items():
            if (alert.get("device_id") == device_id and 
                alert.get("rule_id") == rule_id and 
                alert.get("status") == AlertStatus.OPEN):
                
                alert["status"] = AlertStatus.RESOLVED
                alert["resolved_at"] = datetime.now()
                alert["resolution_note"] = "告警条件已恢复正常，自动解决"
                alert["updated_at"] = datetime.now()
                
                resolved_alerts.append(alert_id)
        
        # 移动到历史记录
        for alert_id in resolved_alerts:
            self.alert_history.append(self.active_alerts.pop(alert_id))
    
    async def acknowledge_alert(self, alert_id: int, user_id: int, note: str = None) -> bool:
        """确认告警"""
        alert = self.active_alerts.get(alert_id)
        if not alert:
            return False
        
        if alert.get("status") != AlertStatus.OPEN:
            return False
        
        alert["status"] = AlertStatus.ACKNOWLEDGED
        alert["acknowledged_at"] = datetime.now()
        alert["acknowledged_by"] = user_id
        alert["updated_at"] = datetime.now()
        
        if note:
            alert["acknowledgment_note"] = note
        
        logger.info("Alert acknowledged", 
                   alert_id=alert_id,
                   user_id=user_id)
        
        return True
    
    async def resolve_alert(self, alert_id: int, user_id: int, note: str = None) -> bool:
        """手动解决告警"""
        alert = self.active_alerts.get(alert_id)
        if not alert:
            return False
        
        alert["status"] = AlertStatus.RESOLVED
        alert["resolved_at"] = datetime.now()
        alert["resolved_by"] = user_id
        alert["updated_at"] = datetime.now()
        
        if note:
            alert["resolution_note"] = note
        
        # 移动到历史记录
        self.alert_history.append(self.active_alerts.pop(alert_id))
        
        logger.info("Alert resolved", 
                   alert_id=alert_id,
                   user_id=user_id)
        
        return True
    
    def get_active_alerts(self, device_id: int = None, severity: AlertSeverity = None) -> List[dict]:
        """获取活跃告警"""
        alerts = list(self.active_alerts.values())
        
        if device_id:
            alerts = [a for a in alerts if a.get("device_id") == device_id]
        
        if severity:
            alerts = [a for a in alerts if a.get("severity") == severity]
        
        # 按创建时间倒序排列
        alerts.sort(key=lambda x: x.get("created_at", datetime.min), reverse=True)
        
        return alerts
    
    def get_alert_statistics(self) -> dict:
        """获取告警统计信息"""
        active_alerts = list(self.active_alerts.values())
        
        total_active = len(active_alerts)
        critical_count = len([a for a in active_alerts if a.get("severity") == AlertSeverity.CRITICAL])
        warning_count = len([a for a in active_alerts if a.get("severity") == AlertSeverity.WARNING])
        info_count = len([a for a in active_alerts if a.get("severity") == AlertSeverity.INFO])
        
        # 按设备统计
        device_alert_count = {}
        for alert in active_alerts:
            device_id = alert.get("device_id")
            device_alert_count[device_id] = device_alert_count.get(device_id, 0) + 1
        
        return {
            "total_active": total_active,
            "by_severity": {
                "critical": critical_count,
                "warning": warning_count,
                "info": info_count
            },
            "by_device": device_alert_count,
            "rule_engine_running": self.rule_engine_running,
            "total_rules": len(self.alert_rules),
            "active_rules": len([r for r in self.alert_rules.values() if r.get("is_active", True)]),
            "notification_queue_size": len([n for n in self.notification_queue if n.get("status") == "pending"])
        }

# 全局告警服务实例
alert_service = AlertService()