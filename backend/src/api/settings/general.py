"""
General Settings API Router
通用配置API路由
"""
from typing import Optional, Dict, Any, List
from datetime import datetime
from fastapi import APIRouter, HTTPException, Query, Depends
import structlog
import hashlib

from src.schemas.settings.general import (
    SettingItem,
    BulkUpdateRequest,
    BulkUpdateResponse,
    ExportConfigResponse,
    ImportConfigRequest,
    ImportConfigResponse
)
from src.schemas.settings.system import (
    SettingsGroupResponse,
    SettingResponse,
    ValidationRule,
    SystemInfoResponse
)
from src.services.settings.general_service import general_settings_service
from src.services.system_settings import system_settings_service, SettingCategory
from src.core.permissions import require_permission

logger = structlog.get_logger()

router = APIRouter(prefix="/general", tags=["General Settings"])


# ============================================================================
# 辅助函数
# ============================================================================

def generate_setting_id(key: str) -> str:
    """基于key生成唯一ID"""
    return hashlib.md5(key.encode()).hexdigest()[:16]


def parse_validation_rule(rule: Optional[str], data_type: str) -> Optional[ValidationRule]:
    """解析验证规则字符串为结构化对象"""
    if not rule:
        return None

    validation_dict = {}

    try:
        if data_type in ["integer", "float"]:
            # 数值范围验证: ">=300,<=86400"
            if ">=" in rule:
                min_val = float(rule.split(">=")[1].split(",")[0].strip())
                validation_dict["min"] = min_val

            if "<=" in rule:
                parts = rule.split("<=")
                max_val = float(parts[1].strip())
                validation_dict["max"] = max_val

        elif data_type == "string":
            # 字符串枚举验证: "excel,pdf"
            if "," in rule and ">=" not in rule:
                options = [{"label": v.strip(), "value": v.strip()}
                          for v in rule.split(",")]
                validation_dict["options"] = options
            # 正则验证
            elif rule.startswith("^"):
                validation_dict["pattern"] = rule
    except Exception as e:
        logger.warning("Failed to parse validation rule", rule=rule, error=str(e))

    return ValidationRule(**validation_dict) if validation_dict else None


def generate_setting_label(key: str) -> str:
    """生成配置标签"""
    # 标签映射表
    label_map = {
        # 系统设置
        "system.application_name": "应用程序名称",
        "system.version": "系统版本",
        "system.timezone": "时区",
        "system.session_timeout": "会话超时",

        # 通知设置
        "notification.email_enabled": "启用邮件通知",
        "notification.levels": "通知级别",

        # 邮件设置
        "email.smtp_server": "SMTP服务器",
        "email.smtp_port": "SMTP端口",
        "email.smtp_username": "SMTP用户名",
        "email.smtp_password": "SMTP密码",
        "email.use_tls": "使用TLS",
        "email.use_ssl": "使用SSL",
        "email.sender_name": "发件人名称",
        "email.sender_email": "发件人邮箱",

        # 巡检设置
        "inspection.max_concurrent_tasks": "最大并发任务数",
        "inspection.default_timeout": "默认超时时间",
        "inspection.retry_attempts": "重试次数",

        # 报表设置
        "report.default_format": "默认报表格式",
        "report.max_export_records": "最大导出记录数",

        # 安全设置
        "security.password.min_length": "密码最小长度",
        "security.password.max_login_attempts": "最大登录尝试次数",

        # 备份设置
        "backup.auto_backup_enabled": "启用自动备份",
        "backup.retention_days": "备份保留天数"
    }

    # 返回映射的标签，如果没有则使用key的最后一部分
    return label_map.get(key, key.split(".")[-1].replace("_", " ").title())


def is_setting_readonly(key: str) -> bool:
    """判断配置是否只读"""
    readonly_keys = ["system.version", "system.application_name"]
    return key in readonly_keys


def get_category_metadata() -> Dict[str, Dict[str, Any]]:
    """获取分类元数据"""
    return {
        "system": {
            "id": "system",
            "name": "system",
            "displayName": "系统设置",
            "description": "基础系统配置，包括应用名称、版本、时区等",
            "icon": "Settings",
            "order": 1
        },
        "notification": {
            "id": "notification",
            "name": "notification",
            "displayName": "通知设置",
            "description": "通知相关配置，包括邮件通知、通知级别等",
            "icon": "Bell",
            "order": 2
        },
        "email": {
            "id": "email",
            "name": "email",
            "displayName": "邮件设置",
            "description": "SMTP邮件服务器配置",
            "icon": "Mail",
            "order": 3
        },
        "inspection": {
            "id": "inspection",
            "name": "inspection",
            "displayName": "巡检设置",
            "description": "设备巡检相关配置，包括并发数、超时时间等",
            "icon": "Search",
            "order": 4
        },
        "report": {
            "id": "report",
            "name": "report",
            "displayName": "报表设置",
            "description": "报表导出相关配置",
            "icon": "FileText",
            "order": 5
        },
        "security": {
            "id": "security",
            "name": "security",
            "displayName": "安全设置",
            "description": "安全策略配置，包括密码规则、登录限制等",
            "icon": "Shield",
            "order": 6
        },
        "backup": {
            "id": "backup",
            "name": "backup",
            "displayName": "备份设置",
            "description": "系统备份相关配置",
            "icon": "Database",
            "order": 7
        },
        "user_preference": {
            "id": "user_preference",
            "name": "user_preference",
            "displayName": "用户偏好",
            "description": "用户个人偏好设置",
            "icon": "User",
            "order": 8
        }
    }


# ============================================================================
# 基础配置管理端点（原有功能）
# ============================================================================


@router.get("/", response_model=dict, summary="获取通用配置列表")
async def get_general_configs(
    current_user: dict = Depends(require_permission("settings:general:read"))
):
    """
    获取通用配置列表

    返回所有 system、notification、email、inspection、report 等分类的配置项

    **权限要求**: settings:general:read
    """
    try:
        # 获取所有通用相关的配置
        categories = ["system", "notification", "email", "inspection", "report"]
        all_settings = []

        for category in categories:
            settings = await general_settings_service.get_all_settings(category)
            all_settings.extend(settings)

        logger.info(
            "Retrieved general configs",
            total_count=len(all_settings),
            user_id=current_user["id"]
        )

        return {
            "items": all_settings,
            "total": len(all_settings)
        }

    except Exception as e:
        logger.error("Failed to get general configs", error=str(e))
        raise HTTPException(status_code=500, detail=f"获取通用配置失败: {str(e)}")


@router.get("/stats", response_model=dict, summary="获取通用配置统计信息")
async def get_general_stats(
    current_user: dict = Depends(require_permission("settings:general:read"))
):
    """
    获取通用配置统计信息

    用于仪表板展示聚合数据

    **权限要求**: settings:general:read
    """
    try:
        categories = ["system", "notification", "email", "inspection", "report"]
        stats = {
            "total_count": 0,
            "by_category": {}
        }

        for category in categories:
            settings = await general_settings_service.get_all_settings(category)
            count = len(settings)
            stats["total_count"] += count
            stats["by_category"][category] = count

        logger.info(
            "Retrieved general stats",
            stats=stats,
            user_id=current_user["id"]
        )

        return stats

    except Exception as e:
        logger.error("Failed to get general stats", error=str(e))
        raise HTTPException(status_code=500, detail=f"获取统计信息失败: {str(e)}")


@router.get("/settings", response_model=list[SettingItem])
async def get_all_settings(
    category: Optional[str] = Query(None, description="配置分类筛选"),
    current_user: dict = Depends(require_permission("settings:general:read"))
):
    """
    获取所有系统配置

    - **category**: 可选的分类筛选（system/notification/email/inspection/report/security/backup）
    """
    try:
        settings = await general_settings_service.get_all_settings(category)
        return settings
    except Exception as e:
        logger.error("Failed to get all settings", error=str(e), category=category)
        raise HTTPException(status_code=500, detail=f"获取配置失败: {str(e)}")


@router.get("/settings/{key}", response_model=SettingItem)
async def get_setting(
    key: str,
    current_user: dict = Depends(require_permission("settings:general:read"))
):
    """
    获取单个配置项

    - **key**: 配置键名
    """
    try:
        setting = await general_settings_service.get_setting(key)
        if setting is None:
            raise HTTPException(status_code=404, detail=f"配置项不存在: {key}")
        return setting
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get setting", error=str(e), key=key)
        raise HTTPException(status_code=500, detail=f"获取配置失败: {str(e)}")


@router.put("/settings/{key}", response_model=SettingItem)
async def update_setting(
    key: str,
    value: Dict[str, Any],
    current_user: dict = Depends(require_permission("settings:general:write"))
):
    """
    更新单个配置项

    - **key**: 配置键名
    - **value**: 配置值（JSON格式: {"value": "实际值"}）
    """
    try:
        # 提取实际的值
        actual_value = value.get("value")
        if actual_value is None:
            raise HTTPException(status_code=400, detail="请求体必须包含 'value' 字段")

        setting = await general_settings_service.update_setting(
            key,
            actual_value,
            current_user["id"]
        )
        return setting
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to update setting", error=str(e), key=key)
        raise HTTPException(status_code=500, detail=f"更新配置失败: {str(e)}")


@router.post("/settings/bulk", response_model=BulkUpdateResponse)
async def bulk_update_settings(
    request: BulkUpdateRequest,
    current_user: dict = Depends(require_permission("settings:general:write"))
):
    """
    批量更新配置

    - **settings**: 配置键值对字典
    """
    try:
        result = await general_settings_service.bulk_update_settings(
            request.settings,
            current_user["id"]
        )
        return result
    except Exception as e:
        logger.error("Failed to bulk update settings", error=str(e))
        raise HTTPException(status_code=500, detail=f"批量更新配置失败: {str(e)}")


@router.get("/export", response_model=ExportConfigResponse)
async def export_config(
    current_user: dict = Depends(require_permission("settings:general:read"))
):
    """
    导出系统配置

    导出所有配置项为JSON格式，可用于备份或迁移
    """
    try:
        export_data = await general_settings_service.export_config()
        return export_data
    except Exception as e:
        logger.error("Failed to export config", error=str(e))
        raise HTTPException(status_code=500, detail=f"导出配置失败: {str(e)}")


@router.post("/import", response_model=ImportConfigResponse)
async def import_config(
    request: ImportConfigRequest,
    current_user: dict = Depends(require_permission("settings:general:write"))
):
    """
    导入系统配置

    - **config_data**: 配置数据（JSON格式）
    - **overwrite**: 是否覆盖已有配置（默认false）
    """
    try:
        result = await general_settings_service.import_config(
            request.config_data,
            request.overwrite,
            current_user["id"]
        )
        return result
    except Exception as e:
        logger.error("Failed to import config", error=str(e))
        raise HTTPException(status_code=500, detail=f"导入配置失败: {str(e)}")


# ============================================================================
# 高级配置管理端点（从 system_router 迁移）
# ============================================================================

@router.get("/categories", response_model=List[SettingsGroupResponse], summary="获取设置类别列表")
async def get_setting_categories(
    include_configs: bool = Query(False, description="是否包含配置项"),
    current_user: dict = Depends(require_permission("settings:general:read"))
):
    """
    获取所有设置类别及其配置信息

    - **include_configs**: 是否包含每个分类下的详细配置项
    """
    try:
        category_metadata = get_category_metadata()
        groups = []

        for category in SettingCategory:
            metadata = category_metadata.get(category.value, {})

            # 创建基础分组信息
            group_data = {
                "id": metadata.get("id", category.value),
                "name": category.value,
                "displayName": metadata.get("displayName", category.value),
                "description": metadata.get("description", ""),
                "icon": metadata.get("icon", "Settings"),
                "order": metadata.get("order", 99),
                "configs": []
            }

            # 如果需要包含配置项
            if include_configs:
                settings_data = await system_settings_service.get_settings_by_category(category)

                for key, setting_info in settings_data.items():
                    full_setting = system_settings_service.settings_cache.get(key, {})
                    validation_rule = full_setting.get("validation_rule")
                    data_type = setting_info.get("data_type", "string")
                    updated_by_id = full_setting.get("updated_by")

                    group_data["configs"].append(SettingResponse(
                        id=generate_setting_id(key),
                        key=key,
                        value=setting_info["value"],
                        category=category.value,
                        type=data_type,
                        label=generate_setting_label(key),
                        description=setting_info.get("description"),
                        required=setting_info.get("is_required", False),
                        readonly=is_setting_readonly(key),
                        validation=parse_validation_rule(validation_rule, data_type),
                        updated_at=full_setting.get("updated_at"),
                        updated_by=str(updated_by_id) if updated_by_id else None
                    ))

            groups.append(SettingsGroupResponse(**group_data))

        # 按order排序
        groups.sort(key=lambda x: x.order)

        logger.info("Retrieved setting categories",
                   category_count=len(groups),
                   include_configs=include_configs,
                   user_id=current_user["id"])

        return groups

    except Exception as e:
        logger.error("Failed to get setting categories", error=str(e))
        raise HTTPException(status_code=500, detail=f"获取设置类别失败: {str(e)}")


@router.post("/settings/{key}/reset", summary="重置设置为默认值")
async def reset_setting(
    key: str,
    current_user: dict = Depends(require_permission("settings:general:write"))
):
    """
    重置指定设置为默认值

    - **key**: 配置键名
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


@router.get("/info", response_model=SystemInfoResponse, summary="获取系统信息")
async def get_system_info(
    current_user: dict = Depends(require_permission("settings:general:read"))
):
    """
    获取系统基本信息

    包括应用名称、版本、时区、最后备份时间等
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
