#!/usr/bin/env python3
"""
测试数据初始化脚本
用于快速初始化开发和测试环境的设备数据
"""
import asyncio
import sys
import os
from pathlib import Path

# 添加项目根目录到Python路径
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

from src.core.database import get_db_session_context
from src.repositories.device_repository import DeviceRepository
from src.models.device import Device, DeviceGroup
from datetime import datetime, timezone
import structlog

logger = structlog.get_logger()

# 测试设备组数据
TEST_DEVICE_GROUPS = [
    {
        'name': '核心网络设备',
        'description': '核心路由器和交换机设备',
    },
    {
        'name': '接入层设备', 
        'description': '接入层交换机和无线AP设备',
    },
    {
        'name': '安全设备',
        'description': '防火墙、入侵检测等安全设备',
    },
    {
        'name': '服务器设备',
        'description': '应用服务器和数据库服务器',
    }
]

# 测试设备数据
TEST_DEVICES = [
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
        'group_name': '核心网络设备',
        'status': 'online',
        'snmp_community': 'public',
        'ssh_username': 'admin',
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
        'group_name': '核心网络设备',
        'status': 'online',
        'snmp_community': 'public',
        'ssh_username': 'admin',
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
        'group_name': '核心网络设备',
        'status': 'online',
        'snmp_community': 'public',
        'ssh_username': 'admin',
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
        'group_name': '接入层设备',
        'status': 'online',
        'snmp_community': 'public',
        'ssh_username': 'admin',
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
        'group_name': '接入层设备',
        'status': 'maintenance',
        'is_monitored': False,
        'snmp_community': 'public',
        'ssh_username': 'admin',
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
        'group_name': '接入层设备',
        'status': 'online',
        'snmp_community': 'public',
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
        'group_name': '接入层设备',
        'status': 'offline',
        'snmp_community': 'public',
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
        'group_name': '安全设备',
        'status': 'online',
        'snmp_community': 'public',
        'ssh_username': 'admin',
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
        'group_name': '安全设备',
        'status': 'online',
        'snmp_community': 'public',
        'ssh_username': 'admin',
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
        'group_name': '服务器设备',
        'status': 'online',
        'ssh_username': 'root',
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
        'group_name': '服务器设备',
        'status': 'online',
        'ssh_username': 'root',
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
        'group_name': '服务器设备',
        'status': 'online',
        'ssh_username': 'root',
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
        'group_name': '接入层设备',
        'status': 'offline',
        'is_active': False,
        'is_monitored': False,
        'snmp_community': 'public',
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
        'group_name': '核心网络设备',
        'status': 'unknown',
        'snmp_community': 'public',
        'ssh_username': 'admin',
    }
]


async def create_device_groups(session, device_repo):
    """创建设备组"""
    group_mapping = {}
    
    for group_data in TEST_DEVICE_GROUPS:
        # 检查是否已存在
        existing_groups, _ = await device_repo.get_device_groups_paginated(page=1, page_size=100)
        existing_group = next((g for g in existing_groups if g.name == group_data['name']), None)
        
        if existing_group:
            group_mapping[group_data['name']] = existing_group.id
            logger.info(f"设备组已存在: {group_data['name']}")
        else:
            # 创建新设备组
            device_group = DeviceGroup(
                name=group_data['name'],
                description=group_data['description'],
                is_active=True,
                created_at=datetime.now(timezone.utc),
                updated_at=datetime.now(timezone.utc)
            )
            session.add(device_group)
            await session.flush()  # 获取ID
            
            group_mapping[group_data['name']] = device_group.id
            logger.info(f"创建设备组: {group_data['name']}")
    
    return group_mapping


async def create_devices(session, device_repo, group_mapping):
    """创建测试设备"""
    created_devices = []
    
    for device_data in TEST_DEVICES:
        # 检查设备是否已存在
        existing_device = await device_repo.get_device_by_ip(device_data['ip_address'])
        
        if existing_device:
            logger.info(f"设备已存在: {device_data['name']} ({device_data['ip_address']})")
            continue
        
        # 获取设备组ID
        group_id = group_mapping.get(device_data['group_name'])
        
        # 创建设备对象
        device = Device(
            name=device_data['name'],
            ip_address=device_data['ip_address'],
            hostname=device_data.get('hostname'),
            device_type=device_data['device_type'],
            vendor=device_data['vendor'],
            model=device_data.get('model'),
            serial_number=device_data.get('serial_number'),
            location=device_data.get('location'),
            group_id=group_id,
            status=device_data.get('status', 'unknown'),
            is_active=device_data.get('is_active', True),
            is_monitored=device_data.get('is_monitored', True),
            snmp_community=device_data.get('snmp_community'),
            snmp_version=device_data.get('snmp_version', '2c'),
            snmp_port=device_data.get('snmp_port', 161),
            ssh_username=device_data.get('ssh_username'),
            ssh_port=device_data.get('ssh_port', 22),
            description=f"{device_data['device_type'].title()} 设备 - {device_data['vendor'].upper()} {device_data.get('model', 'Unknown')}",
            tags=[device_data['device_type'], device_data['vendor']],
            created_at=datetime.now(timezone.utc),
            updated_at=datetime.now(timezone.utc)
        )
        
        session.add(device)
        created_devices.append(device)
        logger.info(f"创建设备: {device_data['name']} ({device_data['ip_address']})")
    
    return created_devices


async def init_test_data():
    """初始化测试数据"""
    try:
        logger.info("开始初始化测试数据...")

        async with get_db_session_context() as session:
            device_repo = DeviceRepository(session)
            
            # 创建设备组
            logger.info("创建设备组...")
            group_mapping = await create_device_groups(session, device_repo)
            
            # 创建设备
            logger.info("创建测试设备...")
            created_devices = await create_devices(session, device_repo, group_mapping)
            
            # 提交事务
            await session.commit()
            
            logger.info(f"✅ 测试数据初始化完成!")
            logger.info(f"📦 创建了 {len(group_mapping)} 个设备组")
            logger.info(f"🖥️  创建了 {len(created_devices)} 个测试设备")
            
            # 显示设备统计
            devices, total_count = await device_repo.get_devices_paginated(page=1, page_size=1000)
            active_count = len([d for d in devices if d.is_active])
            monitored_count = len([d for d in devices if d.is_monitored])
            
            logger.info(f"📊 数据库统计: 总设备 {total_count}, 活跃 {active_count}, 监控中 {monitored_count}")
            
            return True
            
    except Exception as e:
        logger.error(f"❌ 测试数据初始化失败: {str(e)}")
        return False


async def clear_test_data():
    """清除测试数据"""
    try:
        logger.info("开始清除测试数据...")

        async with get_db_session_context() as session:
            device_repo = DeviceRepository(session)
            
            # 删除测试设备（根据IP地址范围识别）
            devices, _ = await device_repo.get_devices_paginated(page=1, page_size=1000)
            test_devices = [d for d in devices if d.ip_address.startswith('192.168.')]
            
            for device in test_devices:
                await session.delete(device)
                logger.info(f"删除设备: {device.name}")
            
            # 删除设备组
            groups, _ = await device_repo.get_device_groups_paginated(page=1, page_size=100)
            test_groups = [g for g in groups if g.name in [group['name'] for group in TEST_DEVICE_GROUPS]]
            
            for group in test_groups:
                await session.delete(group)
                logger.info(f"删除设备组: {group.name}")
            
            await session.commit()
            
            logger.info(f"✅ 测试数据清除完成!")
            logger.info(f"🗑️  删除了 {len(test_devices)} 个设备和 {len(test_groups)} 个设备组")
            
            return True
            
    except Exception as e:
        logger.error(f"❌ 测试数据清除失败: {str(e)}")
        return False


async def main():
    """主函数"""
    import argparse
    
    parser = argparse.ArgumentParser(description='测试数据初始化脚本')
    parser.add_argument('action', choices=['init', 'clear', 'reset'], 
                       help='操作类型: init=初始化, clear=清除, reset=重置(清除后初始化)')
    
    args = parser.parse_args()
    
    # 设置日志
    structlog.configure(
        processors=[
            structlog.stdlib.filter_by_level,
            structlog.stdlib.add_logger_name,
            structlog.stdlib.add_log_level,
            structlog.stdlib.PositionalArgumentsFormatter(),
            structlog.processors.TimeStamper(fmt="iso"),
            structlog.processors.StackInfoRenderer(),
            structlog.processors.format_exc_info,
            structlog.processors.UnicodeDecoder(),
            structlog.processors.JSONRenderer()
        ],
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        cache_logger_on_first_use=True,
    )
    
    success = True
    
    if args.action == 'clear':
        success = await clear_test_data()
    elif args.action == 'init':
        success = await init_test_data()
    elif args.action == 'reset':
        success = await clear_test_data()
        if success:
            success = await init_test_data()
    
    if success:
        logger.info("🎉 操作完成!")
        sys.exit(0)
    else:
        logger.error("💥 操作失败!")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())