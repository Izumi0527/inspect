"""
General Settings Schemas
通用配置相关的Pydantic模型
"""
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field
from datetime import datetime


class SettingItem(BaseModel):
    """单个配置项"""
    id: Optional[str] = None
    key: str = Field(..., description="配置键")
    value: Any = Field(..., description="配置值")
    category: str = Field(default="system", description="配置分类")
    type: str = Field(default="string", description="数据类型")
    label: Optional[str] = Field(None, description="显示标签")
    description: Optional[str] = Field(None, description="配置描述")
    required: bool = Field(default=False, description="是否必填")
    readonly: bool = Field(default=False, description="是否只读")
    validation: Optional[str] = Field(None, description="验证规则")
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class BulkUpdateRequest(BaseModel):
    """批量更新配置请求"""
    settings: Dict[str, Any] = Field(..., description="配置键值对")

    class Config:
        json_schema_extra = {
            "example": {
                "settings": {
                    "system.application_name": "网络设备巡检系统",
                    "system.timezone": "Asia/Shanghai",
                    "system.default_language": "zh-CN"
                }
            }
        }


class BulkUpdateResponse(BaseModel):
    """批量更新配置响应"""
    updated_count: int = Field(..., description="更新数量")
    failed_keys: List[str] = Field(default_factory=list, description="失败的键")
    message: str = Field(default="批量更新成功")


class ExportConfigResponse(BaseModel):
    """导出配置响应"""
    config_data: Dict[str, Any] = Field(..., description="配置数据")
    export_time: datetime = Field(..., description="导出时间")
    total_count: int = Field(..., description="配置项总数")


class ImportConfigRequest(BaseModel):
    """导入配置请求"""
    config_data: Dict[str, Any] = Field(..., description="配置数据")
    overwrite: bool = Field(default=False, description="是否覆盖已有配置")


class ImportConfigResponse(BaseModel):
    """导入配置响应"""
    imported_count: int = Field(..., description="导入数量")
    skipped_count: int = Field(..., description="跳过数量")
    failed_keys: List[str] = Field(default_factory=list, description="失败的键")
    message: str = Field(default="导入成功")
