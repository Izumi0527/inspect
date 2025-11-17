"""
告警升级服务
实现告警自动升级、多级通知和升级历史记录功能
"""

from __future__ import annotations

import asyncio
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone, timedelta
from enum import Enum
from typing import Dict, List, Optional, Any, Set, TYPE_CHECKING
import structlog

from src.models.alert import AlertSeverity, AlertStatus
from src.core.database import get_db_session
from src.core.influxdb import record_user_activity

if TYPE_CHECKING:
    from src.services.alert_engine import Alert, AlertRule

logger = structlog.get_logger()


class EscalationLevel(str, Enum):
    """升级级别"""
    LEVEL_1 = "level_1"  # 一级：初始通知
    LEVEL_2 = "level_2"  # 二级：督办人员
    LEVEL_3 = "level_3"  # 三级：管理人员
    LEVEL_4 = "level_4"  # 四级：高级管理


class NotificationChannel(str, Enum):
    """通知渠道"""
    EMAIL = "email"
    SMS = "sms"
    WEBHOOK = "webhook"
    WEBSOCKET = "websocket"
    VOICE = "voice"


@dataclass
class EscalationRule:
    """升级规则配置"""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    name: str = ""
    severity: AlertSeverity = AlertSeverity.WARNING
    escalation_enabled: bool = True
    
    # 升级时间配置（秒）
    level_1_timeout: int = 1800  # 30分钟
    level_2_timeout: int = 3600  # 1小时
    level_3_timeout: int = 7200  # 2小时
    level_4_timeout: int = 14400  # 4小时
    
    # 升级条件
    auto_severity_upgrade: bool = True  # 自动提升严重级别
    max_severity: AlertSeverity = AlertSeverity.FATAL
    
    # 通知配置
    notification_channels: List[NotificationChannel] = field(default_factory=lambda: [
        NotificationChannel.EMAIL, NotificationChannel.WEBSOCKET
    ])
    
    # 收件人配置（按级别）
    level_1_recipients: List[str] = field(default_factory=lambda: ["admin@example.com"])
    level_2_recipients: List[str] = field(default_factory=lambda: ["supervisor@example.com"])
    level_3_recipients: List[str] = field(default_factory=lambda: ["manager@example.com"])
    level_4_recipients: List[str] = field(default_factory=lambda: ["director@example.com"])
    
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class AlertEscalation:
    """告警升级实例"""
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    alert_id: str = ""
    rule_id: str = ""
    current_level: EscalationLevel = EscalationLevel.LEVEL_1
    next_escalation_time: Optional[datetime] = None
    escalation_history: List[Dict[str, Any]] = field(default_factory=list)
    is_active: bool = True
    
    created_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


class AlertEscalationService:
    """告警升级服务"""
    
    def __init__(self):
        self.escalation_rules: Dict[str, EscalationRule] = {}
        self.active_escalations: Dict[str, AlertEscalation] = {}
        self.is_running = False
        self.escalation_task: Optional[asyncio.Task] = None
        self.check_interval = 60  # 检查间隔（秒）
        self.logger = logger.bind(component="alert_escalation_service")
        self._alert_engine = None
        self._ws_notifier = None
        
        # 注册默认升级规则
        self._register_default_escalation_rules()

    def _get_alert_engine(self):
        """延迟导入告警引擎以避免循环依赖"""
        if self._alert_engine is None:
            from src.services.alert_engine import alert_engine  # noqa: WPS433
            self._alert_engine = alert_engine
        return self._alert_engine
    
    def _get_ws_notifier(self):
        """延迟导入 WebSocket 通知器以避免循环依赖"""
        if self._ws_notifier is None:
            from src.api.websocket import ws_notifier  # noqa: WPS433
            self._ws_notifier = ws_notifier
        return self._ws_notifier
    
    def _register_default_escalation_rules(self):
        """注册默认升级规则"""
        default_rules = [
            EscalationRule(
                id="critical_escalation",
                name="严重告警升级",
                severity=AlertSeverity.CRITICAL,
                level_1_timeout=900,   # 15分钟
                level_2_timeout=1800,  # 30分钟
                level_3_timeout=3600,  # 1小时
                level_4_timeout=7200,  # 2小时
                auto_severity_upgrade=True,
                max_severity=AlertSeverity.FATAL
            ),
            EscalationRule(
                id="warning_escalation",
                name="警告告警升级",
                severity=AlertSeverity.WARNING,
                level_1_timeout=1800,  # 30分钟
                level_2_timeout=3600,  # 1小时
                level_3_timeout=7200,  # 2小时
                level_4_timeout=14400, # 4小时
                auto_severity_upgrade=False
            ),
            EscalationRule(
                id="emergency_escalation",
                name="紧急告警升级",
                severity=AlertSeverity.FATAL,
                level_1_timeout=300,   # 5分钟
                level_2_timeout=600,   # 10分钟
                level_3_timeout=1200,  # 20分钟
                level_4_timeout=1800,  # 30分钟
                auto_severity_upgrade=False
            )
        ]
        
        for rule in default_rules:
            self.escalation_rules[rule.id] = rule
    
    async def start(self):
        """启动升级服务"""
        if self.is_running:
            self.logger.info("Alert escalation service already running")
            return
        
        self.is_running = True
        self.escalation_task = asyncio.create_task(self._escalation_loop())
        self.logger.info("Alert escalation service started")
    
    async def stop(self):
        """停止升级服务"""
        self.is_running = False
        
        if self.escalation_task:
            self.escalation_task.cancel()
            try:
                await self.escalation_task
            except asyncio.CancelledError:
                pass
        
        self.logger.info("Alert escalation service stopped")
    
    async def _escalation_loop(self):
        """升级检查循环"""
        while self.is_running:
            try:
                await self._process_escalations()
                await asyncio.sleep(self.check_interval)
            except Exception as e:
                self.logger.error("Error in escalation loop", error=str(e))
                await asyncio.sleep(30)  # 出错时短暂等待
    
    async def _process_escalations(self):
        """处理待升级的告警"""
        current_time = datetime.now(timezone.utc)
        escalations_to_remove = []
        
        for escalation_id, escalation in self.active_escalations.items():
            try:
                if not escalation.is_active:
                    continue
                
                # 检查告警是否仍然活跃
                alert = self._get_alert_engine().alerts.get(escalation.alert_id)
                if not alert or alert.status != AlertStatus.ACTIVE:
                    # 告警已解决或不存在，停止升级
                    escalation.is_active = False
                    escalations_to_remove.append(escalation_id)
                    continue
                
                # 检查是否需要升级
                if (escalation.next_escalation_time and 
                    current_time >= escalation.next_escalation_time):
                    await self._escalate_alert(escalation, alert)
                    
            except Exception as e:
                self.logger.error(
                    "Error processing escalation",
                    escalation_id=escalation_id,
                    error=str(e)
                )
        
        # 清理已完成的升级
        for escalation_id in escalations_to_remove:
            del self.active_escalations[escalation_id]
    
    async def _escalate_alert(self, escalation: AlertEscalation, alert: Alert):
        """执行告警升级"""
        rule = self.escalation_rules.get(escalation.rule_id)
        if not rule:
            self.logger.error("Escalation rule not found", rule_id=escalation.rule_id)
            return
        
        current_level = escalation.current_level
        next_level = self._get_next_level(current_level)
        
        if not next_level:
            # 已达到最高级别，停止升级
            escalation.is_active = False
            self.logger.info("Alert escalation reached maximum level", alert_id=alert.id)
            return
        
        try:
            # 记录升级历史
            escalation_record = {
                "from_level": current_level.value,
                "to_level": next_level.value,
                "escalated_at": datetime.now(timezone.utc).isoformat(),
                "reason": f"未在{self._get_timeout_for_level(rule, current_level)}秒内确认"
            }
            escalation.escalation_history.append(escalation_record)
            
            # 更新升级级别
            escalation.current_level = next_level
            escalation.next_escalation_time = self._calculate_next_escalation_time(rule, next_level)
            escalation.updated_at = datetime.now(timezone.utc)
            
            # 自动提升告警严重级别
            if rule.auto_severity_upgrade and alert.severity != rule.max_severity:
                old_severity = alert.severity
                new_severity = self._upgrade_severity(alert.severity, rule.max_severity)
                if new_severity != old_severity:
                    alert.severity = new_severity
                    escalation_record["severity_upgraded"] = {
                        "from": old_severity.value,
                        "to": new_severity.value
                    }
            
            # 发送升级通知
            await self._send_escalation_notifications(escalation, alert, rule, next_level)
            
            # 发送WebSocket通知
            notifier = self._get_ws_notifier()
            await notifier.notify_alert_escalation(
                alert_id=alert.id,
                from_level=current_level.value,
                to_level=next_level.value,
                severity=alert.severity.value,
                message=f"告警已升级到{next_level.value}级别"
            )
            
            # 记录活动日志
            await record_user_activity(
                user_id="system",
                action="alert_escalated",
                resource="alert_escalation",
                details={
                    "alert_id": alert.id,
                    "escalation_id": escalation.id,
                    "from_level": current_level.value,
                    "to_level": next_level.value,
                    "auto_escalated": True
                }
            )
            
            self.logger.info(
                "Alert escalated successfully",
                alert_id=alert.id,
                from_level=current_level.value,
                to_level=next_level.value
            )
            
        except Exception as e:
            self.logger.error(
                "Failed to escalate alert",
                alert_id=alert.id,
                escalation_id=escalation.id,
                error=str(e)
            )
    
    def _get_next_level(self, current_level: EscalationLevel) -> Optional[EscalationLevel]:
        """获取下一个升级级别"""
        level_progression = [
            EscalationLevel.LEVEL_1,
            EscalationLevel.LEVEL_2,
            EscalationLevel.LEVEL_3,
            EscalationLevel.LEVEL_4
        ]
        
        try:
            current_index = level_progression.index(current_level)
            if current_index < len(level_progression) - 1:
                return level_progression[current_index + 1]
        except ValueError:
            pass
        
        return None
    
    def _get_timeout_for_level(self, rule: EscalationRule, level: EscalationLevel) -> int:
        """获取指定级别的超时时间"""
        timeout_mapping = {
            EscalationLevel.LEVEL_1: rule.level_1_timeout,
            EscalationLevel.LEVEL_2: rule.level_2_timeout,
            EscalationLevel.LEVEL_3: rule.level_3_timeout,
            EscalationLevel.LEVEL_4: rule.level_4_timeout
        }
        return timeout_mapping.get(level, rule.level_1_timeout)
    
    def _calculate_next_escalation_time(
        self, 
        rule: EscalationRule, 
        level: EscalationLevel
    ) -> Optional[datetime]:
        """计算下一次升级时间"""
        timeout = self._get_timeout_for_level(rule, level)
        if timeout > 0:
            return datetime.now(timezone.utc) + timedelta(seconds=timeout)
        return None
    
    def _upgrade_severity(self, current: AlertSeverity, max_severity: AlertSeverity) -> AlertSeverity:
        """升级告警严重级别"""
        severity_progression = [
            AlertSeverity.INFO,
            AlertSeverity.WARNING,
            AlertSeverity.CRITICAL,
            AlertSeverity.FATAL
        ]
        
        try:
            current_index = severity_progression.index(current)
            max_index = severity_progression.index(max_severity)
            
            if current_index < max_index:
                return severity_progression[current_index + 1]
        except ValueError:
            pass
        
        return current
    
    async def _send_escalation_notifications(
        self,
        escalation: AlertEscalation,
        alert: Alert,
        rule: EscalationRule,
        level: EscalationLevel
    ):
        """发送升级通知"""
        recipients = self._get_recipients_for_level(rule, level)
        
        if NotificationChannel.EMAIL in rule.notification_channels and recipients:
            # 构建升级邮件内容
            subject = f"[升级通知-{level.value.upper()}] {alert.title}"
            message = f"""
告警已自动升级到{level.value}级别

告警信息：
- 标题：{alert.title}
- 当前级别：{level.value}
- 严重程度：{alert.severity.value}
- 设备：{alert.device_name} ({alert.device_ip})
- 触发时间：{alert.triggered_at.strftime('%Y-%m-%d %H:%M:%S')}

升级历史：
{self._format_escalation_history(escalation.escalation_history)}

请及时处理此告警。
"""
            
            # 发送邮件通知
            if alert_engine.email_notifier:
                await alert_engine.email_notifier.send_alert_email(
                    self._create_escalation_alert(alert, level, message),
                    recipients
                )
    
    def _get_recipients_for_level(self, rule: EscalationRule, level: EscalationLevel) -> List[str]:
        """获取指定级别的收件人"""
        recipient_mapping = {
            EscalationLevel.LEVEL_1: rule.level_1_recipients,
            EscalationLevel.LEVEL_2: rule.level_2_recipients,
            EscalationLevel.LEVEL_3: rule.level_3_recipients,
            EscalationLevel.LEVEL_4: rule.level_4_recipients
        }
        return recipient_mapping.get(level, [])
    
    def _format_escalation_history(self, history: List[Dict[str, Any]]) -> str:
        """格式化升级历史"""
        if not history:
            return "无升级历史"
        
        formatted = []
        for record in history:
            escalated_at = datetime.fromisoformat(record["escalated_at"].replace('Z', '+00:00'))
            formatted.append(
                f"- {escalated_at.strftime('%Y-%m-%d %H:%M:%S')}: "
                f"{record['from_level']} → {record['to_level']} ({record['reason']})"
            )
        
        return "\n".join(formatted)
    
    def _create_escalation_alert(self, original_alert: Alert, level: EscalationLevel, message: str) -> Alert:
        """为升级通知创建告警对象"""
        escalation_alert = Alert(
            id=f"{original_alert.id}_escalation_{level.value}",
            rule_id=original_alert.rule_id,
            rule_name=f"{original_alert.rule_name} (升级通知)",
            severity=original_alert.severity,
            title=f"[{level.value.upper()}] {original_alert.title}",
            message=message,
            device_id=original_alert.device_id,
            device_name=original_alert.device_name,
            device_ip=original_alert.device_ip
        )
        return escalation_alert
    
    async def create_escalation(self, alert_id: str, severity: AlertSeverity) -> Optional[str]:
        """为告警创建升级"""
        # 查找匹配的升级规则
        matching_rule = None
        for rule in self.escalation_rules.values():
            if rule.escalation_enabled and rule.severity == severity:
                matching_rule = rule
                break
        
        if not matching_rule:
            self.logger.debug("No matching escalation rule found", severity=severity.value)
            return None
        
        # 检查是否已存在升级
        for escalation in self.active_escalations.values():
            if escalation.alert_id == alert_id and escalation.is_active:
                self.logger.debug("Escalation already exists", alert_id=alert_id)
                return escalation.id
        
        # 创建新的升级
        escalation = AlertEscalation(
            alert_id=alert_id,
            rule_id=matching_rule.id,
            next_escalation_time=self._calculate_next_escalation_time(
                matching_rule, 
                EscalationLevel.LEVEL_1
            )
        )
        
        self.active_escalations[escalation.id] = escalation
        
        self.logger.info(
            "Alert escalation created",
            alert_id=alert_id,
            escalation_id=escalation.id,
            rule_id=matching_rule.id
        )
        
        return escalation.id
    
    async def cancel_escalation(self, alert_id: str, reason: str = "告警已确认") -> bool:
        """取消告警升级"""
        cancelled_count = 0
        
        for escalation in self.active_escalations.values():
            if escalation.alert_id == alert_id and escalation.is_active:
                escalation.is_active = False
                escalation.escalation_history.append({
                    "action": "cancelled",
                    "reason": reason,
                    "cancelled_at": datetime.now(timezone.utc).isoformat(),
                    "level": escalation.current_level.value
                })
                escalation.updated_at = datetime.now(timezone.utc)
                cancelled_count += 1
        
        if cancelled_count > 0:
            self.logger.info("Alert escalation cancelled", alert_id=alert_id, reason=reason)
            return True
        
        return False
    
    async def get_escalation_status(self, alert_id: str) -> Optional[Dict[str, Any]]:
        """获取告警升级状态"""
        for escalation in self.active_escalations.values():
            if escalation.alert_id == alert_id and escalation.is_active:
                return {
                    "escalation_id": escalation.id,
                    "alert_id": escalation.alert_id,
                    "current_level": escalation.current_level.value,
                    "next_escalation_time": escalation.next_escalation_time.isoformat() if escalation.next_escalation_time else None,
                    "history": escalation.escalation_history,
                    "is_active": escalation.is_active,
                    "created_at": escalation.created_at.isoformat(),
                    "updated_at": escalation.updated_at.isoformat()
                }
        
        return None
    
    async def get_escalation_statistics(self) -> Dict[str, Any]:
        """获取升级统计信息"""
        active_escalations = [e for e in self.active_escalations.values() if e.is_active]
        
        level_distribution = {}
        for level in EscalationLevel:
            level_distribution[level.value] = len([
                e for e in active_escalations if e.current_level == level
            ])
        
        return {
            "total_active_escalations": len(active_escalations),
            "level_distribution": level_distribution,
            "total_rules": len(self.escalation_rules),
            "enabled_rules": len([r for r in self.escalation_rules.values() if r.escalation_enabled]),
            "is_running": self.is_running
        }


# 全局升级服务实例
alert_escalation_service = AlertEscalationService()
