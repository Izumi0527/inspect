#!/usr/bin/env python3
"""
实施状态测试

验证三阶段实施计划的完成情况
"""
import asyncio
import sys
import os
from datetime import datetime

# 添加项目根目录到Python路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.ext.asyncio import AsyncSession
from src.core.database import get_db_session
from src.models.device import Device
from src.models.device_log import DeviceLog, LogParsingRule
from src.models.alert import Alert, AlertStatus, AlertSeverity, AlertCategory
from src.services.logging.log_service import LogService
from src.modules.devices.service import DeviceService
from src.repositories.alert_repository_db import AlertRepositoryDB
import structlog

logger = structlog.get_logger()


async def test_phase1_alert_count():
    """测试阶段1：告警数量显示功能"""
    print("🔍 阶段1测试：告警数量显示功能")
    
    try:
        async for session in get_db_session():
            device_service = DeviceService(session)
            alert_repo = AlertRepositoryDB(session)
            
            # 获取设备列表
            devices, total = await device_service.get_devices_paginated(page=1, page_size=5)
            if not devices:
                print("❌ 没有设备数据")
                return False
            
            test_device = devices[0]
            print(f"  使用测试设备: {test_device.name}")
            
            # 检查告警数量字段
            if hasattr(test_device, 'alert_count'):
                print(f"  ✅ 设备包含告警数量字段: {test_device.alert_count}")
            else:
                print("  ❌ 设备缺少告警数量字段")
                return False
            
            # 创建测试告警
            alert_data = {
                "device_id": test_device.id,
                "title": "阶段1测试告警",
                "message": "测试告警数量功能",
                "category": AlertCategory.PERFORMANCE,
                "severity": AlertSeverity.WARNING,
                "metric_name": "test_metric",
                "current_value": 90.0,
                "threshold_value": 80.0
            }
            
            alert = await alert_repo.create_alert(alert_data)
            print(f"  ✅ 创建测试告警: ID {alert['id']}")
            
            # 重新获取设备验证告警数量
            devices_after, _ = await device_service.get_devices_paginated(page=1, page_size=5)
            test_device_after = next(d for d in devices_after if d.id == test_device.id)
            
            if test_device_after.alert_count == 1:
                print("  ✅ 告警数量正确更新为1")
            else:
                print(f"  ❌ 告警数量更新错误: {test_device_after.alert_count}")
                return False
            
            # 清理测试数据
            await alert_repo.delete_alert(alert['id'])
            await session.commit()
            
            print("  ✅ 阶段1测试通过")
            return True
            
    except Exception as e:
        print(f"  ❌ 阶段1测试失败: {e}")
        return False


async def test_phase2_log_collection():
    """测试阶段2：基础日志收集功能"""
    print("\n🔍 阶段2测试：基础日志收集功能")
    
    try:
        async for session in get_db_session():
            log_service = LogService(session)
            device_service = DeviceService(session)
            
            # 获取设备
            devices, _ = await device_service.get_devices_paginated(page=1, page_size=5)
            if not devices:
                print("  ❌ 没有设备数据")
                return False
            
            test_device = devices[0]
            print(f"  使用测试设备: {test_device.name}")
            
            # 测试日志解析规则创建
            rule_data = {
                "name": "阶段2测试规则",
                "pattern": r".*TEST.*",
                "vendor": "generic",
                "description": "阶段2测试规则"
            }
            
            rule = await log_service.create_parsing_rule(rule_data)
            print(f"  ✅ 创建日志解析规则: {rule['name']}")
            
            # 测试日志记录创建
            log_data = {
                "device_id": test_device.id,
                "content": "2026-01-05 TEST: Phase 2 log test",
                "log_level": "info",
                "facility": "system",
                "source": "ssh",
                "timestamp": datetime.now()
            }
            
            log_record = await log_service.create_log(log_data)
            print(f"  ✅ 创建日志记录: ID {log_record['id']}")
            
            # 测试日志查询
            logs, total = await log_service.get_device_logs(
                device_id=test_device.id,
                skip=0,
                limit=10
            )
            
            if total > 0:
                print(f"  ✅ 日志查询成功: 找到 {total} 条日志")
            else:
                print("  ❌ 日志查询失败")
                return False
            
            # 测试日志搜索
            search_logs, search_total = await log_service.search_logs(
                keyword="TEST",
                skip=0,
                limit=10
            )
            
            if search_total > 0:
                print(f"  ✅ 日志搜索成功: 找到 {search_total} 条匹配日志")
            else:
                print("  ❌ 日志搜索失败")
                return False
            
            # 测试日志统计
            stats = await log_service.get_log_statistics()
            if stats and stats.get('total_logs', 0) > 0:
                print(f"  ✅ 日志统计成功: 总计 {stats['total_logs']} 条日志")
            else:
                print("  ❌ 日志统计失败")
                return False
            
            # 清理测试数据
            await log_service.delete_log(log_record['id'])
            await log_service.delete_parsing_rule(rule['id'])
            await session.commit()
            
            print("  ✅ 阶段2测试通过")
            return True
            
    except Exception as e:
        print(f"  ❌ 阶段2测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def test_phase3_advanced_features():
    """测试阶段3：高级功能（检查是否已实现）"""
    print("\n🔍 阶段3检查：高级功能实现状态")
    
    # 检查Syslog服务器
    try:
        from src.services.logging.syslog_server import SyslogServer
        print("  ✅ Syslog服务器模块存在")
        syslog_implemented = True
    except ImportError:
        print("  ❌ Syslog服务器模块未实现")
        syslog_implemented = False
    
    # 检查SNMP Trap接收器
    try:
        from src.services.monitoring.snmp_trap_receiver import SNMPTrapReceiver
        print("  ✅ SNMP Trap接收器模块存在")
        trap_implemented = True
    except ImportError:
        print("  ❌ SNMP Trap接收器模块未实现")
        trap_implemented = False
    
    # 检查日志分析功能
    try:
        from src.services.logging.log_analyzer import LogAnalyzer
        print("  ✅ 日志分析器模块存在")
        analyzer_implemented = True
    except ImportError:
        print("  ❌ 日志分析器模块未实现")
        analyzer_implemented = False
    
    # 检查告警通知系统
    try:
        from src.services.notifications.notification_service import NotificationService
        print("  ✅ 告警通知服务模块存在")
        notification_implemented = True
    except ImportError:
        print("  ❌ 告警通知服务模块未实现")
        notification_implemented = False
    
    if syslog_implemented or trap_implemented or analyzer_implemented or notification_implemented:
        print("  ⚠️  阶段3部分功能已实现")
        return True
    else:
        print("  ❌ 阶段3功能尚未开始实现")
        return False


async def main():
    """主函数"""
    print("🧪 开始实施状态综合测试...")
    
    # 初始化数据库
    try:
        from src.core.database import db_manager
        await db_manager.initialize()
    except Exception as e:
        print(f"❌ 数据库初始化失败: {e}")
        return
    
    # 测试各阶段
    phase1_result = await test_phase1_alert_count()
    phase2_result = await test_phase2_log_collection()
    phase3_result = test_phase3_advanced_features()
    
    # 总结
    print("\n" + "="*50)
    print("📋 实施状态总结:")
    print(f"  阶段1 (告警数量显示): {'✅ 完成' if phase1_result else '❌ 未完成'}")
    print(f"  阶段2 (基础日志收集): {'✅ 完成' if phase2_result else '❌ 未完成'}")
    print(f"  阶段3 (高级功能): {'⚠️ 部分完成' if phase3_result else '❌ 未开始'}")
    
    completed_phases = sum([phase1_result, phase2_result])
    total_phases = 2  # 只计算前两个阶段，因为阶段3是长期目标
    
    print(f"\n🎯 总体进度: {completed_phases}/{total_phases} 阶段完成 ({completed_phases/total_phases*100:.0f}%)")
    
    if completed_phases == total_phases:
        print("🎉 核心功能实施完成！")
        sys.exit(0)
    else:
        print("⚠️  仍有功能需要完善")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())