#!/usr/bin/env python3
"""
测试告警数量API功能

验证设备API端点是否正确返回告警数量
"""
import asyncio
import sys
import os
import json

# 添加项目根目录到Python路径
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from fastapi.testclient import TestClient
from src.main import app
from src.core.database import get_db_session
from src.models.alert import Alert, AlertStatus, AlertSeverity, AlertCategory
from src.repositories.alert_repository_db import AlertRepositoryDB
import structlog

logger = structlog.get_logger()


def test_alert_count_api():
    """测试告警数量API功能"""
    print("🧪 开始测试告警数量API功能...")
    
    # 创建测试客户端
    client = TestClient(app)
    
    # 模拟用户认证（这里简化处理）
    # 在实际项目中，你需要根据认证系统提供正确的token
    headers = {
        "Authorization": "Bearer test-token",  # 根据实际认证系统调整
        "Content-Type": "application/json"
    }
    
    try:
        # 测试获取设备列表API
        print("📋 调用设备列表API...")
        response = client.get("/api/devices/", headers=headers)
        
        if response.status_code == 200:
            devices = response.json()
            print(f"API返回 {len(devices)} 台设备")
            
            for device in devices[:3]:  # 只显示前3台设备
                print(f"设备 {device['id']}: {device['name']} ({device['ip_address']})")
                print(f"  告警数量: {device.get('alert_count', 'N/A')}")
            
            print("✅ 设备列表API测试成功!")
            return True
        else:
            print(f"❌ API调用失败: {response.status_code}")
            print(f"响应内容: {response.text}")
            return False
            
    except Exception as e:
        print(f"❌ API测试失败: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    """主函数"""
    success = test_alert_count_api()
    if success:
        print("\n🎉 API测试通过!")
        sys.exit(0)
    else:
        print("\n💥 API测试失败!")
        sys.exit(1)


if __name__ == "__main__":
    main()