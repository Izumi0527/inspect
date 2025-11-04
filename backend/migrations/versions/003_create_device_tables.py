"""Create device management tables

Revision ID: 003_create_device_tables
Revises: 002_insert_default_data
Create Date: 2025-01-25 11:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers
revision = '003_create_device_tables'
down_revision = '002_insert_default_data'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create device management related tables"""
    
    # 创建设备分组表
    op.create_table('device_groups',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('name', sa.String(100), nullable=False, unique=True, comment='分组名称'),
        sa.Column('description', sa.Text, comment='分组描述'),
        sa.Column('parent_id', sa.Integer, sa.ForeignKey('device_groups.id', ondelete='SET NULL'), comment='父分组ID'),
        sa.Column('color', sa.String(7), default='#3B82F6', comment='分组颜色'),
        sa.Column('sort_order', sa.Integer, default=0, comment='排序权重'),
        sa.Column('device_count', sa.Integer, default=0, comment='设备数量'),
        sa.Column('is_active', sa.Boolean, default=True, comment='是否启用'),
        sa.Column('created_by', sa.String(36), sa.ForeignKey('users.id', ondelete='SET NULL')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        comment='设备分组表'
    )
    
    # 创建设备表
    op.create_table('devices',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('name', sa.String(100), nullable=False, comment='设备名称'),
        sa.Column('ip_address', sa.String(45), nullable=False, unique=True, comment='IP地址'),
        sa.Column('hostname', sa.String(255), comment='主机名'),
        sa.Column('mac_address', sa.String(17), comment='MAC地址'),
        sa.Column('device_type', sa.String(20), nullable=False, default='other', comment='设备类型'),
        sa.Column('vendor', sa.String(20), nullable=False, default='other', comment='厂商'),
        sa.Column('model', sa.String(100), comment='设备型号'),
        sa.Column('serial_number', sa.String(100), comment='序列号'),
        sa.Column('firmware_version', sa.String(100), comment='固件版本'),
        sa.Column('location', sa.String(255), comment='物理位置'),
        sa.Column('group_id', sa.Integer, sa.ForeignKey('device_groups.id', ondelete='SET NULL'), comment='所属分组'),
        sa.Column('status', sa.String(20), nullable=False, default='unknown', comment='设备状态'),
        sa.Column('is_active', sa.Boolean, default=True, comment='是否启用'),
        sa.Column('is_monitored', sa.Boolean, default=True, comment='是否监控'),
        sa.Column('monitor_interval', sa.Integer, default=300, comment='监控间隔(秒)'),
        
        # SNMP配置
        sa.Column('snmp_enabled', sa.Boolean, default=False, comment='是否启用SNMP'),
        sa.Column('snmp_version', sa.String(3), default='2c', comment='SNMP版本'),
        sa.Column('snmp_community', sa.String(100), comment='SNMP团体名'),
        sa.Column('snmp_port', sa.Integer, default=161, comment='SNMP端口'),
        sa.Column('snmp_timeout', sa.Integer, default=10, comment='SNMP超时时间'),
        sa.Column('snmp_retries', sa.Integer, default=3, comment='SNMP重试次数'),
        
        # SSH/Telnet配置
        sa.Column('ssh_enabled', sa.Boolean, default=False, comment='是否启用SSH'),
        sa.Column('ssh_port', sa.Integer, default=22, comment='SSH端口'),
        sa.Column('ssh_username', sa.String(100), comment='SSH用户名'),
        sa.Column('ssh_password', sa.String(255), comment='SSH密码(加密存储)'),
        sa.Column('ssh_private_key', sa.Text, comment='SSH私钥'),
        sa.Column('ssh_timeout', sa.Integer, default=30, comment='SSH超时时间'),
        
        # 状态信息
        sa.Column('last_seen', sa.DateTime(timezone=True), comment='最后在线时间'),
        sa.Column('uptime', sa.BigInteger, comment='运行时间(秒)'),
        sa.Column('response_time', sa.Float, comment='响应时间(毫秒)'),
        sa.Column('cpu_usage', sa.Float, comment='CPU使用率'),
        sa.Column('memory_usage', sa.Float, comment='内存使用率'),
        sa.Column('disk_usage', sa.Float, comment='磁盘使用率'),
        sa.Column('temperature', sa.Float, comment='设备温度'),
        
        # 元数据
        sa.Column('description', sa.Text, comment='设备描述'),
        sa.Column('tags', sa.JSON, comment='设备标签'),
        sa.Column('custom_fields', sa.JSON, comment='自定义字段'),
        sa.Column('created_by', sa.String(36), sa.ForeignKey('users.id', ondelete='SET NULL')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        # 添加设备状态CHECK约束
        sa.CheckConstraint("status IN ('online', 'offline', 'unknown', 'maintenance', 'error')", name='ck_devices_status'),
        # 添加SNMP版本CHECK约束
        sa.CheckConstraint("snmp_version IN ('1', '2c', '3')", name='ck_devices_snmp_version'),
        comment='网络设备表'
    )
    
    # 创建设备接口表
    op.create_table('device_interfaces',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('device_id', sa.Integer, sa.ForeignKey('devices.id', ondelete='CASCADE'), nullable=False),
        sa.Column('name', sa.String(100), nullable=False, comment='接口名称'),
        sa.Column('alias', sa.String(255), comment='接口别名'),
        sa.Column('description', sa.String(255), comment='接口描述'),
        sa.Column('type', sa.String(50), comment='接口类型'),
        sa.Column('speed', sa.BigInteger, comment='接口速率(bps)'),
        sa.Column('mtu', sa.Integer, comment='最大传输单元'),
        sa.Column('mac_address', sa.String(17), comment='接口MAC地址'),
        sa.Column('ip_address', sa.String(45), comment='接口IP地址'),
        sa.Column('subnet_mask', sa.String(45), comment='子网掩码'),
        sa.Column('is_up', sa.Boolean, default=False, comment='接口是否UP'),
        sa.Column('admin_status', sa.String(20), default='down', comment='管理状态'),
        sa.Column('oper_status', sa.String(20), default='down', comment='操作状态'),
        sa.Column('in_octets', sa.BigInteger, default=0, comment='入流量字节数'),
        sa.Column('out_octets', sa.BigInteger, default=0, comment='出流量字节数'),
        sa.Column('in_errors', sa.BigInteger, default=0, comment='入错误包数'),
        sa.Column('out_errors', sa.BigInteger, default=0, comment='出错误包数'),
        sa.Column('last_updated', sa.DateTime(timezone=True), comment='最后更新时间'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.UniqueConstraint('device_id', 'name', name='uk_device_interface'),
        comment='设备接口表'
    )
    
    # 创建网络扫描表
    op.create_table('network_scans',
        sa.Column('id', sa.String(36), primary_key=True),
        sa.Column('name', sa.String(100), nullable=False, comment='扫描任务名称'),
        sa.Column('target_network', sa.String(100), nullable=False, comment='目标网络'),
        sa.Column('scan_type', sa.String(20), nullable=False, default='ping', comment='扫描类型'),
        sa.Column('status', sa.String(20), nullable=False, default='pending', comment='扫描状态'),
        sa.Column('progress', sa.Integer, default=0, comment='扫描进度(0-100)'),
        sa.Column('total_hosts', sa.Integer, default=0, comment='总主机数'),
        sa.Column('scanned_hosts', sa.Integer, default=0, comment='已扫描主机数'),
        sa.Column('alive_hosts', sa.Integer, default=0, comment='存活主机数'),
        sa.Column('devices_found', sa.Integer, default=0, comment='发现设备数'),
        
        # 扫描配置
        sa.Column('scan_ports', sa.JSON, comment='扫描端口列表'),
        sa.Column('snmp_communities', sa.JSON, comment='SNMP团体名列表'),
        sa.Column('timeout', sa.Integer, default=5, comment='超时时间(秒)'),
        sa.Column('max_threads', sa.Integer, default=50, comment='最大线程数'),
        sa.Column('ping_count', sa.Integer, default=1, comment='ping次数'),
        
        # 时间信息
        sa.Column('started_at', sa.DateTime(timezone=True), comment='开始时间'),
        sa.Column('completed_at', sa.DateTime(timezone=True), comment='完成时间'),
        sa.Column('duration', sa.Integer, comment='耗时(秒)'),
        
        # 结果信息
        sa.Column('result_summary', sa.JSON, comment='扫描结果摘要'),
        sa.Column('error_message', sa.Text, comment='错误信息'),
        sa.Column('log_data', sa.Text, comment='日志数据'),
        
        sa.Column('created_by', sa.String(36), sa.ForeignKey('users.id', ondelete='SET NULL')),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        # 添加扫描类型CHECK约束
        sa.CheckConstraint("scan_type IN ('ping', 'tcp', 'snmp', 'full', 'discovery')", name='ck_network_scans_scan_type'),
        # 添加扫描状态CHECK约束
        sa.CheckConstraint("status IN ('pending', 'running', 'completed', 'failed', 'cancelled')", name='ck_network_scans_status'),
        comment='网络扫描任务表'
    )
    
    # 创建发现设备表
    op.create_table('discovered_devices',
        sa.Column('id', sa.Integer, primary_key=True, autoincrement=True),
        sa.Column('scan_id', sa.String(36), sa.ForeignKey('network_scans.id', ondelete='CASCADE'), nullable=False),
        sa.Column('ip_address', sa.String(45), nullable=False, comment='IP地址'),
        sa.Column('hostname', sa.String(255), comment='主机名'),
        sa.Column('mac_address', sa.String(17), comment='MAC地址'),
        sa.Column('vendor', sa.String(100), comment='厂商信息'),
        sa.Column('device_type', sa.String(50), comment='设备类型'),
        sa.Column('os_info', sa.Text, comment='操作系统信息'),
        sa.Column('open_ports', sa.JSON, comment='开放端口列表'),
        sa.Column('services', sa.JSON, comment='服务信息'),
        sa.Column('snmp_info', sa.JSON, comment='SNMP信息'),
        sa.Column('response_time', sa.Float, comment='响应时间(毫秒)'),
        sa.Column('confidence', sa.Float, default=0.0, comment='识别置信度'),
        sa.Column('is_imported', sa.Boolean, default=False, comment='是否已导入'),
        sa.Column('imported_device_id', sa.Integer, sa.ForeignKey('devices.id', ondelete='SET NULL'), comment='导入后的设备ID'),
        sa.Column('discovered_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        sa.UniqueConstraint('scan_id', 'ip_address', name='uk_scan_device'),
        comment='发现的设备表'
    )
    
    # 创建设备性能指标表
    op.create_table('device_metrics',
        sa.Column('id', sa.BigInteger, primary_key=True, autoincrement=True),
        sa.Column('device_id', sa.Integer, sa.ForeignKey('devices.id', ondelete='CASCADE'), nullable=False),
        sa.Column('metric_name', sa.String(100), nullable=False, comment='指标名称'),
        sa.Column('metric_value', sa.Float, comment='指标值'),
        sa.Column('metric_unit', sa.String(20), comment='指标单位'),
        sa.Column('interface_name', sa.String(100), comment='关联接口名'),
        sa.Column('tags', sa.JSON, comment='标签信息'),
        sa.Column('collected_at', sa.DateTime(timezone=True), nullable=False, comment='采集时间'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('CURRENT_TIMESTAMP')),
        comment='设备性能指标表'
    )
    
    # 创建索引
    
    # 设备分组表索引
    op.create_index('idx_device_groups_parent_id', 'device_groups', ['parent_id'])
    op.create_index('idx_device_groups_name', 'device_groups', ['name'])
    op.create_index('idx_device_groups_is_active', 'device_groups', ['is_active'])
    
    # 设备表索引
    op.create_index('idx_devices_ip_address', 'devices', ['ip_address'])
    op.create_index('idx_devices_name', 'devices', ['name'])
    op.create_index('idx_devices_device_type', 'devices', ['device_type'])
    op.create_index('idx_devices_vendor', 'devices', ['vendor'])
    op.create_index('idx_devices_status', 'devices', ['status'])
    op.create_index('idx_devices_group_id', 'devices', ['group_id'])
    op.create_index('idx_devices_is_active', 'devices', ['is_active'])
    op.create_index('idx_devices_is_monitored', 'devices', ['is_monitored'])
    op.create_index('idx_devices_last_seen', 'devices', ['last_seen'])
    op.create_index('idx_devices_created_at', 'devices', ['created_at'])
    
    # 设备接口表索引
    op.create_index('idx_device_interfaces_device_id', 'device_interfaces', ['device_id'])
    op.create_index('idx_device_interfaces_name', 'device_interfaces', ['name'])
    op.create_index('idx_device_interfaces_is_up', 'device_interfaces', ['is_up'])
    op.create_index('idx_device_interfaces_last_updated', 'device_interfaces', ['last_updated'])
    
    # 网络扫描表索引
    op.create_index('idx_network_scans_status', 'network_scans', ['status'])
    op.create_index('idx_network_scans_scan_type', 'network_scans', ['scan_type'])
    op.create_index('idx_network_scans_created_at', 'network_scans', ['created_at'])
    op.create_index('idx_network_scans_started_at', 'network_scans', ['started_at'])
    op.create_index('idx_network_scans_created_by', 'network_scans', ['created_by'])
    
    # 发现设备表索引
    op.create_index('idx_discovered_devices_scan_id', 'discovered_devices', ['scan_id'])
    op.create_index('idx_discovered_devices_ip_address', 'discovered_devices', ['ip_address'])
    op.create_index('idx_discovered_devices_is_imported', 'discovered_devices', ['is_imported'])
    op.create_index('idx_discovered_devices_discovered_at', 'discovered_devices', ['discovered_at'])
    
    # 设备性能指标表索引
    op.create_index('idx_device_metrics_device_id', 'device_metrics', ['device_id'])
    op.create_index('idx_device_metrics_metric_name', 'device_metrics', ['metric_name'])
    op.create_index('idx_device_metrics_collected_at', 'device_metrics', ['collected_at'])
    op.create_index('idx_device_metrics_device_metric_time', 'device_metrics', ['device_id', 'metric_name', 'collected_at'])


def downgrade() -> None:
    """Drop device management tables"""
    
    # 删除索引
    op.drop_index('idx_device_metrics_device_metric_time')
    op.drop_index('idx_device_metrics_collected_at')
    op.drop_index('idx_device_metrics_metric_name')
    op.drop_index('idx_device_metrics_device_id')
    op.drop_index('idx_discovered_devices_discovered_at')
    op.drop_index('idx_discovered_devices_is_imported')
    op.drop_index('idx_discovered_devices_ip_address')
    op.drop_index('idx_discovered_devices_scan_id')
    op.drop_index('idx_network_scans_created_by')
    op.drop_index('idx_network_scans_started_at')
    op.drop_index('idx_network_scans_created_at')
    op.drop_index('idx_network_scans_scan_type')
    op.drop_index('idx_network_scans_status')
    op.drop_index('idx_device_interfaces_last_updated')
    op.drop_index('idx_device_interfaces_is_up')
    op.drop_index('idx_device_interfaces_name')
    op.drop_index('idx_device_interfaces_device_id')
    op.drop_index('idx_devices_created_at')
    op.drop_index('idx_devices_last_seen')
    op.drop_index('idx_devices_is_monitored')
    op.drop_index('idx_devices_is_active')
    op.drop_index('idx_devices_group_id')
    op.drop_index('idx_devices_status')
    op.drop_index('idx_devices_vendor')
    op.drop_index('idx_devices_device_type')
    op.drop_index('idx_devices_name')
    op.drop_index('idx_devices_ip_address')
    op.drop_index('idx_device_groups_is_active')
    op.drop_index('idx_device_groups_name')
    op.drop_index('idx_device_groups_parent_id')
    
    # 删除表
    op.drop_table('device_metrics')
    op.drop_table('discovered_devices')
    op.drop_table('network_scans')
    op.drop_table('device_interfaces')
    op.drop_table('devices')
    op.drop_table('device_groups')
    
    # 注意：由于我们使用VARCHAR + CHECK约束替代了枚举类型，
    # 因此不需要删除枚举类型