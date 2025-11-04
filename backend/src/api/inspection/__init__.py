from fastapi import APIRouter, HTTPException, Depends, Query, BackgroundTasks
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime, timedelta
import structlog
import os
from croniter import croniter
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.permissions import require_permission
from src.core.database import get_db_session
from src.services.inspection import inspection_service
from src.services.report_generator import report_generator
from src.models.inspection import InspectionStatus, InspectionTrigger, CheckItemStatus
from src.repositories.strategy_repository import StrategyRepository
from src.repositories.template_repository import TemplateRepository
from src.repositories.inspection_repository import InspectionRepository
from src.repositories.device_repository import DeviceRepository
from src.services.cache_service import cache_service

logger = structlog.get_logger()
router = APIRouter()

# 巡检相关数据模型
class InspectionTemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    category: str = "custom"  # network, system, security, custom
    device_types: List[str] = []
    check_items: List[dict] = []

class InspectionTemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None  # network, system, security, custom
    device_types: Optional[List[str]] = None
    check_items: Optional[List[dict]] = None
    is_active: Optional[bool] = None

class InspectionTemplate(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    category: str = "custom"  # network, system, security, custom
    device_types: List[str] = []
    check_items: List[dict] = []
    is_default: bool = False
    is_active: bool = True
    created_at: datetime
    updated_at: datetime

class InspectionCreate(BaseModel):
    device_id: int
    template_id: Optional[int] = None
    name: Optional[str] = None
    scheduled_at: Optional[datetime] = None

class InspectionScheduleCreate(BaseModel):
    name: str
    description: Optional[str] = None
    cron_expression: str
    device_group_id: Optional[int] = None
    template_id: int

# 巡检策略相关数据模型
class InspectionStrategyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=100, description="策略名称，长度1-100字符")
    description: Optional[str] = Field(None, max_length=500, description="策略描述，最多500字符")
    type: str = Field(default="manual", description="策略类型：manual（手动）或 scheduled（定时）")
    cron: Optional[str] = Field(None, max_length=100, description="定时表达式（仅 scheduled 类型）")
    devices: List[int] = Field(default=[], description="目标设备ID列表")
    templates: List[int] = Field(default=[], description="使用的模板ID列表")
    enabled: bool = Field(default=True, description="是否启用")

class InspectionStrategyUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=1, max_length=100, description="策略名称，长度1-100字符")
    description: Optional[str] = Field(None, max_length=500, description="策略描述，最多500字符")
    type: Optional[str] = Field(None, description="策略类型：manual（手动）或 scheduled（定时）")
    cron: Optional[str] = Field(None, max_length=100, description="定时表达式（仅 scheduled 类型）")
    devices: Optional[List[int]] = Field(None, description="目标设备ID列表")
    templates: Optional[List[int]] = Field(None, description="使用的模板ID列表")
    enabled: Optional[bool] = Field(None, description="是否启用")

class InspectionStrategy(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    type: str = "manual"
    cron: Optional[str] = None
    devices: List[int] = []
    templates: List[int] = []
    enabled: bool = True
    created_at: datetime
    updated_at: datetime
    next_run_time: Optional[datetime] = None

class Inspection(BaseModel):
    id: int
    device_id: int
    template_id: Optional[int] = None
    name: Optional[str] = None
    trigger: InspectionTrigger
    status: InspectionStatus
    scheduled_at: Optional[datetime] = None
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    total_checks: int = 0
    passed_checks: int = 0
    failed_checks: int = 0
    error_message: Optional[str] = None
    created_at: datetime

class InspectionResult(BaseModel):
    id: int
    inspection_id: int
    check_item_name: str
    check_item_type: str
    status: CheckItemStatus
    expected_value: Optional[str] = None
    actual_value: Optional[str] = None
    message: Optional[str] = None
    execution_time: int = 0

class ReportGenerateRequest(BaseModel):
    inspection_ids: List[int]
    format_type: str = "excel"  # "excel" 或 "pdf"
    include_charts: bool = True
    include_device_details: bool = True
    include_summary: bool = True

class BatchReportRequest(BaseModel):
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    device_ids: Optional[List[int]] = None
    template_ids: Optional[List[int]] = None
    status_filter: Optional[List[InspectionStatus]] = None
    format_type: str = "excel"
    include_charts: bool = True

# 模拟数据
TEMP_TEMPLATES = {
    1: {
        "id": 1,
        "name": "标准网络设备巡检",
        "description": "适用于交换机和路由器的标准巡检模板",
        "device_types": ["switch", "router"],
        "check_items": inspection_service.get_default_check_items("switch"),
        "is_default": True,
        "is_active": True,
        "created_at": datetime.now(),
        "updated_at": datetime.now()
    },
    2: {
        "id": 2,
        "name": "服务器巡检",
        "description": "适用于服务器的巡检模板",
        "device_types": ["server"],
        "check_items": inspection_service.get_default_check_items("server"),
        "is_default": False,
        "is_active": True,
        "created_at": datetime.now(),
        "updated_at": datetime.now()
    }
}

TEMP_STRATEGIES = {
    1: {
        "id": 1,
        "name": "每日网络设备巡检",
        "description": "每天凌晨2点自动巡检所有网络设备",
        "type": "scheduled",
        "cron": "0 2 * * *",
        "devices": [],  # 空表示所有设备
        "templates": [1],  # 使用标准网络设备巡检模板
        "enabled": True,
        "created_at": datetime.now(),
        "updated_at": datetime.now(),
        "next_run_time": datetime.now() + timedelta(days=1)
    }
}

TEMP_INSPECTIONS = {}
TEMP_INSPECTION_RESULTS = {}

@router.get("/templates", response_model=List[InspectionTemplate], summary="获取巡检模板列表")
async def get_inspection_templates(
    skip: int = Query(0, ge=0, description="跳过的记录数"),
    limit: int = Query(10, ge=1, le=100, description="返回的记录数"),
    device_type: Optional[str] = Query(None, description="设备类型过滤"),
    is_active: Optional[bool] = Query(None, description="是否启用过滤"),
    current_user: dict = Depends(require_permission("inspections:read")),
    db: AsyncSession = Depends(get_db_session)
):
    """
    获取巡检模板列表
    """
    # 创建 Repository
    repo = TemplateRepository(db)

    # 构建过滤条件
    filters = {}
    if device_type:
        filters["device_type"] = device_type
    if is_active is not None:
        filters["is_active"] = is_active

    # 计算页码
    page = (skip // limit) + 1

    # 查询数据库
    templates_list, total = await repo.list_templates(
        page=page,
        page_size=limit,
        filters=filters,
        order_by="updated_at",
        order_direction="desc"
    )

    logger.info("Retrieved inspection templates",
                count=len(templates_list),
                total=total,
                user_id=current_user["id"])

    # 将数据库模型转换为 Pydantic 模型
    return [
        InspectionTemplate(
            id=template.id,
            name=template.name,
            description=template.description,
            category=template.category,
            device_types=template.device_types or [],
            check_items=template.check_items or [],
            is_default=template.is_default,
            is_active=template.is_active,
            created_at=template.created_at,
            updated_at=template.updated_at
        )
        for template in templates_list
    ]

@router.post("/templates", response_model=InspectionTemplate, summary="创建巡检模板")
async def create_inspection_template(
    template: InspectionTemplateCreate,
    current_user: dict = Depends(require_permission("inspections:create")),
    db: AsyncSession = Depends(get_db_session)
):
    """
    创建新的巡检模板
    """
    # 创建 Repository
    repo = TemplateRepository(db)

    # 检查模板名称是否已存在
    if await repo.check_name_exists(template.name):
        raise HTTPException(
            status_code=400,
            detail=f"模板名称 {template.name} 已存在"
        )

    # 创建模板数据
    template_data = {
        "name": template.name,
        "description": template.description,
        "category": template.category,
        "device_types": template.device_types,
        "check_items": template.check_items,
        "is_default": False,
        "is_active": True
    }

    # 保存到数据库
    new_template = await repo.create(template_data)

    logger.info("Inspection template created",
                template_id=new_template.id,
                name=template.name,
                created_by=current_user["id"])

    return InspectionTemplate(
        id=new_template.id,
        name=new_template.name,
        description=new_template.description,
        category=new_template.category,
        device_types=new_template.device_types or [],
        check_items=new_template.check_items or [],
        is_default=new_template.is_default,
        is_active=new_template.is_active,
        created_at=new_template.created_at,
        updated_at=new_template.updated_at
    )

@router.get("/templates/{template_id}", response_model=InspectionTemplate, summary="获取巡检模板详情")
async def get_inspection_template(
    template_id: int,
    current_user: dict = Depends(require_permission("inspections:read")),
    db: AsyncSession = Depends(get_db_session)
):
    """
    获取指定巡检模板的详细信息
    """
    # 创建 Repository
    repo = TemplateRepository(db)

    # 查询数据库
    template = await repo.get_by_id(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="巡检模板不存在")

    return InspectionTemplate(
        id=template.id,
        name=template.name,
        description=template.description,
        category=template.category,
        device_types=template.device_types or [],
        check_items=template.check_items or [],
        is_default=template.is_default,
        is_active=template.is_active,
        created_at=template.created_at,
        updated_at=template.updated_at
    )

@router.put("/templates/{template_id}", response_model=InspectionTemplate, summary="更新巡检模板")
async def update_inspection_template(
    template_id: int,
    template_update: InspectionTemplateUpdate,
    current_user: dict = Depends(require_permission("inspections:update")),
    db: AsyncSession = Depends(get_db_session)
):
    """
    更新巡检模板
    """
    # 创建 Repository
    repo = TemplateRepository(db)

    # 检查模板是否存在
    template = await repo.get_by_id(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="巡检模板不存在")

    # 检查名称冲突
    if template_update.name:
        if await repo.check_name_exists(template_update.name, exclude_id=template_id):
            raise HTTPException(
                status_code=400,
                detail=f"模板名称 {template_update.name} 已存在"
            )

    # 准备更新数据
    update_data = template_update.dict(exclude_unset=True)

    # 更新数据库
    updated_template = await repo.update(template_id, update_data)
    if not updated_template:
        raise HTTPException(status_code=404, detail="更新失败")

    logger.info("Inspection template updated",
                template_id=template_id,
                fields=list(update_data.keys()),
                updated_by=current_user["id"])

    return InspectionTemplate(
        id=updated_template.id,
        name=updated_template.name,
        description=updated_template.description,
        category=updated_template.category,
        device_types=updated_template.device_types or [],
        check_items=updated_template.check_items or [],
        is_default=updated_template.is_default,
        is_active=updated_template.is_active,
        created_at=updated_template.created_at,
        updated_at=updated_template.updated_at
    )

@router.delete("/templates/{template_id}", summary="删除巡检模板")
async def delete_inspection_template(
    template_id: int,
    current_user: dict = Depends(require_permission("inspections:delete")),
    db: AsyncSession = Depends(get_db_session)
):
    """
    删除巡检模板
    """
    # 创建 Repository
    repo = TemplateRepository(db)

    # 检查模板是否存在
    template = await repo.get_by_id(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="巡检模板不存在")

    # 检查是否是默认模板
    if template.is_default:
        raise HTTPException(status_code=400, detail="默认模板不能删除")

    # 删除数据库记录
    success = await repo.delete(template_id)
    if not success:
        raise HTTPException(status_code=500, detail="删除失败")

    logger.info("Inspection template deleted",
                template_id=template_id,
                deleted_by=current_user["id"])

    return {"message": "巡检模板删除成功"}

@router.get("/", response_model=List[Inspection], summary="获取巡检记录列表")
async def get_inspections(
    skip: int = Query(0, ge=0, description="跳过的记录数"),
    limit: int = Query(10, ge=1, le=100, description="返回的记录数"),
    device_id: Optional[int] = Query(None, description="设备ID过滤"),
    status: Optional[InspectionStatus] = Query(None, description="状态过滤"),
    current_user: dict = Depends(require_permission("inspections:read"))
):
    """
    获取巡检记录列表
    """
    inspections = list(TEMP_INSPECTIONS.values())
    
    # 应用过滤器
    if device_id:
        inspections = [i for i in inspections if i.get("device_id") == device_id]
    if status:
        inspections = [i for i in inspections if i.get("status") == status]
    
    # 按创建时间倒序排列
    inspections.sort(key=lambda x: x.get("created_at", datetime.min), reverse=True)
    
    # 应用分页
    total = len(inspections)
    inspections = inspections[skip:skip + limit]
    
    logger.info("Retrieved inspections", 
                count=len(inspections), 
                total=total,
                user_id=current_user["id"])
    
    return [Inspection(**inspection) for inspection in inspections]

@router.post("/", response_model=Inspection, summary="创建巡检任务")
async def create_inspection(
    inspection: InspectionCreate,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(require_permission("inspections:create")),
    db: AsyncSession = Depends(get_db_session)
):
    """
    创建新的巡检任务并保存到数据库
    """
    # 验证设备存在（从数据库查询）
    from src.repositories.device_repository import DeviceRepository
    device_repo = DeviceRepository(db)
    device = await device_repo.get_device_by_id(inspection.device_id)
    if not device:
        raise HTTPException(status_code=404, detail="设备不存在")

    # 验证模板存在
    template_repo = TemplateRepository(db)
    template = None
    if inspection.template_id:
        template = await template_repo.get_by_id(inspection.template_id)
        if not template:
            raise HTTPException(status_code=404, detail="巡检模板不存在")
    else:
        # 使用默认模板
        device_type = device.device_type.value if hasattr(device.device_type, 'value') else str(device.device_type)
        templates = await template_repo.list_templates(
            is_active=True,
            device_type=device_type
        )
        # 查找默认模板
        for t in templates:
            if t.is_default:
                template = t
                inspection.template_id = t.id
                break

        if not template:
            raise HTTPException(status_code=400, detail="未找到适合的默认巡检模板")

    # 创建巡检记录到数据库
    inspection_repo = InspectionRepository(db)
    new_inspection = await inspection_repo.create_inspection(
        device_id=inspection.device_id,
        template_id=inspection.template_id,
        schedule_id=None,
        name=inspection.name or f"{device.name} - {template.name}",
        trigger=InspectionTrigger.MANUAL,
        created_by=current_user["id"]
    )

    # 构造设备信息字典（用于执行）
    device_info = {
        "id": device.id,
        "name": device.name,
        "ip_address": device.ip_address,
        "device_type": device_type,
        "vendor": device.vendor.value if hasattr(device.vendor, 'value') else str(device.vendor),
        "model": device.model,
        "snmp_community": device.snmp_community,
        "snmp_version": device.snmp_version,
        "ssh_username": device.ssh_username,
        "ssh_password": device.ssh_password
    }

    # 构造模板配置字典
    template_config = {
        "id": template.id,
        "name": template.name,
        "check_items": template.check_items or []
    }

    # 如果是立即执行，添加到后台任务
    now = datetime.now()
    if not inspection.scheduled_at or inspection.scheduled_at <= now:
        background_tasks.add_task(
            execute_inspection_task,
            new_inspection.id,
            device_info,
            template_config
        )

    logger.info("Inspection created in database",
                inspection_id=new_inspection.id,
                device_id=inspection.device_id,
                template_id=inspection.template_id,
                created_by=current_user["id"])

    # 转换为响应模型
    return Inspection(
        id=new_inspection.id,
        device_id=new_inspection.device_id,
        template_id=new_inspection.template_id,
        name=new_inspection.name,
        trigger=new_inspection.trigger.value,
        status=new_inspection.status.value,
        scheduled_at=new_inspection.scheduled_at,
        created_at=new_inspection.created_at,
        updated_at=new_inspection.updated_at
    )

@router.get("/inspections/{inspection_id}", response_model=Inspection, summary="获取巡检详情")
async def get_inspection(
    inspection_id: int,
    current_user: dict = Depends(require_permission("inspections:read"))
):
    """
    获取指定巡检的详细信息

    注意：此路由路径已从 /{inspection_id} 改为 /inspections/{inspection_id}，
    以避免与 /strategies 和 /stats 等静态路由发生冲突。
    """
    inspection = TEMP_INSPECTIONS.get(inspection_id)
    if not inspection:
        raise HTTPException(status_code=404, detail="巡检记录不存在")

    # 如果巡检正在运行，更新状态
    if inspection["status"] == InspectionStatus.RUNNING:
        current_status = await inspection_service.get_inspection_status(inspection_id)
        if current_status:
            inspection.update(current_status)
            TEMP_INSPECTIONS[inspection_id] = inspection

    return Inspection(**inspection)

@router.get("/{inspection_id}/results", response_model=List[InspectionResult], summary="获取巡检结果")
async def get_inspection_results(
    inspection_id: int,
    current_user: dict = Depends(require_permission("inspections:read"))
):
    """
    获取巡检结果详情
    """
    inspection = TEMP_INSPECTIONS.get(inspection_id)
    if not inspection:
        raise HTTPException(status_code=404, detail="巡检记录不存在")
    
    # 获取巡检结果
    results = TEMP_INSPECTION_RESULTS.get(inspection_id, [])
    
    # 如果巡检正在运行，获取实时结果
    if inspection["status"] == InspectionStatus.RUNNING:
        current_status = await inspection_service.get_inspection_status(inspection_id)
        if current_status and current_status.get("results"):
            results = current_status["results"]
    
    logger.info("Retrieved inspection results", 
                inspection_id=inspection_id,
                results_count=len(results),
                user_id=current_user["id"])
    
    # 转换为响应模型
    result_models = []
    for i, result in enumerate(results):
        result_model = {
            "id": i + 1,
            "inspection_id": inspection_id,
            **result
        }
        result_models.append(InspectionResult(**result_model))
    
    return result_models

@router.post("/{inspection_id}/cancel", summary="取消巡检")
async def cancel_inspection(
    inspection_id: int,
    current_user: dict = Depends(require_permission("inspections:update"))
):
    """
    取消正在执行的巡检
    """
    inspection = TEMP_INSPECTIONS.get(inspection_id)
    if not inspection:
        raise HTTPException(status_code=404, detail="巡检记录不存在")
    
    if inspection["status"] not in [InspectionStatus.PENDING, InspectionStatus.RUNNING]:
        raise HTTPException(status_code=400, detail="当前巡检状态不允许取消")
    
    # 更新巡检状态
    inspection["status"] = InspectionStatus.CANCELLED
    inspection["completed_at"] = datetime.now()
    inspection["updated_at"] = datetime.now()
    
    logger.info("Inspection cancelled", 
                inspection_id=inspection_id,
                cancelled_by=current_user["id"])
    
    return {"message": "巡检已取消"}

async def execute_inspection_task(inspection_id: int, device_info: dict, template_config: dict):
    """后台执行巡检任务 - 使用数据库持久化"""
    from src.core.database import get_db_session_context

    try:
        # 创建新的数据库 session 用于后台任务
        async with get_db_session_context() as db:
            # 执行巡检（InspectionService 会自动更新数据库）
            result = await inspection_service.execute_inspection(
                inspection_id,
                device_info,
                template_config,
                db_session=db
            )

            logger.info("Inspection task completed",
                       inspection_id=inspection_id,
                       status=result["status"])

    except Exception as e:
        # 处理异常 - 尝试更新数据库状态
        logger.error("Inspection task failed",
                    inspection_id=inspection_id,
                    error=str(e),
                    exc_info=True)

        try:
            async with get_db_session_context() as db:
                inspection_repo = InspectionRepository(db)
                await inspection_repo.update_inspection_status(
                    inspection_id,
                    InspectionStatus.FAILED,
                    error_message=str(e),
                    error_details={"exception": str(e), "type": type(e).__name__}
                )
        except Exception as update_error:
            logger.error("Failed to update inspection status after error",
                        inspection_id=inspection_id,
                        error=str(update_error))

# ============= 报告生成相关端点 =============

@router.post("/{inspection_id}/report", summary="生成单次巡检报告")
async def generate_inspection_report(
    inspection_id: int,
    format_type: str = Query("excel", pattern="^(excel|pdf)$", description="报告格式"),
    include_charts: bool = Query(True, description="是否包含图表"),
    current_user: dict = Depends(require_permission("inspections:read"))
):
    """
    生成指定巡检的报告
    """
    # 验证巡检存在
    inspection = TEMP_INSPECTIONS.get(inspection_id)
    if not inspection:
        raise HTTPException(status_code=404, detail="巡检记录不存在")
    
    # 验证巡检已完成
    if inspection["status"] not in [InspectionStatus.COMPLETED, InspectionStatus.FAILED]:
        raise HTTPException(status_code=400, detail="只能为已完成的巡检生成报告")
    
    try:
        # 获取设备信息
        from src.api.devices import TEMP_DEVICES
        device_info = TEMP_DEVICES.get(inspection["device_id"])
        if not device_info:
            raise HTTPException(status_code=404, detail="关联的设备不存在")
        
        # 获取巡检结果
        inspection_results = TEMP_INSPECTION_RESULTS.get(inspection_id, [])
        
        # 构造报告数据
        report_data = {
            "inspection_id": inspection_id,
            "inspection_name": inspection.get("name", f"巡检报告_{inspection_id}"),
            "inspection_time": inspection.get("completed_at", inspection.get("created_at")).strftime('%Y-%m-%d %H:%M:%S'),
            "status": inspection.get("status"),
            "execution_duration": _calculate_execution_duration(inspection),
            "devices": [{
                "device_name": device_info.get("name", "Unknown"),
                "ip_address": device_info.get("ip_address", "N/A"),
                "device_type": device_info.get("device_type", "N/A"),
                "vendor": device_info.get("vendor", "N/A"),
                "model": device_info.get("model", "N/A"),
                "software_version": device_info.get("software_version", "N/A"),
                "uptime": device_info.get("uptime", "N/A"),
                "last_inspection": inspection.get("completed_at", inspection.get("created_at")).strftime('%Y-%m-%d %H:%M:%S'),
                "inspection_status": "completed" if inspection.get("status") == InspectionStatus.COMPLETED else "failed",
                "pass_rate": _calculate_pass_rate(inspection_results),
                "issue_count": len([r for r in inspection_results if r.get("status") in [CheckItemStatus.FAIL, CheckItemStatus.ERROR]]),
                "performance_metrics": _extract_performance_metrics(inspection_results),
                "check_results": inspection_results
            }],
            "summary_stats": {
                "total_checks": inspection.get("total_checks", 0),
                "passed_checks": inspection.get("passed_checks", 0),
                "failed_checks": inspection.get("failed_checks", 0),
                "warning_checks": len([r for r in inspection_results if r.get("status") == CheckItemStatus.WARNING]),
                "error_checks": len([r for r in inspection_results if r.get("status") == CheckItemStatus.ERROR]),
                "pass_rate": _calculate_pass_rate(inspection_results)
            }
        }
        
        # 生成报告
        report_path = await report_generator.generate_inspection_report(
            report_data, 
            format_type, 
            include_charts
        )
        
        # 构造文件名
        filename = f"inspection_report_{inspection_id}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.{format_type}"
        
        logger.info("Inspection report generated", 
                   inspection_id=inspection_id,
                   format_type=format_type,
                   file_path=report_path,
                   generated_by=current_user["id"])
        
        # 返回文件下载响应
        return FileResponse(
            path=report_path,
            filename=filename,
            media_type='application/octet-stream'
        )
        
    except Exception as e:
        logger.error("Failed to generate inspection report", 
                    inspection_id=inspection_id,
                    error=str(e))
        raise HTTPException(status_code=500, detail=f"生成报告失败: {str(e)}")

@router.post("/reports/batch", summary="生成批量巡检报告")
async def generate_batch_report(
    request: BatchReportRequest,
    current_user: dict = Depends(require_permission("inspections:read"))
):
    """
    生成批量巡检报告
    """
    try:
        # 筛选符合条件的巡检记录
        filtered_inspections = []
        for inspection in TEMP_INSPECTIONS.values():
            # 状态过滤
            if request.status_filter and inspection.get("status") not in request.status_filter:
                continue
            
            # 时间范围过滤
            inspection_time = inspection.get("completed_at") or inspection.get("created_at")
            if request.start_date and inspection_time < request.start_date:
                continue
            if request.end_date and inspection_time > request.end_date:
                continue
            
            # 设备过滤
            if request.device_ids and inspection.get("device_id") not in request.device_ids:
                continue
            
            # 模板过滤
            if request.template_ids and inspection.get("template_id") not in request.template_ids:
                continue
            
            # 只包含已完成的巡检
            if inspection.get("status") in [InspectionStatus.COMPLETED, InspectionStatus.FAILED]:
                filtered_inspections.append(inspection)
        
        if not filtered_inspections:
            raise HTTPException(status_code=404, detail="未找到符合条件的巡检记录")
        
        # 构造批量报告数据
        batch_report_data = []
        from src.api.devices import TEMP_DEVICES
        
        for inspection in filtered_inspections:
            # 获取设备信息
            device_info = TEMP_DEVICES.get(inspection["device_id"])
            if not device_info:
                continue
            
            # 获取巡检结果
            inspection_results = TEMP_INSPECTION_RESULTS.get(inspection["id"], [])
            
            # 构造单次巡检数据
            inspection_data = {
                "inspection_id": inspection["id"],
                "inspection_name": inspection.get("name", f"巡检_{inspection['id']}"),
                "inspection_time": (inspection.get("completed_at") or inspection.get("created_at")).strftime('%Y-%m-%d %H:%M:%S'),
                "status": inspection.get("status"),
                "execution_duration": _calculate_execution_duration(inspection),
                "devices": [{
                    "device_name": device_info.get("name", "Unknown"),
                    "ip_address": device_info.get("ip_address", "N/A"),
                    "device_type": device_info.get("device_type", "N/A"),
                    "vendor": device_info.get("vendor", "N/A"),
                    "inspection_status": "completed" if inspection.get("status") == InspectionStatus.COMPLETED else "failed",
                    "pass_rate": _calculate_pass_rate(inspection_results),
                    "issue_count": len([r for r in inspection_results if r.get("status") in [CheckItemStatus.FAIL, CheckItemStatus.ERROR]]),
                    "check_results": inspection_results
                }],
                "summary_stats": {
                    "total_checks": inspection.get("total_checks", 0),
                    "passed_checks": inspection.get("passed_checks", 0),
                    "failed_checks": inspection.get("failed_checks", 0),
                    "warning_checks": len([r for r in inspection_results if r.get("status") == CheckItemStatus.WARNING]),
                    "error_checks": len([r for r in inspection_results if r.get("status") == CheckItemStatus.ERROR]),
                    "pass_rate": _calculate_pass_rate(inspection_results)
                }
            }
            batch_report_data.append(inspection_data)
        
        # 生成批量报告
        report_path = await report_generator.generate_batch_report(
            batch_report_data, 
            request.format_type
        )
        
        # 构造文件名
        filename = f"batch_inspection_report_{len(batch_report_data)}records_{datetime.now().strftime('%Y%m%d_%H%M%S')}.{request.format_type}"
        
        logger.info("Batch inspection report generated", 
                   inspection_count=len(batch_report_data),
                   format_type=request.format_type,
                   file_path=report_path,
                   generated_by=current_user["id"])
        
        # 返回文件下载响应
        return FileResponse(
            path=report_path,
            filename=filename,
            media_type='application/octet-stream'
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to generate batch report", 
                    error=str(e))
        raise HTTPException(status_code=500, detail=f"生成批量报告失败: {str(e)}")

@router.post("/reports/generate", summary="生成自定义巡检报告")
async def generate_custom_report(
    request: ReportGenerateRequest,
    current_user: dict = Depends(require_permission("inspections:read"))
):
    """
    生成自定义巡检报告（支持多个巡检ID）
    """
    try:
        # 验证巡检ID
        valid_inspections = []
        from src.api.devices import TEMP_DEVICES
        
        for inspection_id in request.inspection_ids:
            inspection = TEMP_INSPECTIONS.get(inspection_id)
            if not inspection:
                raise HTTPException(status_code=404, detail=f"巡检记录 {inspection_id} 不存在")
            
            # 验证巡检已完成
            if inspection["status"] not in [InspectionStatus.COMPLETED, InspectionStatus.FAILED]:
                raise HTTPException(status_code=400, detail=f"巡检 {inspection_id} 尚未完成，无法生成报告")
            
            valid_inspections.append(inspection)
        
        # 构造自定义报告数据
        all_devices = []
        total_stats = {
            "total_checks": 0,
            "passed_checks": 0,
            "failed_checks": 0,
            "warning_checks": 0,
            "error_checks": 0,
            "pass_rate": 0
        }
        
        for inspection in valid_inspections:
            # 获取设备信息
            device_info = TEMP_DEVICES.get(inspection["device_id"])
            if not device_info:
                continue
            
            # 获取巡检结果
            inspection_results = TEMP_INSPECTION_RESULTS.get(inspection["id"], [])
            
            if request.include_device_details:
                device_data = {
                    "device_name": device_info.get("name", "Unknown"),
                    "ip_address": device_info.get("ip_address", "N/A"),
                    "device_type": device_info.get("device_type", "N/A"),
                    "vendor": device_info.get("vendor", "N/A"),
                    "model": device_info.get("model", "N/A"),
                    "software_version": device_info.get("software_version", "N/A"),
                    "last_inspection": (inspection.get("completed_at") or inspection.get("created_at")).strftime('%Y-%m-%d %H:%M:%S'),
                    "inspection_status": "completed" if inspection.get("status") == InspectionStatus.COMPLETED else "failed",
                    "pass_rate": _calculate_pass_rate(inspection_results),
                    "issue_count": len([r for r in inspection_results if r.get("status") in [CheckItemStatus.FAIL, CheckItemStatus.ERROR]]),
                    "performance_metrics": _extract_performance_metrics(inspection_results),
                    "check_results": inspection_results
                }
            else:
                device_data = {
                    "device_name": device_info.get("name", "Unknown"),
                    "ip_address": device_info.get("ip_address", "N/A"),
                    "inspection_status": "completed" if inspection.get("status") == InspectionStatus.COMPLETED else "failed",
                    "pass_rate": _calculate_pass_rate(inspection_results),
                    "check_results": inspection_results
                }
            
            all_devices.append(device_data)
            
            # 累计统计数据
            if request.include_summary:
                total_stats["total_checks"] += inspection.get("total_checks", 0)
                total_stats["passed_checks"] += inspection.get("passed_checks", 0)
                total_stats["failed_checks"] += inspection.get("failed_checks", 0)
                total_stats["warning_checks"] += len([r for r in inspection_results if r.get("status") == CheckItemStatus.WARNING])
                total_stats["error_checks"] += len([r for r in inspection_results if r.get("status") == CheckItemStatus.ERROR])
        
        # 计算总通过率
        if total_stats["total_checks"] > 0:
            total_stats["pass_rate"] = (total_stats["passed_checks"] / total_stats["total_checks"]) * 100
        
        # 构造报告数据
        report_data = {
            "inspection_name": f"自定义巡检报告 ({len(request.inspection_ids)} 次巡检)",
            "inspection_time": datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
            "devices": all_devices,
            "summary_stats": total_stats if request.include_summary else {}
        }
        
        # 生成报告
        report_path = await report_generator.generate_inspection_report(
            report_data, 
            request.format_type, 
            request.include_charts
        )
        
        # 构造文件名
        filename = f"custom_inspection_report_{len(request.inspection_ids)}inspections_{datetime.now().strftime('%Y%m%d_%H%M%S')}.{request.format_type}"
        
        logger.info("Custom inspection report generated", 
                   inspection_ids=request.inspection_ids,
                   format_type=request.format_type,
                   file_path=report_path,
                   generated_by=current_user["id"])
        
        # 返回文件下载响应
        return FileResponse(
            path=report_path,
            filename=filename,
            media_type='application/octet-stream'
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to generate custom report", 
                    inspection_ids=request.inspection_ids,
                    error=str(e))
        raise HTTPException(status_code=500, detail=f"生成自定义报告失败: {str(e)}")

@router.get("/reports/cleanup", summary="清理临时报告文件")
async def cleanup_report_files(
    older_than_hours: int = Query(24, ge=1, le=168, description="清理多少小时前的文件"),
    current_user: dict = Depends(require_permission("inspections:admin"))
):
    """
    清理临时报告文件（管理员权限）
    """
    try:
        await report_generator.cleanup_temp_files(older_than_hours)
        
        logger.info("Report files cleanup completed", 
                   older_than_hours=older_than_hours,
                   cleaned_by=current_user["id"])
        
        return {"message": f"已清理 {older_than_hours} 小时前的临时报告文件"}
        
    except Exception as e:
        logger.error("Failed to cleanup report files", 
                    error=str(e))
        raise HTTPException(status_code=500, detail=f"清理报告文件失败: {str(e)}")

# ============= 辅助函数 =============

def _calculate_execution_duration(inspection: dict) -> int:
    """计算巡检执行时长（秒）- 字典参数版本"""
    try:
        if inspection.get("started_at") and inspection.get("completed_at"):
            duration = (inspection["completed_at"] - inspection["started_at"]).total_seconds()
            return int(duration)
        return 0
    except:
        return 0

def _calculate_execution_duration_from_model(inspection) -> int:
    """计算巡检执行时长（秒）- 模型对象版本"""
    try:
        if inspection.started_at and inspection.completed_at:
            duration = (inspection.completed_at - inspection.started_at).total_seconds()
            return int(duration)
        return 0
    except:
        return 0

def _calculate_pass_rate(inspection_results: List[dict]) -> float:
    """计算通过率"""
    try:
        if not inspection_results:
            return 0.0
        
        passed_count = len([r for r in inspection_results if r.get("status") == CheckItemStatus.PASS])
        total_count = len(inspection_results)
        
        return round((passed_count / total_count) * 100, 1) if total_count > 0 else 0.0
    except:
        return 0.0

def _extract_performance_metrics(inspection_results: List[dict]) -> dict:
    """从巡检结果中提取性能指标"""
    metrics = {}
    
    try:
        for result in inspection_results:
            check_type = result.get("check_item_type", "")
            actual_value = result.get("actual_value", "")
            
            if check_type == "cpu_usage" and actual_value:
                try:
                    cpu_value = float(actual_value.replace("%", ""))
                    metrics["cpu_usage"] = cpu_value
                except:
                    pass
            
            elif check_type == "memory_usage" and actual_value:
                try:
                    memory_value = float(actual_value.replace("%", ""))
                    metrics["memory_usage"] = memory_value
                except:
                    pass
            
            elif check_type == "interface_status" and actual_value:
                try:
                    # 解析接口状态 "5/10" 格式
                    if "/" in actual_value:
                        active, total = actual_value.split("/")
                        metrics["active_interfaces"] = int(active)
                        metrics["total_interfaces"] = int(total)
                except:
                    pass
    except:
        pass
    
    return metrics

def _calculate_next_run_time(cron_expression: str, base_time: Optional[datetime] = None) -> Optional[datetime]:
    """
    根据Cron表达式计算下次执行时间

    Args:
        cron_expression: Cron表达式字符串
        base_time: 基准时间，默认为当前时间

    Returns:
        下次执行时间，如果Cron表达式无效则返回None
    """
    if not cron_expression:
        return None

    try:
        # 如果没有指定基准时间，使用当前时间
        if base_time is None:
            base_time = datetime.now()

        # 创建croniter对象并获取下次执行时间
        cron = croniter(cron_expression, base_time)
        next_run = cron.get_next(datetime)

        return next_run
    except (ValueError, KeyError) as e:
        # Cron表达式无效
        logger.warning(f"Invalid cron expression: {cron_expression}, error: {str(e)}")
        return None

# ============= 巡检执行记录端点 =============

@router.get("/executions", summary="获取巡检执行记录列表")
async def get_inspection_executions(
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(10, ge=1, le=100, description="每页数量"),
    status: Optional[str] = Query(None, description="状态过滤"),
    strategy_id: Optional[int] = Query(None, description="策略ID过滤"),
    start_date: Optional[str] = Query(None, description="开始日期 YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="结束日期 YYYY-MM-DD"),
    current_user: dict = Depends(require_permission("inspections:read")),
    db: AsyncSession = Depends(get_db_session)
):
    """
    获取巡检执行记录列表，支持分页和多种过滤条件
    """
    try:
        # 创建 Repository 实例
        inspection_repo = InspectionRepository(db)

        # 解析日期范围
        start_datetime = None
        end_datetime = None
        if start_date:
            try:
                start_datetime = datetime.strptime(start_date, "%Y-%m-%d")
            except ValueError:
                logger.warning(f"Invalid start_date format: {start_date}")
        if end_date:
            try:
                end_datetime = datetime.strptime(end_date, "%Y-%m-%d") + timedelta(days=1)
            except ValueError:
                logger.warning(f"Invalid end_date format: {end_date}")

        # 解析状态过滤
        status_list = None
        if status:
            # 支持逗号分隔的多个状态
            status_list = [s.strip() for s in status.split(',') if s.strip()]

        # 查询数据库
        inspections, total = await inspection_repo.get_executions_paginated(
            page=page,
            page_size=page_size,
            status=status_list,
            strategy_id=strategy_id,
            start_date=start_datetime,
            end_date=end_datetime
        )

        # 计算总页数
        pages = (total + page_size - 1) // page_size if total > 0 else 0

        # 转换为前端需要的格式
        execution_items = []
        for inspection in inspections:
            # 获取巡检结果
            execution_results = await inspection_repo.get_execution_results(inspection.id)

            # 获取策略信息（从 schedule 关联）
            strategy_id_value = None
            strategy_name = inspection.name or "未命名巡检"
            if inspection.schedule:
                # 如果有关联的 schedule，尝试获取 strategy 信息
                # 注意：当前数据模型中 InspectionSchedule 没有直接关联 InspectionStrategy
                # 这里简化处理，使用 schedule_id 作为 strategy_id
                strategy_id_value = str(inspection.schedule_id)
                strategy_name = inspection.schedule.name if inspection.schedule.name else strategy_name

            # 获取触发用户信息
            trigger_user = "system"
            if inspection.creator:
                trigger_user = inspection.creator.username if hasattr(inspection.creator, 'username') else str(inspection.created_by)

            # 计算进度（基于状态）
            progress = 0
            if inspection.status == InspectionStatus.COMPLETED:
                progress = 100
            elif inspection.status == InspectionStatus.FAILED:
                progress = 100
            elif inspection.status == InspectionStatus.RUNNING:
                # 如果有检查项数据，基于完成情况计算进度
                if inspection.total_checks > 0:
                    completed_checks = inspection.passed_checks + inspection.failed_checks + inspection.warning_checks
                    progress = int((completed_checks / inspection.total_checks) * 100)
                else:
                    progress = 50  # 运行中但没有检查项数据，显示 50%

            # 计算设备数（当前是单设备巡检）
            total_devices = 1
            completed_devices = 1 if inspection.status in [
                InspectionStatus.COMPLETED,
                InspectionStatus.FAILED,
                InspectionStatus.CANCELLED
            ] else 0

            # 构造设备结果
            device_results = []
            if inspection.device and execution_results:
                # 计算设备级别的统计
                device_score = 0
                if inspection.total_checks > 0:
                    device_score = (inspection.passed_checks / inspection.total_checks) * 100

                device_results.append({
                    "deviceId": str(inspection.device_id),
                    "deviceName": inspection.device.name if hasattr(inspection.device, 'name') else f"设备{inspection.device_id}",
                    "deviceIp": inspection.device.ip_address if hasattr(inspection.device, 'ip_address') else "",
                    "status": inspection.status.value,
                    "score": round(device_score, 2),
                    "totalChecks": inspection.total_checks,
                    "passedChecks": inspection.passed_checks,
                    "failedChecks": inspection.failed_checks,
                    "warningChecks": inspection.warning_checks,
                    "checkResults": [
                        {
                            "checkItemName": result.check_item_name,
                            "checkItemType": result.check_item_type,
                            "status": result.status.value,
                            "expectedValue": result.expected_value,
                            "actualValue": result.actual_value,
                            "message": result.message,
                        }
                        for result in execution_results[:10]  # 限制返回数量，避免数据量过大
                    ]
                })

            execution_item = {
                "id": str(inspection.id),
                "strategyId": strategy_id_value or str(inspection.template_id or ""),
                "strategyName": strategy_name,
                "triggerType": inspection.trigger.value,
                "triggerUser": trigger_user,
                "status": inspection.status.value,
                "progress": progress,
                "totalDevices": total_devices,
                "completedDevices": completed_devices,
                "startTime": inspection.started_at.isoformat() if inspection.started_at else (inspection.created_at.isoformat() if inspection.created_at else None),
                "endTime": inspection.completed_at.isoformat() if inspection.completed_at else None,
                "duration": inspection.duration or _calculate_execution_duration_from_model(inspection),
                "summary": {
                    "totalChecks": inspection.total_checks,
                    "passedChecks": inspection.passed_checks,
                    "failedChecks": inspection.failed_checks,
                    "warningChecks": inspection.warning_checks,
                    "score": round((inspection.passed_checks / max(1, inspection.total_checks)) * 100, 2),
                    "deviceResults": device_results
                }
            }
            execution_items.append(execution_item)

        logger.info("Retrieved inspection executions from database",
                   count=len(execution_items),
                   total=total,
                   page=page,
                   user_id=current_user["id"])

        return {
            "items": execution_items,
            "total": total,
            "pages": pages
        }

    except Exception as e:
        logger.error("Failed to get inspection executions",
                    error=str(e),
                    exc_info=True)
        raise HTTPException(status_code=500, detail=f"获取巡检执行记录失败: {str(e)}")

@router.post("/executions/{execution_id}/stop", summary="停止巡检执行")
async def stop_inspection_execution(
    execution_id: int,
    current_user: dict = Depends(require_permission("inspections:write")),
    db: AsyncSession = Depends(get_db_session)
):
    """
    停止正在执行或待执行的巡检任务
    """
    try:
        # 创建 Repository 实例
        inspection_repo = InspectionRepository(db)

        # 获取执行记录
        inspection = await inspection_repo.get_execution_by_id(execution_id)
        if not inspection:
            raise HTTPException(status_code=404, detail="巡检执行记录不存在")

        # 检查状态是否允许停止
        if inspection.status not in [InspectionStatus.PENDING, InspectionStatus.RUNNING]:
            raise HTTPException(
                status_code=400,
                detail=f"当前巡检状态为 {inspection.status.value}，不允许停止操作"
            )

        # 如果巡检正在运行，尝试取消任务
        if inspection.status == InspectionStatus.RUNNING:
            try:
                # 调用 inspection_service 取消正在运行的任务
                await inspection_service.cancel_inspection(execution_id)
                logger.info("Cancelled running inspection task",
                           execution_id=execution_id,
                           user_id=current_user["id"])
            except Exception as e:
                logger.warning("Failed to cancel running inspection task",
                              execution_id=execution_id,
                              error=str(e))
                # 即使取消任务失败，也继续更新数据库状态

        # 更新数据库状态为已取消
        success = await inspection_repo.cancel_inspection(execution_id)
        if not success:
            raise HTTPException(status_code=500, detail="更新巡检状态失败")

        logger.info("Inspection execution stopped successfully",
                   execution_id=execution_id,
                   previous_status=inspection.status.value,
                   user_id=current_user["id"])

        return {
            "success": True,
            "message": "巡检执行已停止",
            "execution_id": execution_id
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to stop inspection execution",
                    execution_id=execution_id,
                    error=str(e),
                    exc_info=True)
        raise HTTPException(status_code=500, detail=f"停止巡检执行失败: {str(e)}")

# ============= 统计数据端点 =============

@router.get("/stats", summary="获取巡检统计数据")
async def get_inspection_stats(
    time_range: Optional[str] = Query("7d", description="时间范围: 1d, 7d, 30d"),
    current_user: dict = Depends(require_permission("inspections:read")),
    db: AsyncSession = Depends(get_db_session)
):
    """
    获取巡检统计数据，包括策略数量、执行次数等
    """
    try:
        # 尝试从缓存获取数据
        cached_stats = await cache_service.get_cached_inspection_stats(time_range)
        if cached_stats:
            logger.info("Inspection stats cache hit",
                       time_range=time_range,
                       user_id=current_user["id"])
            return cached_stats

        # 计算时间范围
        now = datetime.now()
        if time_range == "1d":
            start_date = now - timedelta(days=1)
        elif time_range == "30d":
            start_date = now - timedelta(days=30)
        else:  # 默认7d
            start_date = now - timedelta(days=7)

        end_date = now

        # 初始化Repository
        strategy_repo = StrategyRepository(db)
        inspection_repo = InspectionRepository(db)

        # 1. 获取策略统计（总数和活跃数）
        strategy_stats = await strategy_repo.get_strategy_statistics()
        total_strategies = strategy_stats["total_strategies"]
        active_strategies = strategy_stats["active_strategies"]

        # 2. 获取今日执行数量
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        today_stats = await inspection_repo.get_stats_summary(
            start_date=today_start,
            end_date=end_date
        )
        today_executions = today_stats["total_executions"]

        # 3. 获取指定时间范围的成功率和平均评分
        current_stats = await inspection_repo.get_stats_summary(
            start_date=start_date,
            end_date=end_date
        )
        success_rate = current_stats["success_rate"]
        avg_score = current_stats["avg_score"]

        # 4. 获取最近10条执行记录
        recent_executions, _ = await inspection_repo.get_executions_paginated(
            page=1,
            page_size=10
        )

        # 5. 计算与上周的对比数据
        last_week_start = now - timedelta(days=14)  # 两周前
        last_week_end = now - timedelta(days=7)     # 一周前

        last_week_stats = await inspection_repo.get_stats_summary(
            start_date=last_week_start,
            end_date=last_week_end
        )
        last_week_executions = last_week_stats["total_executions"]
        last_week_success_rate = last_week_stats["success_rate"]
        last_week_avg_score = last_week_stats["avg_score"]

        # 计算变化百分比
        def calculate_change_percent(current, previous):
            if previous == 0:
                return "+100.0%" if current > 0 else "0.0%"
            change = ((current - previous) / previous) * 100
            return f"{'+' if change >= 0 else ''}{change:.1f}%"

        # 构建统计数据
        stats_data = {
            "totalStrategies": total_strategies,
            "activeStrategies": active_strategies,
            "todayExecutions": today_executions,
            "successRate": success_rate,
            "avgScore": avg_score,
            "changes": {
                "executionsChange": calculate_change_percent(today_executions, last_week_executions),
                "successRateChange": calculate_change_percent(success_rate, last_week_success_rate),
                "avgScoreChange": calculate_change_percent(avg_score, last_week_avg_score),
                "strategiesChange": "+0.0%"  # 策略变化需要历史数据支持，暂时返回0
            },
            "recentExecutions": [
                {
                    "id": str(execution.id),
                    "strategyId": str(execution.schedule_id) if execution.schedule_id else "",
                    "strategyName": execution.name or "",
                    "triggerType": execution.trigger.value,
                    "triggerUser": execution.creator.username if execution.creator else "system",
                    "status": execution.status.value,
                    "progress": 100 if execution.status in [InspectionStatus.COMPLETED, InspectionStatus.FAILED, InspectionStatus.CANCELLED] else 0,
                    "totalDevices": 1,  # 当前是单设备巡检
                    "completedDevices": 1 if execution.status == InspectionStatus.COMPLETED else 0,
                    "startTime": execution.started_at.isoformat() if execution.started_at else None,
                    "endTime": execution.completed_at.isoformat() if execution.completed_at else None,
                    "duration": _calculate_execution_duration_from_model(execution),
                    "summary": {
                        "totalChecks": execution.total_checks or 0,
                        "passedChecks": execution.passed_checks or 0,
                        "failedChecks": execution.failed_checks or 0,
                        "warningChecks": execution.warning_checks or 0,
                        "score": (execution.passed_checks / max(1, execution.total_checks)) * 100 if execution.total_checks else 0,
                        "deviceResults": []
                    }
                }
                for execution in recent_executions
            ]
        }

        logger.info("Inspection stats retrieved from database",
                   time_range=time_range,
                   total_strategies=total_strategies,
                   user_id=current_user["id"])

        # 缓存统计数据（3分钟）
        await cache_service.cache_inspection_stats(time_range, stats_data)
        logger.debug("Inspection stats cached",
                    time_range=time_range,
                    cache_ttl=cache_service.DEFAULT_EXPIRE["inspection_stats"])

        return stats_data

    except Exception as e:
        logger.error("Failed to get inspection stats",
                    error=str(e))
        raise HTTPException(status_code=500, detail=f"获取统计数据失败: {str(e)}")

# ============= 趋势分析端点 =============

@router.get("/trends", summary="获取巡检趋势数据")
async def get_inspection_trends(
    period: str = Query("week", description="时间周期: day, week, month"),
    start_date: str = Query(None, description="开始日期 YYYY-MM-DD"),
    end_date: str = Query(None, description="结束日期 YYYY-MM-DD"),
    current_user: dict = Depends(require_permission("inspections:read")),
    db: AsyncSession = Depends(get_db_session)
):
    """
    获取巡检执行趋势数据，用于生成趋势图表
    """
    try:
        # 生成缓存 key（包含所有查询参数）
        cache_key = f"{period}_{start_date or 'none'}_{end_date or 'none'}"

        # 尝试从缓存获取数据
        cached_trends = await cache_service.get_cached_inspection_trends(cache_key)
        if cached_trends:
            logger.info("Inspection trends cache hit",
                       period=period,
                       cache_key=cache_key,
                       user_id=current_user["id"])
            return cached_trends

        # 解析时间范围
        now = datetime.now()
        if start_date and end_date:
            start = datetime.strptime(start_date, "%Y-%m-%d")
            end = datetime.strptime(end_date, "%Y-%m-%d")
        else:
            if period == "day":
                start = now - timedelta(days=7)
                end = now
            elif period == "month":
                start = now - timedelta(days=30)
                end = now
            else:  # week
                start = now - timedelta(days=7)
                end = now

        # 初始化Repository
        inspection_repo = InspectionRepository(db)

        # 从数据库获取趋势数据
        trends_data = await inspection_repo.get_trend_data(
            period=period,
            start_date=start,
            end_date=end
        )

        logger.info("Inspection trends retrieved from database",
                   period=period,
                   start_date=start,
                   end_date=end,
                   data_points=len(trends_data),
                   user_id=current_user["id"])

        # 缓存趋势数据（4分钟）
        await cache_service.cache_inspection_trends(cache_key, trends_data)
        logger.debug("Inspection trends cached",
                    cache_key=cache_key,
                    cache_ttl=cache_service.DEFAULT_EXPIRE["inspection_trends"])

        return trends_data

    except Exception as e:
        logger.error("Failed to get inspection trends",
                    error=str(e))
        raise HTTPException(status_code=500, detail=f"获取趋势数据失败: {str(e)}")

@router.get("/device-distribution", summary="获取设备类型分布")
async def get_device_distribution(
    current_user: dict = Depends(require_permission("inspections:read")),
    db: AsyncSession = Depends(get_db_session)
):
    """
    获取巡检设备类型分布数据
    """
    try:
        # 尝试从缓存获取数据
        cached_distribution = await cache_service.get_cached_device_distribution()
        if cached_distribution:
            logger.info("Device distribution cache hit",
                       user_id=current_user["id"])
            return cached_distribution

        # 初始化Repository
        device_repo = DeviceRepository(db)

        # 从数据库获取设备类型分布
        distribution_data = await device_repo.get_device_type_distribution()

        logger.info("Device distribution retrieved from database",
                   types_count=len(distribution_data),
                   user_id=current_user["id"])

        # 缓存设备分布数据（5分钟）
        await cache_service.cache_device_distribution(distribution_data)
        logger.debug("Device distribution cached",
                    cache_ttl=cache_service.DEFAULT_EXPIRE["device_dist"])

        return distribution_data

    except Exception as e:
        logger.error("Failed to get device distribution",
                    error=str(e))
        raise HTTPException(status_code=500, detail=f"获取设备分布失败: {str(e)}")

@router.get("/problem-distribution", summary="获取问题分布统计")
async def get_problem_distribution(
    current_user: dict = Depends(require_permission("inspections:read")),
    db: AsyncSession = Depends(get_db_session)
):
    """
    获取巡检中常见问题的分布统计
    """
    try:
        # 尝试从缓存获取数据
        cached_distribution = await cache_service.get_cached_problem_distribution()
        if cached_distribution:
            logger.info("Problem distribution cache hit",
                       user_id=current_user["id"])
            return cached_distribution

        # 初始化Repository
        inspection_repo = InspectionRepository(db)

        # 从数据库获取问题分类分布
        distribution_data = await inspection_repo.get_problem_category_distribution()

        logger.info("Problem distribution retrieved from database",
                   categories_count=len(distribution_data),
                   user_id=current_user["id"])

        # 缓存问题分布数据（4分钟）
        await cache_service.cache_problem_distribution(distribution_data)
        logger.debug("Problem distribution cached",
                    cache_ttl=cache_service.DEFAULT_EXPIRE["problem_dist"])

        return distribution_data

    except Exception as e:
        logger.error("Failed to get problem distribution",
                    error=str(e))
        raise HTTPException(status_code=500, detail=f"获取问题分布失败: {str(e)}")

@router.post("/analytics/export", summary="导出统计分析报告")
async def export_analytics_report(
    period: str = Query("week", description="时间周期: day, week, month"),
    start_date: Optional[str] = Query(None, description="开始日期 YYYY-MM-DD"),
    end_date: Optional[str] = Query(None, description="结束日期 YYYY-MM-DD"),
    format_type: str = Query("excel", pattern="^(excel|pdf)$", description="报告格式"),
    include_charts: bool = Query(True, description="是否包含图表"),
    current_user: dict = Depends(require_permission("inspections:read")),
    db: AsyncSession = Depends(get_db_session)
):
    """
    导出统计分析报告（Excel/PDF格式）

    该端点会汇总以下数据:
    - 统计摘要 (KPI指标)
    - 趋势数据 (执行次数、评分趋势)
    - 设备类型分布
    - 常见问题分布
    """
    try:
        # 解析时间范围
        now = datetime.now()
        if start_date and end_date:
            start = datetime.strptime(start_date, "%Y-%m-%d")
            end = datetime.strptime(end_date, "%Y-%m-%d")
        else:
            if period == "day":
                start = now - timedelta(days=7)
                end = now
            elif period == "month":
                start = now - timedelta(days=365)
                end = now
            else:  # week
                start = now - timedelta(days=28)
                end = now

        # 初始化 Repositories
        strategy_repo = StrategyRepository(db)
        inspection_repo = InspectionRepository(db)
        device_repo = DeviceRepository(db)

        # 1. 获取统计摘要
        stats_summary = await inspection_repo.get_stats_summary(
            start_date=start,
            end_date=end
        )

        # 2. 获取策略统计
        strategy_stats = await strategy_repo.get_strategy_statistics()

        # 3. 获取趋势数据
        trends_data = await inspection_repo.get_trend_data(
            period=period,
            start_date=start,
            end_date=end
        )

        # 4. 获取设备类型分布
        device_distribution = await device_repo.get_device_type_distribution()

        # 5. 获取问题分布
        problem_distribution = await inspection_repo.get_problem_category_distribution()

        # 6. 获取最近执行记录
        recent_executions, _ = await inspection_repo.get_executions_paginated(
            page=1,
            page_size=20,
            start_date=start,
            end_date=end
        )

        # 构造报告数据结构
        report_data = {
            "inspection_name": f"统计分析报告 ({period.upper()})",
            "inspection_time": now.strftime('%Y-%m-%d %H:%M:%S'),
            "time_range": {
                "start_date": start.strftime('%Y-%m-%d'),
                "end_date": end.strftime('%Y-%m-%d'),
                "period": period
            },
            "summary_stats": {
                "total_executions": stats_summary["total_executions"],
                "successful_executions": stats_summary["successful_executions"],
                "success_rate": stats_summary["success_rate"],
                "avg_score": stats_summary["avg_score"],
                "total_strategies": strategy_stats["total_strategies"],
                "active_strategies": strategy_stats["active_strategies"]
            },
            "trends": trends_data,
            "device_distribution": device_distribution,
            "problem_distribution": problem_distribution,
            "devices": [],  # 统计报告不需要详细设备信息
            "recent_executions": [
                {
                    "id": execution.id,
                    "name": execution.name or f"巡检 #{execution.id}",
                    "device_id": execution.device_id,
                    "device_name": execution.device.name if execution.device else f"设备 #{execution.device_id}",
                    "status": execution.status.value,
                    "trigger": execution.trigger.value,
                    "started_at": execution.started_at.strftime('%Y-%m-%d %H:%M:%S') if execution.started_at else 'N/A',
                    "completed_at": execution.completed_at.strftime('%Y-%m-%d %H:%M:%S') if execution.completed_at else 'N/A',
                    "duration": _calculate_execution_duration_from_model(execution),
                    "total_checks": execution.total_checks or 0,
                    "passed_checks": execution.passed_checks or 0,
                    "failed_checks": execution.failed_checks or 0,
                    "warning_checks": execution.warning_checks or 0,
                    "score": round((execution.passed_checks / max(1, execution.total_checks)) * 100, 1) if execution.total_checks else 0
                }
                for execution in recent_executions
            ]
        }

        # 生成报告文件
        report_path = await report_generator.generate_inspection_report(
            report_data,
            format_type,
            include_charts
        )

        # 构造文件名
        period_cn = {"day": "按天", "week": "按周", "month": "按月"}
        filename = f"statistics_report_{period_cn.get(period, period)}_{start.strftime('%Y%m%d')}_{end.strftime('%Y%m%d')}.{format_type}"

        logger.info("Analytics report generated",
                   period=period,
                   format_type=format_type,
                   file_path=report_path,
                   generated_by=current_user["id"])

        # 返回文件下载响应
        return FileResponse(
            path=report_path,
            filename=filename,
            media_type='application/octet-stream'
        )

    except Exception as e:
        logger.error("Failed to export analytics report",
                    error=str(e),
                    exc_info=True)
        raise HTTPException(status_code=500, detail=f"导出统计报告失败: {str(e)}")

# ============= 巡检策略管理端点 =============

@router.get("/strategies", summary="获取巡检策略列表")
async def get_inspection_strategies(
    skip: int = Query(0, ge=0, description="跳过的记录数"),
    limit: int = Query(10, ge=1, le=100, description="返回的记录数"),
    type: Optional[str] = Query(None, description="策略类型过滤: manual, scheduled"),
    enabled: Optional[bool] = Query(None, description="是否启用过滤"),
    current_user: dict = Depends(require_permission("inspections:read")),
    db: AsyncSession = Depends(get_db_session)
):
    """
    获取巡检策略列表,支持分页和过滤
    """
    # 创建 Repository
    repo = StrategyRepository(db)

    # 构建过滤条件
    filters = {}
    if type:
        filters["type"] = type
    if enabled is not None:
        filters["enabled"] = enabled

    # 计算页码
    page = (skip // limit) + 1

    # 查询数据库
    strategies_list, total = await repo.list_strategies(
        page=page,
        page_size=limit,
        filters=filters,
        order_by="updated_at",
        order_direction="desc"
    )

    # 计算总页数
    pages = (total + limit - 1) // limit if total > 0 else 0

    logger.info("Retrieved inspection strategies",
                count=len(strategies_list),
                total=total,
                user_id=current_user["id"])

    # 将数据库模型转换为 Pydantic 模型
    items = []
    for strategy in strategies_list:
        items.append({
            "id": strategy.id,
            "name": strategy.name,
            "description": strategy.description,
            "type": strategy.type.value,
            "cron": strategy.cron,
            "devices": strategy.devices or [],
            "templates": strategy.templates or [],
            "enabled": strategy.enabled,
            "created_at": strategy.created_at,
            "updated_at": strategy.updated_at,
            "next_run_time": strategy.next_run_time
        })

    # 返回包含分页信息的响应
    return {
        "items": items,
        "total": total,
        "pages": pages
    }

@router.post("/strategies", response_model=InspectionStrategy, summary="创建巡检策略")
async def create_inspection_strategy(
    strategy: InspectionStrategyCreate,
    current_user: dict = Depends(require_permission("inspections:create")),
    db: AsyncSession = Depends(get_db_session)
):
    """
    创建新的巡检策略
    """
    # 创建 Repository
    repo = StrategyRepository(db)

    # 检查策略名称是否已存在
    if await repo.check_name_exists(strategy.name):
        raise HTTPException(
            status_code=400,
            detail=f"策略名称 {strategy.name} 已存在"
        )

    # 验证定时策略必须有 cron 表达式
    if strategy.type == "scheduled" and not strategy.cron:
        raise HTTPException(
            status_code=400,
            detail="定时策略必须提供 cron 表达式"
        )

    # 验证模板ID存在 (暂时保留,因为模板管理还未迁移到数据库)
    for template_id in strategy.templates:
        if template_id not in TEMP_TEMPLATES:
            raise HTTPException(
                status_code=404,
                detail=f"模板ID {template_id} 不存在"
            )

    # 计算下次执行时间(仅定时策略)
    next_run_time = None
    if strategy.type == "scheduled" and strategy.cron:
        next_run_time = _calculate_next_run_time(strategy.cron)

    # 创建策略数据
    strategy_data = {
        "name": strategy.name,
        "description": strategy.description,
        "type": strategy.type,
        "cron": strategy.cron,
        "devices": strategy.devices,
        "templates": strategy.templates,
        "enabled": strategy.enabled,
        "next_run_time": next_run_time
    }

    # 保存到数据库
    new_strategy = await repo.create(strategy_data)

    logger.info("Inspection strategy created",
                strategy_id=new_strategy.id,
                name=strategy.name,
                type=strategy.type,
                created_by=current_user["id"])

    return InspectionStrategy(
        id=new_strategy.id,
        name=new_strategy.name,
        description=new_strategy.description,
        type=new_strategy.type.value,
        cron=new_strategy.cron,
        devices=new_strategy.devices or [],
        templates=new_strategy.templates or [],
        enabled=new_strategy.enabled,
        created_at=new_strategy.created_at,
        updated_at=new_strategy.updated_at,
        next_run_time=new_strategy.next_run_time
    )

@router.get("/strategies/{strategy_id}", response_model=InspectionStrategy, summary="获取策略详情")
async def get_inspection_strategy(
    strategy_id: int,
    current_user: dict = Depends(require_permission("inspections:read")),
    db: AsyncSession = Depends(get_db_session)
):
    """
    获取指定巡检策略的详细信息
    """
    # 创建 Repository
    repo = StrategyRepository(db)

    # 查询数据库
    strategy = await repo.get_by_id(strategy_id)
    if not strategy:
        raise HTTPException(status_code=404, detail="巡检策略不存在")

    return InspectionStrategy(
        id=strategy.id,
        name=strategy.name,
        description=strategy.description,
        type=strategy.type.value,
        cron=strategy.cron,
        devices=strategy.devices or [],
        templates=strategy.templates or [],
        enabled=strategy.enabled,
        created_at=strategy.created_at,
        updated_at=strategy.updated_at,
        next_run_time=strategy.next_run_time
    )

@router.put("/strategies/{strategy_id}", response_model=InspectionStrategy, summary="更新巡检策略")
async def update_inspection_strategy(
    strategy_id: int,
    strategy_update: InspectionStrategyUpdate,
    current_user: dict = Depends(require_permission("inspections:update")),
    db: AsyncSession = Depends(get_db_session)
):
    """
    更新巡检策略
    """
    # 创建 Repository
    repo = StrategyRepository(db)

    # 检查策略是否存在
    strategy = await repo.get_by_id(strategy_id)
    if not strategy:
        raise HTTPException(status_code=404, detail="巡检策略不存在")

    # 检查名称冲突
    if strategy_update.name:
        if await repo.check_name_exists(strategy_update.name, exclude_id=strategy_id):
            raise HTTPException(
                status_code=400,
                detail=f"策略名称 {strategy_update.name} 已存在"
            )

    # 验证定时策略必须有 cron 表达式
    update_type = strategy_update.type or strategy.type.value
    update_cron = strategy_update.cron if strategy_update.cron is not None else strategy.cron
    if update_type == "scheduled" and not update_cron:
        raise HTTPException(
            status_code=400,
            detail="定时策略必须提供 cron 表达式"
        )

    # 验证模板ID存在 (暂时保留,因为模板管理还未迁移到数据库)
    if strategy_update.templates:
        for template_id in strategy_update.templates:
            if template_id not in TEMP_TEMPLATES:
                raise HTTPException(
                    status_code=404,
                    detail=f"模板ID {template_id} 不存在"
                )

    # 准备更新数据
    update_data = strategy_update.dict(exclude_unset=True)

    # 如果类型或Cron表达式发生变化,重新计算下次执行时间
    if "type" in update_data or "cron" in update_data:
        final_type = update_data.get("type", strategy.type.value)
        final_cron = update_data.get("cron", strategy.cron)

        if final_type == "scheduled" and final_cron:
            update_data["next_run_time"] = _calculate_next_run_time(final_cron)
        elif final_type == "manual":
            # 手动策略不需要计算下次执行时间
            update_data["next_run_time"] = None

    # 更新数据库
    updated_strategy = await repo.update(strategy_id, update_data)
    if not updated_strategy:
        raise HTTPException(status_code=404, detail="更新失败")

    logger.info("Inspection strategy updated",
                strategy_id=strategy_id,
                fields=list(update_data.keys()),
                updated_by=current_user["id"])

    return InspectionStrategy(
        id=updated_strategy.id,
        name=updated_strategy.name,
        description=updated_strategy.description,
        type=updated_strategy.type.value,
        cron=updated_strategy.cron,
        devices=updated_strategy.devices or [],
        templates=updated_strategy.templates or [],
        enabled=updated_strategy.enabled,
        created_at=updated_strategy.created_at,
        updated_at=updated_strategy.updated_at,
        next_run_time=updated_strategy.next_run_time
    )

@router.delete("/strategies/{strategy_id}", summary="删除巡检策略")
async def delete_inspection_strategy(
    strategy_id: int,
    current_user: dict = Depends(require_permission("inspections:delete")),
    db: AsyncSession = Depends(get_db_session)
):
    """
    删除巡检策略
    """
    # 创建 Repository
    repo = StrategyRepository(db)

    # 检查策略是否存在
    strategy = await repo.get_by_id(strategy_id)
    if not strategy:
        raise HTTPException(status_code=404, detail="巡检策略不存在")

    # 检查是否有关联的巡检执行记录
    strategy_templates = set(strategy.templates or [])
    associated_inspections = [
        inspection for inspection in TEMP_INSPECTIONS.values()
        if inspection.get("template_id") in strategy_templates
    ]

    if associated_inspections:
        raise HTTPException(
            status_code=400,
            detail=f"无法删除策略,存在 {len(associated_inspections)} 条关联的巡检记录。请先删除相关巡检记录或更换策略模板。"
        )

    # 删除数据库记录
    success = await repo.delete(strategy_id)
    if not success:
        raise HTTPException(status_code=500, detail="删除失败")

    logger.info("Inspection strategy deleted",
                strategy_id=strategy_id,
                deleted_by=current_user["id"])

    return {"message": "巡检策略删除成功"}

@router.post("/strategies/{strategy_id}/toggle", response_model=InspectionStrategy, summary="启用/禁用策略")
async def toggle_inspection_strategy(
    strategy_id: int,
    current_user: dict = Depends(require_permission("inspections:update")),
    db: AsyncSession = Depends(get_db_session)
):
    """
    切换巡检策略的启用状态
    """
    # 创建 Repository
    repo = StrategyRepository(db)

    # 检查策略是否存在
    strategy = await repo.get_by_id(strategy_id)
    if not strategy:
        raise HTTPException(status_code=404, detail="巡检策略不存在")

    # 切换启用状态
    new_enabled = not strategy.enabled
    updated_strategy = await repo.toggle_enabled(strategy_id, new_enabled)
    if not updated_strategy:
        raise HTTPException(status_code=500, detail="更新失败")

    logger.info("Inspection strategy toggled",
                strategy_id=strategy_id,
                enabled=new_enabled,
                updated_by=current_user["id"])

    return InspectionStrategy(
        id=updated_strategy.id,
        name=updated_strategy.name,
        description=updated_strategy.description,
        type=updated_strategy.type.value,
        cron=updated_strategy.cron,
        devices=updated_strategy.devices or [],
        templates=updated_strategy.templates or [],
        enabled=updated_strategy.enabled,
        created_at=updated_strategy.created_at,
        updated_at=updated_strategy.updated_at,
        next_run_time=updated_strategy.next_run_time
    )

@router.post("/strategies/{strategy_id}/trigger", summary="手动触发策略执行")
async def trigger_strategy_execution(
    strategy_id: int,
    background_tasks: BackgroundTasks,
    current_user: dict = Depends(require_permission("inspections:create"))
):
    """
    手动触发巡检策略立即执行
    """
    strategy = TEMP_STRATEGIES.get(strategy_id)
    if not strategy:
        raise HTTPException(status_code=404, detail="巡检策略不存在")

    if not strategy.get("enabled"):
        raise HTTPException(status_code=400, detail="策略已禁用，无法执行")

    if not strategy.get("devices"):
        raise HTTPException(status_code=400, detail="策略未配置目标设备")

    if not strategy.get("templates"):
        raise HTTPException(status_code=400, detail="策略未配置巡检模板")

    # 获取设备信息
    from src.api.devices import TEMP_DEVICES

    # 为每个设备创建巡检任务
    created_inspections = []
    for device_id in strategy["devices"]:
        device = TEMP_DEVICES.get(device_id)
        if not device:
            logger.warning(f"Device {device_id} not found, skipping")
            continue

        # 使用策略的第一个模板
        template_id = strategy["templates"][0]
        template = TEMP_TEMPLATES.get(template_id)
        if not template:
            logger.warning(f"Template {template_id} not found, skipping")
            continue

        # 生成新的巡检ID
        new_id = max(TEMP_INSPECTIONS.keys()) + 1 if TEMP_INSPECTIONS else 1

        # 创建巡检记录
        now = datetime.now()
        new_inspection = {
            "id": new_id,
            "device_id": device_id,
            "template_id": template_id,
            "name": f"{device['name']} - {strategy['name']}",
            "trigger": InspectionTrigger.MANUAL,
            "status": InspectionStatus.PENDING,
            "scheduled_at": now,
            "total_checks": len(template.get("check_items", [])),
            "passed_checks": 0,
            "failed_checks": 0,
            "created_at": now,
            "updated_at": now
        }

        TEMP_INSPECTIONS[new_id] = new_inspection
        created_inspections.append(new_id)

        # 添加到后台任务执行
        background_tasks.add_task(
            execute_inspection_task,
            new_id,
            device,
            template
        )

    logger.info("Strategy execution triggered",
                strategy_id=strategy_id,
                inspections_created=len(created_inspections),
                triggered_by=current_user["id"])

    # 对于定时策略，更新下次执行时间
    if strategy.get("type") == "scheduled" and strategy.get("cron"):
        strategy["next_run_time"] = _calculate_next_run_time(strategy["cron"])
        strategy["updated_at"] = datetime.now()

    return {
        "message": f"策略执行已触发，创建了 {len(created_inspections)} 个巡检任务",
        "inspection_ids": created_inspections
    }