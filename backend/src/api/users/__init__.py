from typing import List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, status
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession

from src.schemas.user import (
    UserCreate, UserUpdate, UserResponse, UserListResponse,
    UserQueryParams, UserPasswordReset, UserStatusUpdate,
    UserBulkOperation, UserBulkImport, UserBulkImportResult
)
from src.services.user_service import UserService
from src.repositories.user_repository import UserRepository
from src.services.auth import AuthService
from src.utils.email import EmailService
from src.core.permissions import PermissionChecker
from src.core.database import get_db_session
from src.core.auth import get_current_user
from src.core.exceptions import (
    BusinessException, ValidationException, 
    NotFoundException, ConflictException
)
from src.models.user import User


# 创建路由器
router = APIRouter(tags=["用户管理"])


# 依赖注入
async def get_user_service(
    session: AsyncSession = Depends(get_db_session)
) -> UserService:
    """获取用户服务实例"""
    user_repo = UserRepository(session)
    auth_service = AuthService()  # 这里需要根据实际情况调整
    email_service = EmailService()  # 这里需要根据实际情况调整
    permission_checker = PermissionChecker()  # 这里需要根据实际情况调整
    
    return UserService(user_repo, auth_service, email_service, permission_checker)


@router.get("/", response_model=UserListResponse, summary="获取用户列表")
async def get_users(
    page: int = Query(1, ge=1, description="页码"),
    page_size: int = Query(20, ge=1, le=100, description="每页数量"),
    search: str = Query(None, max_length=100, description="搜索关键词"),
    role: str = Query(None, description="角色筛选"),
    status: str = Query(None, description="状态筛选"),
    sort_by: str = Query("created_at", description="排序字段"),
    sort_order: str = Query("desc", regex="^(asc|desc)$", description="排序方向"),
    current_user: User = Depends(get_current_user),
    user_service: UserService = Depends(get_user_service)
):
    """
    获取用户列表（分页）
    
    支持搜索和筛选：
    - search: 按用户名、邮箱、姓名搜索
    - role: 按角色筛选 (admin, operator, viewer)
    - status: 按状态筛选 (active, inactive, locked, pending)
    - sort_by: 排序字段 (username, email, role, created_at, last_login)
    - sort_order: 排序方向 (asc, desc)
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
        
        return await user_service.get_users_paginated(params, current_user.id)
        
    except ValidationException as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="获取用户列表失败")


@router.get("/{user_id}", response_model=UserResponse, summary="获取用户详情")
async def get_user(
    user_id: str,
    current_user: User = Depends(get_current_user),
    user_service: UserService = Depends(get_user_service)
):
    """
    获取指定用户的详细信息
    
    权限要求：
    - 用户可以查看自己的详情
    - 管理员可以查看所有用户详情
    """
    try:
        return await user_service.get_user_by_id(user_id, current_user.id)
        
    except NotFoundException as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except ValidationException as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="获取用户详情失败")


@router.post("/", response_model=UserResponse, status_code=status.HTTP_201_CREATED, summary="创建用户")
async def create_user(
    user_data: UserCreate,
    current_user: User = Depends(get_current_user),
    user_service: UserService = Depends(get_user_service)
):
    """
    创建新用户
    
    权限要求：users:create
    
    功能特性：
    - 自动验证用户名和邮箱唯一性
    - 密码强度验证
    - 发送欢迎邮件
    - 记录操作审计日志
    """
    try:
        return await user_service.create_user(user_data, current_user.id)
        
    except ConflictException as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    except ValidationException as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="创建用户失败")


@router.put("/{user_id}", response_model=UserResponse, summary="更新用户信息")
async def update_user(
    user_id: str,
    user_data: UserUpdate,
    current_user: User = Depends(get_current_user),
    user_service: UserService = Depends(get_user_service)
):
    """
    更新用户信息
    
    权限要求：
    - 用户可以更新自己的基本信息（不包括角色和状态）
    - 管理员可以更新所有用户的所有信息
    """
    try:
        return await user_service.update_user(user_id, user_data, current_user.id)
        
    except NotFoundException as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except ConflictException as e:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(e))
    except ValidationException as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="更新用户失败")


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT, summary="删除用户")
async def delete_user(
    user_id: str,
    current_user: User = Depends(get_current_user),
    user_service: UserService = Depends(get_user_service)
):
    """
    删除用户（软删除）
    
    权限要求：users:delete
    
    注意事项：
    - 不能删除自己的账户
    - 删除操作是软删除，数据仍保留在数据库中
    """
    try:
        success = await user_service.delete_user(user_id, current_user.id)
        if not success:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="用户不存在")
            
    except NotFoundException as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except ValidationException as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="删除用户失败")


@router.post("/{user_id}/reset-password", summary="重置用户密码")
async def reset_password(
    user_id: str,
    password_data: UserPasswordReset,
    current_user: User = Depends(get_current_user),
    user_service: UserService = Depends(get_user_service)
):
    """
    重置用户密码
    
    权限要求：
    - 用户可以修改自己的密码
    - 管理员可以重置任何用户的密码
    """
    try:
        success = await user_service.reset_user_password(user_id, password_data, current_user.id)
        
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={"message": "密码重置成功", "success": success}
        )
        
    except NotFoundException as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except ValidationException as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="重置密码失败")


@router.post("/{user_id}/status", response_model=UserResponse, summary="更新用户状态")
async def update_user_status(
    user_id: str,
    status_data: UserStatusUpdate,
    current_user: User = Depends(get_current_user),
    user_service: UserService = Depends(get_user_service)
):
    """
    更新用户状态
    
    权限要求：users:update
    
    支持的状态：
    - active: 激活
    - inactive: 停用
    - locked: 锁定
    - pending: 待激活
    """
    try:
        return await user_service.update_user_status(user_id, status_data, current_user.id)
        
    except NotFoundException as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except ValidationException as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="更新用户状态失败")


@router.post("/bulk-operation", summary="批量操作用户")
async def bulk_operation(
    operation_data: UserBulkOperation,
    current_user: User = Depends(get_current_user),
    user_service: UserService = Depends(get_user_service)
):
    """
    批量操作用户
    
    权限要求：users:update
    
    支持的操作：
    - activate: 批量激活
    - deactivate: 批量停用
    - lock: 批量锁定
    - unlock: 批量解锁
    - delete: 批量删除
    """
    try:
        result = await user_service.bulk_operation(operation_data, current_user.id)
        
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={
                "message": f"批量操作完成，影响 {result['affected_count']} 个用户",
                **result
            }
        )
        
    except ValidationException as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="批量操作失败")


@router.post("/import", response_model=UserBulkImportResult, summary="批量导入用户")
async def import_users(
    import_data: UserBulkImport,
    current_user: User = Depends(get_current_user),
    user_service: UserService = Depends(get_user_service)
):
    """
    批量导入用户
    
    权限要求：users:create
    
    功能特性：
    - 支持批量创建用户（最多1000个）
    - 自动生成随机密码（如果未提供）
    - 可选择发送欢迎邮件
    - 可设置首次登录强制修改密码
    - 返回详细的导入结果和错误信息
    """
    try:
        return await user_service.bulk_import_users(import_data, current_user.id)
        
    except ValidationException as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="批量导入失败")


@router.get("/{user_id}/permissions", response_model=List[str], summary="获取用户权限")
async def get_user_permissions(
    user_id: str,
    current_user: User = Depends(get_current_user),
    user_service: UserService = Depends(get_user_service)
):
    """
    获取用户的有效权限列表
    
    权限要求：
    - 用户可以查看自己的权限
    - 管理员可以查看所有用户的权限
    """
    try:
        # 权限检查
        if user_id != current_user.id:
            # 这里需要调用权限检查逻辑
            pass
        
        user = await user_service.get_user_by_id(user_id, current_user.id)
        return user.permissions
        
    except NotFoundException as e:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(e))
    except ValidationException as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="获取用户权限失败")


@router.get("/statistics/overview", summary="获取用户统计信息")
async def get_user_statistics(
    current_user: User = Depends(get_current_user),
    user_service: UserService = Depends(get_user_service)
):
    """
    获取用户统计信息
    
    权限要求：users:read
    
    返回信息：
    - 总用户数
    - 活跃用户数
    - 非活跃用户数
    - 按角色分布统计
    - 最近30天新增用户数
    """
    try:
        statistics = await user_service.get_user_statistics(current_user.id)
        
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={
                "message": "获取统计信息成功",
                "data": statistics
            }
        )
        
    except ValidationException as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="获取统计信息失败")


# 文件上传相关的端点
@router.post("/import/file", summary="通过文件批量导入用户")
async def import_users_from_file(
    file: UploadFile = File(..., description="用户数据文件 (CSV/Excel)"),
    send_email: bool = Query(True, description="是否发送欢迎邮件"),
    force_password_change: bool = Query(True, description="首次登录强制修改密码"),
    current_user: User = Depends(get_current_user),
    user_service: UserService = Depends(get_user_service)
):
    """
    通过上传文件批量导入用户
    
    权限要求：users:create
    
    支持文件格式：
    - CSV: 逗号分隔值文件
    - Excel: .xlsx 文件
    
    文件格式要求：
    - 第一行为标题行
    - 必需字段：username, email
    - 可选字段：full_name, role, password
    """
    try:
        # 验证文件类型
        if not file.filename.endswith(('.csv', '.xlsx', '.xls')):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="不支持的文件格式，请上传 CSV 或 Excel 文件"
            )
        
        # 读取文件内容
        content = await file.read()
        
        # TODO: 实现文件解析逻辑
        # 这里需要根据文件类型解析内容，转换为 UserBulkImport 对象
        
        # 示例响应
        return JSONResponse(
            status_code=status.HTTP_200_OK,
            content={
                "message": "文件上传成功，正在处理中...",
                "filename": file.filename,
                "size": len(content)
            }
        )
        
    except ValidationException as e:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="文件导入失败")