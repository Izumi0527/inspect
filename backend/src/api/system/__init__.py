from fastapi import APIRouter, HTTPException, Depends, Query, BackgroundTasks
from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any, Union
from datetime import datetime
import structlog

from src.core.permissions import require_permission
from src.services.system_settings import (
    system_settings_service, 
    SettingCategory, 
    SystemSetting,
    NotificationConfig,
    EmailConfig,
    BackupConfig
)

logger = structlog.get_logger()
router = APIRouter()

# 数据模型
class SettingUpdateRequest(BaseModel):
    key: str
    value: Any
    description: Optional[str] = None

class BulkSettingUpdateRequest(BaseModel):
    settings: Dict[str, Any]

class SettingResponse(BaseModel):
    key: str
    value: Any
    category: str
    description: Optional[str] = None
    data_type: str
    is_required: bool = False
    updated_at: Optional[datetime] = None

class BackupCreateRequest(BaseModel):
    backup_name: Optional[str] = None

class BackupRestoreRequest(BaseModel):
    backup_name: str

class BackupResponse(BaseModel):
    name: str
    created_at: Optional[datetime] = None
    file_size: int
    version: str

class EmailTestResponse(BaseModel):
    success: bool
    message: str

class NotificationSettingsRequest(BaseModel):
    email_enabled: bool = True
    sms_enabled: bool = False
    webhook_enabled: bool = False
    email_recipients: List[str] = []
    sms_recipients: List[str] = []
    webhook_urls: List[str] = []
    notification_levels: List[str] = ["warning", "error", "critical"]

class EmailSettingsRequest(BaseModel):
    smtp_server: str
    smtp_port: int = 587
    smtp_username: str
    smtp_password: str
    use_tls: bool = True
    use_ssl: bool = False
    sender_name: str = "网络设备巡检系统"
    sender_email: Optional[str] = None

class SystemInfoResponse(BaseModel):
    application_name: str
    version: str
    timezone: str
    uptime: Optional[str] = None
    last_backup: Optional[datetime] = None

@router.get("/info", response_model=SystemInfoResponse, summary="获取系统信息")
async def get_system_info(
    current_user: dict = Depends(require_permission("system:read"))
):
    """
    获取系统基本信息
    """
    try:
        app_name = await system_settings_service.get_setting("system.application_name", "网络设备巡检系统")
        version = await system_settings_service.get_setting("system.version", "1.0.0")
        timezone = await system_settings_service.get_setting("system.timezone", "Asia/Shanghai")
        
        # 获取最新备份信息
        backups = await system_settings_service.get_backup_list()
        last_backup = None
        if backups:
            last_backup = datetime.fromisoformat(backups[0]["created_at"]) if backups[0]["created_at"] else None
        
        return SystemInfoResponse(
            application_name=app_name,
            version=version,
            timezone=timezone,
            last_backup=last_backup
        )
        
    except Exception as e:
        logger.error("Failed to get system info", error=str(e))
        raise HTTPException(status_code=500, detail=f"获取系统信息失败: {str(e)}")

@router.get("/settings", response_model=List[SettingResponse], summary="获取所有设置")
async def get_all_settings(
    category: Optional[SettingCategory] = Query(None, description="设置类别过滤"),
    current_user: dict = Depends(require_permission("system:read"))
):
    """
    获取所有系统设置，支持按类别过滤
    """
    try:
        if category:
            settings_data = await system_settings_service.get_settings_by_category(category)
        else:
            settings_data = {}
            for cat in SettingCategory:
                cat_settings = await system_settings_service.get_settings_by_category(cat)
                settings_data.update(cat_settings)
        
        settings_list = []
        for key, setting_info in settings_data.items():
            settings_list.append(SettingResponse(
                key=key,
                value=setting_info["value"],
                category=setting_info.get("category", "system"),
                description=setting_info.get("description"),
                data_type=setting_info.get("data_type", "string"),
                is_required=setting_info.get("is_required", False)
            ))
        
        logger.info("Retrieved system settings", 
                   category=category, 
                   count=len(settings_list),
                   user_id=current_user["id"])
        
        return settings_list
        
    except Exception as e:
        logger.error("Failed to get settings", category=category, error=str(e))
        raise HTTPException(status_code=500, detail=f"获取设置失败: {str(e)}")

@router.get("/settings/{key}", response_model=SettingResponse, summary="获取单个设置")
async def get_setting(
    key: str,
    current_user: dict = Depends(require_permission("system:read"))
):
    """
    获取指定的系统设置
    """
    try:
        value = await system_settings_service.get_setting(key)
        
        if value is None:
            raise HTTPException(status_code=404, detail=f"设置项不存在: {key}")
        
        # 获取设置的详细信息
        settings_data = await system_settings_service.get_settings_by_category(SettingCategory.SYSTEM)
        setting_info = settings_data.get(key, {})
        
        return SettingResponse(
            key=key,
            value=value,
            category=setting_info.get("category", "system"),
            description=setting_info.get("description"),
            data_type=setting_info.get("data_type", "string"),
            is_required=setting_info.get("is_required", False)
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get setting", key=key, error=str(e))
        raise HTTPException(status_code=500, detail=f"获取设置失败: {str(e)}")

@router.put("/settings/{key}", summary="更新单个设置")
async def update_setting(
    key: str,
    request: SettingUpdateRequest,
    current_user: dict = Depends(require_permission("system:write"))
):
    """
    更新指定的系统设置
    """
    try:
        success = await system_settings_service.set_setting(
            key=request.key or key,
            value=request.value,
            user_id=current_user["id"]
        )
        
        if not success:
            raise HTTPException(status_code=400, detail="设置更新失败，请检查设置值是否有效")
        
        logger.info("Setting updated", 
                   key=key, 
                   updated_by=current_user["id"])
        
        return {"message": "设置更新成功", "key": key}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to update setting", key=key, error=str(e))
        raise HTTPException(status_code=500, detail=f"更新设置失败: {str(e)}")

@router.post("/settings/bulk", summary="批量更新设置")
async def bulk_update_settings(
    request: BulkSettingUpdateRequest,
    current_user: dict = Depends(require_permission("system:write"))
):
    """
    批量更新系统设置
    """
    try:
        results = await system_settings_service.bulk_update_settings(
            settings=request.settings,
            user_id=current_user["id"]
        )
        
        successful_count = sum(1 for success in results.values() if success)
        failed_count = len(results) - successful_count
        
        logger.info("Bulk settings update completed",
                   total=len(request.settings),
                   successful=successful_count,
                   failed=failed_count,
                   updated_by=current_user["id"])
        
        return {
            "message": f"批量更新完成: 成功 {successful_count} 个，失败 {failed_count} 个",
            "results": results,
            "successful_count": successful_count,
            "failed_count": failed_count
        }
        
    except Exception as e:
        logger.error("Failed to bulk update settings", error=str(e))
        raise HTTPException(status_code=500, detail=f"批量更新设置失败: {str(e)}")

@router.post("/settings/{key}/reset", summary="重置设置为默认值")
async def reset_setting(
    key: str,
    current_user: dict = Depends(require_permission("system:write"))
):
    """
    重置指定设置为默认值
    """
    try:
        success = await system_settings_service.reset_setting(key, current_user["id"])
        
        if not success:
            raise HTTPException(status_code=404, detail=f"设置项不存在或重置失败: {key}")
        
        logger.info("Setting reset to default", 
                   key=key,
                   reset_by=current_user["id"])
        
        return {"message": "设置已重置为默认值", "key": key}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to reset setting", key=key, error=str(e))
        raise HTTPException(status_code=500, detail=f"重置设置失败: {str(e)}")

@router.post("/notification/settings", summary="配置通知设置")
async def configure_notification_settings(
    request: NotificationSettingsRequest,
    current_user: dict = Depends(require_permission("system:write"))
):
    """
    配置通知相关设置
    """
    try:
        # 更新通知设置
        notification_settings = {
            "notification.email_enabled": request.email_enabled,
            "notification.sms_enabled": request.sms_enabled,
            "notification.webhook_enabled": request.webhook_enabled,
            "notification.email_recipients": request.email_recipients,
            "notification.sms_recipients": request.sms_recipients,
            "notification.webhook_urls": request.webhook_urls,
            "notification.levels": request.notification_levels
        }
        
        results = await system_settings_service.bulk_update_settings(
            settings=notification_settings,
            user_id=current_user["id"]
        )
        
        successful_count = sum(1 for success in results.values() if success)
        
        if successful_count != len(notification_settings):
            raise HTTPException(status_code=400, detail="部分通知设置更新失败")
        
        logger.info("Notification settings configured",
                   configured_by=current_user["id"])
        
        return {"message": "通知设置配置成功"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to configure notification settings", error=str(e))
        raise HTTPException(status_code=500, detail=f"配置通知设置失败: {str(e)}")

@router.post("/email/settings", summary="配置邮件设置")
async def configure_email_settings(
    request: EmailSettingsRequest,
    current_user: dict = Depends(require_permission("system:write"))
):
    """
    配置邮件服务器设置
    """
    try:
        # 更新邮件设置
        email_settings = {
            "email.smtp_server": request.smtp_server,
            "email.smtp_port": request.smtp_port,
            "email.smtp_username": request.smtp_username,
            "email.smtp_password": request.smtp_password,
            "email.use_tls": request.use_tls,
            "email.use_ssl": request.use_ssl,
            "email.sender_name": request.sender_name,
            "email.sender_email": request.sender_email or request.smtp_username
        }
        
        results = await system_settings_service.bulk_update_settings(
            settings=email_settings,
            user_id=current_user["id"]
        )
        
        successful_count = sum(1 for success in results.values() if success)
        
        if successful_count != len(email_settings):
            raise HTTPException(status_code=400, detail="部分邮件设置更新失败")
        
        logger.info("Email settings configured",
                   smtp_server=request.smtp_server,
                   configured_by=current_user["id"])
        
        return {"message": "邮件设置配置成功"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to configure email settings", error=str(e))
        raise HTTPException(status_code=500, detail=f"配置邮件设置失败: {str(e)}")

@router.post("/email/test", response_model=EmailTestResponse, summary="测试邮件配置")
async def test_email_configuration(
    current_user: dict = Depends(require_permission("system:write"))
):
    """
    测试当前的邮件配置是否正确
    """
    try:
        success, message = await system_settings_service.test_email_config()
        
        logger.info("Email configuration test completed",
                   success=success,
                   message=message,
                   tested_by=current_user["id"])
        
        return EmailTestResponse(success=success, message=message)
        
    except Exception as e:
        logger.error("Failed to test email configuration", error=str(e))
        return EmailTestResponse(success=False, message=f"邮件配置测试失败: {str(e)}")

@router.post("/backup", summary="创建配置备份")
async def create_backup(
    request: BackupCreateRequest,
    current_user: dict = Depends(require_permission("system:admin"))
):
    """
    创建系统设置备份
    """
    try:
        backup_name = await system_settings_service.create_backup(request.backup_name)
        
        logger.info("Configuration backup created",
                   backup_name=backup_name,
                   created_by=current_user["id"])
        
        return {
            "message": "配置备份创建成功",
            "backup_name": backup_name
        }
        
    except Exception as e:
        logger.error("Failed to create backup", error=str(e))
        raise HTTPException(status_code=500, detail=f"创建备份失败: {str(e)}")

@router.post("/backup/restore", summary="恢复配置备份")
async def restore_backup(
    request: BackupRestoreRequest,
    current_user: dict = Depends(require_permission("system:admin"))
):
    """
    从备份恢复系统设置
    """
    try:
        success = await system_settings_service.restore_backup(
            backup_name=request.backup_name,
            user_id=current_user["id"]
        )
        
        if not success:
            raise HTTPException(status_code=400, detail="备份恢复失败")
        
        logger.info("Configuration restored from backup",
                   backup_name=request.backup_name,
                   restored_by=current_user["id"])
        
        return {"message": f"配置已从备份 {request.backup_name} 恢复"}
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to restore backup", 
                    backup_name=request.backup_name, 
                    error=str(e))
        raise HTTPException(status_code=500, detail=f"恢复备份失败: {str(e)}")

@router.get("/backup", response_model=List[BackupResponse], summary="获取备份列表")
async def get_backup_list(
    current_user: dict = Depends(require_permission("system:admin"))
):
    """
    获取所有可用的配置备份
    """
    try:
        backups = await system_settings_service.get_backup_list()
        
        backup_responses = []
        for backup in backups:
            backup_responses.append(BackupResponse(
                name=backup["name"],
                created_at=datetime.fromisoformat(backup["created_at"]) if backup["created_at"] else None,
                file_size=backup["file_size"],
                version=backup["version"]
            ))
        
        logger.info("Retrieved backup list",
                   backup_count=len(backup_responses),
                   user_id=current_user["id"])
        
        return backup_responses
        
    except Exception as e:
        logger.error("Failed to get backup list", error=str(e))
        raise HTTPException(status_code=500, detail=f"获取备份列表失败: {str(e)}")

@router.get("/categories", summary="获取设置类别列表")
async def get_setting_categories(
    current_user: dict = Depends(require_permission("system:read"))
):
    """
    获取所有设置类别
    """
    try:
        categories = []
        for category in SettingCategory:
            categories.append({
                "value": category.value,
                "label": {
                    "system": "系统设置",
                    "notification": "通知设置", 
                    "email": "邮件设置",
                    "inspection": "巡检设置",
                    "report": "报表设置",
                    "security": "安全设置",
                    "backup": "备份设置",
                    "user_preference": "用户偏好"
                }.get(category.value, category.value)
            })
        
        return {
            "categories": categories,
            "total_count": len(categories)
        }
        
    except Exception as e:
        logger.error("Failed to get setting categories", error=str(e))
        raise HTTPException(status_code=500, detail=f"获取设置类别失败: {str(e)}")