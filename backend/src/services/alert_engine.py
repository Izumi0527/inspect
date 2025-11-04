"""
告警规则引擎和通知系统
"""
import asyncio
import uuid
from typing import Dict, List, Optional, Any, Callable
from datetime import datetime, timezone, timedelta
from enum import Enum
from dataclasses import dataclass, field
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import structlog

from src.core.config import settings
from src.core.database import get_db_session_context
from src.repositories.device_repository import DeviceRepository
from src.api.websocket import ws_notifier
from src.core.influxdb import record_user_activity
from src.services.cache_service import cache_service

logger = structlog.get_logger()


class AlertSeverity(str, Enum):
    """告警严重级别"""
    INFO = "info"
    WARNING = "warning"
    CRITICAL = "critical"
    EMERGENCY = "emergency"


class AlertStatus(str, Enum):
    """告警状态"""
    ACTIVE = "active"
    ACKNOWLEDGED = "acknowledged"
    RESOLVED = "resolved"
    SUPPRESSED = "suppressed"


class RuleCondition(str, Enum):
    """规则条件类型"""
    GREATER_THAN = "gt"
    LESS_THAN = "lt"
    EQUAL = "eq"
    NOT_EQUAL = "ne"
    CONTAINS = "contains"
    NOT_CONTAINS = "not_contains"


@dataclass
class AlertRule:
    """告警规则模型"""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    name: str = ""
    description: str = ""
    enabled: bool = True
    severity: AlertSeverity = AlertSeverity.WARNING
    
    # 规则条件
    metric_name: str = ""  # 监控指标名称，如 "device_status", "cpu_usage"
    condition: RuleCondition = RuleCondition.GREATER_THAN
    threshold: float = 0.0
    duration: int = 300  # 持续时间（秒）
    
    # 通知配置
    notify_email: bool = True
    notify_websocket: bool = True
    email_recipients: List[str] = field(default_factory=list)
    
    # 抑制配置
    cooldown_minutes: int = 30  # 冷却时间（分钟）
    
    # 创建和更新时间
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    
    # 运行时状态
    last_triggered: Optional[datetime] = None
    trigger_count: int = 0


@dataclass
class Alert:
    """告警实例模型"""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    rule_id: str = ""
    rule_name: str = ""
    severity: AlertSeverity = AlertSeverity.WARNING
    status: AlertStatus = AlertStatus.ACTIVE
    
    # 告警内容
    title: str = ""
    message: str = ""
    details: Dict[str, Any] = field(default_factory=dict)
    
    # 相关对象
    device_id: Optional[int] = None
    device_name: Optional[str] = None
    device_ip: Optional[str] = None
    
    # 时间信息
    triggered_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    acknowledged_at: Optional[datetime] = None
    resolved_at: Optional[datetime] = None
    
    # 处理信息
    acknowledged_by: Optional[str] = None
    resolved_by: Optional[str] = None
    notes: List[str] = field(default_factory=list)


class EmailNotifier:
    """邮件通知器"""
    
    def __init__(self):
        self.smtp_host = getattr(settings, 'SMTP_HOST', 'localhost')
        self.smtp_port = getattr(settings, 'SMTP_PORT', 587)
        self.smtp_user = getattr(settings, 'SMTP_USER', '')
        self.smtp_password = getattr(settings, 'SMTP_PASSWORD', '')
        self.from_email = getattr(settings, 'FROM_EMAIL', 'noreply@inspect.local')
        self.from_name = getattr(settings, 'FROM_NAME', '网络设备巡检系统')
        
        self.enabled = bool(self.smtp_host and self.smtp_user)
    
    async def send_alert_email(self, alert: Alert, recipients: List[str]) -> bool:
        """发送告警邮件"""
        if not self.enabled or not recipients:
            return False
        
        try:
            # 构建邮件内容
            subject = f"[{alert.severity.upper()}] {alert.title}"
            
            html_content = self._build_alert_email_html(alert)
            text_content = self._build_alert_email_text(alert)
            
            # 创建邮件消息
            msg = MIMEMultipart('alternative')
            msg['Subject'] = subject
            msg['From'] = f"{self.from_name} <{self.from_email}>"
            msg['To'] = ', '.join(recipients)
            
            # 添加文本和HTML部分
            text_part = MIMEText(text_content, 'plain', 'utf-8')
            html_part = MIMEText(html_content, 'html', 'utf-8')
            
            msg.attach(text_part)
            msg.attach(html_part)
            
            # 发送邮件
            with smtplib.SMTP(self.smtp_host, self.smtp_port) as server:
                if self.smtp_user:
                    server.starttls()
                    server.login(self.smtp_user, self.smtp_password)
                
                server.send_message(msg)
            
            logger.info(
                "Alert email sent successfully",
                alert_id=alert.id,
                recipients=recipients,
                subject=subject
            )
            
            return True
            
        except Exception as e:
            logger.error(
                "Failed to send alert email",
                alert_id=alert.id,
                recipients=recipients,
                error=str(e)
            )
            return False
    
    def _build_alert_email_html(self, alert: Alert) -> str:
        """构建HTML格式邮件内容"""
        severity_colors = {
            AlertSeverity.INFO: "#17a2b8",
            AlertSeverity.WARNING: "#ffc107",
            AlertSeverity.CRITICAL: "#dc3545",
            AlertSeverity.EMERGENCY: "#6f42c1"
        }
        
        color = severity_colors.get(alert.severity, "#6c757d")
        
        device_info = ""
        if alert.device_name:
            device_info = f"""
            <tr>
                <td><strong>设备名称:</strong></td>
                <td>{alert.device_name}</td>
            </tr>
            <tr>
                <td><strong>设备IP:</strong></td>
                <td>{alert.device_ip}</td>
            </tr>
            """
        
        details_info = ""
        if alert.details:
            details_rows = ""
            for key, value in alert.details.items():
                details_rows += f"""
                <tr>
                    <td><strong>{key}:</strong></td>
                    <td>{value}</td>
                </tr>
                """
            details_info = f"""
            <tr>
                <td colspan="2"><strong>详细信息:</strong></td>
            </tr>
            {details_rows}
            """
        
        return f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <title>告警通知</title>
        </head>
        <body style="font-family: Arial, sans-serif; margin: 0; padding: 20px; background-color: #f5f5f5;">
            <div style="max-width: 600px; margin: 0 auto; background-color: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
                <div style="background-color: {color}; color: white; padding: 20px; text-align: center;">
                    <h1 style="margin: 0; font-size: 24px;">[{alert.severity.upper()}] 告警通知</h1>
                    <p style="margin: 10px 0 0 0; font-size: 16px;">{alert.title}</p>
                </div>
                
                <div style="padding: 30px;">
                    <table style="width: 100%; border-collapse: collapse;">
                        <tr>
                            <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>告警规则:</strong></td>
                            <td style="padding: 8px 0; border-bottom: 1px solid #eee;">{alert.rule_name}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>严重级别:</strong></td>
                            <td style="padding: 8px 0; border-bottom: 1px solid #eee; color: {color}; font-weight: bold;">{alert.severity.upper()}</td>
                        </tr>
                        <tr>
                            <td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>触发时间:</strong></td>
                            <td style="padding: 8px 0; border-bottom: 1px solid #eee;">{alert.triggered_at.strftime('%Y-%m-%d %H:%M:%S')}</td>
                        </tr>
                        {device_info}
                        {details_info}
                    </table>
                    
                    <div style="margin-top: 30px; padding: 20px; background-color: #f8f9fa; border-radius: 4px;">
                        <h3 style="margin: 0 0 10px 0; color: #495057;">告警描述</h3>
                        <p style="margin: 0; line-height: 1.6; color: #6c757d;">{alert.message}</p>
                    </div>
                    
                    <div style="margin-top: 30px; text-align: center; font-size: 14px; color: #6c757d;">
                        <p>此邮件由网络设备巡检系统自动发送，请勿回复。</p>
                        <p>告警ID: {alert.id}</p>
                    </div>
                </div>
            </div>
        </body>
        </html>
        """
    
    def _build_alert_email_text(self, alert: Alert) -> str:
        """构建文本格式邮件内容"""
        device_info = ""
        if alert.device_name:
            device_info = f"""
设备名称: {alert.device_name}
设备IP: {alert.device_ip}
"""
        
        details_info = ""
        if alert.details:
            details_info = "\n详细信息:\n"
            for key, value in alert.details.items():
                details_info += f"{key}: {value}\n"
        
        return f"""
[{alert.severity.upper()}] 告警通知

告警标题: {alert.title}
告警规则: {alert.rule_name}
严重级别: {alert.severity.upper()}
触发时间: {alert.triggered_at.strftime('%Y-%m-%d %H:%M:%S')}
{device_info}
告警描述:
{alert.message}
{details_info}
告警ID: {alert.id}

此邮件由网络设备巡检系统自动发送，请勿回复。
        """.strip()


class AlertEngine:
    """告警引擎"""
    
    def __init__(self):
        self.rules: Dict[str, AlertRule] = {}
        self.alerts: Dict[str, Alert] = {}
        self.rule_states: Dict[str, Dict] = {}  # 规则状态跟踪
        self.email_notifier = EmailNotifier()
        self.is_running = False
        self.evaluation_task: Optional[asyncio.Task] = None
        self.evaluation_interval = 60  # 评估间隔（秒）
        
        # 升级服务将在启动时初始化，避免循环导入
        self.escalation_service = None
    
    async def start(self):
        """启动告警引擎"""
        if self.is_running:
            logger.info("Alert engine already running")
            return
        
        self.is_running = True
        
        # 初始化升级服务（避免循环导入）
        if self.escalation_service is None:
            try:
                from src.services.alert_escalation_service import alert_escalation_service
                self.escalation_service = alert_escalation_service
                await self.escalation_service.start()
            except ImportError:
                logger.warning("Alert escalation service not available")
        
        # 注册默认告警规则
        await self._register_default_rules()
        
        # 启动规则评估循环
        self.evaluation_task = asyncio.create_task(self._evaluation_loop())
        
        logger.info("Alert engine started successfully")
    
    async def stop(self):
        """停止告警引擎"""
        self.is_running = False
        
        if self.evaluation_task:
            self.evaluation_task.cancel()
            try:
                await self.evaluation_task
            except asyncio.CancelledError:
                pass
        
        # 停止升级服务
        if self.escalation_service:
            await self.escalation_service.stop()
        
        logger.info("Alert engine stopped")
    
    async def _register_default_rules(self):
        """注册默认告警规则"""
        default_rules = [
            AlertRule(
                id="device_offline",
                name="设备离线告警",
                description="设备状态变为离线时触发告警",
                severity=AlertSeverity.CRITICAL,
                metric_name="device_status",
                condition=RuleCondition.EQUAL,
                threshold=0,  # 0表示离线
                duration=60,  # 持续1分钟
                cooldown_minutes=10,
                email_recipients=["admin@example.com"]
            ),
            AlertRule(
                id="high_cpu_usage",
                name="CPU使用率过高",
                description="设备CPU使用率超过90%时触发告警",
                severity=AlertSeverity.WARNING,
                metric_name="cpu_usage",
                condition=RuleCondition.GREATER_THAN,
                threshold=90.0,
                duration=300,  # 持续5分钟
                cooldown_minutes=30,
                email_recipients=["admin@example.com"]
            ),
            AlertRule(
                id="high_memory_usage",
                name="内存使用率过高", 
                description="设备内存使用率超过95%时触发告警",
                severity=AlertSeverity.CRITICAL,
                metric_name="memory_usage",
                condition=RuleCondition.GREATER_THAN,
                threshold=95.0,
                duration=180,  # 持续3分钟
                cooldown_minutes=15,
                email_recipients=["admin@example.com"]
            ),
            AlertRule(
                id="low_disk_space",
                name="磁盘空间不足",
                description="设备磁盘使用率超过90%时触发告警",
                severity=AlertSeverity.WARNING,
                metric_name="disk_usage",
                condition=RuleCondition.GREATER_THAN,
                threshold=90.0,
                duration=600,  # 持续10分钟
                cooldown_minutes=60,
                email_recipients=["admin@example.com"]
            ),
            AlertRule(
                id="slow_response_time",
                name="响应时间过长",
                description="设备响应时间超过1000ms时触发告警",
                severity=AlertSeverity.WARNING,
                metric_name="response_time",
                condition=RuleCondition.GREATER_THAN,
                threshold=1000.0,
                duration=300,
                cooldown_minutes=20,
                email_recipients=["admin@example.com"]
            )
        ]
        
        for rule in default_rules:
            self.rules[rule.id] = rule
            self.rule_states[rule.id] = {
                "triggered_at": None,
                "last_value": None,
                "condition_met": False
            }
        
        logger.info(f"Registered {len(default_rules)} default alert rules")
    
    async def _evaluation_loop(self):
        """告警规则评估循环"""
        while self.is_running:
            try:
                await self._evaluate_all_rules()
                await asyncio.sleep(self.evaluation_interval)
                
            except Exception as e:
                logger.error("Error in alert evaluation loop", error=str(e))
                await asyncio.sleep(10)  # 发生错误时短暂等待
    
    async def _evaluate_all_rules(self):
        """评估所有告警规则（优化版本 - 减少重复查询）"""
        # 一次性获取所有活跃设备并缓存
        active_devices = await self._get_cached_active_devices()
        if not active_devices:
            return
        
        # 批量获取所有需要的指标值
        all_metrics = await self._get_all_metric_values_batch(active_devices)
        
        # 对每个规则进行评估
        for rule_id, rule in self.rules.items():
            if not rule.enabled:
                continue
            
            try:
                metric_values = all_metrics.get(rule.metric_name, {})
                await self._evaluate_rule_with_values(rule, metric_values)
            except Exception as e:
                logger.error(
                    "Error evaluating alert rule",
                    rule_id=rule_id,
                    error=str(e)
                )
    
    async def _get_cached_active_devices(self):
        """获取缓存的活跃设备列表（复用缓存服务的实现）"""
        try:
            # 首先尝试从通用缓存获取
            cached_devices = await cache_service.get_cached_active_devices()
            if cached_devices:
                logger.debug(f"Using shared cached active devices: {len(cached_devices)} devices")
                return cached_devices
            
            # 缓存未命中，从数据库查询并缓存
            logger.debug("Cache miss for active devices, querying database")
            async with get_db_session_context() as session:
                device_repo = DeviceRepository(session)
                devices, _ = await device_repo.get_devices_paginated(
                    page=1, page_size=1000, is_active=True
                )
            
            # 转换为简化的设备信息
            device_list = [
                {
                    "id": device.id,
                    "name": device.name,
                    "ip_address": device.ip_address,
                    "device_type": device.device_type,
                    "is_active": device.is_active,
                    "is_monitored": device.is_monitored
                }
                for device in devices
            ]
            
            # 使用共享缓存方法，TTL为5分钟
            await cache_service.cache_active_devices(device_list, expire=300)
            logger.debug(f"Cached {len(device_list)} active devices for alert engine")
            
            return device_list
            
        except Exception as e:
            logger.error("Error getting cached active devices", error=str(e))
            return []
    
    async def _get_all_metric_values_batch(self, active_devices) -> Dict[str, Dict[int, Any]]:
        """批量获取所有指标值"""
        all_metrics = {}
        
        try:
            # 获取设备状态指标
            device_status_metrics = {}
            for device in active_devices:
                device_id = device["id"]
                status_data = await cache_service.get_cached_device_status(device_id)
                if status_data:
                    # 1表示在线，0表示离线
                    device_status_metrics[device_id] = 1 if status_data.get("status") == "online" else 0
            all_metrics["device_status"] = device_status_metrics
            
            # 生成其他指标的模拟数据（在实际项目中，这里应该从InfluxDB批量查询）
            import random
            
            cpu_metrics = {}
            memory_metrics = {}
            disk_metrics = {}
            response_time_metrics = {}
            
            for device in active_devices:
                device_id = device["id"]
                cpu_metrics[device_id] = random.uniform(10, 95)
                memory_metrics[device_id] = random.uniform(20, 98)
                disk_metrics[device_id] = random.uniform(30, 95)
                response_time_metrics[device_id] = random.uniform(10, 2000)
            
            all_metrics.update({
                "cpu_usage": cpu_metrics,
                "memory_usage": memory_metrics,
                "disk_usage": disk_metrics,
                "response_time": response_time_metrics
            })
            
            logger.debug(f"Batch collected metrics for {len(active_devices)} devices")
            
        except Exception as e:
            logger.error("Error getting metric values batch", error=str(e))
        
        return all_metrics
    
    async def _evaluate_rule_with_values(self, rule: AlertRule, metric_values: Dict[int, Any]):
        """使用预获取的指标值评估告警规则"""
        current_time = datetime.now(timezone.utc)
        
        # 检查冷却时间
        if rule.last_triggered:
            cooldown_end = rule.last_triggered + timedelta(minutes=rule.cooldown_minutes)
            if current_time < cooldown_end:
                return
        
        rule_state = self.rule_states[rule.id]
        
        for device_id, value in metric_values.items():
            # 检查条件是否满足
            condition_met = self._check_condition(rule.condition, value, rule.threshold)
            
            if condition_met:
                # 条件满足
                if rule_state["triggered_at"] is None:
                    # 第一次满足条件，记录时间
                    rule_state["triggered_at"] = current_time
                    rule_state["condition_met"] = True
                    rule_state["last_value"] = value
                
                elif rule_state["condition_met"]:
                    # 检查持续时间
                    duration = (current_time - rule_state["triggered_at"]).total_seconds()
                    
                    if duration >= rule.duration:
                        # 达到持续时间，触发告警
                        await self._trigger_alert(rule, device_id, value)
                        
                        # 重置状态
                        rule_state["triggered_at"] = None
                        rule_state["condition_met"] = False
            
            else:
                # 条件不满足，重置状态
                if rule_state["condition_met"]:
                    rule_state["triggered_at"] = None
                    rule_state["condition_met"] = False
    
    
    def _check_condition(self, condition: RuleCondition, value: Any, threshold: Any) -> bool:
        """检查条件是否满足"""
        try:
            if condition == RuleCondition.GREATER_THAN:
                return float(value) > float(threshold)
            elif condition == RuleCondition.LESS_THAN:
                return float(value) < float(threshold)
            elif condition == RuleCondition.EQUAL:
                return value == threshold
            elif condition == RuleCondition.NOT_EQUAL:
                return value != threshold
            elif condition == RuleCondition.CONTAINS:
                return str(threshold) in str(value)
            elif condition == RuleCondition.NOT_CONTAINS:
                return str(threshold) not in str(value)
            else:
                return False
        except (ValueError, TypeError):
            return False
    
    
    async def _trigger_alert(self, rule: AlertRule, device_id: int, metric_value: Any):
        """触发告警"""
        try:
            # 获取设备信息
            device_name = None
            device_ip = None

            async with get_db_session_context() as session:
                device_repo = DeviceRepository(session)
                device = await device_repo.get_device_by_id(device_id)
                if device:
                    device_name = device.name
                    device_ip = device.ip_address
            
            # 创建告警实例
            alert = Alert(
                rule_id=rule.id,
                rule_name=rule.name,
                severity=rule.severity,
                title=f"{rule.name} - {device_name or f'设备{device_id}'}",
                message=f"{rule.description}\n当前值: {metric_value}，阈值: {rule.threshold}",
                device_id=device_id,
                device_name=device_name,
                device_ip=device_ip,
                details={
                    "metric_name": rule.metric_name,
                    "current_value": metric_value,
                    "threshold": rule.threshold,
                    "condition": rule.condition.value
                }
            )
            
            # 保存告警
            self.alerts[alert.id] = alert
            
            # 创建告警升级
            if self.escalation_service:
                try:
                    escalation_id = await self.escalation_service.create_escalation(
                        alert.id, alert.severity
                    )
                    if escalation_id:
                        logger.info("Alert escalation created", 
                                   alert_id=alert.id, 
                                   escalation_id=escalation_id)
                except Exception as e:
                    logger.error("Failed to create alert escalation", 
                                alert_id=alert.id, 
                                error=str(e))
            
            # 发送WebSocket通知
            if rule.notify_websocket:
                await ws_notifier.notify_alert(
                    rule.id,
                    rule.severity.value,
                    alert.title,
                    alert_id=alert.id,
                    device_id=device_id,
                    device_name=device_name,
                    device_ip=device_ip,
                    metric_name=rule.metric_name,
                    current_value=metric_value,
                    threshold=rule.threshold
                )
            
            # 发送邮件通知
            if rule.notify_email and rule.email_recipients:
                email_sent = await self.email_notifier.send_alert_email(
                    alert, rule.email_recipients
                )
                
                if email_sent:
                    logger.info("Alert email notification sent", alert_id=alert.id)
                else:
                    logger.warning("Failed to send alert email", alert_id=alert.id)
            
            # 更新规则统计
            rule.last_triggered = datetime.now(timezone.utc)
            rule.trigger_count += 1
            rule.updated_at = datetime.now(timezone.utc)
            
            # 记录用户活动
            await record_user_activity(
                user_id="system",
                action="alert_triggered",
                resource="alert_engine",
                details={
                    "alert_id": alert.id,
                    "rule_id": rule.id,
                    "device_id": device_id,
                    "severity": rule.severity.value
                }
            )
            
            logger.info(
                "Alert triggered",
                alert_id=alert.id,
                rule_id=rule.id,
                device_id=device_id,
                severity=rule.severity.value
            )
            
        except Exception as e:
            logger.error(
                "Error triggering alert",
                rule_id=rule.id,
                device_id=device_id,
                error=str(e)
            )
    
    # 管理接口
    async def add_rule(self, rule: AlertRule) -> bool:
        """添加告警规则"""
        try:
            self.rules[rule.id] = rule
            self.rule_states[rule.id] = {
                "triggered_at": None,
                "last_value": None,
                "condition_met": False
            }
            
            logger.info("Alert rule added", rule_id=rule.id, rule_name=rule.name)
            return True
            
        except Exception as e:
            logger.error("Failed to add alert rule", rule_id=rule.id, error=str(e))
            return False
    
    async def remove_rule(self, rule_id: str) -> bool:
        """删除告警规则"""
        try:
            if rule_id in self.rules:
                del self.rules[rule_id]
                if rule_id in self.rule_states:
                    del self.rule_states[rule_id]
                
                logger.info("Alert rule removed", rule_id=rule_id)
                return True
            return False
            
        except Exception as e:
            logger.error("Failed to remove alert rule", rule_id=rule_id, error=str(e))
            return False
    
    async def acknowledge_alert(self, alert_id: str, user_id: str, notes: Optional[str] = None) -> bool:
        """确认告警"""
        if alert_id not in self.alerts:
            return False
        
        alert = self.alerts[alert_id]
        alert.status = AlertStatus.ACKNOWLEDGED
        alert.acknowledged_at = datetime.now(timezone.utc)
        alert.acknowledged_by = user_id
        
        if notes:
            alert.notes.append(f"[{datetime.now(timezone.utc)}] 确认: {notes}")
        
        # 取消告警升级
        if self.escalation_service:
            try:
                await self.escalation_service.cancel_escalation(
                    alert_id, f"用户{user_id}已确认告警"
                )
            except Exception as e:
                logger.error("Failed to cancel alert escalation", 
                           alert_id=alert_id, 
                           error=str(e))
        
        logger.info("Alert acknowledged", alert_id=alert_id, user_id=user_id)
        return True
    
    async def resolve_alert(self, alert_id: str, user_id: str, notes: Optional[str] = None) -> bool:
        """解决告警"""
        if alert_id not in self.alerts:
            return False
        
        alert = self.alerts[alert_id]
        alert.status = AlertStatus.RESOLVED
        alert.resolved_at = datetime.now(timezone.utc)
        alert.resolved_by = user_id
        
        if notes:
            alert.notes.append(f"[{datetime.now(timezone.utc)}] 解决: {notes}")
        
        # 取消告警升级
        if self.escalation_service:
            try:
                await self.escalation_service.cancel_escalation(
                    alert_id, f"用户{user_id}已解决告警"
                )
            except Exception as e:
                logger.error("Failed to cancel alert escalation", 
                           alert_id=alert_id, 
                           error=str(e))
        
        logger.info("Alert resolved", alert_id=alert_id, user_id=user_id)
        return True
    
    async def get_alerts(
        self, 
        status: Optional[AlertStatus] = None,
        severity: Optional[AlertSeverity] = None,
        limit: int = 100
    ) -> List[Alert]:
        """获取告警列表"""
        alerts = list(self.alerts.values())
        
        # 过滤条件
        if status:
            alerts = [a for a in alerts if a.status == status]
        if severity:
            alerts = [a for a in alerts if a.severity == severity]
        
        # 按时间排序（最新的在前）
        alerts.sort(key=lambda a: a.triggered_at, reverse=True)
        
        return alerts[:limit]
    
    async def get_alert_stats(self) -> Dict[str, Any]:
        """获取告警统计信息"""
        total_alerts = len(self.alerts)
        active_alerts = len([a for a in self.alerts.values() if a.status == AlertStatus.ACTIVE])
        
        severity_counts = {}
        for severity in AlertSeverity:
            severity_counts[severity.value] = len([
                a for a in self.alerts.values() if a.severity == severity
            ])
        
        # 获取升级统计信息
        escalation_stats = {}
        if self.escalation_service:
            try:
                escalation_stats = await self.escalation_service.get_escalation_statistics()
            except Exception as e:
                logger.error("Failed to get escalation statistics", error=str(e))
        
        return {
            "total_alerts": total_alerts,
            "active_alerts": active_alerts,
            "severity_distribution": severity_counts,
            "total_rules": len(self.rules),
            "enabled_rules": len([r for r in self.rules.values() if r.enabled]),
            "is_running": self.is_running,
            "email_enabled": self.email_notifier.enabled,
            "escalation_stats": escalation_stats
        }


# 全局告警引擎实例
alert_engine = AlertEngine()