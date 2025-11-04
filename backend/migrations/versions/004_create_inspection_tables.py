"""Create inspection management tables

Revision ID: 004_create_inspection_tables
Revises: 003_create_device_tables
Create Date: 2025-01-25 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = '004_create_inspection_tables'
down_revision = '003_create_device_tables'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create inspection management related tables"""
    
    # 创建巡检模板表
    op.create_table('inspection_templates',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('name', sa.String(100), nullable=False, comment='模板名称'),
        sa.Column('description', sa.Text, comment='模板描述'),
        sa.Column('device_types', sa.JSON, comment='适用的设备类型列表'),
        sa.Column('check_items', sa.JSON, comment='检查项目配置'),
        sa.Column('is_default', sa.Boolean, default=False, comment='是否默认模板'),
        sa.Column('is_active', sa.Boolean, default=True, comment='是否启用'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        comment='巡检模板表'
    )
    
    # 创建巡检调度表
    op.create_table('inspection_schedules',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('name', sa.String(100), nullable=False, comment='调度任务名称'),
        sa.Column('description', sa.Text, comment='任务描述'),
        sa.Column('cron_expression', sa.String(100), nullable=False, comment='Cron表达式'),
        sa.Column('device_group_id', sa.Integer, sa.ForeignKey('device_groups.id', ondelete='SET NULL'), comment='设备分组ID'),
        sa.Column('template_id', sa.Integer, sa.ForeignKey('inspection_templates.id', ondelete='CASCADE'), nullable=False, comment='巡检模板ID'),
        
        # 状态信息
        sa.Column('is_active', sa.Boolean, default=True, comment='是否启用'),
        sa.Column('last_run', sa.DateTime(timezone=True), comment='最后运行时间'),
        sa.Column('next_run', sa.DateTime(timezone=True), comment='下次运行时间'),
        
        # 统计信息
        sa.Column('total_runs', sa.Integer, default=0, comment='总运行次数'),
        sa.Column('successful_runs', sa.Integer, default=0, comment='成功运行次数'),
        sa.Column('failed_runs', sa.Integer, default=0, comment='失败运行次数'),
        
        sa.Column('created_by', sa.String(36), sa.ForeignKey('users.id', ondelete='SET NULL')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        comment='巡检调度表'
    )
    
    # 创建巡检任务表
    op.create_table('inspections',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('device_id', sa.Integer, sa.ForeignKey('devices.id', ondelete='CASCADE'), nullable=False),
        sa.Column('template_id', sa.Integer, sa.ForeignKey('inspection_templates.id', ondelete='SET NULL')),
        sa.Column('schedule_id', sa.Integer, sa.ForeignKey('inspection_schedules.id', ondelete='SET NULL')),
        
        # 基本信息
        sa.Column('name', sa.String(200), comment='巡检任务名称'),
        sa.Column('trigger', sa.String(20), nullable=False, comment='触发方式'),
        sa.Column('status', sa.String(20), nullable=False, default='pending', comment='执行状态'),
        
        # 时间信息
        sa.Column('scheduled_at', sa.DateTime(timezone=True), comment='计划执行时间'),
        sa.Column('started_at', sa.DateTime(timezone=True), comment='开始执行时间'),
        sa.Column('completed_at', sa.DateTime(timezone=True), comment='完成时间'),
        sa.Column('duration', sa.Integer, comment='执行耗时(秒)'),
        
        # 结果统计
        sa.Column('total_checks', sa.Integer, default=0, comment='总检查项数'),
        sa.Column('passed_checks', sa.Integer, default=0, comment='通过检查项数'),
        sa.Column('failed_checks', sa.Integer, default=0, comment='失败检查项数'),
        sa.Column('warning_checks', sa.Integer, default=0, comment='警告检查项数'),
        sa.Column('skipped_checks', sa.Integer, default=0, comment='跳过检查项数'),
        
        # 错误信息
        sa.Column('error_message', sa.Text, comment='错误消息'),
        sa.Column('error_details', sa.JSON, comment='错误详情'),
        
        # 执行配置
        sa.Column('timeout', sa.Integer, default=300, comment='超时时间(秒)'),
        sa.Column('retry_count', sa.Integer, default=0, comment='重试次数'),
        sa.Column('max_retries', sa.Integer, default=3, comment='最大重试次数'),
        
        sa.Column('created_by', sa.String(36), sa.ForeignKey('users.id', ondelete='SET NULL')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        
        # 添加状态CHECK约束
        sa.CheckConstraint("trigger IN ('manual', 'scheduled', 'alert')", name='ck_inspections_trigger'),
        sa.CheckConstraint("status IN ('pending', 'running', 'completed', 'failed', 'cancelled', 'timeout')", name='ck_inspections_status'),
        comment='巡检任务表'
    )
    
    # 创建巡检结果表
    op.create_table('inspection_results',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('inspection_id', sa.Integer, sa.ForeignKey('inspections.id', ondelete='CASCADE'), nullable=False),
        
        # 检查项信息
        sa.Column('check_item_name', sa.String(100), nullable=False, comment='检查项名称'),
        sa.Column('check_item_type', sa.String(50), nullable=False, comment='检查项类型'),
        sa.Column('check_item_category', sa.String(50), comment='检查项分类'),
        sa.Column('description', sa.Text, comment='检查项描述'),
        sa.Column('command', sa.Text, comment='执行命令'),
        
        # 结果信息
        sa.Column('status', sa.String(20), nullable=False, comment='检查结果状态'),
        sa.Column('expected_value', sa.Text, comment='期望值'),
        sa.Column('actual_value', sa.Text, comment='实际值'),
        sa.Column('message', sa.Text, comment='结果消息'),
        sa.Column('details', sa.JSON, comment='详细信息'),
        
        # 执行信息
        sa.Column('execution_time', sa.Integer, comment='执行时间(毫秒)'),
        sa.Column('start_time', sa.DateTime(timezone=True), comment='开始时间'),
        sa.Column('end_time', sa.DateTime(timezone=True), comment='结束时间'),
        
        # 错误信息
        sa.Column('error_code', sa.String(20), comment='错误代码'),
        sa.Column('error_message', sa.Text, comment='错误消息'),
        sa.Column('error_details', sa.JSON, comment='错误详情'),
        
        # 评分信息
        sa.Column('score', sa.Float, comment='检查得分'),
        sa.Column('weight', sa.Float, default=1.0, comment='权重'),
        
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        
        # 添加状态CHECK约束
        sa.CheckConstraint("status IN ('pass', 'fail', 'warning', 'skip', 'error')", name='ck_inspection_results_status'),
        comment='巡检结果表'
    )
    
    # 创建巡检日志表
    op.create_table('inspection_logs',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('inspection_id', sa.Integer, sa.ForeignKey('inspections.id', ondelete='CASCADE'), nullable=False),
        sa.Column('operator_id', sa.String(36), sa.ForeignKey('users.id', ondelete='SET NULL')),
        
        # 日志信息
        sa.Column('level', sa.String(20), nullable=False, comment='日志级别'),
        sa.Column('message', sa.Text, nullable=False, comment='日志消息'),
        sa.Column('details', sa.JSON, comment='详细信息'),
        sa.Column('source', sa.String(50), comment='日志来源'),
        sa.Column('category', sa.String(50), comment='日志分类'),
        
        # 上下文信息
        sa.Column('device_id', sa.Integer, comment='关联设备ID'),
        sa.Column('check_item_name', sa.String(100), comment='关联检查项'),
        sa.Column('execution_step', sa.String(100), comment='执行步骤'),
        
        # 时间戳
        sa.Column('timestamp', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        
        # 添加级别CHECK约束
        sa.CheckConstraint("level IN ('DEBUG', 'INFO', 'WARNING', 'ERROR', 'CRITICAL')", name='ck_inspection_logs_level'),
        comment='巡检日志表'
    )
    
    # 创建索引
    
    # 巡检模板表索引
    op.create_index('idx_inspection_templates_name', 'inspection_templates', ['name'])
    op.create_index('idx_inspection_templates_is_active', 'inspection_templates', ['is_active'])
    op.create_index('idx_inspection_templates_is_default', 'inspection_templates', ['is_default'])
    
    # 巡检调度表索引
    op.create_index('idx_inspection_schedules_name', 'inspection_schedules', ['name'])
    op.create_index('idx_inspection_schedules_device_group_id', 'inspection_schedules', ['device_group_id'])
    op.create_index('idx_inspection_schedules_template_id', 'inspection_schedules', ['template_id'])
    op.create_index('idx_inspection_schedules_is_active', 'inspection_schedules', ['is_active'])
    op.create_index('idx_inspection_schedules_next_run', 'inspection_schedules', ['next_run'])
    op.create_index('idx_inspection_schedules_last_run', 'inspection_schedules', ['last_run'])
    
    # 巡检任务表索引
    op.create_index('idx_inspections_device_id', 'inspections', ['device_id'])
    op.create_index('idx_inspections_template_id', 'inspections', ['template_id'])
    op.create_index('idx_inspections_schedule_id', 'inspections', ['schedule_id'])
    op.create_index('idx_inspections_status', 'inspections', ['status'])
    op.create_index('idx_inspections_trigger', 'inspections', ['trigger'])
    op.create_index('idx_inspections_scheduled_at', 'inspections', ['scheduled_at'])
    op.create_index('idx_inspections_started_at', 'inspections', ['started_at'])
    op.create_index('idx_inspections_completed_at', 'inspections', ['completed_at'])
    op.create_index('idx_inspections_created_at', 'inspections', ['created_at'])
    op.create_index('idx_inspections_device_status', 'inspections', ['device_id', 'status'])
    
    # 巡检结果表索引
    op.create_index('idx_inspection_results_inspection_id', 'inspection_results', ['inspection_id'])
    op.create_index('idx_inspection_results_status', 'inspection_results', ['status'])
    op.create_index('idx_inspection_results_check_item_name', 'inspection_results', ['check_item_name'])
    op.create_index('idx_inspection_results_check_item_type', 'inspection_results', ['check_item_type'])
    op.create_index('idx_inspection_results_created_at', 'inspection_results', ['created_at'])
    op.create_index('idx_inspection_results_inspection_status', 'inspection_results', ['inspection_id', 'status'])
    
    # 巡检日志表索引
    op.create_index('idx_inspection_logs_inspection_id', 'inspection_logs', ['inspection_id'])
    op.create_index('idx_inspection_logs_level', 'inspection_logs', ['level'])
    op.create_index('idx_inspection_logs_timestamp', 'inspection_logs', ['timestamp'])
    op.create_index('idx_inspection_logs_operator_id', 'inspection_logs', ['operator_id'])
    op.create_index('idx_inspection_logs_device_id', 'inspection_logs', ['device_id'])
    op.create_index('idx_inspection_logs_inspection_level', 'inspection_logs', ['inspection_id', 'level'])


def downgrade() -> None:
    """Drop inspection management tables"""
    
    # 删除索引
    op.drop_index('idx_inspection_logs_inspection_level')
    op.drop_index('idx_inspection_logs_device_id')
    op.drop_index('idx_inspection_logs_operator_id')
    op.drop_index('idx_inspection_logs_timestamp')
    op.drop_index('idx_inspection_logs_level')
    op.drop_index('idx_inspection_logs_inspection_id')
    op.drop_index('idx_inspection_results_inspection_status')
    op.drop_index('idx_inspection_results_created_at')
    op.drop_index('idx_inspection_results_check_item_type')
    op.drop_index('idx_inspection_results_check_item_name')
    op.drop_index('idx_inspection_results_status')
    op.drop_index('idx_inspection_results_inspection_id')
    op.drop_index('idx_inspections_device_status')
    op.drop_index('idx_inspections_created_at')
    op.drop_index('idx_inspections_completed_at')
    op.drop_index('idx_inspections_started_at')
    op.drop_index('idx_inspections_scheduled_at')
    op.drop_index('idx_inspections_trigger')
    op.drop_index('idx_inspections_status')
    op.drop_index('idx_inspections_schedule_id')
    op.drop_index('idx_inspections_template_id')
    op.drop_index('idx_inspections_device_id')
    op.drop_index('idx_inspection_schedules_last_run')
    op.drop_index('idx_inspection_schedules_next_run')
    op.drop_index('idx_inspection_schedules_is_active')
    op.drop_index('idx_inspection_schedules_template_id')
    op.drop_index('idx_inspection_schedules_device_group_id')
    op.drop_index('idx_inspection_schedules_name')
    op.drop_index('idx_inspection_templates_is_default')
    op.drop_index('idx_inspection_templates_is_active')
    op.drop_index('idx_inspection_templates_name')
    
    # 删除表
    op.drop_table('inspection_logs')
    op.drop_table('inspection_results')
    op.drop_table('inspections')
    op.drop_table('inspection_schedules')
    op.drop_table('inspection_templates')