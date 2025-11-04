"""Insert default permissions and roles

Revision ID: 002_insert_default_data
Revises: 001_create_user_tables
Create Date: 2025-01-25 10:30:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import text
import uuid
from datetime import datetime

# revision identifiers
revision = '002_insert_default_data'
down_revision = '001_create_user_tables'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Insert default permissions and roles"""
    
    connection = op.get_bind()
    
    # 生成UUID的辅助函数
    def generate_uuid():
        return str(uuid.uuid4())
    
    current_time = datetime.utcnow()
    
    # 插入默认权限
    permissions_data = [
        # 用户管理权限
        {
            'id': generate_uuid(),
            'name': 'users:read',
            'display_name': '查看用户',
            'description': '查看用户列表和详细信息',
            'module': 'users',
            'action': 'read',
            'resource': 'user'
        },
        {
            'id': generate_uuid(),
            'name': 'users:create',
            'display_name': '创建用户',
            'description': '创建新用户账户',
            'module': 'users',
            'action': 'create',
            'resource': 'user'
        },
        {
            'id': generate_uuid(),
            'name': 'users:update',
            'display_name': '更新用户',
            'description': '更新用户信息和状态',
            'module': 'users',
            'action': 'update',
            'resource': 'user'
        },
        {
            'id': generate_uuid(),
            'name': 'users:delete',
            'display_name': '删除用户',
            'description': '删除用户账户',
            'module': 'users',
            'action': 'delete',
            'resource': 'user'
        },
        
        # 设备管理权限
        {
            'id': generate_uuid(),
            'name': 'devices:read',
            'display_name': '查看设备',
            'description': '查看设备列表和详细信息',
            'module': 'devices',
            'action': 'read',
            'resource': 'device'
        },
        {
            'id': generate_uuid(),
            'name': 'devices:create',
            'display_name': '添加设备',
            'description': '添加新的网络设备',
            'module': 'devices',
            'action': 'create',
            'resource': 'device'
        },
        {
            'id': generate_uuid(),
            'name': 'devices:update',
            'display_name': '更新设备',
            'description': '更新设备配置和信息',
            'module': 'devices',
            'action': 'update',
            'resource': 'device'
        },
        {
            'id': generate_uuid(),
            'name': 'devices:delete',
            'display_name': '删除设备',
            'description': '删除网络设备',
            'module': 'devices',
            'action': 'delete',
            'resource': 'device'
        },
        
        # 巡检管理权限
        {
            'id': generate_uuid(),
            'name': 'inspections:read',
            'display_name': '查看巡检',
            'description': '查看巡检任务和历史记录',
            'module': 'inspections',
            'action': 'read',
            'resource': 'inspection'
        },
        {
            'id': generate_uuid(),
            'name': 'inspections:create',
            'display_name': '创建巡检',
            'description': '创建巡检任务和策略',
            'module': 'inspections',
            'action': 'create',
            'resource': 'inspection'
        },
        {
            'id': generate_uuid(),
            'name': 'inspections:update',
            'display_name': '更新巡检',
            'description': '更新巡检任务和策略',
            'module': 'inspections',
            'action': 'update',
            'resource': 'inspection'
        },
        {
            'id': generate_uuid(),
            'name': 'inspections:delete',
            'display_name': '删除巡检',
            'description': '删除巡检任务和策略',
            'module': 'inspections',
            'action': 'delete',
            'resource': 'inspection'
        },
        {
            'id': generate_uuid(),
            'name': 'inspections:execute',
            'display_name': '执行巡检',
            'description': '手动执行巡检任务',
            'module': 'inspections',
            'action': 'execute',
            'resource': 'inspection'
        },
        
        # 告警管理权限
        {
            'id': generate_uuid(),
            'name': 'alerts:read',
            'display_name': '查看告警',
            'description': '查看告警信息和历史',
            'module': 'alerts',
            'action': 'read',
            'resource': 'alert'
        },
        {
            'id': generate_uuid(),
            'name': 'alerts:acknowledge',
            'display_name': '确认告警',
            'description': '确认告警信息',
            'module': 'alerts',
            'action': 'update',
            'resource': 'alert'
        },
        {
            'id': generate_uuid(),
            'name': 'alerts:resolve',
            'display_name': '处理告警',
            'description': '标记告警为已处理',
            'module': 'alerts',
            'action': 'update',
            'resource': 'alert'
        },
        {
            'id': generate_uuid(),
            'name': 'alerts:delete',
            'display_name': '删除告警',
            'description': '删除告警记录',
            'module': 'alerts',
            'action': 'delete',
            'resource': 'alert'
        },
        
        # 监控管理权限
        {
            'id': generate_uuid(),
            'name': 'monitoring:read',
            'display_name': '查看监控',
            'description': '查看实时监控数据和仪表板',
            'module': 'monitoring',
            'action': 'read',
            'resource': 'monitoring'
        },
        {
            'id': generate_uuid(),
            'name': 'monitoring:control',
            'display_name': '监控控制',
            'description': '控制监控服务和配置',
            'module': 'monitoring',
            'action': 'update',
            'resource': 'monitoring'
        },

        # 报表权限
        {
            'id': generate_uuid(),
            'name': 'reports:read',
            'display_name': '查看报表',
            'description': '查看各类统计报表',
            'module': 'reports',
            'action': 'read',
            'resource': 'report'
        },
        {
            'id': generate_uuid(),
            'name': 'reports:create',
            'display_name': '生成报表',
            'description': '生成和导出报表',
            'module': 'reports',
            'action': 'create',
            'resource': 'report'
        },
        {
            'id': generate_uuid(),
            'name': 'reports:delete',
            'display_name': '删除报表',
            'description': '删除报表记录',
            'module': 'reports',
            'action': 'delete',
            'resource': 'report'
        },
        
        # 系统管理权限
        {
            'id': generate_uuid(),
            'name': 'system:config',
            'display_name': '系统配置',
            'description': '管理系统配置和设置',
            'module': 'system',
            'action': 'update',
            'resource': 'config'
        },
        {
            'id': generate_uuid(),
            'name': 'system:logs',
            'display_name': '查看日志',
            'description': '查看系统日志和审计记录',
            'module': 'system',
            'action': 'read',
            'resource': 'log'
        }
    ]
    
    # 插入权限数据
    for perm in permissions_data:
        perm['created_at'] = current_time
        perm['updated_at'] = current_time
    
    connection.execute(
        text("""
        INSERT INTO permissions (id, name, display_name, description, module, action, resource, created_at, updated_at)
        VALUES (:id, :name, :display_name, :description, :module, :action, :resource, :created_at, :updated_at)
        """),
        permissions_data
    )
    
    # 获取插入的权限ID映射
    permission_mapping = {perm['name']: perm['id'] for perm in permissions_data}
    
    # 插入默认角色
    roles_data = [
        {
            'id': generate_uuid(),
            'name': 'admin',
            'display_name': '系统管理员',
            'description': '拥有系统所有权限的超级管理员',
            'is_built_in': True,
            'created_at': current_time,
            'updated_at': current_time
        },
        {
            'id': generate_uuid(),
            'name': 'operator',
            'display_name': '系统操作员',
            'description': '可以执行日常运维操作的操作员',
            'is_built_in': True,
            'created_at': current_time,
            'updated_at': current_time
        },
        {
            'id': generate_uuid(),
            'name': 'viewer',
            'display_name': '只读用户',
            'description': '只能查看数据，无法执行修改操作',
            'is_built_in': True,
            'created_at': current_time,
            'updated_at': current_time
        }
    ]
    
    connection.execute(
        text("""
        INSERT INTO roles (id, name, display_name, description, is_built_in, created_at, updated_at)
        VALUES (:id, :name, :display_name, :description, :is_built_in, :created_at, :updated_at)
        """),
        roles_data
    )
    
    # 获取角色ID映射
    role_mapping = {role['name']: role['id'] for role in roles_data}
    
    # 配置角色权限关系
    role_permissions = []
    
    # 管理员权限 - 所有权限
    admin_permissions = list(permission_mapping.keys())
    for perm_name in admin_permissions:
        role_permissions.append({
            'id': generate_uuid(),
            'role_id': role_mapping['admin'],
            'permission_id': permission_mapping[perm_name],
            'created_at': current_time
        })
    
    # 操作员权限
    operator_permissions = [
        'devices:read', 'devices:create', 'devices:update',
        'inspections:read', 'inspections:create', 'inspections:update', 'inspections:execute',
        'alerts:read', 'alerts:acknowledge', 'alerts:resolve',
        'monitoring:read',
        'reports:read', 'reports:create'
    ]
    for perm_name in operator_permissions:
        role_permissions.append({
            'id': generate_uuid(),
            'role_id': role_mapping['operator'],
            'permission_id': permission_mapping[perm_name],
            'created_at': current_time
        })
    
    # 查看者权限
    viewer_permissions = [
        'devices:read',
        'inspections:read',
        'alerts:read',
        'reports:read'
    ]
    for perm_name in viewer_permissions:
        role_permissions.append({
            'id': generate_uuid(),
            'role_id': role_mapping['viewer'],
            'permission_id': permission_mapping[perm_name],
            'created_at': current_time
        })
    
    # 插入角色权限关系
    connection.execute(
        text("""
        INSERT INTO role_permissions (id, role_id, permission_id, created_at)
        VALUES (:id, :role_id, :permission_id, :created_at)
        """),
        role_permissions
    )
    
    # 创建默认管理员用户
    admin_user_id = generate_uuid()
    connection.execute(
        text("""
        INSERT INTO users (id, username, email, full_name, hashed_password, role, is_active, is_superuser, created_at, updated_at, created_by)
        VALUES (:id, :username, :email, :full_name, :hashed_password, :role, :is_active, :is_superuser, :created_at, :updated_at, :created_by)
        """),
        {
            'id': admin_user_id,
            'username': 'admin',
            'email': 'admin@inspect.local',
            'full_name': '系统管理员',
            'hashed_password': '$2b$12$LQNvJAKZG5tFwQQ0WqVxoOyGvyayGS2RVQVt4GooxYrqJGLhQXyLS',  # 密码: Admin123!
            'role': 'admin',
            'is_active': True,
            'is_superuser': True,
            'created_at': current_time,
            'updated_at': current_time,
            'created_by': admin_user_id
        }
    )


def downgrade() -> None:
    """Remove default data"""
    
    connection = op.get_bind()
    
    # 删除默认用户
    connection.execute(text("DELETE FROM users WHERE username = 'admin'"))
    
    # 删除角色权限关系
    connection.execute(text("DELETE FROM role_permissions"))
    
    # 删除角色
    connection.execute(text("DELETE FROM roles WHERE is_built_in = true"))
    
    # 删除权限
    connection.execute(text("DELETE FROM permissions"))