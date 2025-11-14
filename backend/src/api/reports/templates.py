"""
报表模板管理API路由
提供报表模板的CRUD操作和模板管理功能
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
    ReportTemplateCreate,
    ReportTemplateUpdate,
    ReportTemplateResponse
)
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


@router.get("/templates",
            response_model=ApiResponse,
            summary="获取报表模板列表")
async def get_report_templates(
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(
        ReportConstants.DEFAULT_PAGE_SIZE,
        ge=1,
        le=ReportConstants.MAX_PAGE_SIZE,
        description="每页数量"
    ),
    search: Optional[str] = Query(None, description="搜索关键词"),
    report_type: Optional[str] = Query(None, description="报表类型"),
    is_default: Optional[bool] = Query(None, description="是否为默认模板"),
    current_user: dict = Depends(require_permission("reports:read")),
    db: AsyncSession = Depends(get_db_session)
):
    """
    获取报表模板列表（分页）

    **功能说明**：
    - 查询所有激活的报表模板
    - 支持关键词搜索（名称、描述）
    - 支持按报表类型筛选
    - 支持按是否默认模板筛选
    - 支持分页查询

    **返回数据**：
    - items: 模板列表
    - total: 总数量
    - page: 当前页码
    - pageSize: 每页数量

    **权限要求**: reports:read
    """
    try:
        # 创建分页参数对象
        pagination = PaginationParams(page=page, page_size=page_size)

        logger.info("Fetching report templates",
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

        # 报表类型筛选
        if report_type:
            try:
                type_enum = ReportType(report_type)
                conditions.append(ReportTemplate.report_type == type_enum)
            except ValueError:
                raise HTTPException(status_code=400, detail=f"无效的报表类型: {report_type}")

        # 是否默认模板筛选
        if is_default is not None:
            conditions.append(ReportTemplate.is_default == is_default)

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
            .order_by(desc(ReportTemplate.is_default), desc(ReportTemplate.created_at))
            .offset(pagination.offset)
            .limit(pagination.limit)
        )

        result = await db.execute(data_query)
        templates = result.scalars().all()

        # 使用辅助函数批量转换为前端格式
        items = convert_templates_to_frontend(templates, include_usage=False)

        logger.info("Report templates fetched successfully",
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

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to fetch report templates",
                    error=str(e),
                    error_type=type(e).__name__)
        raise HTTPException(
            status_code=500,
            detail=f"获取报表模板列表失败: {str(e)}"
        )


@router.get("/templates/{template_id}",
            response_model=ApiResponse,
            summary="获取报表模板详情")
async def get_report_template(
    template_id: int,
    current_user: dict = Depends(require_permission("reports:read")),
    db: AsyncSession = Depends(get_db_session)
):
    """
    获取单个报表模板的详细信息

    **参数**：
    - template_id: 模板ID

    **返回**：
    - 完整的模板信息（包括图表、表格、样式配置等）

    **权限要求**: reports:read
    """
    try:
        logger.info("Fetching report template detail",
                   template_id=template_id,
                   user=current_user["id"])

        # 查询模板
        query = select(ReportTemplate).where(ReportTemplate.id == template_id)
        result = await db.execute(query)
        template = result.scalar_one_or_none()

        if not template:
            raise HTTPException(status_code=404, detail="模板不存在")

        if not template.is_active:
            raise HTTPException(status_code=404, detail="模板已被停用")

        # 使用辅助函数转换为前端格式
        template_data = convert_template_to_frontend(template, include_usage=False)

        logger.info("Report template detail fetched successfully",
                   template_id=template_id,
                   user=current_user["id"])

        return ApiResponse(
            code=200,
            message="获取成功",
            data=template_data
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to fetch report template detail",
                    template_id=template_id,
                    error=str(e),
                    error_type=type(e).__name__)
        raise HTTPException(
            status_code=500,
            detail=f"获取模板详情失败: {str(e)}"
        )


@router.post("/templates",
             response_model=ApiResponse,
             summary="创建报表模板")
async def create_report_template(
    template_data: ReportTemplateCreate,
    current_user: dict = Depends(require_permission("reports:write")),
    db: AsyncSession = Depends(get_db_session)
):
    """
    创建新的报表模板

    **参数**：
    - template_data: 模板数据

    **返回**：
    - 创建的模板信息

    **权限要求**: reports:write
    """
    try:
        logger.info("Creating report template",
                   name=template_data.name,
                   report_type=template_data.report_type,
                   user=current_user["id"])

        # 创建新模板
        new_template = ReportTemplate(
            name=template_data.name,
            description=template_data.description,
            report_type=template_data.report_type,
            config=template_data.config,
            chart_configs=template_data.chart_configs,
            table_configs=template_data.table_configs,
            theme=template_data.theme,
            logo_url=template_data.logo_url,
            header_text=template_data.header_text,
            footer_text=template_data.footer_text,
            is_default=template_data.is_default,
            is_active=template_data.is_active,
            created_by=current_user["id"]
        )

        db.add(new_template)
        await db.commit()
        await db.refresh(new_template)

        # 使用辅助函数转换为前端格式
        response_data = convert_template_to_frontend(new_template, include_usage=False)

        logger.info("Report template created successfully",
                   template_id=new_template.id,
                   user=current_user["id"])

        return ApiResponse(
            code=200,
            message="创建成功",
            data=response_data
        )

    except Exception as e:
        logger.error("Failed to create report template",
                    error=str(e),
                    error_type=type(e).__name__)
        await db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"创建模板失败: {str(e)}"
        )


@router.put("/templates/{template_id}",
            response_model=ApiResponse,
            summary="更新报表模板")
async def update_report_template(
    template_id: int,
    template_data: ReportTemplateUpdate,
    current_user: dict = Depends(require_permission("reports:write")),
    db: AsyncSession = Depends(get_db_session)
):
    """
    更新已有的报表模板

    **参数**：
    - template_id: 模板ID
    - template_data: 需要更新的模板数据（只更新提供的字段）

    **返回**：
    - 更新后的模板信息

    **权限要求**: reports:write
    """
    try:
        logger.info("Updating report template",
                   template_id=template_id,
                   user=current_user["id"])

        # 查询模板
        query = select(ReportTemplate).where(ReportTemplate.id == template_id)
        result = await db.execute(query)
        template = result.scalar_one_or_none()

        if not template:
            raise HTTPException(status_code=404, detail="模板不存在")

        # 检查权限：只能更新自己创建的模板（默认模板除外）
        if template.is_default:
            # 默认模板可能需要更高权限才能修改
            # TODO: 检查管理员权限
            pass
        elif template.created_by != current_user["id"]:
            raise HTTPException(status_code=403, detail="无权限更新此模板")

        # 更新字段（只更新提供的字段）
        update_data = template_data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            if hasattr(template, field):
                setattr(template, field, value)

        await db.commit()
        await db.refresh(template)

        # 使用辅助函数转换为前端格式
        response_data = convert_template_to_frontend(template, include_usage=False)

        logger.info("Report template updated successfully",
                   template_id=template_id,
                   user=current_user["id"])

        return ApiResponse(
            code=200,
            message="更新成功",
            data=response_data
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to update report template",
                    template_id=template_id,
                    error=str(e),
                    error_type=type(e).__name__)
        await db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"更新模板失败: {str(e)}"
        )


@router.delete("/templates/{template_id}",
               response_model=ApiResponse,
               summary="删除报表模板")
async def delete_report_template(
    template_id: int,
    current_user: dict = Depends(require_permission("reports:write")),
    db: AsyncSession = Depends(get_db_session)
):
    """
    删除报表模板（软删除）

    **参数**：
    - template_id: 模板ID

    **返回**：
    - 删除确认消息

    **权限要求**: reports:write

    **注意**：
    - 默认模板不能删除
    - 只能删除自己创建的模板
    - 采用软删除（设置is_active=False）
    """
    try:
        logger.info("Deleting report template",
                   template_id=template_id,
                   user=current_user["id"])

        # 查询模板
        query = select(ReportTemplate).where(ReportTemplate.id == template_id)
        result = await db.execute(query)
        template = result.scalar_one_or_none()

        if not template:
            raise HTTPException(status_code=404, detail="模板不存在")

        # 不能删除默认模板
        if template.is_default:
            raise HTTPException(status_code=403, detail="不能删除默认模板")

        # 检查权限：只能删除自己创建的模板
        if template.created_by != current_user["id"]:
            # TODO: 检查管理员权限
            raise HTTPException(status_code=403, detail="无权限删除此模板")

        # 软删除
        template.is_active = False
        await db.commit()

        logger.info("Report template deleted successfully",
                   template_id=template_id,
                   user=current_user["id"])

        return ApiResponse(
            code=200,
            message="删除成功",
            data={"id": str(template_id), "deleted": True}
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to delete report template",
                    template_id=template_id,
                    error=str(e),
                    error_type=type(e).__name__)
        await db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"删除模板失败: {str(e)}"
        )


@router.post("/templates/{template_id}/clone",
             response_model=ApiResponse,
             summary="克隆报表模板")
async def clone_report_template(
    template_id: int,
    new_name: Optional[str] = Query(None, description="新模板名称"),
    current_user: dict = Depends(require_permission("reports:write")),
    db: AsyncSession = Depends(get_db_session)
):
    """
    克隆已有的报表模板

    **参数**：
    - template_id: 要克隆的模板ID
    - new_name: 新模板名称（可选，默认为"原名称 - 副本"）

    **返回**：
    - 新创建的模板信息

    **权限要求**: reports:write

    **说明**：
    - 克隆会复制所有配置信息
    - 新模板的created_by设置为当前用户
    - 新模板不会是默认模板（is_default=False）
    """
    try:
        logger.info("Cloning report template",
                   template_id=template_id,
                   user=current_user["id"])

        # 查询原模板
        query = select(ReportTemplate).where(ReportTemplate.id == template_id)
        result = await db.execute(query)
        source_template = result.scalar_one_or_none()

        if not source_template:
            raise HTTPException(status_code=404, detail="模板不存在")

        if not source_template.is_active:
            raise HTTPException(status_code=404, detail="模板已被停用")

        # 确定新模板名称
        if not new_name:
            new_name = f"{source_template.name} - 副本"

        # 创建新模板（复制所有配置）
        new_template = ReportTemplate(
            name=new_name,
            description=source_template.description,
            report_type=source_template.report_type,
            config=source_template.config,
            chart_configs=source_template.chart_configs,
            table_configs=source_template.table_configs,
            theme=source_template.theme,
            logo_url=source_template.logo_url,
            header_text=source_template.header_text,
            footer_text=source_template.footer_text,
            is_default=False,  # 克隆的模板不是默认模板
            is_active=True,
            created_by=current_user["id"]
        )

        db.add(new_template)
        await db.commit()
        await db.refresh(new_template)

        # 使用辅助函数转换为前端格式
        response_data = convert_template_to_frontend(new_template, include_usage=False)

        logger.info("Report template cloned successfully",
                   source_id=template_id,
                   new_id=new_template.id,
                   user=current_user["id"])

        return ApiResponse(
            code=200,
            message="克隆成功",
            data=response_data
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to clone report template",
                    template_id=template_id,
                    error=str(e),
                    error_type=type(e).__name__)
        await db.rollback()
        raise HTTPException(
            status_code=500,
            detail=f"克隆模板失败: {str(e)}"
        )
