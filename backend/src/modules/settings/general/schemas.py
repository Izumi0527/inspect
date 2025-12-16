"""
通用设置数据模式

重导出原有实现，保持向后兼容
"""
from src.schemas.settings.general import (
    SettingItem,
    BulkUpdateRequest,
    BulkUpdateResponse,
    ExportConfigResponse,
    ImportConfigRequest,
    ImportConfigResponse,
)

__all__ = [
    "SettingItem",
    "BulkUpdateRequest",
    "BulkUpdateResponse",
    "ExportConfigResponse",
    "ImportConfigRequest",
    "ImportConfigResponse",
]
