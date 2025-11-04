from typing import List, Optional, Dict, Any, Tuple
from datetime import datetime, timedelta
import logging
import asyncio
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.exc import IntegrityError

from ..schemas.user import (
    UserCreate, UserUpdate, UserResponse, UserListResponse,
    UserQueryParams, UserPasswordReset, UserStatusUpdate,
    UserBulkOperation, UserBulkImport, UserBulkImportResult,
    UserRole, UserStatus, Permission, Role
)
from ..repositories.user_repository import UserRepository
from ..core.permissions import PermissionChecker
from ..core.exceptions import (
    BusinessException, ValidationException, 
    NotFoundException, ConflictException
)
from ..services.auth import AuthService
from ..utils.email import EmailService
from ..utils.security import generate_random_password, verify_password_strength


logger = logging.getLogger(__name__)


class UserService:
    """用户业务逻辑服务"""
    
    def __init__(
        self, 
        user_repo: UserRepository,
        auth_service: AuthService,
        email_service: EmailService,
        permission_checker: PermissionChecker
    ):
        self.user_repo = user_repo
        self.auth_service = auth_service
        self.email_service = email_service
        self.permission_checker = permission_checker
    
    async def get_user_by_id(self, user_id: str, current_user_id: str) -> UserResponse:
        """获取用户详情"""
        # 权限检查：用户只能查看自己的详情，管理员可以查看所有用户
        if user_id != current_user_id:
            await self._check_permission(current_user_id, "users:read")
        
        user = await self.user_repo.get_user_by_id(user_id)
        if not user:
            raise NotFoundException(f"用户不存在: {user_id}")
        
        # 获取用户权限
        permissions = await self._get_user_permissions(user)
        
        return UserResponse(
            id=user.id,
            username=user.username,
            email=user.email,
            full_name=user.full_name,
            status=UserStatus.ACTIVE if user.is_active else UserStatus.INACTIVE,
            role=user.role,
            permissions=permissions,
            last_login_at=user.last_login_at,
            created_at=user.created_at,
            updated_at=user.updated_at,
            created_by="system"  # TODO: 从实际的创建者字段获取
        )
    
    async def get_users_paginated(
        self, 
        params: UserQueryParams, 
        current_user_id: str
    ) -> UserListResponse:
        """分页获取用户列表"""
        await self._check_permission(current_user_id, "users:read")
        
        users, total = await self.user_repo.get_users_paginated(params)
        
        # 转换为响应模型
        user_responses = []
        for user in users:
            permissions = await self._get_user_permissions(user)
            user_responses.append(UserResponse(
                id=user.id,
                username=user.username,
                email=user.email,
                full_name=user.full_name,
                status=UserStatus.ACTIVE if user.is_active else UserStatus.INACTIVE,
                role=user.role,
                permissions=permissions,
                last_login_at=user.last_login_at,
                created_at=user.created_at,
                updated_at=user.updated_at,
                created_by="system"
            ))
        
        return UserListResponse(
            items=user_responses,
            total=total,
            page=params.page,
            page_size=params.page_size,
            has_next=(params.page * params.page_size) < total,
            has_prev=params.page > 1
        )
    
    async def create_user(self, user_data: UserCreate, current_user_id: str) -> UserResponse:
        """创建用户"""
        await self._check_permission(current_user_id, "users:create")
        
        # 验证用户名和邮箱是否已存在
        if await self.user_repo.check_username_exists(user_data.username):
            raise ConflictException(f"用户名已存在: {user_data.username}")
        
        if await self.user_repo.check_email_exists(user_data.email):
            raise ConflictException(f"邮箱已存在: {user_data.email}")
        
        # 验证密码强度
        self._validate_password_strength(user_data.password)
        
        try:
            # 创建用户
            user = await self.user_repo.create_user(user_data, current_user_id)
            
            # 发送欢迎邮件
            try:
                await self.email_service.send_welcome_email(
                    user.email, 
                    user.full_name or user.username,
                    user_data.password  # 注意：生产环境不应该通过邮件发送密码
                )
            except Exception as e:
                logger.warning(f"发送欢迎邮件失败 {user.email}: {e}")
            
            # 记录审计日志
            await self._log_user_operation(
                current_user_id, 
                "create_user", 
                user.id, 
                {"username": user.username, "role": user.role}
            )
            
            permissions = await self._get_user_permissions(user)
            
            return UserResponse(
                id=user.id,
                username=user.username,
                email=user.email,
                full_name=user.full_name,
                status=UserStatus.ACTIVE if user.is_active else UserStatus.INACTIVE,
                role=user.role,
                permissions=permissions,
                last_login_at=user.last_login_at,
                created_at=user.created_at,
                updated_at=user.updated_at,
                created_by=current_user_id
            )
            
        except IntegrityError as e:
            logger.error(f"创建用户数据库错误: {e}")
            raise ConflictException("创建用户失败，可能存在重复数据")
    
    async def update_user(
        self, 
        user_id: str, 
        user_data: UserUpdate, 
        current_user_id: str
    ) -> UserResponse:
        """更新用户信息"""
        # 权限检查：用户只能更新自己的基本信息，管理员可以更新所有信息
        if user_id != current_user_id:
            await self._check_permission(current_user_id, "users:update")
        elif user_data.role is not None or user_data.status is not None:
            # 用户不能修改自己的角色和状态
            await self._check_permission(current_user_id, "users:update")
        
        # 检查用户是否存在
        existing_user = await self.user_repo.get_user_by_id(user_id)
        if not existing_user:
            raise NotFoundException(f"用户不存在: {user_id}")
        
        # 验证用户名和邮箱唯一性
        if user_data.username and await self.user_repo.check_username_exists(
            user_data.username, user_id
        ):
            raise ConflictException(f"用户名已存在: {user_data.username}")
        
        if user_data.email and await self.user_repo.check_email_exists(
            user_data.email, user_id
        ):
            raise ConflictException(f"邮箱已存在: {user_data.email}")
        
        try:
            # 更新用户
            user = await self.user_repo.update_user(user_id, user_data)
            
            # 记录审计日志
            await self._log_user_operation(
                current_user_id,
                "update_user",
                user_id,
                user_data.dict(exclude_unset=True)
            )
            
            permissions = await self._get_user_permissions(user)
            
            return UserResponse(
                id=user.id,
                username=user.username,
                email=user.email,
                full_name=user.full_name,
                status=UserStatus.ACTIVE if user.is_active else UserStatus.INACTIVE,
                role=user.role,
                permissions=permissions,
                last_login_at=user.last_login_at,
                created_at=user.created_at,
                updated_at=user.updated_at,
                created_by="system"
            )
            
        except IntegrityError as e:
            logger.error(f"更新用户数据库错误: {e}")
            raise ConflictException("更新用户失败，可能存在重复数据")
    
    async def reset_user_password(
        self,
        user_id: str,
        password_data: UserPasswordReset,
        current_user_id: str
    ) -> bool:
        """重置用户密码"""
        # 权限检查：用户可以修改自己密码，管理员可以重置任何用户密码
        if user_id != current_user_id:
            await self._check_permission(current_user_id, "users:update")
        
        # 检查用户是否存在
        user = await self.user_repo.get_user_by_id(user_id)
        if not user:
            raise NotFoundException(f"用户不存在: {user_id}")
        
        # 验证密码强度
        self._validate_password_strength(password_data.new_password)
        
        # 更新密码
        success = await self.user_repo.update_user_password(
            user_id, 
            password_data.new_password
        )
        
        if success:
            # 发送密码重置通知邮件
            try:
                await self.email_service.send_password_reset_notification(
                    user.email,
                    user.full_name or user.username
                )
            except Exception as e:
                logger.warning(f"发送密码重置通知邮件失败 {user.email}: {e}")
            
            # 记录审计日志
            await self._log_user_operation(
                current_user_id,
                "reset_password",
                user_id,
                {"force_change_on_login": password_data.force_change_on_login}
            )
        
        return success
    
    async def update_user_status(
        self,
        user_id: str,
        status_data: UserStatusUpdate,
        current_user_id: str
    ) -> UserResponse:
        """更新用户状态"""
        await self._check_permission(current_user_id, "users:update")
        
        # 不能修改自己的状态
        if user_id == current_user_id:
            raise ValidationException("不能修改自己的账户状态")
        
        user = await self.user_repo.update_user_status(user_id, status_data.status)
        if not user:
            raise NotFoundException(f"用户不存在: {user_id}")
        
        # 记录审计日志
        await self._log_user_operation(
            current_user_id,
            "update_status",
            user_id,
            {"status": status_data.status, "reason": status_data.reason}
        )
        
        permissions = await self._get_user_permissions(user)
        
        return UserResponse(
            id=user.id,
            username=user.username,
            email=user.email,
            full_name=user.full_name,
            status=status_data.status,
            role=user.role,
            permissions=permissions,
            last_login_at=user.last_login_at,
            created_at=user.created_at,
            updated_at=user.updated_at,
            created_by="system"
        )
    
    async def delete_user(self, user_id: str, current_user_id: str) -> bool:
        """删除用户"""
        await self._check_permission(current_user_id, "users:delete")
        
        # 不能删除自己
        if user_id == current_user_id:
            raise ValidationException("不能删除自己的账户")
        
        # 检查用户是否存在
        user = await self.user_repo.get_user_by_id(user_id)
        if not user:
            raise NotFoundException(f"用户不存在: {user_id}")
        
        success = await self.user_repo.delete_user(user_id)
        
        if success:
            # 记录审计日志
            await self._log_user_operation(
                current_user_id,
                "delete_user",
                user_id,
                {"username": user.username}
            )
        
        return success
    
    async def bulk_operation(
        self,
        operation_data: UserBulkOperation,
        current_user_id: str
    ) -> Dict[str, Any]:
        """批量操作用户"""
        await self._check_permission(current_user_id, "users:update")
        
        # 检查是否包含当前用户
        if current_user_id in operation_data.user_ids:
            raise ValidationException("不能对自己执行批量操作")
        
        affected_count = 0
        errors = []
        
        try:
            if operation_data.operation in ["activate", "deactivate"]:
                status = UserStatus.ACTIVE if operation_data.operation == "activate" else UserStatus.INACTIVE
                affected_count = await self.user_repo.bulk_update_status(
                    operation_data.user_ids, 
                    status
                )
            elif operation_data.operation == "delete":
                affected_count = await self.user_repo.bulk_delete_users(
                    operation_data.user_ids
                )
            
            # 记录审计日志
            await self._log_user_operation(
                current_user_id,
                f"bulk_{operation_data.operation}",
                None,
                {
                    "user_ids": operation_data.user_ids,
                    "reason": operation_data.reason,
                    "affected_count": affected_count
                }
            )
            
        except Exception as e:
            logger.error(f"批量操作失败: {e}")
            errors.append(str(e))
        
        return {
            "success": len(errors) == 0,
            "affected_count": affected_count,
            "errors": errors
        }
    
    async def bulk_import_users(
        self,
        import_data: UserBulkImport,
        current_user_id: str
    ) -> UserBulkImportResult:
        """批量导入用户"""
        await self._check_permission(current_user_id, "users:create")
        
        total = len(import_data.users)
        success_count = 0
        errors = []
        created_users = []
        
        for i, user_data in enumerate(import_data.users):
            try:
                # 检查用户名和邮箱是否已存在
                if await self.user_repo.check_username_exists(user_data.username):
                    errors.append({
                        "row": i + 1,
                        "username": user_data.username,
                        "error": "用户名已存在"
                    })
                    continue
                
                if await self.user_repo.check_email_exists(user_data.email):
                    errors.append({
                        "row": i + 1,
                        "email": user_data.email,
                        "error": "邮箱已存在"
                    })
                    continue
                
                # 生成密码
                password = user_data.password or generate_random_password()
                
                # 创建用户对象用于验证
                create_data = UserCreate(
                    username=user_data.username,
                    email=user_data.email,
                    full_name=user_data.full_name,
                    role=user_data.role,
                    password=password,
                    confirm_password=password
                )
                
                # 创建用户
                user = await self.user_repo.create_user(create_data, current_user_id)
                created_users.append(user)
                success_count += 1
                
                # 发送欢迎邮件
                if import_data.send_email:
                    try:
                        await self.email_service.send_welcome_email(
                            user.email,
                            user.full_name or user.username,
                            password
                        )
                    except Exception as e:
                        logger.warning(f"发送欢迎邮件失败 {user.email}: {e}")
                
            except Exception as e:
                logger.error(f"导入用户失败 {user_data.username}: {e}")
                errors.append({
                    "row": i + 1,
                    "username": user_data.username,
                    "error": str(e)
                })
        
        # 记录审计日志
        await self._log_user_operation(
            current_user_id,
            "bulk_import_users",
            None,
            {
                "total": total,
                "success": success_count,
                "failed": len(errors)
            }
        )
        
        # 转换用户对象为响应模型
        user_responses = []
        for user in created_users:
            permissions = await self._get_user_permissions(user)
            user_responses.append(UserResponse(
                id=user.id,
                username=user.username,
                email=user.email,
                full_name=user.full_name,
                status=UserStatus.ACTIVE if user.is_active else UserStatus.INACTIVE,
                role=user.role,
                permissions=permissions,
                last_login_at=user.last_login_at,
                created_at=user.created_at,
                updated_at=user.updated_at,
                created_by=current_user_id
            ))
        
        return UserBulkImportResult(
            total=total,
            success=success_count,
            failed=len(errors),
            errors=errors,
            created_users=user_responses
        )
    
    async def get_user_statistics(self, current_user_id: str) -> Dict[str, Any]:
        """获取用户统计信息"""
        await self._check_permission(current_user_id, "users:read")
        
        return await self.user_repo.get_user_statistics()
    
    # 私有方法
    
    async def _check_permission(self, user_id: str, permission: str) -> None:
        """检查权限"""
        if not await self.permission_checker.check_permission(user_id, permission):
            raise ValidationException(f"权限不足: {permission}")
    
    async def _get_user_permissions(self, user) -> List[str]:
        """获取用户权限列表"""
        # 根据用户角色获取权限
        role_permissions = {
            UserRole.ADMIN: [
                "users:read", "users:create", "users:update", "users:delete",
                "devices:read", "devices:create", "devices:update", "devices:delete",
                "inspections:read", "inspections:create", "inspections:update", "inspections:delete",
                "alerts:read", "alerts:acknowledge", "alerts:resolve", "alerts:delete",
                "reports:read", "reports:create", "reports:delete",
                "system:config"
            ],
            UserRole.OPERATOR: [
                "devices:read", "devices:create", "devices:update",
                "inspections:read", "inspections:create", "inspections:update",
                "alerts:read", "alerts:acknowledge", "alerts:resolve",
                "reports:read", "reports:create"
            ],
            UserRole.VIEWER: [
                "devices:read",
                "inspections:read",
                "alerts:read",
                "reports:read"
            ]
        }
        
        return role_permissions.get(user.role, [])
    
    def _validate_password_strength(self, password: str) -> None:
        """验证密码强度"""
        if not verify_password_strength(password):
            raise ValidationException("密码不符合强度要求")
    
    async def _log_user_operation(
        self,
        operator_id: str,
        operation: str,
        target_user_id: Optional[str],
        details: Dict[str, Any]
    ) -> None:
        """记录用户操作日志"""
        # TODO: 实现审计日志记录
        logger.info(
            f"用户操作日志 - 操作员: {operator_id}, 操作: {operation}, "
            f"目标用户: {target_user_id}, 详情: {details}"
        )