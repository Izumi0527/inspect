"""
审计日志API路由 - 完整实现
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
    AuditStats, AuditLogResponse, AuditLogListResponse,
    ExportLogsRequest, CleanupLogsRequest,
)

logger = structlog.get_logger()

router = APIRouter(prefix="/audit", tags=["Audit Management"])


def _get_audit_service():
    from src.services.settings.audit_service import audit_settings_service
    return audit_settings_service


@router.get("/logs", response_model=AuditLogListResponse, summary="获取审计日志列表")
async def get_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user_id: Optional[str] = Query(None),
    action: Optional[str] = Query(None),
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = Query(None),
    start_date: Optional[str] = Query(None),
    end_date: Optional[str] = Query(None),
    current_user: dict = Depends(require_permission("settings:audit:read")),
    session: AsyncSession = Depends(get_db_session)
):
    try:
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

        count_stmt = select(func.count()).select_from(AuditLog)
        if conditions:
            count_stmt = count_stmt.where(and_(*conditions))
        total_result = await session.execute(count_stmt)
        total = total_result.scalar()

        stmt = stmt.order_by(AuditLog.created_at.desc())
        stmt = stmt.offset((page - 1) * page_size).limit(page_size)

        result = await session.execute(stmt)
        logs = result.scalars().all()

        log_responses = []
        for log in logs:
            username = None
            if log.user_id:
                user_stmt = select(User).where(User.id == log.user_id)
                user_result = await session.execute(user_stmt)
                user = user_result.scalar_one_or_none()
                if user:
                    username = user.username

            log_responses.append(AuditLogResponse(
                id=log.id, user_id=log.user_id, username=username,
                action=log.action, resource_type=log.resource_type,
                resource_id=log.resource_id, description=log.description,
                details=log.details, ip_address=log.ip_address,
                user_agent=log.user_agent, status=log.status,
                error_message=log.error_message, created_at=log.created_at
            ))

        return AuditLogListResponse(items=log_responses, total=total, page=page, pageSize=page_size)
    except Exception as e:
        logger.error("Failed to get audit logs", error=str(e))
        raise HTTPException(status_code=500, detail="获取审计日志失败")


@router.get("/stats", response_model=AuditStats)
async def get_audit_stats(
    current_user: dict = Depends(require_permission("settings:audit:read"))
):
    try:
        stats = await _get_audit_service().get_audit_statistics()
        return stats
    except Exception as e:
        logger.error("Failed to get audit statistics", error=str(e))
        raise HTTPException(status_code=500, detail=f"获取审计统计失败: {str(e)}")


@router.delete("/cleanup", summary="清理旧审计日志")
async def cleanup_audit_logs(
    request: CleanupLogsRequest,
    current_user: dict = Depends(require_permission("settings:audit:delete")),
    session: AsyncSession = Depends(get_db_session)
):
    try:
        before_dt = datetime.fromisoformat(request.beforeDate.replace('Z', '+00:00'))
        count_stmt = select(func.count()).select_from(AuditLog).where(AuditLog.created_at < before_dt)
        count_result = await session.execute(count_stmt)
        delete_count = count_result.scalar()

        delete_stmt = delete(AuditLog).where(AuditLog.created_at < before_dt)
        await session.execute(delete_stmt)
        await session.commit()

        return {"deletedCount": delete_count}
    except Exception as e:
        await session.rollback()
        logger.error("Failed to cleanup audit logs", error=str(e))
        raise HTTPException(status_code=500, detail="清理审计日志失败")

__all__ = ["router"]
