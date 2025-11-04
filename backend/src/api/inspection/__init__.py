from fastapi import APIRouter, HTTPException, Depends, Query, BackgroundTasks
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timedelta
import structlog
import os

from src.core.permissions import require_permission
from src.services.inspection import inspection_service
from src.services.report_generator import report_generator
from src.models.inspection import InspectionStatus, InspectionTrigger, CheckItemStatus

logger = structlog.get_logger()
router = APIRouter()

# 巡检相关数据模型
class InspectionTemplateCreate(BaseModel):
    name: str
    description: Optional[str] = None
    device_types: List[str] = []
    check_items: List[dict] = []

class InspectionTemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    device_types: Optional[List[str]] = None
    check_items: Optional[List[dict]] = None
    is_active: Optional[bool] = None

class InspectionTemplate(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
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

TEMP_INSPECTIONS = {}
TEMP_INSPECTION_RESULTS = {}

@router.get("/templates", response_model=List[InspectionTemplate], summary="获取巡检模板列表")
async def get_inspection_templates(
    skip: int = Query(0, ge=0, description="跳过的记录数"),
    limit: int = Query(10, ge=1, le=100, description="返回的记录数"),
    device_type: Optional[str] = Query(None, description="设备类型过滤"),
    is_active: Optional[bool] = Query(None, description="是否启用过滤"),
    current_user: dict = Depends(require_permission("inspections:read"))
):
    """
    获取巡检模板列表
    """
    templates = list(TEMP_TEMPLATES.values())
    
    # 应用过滤器
    if device_type:
        templates = [t for t in templates if device_type in t.get("device_types", [])]
    if is_active is not None:
        templates = [t for t in templates if t.get("is_active") == is_active]
    
    # 应用分页
    total = len(templates)
    templates = templates[skip:skip + limit]
    
    logger.info("Retrieved inspection templates", 
                count=len(templates), 
                total=total,
                user_id=current_user["id"])
    
    return [InspectionTemplate(**template) for template in templates]

@router.post("/templates", response_model=InspectionTemplate, summary="创建巡检模板")
async def create_inspection_template(
    template: InspectionTemplateCreate,
    current_user: dict = Depends(require_permission("inspections:create"))
):
    """
    创建新的巡检模板
    """
    # 检查模板名称是否已存在
    for existing_template in TEMP_TEMPLATES.values():
        if existing_template["name"] == template.name:
            raise HTTPException(
                status_code=400,
                detail=f"模板名称 {template.name} 已存在"
            )
    
    # 生成新ID
    new_id = max(TEMP_TEMPLATES.keys()) + 1 if TEMP_TEMPLATES else 1
    
    # 创建模板记录
    now = datetime.now()
    new_template = {
        "id": new_id,
        **template.dict(),
        "is_default": False,
        "is_active": True,
        "created_at": now,
        "updated_at": now
    }
    
    TEMP_TEMPLATES[new_id] = new_template
    
    logger.info("Inspection template created", 
                template_id=new_id, 
                name=template.name,
                created_by=current_user["id"])
    
    return InspectionTemplate(**new_template)

@router.get("/templates/{template_id}", response_model=InspectionTemplate, summary="获取巡检模板详情")
async def get_inspection_template(
    template_id: int,
    current_user: dict = Depends(require_permission("inspections:read"))
):
    """
    获取指定巡检模板的详细信息
    """
    template = TEMP_TEMPLATES.get(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="巡检模板不存在")
    
    return InspectionTemplate(**template)

@router.put("/templates/{template_id}", response_model=InspectionTemplate, summary="更新巡检模板")
async def update_inspection_template(
    template_id: int,
    template_update: InspectionTemplateUpdate,
    current_user: dict = Depends(require_permission("inspections:update"))
):
    """
    更新巡检模板
    """
    template = TEMP_TEMPLATES.get(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="巡检模板不存在")
    
    # 检查名称冲突
    if template_update.name:
        for tid, existing_template in TEMP_TEMPLATES.items():
            if tid != template_id and existing_template["name"] == template_update.name:
                raise HTTPException(
                    status_code=400,
                    detail=f"模板名称 {template_update.name} 已存在"
                )
    
    # 更新模板信息
    update_data = template_update.dict(exclude_unset=True)
    template.update(update_data)
    template["updated_at"] = datetime.now()
    
    logger.info("Inspection template updated", 
                template_id=template_id,
                fields=list(update_data.keys()),
                updated_by=current_user["id"])
    
    return InspectionTemplate(**template)

@router.delete("/templates/{template_id}", summary="删除巡检模板")
async def delete_inspection_template(
    template_id: int,
    current_user: dict = Depends(require_permission("inspections:delete"))
):
    """
    删除巡检模板
    """
    template = TEMP_TEMPLATES.get(template_id)
    if not template:
        raise HTTPException(status_code=404, detail="巡检模板不存在")
    
    if template.get("is_default"):
        raise HTTPException(status_code=400, detail="默认模板不能删除")
    
    del TEMP_TEMPLATES[template_id]
    
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
    current_user: dict = Depends(require_permission("inspections:create"))
):
    """
    创建新的巡检任务
    """
    # 验证设备存在
    from src.api.devices import TEMP_DEVICES
    device = TEMP_DEVICES.get(inspection.device_id)
    if not device:
        raise HTTPException(status_code=404, detail="设备不存在")
    
    # 验证模板存在
    template = None
    if inspection.template_id:
        template = TEMP_TEMPLATES.get(inspection.template_id)
        if not template:
            raise HTTPException(status_code=404, detail="巡检模板不存在")
    else:
        # 使用默认模板
        device_type = device.get("device_type")
        for t in TEMP_TEMPLATES.values():
            if t.get("is_default") and device_type in t.get("device_types", []):
                template = t
                inspection.template_id = t["id"]
                break
        
        if not template:
            raise HTTPException(status_code=400, detail="未找到适合的默认巡检模板")
    
    # 生成新ID
    new_id = max(TEMP_INSPECTIONS.keys()) + 1 if TEMP_INSPECTIONS else 1
    
    # 创建巡检记录
    now = datetime.now()
    new_inspection = {
        "id": new_id,
        "device_id": inspection.device_id,
        "template_id": inspection.template_id,
        "name": inspection.name or f"{device['name']} - {template['name']}",
        "trigger": InspectionTrigger.MANUAL,
        "status": InspectionStatus.PENDING,
        "scheduled_at": inspection.scheduled_at or now,
        "total_checks": len(template.get("check_items", [])),
        "passed_checks": 0,
        "failed_checks": 0,
        "created_at": now,
        "updated_at": now
    }
    
    TEMP_INSPECTIONS[new_id] = new_inspection
    
    # 如果是立即执行，添加到后台任务
    if not inspection.scheduled_at or inspection.scheduled_at <= now:
        background_tasks.add_task(
            execute_inspection_task,
            new_id,
            device,
            template
        )
    
    logger.info("Inspection created", 
                inspection_id=new_id,
                device_id=inspection.device_id,
                template_id=inspection.template_id,
                created_by=current_user["id"])
    
    return Inspection(**new_inspection)

@router.get("/{inspection_id}", response_model=Inspection, summary="获取巡检详情")
async def get_inspection(
    inspection_id: int,
    current_user: dict = Depends(require_permission("inspections:read"))
):
    """
    获取指定巡检的详细信息
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
    """后台执行巡检任务"""
    try:
        # 更新巡检状态为运行中
        inspection = TEMP_INSPECTIONS.get(inspection_id)
        if inspection:
            inspection["status"] = InspectionStatus.RUNNING
            inspection["started_at"] = datetime.now()
            inspection["updated_at"] = datetime.now()
        
        # 执行巡检
        result = await inspection_service.execute_inspection(inspection_id, device_info, template_config)
        
        # 更新巡检记录
        if inspection:
            inspection.update({
                "status": result["status"],
                "completed_at": datetime.now(),
                "total_checks": result.get("total_checks", 0),
                "passed_checks": result.get("passed_checks", 0),
                "failed_checks": result.get("failed_checks", 0),
                "error_message": result.get("error_message"),
                "updated_at": datetime.now()
            })
            
            # 保存巡检结果
            if result.get("results"):
                TEMP_INSPECTION_RESULTS[inspection_id] = result["results"]
        
        logger.info("Inspection task completed", 
                   inspection_id=inspection_id,
                   status=result["status"])
        
    except Exception as e:
        # 处理异常
        logger.error("Inspection task failed", 
                    inspection_id=inspection_id,
                    error=str(e))
        
        if inspection_id in TEMP_INSPECTIONS:
            TEMP_INSPECTIONS[inspection_id].update({
                "status": InspectionStatus.FAILED,
                "error_message": str(e),
                "completed_at": datetime.now(),
                "updated_at": datetime.now()
            })

# ============= 报告生成相关端点 =============

@router.post("/{inspection_id}/report", summary="生成单次巡检报告")
async def generate_inspection_report(
    inspection_id: int,
    format_type: str = Query("excel", regex="^(excel|pdf)$", description="报告格式"),
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
    """计算巡检执行时长（秒）"""
    try:
        if inspection.get("started_at") and inspection.get("completed_at"):
            duration = (inspection["completed_at"] - inspection["started_at"]).total_seconds()
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

# ============= 统计数据端点 =============

@router.get("/stats", summary="获取巡检统计数据")
async def get_inspection_stats(
    time_range: Optional[str] = Query("7d", description="时间范围: 1d, 7d, 30d"),
    current_user: dict = Depends(require_permission("inspections:read"))
):
    """
    获取巡检统计数据，包括策略数量、执行次数等
    """
    try:
        # 计算时间范围
        now = datetime.now()
        if time_range == "1d":
            start_date = now - timedelta(days=1)
        elif time_range == "30d":
            start_date = now - timedelta(days=30)
        else:  # 默认7d
            start_date = now - timedelta(days=7)

        # 统计模板数量
        total_strategies = len(TEMP_TEMPLATES)
        active_strategies = len([t for t in TEMP_TEMPLATES.values() if t.get("is_active", True)])

        # 统计今日执行数量
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
        today_executions = len([
            i for i in TEMP_INSPECTIONS.values()
            if i.get("created_at", datetime.min) >= today_start
        ])

        # 统计成功率
        completed_inspections = [
            i for i in TEMP_INSPECTIONS.values()
            if i.get("status") in [InspectionStatus.COMPLETED, InspectionStatus.FAILED]
        ]

        if completed_inspections:
            successful_count = len([
                i for i in completed_inspections
                if i.get("status") == InspectionStatus.COMPLETED
            ])
            success_rate = (successful_count / len(completed_inspections)) * 100
        else:
            success_rate = 0.0

        # 计算平均评分
        completed_with_results = [
            i for i in completed_inspections
            if i.get("total_checks", 0) > 0
        ]

        if completed_with_results:
            total_score = 0
            for inspection in completed_with_results:
                passed = inspection.get("passed_checks", 0)
                total = inspection.get("total_checks", 1)
                score = (passed / total) * 100
                total_score += score

            avg_score = total_score / len(completed_with_results)
        else:
            avg_score = 0.0

        # 获取最近执行记录
        recent_executions = sorted(
            TEMP_INSPECTIONS.values(),
            key=lambda x: x.get("created_at", datetime.min),
            reverse=True
        )[:10]

        # 计算与上周的对比数据
        last_week_start = now - timedelta(days=14)  # 两周前
        last_week_end = now - timedelta(days=7)     # 一周前

        # 上周统计
        last_week_executions = len([
            i for i in TEMP_INSPECTIONS.values()
            if i.get("created_at") and last_week_start.date() <= i["created_at"].date() <= last_week_end.date()
        ])

        last_week_completed = [
            i for i in TEMP_INSPECTIONS.values()
            if (i.get("created_at") and last_week_start.date() <= i["created_at"].date() <= last_week_end.date()
                and i.get("status") in [InspectionStatus.COMPLETED, InspectionStatus.FAILED])
        ]

        if last_week_completed:
            last_week_successful = len([
                i for i in last_week_completed
                if i.get("status") == InspectionStatus.COMPLETED
            ])
            last_week_success_rate = (last_week_successful / len(last_week_completed)) * 100
        else:
            last_week_success_rate = 0.0

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
            "successRate": round(success_rate, 1),
            "avgScore": round(avg_score, 1),
            "changes": {
                "executionsChange": calculate_change_percent(today_executions, last_week_executions),
                "successRateChange": calculate_change_percent(success_rate, last_week_success_rate),
                "avgScoreChange": calculate_change_percent(avg_score, max(1, avg_score - 5)),  # 简化计算
                "strategiesChange": f"+{max(0, active_strategies - total_strategies + active_strategies)}"  # 简化计算
            },
            "recentExecutions": [
                {
                    "id": str(execution.get("id")),
                    "strategyId": str(execution.get("template_id", "")),
                    "strategyName": execution.get("name", ""),
                    "triggerType": execution.get("trigger", InspectionTrigger.MANUAL).value,
                    "triggerUser": "system",  # TODO: 从用户信息获取
                    "status": execution.get("status", InspectionStatus.PENDING).value,
                    "progress": 100 if execution.get("status") in [InspectionStatus.COMPLETED, InspectionStatus.FAILED] else 0,
                    "totalDevices": 1,  # 当前是单设备巡检
                    "completedDevices": 1 if execution.get("status") == InspectionStatus.COMPLETED else 0,
                    "startTime": execution.get("started_at", execution.get("created_at", datetime.now())).isoformat() if execution.get("started_at") or execution.get("created_at") else None,
                    "endTime": execution.get("completed_at").isoformat() if execution.get("completed_at") else None,
                    "duration": _calculate_execution_duration(execution),
                    "summary": {
                        "totalChecks": execution.get("total_checks", 0),
                        "passedChecks": execution.get("passed_checks", 0),
                        "failedChecks": execution.get("failed_checks", 0),
                        "warningChecks": 0,  # TODO: 从结果中计算
                        "score": (execution.get("passed_checks", 0) / max(1, execution.get("total_checks", 1))) * 100,
                        "deviceResults": []
                    }
                }
                for execution in recent_executions
            ]
        }

        logger.info("Inspection stats retrieved",
                   time_range=time_range,
                   total_strategies=total_strategies,
                   user_id=current_user["id"])

        return {
            "success": True,
            "data": stats_data
        }

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
    current_user: dict = Depends(require_permission("inspections:read"))
):
    """
    获取巡检执行趋势数据，用于生成趋势图表
    """
    try:
        from datetime import datetime, timedelta

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

        # 基于现有数据生成趋势（实际应查询数据库）
        trends_data = []
        current_date = start

        while current_date <= end:
            # 计算该日期的执行数据
            day_inspections = [
                i for i in TEMP_INSPECTIONS.values()
                if i.get("created_at") and i["created_at"].date() == current_date.date()
            ]

            executions = len(day_inspections)
            success = len([i for i in day_inspections if i.get("status") == InspectionStatus.COMPLETED])
            failed = len([i for i in day_inspections if i.get("status") == InspectionStatus.FAILED])

            # 计算平均评分
            if day_inspections:
                total_score = sum((i.get("passed_checks", 0) / max(1, i.get("total_checks", 1))) * 100
                                for i in day_inspections if i.get("total_checks", 0) > 0)
                avg_score = total_score / len(day_inspections) if day_inspections else 0
            else:
                avg_score = 0

            trends_data.append({
                "date": current_date.strftime("%Y-%m-%d"),
                "executions": executions,
                "success": success,
                "failed": failed,
                "avgScore": round(avg_score, 1)
            })

            current_date += timedelta(days=1)

        logger.info("Inspection trends retrieved",
                   period=period,
                   start_date=start,
                   end_date=end,
                   user_id=current_user["id"])

        return {
            "success": True,
            "data": trends_data
        }

    except Exception as e:
        logger.error("Failed to get inspection trends",
                    error=str(e))
        raise HTTPException(status_code=500, detail=f"获取趋势数据失败: {str(e)}")

@router.get("/device-distribution", summary="获取设备类型分布")
async def get_device_distribution(
    current_user: dict = Depends(require_permission("inspections:read"))
):
    """
    获取巡检设备类型分布数据
    """
    try:
        from src.api.devices import TEMP_DEVICES

        # 统计设备类型
        device_types = {}
        for device in TEMP_DEVICES.values():
            device_type = device.get("device_type", "unknown")
            device_name = {
                "router": "路由器",
                "switch": "交换机",
                "firewall": "防火墙",
                "server": "服务器",
                "unknown": "其他"
            }.get(device_type, "其他")

            if device_name not in device_types:
                device_types[device_name] = 0
            device_types[device_name] += 1

        # 转换为前端需要的格式
        colors = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6"]
        distribution_data = []
        for i, (name, count) in enumerate(device_types.items()):
            distribution_data.append({
                "name": name,
                "value": count,
                "color": colors[i % len(colors)]
            })

        logger.info("Device distribution retrieved",
                   types_count=len(device_types),
                   user_id=current_user["id"])

        return {
            "success": True,
            "data": distribution_data
        }

    except Exception as e:
        logger.error("Failed to get device distribution",
                    error=str(e))
        raise HTTPException(status_code=500, detail=f"获取设备分布失败: {str(e)}")

@router.get("/problem-distribution", summary="获取问题分布统计")
async def get_problem_distribution(
    current_user: dict = Depends(require_permission("inspections:read"))
):
    """
    获取巡检中常见问题的分布统计
    """
    try:
        # 分析巡检结果中的问题类型（基于结果数据）
        problem_stats = {}

        for inspection_id, results in TEMP_INSPECTION_RESULTS.items():
            for result in results:
                if result.get("status") in [CheckItemStatus.FAIL, CheckItemStatus.WARNING]:
                    check_type = result.get("check_item_type", "")
                    category = {
                        "connectivity": "网络连通性",
                        "cpu_usage": "CPU使用率",
                        "memory_usage": "内存使用率",
                        "disk_usage": "磁盘空间",
                        "interface_status": "端口状态",
                        "temperature": "温度告警"
                    }.get(check_type, result.get("check_item_name", "其他"))

                    if category not in problem_stats:
                        problem_stats[category] = 0
                    problem_stats[category] += 1

        # 如果没有实际数据，返回空统计
        distribution_data = [
            {"category": category, "count": count}
            for category, count in problem_stats.items()
        ]

        # 按问题数量排序
        distribution_data.sort(key=lambda x: x["count"], reverse=True)

        logger.info("Problem distribution retrieved",
                   categories_count=len(distribution_data),
                   user_id=current_user["id"])

        return {
            "success": True,
            "data": distribution_data
        }

    except Exception as e:
        logger.error("Failed to get problem distribution",
                    error=str(e))
        raise HTTPException(status_code=500, detail=f"获取问题分布失败: {str(e)}")