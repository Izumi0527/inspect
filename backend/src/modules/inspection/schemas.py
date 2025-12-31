"""
巡检管理模块 - 数据模式定义
"""
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum
from pydantic import Field

from src.shared.base_schema import BaseSchema, PaginatedResponse


class InspectionStatus(str, Enum):
    """巡检状态"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class CheckItemStatus(str, Enum):
    """检查项状态"""
    PASS = "pass"
    FAIL = "fail"
    WARNING = "warning"
    ERROR = "error"
    SKIP = "skip"


class InspectionTaskCreate(BaseSchema):
    """创建巡检任务请求"""
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    template_id: Optional[int] = None
    strategy_id: Optional[int] = None
    device_ids: List[int] = Field(..., min_items=1)
    scheduled_at: Optional[datetime] = None
    priority: int = Field(0, ge=0, le=10)


class InspectionTaskResponse(BaseSchema):
    """巡检任务响应"""
    id: int
    name: str
    description: Optional[str] = None
    template_id: Optional[int] = None
    strategy_id: Optional[int] = None
    status: InspectionStatus
    progress: int = 0
    total_devices: int
    completed_devices: int = 0
    passed_devices: int = 0
    failed_devices: int = 0
    scheduled_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class InspectionTaskListResponse(PaginatedResponse[InspectionTaskResponse]):
    """巡检任务列表响应"""
    pass


class InspectionResultResponse(BaseSchema):
    """巡检结果响应"""
    id: int
    task_id: int
    device_id: int
    device_name: str
    device_ip: str
    status: InspectionStatus
    check_results: List[Dict[str, Any]]
    summary: Dict[str, Any]
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    error_message: Optional[str] = None


class CheckItemResult(BaseSchema):
    """检查项结果"""
    name: str
    type: str
    status: CheckItemStatus
    expected_value: Optional[str] = None
    actual_value: Optional[str] = None
    message: str = ""
    execution_time: int = 0


# 巡检模板
class InspectionTemplateCreate(BaseSchema):
    """创建巡检模板请求"""
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    category: str = Field("custom", description="模板分类: network, system, security, custom")
    device_types: List[str] = Field(default_factory=list, alias="deviceTypes")
    check_items: List[Dict[str, Any]] = Field(default_factory=list, alias="checkItems")
    is_default: bool = Field(False, alias="isBuiltIn")
    is_active: bool = Field(True, alias="isActive")


class InspectionTemplateUpdate(BaseSchema):
    """更新巡检模板请求（部分更新）"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    category: Optional[str] = None
    device_types: Optional[List[str]] = Field(None, alias="deviceTypes")
    check_items: Optional[List[Dict[str, Any]]] = Field(None, alias="checkItems")
    is_default: Optional[bool] = Field(None, alias="isBuiltIn")
    is_active: Optional[bool] = Field(None, alias="isActive")


class InspectionTemplateResponse(BaseSchema):
    """巡检模板响应"""
    id: int
    name: str
    description: Optional[str] = None
    category: str = "custom"
    device_types: List[str] = Field(default_factory=list)
    check_items: List[Dict[str, Any]] = Field(default_factory=list)
    is_default: bool
    is_active: bool = True
    created_by: Optional[str] = None
    created_at: datetime
    updated_at: datetime


# 巡检策略
class InspectionStrategyCreate(BaseSchema):
    """创建巡检策略请求"""
    name: str = Field(..., min_length=1, max_length=100)
    description: Optional[str] = None
    type: str = Field("manual", description="策略类型: scheduled, manual")
    cron: Optional[str] = Field(None, description="Cron表达式（仅 scheduled）")
    devices: List[int] = Field(default_factory=list, description="设备ID列表")
    templates: List[int] = Field(default_factory=list, description="模板ID列表")
    enabled: bool = True


class InspectionStrategyUpdate(BaseSchema):
    """更新巡检策略请求（部分更新）"""
    name: Optional[str] = Field(None, min_length=1, max_length=100)
    description: Optional[str] = None
    type: Optional[str] = Field(None, description="策略类型: scheduled, manual")
    cron: Optional[str] = Field(None, description="Cron表达式（仅 scheduled）")
    devices: Optional[List[int]] = Field(None, description="设备ID列表")
    templates: Optional[List[int]] = Field(None, description="模板ID列表")
    enabled: Optional[bool] = None


class InspectionStrategyResponse(BaseSchema):
    """巡检策略响应"""
    id: int
    name: str
    description: Optional[str] = None
    type: str
    cron: Optional[str] = None
    devices: List[int] = []
    templates: List[int] = []
    enabled: bool
    last_run_time: Optional[datetime] = None
    next_run_time: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime


class InspectionStatistics(BaseSchema):
    """巡检统计"""
    total_tasks: int
    completed_tasks: int
    running_tasks: int
    failed_tasks: int
    total_devices_inspected: int
    pass_rate: float
    recent_7d_tasks: int
    recent_7d_pass_rate: float
