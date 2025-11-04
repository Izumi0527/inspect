"""Create report management tables

Revision ID: 006_create_report_tables
Revises: 005_create_alert_tables
Create Date: 2025-01-25 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = '006_create_report_tables'
down_revision = '005_create_alert_tables'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create report management related tables"""
    
    # 创建报表模板表
    op.create_table('report_templates',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('name', sa.String(100), nullable=False, comment='模板名称'),
        sa.Column('description', sa.Text, comment='模板描述'),
        sa.Column('report_type', sa.String(20), nullable=False, comment='报表类型'),
        
        # 模板配置
        sa.Column('config', sa.JSON, nullable=False, comment='报表配置'),
        sa.Column('chart_configs', sa.JSON, comment='图表配置'),
        sa.Column('table_configs', sa.JSON, comment='表格配置'),
        
        # 样式配置
        sa.Column('theme', sa.String(50), default='default', comment='主题'),
        sa.Column('logo_url', sa.String(500), comment='Logo URL'),
        sa.Column('header_text', sa.Text, comment='页眉文本'),
        sa.Column('footer_text', sa.Text, comment='页脚文本'),
        
        sa.Column('is_default', sa.Boolean, default=False, comment='是否默认模板'),
        sa.Column('is_active', sa.Boolean, default=True, comment='是否启用'),
        sa.Column('created_by', sa.String(36), sa.ForeignKey('users.id', ondelete='SET NULL'), comment='创建人'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        
        # 添加约束
        sa.CheckConstraint("report_type IN ('inspection', 'performance', 'availability', 'alert', 'custom')", name='ck_report_templates_type'),
        comment='报表模板表'
    )
    
    # 创建报表调度表
    op.create_table('report_schedules',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('name', sa.String(100), nullable=False, comment='调度任务名称'),
        sa.Column('description', sa.Text, comment='调度任务描述'),
        sa.Column('template_id', sa.Integer, sa.ForeignKey('report_templates.id', ondelete='CASCADE'), nullable=False, comment='报表模板ID'),
        
        # 调度配置
        sa.Column('cron_expression', sa.String(100), nullable=False, comment='Cron表达式'),
        sa.Column('timezone', sa.String(50), default='Asia/Shanghai', comment='时区'),
        
        # 数据范围
        sa.Column('data_range', sa.JSON, comment='数据时间范围配置'),
        sa.Column('device_filters', sa.JSON, comment='设备过滤条件'),
        
        # 输出配置
        sa.Column('output_formats', sa.JSON, comment='输出格式列表'),
        sa.Column('recipients', sa.JSON, comment='接收人列表'),
        
        # 状态
        sa.Column('is_active', sa.Boolean, default=True, comment='是否启用'),
        sa.Column('last_run', sa.DateTime(timezone=True), comment='最后运行时间'),
        sa.Column('next_run', sa.DateTime(timezone=True), comment='下次运行时间'),
        
        # 统计信息
        sa.Column('total_runs', sa.Integer, default=0, comment='总运行次数'),
        sa.Column('successful_runs', sa.Integer, default=0, comment='成功运行次数'),
        sa.Column('failed_runs', sa.Integer, default=0, comment='失败运行次数'),
        
        sa.Column('created_by', sa.String(36), sa.ForeignKey('users.id', ondelete='SET NULL'), comment='创建人'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        comment='报表调度表'
    )
    
    # 创建报表表
    op.create_table('reports',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('template_id', sa.Integer, sa.ForeignKey('report_templates.id', ondelete='CASCADE'), nullable=False),
        sa.Column('schedule_id', sa.Integer, sa.ForeignKey('report_schedules.id', ondelete='SET NULL'), comment='调度任务ID'),
        
        # 基本信息
        sa.Column('title', sa.String(200), nullable=False, comment='报表标题'),
        sa.Column('description', sa.Text, comment='报表描述'),
        sa.Column('report_type', sa.String(20), nullable=False, comment='报表类型'),
        
        # 数据范围
        sa.Column('start_date', sa.DateTime(timezone=True), nullable=False, comment='开始日期'),
        sa.Column('end_date', sa.DateTime(timezone=True), nullable=False, comment='结束日期'),
        sa.Column('device_filters', sa.JSON, comment='设备过滤条件'),
        
        # 生成信息
        sa.Column('status', sa.String(20), default='pending', comment='生成状态'),
        sa.Column('generated_by', sa.String(36), sa.ForeignKey('users.id', ondelete='SET NULL'), comment='生成人'),
        sa.Column('generated_at', sa.DateTime(timezone=True), comment='生成时间'),
        
        # 文件信息
        sa.Column('file_formats', sa.JSON, comment='已生成的文件格式'),
        sa.Column('file_paths', sa.JSON, comment='文件路径映射'),
        sa.Column('file_sizes', sa.JSON, comment='文件大小映射'),
        
        # 统计信息
        sa.Column('total_devices', sa.Integer, default=0, comment='总设备数'),
        sa.Column('data_points', sa.Integer, default=0, comment='数据点数'),
        sa.Column('generation_time', sa.Integer, comment='生成耗时(秒)'),
        
        # 错误信息
        sa.Column('error_message', sa.Text, comment='错误消息'),
        sa.Column('error_details', sa.JSON, comment='错误详情'),
        
        # 访问控制
        sa.Column('is_public', sa.Boolean, default=False, comment='是否公开'),
        sa.Column('shared_users', sa.JSON, comment='共享用户ID列表'),
        
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        
        # 添加约束
        sa.CheckConstraint("report_type IN ('inspection', 'performance', 'availability', 'alert', 'custom')", name='ck_reports_type'),
        sa.CheckConstraint("status IN ('pending', 'generating', 'completed', 'failed')", name='ck_reports_status'),
        comment='报表表'
    )
    
    # 创建仪表板组件表
    op.create_table('dashboard_widgets',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('user_id', sa.String(36), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        
        # 组件信息
        sa.Column('widget_type', sa.String(50), nullable=False, comment='组件类型'),
        sa.Column('title', sa.String(100), nullable=False, comment='组件标题'),
        sa.Column('description', sa.Text, comment='组件描述'),
        
        # 布局信息
        sa.Column('position_x', sa.Integer, default=0, comment='X坐标'),
        sa.Column('position_y', sa.Integer, default=0, comment='Y坐标'),
        sa.Column('width', sa.Integer, default=6, comment='宽度'),
        sa.Column('height', sa.Integer, default=4, comment='高度'),
        
        # 配置信息
        sa.Column('data_source', sa.String(100), nullable=False, comment='数据源'),
        sa.Column('query_config', sa.JSON, comment='查询配置'),
        sa.Column('display_config', sa.JSON, comment='显示配置'),
        sa.Column('refresh_interval', sa.Integer, default=60, comment='刷新间隔(秒)'),
        
        # 状态
        sa.Column('is_active', sa.Boolean, default=True, comment='是否启用'),
        
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        
        # 添加约束
        sa.CheckConstraint("widget_type IN ('chart', 'metric', 'table', 'map', 'gauge', 'progress', 'alert_list', 'device_list')", name='ck_dashboard_widgets_type'),
        comment='仪表板组件表'
    )
    
    # 创建索引
    
    # 报表模板表索引
    op.create_index('idx_report_templates_name', 'report_templates', ['name'])
    op.create_index('idx_report_templates_type', 'report_templates', ['report_type'])
    op.create_index('idx_report_templates_is_active', 'report_templates', ['is_active'])
    op.create_index('idx_report_templates_is_default', 'report_templates', ['is_default'])
    op.create_index('idx_report_templates_created_by', 'report_templates', ['created_by'])
    
    # 报表调度表索引
    op.create_index('idx_report_schedules_name', 'report_schedules', ['name'])
    op.create_index('idx_report_schedules_template_id', 'report_schedules', ['template_id'])
    op.create_index('idx_report_schedules_is_active', 'report_schedules', ['is_active'])
    op.create_index('idx_report_schedules_next_run', 'report_schedules', ['next_run'])
    op.create_index('idx_report_schedules_last_run', 'report_schedules', ['last_run'])
    op.create_index('idx_report_schedules_created_by', 'report_schedules', ['created_by'])
    
    # 报表表索引
    op.create_index('idx_reports_template_id', 'reports', ['template_id'])
    op.create_index('idx_reports_schedule_id', 'reports', ['schedule_id'])
    op.create_index('idx_reports_title', 'reports', ['title'])
    op.create_index('idx_reports_type', 'reports', ['report_type'])
    op.create_index('idx_reports_status', 'reports', ['status'])
    op.create_index('idx_reports_generated_by', 'reports', ['generated_by'])
    op.create_index('idx_reports_generated_at', 'reports', ['generated_at'])
    op.create_index('idx_reports_start_date', 'reports', ['start_date'])
    op.create_index('idx_reports_end_date', 'reports', ['end_date'])
    op.create_index('idx_reports_created_at', 'reports', ['created_at'])
    op.create_index('idx_reports_is_public', 'reports', ['is_public'])
    op.create_index('idx_reports_type_status', 'reports', ['report_type', 'status'])
    
    # 仪表板组件表索引
    op.create_index('idx_dashboard_widgets_user_id', 'dashboard_widgets', ['user_id'])
    op.create_index('idx_dashboard_widgets_type', 'dashboard_widgets', ['widget_type'])
    op.create_index('idx_dashboard_widgets_title', 'dashboard_widgets', ['title'])
    op.create_index('idx_dashboard_widgets_data_source', 'dashboard_widgets', ['data_source'])
    op.create_index('idx_dashboard_widgets_is_active', 'dashboard_widgets', ['is_active'])
    op.create_index('idx_dashboard_widgets_position', 'dashboard_widgets', ['position_x', 'position_y'])
    op.create_index('idx_dashboard_widgets_user_active', 'dashboard_widgets', ['user_id', 'is_active'])


def downgrade() -> None:
    """Drop report management tables"""
    
    # 删除索引
    op.drop_index('idx_dashboard_widgets_user_active')
    op.drop_index('idx_dashboard_widgets_position')
    op.drop_index('idx_dashboard_widgets_is_active')
    op.drop_index('idx_dashboard_widgets_data_source')
    op.drop_index('idx_dashboard_widgets_title')
    op.drop_index('idx_dashboard_widgets_type')
    op.drop_index('idx_dashboard_widgets_user_id')
    op.drop_index('idx_reports_type_status')
    op.drop_index('idx_reports_is_public')
    op.drop_index('idx_reports_created_at')
    op.drop_index('idx_reports_end_date')
    op.drop_index('idx_reports_start_date')
    op.drop_index('idx_reports_generated_at')
    op.drop_index('idx_reports_generated_by')
    op.drop_index('idx_reports_status')
    op.drop_index('idx_reports_type')
    op.drop_index('idx_reports_title')
    op.drop_index('idx_reports_schedule_id')
    op.drop_index('idx_reports_template_id')
    op.drop_index('idx_report_schedules_created_by')
    op.drop_index('idx_report_schedules_last_run')
    op.drop_index('idx_report_schedules_next_run')
    op.drop_index('idx_report_schedules_is_active')
    op.drop_index('idx_report_schedules_template_id')
    op.drop_index('idx_report_schedules_name')
    op.drop_index('idx_report_templates_created_by')
    op.drop_index('idx_report_templates_is_default')
    op.drop_index('idx_report_templates_is_active')
    op.drop_index('idx_report_templates_type')
    op.drop_index('idx_report_templates_name')
    
    # 删除表
    op.drop_table('dashboard_widgets')
    op.drop_table('reports')
    op.drop_table('report_schedules')
    op.drop_table('report_templates')