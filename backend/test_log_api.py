#!/usr/bin/env python3
"""
测试日志API功能

验证日志API端点是否正常工作
"""
import asyncio
import sys
import os
import json
from datetime import datetime

# 添加项目根目录到Python路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi.testclient import TestClient
from src.main import app
import structlog

logger = structlog.get_logger()


def test_log_api():
    """测试日志API功能"""
    print("🧪 开始测试日志API功能...")
    
    # 创建测试客户端
    client = TestClient(app)
    
    # 模拟用户认证（这里简化处理）
    headers = {
        "Authorization": "Bearer test-token",
        "Content-Type": "application/json"
    }
    
    try:
        # 测试1: 获取日志统计API
        print("📊 测试日志统计API...")
        response = client.get("/api/v1/logs/statistics", headers=headers)
        
        if response.status_code == 200:
            stats = response.json()
            print(f"✅ 日志统计API成功: {stats}")
        else:
            print(f"❌ 日志统计API失败: {response.status_code} - {response.text}")
            return False
        
        # 测试2: 获取设备日志列表API
        print("\n📋 测试设备日志列表API...")
        # 假设设备ID为28（从之前的测试中得知）
        response = client.get("/api/v1/logs/devices/28/logs", headers=headers)
        
        if response.status_code == 200:
            logs_data = response.json()
            print(f"✅ 设备日志API成功: 找到 {len(logs_data.get('logs', []))} 条日志")
        else:
            print(f"❌ 设备日志API失败: {response.status_code} - {response.text}")
            return False
        
        # 测试3: 搜索日志API
        print("\n🔍 测试日志搜索API...")
        response = client.get("/api/v1/logs/search?keyword=ERROR", headers=headers)
        
        if response.status_code == 200:
            search_data = response.json()
            print(f"✅ 日志搜索API成功: 找到 {len(search_data.get('logs', []))} 条匹配日志")
        else:
            print(f"❌ 日志搜索API失败: {response.status_code} - {response.text}")
            return False
        
        # 测试4: 获取最近日志API
        print("\n⏰ 测试最近日志API...")
        response = client.get("/api/v1/logs/recent?hours=24", headers=headers)
        
        if response.status_code == 200:
            recent_data = response.json()
            print(f"✅ 最近日志API成功: 找到 {len(recent_data)} 条最近日志")
        else:
            print(f"❌ 最近日志API失败: {response.status_code} - {response.text}")
            return False
        
        print("\n✅ 所有日志API测试通过!")
        return True
        
    except Exception as e:
        print(f"❌ API测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """主函数"""
    success = test_log_api()
    if success:
        print("\n🎉 日志API测试通过!")
        sys.exit(0)
    else:
        print("\n💥 日志API测试失败!")
        sys.exit(1)


if __name__ == "__main__":
    main()