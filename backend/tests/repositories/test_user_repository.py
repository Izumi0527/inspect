"""
用户仓储层测试

测试 UserRepository 的所有数据访问方法
"""
import pytest
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock
from sqlalchemy.ext.asyncio import AsyncSession

from src.repositories.user_repository import UserRepository
from src.schemas.user import UserCreate, UserUpdate, UserQueryParams, UserRole, UserStatus


class TestUserRepository:
    """用户仓储测试类"""
    
    @pytest.fixture
    def mock_session(self):
        """创建模拟的数据库会话"""
        return AsyncMock(spec=AsyncSession)
    
    @pytest.fixture
    def repository(self, mock_session):
        """创建仓储实例"""
        return UserRepository(mock_session)
    
    @pytest.fixture
    def sample_user(self):
        """创建示例用户"""
        user = MagicMock()
        user.id = "user-001"
        user.username = "testuser"
        user.email = "test@example.com"
        user.full_name = "测试用户"
        user.role = UserRole.OPERATOR
        user.is_active = True
        user.created_at = datetime.utcnow()
        return user

    # ==================== 基础查询测试 ====================
    
    @pytest.mark.asyncio
    async def test_get_user_by_id_found(self, repository, mock_session, sample_user):
        """测试根据ID获取用户 - 找到"""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = sample_user
        mock_session.execute.return_value = mock_result
        
        result = await repository.get_user_by_id("user-001")
        
        assert result is not None
        assert result.id == "user-001"
    
    @pytest.mark.asyncio
    async def test_get_user_by_id_not_found(self, repository, mock_session):
        """测试根据ID获取用户 - 未找到"""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_session.execute.return_value = mock_result
        
        result = await repository.get_user_by_id("nonexistent")
        
        assert result is None
    
    @pytest.mark.asyncio
    async def test_get_user_by_username(self, repository, mock_session, sample_user):
        """测试根据用户名获取用户"""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = sample_user
        mock_session.execute.return_value = mock_result
        
        result = await repository.get_user_by_username("testuser")
        
        assert result is not None
        assert result.username == "testuser"
    
    @pytest.mark.asyncio
    async def test_get_user_by_email(self, repository, mock_session, sample_user):
        """测试根据邮箱获取用户"""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = sample_user
        mock_session.execute.return_value = mock_result
        
        result = await repository.get_user_by_email("test@example.com")
        
        assert result is not None
        assert result.email == "test@example.com"
    
    # ==================== 存在性检查测试 ====================
    
    @pytest.mark.asyncio
    async def test_check_username_exists_true(self, repository, mock_session):
        """测试检查用户名是否存在 - 存在"""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = "user-001"
        mock_session.execute.return_value = mock_result
        
        result = await repository.check_username_exists("testuser")
        
        assert result is True
    
    @pytest.mark.asyncio
    async def test_check_username_exists_false(self, repository, mock_session):
        """测试检查用户名是否存在 - 不存在"""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_session.execute.return_value = mock_result
        
        result = await repository.check_username_exists("newuser")
        
        assert result is False
    
    @pytest.mark.asyncio
    async def test_check_email_exists(self, repository, mock_session):
        """测试检查邮箱是否存在"""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = "user-001"
        mock_session.execute.return_value = mock_result
        
        result = await repository.check_email_exists("test@example.com")
        
        assert result is True

    # ==================== 创建用户测试 ====================
    
    @pytest.mark.asyncio
    async def test_create_user(self, repository, mock_session):
        """测试创建用户"""
        user_data = UserCreate(
            username="newuser",
            email="new@example.com",
            full_name="新用户",
            password="SecurePass123!",
            confirm_password="SecurePass123!",
            role=UserRole.OPERATOR,
            status=UserStatus.ACTIVE
        )
        
        result = await repository.create_user(user_data, created_by="admin")
        
        mock_session.add.assert_called_once()
        mock_session.commit.assert_called_once()
        mock_session.refresh.assert_called_once()
    
    # ==================== 更新用户测试 ====================
    
    @pytest.mark.asyncio
    async def test_update_user_success(self, repository, mock_session, sample_user):
        """测试更新用户 - 成功"""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = sample_user
        mock_session.execute.return_value = mock_result
        
        update_data = UserUpdate(full_name="更新后的名称")
        
        result = await repository.update_user("user-001", update_data)
        
        assert result is not None
        mock_session.commit.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_update_user_not_found(self, repository, mock_session):
        """测试更新用户 - 用户不存在"""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_session.execute.return_value = mock_result
        
        update_data = UserUpdate(full_name="test")
        result = await repository.update_user("nonexistent", update_data)
        
        assert result is None
    
    @pytest.mark.asyncio
    async def test_update_user_password(self, repository, mock_session, sample_user):
        """测试更新用户密码"""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = sample_user
        mock_session.execute.return_value = mock_result
        
        result = await repository.update_user_password("user-001", "NewPassword123!")
        
        assert result is True
        mock_session.commit.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_update_user_status(self, repository, mock_session, sample_user):
        """测试更新用户状态"""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = sample_user
        mock_session.execute.return_value = mock_result
        
        result = await repository.update_user_status("user-001", UserStatus.INACTIVE)
        
        assert result is not None
        mock_session.commit.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_update_last_login(self, repository, mock_session, sample_user):
        """测试更新最后登录时间"""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = sample_user
        mock_session.execute.return_value = mock_result
        
        await repository.update_last_login("user-001", "192.168.1.100")
        
        mock_session.commit.assert_called_once()

    # ==================== 删除用户测试 ====================
    
    @pytest.mark.asyncio
    async def test_delete_user_success(self, repository, mock_session, sample_user):
        """测试删除用户 - 成功（软删除）"""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = sample_user
        mock_session.execute.return_value = mock_result
        
        result = await repository.delete_user("user-001")
        
        assert result is True
        mock_session.commit.assert_called_once()
    
    @pytest.mark.asyncio
    async def test_delete_user_not_found(self, repository, mock_session):
        """测试删除用户 - 用户不存在"""
        mock_result = MagicMock()
        mock_result.scalar_one_or_none.return_value = None
        mock_session.execute.return_value = mock_result
        
        result = await repository.delete_user("nonexistent")
        
        assert result is False
    
    # ==================== 分页查询测试 ====================
    
    @pytest.mark.asyncio
    async def test_get_users_paginated(self, repository, mock_session, sample_user):
        """测试分页获取用户列表"""
        mock_users_result = MagicMock()
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = [sample_user]
        mock_users_result.scalars.return_value = mock_scalars
        
        mock_count_result = MagicMock()
        mock_count_result.scalar.return_value = 1
        
        mock_session.execute.side_effect = [mock_users_result, mock_count_result]
        
        params = UserQueryParams(page=1, page_size=10)
        users, total = await repository.get_users_paginated(params)
        
        assert len(users) == 1
        assert total == 1
    
    @pytest.mark.asyncio
    async def test_get_users_paginated_with_search(self, repository, mock_session, sample_user):
        """测试分页获取用户列表 - 带搜索"""
        mock_users_result = MagicMock()
        mock_scalars = MagicMock()
        mock_scalars.all.return_value = [sample_user]
        mock_users_result.scalars.return_value = mock_scalars
        
        mock_count_result = MagicMock()
        mock_count_result.scalar.return_value = 1
        
        mock_session.execute.side_effect = [mock_users_result, mock_count_result]
        
        params = UserQueryParams(page=1, page_size=10, search="test")
        users, total = await repository.get_users_paginated(params)
        
        assert len(users) == 1
    
    # ==================== 统计信息测试 ====================
    
    @pytest.mark.asyncio
    async def test_get_user_statistics(self, repository, mock_session):
        """测试获取用户统计信息"""
        mock_total = MagicMock()
        mock_total.scalar.return_value = 10
        
        mock_active = MagicMock()
        mock_active.scalar.return_value = 8
        
        mock_role_stats = MagicMock()
        mock_role_stats.all.return_value = [
            (UserRole.ADMIN, 2),
            (UserRole.OPERATOR, 6),
            (UserRole.VIEWER, 2)
        ]
        
        mock_recent = MagicMock()
        mock_recent.scalar.return_value = 3
        
        mock_session.execute.side_effect = [
            mock_total, mock_active, mock_role_stats, mock_recent
        ]
        
        stats = await repository.get_user_statistics()
        
        assert stats["total_users"] == 10
        assert stats["active_users"] == 8
        assert stats["inactive_users"] == 2
        assert "role_distribution" in stats
