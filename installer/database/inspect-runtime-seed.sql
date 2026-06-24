-- ==========================================
-- Inspect 安装器运行时基础数据初始化
-- ==========================================
-- 功能：
-- 1. 初始化内置权限、角色和角色权限关系
-- 2. 初始化默认管理员账号 admin（口令由安装流程随机生成并经 pgcrypto 库内哈希，首登强制改密）
-- 3. 保持幂等，可在每次启动时重复执行
--
-- 注意：
-- - 表结构由后端启动时的 GORM 迁移负责创建
-- - 不保存明文：hashed_password 由 pgcrypto 的 crypt() 对注入的随机口令(:admin_password)做 bcrypt
-- ==========================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

WITH permission_seed(name, display_name, description, module, action, resource) AS (
    VALUES
        ('users:read', '查看用户', '查看用户列表和详细信息', 'users', 'read', 'user'),
        ('users:create', '创建用户', '创建新用户账户', 'users', 'create', 'user'),
        ('users:update', '更新用户', '更新用户信息与状态', 'users', 'update', 'user'),
        ('users:delete', '删除用户', '删除用户账户', 'users', 'delete', 'user'),

        ('devices:read', '查看设备', '查看设备列表和详细信息', 'devices', 'read', 'device'),
        ('devices:create', '添加设备', '添加新的网络设备', 'devices', 'create', 'device'),
        ('devices:update', '更新设备', '更新设备配置和信息', 'devices', 'update', 'device'),
        ('devices:delete', '删除设备', '删除网络设备', 'devices', 'delete', 'device'),

        ('inspections:read', '查看巡检', '查看巡检任务和历史记录', 'inspections', 'read', 'inspection'),
        ('inspections:create', '创建巡检', '创建巡检任务和策略', 'inspections', 'create', 'inspection'),
        ('inspections:update', '更新巡检', '更新巡检任务和策略', 'inspections', 'update', 'inspection'),
        ('inspections:delete', '删除巡检', '删除巡检任务和策略', 'inspections', 'delete', 'inspection'),
        ('inspections:execute', '执行巡检', '手动执行巡检任务', 'inspections', 'execute', 'inspection'),

        ('alerts:read', '查看告警', '查看告警信息与历史', 'alerts', 'read', 'alert'),
        ('alerts:create', '创建告警', '创建告警与规则', 'alerts', 'create', 'alert'),
        ('alerts:update', '更新告警', '确认/处理告警及更新状态', 'alerts', 'update', 'alert'),
        ('alerts:delete', '删除告警', '删除告警记录', 'alerts', 'delete', 'alert'),

        ('monitoring:read', '查看监控', '查看实时监控数据与仪表板', 'monitoring', 'read', 'monitoring'),
        ('monitoring:control', '控制监控', '启动/停止监控服务及写入监控指标', 'monitoring', 'control', 'monitoring'),
        ('monitoring:export', '导出监控报告', '导出监控中心报告（PDF/CSV/Excel）', 'monitoring', 'export', 'monitoring'),

        ('reports:read', '查看报表', '查看各类统计报表', 'reports', 'read', 'report'),
        ('reports:create', '创建报表', '生成与导出报表', 'reports', 'create', 'report'),
        ('reports:update', '更新报表', '更新报表模板与配置', 'reports', 'update', 'report'),
        ('reports:delete', '删除报表', '删除报表记录', 'reports', 'delete', 'report'),

        ('system:config', '系统配置', '管理系统配置与设置', 'system', 'update', 'config'),
        ('system:logs', '查看日志', '查看系统日志与审计记录', 'system', 'read', 'log'),
        ('system:logs:manage', '管理日志', '采集/删除/管理系统日志', 'system', 'update', 'log')
)
INSERT INTO permissions (id, name, display_name, description, module, action, resource, created_at, updated_at)
SELECT
    uuid_generate_v4()::text,
    name,
    display_name,
    description,
    module,
    action,
    resource,
    NOW(),
    NOW()
FROM permission_seed
ON CONFLICT (name) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    module = EXCLUDED.module,
    action = EXCLUDED.action,
    resource = EXCLUDED.resource,
    updated_at = NOW();

WITH role_seed(name, display_name, description, is_built_in) AS (
    VALUES
        ('admin', '系统管理员', '拥有系统所有权限的超级管理员', TRUE),
        ('operator', '操作员', '日常运维操作权限', TRUE),
        ('viewer', '只读用户', '只读查看权限', TRUE)
)
INSERT INTO roles (id, name, display_name, description, is_built_in, created_at, updated_at)
SELECT
    uuid_generate_v4()::text,
    name,
    display_name,
    description,
    is_built_in,
    NOW(),
    NOW()
FROM role_seed
ON CONFLICT (name) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    description = EXCLUDED.description,
    is_built_in = EXCLUDED.is_built_in,
    updated_at = NOW();

WITH role_permission_seed(role_name, permission_name) AS (
    VALUES
        ('admin', 'users:read'),
        ('admin', 'users:create'),
        ('admin', 'users:update'),
        ('admin', 'users:delete'),
        ('admin', 'devices:read'),
        ('admin', 'devices:create'),
        ('admin', 'devices:update'),
        ('admin', 'devices:delete'),
        ('admin', 'inspections:read'),
        ('admin', 'inspections:create'),
        ('admin', 'inspections:update'),
        ('admin', 'inspections:delete'),
        ('admin', 'inspections:execute'),
        ('admin', 'alerts:read'),
        ('admin', 'alerts:create'),
        ('admin', 'alerts:update'),
        ('admin', 'alerts:delete'),
        ('admin', 'monitoring:read'),
        ('admin', 'monitoring:control'),
        ('admin', 'monitoring:export'),
        ('admin', 'reports:read'),
        ('admin', 'reports:create'),
        ('admin', 'reports:update'),
        ('admin', 'reports:delete'),
        ('admin', 'system:config'),
        ('admin', 'system:logs'),
        ('admin', 'system:logs:manage'),

        ('operator', 'devices:read'),
        ('operator', 'devices:create'),
        ('operator', 'devices:update'),
        ('operator', 'inspections:read'),
        ('operator', 'inspections:create'),
        ('operator', 'inspections:update'),
        ('operator', 'inspections:execute'),
        ('operator', 'alerts:read'),
        ('operator', 'alerts:update'),
        ('operator', 'monitoring:read'),
        ('operator', 'monitoring:control'),
        ('operator', 'monitoring:export'),
        ('operator', 'reports:read'),
        ('operator', 'reports:create'),
        ('operator', 'system:logs'),
        ('operator', 'system:logs:manage'),

        ('viewer', 'devices:read'),
        ('viewer', 'inspections:read'),
        ('viewer', 'alerts:read'),
        ('viewer', 'monitoring:read'),
        ('viewer', 'reports:read'),
        ('viewer', 'system:logs')
),
resolved_pairs AS (
    SELECT r.id AS role_id, p.id AS permission_id
    FROM role_permission_seed seed
    JOIN roles r ON r.name = seed.role_name
    JOIN permissions p ON p.name = seed.permission_name
)
INSERT INTO role_permissions (id, role_id, permission_id, created_at)
SELECT uuid_generate_v4()::text, role_id, permission_id, NOW()
FROM resolved_pairs
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO users (
    id,
    username,
    email,
    full_name,
    hashed_password,
    role,
    is_active,
    is_superuser,
    password_changed_at,
    force_password_change,
    login_attempts,
    locked_until,
    created_at,
    updated_at
) VALUES (
    '00000000-0000-4000-8000-000000000001',
    'admin',
    'admin@admin.com',
    '系统管理员',
    crypt(:'admin_password', gen_salt('bf', 10)),
    'admin',
    TRUE,
    TRUE,
    NOW(),
    TRUE,
    0,
    NULL,
    NOW(),
    NOW()
)
ON CONFLICT (username) DO NOTHING;

COMMIT;
