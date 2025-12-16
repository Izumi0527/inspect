"""
通用设置服务

完整实现，从 services/settings/general_service.py 迁移
"""
from typing import Dict, Any, List, Optional
from datetime import datetime
import structlog

from src.services.common import system_settings_service, SettingCategory
from src.schemas.settings.general import (
    SettingItem,
    BulkUpdateResponse,
    ExportConfigResponse,
    ImportConfigResponse
)

logger = structlog.get_logger()


class GeneralSettingsService:
    """通用配置服务"""

    def __init__(self):
        self.settings_service = system_settings_service

    async def get_all_settings(self, category: Optional[str] = None) -> List[SettingItem]:
        """获取所有配置"""
        try:
            if category:
                settings_dict = await self.settings_service.get_settings_by_category(
                    SettingCategory(category)
                )
                result = []
                for key, value in settings_dict.items():
                    result.append(SettingItem(
                        key=key,
                        value=value['value'],
                        category=category,
                        type=value.get('data_type', 'string'),
                        description=value.get('description'),
                        required=value.get('is_required', False)
                    ))
                return result
            else:
                result = []
                for key, setting in self.settings_service.settings_cache.items():
                    value = setting.get('value')
                    if setting.get('is_encrypted', False) and value:
                        value = self.settings_service._decrypt_value(value)

                    result.append(SettingItem(
                        key=key,
                        value=value,
                        category=setting.get('category', 'system'),
                        type=setting.get('data_type', 'string'),
                        label=setting.get('description'),
                        description=setting.get('description'),
                        required=setting.get('is_required', False),
                        readonly=False,
                        validation=setting.get('validation_rule'),
                        updated_at=datetime.fromisoformat(setting['updated_at'])
                                   if setting.get('updated_at') else None
                    ))
                return result
        except Exception as e:
            logger.error("Failed to get all settings", error=str(e))
            raise

    async def get_setting(self, key: str) -> Optional[SettingItem]:
        """获取单个配置"""
        try:
            value = await self.settings_service.get_setting(key)
            if value is None:
                return None

            setting = self.settings_service.settings_cache.get(key, {})
            return SettingItem(
                key=key,
                value=value,
                category=setting.get('category', 'system'),
                type=setting.get('data_type', 'string'),
                description=setting.get('description')
            )
        except Exception as e:
            logger.error("Failed to get setting", key=key, error=str(e))
            raise

    async def update_setting(
        self, key: str, value: Any, user_id: Optional[int] = None
    ) -> SettingItem:
        """更新单个配置"""
        try:
            success = await self.settings_service.set_setting(key, value, user_id)
            if not success:
                raise ValueError(f"Failed to update setting: {key}")
            return await self.get_setting(key)
        except Exception as e:
            logger.error("Failed to update setting", key=key, error=str(e))
            raise

    async def bulk_update_settings(
        self, settings: Dict[str, Any], user_id: Optional[int] = None
    ) -> BulkUpdateResponse:
        """批量更新配置"""
        try:
            results = await self.settings_service.bulk_update_settings(settings, user_id)
            updated_count = sum(1 for success in results.values() if success)
            failed_keys = [key for key, success in results.items() if not success]

            return BulkUpdateResponse(
                updated_count=updated_count,
                failed_keys=failed_keys,
                message=f"成功更新 {updated_count} 个配置项" +
                        (f"，失败 {len(failed_keys)} 个" if failed_keys else "")
            )
        except Exception as e:
            logger.error("Failed to bulk update settings", error=str(e))
            raise

    async def export_config(self) -> ExportConfigResponse:
        """导出配置"""
        try:
            settings = await self.get_all_settings()
            config_data = {}
            for setting in settings:
                config_data[setting.key] = {
                    'value': setting.value,
                    'category': setting.category,
                    'type': setting.type,
                    'description': setting.description
                }

            return ExportConfigResponse(
                config_data=config_data,
                export_time=datetime.now(),
                total_count=len(config_data)
            )
        except Exception as e:
            logger.error("Failed to export config", error=str(e))
            raise

    async def import_config(
        self,
        config_data: Dict[str, Any],
        overwrite: bool = False,
        user_id: Optional[int] = None
    ) -> ImportConfigResponse:
        """导入配置"""
        try:
            imported_count = 0
            skipped_count = 0
            failed_keys = []

            for key, config in config_data.items():
                try:
                    existing = await self.settings_service.get_setting(key)
                    if existing and not overwrite:
                        skipped_count += 1
                        continue

                    value = config.get('value') if isinstance(config, dict) else config
                    success = await self.settings_service.set_setting(key, value, user_id)

                    if success:
                        imported_count += 1
                    else:
                        failed_keys.append(key)
                except Exception as e:
                    logger.error("Failed to import setting", key=key, error=str(e))
                    failed_keys.append(key)

            return ImportConfigResponse(
                imported_count=imported_count,
                skipped_count=skipped_count,
                failed_keys=failed_keys,
                message=f"成功导入 {imported_count} 个配置项" +
                        (f"，跳过 {skipped_count} 个" if skipped_count else "") +
                        (f"，失败 {len(failed_keys)} 个" if failed_keys else "")
            )
        except Exception as e:
            logger.error("Failed to import config", error=str(e))
            raise


# 全局实例
general_settings_service = GeneralSettingsService()
