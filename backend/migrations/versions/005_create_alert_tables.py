"""Create alert management tables

Revision ID: 005_create_alert_tables
Revises: 004_create_inspection_tables
Create Date: 2025-01-25 12:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = '005_create_alert_tables'
down_revision = '004_create_inspection_tables'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create alert management related tables"""
    
    # 创建告警规则表
    op.create_table('alert_rules',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('name', sa.String(100), nullable=False, comment='规则名称'),
        sa.Column('description', sa.Text, comment='规则描述'),
        sa.Column('category', sa.String(20), nullable=False, comment='告警分类'),
        
        # 规则配置
        sa.Column('metric_name', sa.String(100), nullable=False, comment='监控指标名称'),
        sa.Column('operator', sa.String(20), nullable=False, comment='比较操作符'),
        sa.Column('threshold_value', sa.Float, nullable=False, comment='阈值'),
        sa.Column('duration', sa.Integer, default=300, comment='持续时间(秒)'),
        
        # 适用范围
        sa.Column('device_types', sa.JSON, comment='适用的设备类型'),
        sa.Column('device_groups', sa.JSON, comment='适用的设备组'),
        sa.Column('specific_devices', sa.JSON, comment='特定设备ID列表'),
        
        # 告警配置
        sa.Column('severity', sa.String(20), default='warning', comment='告警严重级别'),
        sa.Column('auto_resolve', sa.Boolean, default=True, comment='自动恢复'),
        sa.Column('notification_enabled', sa.Boolean, default=True, comment='启用通知'),
        sa.Column('escalation_time', sa.Integer, default=3600, comment='升级时间(秒)'),
        
        # 通知配置
        sa.Column('email_enabled', sa.Boolean, default=True, comment='启用邮件通知'),
        sa.Column('sms_enabled', sa.Boolean, default=False, comment='启用短信通知'),
        sa.Column('webhook_enabled', sa.Boolean, default=False, comment='启用Webhook通知'),
        sa.Column('webhook_url', sa.String(500), comment='Webhook URL'),
        
        sa.Column('is_active', sa.Boolean, default=True, comment='是否启用'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        
        # 添加约束
        sa.CheckConstraint("category IN ('connectivity', 'performance', 'security', 'configuration', 'hardware', 'other')", name='ck_alert_rules_category'),
        sa.CheckConstraint("operator IN ('>', '<', '=', '!=', '>=', '<=')", name='ck_alert_rules_operator'),
        sa.CheckConstraint("severity IN ('info', 'warning', 'critical', 'fatal')", name='ck_alert_rules_severity'),
        comment='告警规则表'
    )
    
    # 创建告警表
    op.create_table('alerts',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('device_id', sa.Integer, sa.ForeignKey('devices.id', ondelete='CASCADE'), nullable=False),
        sa.Column('rule_id', sa.Integer, sa.ForeignKey('alert_rules.id', ondelete='SET NULL'), comment='关联的告警规则ID'),
        
        # 告警信息
        sa.Column('title', sa.String(200), nullable=False, comment='告警标题'),
        sa.Column('message', sa.Text, nullable=False, comment='告警消息'),
        sa.Column('category', sa.String(20), nullable=False, comment='告警分类'),
        sa.Column('severity', sa.String(20), nullable=False, comment='告警严重级别'),
        sa.Column('status', sa.String(20), default='open', comment='告警状态'),
        
        # 指标信息
        sa.Column('metric_name', sa.String(100), comment='监控指标名称'),
        sa.Column('current_value', sa.Float, comment='当前值'),
        sa.Column('threshold_value', sa.Float, comment='阈值'),
        
        # 时间信息
        sa.Column('first_occurred', sa.DateTime(timezone=True), nullable=False, comment='首次发生时间'),
        sa.Column('last_occurred', sa.DateTime(timezone=True), nullable=False, comment='最后发生时间'),
        sa.Column('acknowledged_at', sa.DateTime(timezone=True), comment='确认时间'),
        sa.Column('resolved_at', sa.DateTime(timezone=True), comment='解决时间'),
        sa.Column('closed_at', sa.DateTime(timezone=True), comment='关闭时间'),
        
        # 处理信息
        sa.Column('acknowledged_by', sa.String(36), sa.ForeignKey('users.id', ondelete='SET NULL'), comment='确认人'),
        sa.Column('resolved_by', sa.String(36), sa.ForeignKey('users.id', ondelete='SET NULL'), comment='解决人'),
        sa.Column('resolution_note', sa.Text, comment='解决说明'),
        
        # 计数信息
        sa.Column('occurrence_count', sa.Integer, default=1, comment='发生次数'),
        sa.Column('notification_count', sa.Integer, default=0, comment='通知次数'),
        sa.Column('escalation_level', sa.Integer, default=0, comment='升级级别'),
        
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        
        # 添加约束
        sa.CheckConstraint("category IN ('connectivity', 'performance', 'security', 'configuration', 'hardware', 'other')", name='ck_alerts_category'),
        sa.CheckConstraint("severity IN ('info', 'warning', 'critical', 'fatal')", name='ck_alerts_severity'),
        sa.CheckConstraint("status IN ('open', 'acknowledged', 'resolved', 'closed')", name='ck_alerts_status'),
        comment='告警表'
    )
    
    # 创建告警通知表
    op.create_table('alert_notifications',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('alert_id', sa.Integer, sa.ForeignKey('alerts.id', ondelete='CASCADE'), nullable=False),
        
        # 通知信息
        sa.Column('notification_type', sa.String(20), nullable=False, comment='通知类型'),
        sa.Column('recipient', sa.String(200), nullable=False, comment='接收者'),
        sa.Column('subject', sa.String(200), comment='主题'),
        sa.Column('content', sa.Text, nullable=False, comment='通知内容'),
        
        # 状态信息
        sa.Column('status', sa.String(20), default='pending', comment='发送状态'),
        sa.Column('sent_at', sa.DateTime(timezone=True), comment='发送时间'),
        sa.Column('retry_count', sa.Integer, default=0, comment='重试次数'),
        sa.Column('error_message', sa.Text, comment='错误消息'),
        
        # 响应信息
        sa.Column('response_code', sa.String(20), comment='响应代码'),
        sa.Column('response_body', sa.Text, comment='响应内容'),
        
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        
        # 添加约束
        sa.CheckConstraint("notification_type IN ('email', 'sms', 'webhook', 'slack', 'dingtalk', 'wechat')", name='ck_alert_notifications_type'),
        sa.CheckConstraint("status IN ('pending', 'sent', 'failed', 'retry')", name='ck_alert_notifications_status'),
        comment='告警通知表'
    )
    
    # 创建维护窗口表
    op.create_table('maintenance_windows',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('name', sa.String(100), nullable=False, comment='维护窗口名称'),
        sa.Column('description', sa.Text, comment='维护窗口描述'),
        
        # 时间配置
        sa.Column('start_time', sa.DateTime(timezone=True), nullable=False, comment='开始时间'),
        sa.Column('end_time', sa.DateTime(timezone=True), nullable=False, comment='结束时间'),
        sa.Column('is_recurring', sa.Boolean, default=False, comment='是否循环'),
        sa.Column('recurrence_pattern', sa.String(100), comment='循环模式(Cron表达式)'),
        
        # 适用范围
        sa.Column('device_ids', sa.JSON, comment='设备ID列表'),
        sa.Column('device_groups', sa.JSON, comment='设备组ID列表'),
        sa.Column('alert_rules', sa.JSON, comment='告警规则ID列表'),
        
        # 状态
        sa.Column('is_active', sa.Boolean, default=True, comment='是否启用'),
        sa.Column('suppress_alerts', sa.Boolean, default=True, comment='抑制告警'),
        
        sa.Column('created_by', sa.String(36), sa.ForeignKey('users.id', ondelete='SET NULL'), comment='创建人'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        comment='维护窗口表'
    )
    
    # 创建索引
    
    # 告警规则表索引
    op.create_index('idx_alert_rules_name', 'alert_rules', ['name'])
    op.create_index('idx_alert_rules_category', 'alert_rules', ['category'])
    op.create_index('idx_alert_rules_metric_name', 'alert_rules', ['metric_name'])
    op.create_index('idx_alert_rules_is_active', 'alert_rules', ['is_active'])
    op.create_index('idx_alert_rules_severity', 'alert_rules', ['severity'])
    
    # 告警表索引
    op.create_index('idx_alerts_device_id', 'alerts', ['device_id'])
    op.create_index('idx_alerts_rule_id', 'alerts', ['rule_id'])
    op.create_index('idx_alerts_status', 'alerts', ['status'])
    op.create_index('idx_alerts_severity', 'alerts', ['severity'])
    op.create_index('idx_alerts_category', 'alerts', ['category'])
    op.create_index('idx_alerts_first_occurred', 'alerts', ['first_occurred'])
    op.create_index('idx_alerts_last_occurred', 'alerts', ['last_occurred'])
    op.create_index('idx_alerts_acknowledged_at', 'alerts', ['acknowledged_at'])
    op.create_index('idx_alerts_resolved_at', 'alerts', ['resolved_at'])
    op.create_index('idx_alerts_created_at', 'alerts', ['created_at'])
    op.create_index('idx_alerts_device_status', 'alerts', ['device_id', 'status'])
    op.create_index('idx_alerts_severity_status', 'alerts', ['severity', 'status'])
    
    # 告警通知表索引
    op.create_index('idx_alert_notifications_alert_id', 'alert_notifications', ['alert_id'])
    op.create_index('idx_alert_notifications_type', 'alert_notifications', ['notification_type'])
    op.create_index('idx_alert_notifications_status', 'alert_notifications', ['status'])
    op.create_index('idx_alert_notifications_recipient', 'alert_notifications', ['recipient'])
    op.create_index('idx_alert_notifications_sent_at', 'alert_notifications', ['sent_at'])
    op.create_index('idx_alert_notifications_created_at', 'alert_notifications', ['created_at'])
    
    # 维护窗口表索引
    op.create_index('idx_maintenance_windows_name', 'maintenance_windows', ['name'])
    op.create_index('idx_maintenance_windows_start_time', 'maintenance_windows', ['start_time'])
    op.create_index('idx_maintenance_windows_end_time', 'maintenance_windows', ['end_time'])
    op.create_index('idx_maintenance_windows_is_active', 'maintenance_windows', ['is_active'])
    op.create_index('idx_maintenance_windows_is_recurring', 'maintenance_windows', ['is_recurring'])
    op.create_index('idx_maintenance_windows_created_by', 'maintenance_windows', ['created_by'])


def downgrade() -> None:
    """Drop alert management tables"""
    
    # 删除索引
    op.drop_index('idx_maintenance_windows_created_by')
    op.drop_index('idx_maintenance_windows_is_recurring')
    op.drop_index('idx_maintenance_windows_is_active')
    op.drop_index('idx_maintenance_windows_end_time')
    op.drop_index('idx_maintenance_windows_start_time')
    op.drop_index('idx_maintenance_windows_name')
    op.drop_index('idx_alert_notifications_created_at')
    op.drop_index('idx_alert_notifications_sent_at')
    op.drop_index('idx_alert_notifications_recipient')
    op.drop_index('idx_alert_notifications_status')
    op.drop_index('idx_alert_notifications_type')
    op.drop_index('idx_alert_notifications_alert_id')
    op.drop_index('idx_alerts_severity_status')
    op.drop_index('idx_alerts_device_status')
    op.drop_index('idx_alerts_created_at')
    op.drop_index('idx_alerts_resolved_at')
    op.drop_index('idx_alerts_acknowledged_at')
    op.drop_index('idx_alerts_last_occurred')
    op.drop_index('idx_alerts_first_occurred')
    op.drop_index('idx_alerts_category')
    op.drop_index('idx_alerts_severity')
    op.drop_index('idx_alerts_status')
    op.drop_index('idx_alerts_rule_id')
    op.drop_index('idx_alerts_device_id')
    op.drop_index('idx_alert_rules_severity')
    op.drop_index('idx_alert_rules_is_active')
    op.drop_index('idx_alert_rules_metric_name')
    op.drop_index('idx_alert_rules_category')
    op.drop_index('idx_alert_rules_name')
    
    # 删除表
    op.drop_table('maintenance_windows')
    op.drop_table('alert_notifications')
    op.drop_table('alerts')
    op.drop_table('alert_rules')