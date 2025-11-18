"""
测试告警API修复
验证分页、批量操作和删除功能
"""
import asyncio
import httpx
from typing import Optional

# 配置
BASE_URL = "http://localhost:8000/api/v1"
USERNAME = "admin"  # 请根据实际情况修改
PASSWORD = "admin"  # 请根据实际情况修改


class AlertAPITester:
    def __init__(self, base_url: str):
        self.base_url = base_url
        self.token: Optional[str] = None
        self.client = httpx.AsyncClient(timeout=30.0)

    async def login(self, username: str, password: str):
        """登录获取token"""
        print(f"🔐 正在登录 ({username})...")
        try:
            response = await self.client.post(
                f"{self.base_url}/auth/login",
                json={"username": username, "password": password}
            )
            if response.status_code == 200:
                data = response.json()
                self.token = data.get("access_token") or data.get("token")
                print(f"✅ 登录成功！Token: {self.token[:20]}...")
                return True
            else:
                print(f"❌ 登录失败: {response.status_code} - {response.text}")
                return False
        except Exception as e:
            print(f"❌ 登录异常: {e}")
            return False

    def get_headers(self):
        """获取请求头"""
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["Authorization"] = f"Bearer {self.token}"
        return headers

    async def test_pagination(self):
        """测试分页功能"""
        print("\n" + "=" * 60)
        print("📄 测试1: 分页功能（page/page_size参数）")
        print("=" * 60)

        try:
            # 测试第1页
            print("\n🔍 测试获取第1页（page=1, page_size=5）...")
            response = await self.client.get(
                f"{self.base_url}/alerts/",
                params={"page": 1, "page_size": 5},
                headers=self.get_headers()
            )

            if response.status_code == 200:
                data = response.json()
                print(f"✅ 成功获取数据")
                print(f"   - 总数: {data.get('total')}")
                print(f"   - 当前页: {data.get('current_page')}")
                print(f"   - 每页数量: {data.get('page_size')}")
                print(f"   - 返回告警数: {len(data.get('alerts', []))}")
                print(f"   - 有下一页: {data.get('has_next')}")
                print(f"   - 有上一页: {data.get('has_prev')}")

                # 测试第2页
                if data.get('has_next'):
                    print("\n🔍 测试获取第2页（page=2, page_size=5）...")
                    response2 = await self.client.get(
                        f"{self.base_url}/alerts/",
                        params={"page": 2, "page_size": 5},
                        headers=self.get_headers()
                    )
                    if response2.status_code == 200:
                        data2 = response2.json()
                        print(f"✅ 成功获取第2页")
                        print(f"   - 当前页: {data2.get('current_page')}")
                        print(f"   - 返回告警数: {len(data2.get('alerts', []))}")
                        print(f"   - 有上一页: {data2.get('has_prev')}")
                        return True
                    else:
                        print(f"❌ 获取第2页失败: {response2.status_code}")
                        return False
                else:
                    print("ℹ️  没有更多页面（数据少于5条）")
                    return True
            else:
                print(f"❌ 请求失败: {response.status_code} - {response.text}")
                return False

        except Exception as e:
            print(f"❌ 测试异常: {e}")
            return False

    async def test_bulk_operations(self):
        """测试批量操作"""
        print("\n" + "=" * 60)
        print("📦 测试2: 批量操作API")
        print("=" * 60)

        try:
            # 先获取一些告警ID
            print("\n🔍 获取告警列表...")
            response = await self.client.get(
                f"{self.base_url}/alerts/",
                params={"page": 1, "page_size": 3},
                headers=self.get_headers()
            )

            if response.status_code != 200:
                print(f"❌ 获取告警列表失败: {response.status_code}")
                return False

            data = response.json()
            alerts = data.get('alerts', [])

            if not alerts:
                print("⚠️  没有可用的告警进行测试")
                return True

            alert_ids = [alert['id'] for alert in alerts[:2]]  # 取前2个
            print(f"✅ 获取到 {len(alert_ids)} 个告警ID: {alert_ids}")

            # 测试批量确认
            print(f"\n🔍 测试批量确认操作...")
            response = await self.client.post(
                f"{self.base_url}/alerts/bulk",
                json={
                    "action": "acknowledge",
                    "alert_ids": alert_ids,
                    "comment": "自动化测试批量确认"
                },
                headers=self.get_headers()
            )

            if response.status_code == 200:
                result = response.json()
                print(f"✅ 批量确认成功")
                print(f"   - 总数: {result.get('total')}")
                print(f"   - 成功数: {result.get('success_count')}")
                print(f"   - 失败数: {result.get('failed_count')}")
                if result.get('failed_ids'):
                    print(f"   - 失败ID: {result.get('failed_ids')}")
                return True
            else:
                print(f"❌ 批量确认失败: {response.status_code} - {response.text}")
                return False

        except Exception as e:
            print(f"❌ 测试异常: {e}")
            return False

    async def test_delete_operation(self):
        """测试删除操作"""
        print("\n" + "=" * 60)
        print("🗑️  测试3: 删除/归档API")
        print("=" * 60)

        try:
            # 先获取一个告警
            print("\n🔍 获取告警列表...")
            response = await self.client.get(
                f"{self.base_url}/alerts/",
                params={"page": 1, "page_size": 1},
                headers=self.get_headers()
            )

            if response.status_code != 200:
                print(f"❌ 获取告警列表失败: {response.status_code}")
                return False

            data = response.json()
            alerts = data.get('alerts', [])

            if not alerts:
                print("⚠️  没有可用的告警进行测试")
                return True

            alert_id = alerts[0]['id']
            alert_title = alerts[0]['title']
            print(f"✅ 选择告警: ID={alert_id}, 标题={alert_title}")

            # 测试删除
            print(f"\n🔍 测试删除告警 {alert_id}...")
            response = await self.client.delete(
                f"{self.base_url}/alerts/{alert_id}",
                headers=self.get_headers()
            )

            if response.status_code == 200:
                result = response.json()
                print(f"✅ 删除成功: {result.get('message')}")
                return True
            else:
                print(f"❌ 删除失败: {response.status_code} - {response.text}")
                return False

        except Exception as e:
            print(f"❌ 测试异常: {e}")
            return False

    async def run_all_tests(self):
        """运行所有测试"""
        print("\n" + "=" * 60)
        print("🚀 开始测试告警API修复")
        print("=" * 60)

        # 登录
        login_success = await self.login(USERNAME, PASSWORD)
        if not login_success:
            print("\n❌ 登录失败，无法继续测试")
            return

        # 运行测试
        results = {
            "分页功能": await self.test_pagination(),
            "批量操作": await self.test_bulk_operations(),
            "删除操作": await self.test_delete_operation()
        }

        # 打印测试结果摘要
        print("\n" + "=" * 60)
        print("📊 测试结果摘要")
        print("=" * 60)
        for test_name, result in results.items():
            status = "✅ 通过" if result else "❌ 失败"
            print(f"{test_name}: {status}")

        total_tests = len(results)
        passed_tests = sum(1 for r in results.values() if r)
        print(f"\n总计: {passed_tests}/{total_tests} 通过")

        await self.client.aclose()


async def main():
    """主函数"""
    tester = AlertAPITester(BASE_URL)
    await tester.run_all_tests()


if __name__ == "__main__":
    print("""
    ╔═══════════════════════════════════════════════════════════╗
    ║         告警API修复测试脚本                               ║
    ║                                                           ║
    ║  测试项目:                                                ║
    ║  1. 分页参数修复 (page/page_size)                        ║
    ║  2. 批量操作API (POST /alerts/bulk)                      ║
    ║  3. 删除操作API (DELETE /alerts/{id})                    ║
    ╚═══════════════════════════════════════════════════════════╝
    """)

    asyncio.run(main())
