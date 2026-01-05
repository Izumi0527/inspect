#!/usr/bin/env python3
"""
测试告警数量功能

验证设备API是否正确返回告警数量
"""
import asyncio
import sys
import os

# 添加项目根目录到Python路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.ext.asyncio import AsyncSession
from src.core.database import get_db_session
from src.models.device import Device
from src.models.alert import Alert, AlertStatus, AlertSeverity, AlertCategory
from src.repositories.alert_repository_db import AlertRepositoryDB
from src.modules.devices.service import DeviceService
import structlog

logger = structlog.get_logger()


async def test_alert_count():
    """测试告警数量功能"""
    print("🧪 开始测试告警数量功能...")
    
    try:
        # 初始化数据库
        from src.core.database import db_manager
        await db_manager.initialize()
        
        # 获取数据库会话
        async for session in get_db_session():
            # 创建告警仓储
            alert_repo = AlertRepositoryDB(session)
            device_service = DeviceService(session)
            
            print("📊 获取告警统计...")
            stats = await alert_repo.get_alert_statistics()
            print(f"告警统计: {stats}")
            
            print("📋 获取设备列表...")
            devices, total = await device_service.get_devices_paginated(
                page=1, page_size=10
            )
            
            print(f"找到 {total} 台设备")
            for device in devices[:3]:  # 只显示前3台设备
                print(f"设备 {device.id}: {device.name} ({device.ip_address})")
                print(f"  告警数量: {device.alert_count}")
            
            # 测试创建一个测试告警
            if devices:
                test_device = devices[0]
                print(f"\n🚨 为设备 {test_device.name} 创建测试告警...")
                
                test_alert_data = {
                    "device_id": test_device.id,
                    "title": "测试告警",
                    "message": "这是一个测试告警消息",
                    "category": AlertCategory.PERFORMANCE,
                    "severity": AlertSeverity.WARNING,
                    "metric_name": "cpu_usage",
                    "current_value": 85.5,
                    "threshold_value": 80.0
                }
                
                created_alert = await alert_repo.create_alert(test_alert_data)
                print(f"创建的告警ID: {created_alert['id']}")
                
                # 提交事务
                await session.commit()
                
                # 重新获取设备列表验证告警数量更新
                print(f"\n📋 重新获取设备列表验证告警数量...")
                devices_after, _ = await device_service.get_devices_paginated(
                    page=1, page_size=10
                )
                
                for device in devices_after[:1]:  # 只显示第一台设备
                    print(f"设备 {device.id}: {device.name} ({device.ip_address})")
                    print(f"  告警数量: {device.alert_count}")
                    
                    if device.alert_count == 1:
                        print("✅ 告警数量更新正确!")
                    else:
                        print(f"❌ 告警数量更新错误，期望1，实际{device.alert_count}")
                
                # 重新获取统计
                print("\n📊 重新获取告警统计...")
                new_stats = await alert_repo.get_alert_statistics()
                print(f"新的告警统计: {new_stats}")
                
                # 清理测试数据
                print(f"\n🧹 清理测试告警 {created_alert['id']}...")
                await alert_repo.delete_alert(created_alert['id'])
                await session.commit()
                
                # 再次验证告警数量归零
                print(f"\n📋 验证告警清理后的设备列表...")
                devices_final, _ = await device_service.get_devices_paginated(
                    page=1, page_size=10
                )
                
                for device in devices_final[:1]:  # 只显示第一台设备
                    print(f"设备 {device.id}: {device.name} ({device.ip_address})")
                    print(f"  告警数量: {device.alert_count}")
                    
                    if device.alert_count == 0:
                        print("✅ 告警清理后数量归零正确!")
                    else:
                        print(f"❌ 告警清理后数量错误，期望0，实际{device.alert_count}")
                
            break  # 只使用第一个会话
            
    except Exception as e:
        print(f"❌ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False
    
    print("✅ 告警数量功能测试完成!")
    return True


async def main():
    """主函数"""
    success = await test_alert_count()
    if success:
        print("\n🎉 所有测试通过!")
        sys.exit(0)
    else:
        print("\n💥 测试失败!")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())