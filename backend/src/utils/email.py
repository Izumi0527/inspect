"""
邮件服务类
"""
import smtplib
import logging
from typing import Optional, List
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders


logger = logging.getLogger(__name__)


class EmailService:
    """邮件服务"""
    
    def __init__(
        self,
        smtp_host: str = "localhost",
        smtp_port: int = 587,
        smtp_user: str = "",
        smtp_password: str = "",
        from_email: str = "noreply@inspect.com",
        from_name: str = "网络设备巡检系统"
    ):
        self.smtp_host = smtp_host
        self.smtp_port = smtp_port
        self.smtp_user = smtp_user
        self.smtp_password = smtp_password
        self.from_email = from_email
        self.from_name = from_name
    
    async def send_email(
        self,
        to_email: str,
        subject: str,
        content: str,
        content_type: str = "html",
        attachments: Optional[List[dict]] = None
    ) -> bool:
        """发送邮件"""
        try:
            # 创建邮件消息
            msg = MIMEMultipart()
            msg['From'] = f"{self.from_name} <{self.from_email}>"
            msg['To'] = to_email
            msg['Subject'] = subject
            
            # 添加邮件内容
            if content_type == "html":
                msg.attach(MIMEText(content, 'html', 'utf-8'))
            else:
                msg.attach(MIMEText(content, 'plain', 'utf-8'))
            
            # 添加附件
            if attachments:
                for attachment in attachments:
                    part = MIMEBase('application', 'octet-stream')
                    part.set_payload(attachment['content'])
                    encoders.encode_base64(part)
                    part.add_header(
                        'Content-Disposition',
                        f'attachment; filename= {attachment["filename"]}'
                    )
                    msg.attach(part)
            
            # 发送邮件
            server = smtplib.SMTP(self.smtp_host, self.smtp_port)
            server.starttls()
            if self.smtp_user and self.smtp_password:
                server.login(self.smtp_user, self.smtp_password)
            
            text = msg.as_string()
            server.sendmail(self.from_email, to_email, text)
            server.quit()
            
            logger.info(f"邮件发送成功: {to_email}")
            return True
            
        except Exception as e:
            logger.error(f"发送邮件失败 {to_email}: {e}")
            return False
    
    async def send_welcome_email(self, to_email: str, user_name: str, password: str) -> bool:
        """发送欢迎邮件"""
        subject = "欢迎使用网络设备巡检系统"
        
        content = f"""
        <html>
        <body>
            <h2>欢迎使用网络设备巡检系统</h2>
            <p>亲爱的 {user_name}，</p>
            <p>您的账户已经成功创建，以下是您的登录信息：</p>
            <ul>
                <li>登录邮箱: {to_email}</li>
                <li>临时密码: {password}</li>
            </ul>
            <p><strong>重要提示：</strong></p>
            <ul>
                <li>请在首次登录后立即修改密码</li>
                <li>密码必须包含大小写字母、数字和特殊字符</li>
                <li>请妥善保管您的账户信息</li>
            </ul>
            <p>如有任何问题，请联系系统管理员。</p>
            <br>
            <p>此致</p>
            <p>网络设备巡检系统团队</p>
        </body>
        </html>
        """
        
        return await self.send_email(to_email, subject, content)
    
    async def send_password_reset_notification(self, to_email: str, user_name: str) -> bool:
        """发送密码重置通知邮件"""
        subject = "密码重置通知"
        
        content = f"""
        <html>
        <body>
            <h2>密码重置通知</h2>
            <p>亲爱的 {user_name}，</p>
            <p>您的账户密码已被重置。</p>
            <p>如果这不是您本人的操作，请立即联系系统管理员。</p>
            <p><strong>安全提示：</strong></p>
            <ul>
                <li>请使用新密码登录系统</li>
                <li>建议在登录后再次修改为您熟悉的密码</li>
                <li>定期更换密码以保证账户安全</li>
            </ul>
            <br>
            <p>此致</p>
            <p>网络设备巡检系统团队</p>
        </body>
        </html>
        """
        
        return await self.send_email(to_email, subject, content)
    
    async def send_account_locked_notification(self, to_email: str, user_name: str, reason: str) -> bool:
        """发送账户锁定通知邮件"""
        subject = "账户锁定通知"
        
        content = f"""
        <html>
        <body>
            <h2>账户锁定通知</h2>
            <p>亲爱的 {user_name}，</p>
            <p>您的账户已被锁定。</p>
            <p><strong>锁定原因：</strong>{reason}</p>
            <p>如需解锁账户，请联系系统管理员。</p>
            <br>
            <p>此致</p>
            <p>网络设备巡检系统团队</p>
        </body>
        </html>
        """
        
        return await self.send_email(to_email, subject, content)
    
    async def test_connection(self) -> bool:
        """测试邮件服务连接"""
        try:
            server = smtplib.SMTP(self.smtp_host, self.smtp_port)
            server.starttls()
            if self.smtp_user and self.smtp_password:
                server.login(self.smtp_user, self.smtp_password)
            server.quit()
            return True
        except Exception as e:
            logger.error(f"邮件服务连接测试失败: {e}")
            return False