"""
User Settings Service
用户管理扩展服务层
"""
from typing import List, Tuple, Dict, Any, Optional
from datetime import datetime, timedelta
import structlog
import uuid
import hashlib

from src.schemas.settings.users import (
    BatchOperationType,
    BatchOperationResult,
    UserStats,
    UserQueryParams,
    UserListResponse,
    UserResponse,
    UserCreate,
    UserUpdate,
    UserRole,
    UserStatus
)

logger = structlog.get_logger()


class UserSettingsService:
    """用户管理扩展服务"""

    def __init__(self):
        # 模拟用户数据存储（实际应该从数据库获取）
        self._mock_users = self._generate_mock_users()

    def _generate_mock_users(self) -> List[Dict[str, Any]]:
        """生成模拟用户数据"""
        now = datetime.now()
        users = []

        # 生成100个模拟用户
        for i in range(1, 101):
            users.append({
                "id": f"550e8400-e29b-41d4-a716-{446655440000 + i:012d}",
                "username": f"user{i}" if i > 1 else "admin",
                "email": f"user{i}@example.com" if i > 1 else "admin@example.com",
                "full_name": f"User {i}" if i > 1 else "Administrator",
                "role": UserRole.ADMIN if i == 1 else (UserRole.OPERATOR if i <= 30 else UserRole.VIEWER),
                "status": UserStatus.LOCKED if i > 95 else (UserStatus.INACTIVE if i > 85 else UserStatus.ACTIVE),
                "avatar": None,
                "permissions": ["*"] if i == 1 else [],
                "last_login_at": (now - timedelta(minutes=i)).isoformat() if i <= 85 else None,
                "last_login_ip": f"192.168.1.{i % 255}" if i <= 85 else None,
                "created_at": (now - timedelta(days=100 - i)).isoformat(),
                "updated_at": (now - timedelta(days=(100 - i) // 2)).isoformat(),
                "created_by": "system"
            })

        return users

    async def get_users_paginated(
        self,
        params: UserQueryParams
    ) -> UserListResponse:
        """
        获取分页用户列表

        Args:
            params: 查询参数

        Returns:
            分页用户列表
        """
        try:
            # TODO: 从数据库查询实际数据
            # 这里使用模拟数据

            # 过滤
            filtered_users = self._mock_users.copy()

            # 搜索过滤
            if params.search:
                search_lower = params.search.lower()
                filtered_users = [
                    u for u in filtered_users
                    if search_lower in u["username"].lower()
                    or search_lower in u["email"].lower()
                    or (u["full_name"] and search_lower in u["full_name"].lower())
                ]

            # 角色过滤
            if params.role:
                filtered_users = [u for u in filtered_users if u["role"] == params.role]

            # 状态过滤
            if params.status:
                filtered_users = [u for u in filtered_users if u["status"] == params.status]

            # 排序
            reverse = params.sort_order == "desc"
            if params.sort_by == "username":
                filtered_users.sort(key=lambda u: u["username"], reverse=reverse)
            elif params.sort_by == "email":
                filtered_users.sort(key=lambda u: u["email"], reverse=reverse)
            elif params.sort_by == "role":
                filtered_users.sort(key=lambda u: u["role"], reverse=reverse)
            elif params.sort_by == "created_at":
                filtered_users.sort(key=lambda u: u["created_at"], reverse=reverse)
            elif params.sort_by == "last_login":
                filtered_users.sort(key=lambda u: u["last_login_at"] or "", reverse=reverse)

            # 分页
            total = len(filtered_users)
            start = (params.page - 1) * params.page_size
            end = start + params.page_size
            page_users = filtered_users[start:end]

            # 构造响应
            has_next = end < total
            has_prev = params.page > 1

            logger.info(
                "Users retrieved",
                total=total,
                page=params.page,
                page_size=params.page_size,
                returned=len(page_users)
            )

            return UserListResponse(
                items=[UserResponse(**u) for u in page_users],
                total=total,
                page=params.page,
                page_size=params.page_size,
                has_next=has_next,
                has_prev=has_prev
            )

        except Exception as e:
            logger.error("Failed to get users paginated", error=str(e))
            raise

    async def get_user_by_id(self, user_id: str) -> Optional[UserResponse]:
        """
        根据ID获取用户

        Args:
            user_id: 用户ID

        Returns:
            用户信息，如果不存在返回None
        """
        try:
            # TODO: 从数据库查询实际数据
            user_data = next((u for u in self._mock_users if u["id"] == user_id), None)

            if not user_data:
                logger.warning("User not found", user_id=user_id)
                return None

            logger.info("User retrieved", user_id=user_id, username=user_data["username"])
            return UserResponse(**user_data)

        except Exception as e:
            logger.error("Failed to get user by id", error=str(e), user_id=user_id)
            raise

    async def create_user(
        self,
        user_data: UserCreate,
        creator_id: str
    ) -> UserResponse:
        """
        创建用户

        Args:
            user_data: 用户创建数据
            creator_id: 创建者ID

        Returns:
            创建的用户信息
        """
        try:
            # TODO: 实际应该：
            # 1. 验证用户名和邮箱唯一性
            # 2. 加密密码
            # 3. 保存到数据库
            # 4. 发送欢迎邮件

            now = datetime.now()
            new_user = {
                "id": str(uuid.uuid4()),
                "username": user_data.username,
                "email": user_data.email,
                "full_name": user_data.full_name,
                "role": user_data.role,
                "status": user_data.status,
                "avatar": None,
                "permissions": [],
                "last_login_at": None,
                "last_login_ip": None,
                "created_at": now.isoformat(),
                "updated_at": now.isoformat(),
                "created_by": creator_id
            }

            # 添加到模拟数据中
            self._mock_users.append(new_user)

            logger.info(
                "User created",
                user_id=new_user["id"],
                username=new_user["username"],
                creator_id=creator_id
            )

            return UserResponse(**new_user)

        except Exception as e:
            logger.error("Failed to create user", error=str(e))
            raise

    async def update_user(
        self,
        user_id: str,
        user_data: UserUpdate,
        updater_id: str
    ) -> Optional[UserResponse]:
        """
        更新用户信息

        Args:
            user_id: 用户ID
            user_data: 更新数据
            updater_id: 更新者ID

        Returns:
            更新后的用户信息，如果用户不存在返回None
        """
        try:
            # TODO: 从数据库更新实际数据
            user_dict = next((u for u in self._mock_users if u["id"] == user_id), None)

            if not user_dict:
                logger.warning("User not found for update", user_id=user_id)
                return None

            # 更新字段
            if user_data.username is not None:
                user_dict["username"] = user_data.username
            if user_data.email is not None:
                user_dict["email"] = user_data.email
            if user_data.full_name is not None:
                user_dict["full_name"] = user_data.full_name
            if user_data.role is not None:
                user_dict["role"] = user_data.role
            if user_data.status is not None:
                user_dict["status"] = user_data.status

            user_dict["updated_at"] = datetime.now().isoformat()

            logger.info(
                "User updated",
                user_id=user_id,
                username=user_dict["username"],
                updater_id=updater_id
            )

            return UserResponse(**user_dict)

        except Exception as e:
            logger.error("Failed to update user", error=str(e), user_id=user_id)
            raise

    async def delete_user(
        self,
        user_id: str,
        deleter_id: str
    ) -> bool:
        """
        删除用户（软删除）

        Args:
            user_id: 用户ID
            deleter_id: 删除者ID

        Returns:
            是否删除成功
        """
        try:
            # TODO: 实际应该实现软删除，设置deleted_at字段
            user_dict = next((u for u in self._mock_users if u["id"] == user_id), None)

            if not user_dict:
                logger.warning("User not found for deletion", user_id=user_id)
                return False

            # 从模拟数据中移除
            self._mock_users.remove(user_dict)

            logger.info(
                "User deleted",
                user_id=user_id,
                username=user_dict["username"],
                deleter_id=deleter_id
            )

            return True

        except Exception as e:
            logger.error("Failed to delete user", error=str(e), user_id=user_id)
            raise

    async def batch_operate_users(
        self,
        user_ids: List[int],
        operation: BatchOperationType,
        params: Dict[str, Any],
        operator_id: int
    ) -> Tuple[int, int, List[BatchOperationResult]]:
        """
        批量操作用户

        Args:
            user_ids: 用户ID列表
            operation: 操作类型
            params: 操作参数
            operator_id: 操作者ID

        Returns:
            (成功数量, 失败数量, 详细结果列表)
        """
        try:
            results = []
            success_count = 0
            failed_count = 0

            for user_id in user_ids:
                try:
                    # TODO: 实现实际的批量操作逻辑
                    # 这里返回模拟结果
                    success = await self._execute_operation(user_id, operation, params)

                    if success:
                        success_count += 1
                        results.append(BatchOperationResult(
                            user_id=user_id,
                            success=True,
                            message=f"操作成功: {operation.value}"
                        ))
                    else:
                        failed_count += 1
                        results.append(BatchOperationResult(
                            user_id=user_id,
                            success=False,
                            message="操作失败"
                        ))

                except Exception as e:
                    failed_count += 1
                    results.append(BatchOperationResult(
                        user_id=user_id,
                        success=False,
                        message=str(e)
                    ))

            logger.info(
                "Batch user operation completed",
                operation=operation.value,
                total=len(user_ids),
                success=success_count,
                failed=failed_count,
                operator_id=operator_id
            )

            return success_count, failed_count, results

        except Exception as e:
            logger.error("Failed to batch operate users", error=str(e))
            raise

    async def _execute_operation(
        self,
        user_id: int,
        operation: BatchOperationType,
        params: Dict[str, Any]
    ) -> bool:
        """执行单个用户操作"""
        # TODO: 实现实际的操作逻辑
        # 这里返回模拟结果
        if operation == BatchOperationType.ACTIVATE:
            return True
        elif operation == BatchOperationType.DEACTIVATE:
            return True
        elif operation == BatchOperationType.DELETE:
            # 删除操作可能失败
            return user_id != 1  # 模拟：用户ID=1不能删除
        elif operation == BatchOperationType.RESET_PASSWORD:
            return True
        elif operation == BatchOperationType.UNLOCK:
            return True
        elif operation == BatchOperationType.ASSIGN_ROLE:
            return "role" in params
        return False

    async def get_user_statistics(self) -> UserStats:
        """
        获取用户统计数据

        Returns:
            用户统计信息
        """
        try:
            # TODO: 从数据库获取实际统计数据
            # 这里返回模拟数据
            now = datetime.now()
            today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            week_start = today_start - timedelta(days=today_start.weekday())
            month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

            # 模拟统计数据
            stats = UserStats(
                total_users=100,
                active_users=85,
                inactive_users=10,
                locked_users=5,
                online_users=15,
                users_by_role={
                    "admin": 5,
                    "operator": 30,
                    "viewer": 65
                },
                new_users_today=2,
                new_users_this_week=8,
                new_users_this_month=25,
                login_count_today=45,
                login_count_this_week=320,
                recent_active_users=[
                    {
                        "user_id": 1,
                        "username": "admin",
                        "last_activity": (now - timedelta(minutes=5)).isoformat()
                    },
                    {
                        "user_id": 2,
                        "username": "operator1",
                        "last_activity": (now - timedelta(minutes=10)).isoformat()
                    },
                    {
                        "user_id": 3,
                        "username": "viewer1",
                        "last_activity": (now - timedelta(minutes=15)).isoformat()
                    }
                ]
            )

            logger.info("Retrieved user statistics", total_users=stats.total_users)
            return stats

        except Exception as e:
            logger.error("Failed to get user statistics", error=str(e))
            raise


# 全局实例
user_settings_service = UserSettingsService()
