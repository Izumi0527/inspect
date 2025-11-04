"""Create system management tables

Revision ID: 007_create_system_tables
Revises: 006_create_report_tables
Create Date: 2025-01-25 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = '007_create_system_tables'
down_revision = '006_create_report_tables'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create system management related tables"""
    
    # 创建系统设置表
    op.create_table('system_settings',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('key', sa.String(100), nullable=False, unique=True, comment='设置键'),
        sa.Column('value', sa.Text, comment='设置值'),
        sa.Column('category', sa.String(20), nullable=False, comment='设置分类'),
        sa.Column('level', sa.String(20), default='system', comment='设置级别'),
        
        # 设置属性
        sa.Column('description', sa.Text, comment='设置描述'),
        sa.Column('data_type', sa.String(20), default='string', comment='数据类型'),
        sa.Column('is_required', sa.Boolean, default=False, comment='是否必需'),
        sa.Column('is_encrypted', sa.Boolean, default=False, comment='是否加密'),
        sa.Column('is_readonly', sa.Boolean, default=False, comment='是否只读'),
        
        # 验证规则
        sa.Column('validation_rule', sa.String(200), comment='验证规则'),
        sa.Column('default_value', sa.Text, comment='默认值'),
        sa.Column('min_value', sa.Float, comment='最小值'),
        sa.Column('max_value', sa.Float, comment='最大值'),
        sa.Column('allowed_values', sa.JSON, comment='允许的值列表'),
        
        # 更新信息
        sa.Column('updated_by', sa.String(36), sa.ForeignKey('users.id', ondelete='SET NULL'), comment='更新人'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        
        # 添加约束
        sa.CheckConstraint("category IN ('system', 'notification', 'email', 'inspection', 'report', 'security', 'backup', 'user_preference')", name='ck_system_settings_category'),
        sa.CheckConstraint("level IN ('system', 'user', 'module')", name='ck_system_settings_level'),
        sa.CheckConstraint("data_type IN ('string', 'integer', 'float', 'boolean', 'json', 'text')", name='ck_system_settings_data_type'),
        comment='系统设置表'
    )
    
    # 创建系统日志表
    op.create_table('system_logs',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('level', sa.String(20), nullable=False, comment='日志级别'),
        sa.Column('category', sa.String(50), nullable=False, comment='日志分类'),
        sa.Column('module', sa.String(50), comment='模块名称'),
        sa.Column('message', sa.Text, nullable=False, comment='日志消息'),
        
        # 详细信息
        sa.Column('details', sa.JSON, comment='详细信息'),
        sa.Column('error_code', sa.String(20), comment='错误代码'),
        sa.Column('error_stack', sa.Text, comment='错误堆栈'),
        
        # 上下文信息
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='SET NULL'), comment='用户ID'),
        sa.Column('session_id', sa.String(100), comment='会话ID'),
        sa.Column('request_id', sa.String(100), comment='请求ID'),
        sa.Column('ip_address', sa.String(45), comment='IP地址'),
        sa.Column('user_agent', sa.String(500), comment='用户代理'),
        
        # 时间和来源
        sa.Column('timestamp', sa.DateTime(timezone=True), nullable=False, server_default=sa.text('CURRENT_TIMESTAMP'), comment='时间戳'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        
        # 添加约束
        sa.CheckConstraint("level IN ('DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL', 'FATAL')", name='ck_system_logs_level'),
        comment='系统日志表'
    )
    
    # 创建操作日志表
    op.create_table('operation_logs',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='SET NULL'), nullable=False),
        sa.Column('username', sa.String(50), comment='用户名快照'),
        
        # 操作信息
        sa.Column('operation', sa.String(50), nullable=False, comment='操作类型'),
        sa.Column('resource_type', sa.String(50), nullable=False, comment='资源类型'),
        sa.Column('resource_id', sa.String(50), comment='资源ID'),
        sa.Column('resource_name', sa.String(200), comment='资源名称'),
        
        # 操作详情
        sa.Column('action', sa.String(20), nullable=False, comment='操作动作'),
        sa.Column('description', sa.Text, comment='操作描述'),
        sa.Column('old_values', sa.JSON, comment='变更前的值'),
        sa.Column('new_values', sa.JSON, comment='变更后的值'),
        sa.Column('extra_data', sa.JSON, comment='额外数据'),
        
        # 结果信息
        sa.Column('status', sa.String(20), default='success', comment='操作状态'),
        sa.Column('error_message', sa.Text, comment='错误消息'),
        sa.Column('duration_ms', sa.Integer, comment='执行耗时(毫秒)'),
        
        # 环境信息
        sa.Column('ip_address', sa.String(45), comment='IP地址'),
        sa.Column('user_agent', sa.String(500), comment='用户代理'),
        sa.Column('request_method', sa.String(10), comment='请求方法'),
        sa.Column('request_url', sa.String(500), comment='请求URL'),
        
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        
        # 添加约束
        sa.CheckConstraint("action IN ('create', 'read', 'update', 'delete', 'login', 'logout', 'import', 'export', 'execute')", name='ck_operation_logs_action'),
        sa.CheckConstraint("status IN ('success', 'failed', 'partial')", name='ck_operation_logs_status'),
        comment='操作日志表'
    )
    
    # 创建系统备份记录表
    op.create_table('system_backups',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('backup_name', sa.String(200), nullable=False, unique=True, comment='备份名称'),
        sa.Column('backup_type', sa.String(20), nullable=False, comment='备份类型'),
        sa.Column('description', sa.Text, comment='备份描述'),
        
        # 备份内容
        sa.Column('include_database', sa.Boolean, default=True, comment='包含数据库'),
        sa.Column('include_settings', sa.Boolean, default=True, comment='包含设置'),
        sa.Column('include_logs', sa.Boolean, default=False, comment='包含日志'),
        sa.Column('include_files', sa.Boolean, default=False, comment='包含文件'),
        
        # 文件信息
        sa.Column('file_path', sa.String(500), comment='备份文件路径'),
        sa.Column('file_size', sa.BigInteger, comment='文件大小(字节)'),
        sa.Column('file_checksum', sa.String(100), comment='文件校验和'),
        sa.Column('compression_type', sa.String(20), comment='压缩类型'),
        
        # 状态信息
        sa.Column('status', sa.String(20), default='pending', comment='备份状态'),
        sa.Column('progress', sa.Integer, default=0, comment='备份进度(0-100)'),
        sa.Column('error_message', sa.Text, comment='错误消息'),
        
        # 时间信息
        sa.Column('started_at', sa.DateTime(timezone=True), comment='开始时间'),
        sa.Column('completed_at', sa.DateTime(timezone=True), comment='完成时间'),
        sa.Column('duration_seconds', sa.Integer, comment='耗时(秒)'),
        
        # 过期信息
        sa.Column('retention_days', sa.Integer, default=30, comment='保留天数'),
        sa.Column('expires_at', sa.DateTime(timezone=True), comment='过期时间'),
        sa.Column('auto_delete', sa.Boolean, default=True, comment='自动删除'),
        
        # 创建信息
        sa.Column('created_by', sa.String(36), sa.ForeignKey('users.id', ondelete='SET NULL'), comment='创建人'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        
        # 添加约束
        sa.CheckConstraint("backup_type IN ('manual', 'scheduled', 'migration', 'export')", name='ck_system_backups_type'),
        sa.CheckConstraint("status IN ('pending', 'running', 'completed', 'failed', 'cancelled')", name='ck_system_backups_status'),
        sa.CheckConstraint("progress >= 0 AND progress <= 100", name='ck_system_backups_progress'),
        comment='系统备份记录表'
    )
    
    # 创建索引
    
    # 系统设置表索引
    op.create_index('idx_system_settings_key', 'system_settings', ['key'])
    op.create_index('idx_system_settings_category', 'system_settings', ['category'])
    op.create_index('idx_system_settings_level', 'system_settings', ['level'])
    op.create_index('idx_system_settings_is_required', 'system_settings', ['is_required'])
    op.create_index('idx_system_settings_updated_by', 'system_settings', ['updated_by'])
    op.create_index('idx_system_settings_updated_at', 'system_settings', ['updated_at'])
    
    # 系统日志表索引
    op.create_index('idx_system_logs_level', 'system_logs', ['level'])
    op.create_index('idx_system_logs_category', 'system_logs', ['category'])
    op.create_index('idx_system_logs_module', 'system_logs', ['module'])
    op.create_index('idx_system_logs_user_id', 'system_logs', ['user_id'])
    op.create_index('idx_system_logs_timestamp', 'system_logs', ['timestamp'])
    op.create_index('idx_system_logs_created_at', 'system_logs', ['created_at'])
    op.create_index('idx_system_logs_level_timestamp', 'system_logs', ['level', 'timestamp'])
    op.create_index('idx_system_logs_category_timestamp', 'system_logs', ['category', 'timestamp'])
    
    # 操作日志表索引
    op.create_index('idx_operation_logs_user_id', 'operation_logs', ['user_id'])
    op.create_index('idx_operation_logs_operation', 'operation_logs', ['operation'])
    op.create_index('idx_operation_logs_resource_type', 'operation_logs', ['resource_type'])
    op.create_index('idx_operation_logs_resource_id', 'operation_logs', ['resource_id'])
    op.create_index('idx_operation_logs_action', 'operation_logs', ['action'])
    op.create_index('idx_operation_logs_status', 'operation_logs', ['status'])
    op.create_index('idx_operation_logs_created_at', 'operation_logs', ['created_at'])
    op.create_index('idx_operation_logs_ip_address', 'operation_logs', ['ip_address'])
    op.create_index('idx_operation_logs_user_action', 'operation_logs', ['user_id', 'action'])
    op.create_index('idx_operation_logs_resource_action', 'operation_logs', ['resource_type', 'action'])
    
    # 系统备份记录表索引
    op.create_index('idx_system_backups_backup_name', 'system_backups', ['backup_name'])
    op.create_index('idx_system_backups_backup_type', 'system_backups', ['backup_type'])
    op.create_index('idx_system_backups_status', 'system_backups', ['status'])
    op.create_index('idx_system_backups_created_by', 'system_backups', ['created_by'])
    op.create_index('idx_system_backups_started_at', 'system_backups', ['started_at'])
    op.create_index('idx_system_backups_completed_at', 'system_backups', ['completed_at'])
    op.create_index('idx_system_backups_expires_at', 'system_backups', ['expires_at'])
    op.create_index('idx_system_backups_auto_delete', 'system_backups', ['auto_delete'])
    op.create_index('idx_system_backups_created_at', 'system_backups', ['created_at'])
    op.create_index('idx_system_backups_type_status', 'system_backups', ['backup_type', 'status'])


def downgrade() -> None:
    """Drop system management tables"""
    
    # 删除索引
    op.drop_index('idx_system_backups_type_status')
    op.drop_index('idx_system_backups_created_at')
    op.drop_index('idx_system_backups_auto_delete')
    op.drop_index('idx_system_backups_expires_at')
    op.drop_index('idx_system_backups_completed_at')
    op.drop_index('idx_system_backups_started_at')
    op.drop_index('idx_system_backups_created_by')
    op.drop_index('idx_system_backups_status')
    op.drop_index('idx_system_backups_backup_type')
    op.drop_index('idx_system_backups_backup_name')
    op.drop_index('idx_operation_logs_resource_action')
    op.drop_index('idx_operation_logs_user_action')
    op.drop_index('idx_operation_logs_ip_address')
    op.drop_index('idx_operation_logs_created_at')
    op.drop_index('idx_operation_logs_status')
    op.drop_index('idx_operation_logs_action')
    op.drop_index('idx_operation_logs_resource_id')
    op.drop_index('idx_operation_logs_resource_type')
    op.drop_index('idx_operation_logs_operation')
    op.drop_index('idx_operation_logs_user_id')
    op.drop_index('idx_system_logs_category_timestamp')
    op.drop_index('idx_system_logs_level_timestamp')
    op.drop_index('idx_system_logs_created_at')
    op.drop_index('idx_system_logs_timestamp')
    op.drop_index('idx_system_logs_user_id')
    op.drop_index('idx_system_logs_module')
    op.drop_index('idx_system_logs_category')
    op.drop_index('idx_system_logs_level')
    op.drop_index('idx_system_settings_updated_at')
    op.drop_index('idx_system_settings_updated_by')
    op.drop_index('idx_system_settings_is_required')
    op.drop_index('idx_system_settings_level')
    op.drop_index('idx_system_settings_category')
    op.drop_index('idx_system_settings_key')
    
    # 删除表
    op.drop_table('system_backups')
    op.drop_table('operation_logs')
    op.drop_table('system_logs')
    op.drop_table('system_settings')