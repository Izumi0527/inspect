import asyncio
import json
import os
import shutil
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Union, Tuple
from pathlib import Path
from dataclasses import dataclass, asdict
from enum import Enum
import structlog
import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

from src.core.config import settings

logger = structlog.get_logger()

class SettingCategory(str, Enum):
    """设置类别"""
    SYSTEM = "system"
    NOTIFICATION = "notification"
    EMAIL = "email"
    INSPECTION = "inspection"
    REPORT = "report"
    SECURITY = "security"
    BACKUP = "backup"
    USER_PREFERENCE = "user_preference"

class SettingLevel(str, Enum):
    """设置级别"""
    SYSTEM = "system"
    USER = "user"
    MODULE = "module"

@dataclass
class SystemSetting:
    """系统设置数据结构"""
    key: str
    value: Any
    category: SettingCategory
    level: SettingLevel = SettingLevel.SYSTEM
    description: Optional[str] = None
    data_type: str = "string"  # string, integer, float, boolean, json
    is_required: bool = False
    is_encrypted: bool = False
    validation_rule: Optional[str] = None
    default_value: Any = None
    created_at: datetime = None
    updated_at: datetime = None
    updated_by: Optional[int] = None

@dataclass
class NotificationConfig:
    """通知配置"""
    email_enabled: bool = True
    sms_enabled: bool = False
    webhook_enabled: bool = False
    email_recipients: List[str] = None
    sms_recipients: List[str] = None
    webhook_urls: List[str] = None
    notification_levels: List[str] = None  # info, warning, error, critical

@dataclass
class EmailConfig:
    """邮件配置"""
    smtp_server: str
    smtp_username: str
    smtp_password: str
    smtp_port: int = 587
    use_tls: bool = True
    use_ssl: bool = False
    sender_name: str = "网络设备巡检系统"
    sender_email: str = ""
    
@dataclass
class BackupConfig:
    """备份配置"""
    auto_backup_enabled: bool = True
    backup_interval_hours: int = 24
    backup_retention_days: int = 30
    backup_location: str = "./backups"
    include_database: bool = True
    include_configurations: bool = True
    include_logs: bool = False
    compress_backups: bool = True

class SystemSettingsService:
    """系统设置服务"""
    
    def __init__(self):
        self.settings_cache = {}
        self.config_file_path = Path("./data/system_settings.json")
        self.backup_path = Path("./data/backups")
        self.encryption_key = None  # 在实际应用中应该从安全的地方获取
        
        # 确保目录存在
        self.config_file_path.parent.mkdir(parents=True, exist_ok=True)
        self.backup_path.mkdir(parents=True, exist_ok=True)
        
        # 默认系统设置
        self.default_settings = {
            # 系统基础设置
            "system.application_name": SystemSetting(
                key="system.application_name",
                value="网络设备巡检系统",
                category=SettingCategory.SYSTEM,
                description="应用程序名称",
                data_type="string",
                is_required=True,
                default_value="网络设备巡检系统"
            ),
            "system.version": SystemSetting(
                key="system.version",
                value="1.0.0",
                category=SettingCategory.SYSTEM,
                description="系统版本号",
                data_type="string",
                is_required=True,
                default_value="1.0.0"
            ),
            "system.timezone": SystemSetting(
                key="system.timezone",
                value="Asia/Shanghai",
                category=SettingCategory.SYSTEM,
                description="系统时区",
                data_type="string",
                is_required=True,
                default_value="Asia/Shanghai"
            ),
            "system.session_timeout": SystemSetting(
                key="system.session_timeout",
                value=3600,
                category=SettingCategory.SYSTEM,
                description="会话超时时间（秒）",
                data_type="integer",
                is_required=True,
                default_value=3600,
                validation_rule=">=300,<=86400"
            ),
            
            # 通知设置
            "notification.email_enabled": SystemSetting(
                key="notification.email_enabled",
                value=True,
                category=SettingCategory.NOTIFICATION,
                description="启用邮件通知",
                data_type="boolean",
                default_value=True
            ),
            "notification.levels": SystemSetting(
                key="notification.levels",
                value=["warning", "error", "critical"],
                category=SettingCategory.NOTIFICATION,
                description="通知级别",
                data_type="json",
                default_value=["warning", "error", "critical"]
            ),
            
            # 邮件设置
            "email.smtp_server": SystemSetting(
                key="email.smtp_server",
                value="",
                category=SettingCategory.EMAIL,
                description="SMTP服务器地址",
                data_type="string",
                is_required=False
            ),
            "email.smtp_port": SystemSetting(
                key="email.smtp_port",
                value=587,
                category=SettingCategory.EMAIL,
                description="SMTP端口",
                data_type="integer",
                default_value=587
            ),
            "email.smtp_username": SystemSetting(
                key="email.smtp_username",
                value="",
                category=SettingCategory.EMAIL,
                description="SMTP用户名",
                data_type="string",
                is_required=False
            ),
            "email.smtp_password": SystemSetting(
                key="email.smtp_password",
                value="",
                category=SettingCategory.EMAIL,
                description="SMTP密码",
                data_type="string",
                is_required=False,
                is_encrypted=True
            ),
            
            # 巡检设置
            "inspection.max_concurrent_tasks": SystemSetting(
                key="inspection.max_concurrent_tasks",
                value=10,
                category=SettingCategory.INSPECTION,
                description="最大并发巡检任务数",
                data_type="integer",
                default_value=10,
                validation_rule=">=1,<=50"
            ),
            "inspection.default_timeout": SystemSetting(
                key="inspection.default_timeout",
                value=30,
                category=SettingCategory.INSPECTION,
                description="默认超时时间（秒）",
                data_type="integer",
                default_value=30,
                validation_rule=">=5,<=300"
            ),
            "inspection.retry_attempts": SystemSetting(
                key="inspection.retry_attempts",
                value=3,
                category=SettingCategory.INSPECTION,
                description="失败重试次数",
                data_type="integer",
                default_value=3,
                validation_rule=">=0,<=10"
            ),
            
            # 报表设置
            "report.default_format": SystemSetting(
                key="report.default_format",
                value="excel",
                category=SettingCategory.REPORT,
                description="默认报表格式",
                data_type="string",
                default_value="excel",
                validation_rule="excel,pdf"
            ),
            "report.max_export_records": SystemSetting(
                key="report.max_export_records",
                value=10000,
                category=SettingCategory.REPORT,
                description="最大导出记录数",
                data_type="integer",
                default_value=10000,
                validation_rule=">=100,<=100000"
            ),
            
            # 安全设置
            "security.password_min_length": SystemSetting(
                key="security.password_min_length",
                value=8,
                category=SettingCategory.SECURITY,
                description="密码最小长度",
                data_type="integer",
                default_value=8,
                validation_rule=">=6,<=20"
            ),
            "security.login_attempt_limit": SystemSetting(
                key="security.login_attempt_limit",
                value=5,
                category=SettingCategory.SECURITY,
                description="登录尝试次数限制",
                data_type="integer",
                default_value=5,
                validation_rule=">=3,<=10"
            ),
            
            # 备份设置
            "backup.auto_backup_enabled": SystemSetting(
                key="backup.auto_backup_enabled",
                value=True,
                category=SettingCategory.BACKUP,
                description="启用自动备份",
                data_type="boolean",
                default_value=True
            ),
            "backup.retention_days": SystemSetting(
                key="backup.retention_days",
                value=30,
                category=SettingCategory.BACKUP,
                description="备份保留天数",
                data_type="integer",
                default_value=30,
                validation_rule=">=1,<=365"
            )
        }
    
    async def initialize(self):
        """初始化设置服务"""
        try:
            await self._load_settings()
            logger.info("System settings service initialized")
        except Exception as e:
            logger.error("Failed to initialize system settings service", error=str(e))
            # 使用默认设置
            self.settings_cache = {k: asdict(v) for k, v in self.default_settings.items()}
            await self._save_settings()
    
    async def _load_settings(self):
        """加载设置"""
        try:
            if self.config_file_path.exists():
                with open(self.config_file_path, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                    self.settings_cache = data.get('settings', {})
            else:
                # 首次运行，使用默认设置
                self.settings_cache = {k: asdict(v) for k, v in self.default_settings.items()}
                await self._save_settings()
        except Exception as e:
            logger.error("Failed to load settings", error=str(e))
            self.settings_cache = {}
    
    async def _save_settings(self):
        """保存设置"""
        try:
            data = {
                'settings': self.settings_cache,
                'last_updated': datetime.now().isoformat(),
                'version': '1.0'
            }
            
            with open(self.config_file_path, 'w', encoding='utf-8') as f:
                json.dump(data, f, ensure_ascii=False, indent=2)
                
        except Exception as e:
            logger.error("Failed to save settings", error=str(e))
            raise
    
    async def get_setting(self, key: str, default: Any = None) -> Any:
        """获取设置值"""
        try:
            setting = self.settings_cache.get(key)
            if setting:
                value = setting.get('value', default)
                
                # 解密加密的设置
                if setting.get('is_encrypted', False) and value:
                    value = self._decrypt_value(value)
                
                return value
            return default
        except Exception as e:
            logger.error("Failed to get setting", key=key, error=str(e))
            return default
    
    async def set_setting(self, key: str, value: Any, user_id: Optional[int] = None) -> bool:
        """设置值"""
        try:
            # 获取设置定义
            setting_def = self.default_settings.get(key)
            if not setting_def:
                # 如果不是预定义设置，创建新的设置项
                setting_def = SystemSetting(
                    key=key,
                    value=value,
                    category=SettingCategory.SYSTEM,
                    data_type=self._infer_data_type(value)
                )
            
            # 验证值
            if not self._validate_setting_value(setting_def, value):
                raise ValueError(f"Invalid value for setting {key}: {value}")
            
            # 加密敏感设置
            stored_value = value
            if setting_def.is_encrypted and value:
                stored_value = self._encrypt_value(value)
            
            # 更新设置
            setting_dict = asdict(setting_def)
            setting_dict['value'] = stored_value
            setting_dict['updated_at'] = datetime.now().isoformat()
            setting_dict['updated_by'] = user_id
            
            self.settings_cache[key] = setting_dict
            
            # 保存到文件
            await self._save_settings()
            
            logger.info("Setting updated", key=key, updated_by=user_id)
            return True
            
        except Exception as e:
            logger.error("Failed to set setting", key=key, error=str(e))
            return False
    
    async def get_settings_by_category(self, category: SettingCategory) -> Dict[str, Any]:
        """按类别获取设置"""
        try:
            result = {}
            for key, setting in self.settings_cache.items():
                if setting.get('category') == category:
                    value = setting.get('value')
                    
                    # 解密加密的设置
                    if setting.get('is_encrypted', False) and value:
                        value = self._decrypt_value(value)
                    
                    result[key] = {
                        'key': key,
                        'value': value,
                        'description': setting.get('description'),
                        'data_type': setting.get('data_type'),
                        'is_required': setting.get('is_required', False)
                    }
            
            return result
        except Exception as e:
            logger.error("Failed to get settings by category", 
                        category=category, error=str(e))
            return {}
    
    async def reset_setting(self, key: str, user_id: Optional[int] = None) -> bool:
        """重置设置为默认值"""
        try:
            default_setting = self.default_settings.get(key)
            if default_setting:
                return await self.set_setting(key, default_setting.default_value, user_id)
            else:
                # 删除自定义设置
                if key in self.settings_cache:
                    del self.settings_cache[key]
                    await self._save_settings()
                    logger.info("Custom setting removed", key=key, removed_by=user_id)
                    return True
            return False
        except Exception as e:
            logger.error("Failed to reset setting", key=key, error=str(e))
            return False
    
    async def bulk_update_settings(self, settings: Dict[str, Any], user_id: Optional[int] = None) -> Dict[str, bool]:
        """批量更新设置"""
        results = {}
        
        for key, value in settings.items():
            try:
                results[key] = await self.set_setting(key, value, user_id)
            except Exception as e:
                logger.error("Failed to update setting in bulk", 
                           key=key, error=str(e))
                results[key] = False
        
        return results
    
    async def create_backup(self, backup_name: Optional[str] = None) -> str:
        """创建配置备份"""
        try:
            if not backup_name:
                backup_name = f"settings_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            
            backup_file = self.backup_path / f"{backup_name}.json"
            
            backup_data = {
                'backup_name': backup_name,
                'created_at': datetime.now().isoformat(),
                'settings': self.settings_cache,
                'version': '1.0'
            }
            
            with open(backup_file, 'w', encoding='utf-8') as f:
                json.dump(backup_data, f, ensure_ascii=False, indent=2)
            
            logger.info("Settings backup created", backup_name=backup_name)
            return backup_name
            
        except Exception as e:
            logger.error("Failed to create backup", error=str(e))
            raise
    
    async def restore_backup(self, backup_name: str, user_id: Optional[int] = None) -> bool:
        """恢复配置备份"""
        try:
            backup_file = self.backup_path / f"{backup_name}.json"
            
            if not backup_file.exists():
                raise FileNotFoundError(f"Backup file not found: {backup_name}")
            
            with open(backup_file, 'r', encoding='utf-8') as f:
                backup_data = json.load(f)
            
            # 创建当前配置的备份
            current_backup = await self.create_backup(
                f"before_restore_{datetime.now().strftime('%Y%m%d_%H%M%S')}"
            )
            
            # 恢复设置
            self.settings_cache = backup_data.get('settings', {})
            await self._save_settings()
            
            logger.info("Settings restored from backup", 
                       backup_name=backup_name, 
                       current_backup=current_backup,
                       restored_by=user_id)
            
            return True
            
        except Exception as e:
            logger.error("Failed to restore backup", 
                        backup_name=backup_name, error=str(e))
            return False
    
    async def get_backup_list(self) -> List[Dict[str, Any]]:
        """获取备份列表"""
        try:
            backups = []
            
            for backup_file in self.backup_path.glob("*.json"):
                try:
                    with open(backup_file, 'r', encoding='utf-8') as f:
                        backup_data = json.load(f)
                    
                    backups.append({
                        'name': backup_data.get('backup_name', backup_file.stem),
                        'created_at': backup_data.get('created_at'),
                        'file_size': backup_file.stat().st_size,
                        'version': backup_data.get('version', 'unknown')
                    })
                except:
                    # 跳过损坏的备份文件
                    continue
            
            # 按创建时间排序
            backups.sort(key=lambda x: x['created_at'], reverse=True)
            return backups
            
        except Exception as e:
            logger.error("Failed to get backup list", error=str(e))
            return []
    
    async def test_email_config(self) -> Tuple[bool, str]:
        """测试邮件配置"""
        try:
            smtp_server = await self.get_setting('email.smtp_server')
            smtp_port = await self.get_setting('email.smtp_port', 587)
            smtp_username = await self.get_setting('email.smtp_username')
            smtp_password = await self.get_setting('email.smtp_password')
            use_tls = await self.get_setting('email.use_tls', True)
            
            if not all([smtp_server, smtp_username, smtp_password]):
                return False, "邮件配置不完整"
            
            # 创建测试邮件
            message = MIMEText("这是一封测试邮件，用于验证邮件配置是否正确。", 'plain', 'utf-8')
            message['From'] = smtp_username
            message['To'] = smtp_username  # 发给自己
            message['Subject'] = "邮件配置测试"
            
            # 发送邮件
            if use_tls:
                await aiosmtplib.send(
                    message,
                    hostname=smtp_server,
                    port=smtp_port,
                    username=smtp_username,
                    password=smtp_password,
                    use_tls=True
                )
            else:
                await aiosmtplib.send(
                    message,
                    hostname=smtp_server,
                    port=smtp_port,
                    username=smtp_username,
                    password=smtp_password
                )
            
            return True, "邮件配置测试成功"
            
        except Exception as e:
            return False, f"邮件配置测试失败: {str(e)}"
    
    def _validate_setting_value(self, setting: SystemSetting, value: Any) -> bool:
        """验证设置值"""
        try:
            # 数据类型检查
            if setting.data_type == "integer":
                if not isinstance(value, int):
                    return False
            elif setting.data_type == "float":
                if not isinstance(value, (int, float)):
                    return False
            elif setting.data_type == "boolean":
                if not isinstance(value, bool):
                    return False
            elif setting.data_type == "json":
                if not isinstance(value, (list, dict)):
                    return False
            
            # 验证规则检查
            if setting.validation_rule:
                return self._validate_rule(value, setting.validation_rule)
            
            return True
            
        except Exception as e:
            logger.error("Setting validation failed", 
                        key=setting.key, value=value, error=str(e))
            return False
    
    def _validate_rule(self, value: Any, rule: str) -> bool:
        """验证规则"""
        try:
            if isinstance(value, (int, float)):
                # 数值范围验证
                if ">=" in rule:
                    min_val = float(rule.split(">=")[1].split(",")[0])
                    if value < min_val:
                        return False
                
                if "<=" in rule:
                    max_val = float(rule.split("<=")[1])
                    if value > max_val:
                        return False
                        
            elif isinstance(value, str):
                # 字符串枚举验证
                if "," in rule and rule.count(">=") == 0:
                    valid_values = [v.strip() for v in rule.split(",")]
                    if value not in valid_values:
                        return False
            
            return True
            
        except Exception:
            return False
    
    def _infer_data_type(self, value: Any) -> str:
        """推断数据类型"""
        if isinstance(value, bool):
            return "boolean"
        elif isinstance(value, int):
            return "integer"
        elif isinstance(value, float):
            return "float"
        elif isinstance(value, (list, dict)):
            return "json"
        else:
            return "string"
    
    def _encrypt_value(self, value: str) -> str:
        """加密值（简单实现，实际应用中应使用更安全的加密方法）"""
        try:
            # 这里应该使用真实的加密算法
            # 为了演示，我们只是简单地base64编码
            import base64
            return base64.b64encode(value.encode()).decode()
        except:
            return value
    
    def _decrypt_value(self, encrypted_value: str) -> str:
        """解密值"""
        try:
            import base64
            return base64.b64decode(encrypted_value.encode()).decode()
        except:
            return encrypted_value

# 全局系统设置服务实例
system_settings_service = SystemSettingsService()