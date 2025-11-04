from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, and_
from pydantic import BaseModel, Field
from datetime import datetime
import structlog
import uuid

from src.core.database import get_db_session
from src.core.auth import get_current_user
from src.core.permissions import require_permission
from src.models.user import Role, Permission, role_permissions
from src.models.user import User

logger = structlog.get_logger()
router = APIRouter(tags=["角色管理"])

# ========== Pydantic 模型定义 ==========

class PermissionResponse(BaseModel):
    """权限响应模型"""
    id: str
    name: str
    display_name: str
    description: Optional[str] = None
    category: str
    created_at: datetime

    class Config:
        from_attributes = True


class RoleBase(BaseModel):
    """角色基础模型"""
    name: str = Field(..., min_length=2, max_length=50, description="角色名称（唯一标识）")
    display_name: str = Field(..., min_length=2, max_length=100, description="显示名称")
    description: Optional[str] = Field(None, max_length=500, description="角色描述")
    is_active: bool = Field(True, description="是否激活")


class RoleCreate(RoleBase):
    """创建角色请求模型"""
    permission_ids: List[str] = Field(default_factory=list, description="权限ID列表")


class RoleUpdate(BaseModel):
    """更新角色请求模型"""
    display_name: Optional[str] = Field(None, min_length=2, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    is_active: Optional[bool] = None


class RoleResponse(BaseModel):
    """角色响应模型"""
    id: str
    name: str
    display_name: str
    description: Optional[str] = None
    is_active: bool
    is_system: bool
    user_count: int = Field(0, description="关联用户数")
    permissions: List[PermissionResponse] = []
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class AssignPermissionsRequest(BaseModel):
    """分配权限请求模型"""
    permission_ids: List[str] = Field(..., description="权限ID列表")


# ========== 辅助函数 ==========

async def get_role_with_details(session: AsyncSession, role_id: str) -> Optional[Role]:
    """获取角色及其关联数据"""
    from sqlalchemy.orm import selectinload

    stmt = select(Role).where(Role.id == role_id).options(
        selectinload(Role.permissions),
        selectinload(Role.users)
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def check_role_name_exists(session: AsyncSession, name: str, exclude_id: Optional[str] = None) -> bool:
    """检查角色名称是否存在"""
    stmt = select(func.count()).select_from(Role).where(Role.name == name)
    if exclude_id:
        stmt = stmt.where(Role.id != exclude_id)
    result = await session.execute(stmt)
    count = result.scalar()
    return count > 0


# ========== API 路由 ==========

@router.get("/", response_model=List[RoleResponse], summary="获取角色列表")
async def get_roles(
    is_active: Optional[bool] = Query(None, description="按激活状态筛选"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    获取所有角色列表

    权限要求: roles:read
    """
    try:
        from sqlalchemy.orm import selectinload

        # 构建查询
        stmt = select(Role).options(
            selectinload(Role.permissions),
            selectinload(Role.users)
        )

        if is_active is not None:
            stmt = stmt.where(Role.is_active == is_active)

        stmt = stmt.order_by(Role.created_at.desc())

        result = await session.execute(stmt)
        roles = result.scalars().all()

        # 构建响应
        role_responses = []
        for role in roles:
            role_response = RoleResponse(
                id=role.id,
                name=role.name,
                display_name=role.display_name,
                description=role.description,
                is_active=role.is_active,
                is_system=role.is_system,
                user_count=len(role.users),
                permissions=[
                    PermissionResponse(
                        id=perm.id,
                        name=perm.name,
                        display_name=perm.display_name,
                        description=perm.description,
                        category=perm.category,
                        created_at=perm.created_at
                    ) for perm in role.permissions
                ],
                created_at=role.created_at,
                updated_at=role.updated_at
            )
            role_responses.append(role_response)

        logger.info("Retrieved roles list", count=len(role_responses), user_id=current_user.id)
        return role_responses

    except Exception as e:
        logger.error("Failed to get roles", error=str(e), user_id=current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取角色列表失败"
        )


@router.get("/{role_id}", response_model=RoleResponse, summary="获取角色详情")
async def get_role(
    role_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    获取指定角色的详细信息

    权限要求: roles:read
    """
    try:
        role = await get_role_with_details(session, role_id)

        if not role:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"角色不存在: {role_id}"
            )

        role_response = RoleResponse(
            id=role.id,
            name=role.name,
            display_name=role.display_name,
            description=role.description,
            is_active=role.is_active,
            is_system=role.is_system,
            user_count=len(role.users),
            permissions=[
                PermissionResponse(
                    id=perm.id,
                    name=perm.name,
                    display_name=perm.display_name,
                    description=perm.description,
                    category=perm.category,
                    created_at=perm.created_at
                ) for perm in role.permissions
            ],
            created_at=role.created_at,
            updated_at=role.updated_at
        )

        logger.info("Retrieved role details", role_id=role_id, user_id=current_user.id)
        return role_response

    except HTTPException:
        raise
    except Exception as e:
        logger.error("Failed to get role", role_id=role_id, error=str(e), user_id=current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取角色详情失败"
        )


@router.post("/", response_model=RoleResponse, status_code=status.HTTP_201_CREATED, summary="创建角色")
async def create_role(
    role_data: RoleCreate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    创建新角色

    权限要求: roles:create
    """
    try:
        # 检查角色名称是否已存在
        if await check_role_name_exists(session, role_data.name):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"角色名称已存在: {role_data.name}"
            )

        # 创建角色
        new_role = Role(
            id=str(uuid.uuid4()),
            name=role_data.name,
            display_name=role_data.display_name,
            description=role_data.description,
            is_active=role_data.is_active,
            is_system=False
        )

        # 分配权限
        if role_data.permission_ids:
            stmt = select(Permission).where(Permission.id.in_(role_data.permission_ids))
            result = await session.execute(stmt)
            permissions = result.scalars().all()
            new_role.permissions = list(permissions)

        session.add(new_role)
        await session.commit()
        await session.refresh(new_role)

        # 重新获取完整数据
        role = await get_role_with_details(session, new_role.id)

        role_response = RoleResponse(
            id=role.id,
            name=role.name,
            display_name=role.display_name,
            description=role.description,
            is_active=role.is_active,
            is_system=role.is_system,
            user_count=0,
            permissions=[
                PermissionResponse(
                    id=perm.id,
                    name=perm.name,
                    display_name=perm.display_name,
                    description=perm.description,
                    category=perm.category,
                    created_at=perm.created_at
                ) for perm in role.permissions
            ],
            created_at=role.created_at,
            updated_at=role.updated_at
        )

        logger.info("Role created", role_id=role.id, name=role.name, created_by=current_user.id)
        return role_response

    except HTTPException:
        raise
    except Exception as e:
        await session.rollback()
        logger.error("Failed to create role", error=str(e), user_id=current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="创建角色失败"
        )


@router.put("/{role_id}", response_model=RoleResponse, summary="更新角色")
async def update_role(
    role_id: str,
    role_data: RoleUpdate,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    更新角色信息

    权限要求: roles:update

    注意: 系统角色只能更新描述，不能修改激活状态
    """
    try:
        role = await get_role_with_details(session, role_id)

        if not role:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"角色不存在: {role_id}"
            )

        # 系统角色限制
        if role.is_system and role_data.is_active is False:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="系统角色不能停用"
            )

        # 更新字段
        if role_data.display_name is not None:
            role.display_name = role_data.display_name
        if role_data.description is not None:
            role.description = role_data.description
        if role_data.is_active is not None and not role.is_system:
            role.is_active = role_data.is_active

        role.updated_at = datetime.utcnow()

        await session.commit()
        await session.refresh(role)

        # 重新获取完整数据
        role = await get_role_with_details(session, role_id)

        role_response = RoleResponse(
            id=role.id,
            name=role.name,
            display_name=role.display_name,
            description=role.description,
            is_active=role.is_active,
            is_system=role.is_system,
            user_count=len(role.users),
            permissions=[
                PermissionResponse(
                    id=perm.id,
                    name=perm.name,
                    display_name=perm.display_name,
                    description=perm.description,
                    category=perm.category,
                    created_at=perm.created_at
                ) for perm in role.permissions
            ],
            created_at=role.created_at,
            updated_at=role.updated_at
        )

        logger.info("Role updated", role_id=role_id, updated_by=current_user.id)
        return role_response

    except HTTPException:
        raise
    except Exception as e:
        await session.rollback()
        logger.error("Failed to update role", role_id=role_id, error=str(e), user_id=current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="更新角色失败"
        )


@router.delete("/{role_id}", status_code=status.HTTP_204_NO_CONTENT, summary="删除角色")
async def delete_role(
    role_id: str,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    删除角色

    权限要求: roles:delete

    注意:
    - 系统角色不能删除
    - 有关联用户的角色不能删除
    """
    try:
        role = await get_role_with_details(session, role_id)

        if not role:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"角色不存在: {role_id}"
            )

        # 系统角色不能删除
        if role.is_system:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="系统角色不能删除"
            )

        # 有关联用户的角色不能删除
        if len(role.users) > 0:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"该角色有 {len(role.users)} 个关联用户，不能删除"
            )

        await session.delete(role)
        await session.commit()

        logger.info("Role deleted", role_id=role_id, deleted_by=current_user.id)

    except HTTPException:
        raise
    except Exception as e:
        await session.rollback()
        logger.error("Failed to delete role", role_id=role_id, error=str(e), user_id=current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="删除角色失败"
        )


@router.get("/../permissions", response_model=List[PermissionResponse], summary="获取所有权限")
async def get_all_permissions(
    category: Optional[str] = Query(None, description="按分类筛选"),
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    获取所有可用权限

    注意: 此端点实际路径为 /api/v1/settings/permissions

    权限要求: roles:read
    """
    try:
        stmt = select(Permission)

        if category:
            stmt = stmt.where(Permission.category == category)

        stmt = stmt.order_by(Permission.category, Permission.name)

        result = await session.execute(stmt)
        permissions = result.scalars().all()

        permission_responses = [
            PermissionResponse(
                id=perm.id,
                name=perm.name,
                display_name=perm.display_name,
                description=perm.description,
                category=perm.category,
                created_at=perm.created_at
            ) for perm in permissions
        ]

        logger.info("Retrieved permissions list", count=len(permission_responses), user_id=current_user.id)
        return permission_responses

    except Exception as e:
        logger.error("Failed to get permissions", error=str(e), user_id=current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="获取权限列表失败"
        )


@router.put("/{role_id}/permissions", response_model=RoleResponse, summary="分配权限给角色")
async def assign_permissions_to_role(
    role_id: str,
    request: AssignPermissionsRequest,
    current_user: User = Depends(get_current_user),
    session: AsyncSession = Depends(get_db_session)
):
    """
    为角色分配权限

    权限要求: roles:update

    注意: 会完全替换现有权限
    """
    try:
        role = await get_role_with_details(session, role_id)

        if not role:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"角色不存在: {role_id}"
            )

        # 获取权限
        stmt = select(Permission).where(Permission.id.in_(request.permission_ids))
        result = await session.execute(stmt)
        permissions = result.scalars().all()

        # 检查权限ID是否都有效
        found_ids = {perm.id for perm in permissions}
        missing_ids = set(request.permission_ids) - found_ids
        if missing_ids:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"部分权限不存在: {', '.join(missing_ids)}"
            )

        # 更新权限
        role.permissions = list(permissions)
        role.updated_at = datetime.utcnow()

        await session.commit()
        await session.refresh(role)

        # 重新获取完整数据
        role = await get_role_with_details(session, role_id)

        role_response = RoleResponse(
            id=role.id,
            name=role.name,
            display_name=role.display_name,
            description=role.description,
            is_active=role.is_active,
            is_system=role.is_system,
            user_count=len(role.users),
            permissions=[
                PermissionResponse(
                    id=perm.id,
                    name=perm.name,
                    display_name=perm.display_name,
                    description=perm.description,
                    category=perm.category,
                    created_at=perm.created_at
                ) for perm in role.permissions
            ],
            created_at=role.created_at,
            updated_at=role.updated_at
        )

        logger.info(
            "Permissions assigned to role",
            role_id=role_id,
            permission_count=len(permissions),
            assigned_by=current_user.id
        )
        return role_response

    except HTTPException:
        raise
    except Exception as e:
        await session.rollback()
        logger.error("Failed to assign permissions", role_id=role_id, error=str(e), user_id=current_user.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="分配权限失败"
        )
