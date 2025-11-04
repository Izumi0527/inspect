#!/usr/bin/env python3
"""
告警升级机制测试脚本
测试告警升级服务的核心功能
"""

import asyncio
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from datetime import datetime, timezone
from src.services.alert_escalation_service import (
    alert_escalation_service, 
    AlertSeverity, 
    EscalationLevel
)
from src.services.alert_engine import alert_engine, Alert, AlertStatus
import structlog

# 设置日志
logger = structlog.get_logger()

async def test_alert_escalation():
    """测试告警升级机制"""
    print("=" * 60)
    print("告警升级机制测试")
    print("=" * 60)
    
    try:
        # 1. 启动告警引擎和升级服务
        print("\n1. 启动告警引擎和升级服务...")
        await alert_engine.start()
        print("✓ 告警引擎已启动")
        
        # 2. 创建测试告警
        print("\n2. 创建测试告警...")
        test_alert = Alert(
            id="test_alert_001",
            rule_id="critical_escalation",
            rule_name="测试严重告警",
            severity=AlertSeverity.CRITICAL,
            status=AlertStatus.ACTIVE,
            title="测试设备离线告警",
            message="设备192.168.1.100连接超时，疑似离线",
            device_id=1,
            device_name="核心交换机-01",
            device_ip="192.168.1.100",
            details={
                "test": True,
                "timeout": 30
            }
        )
        
        # 保存告警到引擎
        alert_engine.alerts[test_alert.id] = test_alert
        print(f"✓ 测试告警已创建: {test_alert.id}")
        
        # 3. 创建升级
        print("\n3. 创建告警升级...")
        escalation_id = await alert_escalation_service.create_escalation(
            test_alert.id, test_alert.severity
        )
        
        if escalation_id:
            print(f"✓ 告警升级已创建: {escalation_id}")
        else:
            print("⚠ 未创建升级（可能没有匹配的规则）")
        
        # 4. 查询升级状态
        print("\n4. 查询升级状态...")
        escalation_status = await alert_escalation_service.get_escalation_status(test_alert.id)
        
        if escalation_status:
            print(f"✓ 升级状态: {escalation_status['current_level']}")
            print(f"  下次升级时间: {escalation_status['next_escalation_time']}")
            print(f"  是否活跃: {escalation_status['is_active']}")
        else:
            print("⚠ 未找到升级状态")
        
        # 5. 查看升级规则
        print("\n5. 升级规则配置...")
        for rule_id, rule in alert_escalation_service.escalation_rules.items():
            print(f"  规则ID: {rule_id}")
            print(f"  规则名称: {rule.name}")
            print(f"  适用严重级别: {rule.severity.value}")
            print(f"  启用状态: {rule.escalation_enabled}")
            print(f"  升级超时: L1={rule.level_1_timeout}s, L2={rule.level_2_timeout}s")
            print()
        
        # 6. 获取升级统计信息
        print("\n6. 升级统计信息...")
        stats = await alert_escalation_service.get_escalation_statistics()
        print(f"  活跃升级数量: {stats['total_active_escalations']}")
        print(f"  级别分布: {stats['level_distribution']}")
        print(f"  升级规则总数: {stats['total_rules']}")
        print(f"  已启用规则数: {stats['enabled_rules']}")
        print(f"  服务运行状态: {stats['is_running']}")
        
        # 7. 测试取消升级
        print("\n7. 测试取消升级...")
        if escalation_id:
            success = await alert_escalation_service.cancel_escalation(
                test_alert.id, "测试取消"
            )
            if success:
                print("✓ 升级已取消")
            else:
                print("⚠ 取消升级失败")
        
        # 8. 测试告警确认
        print("\n8. 测试告警确认...")
        # 重新创建升级用于测试确认
        escalation_id = await alert_escalation_service.create_escalation(
            test_alert.id, test_alert.severity
        )
        
        if escalation_id:
            # 确认告警（这应该会取消升级）
            success = await alert_engine.acknowledge_alert(
                test_alert.id, "test_user", "测试确认"
            )
            if success:
                print("✓ 告警已确认，升级应该已取消")
            else:
                print("⚠ 告警确认失败")
        
        print("\n" + "=" * 60)
        print("测试完成!")
        print("=" * 60)
        
    except Exception as e:
        print(f"\n❌ 测试过程中发生错误: {e}")
        import traceback
        traceback.print_exc()
    
    finally:
        # 清理
        print("\n9. 清理测试数据...")
        if "test_alert_001" in alert_engine.alerts:
            del alert_engine.alerts["test_alert_001"]
        
        # 停止服务
        await alert_engine.stop()
        print("✓ 服务已停止")

if __name__ == "__main__":
    asyncio.run(test_alert_escalation())