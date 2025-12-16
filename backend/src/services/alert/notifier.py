"""
告警通知服务

负责发送各种类型的告警通知（邮件、WebSocket等）
"""

import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import List
import structlog

from src.core.config import settings
from src.services.alert.types import Alert, AlertSeverity

logger = structlog.get_logger()


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
            AlertSeverity.EMERGENCY: "#6f42c1",
            AlertSeverity.FATAL: "#6f42c1"
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
