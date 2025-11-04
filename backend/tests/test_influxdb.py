#!/usr/bin/env python3
"""
InfluxDB集成功能测试脚本
"""
import asyncio
import sys
from pathlib import Path
from datetime import datetime, timezone, timedelta
import random

# 添加项目根目录到Python路径
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from src.core.influxdb import (
    influxdb_client, 
    record_device_metrics, 
    record_device_status,
    record_network_scan,
    record_user_activity
)
import structlog

logger = structlog.get_logger()


async def test_influxdb_connection():
    """测试InfluxDB连接"""
    print("🔄 测试InfluxDB连接...")
    
    try:
        await influxdb_client.initialize()
        
        if influxdb_client.is_connected:
            print("✅ InfluxDB连接成功")
            print(f"   URL: {influxdb_client.base_url}")
            print(f"   Org: {influxdb_client.org}")
            print(f"   Bucket: {influxdb_client.bucket}")
            return True
        else:
            print("❌ InfluxDB连接失败 - 配置未设置或连接测试失败")
            print("💡 提示：请在.env文件中配置以下变量：")
            print("   INFLUXDB_URL=http://localhost:8086")
            print("   INFLUXDB_TOKEN=your-token")
            print("   INFLUXDB_ORG=your-org")
            print("   INFLUXDB_BUCKET=monitoring")
            return False
            
    except Exception as e:
        print(f"❌ InfluxDB连接错误: {e}")
        return False


async def test_basic_write():
    """测试基本写入操作"""
    print("\n🔄 测试基本数据写入...")
    
    if not influxdb_client.is_connected:
        print("❌ InfluxDB未连接，跳过写入测试")
        return False
    
    try:
        # 测试单点写入
        success = await influxdb_client.write_points(
            measurement="test_basic",
            tags={"test_type": "basic", "location": "test_lab"},
            fields={"value": 42.5, "count": 10, "active": True, "message": "test"}
        )
        
        if not success:
            print("❌ 基本写入失败")
            return False
        
        print("✅ 基本数据写入成功")
        return True
        
    except Exception as e:
        print(f"❌ 基本写入错误: {e}")
        return False


async def test_batch_write():
    """测试批量写入操作"""
    print("\n🔄 测试批量数据写入...")
    
    if not influxdb_client.is_connected:
        print("❌ InfluxDB未连接，跳过批量写入测试")
        return False
    
    try:
        # 准备批量数据
        points = []
        for i in range(5):
            points.append({
                "measurement": "test_batch",
                "tags": {
                    "batch_id": "test_001",
                    "item_id": f"item_{i+1}"
                },
                "fields": {
                    "value": random.uniform(10, 100),
                    "index": i,
                    "processed": i % 2 == 0
                },
                "timestamp": datetime.now(timezone.utc) - timedelta(minutes=i)
            })
        
        success = await influxdb_client.write_batch_points(points)
        
        if not success:
            print("❌ 批量写入失败")
            return False
        
        print(f"✅ 批量数据写入成功 ({len(points)} 个数据点)")
        return True
        
    except Exception as e:
        print(f"❌ 批量写入错误: {e}")
        return False


async def test_device_metrics():
    """测试设备指标记录"""
    print("\n🔄 测试设备指标记录...")
    
    if not influxdb_client.is_connected:
        print("❌ InfluxDB未连接，跳过设备指标测试")
        return False
    
    try:
        # 模拟设备指标数据
        metrics = {
            "cpu_usage": random.uniform(10, 90),
            "memory_usage": random.uniform(20, 80),
            "disk_usage": random.uniform(15, 70),
            "network_in": random.uniform(1000, 10000),
            "network_out": random.uniform(500, 5000),
            "temperature": random.uniform(35, 60),
            "uptime": random.randint(3600, 86400 * 30)
        }
        
        success = await record_device_metrics(
            device_id=123,
            device_ip="192.168.1.100",
            metrics=metrics
        )
        
        if not success:
            print("❌ 设备指标记录失败")
            return False
        
        print("✅ 设备指标记录成功")
        print(f"   设备ID: 123")
        print(f"   指标数量: {len(metrics)}")
        return True
        
    except Exception as e:
        print(f"❌ 设备指标记录错误: {e}")
        return False


async def test_device_status():
    """测试设备状态记录"""
    print("\n🔄 测试设备状态记录...")
    
    if not influxdb_client.is_connected:
        print("❌ InfluxDB未连接，跳过设备状态测试")
        return False
    
    try:
        # 记录在线状态
        success1 = await record_device_status(
            device_id=456,
            device_ip="192.168.1.200",
            status="online",
            response_time=45.2
        )
        
        # 记录离线状态
        success2 = await record_device_status(
            device_id=789,
            device_ip="192.168.1.300",
            status="offline"
        )
        
        if not (success1 and success2):
            print("❌ 设备状态记录失败")
            return False
        
        print("✅ 设备状态记录成功")
        print("   记录了在线和离线状态")
        return True
        
    except Exception as e:
        print(f"❌ 设备状态记录错误: {e}")
        return False


async def test_network_scan():
    """测试网络扫描记录"""
    print("\n🔄 测试网络扫描记录...")
    
    if not influxdb_client.is_connected:
        print("❌ InfluxDB未连接，跳过网络扫描测试")
        return False
    
    try:
        scan_result = {
            "device_count": 15,
            "duration": 120.5,
            "success": True
        }
        
        success = await record_network_scan(
            scan_id="scan_test_001",
            network="192.168.1.0/24",
            scan_type="discovery",
            result=scan_result
        )
        
        if not success:
            print("❌ 网络扫描记录失败")
            return False
        
        print("✅ 网络扫描记录成功")
        print(f"   扫描ID: scan_test_001")
        print(f"   发现设备: {scan_result['device_count']} 台")
        return True
        
    except Exception as e:
        print(f"❌ 网络扫描记录错误: {e}")
        return False


async def test_user_activity():
    """测试用户活动记录"""
    print("\n🔄 测试用户活动记录...")
    
    if not influxdb_client.is_connected:
        print("❌ InfluxDB未连接，跳过用户活动测试")
        return False
    
    try:
        details = {
            "ip_address": "192.168.1.10",
            "user_agent": "Mozilla/5.0"
        }
        
        success = await record_user_activity(
            user_id="user_test_001",
            action="login",
            resource="auth",
            details=details
        )
        
        if not success:
            print("❌ 用户活动记录失败")
            return False
        
        print("✅ 用户活动记录成功")
        print("   记录了登录活动")
        return True
        
    except Exception as e:
        print(f"❌ 用户活动记录错误: {e}")
        return False


async def test_query():
    """测试数据查询"""
    print("\n🔄 测试数据查询...")
    
    if not influxdb_client.is_connected:
        print("❌ InfluxDB未连接，跳过查询测试")
        return False
    
    try:
        # 简单查询最近的测试数据
        flux_query = f'''
from(bucket: "{influxdb_client.bucket}")
  |> range(start: -1h)
  |> filter(fn: (r) => r._measurement =~ /test_.*/)
  |> limit(n: 10)
'''
        
        results = await influxdb_client.query(flux_query)
        
        if results is None:
            print("❌ 数据查询失败")
            return False
        
        print("✅ 数据查询成功")
        print(f"   查询结果: {len(results)} 条记录")
        
        # 显示部分结果
        if results:
            print("   示例记录:")
            for i, record in enumerate(results[:3]):
                print(f"     {i+1}. {record}")
        
        return True
        
    except Exception as e:
        print(f"❌ 数据查询错误: {e}")
        return False


async def cleanup():
    """清理测试"""
    print("\n🧹 清理测试环境...")
    
    try:
        await influxdb_client.close()
        print("✅ InfluxDB连接已关闭")
        
    except Exception as e:
        print(f"❌ 清理错误: {e}")


async def main():
    """主测试函数"""
    print("=" * 50)
    print("🚀 InfluxDB集成功能测试开始")
    print("=" * 50)
    
    # 测试连接
    if not await test_influxdb_connection():
        print("\n❌ InfluxDB连接测试失败，终止后续测试")
        return
    
    # 执行各项测试
    tests = [
        ("基本写入测试", test_basic_write),
        ("批量写入测试", test_batch_write),
        ("设备指标测试", test_device_metrics),
        ("设备状态测试", test_device_status),
        ("网络扫描测试", test_network_scan),
        ("用户活动测试", test_user_activity),
        ("数据查询测试", test_query),
    ]
    
    passed = 0
    failed = 0
    
    for test_name, test_func in tests:
        try:
            if await test_func():
                passed += 1
            else:
                failed += 1
        except Exception as e:
            print(f"❌ {test_name}发生异常: {e}")
            failed += 1
    
    # 清理
    await cleanup()
    
    # 测试总结
    print("\n" + "=" * 50)
    print("📋 InfluxDB测试总结")
    print("=" * 50)
    print(f"✅ 通过: {passed}")
    print(f"❌ 失败: {failed}")
    print(f"📊 成功率: {passed/(passed+failed)*100:.1f}%")
    
    if failed == 0:
        print("\n🎉 所有InfluxDB功能测试通过！")
        print("💡 提示：如果InfluxDB未连接，请检查配置并启动InfluxDB服务")
    else:
        print(f"\n⚠️ 有{failed}个测试失败，请检查InfluxDB配置和服务状态")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n⏹️ 测试被用户中断")