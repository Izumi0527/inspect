#!/usr/bin/env python3
"""
测试巡检管理API端点
"""
import requests
import json
from typing import Dict

BASE_URL = "http://localhost:8000/api/v1"

def login() -> str:
    """登录并获取token"""
    response = requests.post(
        f"{BASE_URL}/auth/login",
        json={
            "username": "admin",
            "password": "Admin123!"
        }
    )

    if response.status_code == 200:
        data = response.json()
        token = data.get("access_token")
        print(f"✓ 登录成功，获取token")
        return token
    else:
        print(f"✗ 登录失败: {response.status_code} - {response.text}")
        return None

def test_endpoint(name: str, url: str, headers: Dict[str, str]) -> bool:
    """测试单个端点"""
    try:
        response = requests.get(url, headers=headers, timeout=10)
        status = response.status_code

        if status == 200:
            print(f"✓ {name}: 200 OK")
            # 打印响应数据的类型和前100个字符
            try:
                data = response.json()
                data_str = json.dumps(data, ensure_ascii=False)
                print(f"  数据类型: {type(data).__name__}")
                print(f"  数据预览: {data_str[:100]}...")
            except:
                print(f"  响应内容: {response.text[:100]}...")
            return True
        elif status == 422:
            print(f"✗ {name}: 422 Unprocessable Entity")
            print(f"  错误详情: {response.text}")
            return False
        else:
            print(f"✗ {name}: {status}")
            print(f"  错误详情: {response.text[:200]}")
            return False
    except Exception as e:
        print(f"✗ {name}: 请求失败 - {str(e)}")
        return False

def main():
    print("=" * 60)
    print("巡检管理API端点测试")
    print("=" * 60)
    print()

    # 登录
    token = login()
    if not token:
        print("\n测试终止：无法获取认证token")
        return

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    print()
    print("-" * 60)
    print("开始测试5个API端点")
    print("-" * 60)
    print()

    # 测试5个端点
    endpoints = [
        ("Executions", f"{BASE_URL}/inspection/executions?page=1&page_size=10"),
        ("Stats", f"{BASE_URL}/inspection/stats"),
        ("Trends", f"{BASE_URL}/inspection/trends?period=week"),
        ("Device Distribution", f"{BASE_URL}/inspection/device-distribution"),
        ("Problem Distribution", f"{BASE_URL}/inspection/problem-distribution"),
    ]

    results = []
    for name, url in endpoints:
        success = test_endpoint(name, url, headers)
        results.append((name, success))
        print()

    # 汇总结果
    print("=" * 60)
    print("测试结果汇总")
    print("=" * 60)
    passed = sum(1 for _, success in results if success)
    total = len(results)

    for name, success in results:
        status = "✓ 通过" if success else "✗ 失败"
        print(f"{status}: {name}")

    print()
    print(f"通过: {passed}/{total}")
    print(f"失败: {total - passed}/{total}")
    print()

    if passed == total:
        print("🎉 所有API端点测试通过!")
    else:
        print("⚠️  部分API端点测试失败")

if __name__ == "__main__":
    main()
