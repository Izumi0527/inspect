#!/usr/bin/env python3
"""
测试日志收集功能

验证日志收集、解析、查询等功能是否正常工作
"""
import asyncio
import sys
import os
from datetime import datetime, timedelta

# 添加项目根目录到Python路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.ext.asyncio import AsyncSession
from src.core.database import get_db_session
from src.models.device import Device
from src.models.device_log import DeviceLog, LogParsingRule
from src.services.logging.log_service import LogService
from src.modules.devices.service import DeviceService
import structlog

logger = structlog.get_logger()


async def test_log_functionality():
    """测试日志功能"""
    print("🧪 开始测试日志收集功能...")
    
    try:
        # 初始化数据库
        from src.core.database import db_manager
        await db_manager.initialize()
        
        # 获取数据库会话
        async for session in get_db_session():
            log_service = LogService(session)
            device_service = DeviceService(session)
            
            print("📋 获取设备列表...")
            devices, total = await device_service.get_devices_paginated(
                page=1, page_size=10
            )
            
            if not devices:
                print("❌ 没有找到设备，无法测试日志功能")
                return False
            
            test_device = devices[0]
            print(f"使用测试设备: {test_device.name} ({test_device.ip_address})")
            
            # 测试1: 创建日志解析规则
            print("\n📝 测试创建日志解析规则...")
            rule_data = {
                "name": "系统错误日志规则",
                "pattern": r".*ERROR.*",
                "vendor": "generic",
                "device_type": "switch",
                "level_mapping": '{"ERROR": "error", "WARN": "warning"}',
                "facility_mapping": '{"system": "system"}',
                "description": "匹配系统错误日志",
                "is_active": True
            }
            
            rule = await log_service.create_parsing_rule(rule_data)
            print(f"✅ 创建解析规则成功: {rule['name']}")
            
            # 测试2: 创建测试日志记录
            print("\n📄 测试创建日志记录...")
            log_data = {
                "device_id": test_device.id,
                "content": "2026-01-05 23:40:00 ERROR: System failure detected",
                "log_level": "error",
                "facility": "system",
                "source": "ssh",
                "timestamp": datetime.now(),
                "parsed_data": {
                    "timestamp": "2026-01-05 23:40:00",
                    "level": "ERROR",
                    "message": "System failure detected"
                }
            }
            
            log_record = await log_service.create_log(log_data)
            print(f"✅ 创建日志记录成功: ID {log_record['id']}")
            
            # 测试3: 查询设备日志
            print(f"\n🔍 测试查询设备 {test_device.name} 的日志...")
            logs, log_total = await log_service.get_device_logs(
                device_id=test_device.id,
                skip=0,
                limit=10
            )
            
            print(f"找到 {log_total} 条日志记录")
            for log in logs[:3]:  # 显示前3条
                print(f"  日志 {log['id']}: {log['level']} - {log['message'][:50]}...")
            
            # 测试4: 搜索日志
            print("\n🔎 测试日志搜索功能...")
            search_logs, search_total = await log_service.search_logs(
                keyword="ERROR",
                skip=0,
                limit=10
            )
            
            print(f"搜索 'ERROR' 找到 {search_total} 条日志")
            
            # 测试5: 获取日志统计
            print("\n📊 测试日志统计功能...")
            stats = await log_service.get_log_statistics()
            print(f"日志统计: {stats}")
            
            # 清理测试数据
            print("\n🧹 清理测试数据...")
            await log_service.delete_log(log_record['id'])
            await log_service.delete_parsing_rule(rule['id'])
            await session.commit()
            
            print("✅ 日志功能测试完成!")
            return True
            
    except Exception as e:
        print(f"❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


async def main():
    """主函数"""
    success = await test_log_functionality()
    if success:
        print("\n🎉 日志功能测试通过!")
        sys.exit(0)
    else:
        print("\n💥 日志功能测试失败!")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())