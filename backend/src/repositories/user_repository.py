from typing import List, Optional, Dict, Any, Tuple
from datetime import datetime
from sqlalchemy import and_, or_, desc, asc, func, text
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.future import select

from ..models.user import User, Role, Permission, user_roles
from ..schemas.user import (
    UserCreate, UserUpdate, UserQueryParams, 
    UserRole, UserStatus, UserBulkOperation,
    UserBulkImportItem
)
from ..core.database import get_db_session_context
from ..utils.security import get_password_hash, verify_password


class UserRepository:
    """用户数据访问层"""
    
    def __init__(self, session: AsyncSession):
        self.session = session
    
    async def get_user_by_id(self, user_id: str) -> Optional[User]:
        """根据ID获取用户"""
        query = select(User).where(User.id == user_id)
        result = await self.session.execute(query)
        return result.scalar_one_or_none()
    
    async def get_user_by_username(self, username: str) -> Optional[User]:
        """根据用户名获取用户"""
        query = select(User).where(User.username == username.lower())
        result = await self.session.execute(query)
        return result.scalar_one_or_none()
    
    async def get_user_by_email(self, email: str) -> Optional[User]:
        """根据邮箱获取用户"""
        query = select(User).where(User.email == email.lower())
        result = await self.session.execute(query)
        return result.scalar_one_or_none()
    
    async def check_username_exists(self, username: str, exclude_user_id: Optional[str] = None) -> bool:
        """检查用户名是否存在"""
        query = select(User.id).where(User.username == username.lower())
        if exclude_user_id:
            query = query.where(User.id != exclude_user_id)
        result = await self.session.execute(query)
        return result.scalar_one_or_none() is not None
    
    async def check_email_exists(self, email: str, exclude_user_id: Optional[str] = None) -> bool:
        """检查邮箱是否存在"""
        query = select(User.id).where(User.email == email.lower())
        if exclude_user_id:
            query = query.where(User.id != exclude_user_id)
        result = await self.session.execute(query)
        return result.scalar_one_or_none() is not None
    
    async def create_user(self, user_data: UserCreate, created_by: str) -> User:
        """创建用户"""
        # 生成用户ID
        from uuid import uuid4
        user_id = str(uuid4())
        
        # 创建用户对象
        user = User(
            id=user_id,
            username=user_data.username.lower(),
            email=user_data.email.lower(),
            full_name=user_data.full_name,
            hashed_password=get_password_hash(user_data.password),
            role=user_data.role,
            is_active=user_data.status == UserStatus.ACTIVE,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow()
        )
        
        self.session.add(user)
        await self.session.commit()
        await self.session.refresh(user)
        
        return user
    
    async def update_user(self, user_id: str, user_data: UserUpdate) -> Optional[User]:
        """更新用户信息"""
        user = await self.get_user_by_id(user_id)
        if not user:
            return None
        
        # 更新字段
        if user_data.username is not None:
            user.username = user_data.username.lower()
        if user_data.email is not None:
            user.email = user_data.email.lower()
        if user_data.full_name is not None:
            user.full_name = user_data.full_name
        if user_data.role is not None:
            user.role = user_data.role
        if user_data.status is not None:
            user.is_active = user_data.status == UserStatus.ACTIVE
        
        user.updated_at = datetime.utcnow()
        
        await self.session.commit()
        await self.session.refresh(user)
        
        return user
    
    async def update_user_password(self, user_id: str, new_password: str) -> bool:
        """更新用户密码"""
        user = await self.get_user_by_id(user_id)
        if not user:
            return False
        
        user.hashed_password = get_password_hash(new_password)
        user.updated_at = datetime.utcnow()
        
        await self.session.commit()
        return True
    
    async def update_user_status(self, user_id: str, status: UserStatus) -> Optional[User]:
        """更新用户状态"""
        user = await self.get_user_by_id(user_id)
        if not user:
            return None
        
        user.is_active = status == UserStatus.ACTIVE
        user.updated_at = datetime.utcnow()
        
        await self.session.commit()
        await self.session.refresh(user)
        
        return user
    
    async def update_last_login(self, user_id: str, login_ip: str) -> None:
        """更新最后登录时间和IP"""
        user = await self.get_user_by_id(user_id)
        if user:
            user.last_login_at = datetime.utcnow()
            # 更新最后登录IP
            user.last_login_ip = login_ip
            await self.session.commit()
    
    async def delete_user(self, user_id: str) -> bool:
        """删除用户（软删除）"""
        user = await self.get_user_by_id(user_id)
        if not user:
            return False
        
        # 软删除：将用户名和邮箱加上删除时间戳，标记为非活跃
        timestamp = int(datetime.utcnow().timestamp())
        user.username = f"{user.username}_deleted_{timestamp}"
        user.email = f"{user.email}_deleted_{timestamp}"
        user.is_active = False
        user.updated_at = datetime.utcnow()
        
        await self.session.commit()
        return True
    
    async def get_users_paginated(
        self, 
        params: UserQueryParams
    ) -> Tuple[List[User], int]:
        """分页获取用户列表"""
        
        # 构建基础查询
        query = select(User)
        count_query = select(func.count(User.id))
        
        # 构建过滤条件
        filters = []
        
        # 搜索条件
        if params.search:
            search_term = f"%{params.search}%"
            filters.append(
                or_(
                    User.username.ilike(search_term),
                    User.email.ilike(search_term),
                    User.full_name.ilike(search_term)
                )
            )
        
        # 角色筛选
        if params.role:
            filters.append(User.role == params.role)
        
        # 状态筛选
        if params.status:
            if params.status == UserStatus.ACTIVE:
                filters.append(User.is_active == True)
            else:
                filters.append(User.is_active == False)
        
        # 应用过滤条件
        if filters:
            query = query.where(and_(*filters))
            count_query = count_query.where(and_(*filters))
        
        # 排序
        if params.sort_by == "username":
            order_col = User.username
        elif params.sort_by == "email":
            order_col = User.email
        elif params.sort_by == "role":
            order_col = User.role
        elif params.sort_by == "last_login":
            order_col = User.last_login_at
        else:  # created_at
            order_col = User.created_at
        
        if params.sort_order == "desc":
            query = query.order_by(desc(order_col))
        else:
            query = query.order_by(asc(order_col))
        
        # 分页
        offset = (params.page - 1) * params.page_size
        query = query.offset(offset).limit(params.page_size)
        
        # 执行查询
        result = await self.session.execute(query)
        users = result.scalars().all()
        
        count_result = await self.session.execute(count_query)
        total = count_result.scalar()
        
        return list(users), total
    
    async def get_users_by_role(self, role: UserRole) -> List[User]:
        """根据角色获取用户"""
        query = select(User).where(User.role == role)
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def get_active_users_count(self) -> int:
        """获取活跃用户数量"""
        query = select(func.count(User.id)).where(User.is_active == True)
        result = await self.session.execute(query)
        return result.scalar()
    
    async def get_users_by_ids(self, user_ids: List[str]) -> List[User]:
        """批量获取用户"""
        query = select(User).where(User.id.in_(user_ids))
        result = await self.session.execute(query)
        return list(result.scalars().all())
    
    async def bulk_update_status(self, user_ids: List[str], status: UserStatus) -> int:
        """批量更新用户状态"""
        is_active = status == UserStatus.ACTIVE
        
        query = text("""
            UPDATE users 
            SET is_active = :is_active, updated_at = :updated_at 
            WHERE id = ANY(:user_ids)
        """)
        
        result = await self.session.execute(
            query, 
            {
                "is_active": is_active,
                "updated_at": datetime.utcnow(),
                "user_ids": user_ids
            }
        )
        
        await self.session.commit()
        return result.rowcount
    
    async def bulk_delete_users(self, user_ids: List[str]) -> int:
        """批量删除用户（软删除）"""
        timestamp = int(datetime.utcnow().timestamp())
        
        query = text("""
            UPDATE users 
            SET username = CONCAT(username, '_deleted_', :timestamp),
                email = CONCAT(email, '_deleted_', :timestamp),
                is_active = false,
                updated_at = :updated_at
            WHERE id = ANY(:user_ids)
        """)
        
        result = await self.session.execute(
            query,
            {
                "timestamp": timestamp,
                "updated_at": datetime.utcnow(),
                "user_ids": user_ids
            }
        )
        
        await self.session.commit()
        return result.rowcount
    
    async def create_users_batch(
        self, 
        users_data: List[UserBulkImportItem], 
        created_by: str
    ) -> List[User]:
        """批量创建用户"""
        from uuid import uuid4
        
        users = []
        for user_data in users_data:
            user_id = str(uuid4())
            
            # 生成随机密码如果未提供
            password = user_data.password
            if not password:
                import secrets
                import string
                alphabet = string.ascii_letters + string.digits + "!@#$%^&*"
                password = ''.join(secrets.choice(alphabet) for i in range(12))
            
            user = User(
                id=user_id,
                username=user_data.username.lower(),
                email=user_data.email.lower(),
                full_name=user_data.full_name,
                hashed_password=get_password_hash(password),
                role=user_data.role,
                is_active=True,
                created_at=datetime.utcnow(),
                updated_at=datetime.utcnow()
            )
            
            users.append(user)
        
        # 批量插入
        self.session.add_all(users)
        await self.session.commit()
        
        # 刷新对象
        for user in users:
            await self.session.refresh(user)
        
        return users
    
    async def get_user_statistics(self) -> Dict[str, Any]:
        """获取用户统计信息"""
        # 总用户数
        total_query = select(func.count(User.id))
        total_result = await self.session.execute(total_query)
        total_users = total_result.scalar()
        
        # 活跃用户数
        active_query = select(func.count(User.id)).where(User.is_active == True)
        active_result = await self.session.execute(active_query)
        active_users = active_result.scalar()
        
        # 按角色统计
        role_query = select(User.role, func.count(User.id)).group_by(User.role)
        role_result = await self.session.execute(role_query)
        role_stats = {role: count for role, count in role_result.all()}
        
        # 最近30天新增用户
        thirty_days_ago = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
        recent_query = select(func.count(User.id)).where(
            User.created_at >= thirty_days_ago
        )
        recent_result = await self.session.execute(recent_query)
        recent_users = recent_result.scalar()
        
        return {
            "total_users": total_users,
            "active_users": active_users,
            "inactive_users": total_users - active_users,
            "role_distribution": role_stats,
            "recent_new_users": recent_users
        }


# 工厂函数
async def get_user_repository(session: AsyncSession = None) -> UserRepository:
    """获取用户仓储实例"""
    if session is None:
        async with get_db_session_context() as session:
            return UserRepository(session)
    return UserRepository(session)