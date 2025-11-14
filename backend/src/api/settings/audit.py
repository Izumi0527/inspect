"""
Audit Settings API Router
审计日志扩展API路由
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_, delete
from datetime import datetime
import structlog
import csv
import io

from src.core.database import get_db_session
from src.core.permissions import require_permission
from src.models.user import AuditLog, User
from src.schemas.settings.audit import (
    AuditStats,
    AuditLogResponse,
    AuditLogListResponse,
    ExportLogsRequest,
    CleanupLogsRequest,
)
from src.services.settings.audit_service import audit_settings_service

logger = structlog.get_logger()

router = APIRouter(prefix="/audit", tags=["Audit Management"])


@router.get("/logs", response_model=AuditLogListResponse, summary="获取审计日志列表")
async def get_audit_logs(
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
    user_id: Optional[str] = Query(None, description="用户ID筛选"),
    action: Optional[str] = Query(None, description="操作类型筛选"),
    status_filter: Optional[str] = Query(None, alias="status", description="状态筛选"),
    search: Optional[str] = Query(None, description="搜索关键词"),
    start_date: Optional[str] = Query(None, description="开始日期"),
    end_date: Optional[str] = Query(None, description="结束日期"),
    current_user: dict = Depends(require_permission("settings:audit:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """
    获取审计日志列表（分页）

    支持多种筛选条件：
    - user_id: 按用户筛选
    - action: 按操作类型筛选
    - status: 按状态筛选 (success, failed, error)
    - search: 关键词搜索（描述、资源类型）
    - start_date/end_date: 时间范围筛选

    权限要求: settings:audit:read
    """
    try:
        # 构建查询
        stmt = select(AuditLog)
        conditions = []

        if user_id:
            conditions.append(AuditLog.user_id == user_id)
        if action:
            conditions.append(AuditLog.action == action)
        if status_filter:
            conditions.append(AuditLog.status == status_filter)
        if search:
            conditions.append(
                (AuditLog.description.ilike(f"%{search}%")) |
                (AuditLog.resource_type.ilike(f"%{search}%"))
            )
        if start_date:
            start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            conditions.append(AuditLog.created_at >= start_dt)
        if end_date:
            end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            conditions.append(AuditLog.created_at <= end_dt)

        if conditions:
            stmt = stmt.where(and_(*conditions))

        # 获取总数
        count_stmt = select(func.count()).select_from(AuditLog).where(and_(*conditions)) if conditions else select(func.count()).select_from(AuditLog)
        total_result = await session.execute(count_stmt)
        total = total_result.scalar()

        # 分页查询
        stmt = stmt.order_by(AuditLog.created_at.desc())
        stmt = stmt.offset((page - 1) * page_size).limit(page_size)

        result = await session.execute(stmt)
        logs = result.scalars().all()

        # 构建响应
        log_responses = []
        for log in logs:
            # 获取用户名（如果有用户ID）
            username = None
            if log.user_id:
                user_stmt = select(User).where(User.id == log.user_id)
                user_result = await session.execute(user_stmt)
                user = user_result.scalar_one_or_none()
                if user:
                    username = user.username

            log_responses.append(AuditLogResponse(
                id=log.id,
                user_id=log.user_id,
                username=username,
                action=log.action,
                resource_type=log.resource_type,
                resource_id=log.resource_id,
                description=log.description,
                details=log.details,
                ip_address=log.ip_address,
                user_agent=log.user_agent,
                status=log.status,
                error_message=log.error_message,
                created_at=log.created_at
            ))

        logger.info(
            "Retrieved audit logs",
            count=len(log_responses),
            total=total,
            page=page,
            user_id=current_user["id"]
        )

        return AuditLogListResponse(
            items=log_responses,
            total=total,
            page=page,
            pageSize=page_size
        )

    except Exception as e:
        logger.error("Failed to get audit logs", error=str(e), user_id=current_user["id"])
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取审计日志失败"
        )


@router.get("/logs/{log_id}", response_model=AuditLogResponse, summary="获取审计日志详情")
async def get_audit_log(
    log_id: str,
    current_user: dict = Depends(require_permission("settings:audit:read")),
    session: AsyncSession = Depends(get_db_session)
):
    """
    获取指定审计日志的详细信息

    权限要求: settings:audit:read
    """
    try:
        stmt = select(AuditLog).where(AuditLog.id == log_id)
        result = await session.execute(stmt)
        log = result.scalar_one_or_none()

        if not log:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"审计日志不存在: {log_id}"
            )

        # 获取用户名
        username = None
        if log.user_id:
            user_stmt = select(User).where(User.id == log.user_id)
            user_result = await session.execute(user_stmt)
            user = user_result.scalar_one_or_none()
            if user:
                username = user.username

        log_response = AuditLogResponse(
            id=log.id,
            user_id=log.user_id,
            username=username,
            action=log.action,
            resource_type=log.resource_type,
            resource_id=log.resource_id,
            description=log.description,
            details=log.details,
            ip_address=log.ip_address,
            user_agent=log.user_agent,
            status=log.status,
            error_message=log.error_message,
            created_at=log.created_at
        )

        logger.info("Retrieved audit log details", log_id=log_id, user_id=current_user["id"])
        return log_response

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get audit log", log_id=log_id, error=str(e), user_id=current_user["id"])
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取审计日志详情失败"
        )


@router.post("/export", summary="导出审计日志")
async def export_audit_logs(
    request: ExportLogsRequest,
    current_user: dict = Depends(require_permission("settings:audit:export")),
    session: AsyncSession = Depends(get_db_session)
):
    """
    导出审计日志

    支持格式: csv, excel, json

    权限要求: settings:audit:export
    """
    try:
        # 构建查询
        start_dt = datetime.fromisoformat(request.startDate.replace('Z', '+00:00'))
        end_dt = datetime.fromisoformat(request.endDate.replace('Z', '+00:00'))

        stmt = select(AuditLog).where(
            and_(
                AuditLog.created_at >= start_dt,
                AuditLog.created_at <= end_dt
            )
        ).order_by(AuditLog.created_at.desc())

        # 应用额外筛选
        if request.filters:
            if 'user_id' in request.filters:
                stmt = stmt.where(AuditLog.user_id == request.filters['user_id'])
            if 'action' in request.filters:
                stmt = stmt.where(AuditLog.action == request.filters['action'])
            if 'status' in request.filters:
                stmt = stmt.where(AuditLog.status == request.filters['status'])

        result = await session.execute(stmt)
        logs = result.scalars().all()

        # 导出为CSV
        if request.format == 'csv':
            output = io.StringIO()
            writer = csv.writer(output)

            # 写入表头
            writer.writerow([
                'ID', '用户ID', '操作', '资源类型', '资源ID',
                '描述', 'IP地址', '状态', '时间'
            ])

            # 写入数据
            for log in logs:
                writer.writerow([
                    log.id,
                    log.user_id or '',
                    log.action,
                    log.resource_type,
                    log.resource_id or '',
                    log.description,
                    log.ip_address or '',
                    log.status,
                    log.created_at.isoformat()
                ])

            output.seek(0)

            logger.info(
                "Audit logs exported",
                format=request.format,
                count=len(logs),
                exported_by=current_user["id"]
            )

            return StreamingResponse(
                iter([output.getvalue()]),
                media_type="text/csv",
                headers={
                    "Content-Disposition": f"attachment; filename=audit_logs_{datetime.now().strftime('%Y%m%d_%H%M%S')}.csv"
                }
            )

        # TODO: 实现excel和json导出
        raise HTTPException(
            status_code=status.HTTP_501_NOT_IMPLEMENTED,
            detail=f"暂不支持 {request.format} 格式导出"
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to export audit logs", error=str(e), user_id=current_user["id"])
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="导出审计日志失败"
        )


@router.delete("/cleanup", summary="清理旧审计日志")
async def cleanup_audit_logs(
    request: CleanupLogsRequest,
    current_user: dict = Depends(require_permission("settings:audit:delete")),
    session: AsyncSession = Depends(get_db_session)
):
    """
    清理指定日期之前的审计日志

    权限要求: settings:audit:delete

    注意: 此操作不可逆
    """
    try:
        before_dt = datetime.fromisoformat(request.beforeDate.replace('Z', '+00:00'))

        # 计算要删除的日志数量
        count_stmt = select(func.count()).select_from(AuditLog).where(
            AuditLog.created_at < before_dt
        )
        count_result = await session.execute(count_stmt)
        delete_count = count_result.scalar()

        # 执行删除
        delete_stmt = delete(AuditLog).where(AuditLog.created_at < before_dt)
        await session.execute(delete_stmt)
        await session.commit()

        logger.info(
            "Audit logs cleaned up",
            before_date=request.beforeDate,
            deleted_count=delete_count,
            cleaned_by=current_user["id"]
        )

        return {"deletedCount": delete_count}

    except Exception as e:
        await session.rollback()
        logger.error("Failed to cleanup audit logs", error=str(e), user_id=current_user["id"])
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="清理审计日志失败"
        )


@router.get("/stats", response_model=AuditStats)
async def get_audit_stats(
    current_user: dict = Depends(require_permission("settings:audit:read"))
):
    """
    获取审计日志统计数据

    返回详细的审计日志统计信息，包括:
    - 总日志数、时间维度统计（今日/本周/本月）
    - 按操作类型、状态、资源类型分类统计
    - 最活跃用户Top10
    - 高频操作Top10
    - 失败操作统计和失败率

    权限要求: settings:audit:stats

    **注意**: 导出和清理功能已存在于旧路由：
    - 导出: `POST /api/v1/settings/audit/logs/export`
    - 清理: `DELETE /api/v1/settings/audit/logs/cleanup`
    """
    try:
        stats = await audit_settings_service.get_audit_statistics()

        logger.info(
            "Audit statistics retrieved",
            total=stats.total_logs,
            failed_count=stats.failed_operations_count,
            user_id=current_user["id"]
        )

        return stats

    except Exception as e:
        logger.error("Failed to get audit statistics", error=str(e), user_id=current_user["id"])
        raise HTTPException(status_code=500, detail=f"获取审计统计失败: {str(e)}")
