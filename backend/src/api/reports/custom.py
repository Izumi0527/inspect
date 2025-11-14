"""
自定义报表配置API路由
提供自定义报表配置的CRUD操作
"""
from fastapi import APIRouter, HTTPException, Depends, Query
from sqlalchemy import select, and_, or_, func, desc
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Optional, List
from datetime import datetime
import structlog

from src.core.permissions import require_permission
from src.core.database import get_db_session
from src.models.report import ReportTemplate, ReportType
from src.schemas.report import (
    ApiResponse,
    convert_snake_to_camel_dict,
    ReportTemplateCreate,
    ReportTemplateUpdate,
    GenerateReportRequest,
    PreviewReportRequest
)
from src.core.config import settings
# 导入辅助函数和工具类
from src.api.reports.helpers import (
    ReportConstants,
    PaginationParams,
    PaginatedResponse,
    convert_template_to_frontend,
    convert_templates_to_frontend,
    build_search_pattern
)

logger = structlog.get_logger()
router = APIRouter()


@router.get("/custom/test",
            response_model=ApiResponse,
            summary="测试端点-验证数据库连接")
async def test_custom_reports(
    current_user: dict = Depends(require_permission("reports:read")),
    db: AsyncSession = Depends(get_db_session)
):
    """
    测试端点：验证数据库连接和基本查询功能
    不读取report_type字段，避免枚举问题
    """
    try:
        # 只查询基本字段，不包含report_type
        query = select(
            ReportTemplate.id,
            ReportTemplate.name,
            ReportTemplate.description,
            ReportTemplate.is_active,
            ReportTemplate.is_default,
            ReportTemplate.created_at
        ).where(ReportTemplate.is_active == True).limit(5)

        result = await db.execute(query)
        rows = result.all()

        items = []
        for row in rows:
            items.append({
                "id": row.id,
                "name": row.name,
                "description": row.description,
                "isActive": row.is_active,
                "isDefault": row.is_default,
                "createdAt": row.created_at.isoformat() if row.created_at else None
            })

        return ApiResponse(
            code=200,
            message="测试成功",
            data={
                "count": len(items),
                "items": items,
                "note": "此端点跳过report_type字段以避免枚举问题"
            }
        )
    except Exception as e:
        logger.error("Test endpoint failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"测试失败: {str(e)}")


@router.get("/custom/configs",
            response_model=ApiResponse,
            summary="获取自定义报表配置列表")
async def get_custom_report_configs(
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(
        ReportConstants.DEFAULT_PAGE_SIZE,
        ge=1,
        le=ReportConstants.MAX_PAGE_SIZE,
        description="每页数量"
    ),
    search: Optional[str] = Query(None, description="搜索关键词"),
    template_type: Optional[str] = Query(None, description="模板类型"),
    current_user: dict = Depends(require_permission("reports:read")),
    db: AsyncSession = Depends(get_db_session)
):
    """
    获取自定义报表配置列表（分页）

    **功能说明**：
    - 查询所有激活的报表模板配置
    - 支持关键词搜索（名称、描述）
    - 支持按模板类型筛选
    - 支持分页查询

    **返回数据**：
    - items: 配置列表（camelCase格式）
    - total: 总数量
    - page: 当前页码
    - pageSize: 每页数量

    **权限要求**: reports:read
    """
    try:
        # 创建分页参数对象
        pagination = PaginationParams(page=page, page_size=page_size)

        logger.info("Fetching custom report configs",
                   page=pagination.page,
                   page_size=pagination.page_size,
                   search=search,
                   user=current_user["id"])

        # 构建查询条件
        conditions = [ReportTemplate.is_active == True]

        # 关键词搜索
        if search:
            search_pattern = build_search_pattern(search)
            conditions.append(
                or_(
                    ReportTemplate.name.ilike(search_pattern),
                    ReportTemplate.description.ilike(search_pattern)
                )
            )

        # 类型筛选
        if template_type:
            # 暂时忽略类型筛选，因为ReportTemplate表中没有单独的type字段
            # 可以根据report_type筛选
            pass

        # 计数查询
        count_query = select(func.count()).select_from(ReportTemplate)
        if conditions:
            count_query = count_query.where(and_(*conditions))

        count_result = await db.execute(count_query)
        total = count_result.scalar() or 0

        # 数据查询
        data_query = (
            select(ReportTemplate)
            .where(and_(*conditions) if conditions else True)
            .order_by(desc(ReportTemplate.created_at))
            .offset(pagination.offset)
            .limit(pagination.limit)
        )

        result = await db.execute(data_query)
        templates = result.scalars().all()

        # 使用辅助函数转换为前端格式
        items = convert_templates_to_frontend(templates, include_usage=True)

        logger.info("Custom report configs fetched successfully",
                   total=total,
                   returned=len(items),
                   user=current_user["id"])

        # 使用辅助类创建分页响应
        return ApiResponse(
            code=200,
            message="获取成功",
            data=PaginatedResponse.create(
                items=items,
                total=total,
                page=pagination.page,
                page_size=pagination.page_size
            )
        )

    except Exception as e:
        logger.error("Failed to fetch custom report configs",
                    error=str(e),
                    error_type=type(e).__name__)
        raise HTTPException(
            status_code=500,
            detail=f"获取自定义报表配置列表失败: {str(e)}"
        )


@router.get("/custom/configs/{config_id}",
            response_model=ApiResponse,
            summary="获取自定义报表配置详情")
async def get_custom_report_config(
    config_id: int,
    current_user: dict = Depends(require_permission("reports:read")),
    db: AsyncSession = Depends(get_db_session)
):
    """
    获取单个自定义报表配置的详细信息

    **参数**：
    - config_id: 配置ID

    **返回**：
    - 完整的配置信息（包括图表、表格、过滤器等配置）

    **权限要求**: reports:read
    """
    try:
        logger.info("Fetching custom report config detail",
                   config_id=config_id,
                   user=current_user["id"])

        # 查询配置
        query = select(ReportTemplate).where(ReportTemplate.id == config_id)
        result = await db.execute(query)
        template = result.scalar_one_or_none()

        if not template:
            raise HTTPException(status_code=404, detail="配置不存在")

        if not template.is_active:
            raise HTTPException(status_code=404, detail="配置已被停用")

        # 使用辅助函数转换为前端格式
        config_data = convert_template_to_frontend(template, include_usage=False)

        logger.info("Custom report config detail fetched successfully",
                   config_id=config_id,
                   user=current_user["id"])

        return ApiResponse(
            code=200,
            message="获取成功",
            data=config_data
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to fetch custom report config detail",
                    config_id=config_id,
                    error=str(e),
                    error_type=type(e).__name__)
        raise HTTPException(
            status_code=500,
            detail=f"获取配置详情失败: {str(e)}"
        )


@router.post("/custom/configs",
            response_model=ApiResponse,
            summary="创建自定义报表配置")
async def create_custom_report_config(
    config_data: ReportTemplateCreate,
    current_user: dict = Depends(require_permission("reports:write")),
    db: AsyncSession = Depends(get_db_session)
):
    """
    创建新的自定义报表配置

    **参数**：
    - config_data: 配置数据（名称、描述、类型、配置等）

    **返回**：
    - 创建的配置信息（包括ID）

    **权限要求**: reports:write
    """
    try:
        logger.info("Creating custom report config",
                   name=config_data.name,
                   report_type=config_data.report_type,
                   user=current_user["id"])

        # 创建新模板
        new_template = ReportTemplate(
            name=config_data.name,
            description=config_data.description,
            report_type=config_data.report_type,
            config=config_data.config,
            chart_configs=config_data.chart_configs,
            table_configs=config_data.table_configs,
            theme=config_data.theme,
            logo_url=config_data.logo_url,
            header_text=config_data.header_text,
            footer_text=config_data.footer_text,
            is_default=config_data.is_default,
            is_active=config_data.is_active,
            created_by=current_user["id"]
        )

        db.add(new_template)
        await db.commit()
        await db.refresh(new_template)

        # 使用辅助函数转换为前端格式
        response_data = convert_template_to_frontend(new_template, include_usage=False)

        logger.info("Custom report config created successfully",
                   config_id=new_template.id,
                   user=current_user["id"])

        return ApiResponse(
            code=200,
            message="创建成功",
            data=response_data
        )

    except Exception as e:
        logger.error("Failed to create custom report config",
                    error=str(e),
                    error_type=type(e).__name__)
        await db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"创建配置失败: {str(e)}"
        )


@router.put("/custom/configs/{config_id}",
            response_model=ApiResponse,
            summary="更新自定义报表配置")
async def update_custom_report_config(
    config_id: int,
    config_data: ReportTemplateUpdate,
    current_user: dict = Depends(require_permission("reports:write")),
    db: AsyncSession = Depends(get_db_session)
):
    """
    更新已有的自定义报表配置

    **参数**：
    - config_id: 配置ID
    - config_data: 需要更新的配置数据（只更新提供的字段）

    **返回**：
    - 更新后的配置信息

    **权限要求**: reports:write
    """
    try:
        logger.info("Updating custom report config",
                   config_id=config_id,
                   user=current_user["id"])

        # 查询配置
        query = select(ReportTemplate).where(ReportTemplate.id == config_id)
        result = await db.execute(query)
        template = result.scalar_one_or_none()

        if not template:
            raise HTTPException(status_code=404, detail="配置不存在")

        # 检查权限：只能更新自己创建的配置，除非是默认模板
        if not template.is_default and template.created_by != current_user["id"]:
            # 可以在这里添加管理员权限检查
            raise HTTPException(status_code=403, detail="无权限更新此配置")

        # 更新字段（只更新提供的字段）
        update_data = config_data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            if hasattr(template, field):
                setattr(template, field, value)

        await db.commit()
        await db.refresh(template)

        # 使用辅助函数转换为前端格式
        response_data = convert_template_to_frontend(template, include_usage=False)

        logger.info("Custom report config updated successfully",
                   config_id=config_id,
                   user=current_user["id"])

        return ApiResponse(
            code=200,
            message="更新成功",
            data=response_data
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to update custom report config",
                    config_id=config_id,
                    error=str(e),
                    error_type=type(e).__name__)
        await db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"更新配置失败: {str(e)}"
        )


@router.delete("/custom/configs/{config_id}",
               response_model=ApiResponse,
               summary="删除自定义报表配置")
async def delete_custom_report_config(
    config_id: int,
    current_user: dict = Depends(require_permission("reports:write")),
    db: AsyncSession = Depends(get_db_session)
):
    """
    删除自定义报表配置（软删除）

    **参数**：
    - config_id: 配置ID

    **返回**：
    - 删除确认消息

    **权限要求**: reports:write

    **注意**：
    - 默认模板不能删除
    - 只能删除自己创建的配置
    - 采用软删除（设置is_active=False）
    """
    try:
        logger.info("Deleting custom report config",
                   config_id=config_id,
                   user=current_user["id"])

        # 查询配置
        query = select(ReportTemplate).where(ReportTemplate.id == config_id)
        result = await db.execute(query)
        template = result.scalar_one_or_none()

        if not template:
            raise HTTPException(status_code=404, detail="配置不存在")

        # 不能删除默认模板
        if template.is_default:
            raise HTTPException(status_code=403, detail="不能删除默认模板")

        # 检查权限：只能删除自己创建的配置
        if template.created_by != current_user["id"]:
            # 可以在这里添加管理员权限检查
            raise HTTPException(status_code=403, detail="无权限删除此配置")

        # 软删除
        template.is_active = False
        await db.commit()

        logger.info("Custom report config deleted successfully",
                   config_id=config_id,
                   user=current_user["id"])

        return ApiResponse(
            code=200,
            message="删除成功",
            data={"id": str(config_id), "deleted": True}
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to delete custom report config",
                    config_id=config_id,
                    error=str(e),
                    error_type=type(e).__name__)
        await db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"删除配置失败: {str(e)}"
        )


@router.post("/custom/configs/{config_id}/generate",
             response_model=ApiResponse,
             summary="使用配置生成报表")
async def generate_from_config(
    config_id: int,
    request_data: GenerateReportRequest,
    current_user: dict = Depends(require_permission("reports:read")),
    db: AsyncSession = Depends(get_db_session)
):
    """
    使用指定配置生成报表

    **参数**：
    - config_id: 配置ID
    - request_data: 生成参数（包含 parameters 和 format）

    **返回**：
    - 报表数据或下载链接

    **权限要求**: reports:read

    **流程**：
    1. 读取配置和模板
    2. 根据配置的 dataSource 和 filters 查询数据
    3. 生成报表（根据 chartConfigs、tableConfigs）
    4. 返回结果
    """
    try:
        logger.info("Generating report from config",
                   config_id=config_id,
                   format=request_data.format,
                   user=current_user["id"])

        # 1. 查询配置
        query = select(ReportTemplate).where(ReportTemplate.id == config_id)
        result = await db.execute(query)
        template = result.scalar_one_or_none()

        if not template:
            raise HTTPException(status_code=404, detail="配置不存在")

        if not template.is_active:
            raise HTTPException(status_code=404, detail="配置已被停用")

        # 2. 提取配置信息
        config = template.config or {}
        chart_configs = template.chart_configs or []
        table_configs = template.table_configs or []
        parameters = request_data.parameters or {}

        # 3. 查询数据
        # TODO: 根据 config 中的 dataSource 和 parameters 查询实际数据
        # 例如：
        # - dataSource: "inspection_executions" -> 查询巡检执行记录
        # - dataSource: "devices" -> 查询设备数据
        # - dataSource: "alerts" -> 查询告警数据

        # 临时示例数据
        report_data = {
            "title": template.name,
            "description": template.description,
            "generatedAt": datetime.now().isoformat(),
            "parameters": parameters,
            "charts": [],
            "tables": [],
            "summary": {
                "totalRecords": 0,
                "dataSource": config.get("dataSource", "unknown")
            }
        }

        # 4. 处理图表配置
        for chart_config in chart_configs:
            chart_data = {
                "id": chart_config.get("id", ""),
                "title": chart_config.get("title", ""),
                "type": chart_config.get("chartType", "line"),
                "data": []  # TODO: 根据 chart_config 的 dataSource 查询实际数据
            }
            report_data["charts"].append(chart_data)

        # 5. 处理表格配置
        for table_config in table_configs:
            table_data = {
                "id": table_config.get("id", ""),
                "title": table_config.get("title", ""),
                "columns": table_config.get("columns", []),
                "rows": []  # TODO: 根据 table_config 的 dataSource 查询实际数据
            }
            report_data["tables"].append(table_data)

        # 6. 如果需要生成文件（PDF、Excel等），调用导出服务
        # TODO: 实现文件生成逻辑
        if request_data.format in ["pdf", "excel", "word"]:
            # 调用导出服务生成文件
            # file_url = await export_service.generate_file(report_data, request_data.format)
            file_url = None  # 占位符
        else:
            file_url = None

        logger.info("Report generated successfully",
                   config_id=config_id,
                   user=current_user["id"])

        return ApiResponse(
            code=200,
            message="报表生成成功",
            data={
                "report": report_data,
                "fileUrl": file_url,
                "format": request_data.format
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to generate report",
                    config_id=config_id,
                    error=str(e),
                    error_type=type(e).__name__)
        raise HTTPException(
            status_code=500,
            detail=f"生成报表失败: {str(e)}"
        )


@router.post("/custom/configs/{config_id}/preview",
             response_model=ApiResponse,
             summary="预览报表数据")
async def preview_custom_report_config(
    config_id: int,
    request_data: PreviewReportRequest,
    current_user: dict = Depends(require_permission("reports:read")),
    db: AsyncSession = Depends(get_db_session)
):
    """
    预览报表数据（不生成完整报表）

    **参数**：
    - config_id: 配置ID
    - request_data: 预览参数（包含 parameters 和 limit）

    **返回**：
    - 预览数据（限量、格式化）

    **权限要求**: reports:read

    **用途**：
    - 在生成完整报表前，快速查看数据样本
    - 验证配置是否正确
    - 调整参数后即时预览
    """
    try:
        logger.info("Previewing report from config",
                   config_id=config_id,
                   limit=request_data.limit,
                   user=current_user["id"])

        # 1. 查询配置
        query = select(ReportTemplate).where(ReportTemplate.id == config_id)
        result = await db.execute(query)
        template = result.scalar_one_or_none()

        if not template:
            raise HTTPException(status_code=404, detail="配置不存在")

        if not template.is_active:
            raise HTTPException(status_code=404, detail="配置已被停用")

        # 2. 提取配置信息
        config = template.config or {}
        chart_configs = template.chart_configs or []
        table_configs = template.table_configs or []
        parameters = request_data.parameters or {}

        # 3. 查询预览数据（限量）
        # TODO: 根据 config 中的 dataSource 查询实际数据
        # 应用 limit 限制数据量

        # 临时示例数据
        preview_data = {
            "title": template.name,
            "description": template.description,
            "config": {
                "dataSource": config.get("dataSource", "unknown"),
                "filters": config.get("filters", [])
            },
            "parameters": parameters,
            "previewCharts": [],
            "previewTables": [],
            "dataInfo": {
                "estimatedTotalRecords": 0,
                "previewLimit": request_data.limit,
                "note": "这是预览数据，实际生成的报表可能包含更多记录"
            }
        }

        # 4. 处理图表预览（简化数据）
        for i, chart_config in enumerate(chart_configs[:5]):  # 最多预览5个图表
            chart_preview = {
                "id": chart_config.get("id", f"chart-{i}"),
                "title": chart_config.get("title", ""),
                "type": chart_config.get("chartType", "line"),
                "dataPreview": []  # TODO: 查询实际数据（限量）
            }
            preview_data["previewCharts"].append(chart_preview)

        # 5. 处理表格预览（限制行数）
        for i, table_config in enumerate(table_configs[:3]):  # 最多预览3个表格
            table_preview = {
                "id": table_config.get("id", f"table-{i}"),
                "title": table_config.get("title", ""),
                "columns": table_config.get("columns", []),
                "rowsPreview": [],  # TODO: 查询实际数据（限制为 limit）
                "totalRows": 0  # TODO: 查询总数
            }
            preview_data["previewTables"].append(table_preview)

        logger.info("Report preview generated successfully",
                   config_id=config_id,
                   user=current_user["id"])

        return ApiResponse(
            code=200,
            message="预览数据获取成功",
            data=preview_data
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to preview report",
                    config_id=config_id,
                    error=str(e),
                    error_type=type(e).__name__)
        raise HTTPException(
            status_code=500,
            detail=f"预览报表失败: {str(e)}"
        )


