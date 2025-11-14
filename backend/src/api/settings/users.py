"""
User Settings API Router
用户管理扩展API路由
"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from src.schemas.settings.users import (
    BatchUserOperation,
    BatchUserOperationResponse,
    UserStats,
    UserListResponse,
    UserResponse,
    UserCreate,
    UserUpdate,
    UserQueryParams,
    UserRole,
    UserStatus
)
from src.services.settings.users_service import user_settings_service
from src.core.permissions import require_permission
import structlog

logger = structlog.get_logger()

router = APIRouter(prefix="/users", tags=["User Management"])


@router.get("", response_model=UserListResponse)
async def get_users(
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
    search: Optional[str] = Query(None, max_length=100, description="搜索关键词"),
    role: Optional[UserRole] = Query(None, description="角色筛选"),
    status: Optional[UserStatus] = Query(None, description="状态筛选"),
    sort_by: str = Query("created_at", description="排序字段"),
    sort_order: str = Query("desc", pattern="^(asc|desc)$", description="排序方向"),
    current_user: dict = Depends(require_permission("settings:users:read"))
):
    """
    获取用户列表（分页）

    支持搜索和筛选：
    - **search**: 按用户名、邮箱、姓名搜索
    - **role**: 按角色筛选 (admin, operator, viewer)
    - **status**: 按状态筛选 (active, inactive, locked, pending)
    - **sort_by**: 排序字段 (username, email, role, created_at, last_login)
    - **sort_order**: 排序方向 (asc, desc)

    权限要求: settings:users:read
    """
    try:
        params = UserQueryParams(
            page=page,
            page_size=page_size,
            search=search,
            role=role,
            status=status,
            sort_by=sort_by,
            sort_order=sort_order
        )

        result = await user_settings_service.get_users_paginated(params)

        logger.info(
            "Users list retrieved",
            total=result.total,
            page=result.page,
            user_id=current_user["id"]
        )

        return result

    except Exception as e:
        logger.error("Failed to get users", error=str(e), user_id=current_user["id"])
        raise HTTPException(status_code=500, detail=f"获取用户列表失败: {str(e)}")


@router.get("/stats", response_model=UserStats)
async def get_user_stats(
    current_user: dict = Depends(require_permission("settings:users:read"))
):
    """
    获取用户统计数据

    返回详细的用户统计信息，包括:
    - 总用户数、活跃/停用/锁定用户数
    - 按角色分类统计
    - 时间维度统计（今日/本周/本月新增）
    - 登录统计
    - 最近活跃用户

    权限要求: settings:users:stats
    """
    try:
        stats = await user_settings_service.get_user_statistics()

        logger.info(
            "User statistics retrieved",
            total=stats.total_users,
            active=stats.active_users,
            user_id=current_user["id"]
        )

        return stats

    except Exception as e:
        logger.error("Failed to get user statistics", error=str(e), user_id=current_user["id"])
        raise HTTPException(status_code=500, detail=f"获取用户统计失败: {str(e)}")


@router.post("/batch", response_model=BatchUserOperationResponse)
async def batch_operate_users(
    request: BatchUserOperation,
    current_user: dict = Depends(require_permission("settings:users:batch"))
):
    """
    批量操作用户

    支持的操作类型:
    - **activate**: 激活用户
    - **deactivate**: 停用用户
    - **delete**: 删除用户
    - **reset_password**: 重置密码
    - **unlock**: 解锁用户
    - **assign_role**: 分配角色（需在params中提供role参数）

    权限要求: settings:users:batch
    """
    try:
        success_count, failed_count, results = await user_settings_service.batch_operate_users(
            user_ids=request.user_ids,
            operation=request.operation,
            params=request.params or {},
            operator_id=current_user["id"]
        )

        logger.info(
            "Batch user operation executed",
            operation=request.operation.value,
            success=success_count,
            failed=failed_count,
            user_id=current_user["id"]
        )

        message = f"批量操作完成：成功 {success_count} 个，失败 {failed_count} 个"

        return BatchUserOperationResponse(
            success_count=success_count,
            failed_count=failed_count,
            results=results,
            message=message
        )

    except Exception as e:
        logger.error("Failed to batch operate users", error=str(e), user_id=current_user["id"])
        raise HTTPException(status_code=500, detail=f"批量操作失败: {str(e)}")


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(
    user_id: str,
    current_user: dict = Depends(require_permission("settings:users:read"))
):
    """
    获取指定用户的详细信息

    权限要求：
    - 用户可以查看自己的详情
    - 管理员可以查看所有用户详情

    权限要求: settings:users:read
    """
    try:
        user = await user_settings_service.get_user_by_id(user_id)

        if not user:
            raise HTTPException(status_code=404, detail="用户不存在")

        logger.info(
            "User details retrieved",
            target_user_id=user_id,
            user_id=current_user["id"]
        )

        return user

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get user", error=str(e), user_id=user_id)
        raise HTTPException(status_code=500, detail=f"获取用户详情失败: {str(e)}")


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
async def create_user(
    user_data: UserCreate,
    current_user: dict = Depends(require_permission("settings:users:create"))
):
    """
    创建新用户

    权限要求: settings:users:create

    功能特性：
    - 自动验证用户名和邮箱唯一性
    - 密码强度验证
    - 发送欢迎邮件
    - 记录操作审计日志
    """
    try:
        new_user = await user_settings_service.create_user(
            user_data=user_data,
            creator_id=current_user["id"]
        )

        logger.info(
            "User created successfully",
            new_user_id=new_user.id,
            username=new_user.username,
            creator_id=current_user["id"]
        )

        return new_user

    except Exception as e:
        logger.error("Failed to create user", error=str(e), user_id=current_user["id"])
        raise HTTPException(status_code=500, detail=f"创建用户失败: {str(e)}")


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: str,
    user_data: UserUpdate,
    current_user: dict = Depends(require_permission("settings:users:update"))
):
    """
    更新用户信息

    权限要求：
    - 用户可以更新自己的基本信息（不包括角色和状态）
    - 管理员可以更新所有用户的所有信息

    权限要求: settings:users:update
    """
    try:
        updated_user = await user_settings_service.update_user(
            user_id=user_id,
            user_data=user_data,
            updater_id=current_user["id"]
        )

        if not updated_user:
            raise HTTPException(status_code=404, detail="用户不存在")

        logger.info(
            "User updated successfully",
            target_user_id=user_id,
            updater_id=current_user["id"]
        )

        return updated_user

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to update user", error=str(e), user_id=user_id)
        raise HTTPException(status_code=500, detail=f"更新用户失败: {str(e)}")


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_user(
    user_id: str,
    current_user: dict = Depends(require_permission("settings:users:delete"))
):
    """
    删除用户（软删除）

    权限要求: settings:users:delete

    注意事项：
    - 不能删除自己的账户
    - 删除操作是软删除，数据仍保留在数据库中
    """
    try:
        # 防止删除自己
        if user_id == current_user["id"]:
            raise HTTPException(status_code=400, detail="不能删除自己的账户")

        success = await user_settings_service.delete_user(
            user_id=user_id,
            deleter_id=current_user["id"]
        )

        if not success:
            raise HTTPException(status_code=404, detail="用户不存在")

        logger.info(
            "User deleted successfully",
            target_user_id=user_id,
            deleter_id=current_user["id"]
        )

        return None

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to delete user", error=str(e), user_id=user_id)
        raise HTTPException(status_code=500, detail=f"删除用户失败: {str(e)}")
