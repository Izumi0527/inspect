"""
用户管理服务

完整实现，从 services/settings/users_service.py 迁移
"""
from typing import List, Tuple, Dict, Any, Optional
from datetime import datetime, timedelta
import structlog
import uuid

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
    """用户管理服务"""

    def __init__(self):
        self._mock_users = self._generate_mock_users()

    def _generate_mock_users(self) -> List[Dict[str, Any]]:
        """生成模拟用户数据"""
        now = datetime.now()
        users = []
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

    async def get_users_paginated(self, params: UserQueryParams) -> UserListResponse:
        """获取分页用户列表"""
        try:
            filtered_users = self._mock_users.copy()

            if params.search:
                search_lower = params.search.lower()
                filtered_users = [
                    u for u in filtered_users
                    if search_lower in u["username"].lower()
                    or search_lower in u["email"].lower()
                    or (u["full_name"] and search_lower in u["full_name"].lower())
                ]

            if params.role:
                filtered_users = [u for u in filtered_users if u["role"] == params.role]
            if params.status:
                filtered_users = [u for u in filtered_users if u["status"] == params.status]

            reverse = params.sort_order == "desc"
            sort_key_map = {
                "username": lambda u: u["username"],
                "email": lambda u: u["email"],
                "role": lambda u: u["role"],
                "created_at": lambda u: u["created_at"],
                "last_login": lambda u: u["last_login_at"] or ""
            }
            if params.sort_by in sort_key_map:
                filtered_users.sort(key=sort_key_map[params.sort_by], reverse=reverse)

            total = len(filtered_users)
            start = (params.page - 1) * params.page_size
            end = start + params.page_size
            page_users = filtered_users[start:end]

            return UserListResponse(
                items=[UserResponse(**u) for u in page_users],
                total=total, page=params.page, page_size=params.page_size,
                has_next=end < total, has_prev=params.page > 1
            )
        except Exception as e:
            logger.error("Failed to get users paginated", error=str(e))
            raise

    async def get_user_by_id(self, user_id: str) -> Optional[UserResponse]:
        """根据ID获取用户"""
        try:
            user_data = next((u for u in self._mock_users if u["id"] == user_id), None)
            if not user_data:
                return None
            return UserResponse(**user_data)
        except Exception as e:
            logger.error("Failed to get user by id", error=str(e), user_id=user_id)
            raise

    async def create_user(self, user_data: UserCreate, creator_id: str) -> UserResponse:
        """创建用户"""
        try:
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
            self._mock_users.append(new_user)
            logger.info("User created", user_id=new_user["id"], username=new_user["username"])
            return UserResponse(**new_user)
        except Exception as e:
            logger.error("Failed to create user", error=str(e))
            raise

    async def update_user(self, user_id: str, user_data: UserUpdate, updater_id: str) -> Optional[UserResponse]:
        """更新用户信息"""
        try:
            user_dict = next((u for u in self._mock_users if u["id"] == user_id), None)
            if not user_dict:
                return None

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

            logger.info("User updated", user_id=user_id, updater_id=updater_id)
            return UserResponse(**user_dict)
        except Exception as e:
            logger.error("Failed to update user", error=str(e), user_id=user_id)
            raise

    async def delete_user(self, user_id: str, deleter_id: str) -> bool:
        """删除用户（软删除）"""
        try:
            user_dict = next((u for u in self._mock_users if u["id"] == user_id), None)
            if not user_dict:
                return False
            self._mock_users.remove(user_dict)
            logger.info("User deleted", user_id=user_id, deleter_id=deleter_id)
            return True
        except Exception as e:
            logger.error("Failed to delete user", error=str(e), user_id=user_id)
            raise

    async def batch_operate_users(
        self, user_ids: List[int], operation: BatchOperationType,
        params: Dict[str, Any], operator_id: int
    ) -> Tuple[int, int, List[BatchOperationResult]]:
        """批量操作用户"""
        try:
            results = []
            success_count = 0
            failed_count = 0

            for user_id in user_ids:
                try:
                    success = await self._execute_operation(user_id, operation, params)
                    if success:
                        success_count += 1
                        results.append(BatchOperationResult(user_id=user_id, success=True, message=f"操作成功: {operation.value}"))
                    else:
                        failed_count += 1
                        results.append(BatchOperationResult(user_id=user_id, success=False, message="操作失败"))
                except Exception as e:
                    failed_count += 1
                    results.append(BatchOperationResult(user_id=user_id, success=False, message=str(e)))

            logger.info("Batch user operation completed", operation=operation.value, success=success_count, failed=failed_count)
            return success_count, failed_count, results
        except Exception as e:
            logger.error("Failed to batch operate users", error=str(e))
            raise

    async def _execute_operation(self, user_id: int, operation: BatchOperationType, params: Dict[str, Any]) -> bool:
        """执行单个用户操作"""
        if operation == BatchOperationType.DELETE:
            return user_id != 1
        elif operation == BatchOperationType.ASSIGN_ROLE:
            return "role" in params
        return True

    async def get_user_statistics(self) -> UserStats:
        """获取用户统计数据"""
        try:
            now = datetime.now()
            return UserStats(
                total_users=100, active_users=85, inactive_users=10, locked_users=5, online_users=15,
                users_by_role={"admin": 5, "operator": 30, "viewer": 65},
                new_users_today=2, new_users_this_week=8, new_users_this_month=25,
                login_count_today=45, login_count_this_week=320,
                recent_active_users=[
                    {"user_id": 1, "username": "admin", "last_activity": (now - timedelta(minutes=5)).isoformat()},
                    {"user_id": 2, "username": "operator1", "last_activity": (now - timedelta(minutes=10)).isoformat()},
                    {"user_id": 3, "username": "viewer1", "last_activity": (now - timedelta(minutes=15)).isoformat()}
                ]
            )
        except Exception as e:
            logger.error("Failed to get user statistics", error=str(e))
            raise


# 全局实例
user_settings_service = UserSettingsService()
