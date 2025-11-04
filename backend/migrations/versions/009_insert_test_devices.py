"""Insert test devices and device groups data

Revision ID: 009_insert_test_devices
Revises: 008_create_user_roles_table
Create Date: 2025-09-12 00:30:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import text
from datetime import datetime
import json

# revision identifiers
revision = '009_insert_test_devices'
down_revision = '008_create_user_roles_table'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Insert test device groups and devices"""
    
    connection = op.get_bind()
    current_time = datetime.utcnow()
    
    # 插入设备组
    device_groups_data = [
        {
            'id': 1,
            'name': '核心网络设备',
            'description': '核心路由器和交换机设备',
            'is_active': True,
            'created_at': current_time,
            'updated_at': current_time
        },
        {
            'id': 2,
            'name': '接入层设备',
            'description': '接入层交换机和无线AP设备',
            'is_active': True,
            'created_at': current_time,
            'updated_at': current_time
        },
        {
            'id': 3,
            'name': '安全设备',
            'description': '防火墙、入侵检测等安全设备',
            'is_active': True,
            'created_at': current_time,
            'updated_at': current_time
        },
        {
            'id': 4,
            'name': '服务器设备',
            'description': '应用服务器和数据库服务器',
            'is_active': True,
            'created_at': current_time,
            'updated_at': current_time
        }
    ]
    
    connection.execute(
        text("""
        INSERT INTO device_groups (id, name, description, is_active, created_at, updated_at)
        VALUES (:id, :name, :description, :is_active, :created_at, :updated_at)
        """),
        device_groups_data
    )
    
    # 插入测试设备
    test_devices = [
        # 核心网络设备
        {
            'name': 'Core-Router-01',
            'ip_address': '192.168.1.1',
            'hostname': 'core-rt-01.example.com',
            'device_type': 'router',
            'vendor': 'cisco',
            'model': 'ISR4431',
            'serial_number': 'FTX2104A1B2',
            'location': '机房A-核心区',
            'group_id': 1,
            'status': 'offline',
            'is_active': True,
            'is_monitored': False,
            'snmp_version': '2c',
            'snmp_community': None,
            'snmp_port': 161,
            'ssh_port': 22,
            'ssh_username': None,
            'monitor_interval': 300,
            'created_at': current_time,
            'updated_at': current_time
        },
        {
            'name': 'Core-Switch-01',
            'ip_address': '192.168.1.2',
            'hostname': 'core-sw-01.example.com',
            'device_type': 'switch',
            'vendor': 'cisco',
            'model': 'Catalyst-9500',
            'serial_number': 'FCW2140L0GZ',
            'location': '机房A-核心区',
            'group_id': 1,
            'status': 'maintenance',
            'is_active': True,
            'is_monitored': False,
            'snmp_version': '2c',
            'snmp_community': None,
            'snmp_port': 161,
            'ssh_port': 22,
            'ssh_username': None,
            'monitor_interval': 300,
            'created_at': current_time,
            'updated_at': current_time
        },
        {
            'name': 'Core-Switch-02',
            'ip_address': '192.168.1.3',
            'hostname': 'core-sw-02.example.com',
            'device_type': 'switch',
            'vendor': 'huawei',
            'model': 'S6720-54C-EI-48S-AC',
            'serial_number': '2102350BWL10GE000123',
            'location': '机房A-核心区',
            'group_id': 1,
            'status': 'offline',
            'is_active': True,
            'is_monitored': False,
            'snmp_version': '2c',
            'snmp_community': None,
            'snmp_port': 161,
            'ssh_port': 22,
            'ssh_username': None,
            'monitor_interval': 300,
            'created_at': current_time,
            'updated_at': current_time
        },
        
        # 接入层设备
        {
            'name': 'Access-Switch-01',
            'ip_address': '192.168.2.10',
            'hostname': 'access-sw-01.example.com',
            'device_type': 'switch',
            'vendor': 'h3c',
            'model': 'S5560S-EI',
            'serial_number': '210235A28WL19000001',
            'location': '办公区A-1楼',
            'group_id': 2,
            'status': 'offline',
            'is_active': True,
            'is_monitored': False,
            'snmp_version': '2c',
            'snmp_community': None,
            'snmp_port': 161,
            'ssh_port': 22,
            'ssh_username': None,
            'monitor_interval': 300,
            'created_at': current_time,
            'updated_at': current_time
        },
        {
            'name': 'Access-Switch-02',
            'ip_address': '192.168.2.11',
            'hostname': 'access-sw-02.example.com',
            'device_type': 'switch',
            'vendor': 'h3c',
            'model': 'S5560S-EI',
            'serial_number': '210235A28WL19000002',
            'location': '办公区A-2楼',
            'group_id': 2,
            'status': 'maintenance',
            'is_active': True,
            'is_monitored': False,
            'snmp_version': '2c',
            'snmp_community': None,
            'snmp_port': 161,
            'ssh_port': 22,
            'ssh_username': None,
            'monitor_interval': 300,
            'created_at': current_time,
            'updated_at': current_time
        },
        {
            'name': 'WiFi-AP-01',
            'ip_address': '192.168.3.50',
            'hostname': 'wifi-ap-01.example.com',
            'device_type': 'ap',
            'vendor': 'cisco',
            'model': 'AIR-CAP3702I-C-K9',
            'serial_number': 'FGL214800CV',
            'location': '办公区A-会议室',
            'group_id': 2,
            'status': 'offline',
            'is_active': True,
            'is_monitored': False,
            'snmp_version': '2c',
            'snmp_community': None,
            'snmp_port': 161,
            'monitor_interval': 600,
            'created_at': current_time,
            'updated_at': current_time
        },
        {
            'name': 'WiFi-AP-02',
            'ip_address': '192.168.3.51',
            'hostname': 'wifi-ap-02.example.com',
            'device_type': 'ap',
            'vendor': 'cisco',
            'model': 'AIR-CAP3702I-C-K9',
            'serial_number': 'FGL214800CW',
            'location': '办公区B-开放区',
            'group_id': 2,
            'status': 'offline',
            'is_active': True,
            'is_monitored': False,
            'snmp_version': '2c',
            'snmp_community': None,
            'snmp_port': 161,
            'monitor_interval': 600,
            'created_at': current_time,
            'updated_at': current_time
        },
        
        # 安全设备
        {
            'name': 'Firewall-01',
            'ip_address': '192.168.1.254',
            'hostname': 'fw-01.example.com',
            'device_type': 'firewall',
            'vendor': 'fortinet',
            'model': 'FortiGate-600E',
            'serial_number': 'FG600E0000000001',
            'location': '机房A-边界区',
            'group_id': 3,
            'status': 'offline',
            'is_active': True,
            'is_monitored': False,
            'snmp_version': '2c',
            'snmp_community': None,
            'snmp_port': 161,
            'ssh_port': 22,
            'ssh_username': None,
            'monitor_interval': 300,
            'created_at': current_time,
            'updated_at': current_time
        },
        {
            'name': 'Firewall-02',
            'ip_address': '192.168.1.253',
            'hostname': 'fw-02.example.com',
            'device_type': 'firewall',
            'vendor': 'checkpoint',
            'model': '15600',
            'serial_number': 'CPAP15600000001',
            'location': '机房B-边界区',
            'group_id': 3,
            'status': 'maintenance',
            'is_active': True,
            'is_monitored': False,
            'snmp_version': '2c',
            'snmp_community': None,
            'snmp_port': 161,
            'ssh_port': 22,
            'ssh_username': None,
            'monitor_interval': 300,
            'created_at': current_time,
            'updated_at': current_time
        },
        
        # 服务器设备
        {
            'name': 'Web-Server-01',
            'ip_address': '192.168.10.10',
            'hostname': 'web-01.example.com',
            'device_type': 'server',
            'vendor': 'dell',
            'model': 'PowerEdge R740',
            'serial_number': 'BVCR742',
            'location': '机房A-服务器区',
            'group_id': 4,
            'status': 'offline',
            'is_active': True,
            'is_monitored': False,
            'ssh_port': 22,
            'ssh_username': None,
            'monitor_interval': 300,
            'created_at': current_time,
            'updated_at': current_time
        },
        {
            'name': 'Web-Server-02',
            'ip_address': '192.168.10.11',
            'hostname': 'web-02.example.com',
            'device_type': 'server',
            'vendor': 'hp',
            'model': 'ProLiant DL380 Gen10',
            'serial_number': 'CZ220302G8',
            'location': '机房A-服务器区',
            'group_id': 4,
            'status': 'maintenance',
            'is_active': True,
            'is_monitored': False,
            'ssh_port': 22,
            'ssh_username': None,
            'monitor_interval': 300,
            'created_at': current_time,
            'updated_at': current_time
        },
        {
            'name': 'DB-Server-01',
            'ip_address': '192.168.10.20',
            'hostname': 'db-01.example.com',
            'device_type': 'server',
            'vendor': 'dell',
            'model': 'PowerEdge R750',
            'serial_number': 'BVCR750',
            'location': '机房A-数据库区',
            'group_id': 4,
            'status': 'offline',
            'is_active': True,
            'is_monitored': False,
            'ssh_port': 22,
            'ssh_username': None,
            'monitor_interval': 300,
            'created_at': current_time,
            'updated_at': current_time
        },
        
        # 测试离线设备
        {
            'name': 'Old-Switch-01',
            'ip_address': '192.168.99.1',
            'hostname': 'old-sw-01.example.com',
            'device_type': 'switch',
            'vendor': 'cisco',
            'model': 'Catalyst-2960',
            'serial_number': 'FOC1243A456',
            'location': '仓库区',
            'group_id': 2,
            'status': 'offline',
            'is_active': False,
            'is_monitored': False,
            'snmp_version': '2c',
            'snmp_community': None,
            'snmp_port': 161,
            'monitor_interval': 600,
            'created_at': current_time,
            'updated_at': current_time
        },
        {
            'name': 'Backup-Router-01',
            'ip_address': '192.168.99.2',
            'hostname': 'backup-rt-01.example.com',
            'device_type': 'router',
            'vendor': 'huawei',
            'model': 'AR2220E',
            'serial_number': '2102311ABCD1234',
            'location': '机房B-备用区',
            'group_id': 1,
            'status': 'unknown',
            'is_active': True,
            'is_monitored': False,
            'snmp_version': '2c',
            'snmp_community': None,
            'snmp_port': 161,
            'ssh_port': 22,
            'ssh_username': None,
            'monitor_interval': 900,
            'created_at': current_time,
            'updated_at': current_time
        }
    ]
    
    # 为每个设备添加默认字段值，确保与数据库表结构完全匹配
    for device in test_devices:
        # SNMP配置默认值
        if 'snmp_enabled' not in device:
            device['snmp_enabled'] = device.get('snmp_community') is not None
        if 'snmp_timeout' not in device:
            device['snmp_timeout'] = 10
        if 'snmp_retries' not in device:
            device['snmp_retries'] = 3
        if 'snmp_port' not in device:
            device['snmp_port'] = 161
        if 'snmp_version' not in device:
            device['snmp_version'] = '2c'
        if 'snmp_community' not in device:
            device['snmp_community'] = None
            
        # SSH配置默认值
        if 'ssh_enabled' not in device:
            device['ssh_enabled'] = device.get('ssh_username') is not None
        if 'ssh_port' not in device:
            device['ssh_port'] = 22
        if 'ssh_timeout' not in device:
            device['ssh_timeout'] = 30
        if 'ssh_username' not in device:
            device['ssh_username'] = None
        if 'ssh_password' not in device:
            device['ssh_password'] = None
        if 'ssh_private_key' not in device:
            device['ssh_private_key'] = None
            
        # 设备信息默认值
        if 'mac_address' not in device:
            device['mac_address'] = None
        if 'firmware_version' not in device:
            device['firmware_version'] = None
        if 'description' not in device:
            device['description'] = f"{device['device_type'].title()} 设备 - {device['vendor'].upper()} {device.get('model', 'Unknown')}"
        if 'tags' not in device:
            device['tags'] = [device['device_type'], device['vendor']]
        if 'custom_fields' not in device:
            device['custom_fields'] = {}
        if 'created_by' not in device:
            device['created_by'] = None
            
        # 监控状态默认值
        if 'monitor_interval' not in device:
            device['monitor_interval'] = 300
        if 'is_active' not in device:
            device['is_active'] = True
        if 'is_monitored' not in device:
            device['is_monitored'] = True
            
        # 性能指标默认值
        if 'last_seen' not in device:
            device['last_seen'] = None
        if 'uptime' not in device:
            device['uptime'] = None
        if 'response_time' not in device:
            device['response_time'] = None
        if 'cpu_usage' not in device:
            device['cpu_usage'] = None
        if 'memory_usage' not in device:
            device['memory_usage'] = None
        if 'disk_usage' not in device:
            device['disk_usage'] = None
        if 'temperature' not in device:
            device['temperature'] = None
            
        # 将字典类型字段转换为JSON字符串
        if isinstance(device['tags'], list):
            device['tags'] = json.dumps(device['tags'])
        if isinstance(device['custom_fields'], dict):
            device['custom_fields'] = json.dumps(device['custom_fields'])
    
    # 批量插入设备数据
    connection.execute(
        text("""
        INSERT INTO devices (
            name, ip_address, hostname, device_type, vendor, model, serial_number, 
            location, group_id, status, is_active, is_monitored, monitor_interval,
            snmp_enabled, snmp_version, snmp_community, snmp_port, snmp_timeout, snmp_retries,
            ssh_enabled, ssh_port, ssh_username, ssh_password, ssh_private_key, ssh_timeout,
            mac_address, firmware_version, last_seen, uptime, response_time, 
            cpu_usage, memory_usage, disk_usage, temperature,
            description, tags, custom_fields, created_by, created_at, updated_at
        ) VALUES (
            :name, :ip_address, :hostname, :device_type, :vendor, :model, :serial_number,
            :location, :group_id, :status, :is_active, :is_monitored, :monitor_interval,
            :snmp_enabled, :snmp_version, :snmp_community, :snmp_port, :snmp_timeout, :snmp_retries,
            :ssh_enabled, :ssh_port, :ssh_username, :ssh_password, :ssh_private_key, :ssh_timeout,
            :mac_address, :firmware_version, :last_seen, :uptime, :response_time,
            :cpu_usage, :memory_usage, :disk_usage, :temperature,
            :description, :tags, :custom_fields, :created_by, :created_at, :updated_at
        )
        """),
        test_devices
    )
    
    print(f"Successfully inserted {len(device_groups_data)} device groups and {len(test_devices)} test devices")


def downgrade() -> None:
    """Remove test devices and device groups"""
    
    connection = op.get_bind()
    
    # 删除测试设备（根据IP地址范围识别测试数据）
    connection.execute(text("""
        DELETE FROM devices WHERE 
        ip_address LIKE '192.168.%' OR
        name LIKE '%Test%' OR
        name LIKE '%Demo%' OR
        description LIKE '%测试%'
    """))
    
    # 删除设备组
    connection.execute(text("DELETE FROM device_groups WHERE id IN (1, 2, 3, 4)"))
    
    print("Test devices and device groups data cleared")