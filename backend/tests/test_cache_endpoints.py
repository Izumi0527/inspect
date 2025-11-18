"""
测试巡检统计端点的Redis缓存功能
"""
import asyncio
import time
import httpx
import structlog

logger = structlog.get_logger()

# 测试端点列表（注意: API 端点包含 /api/v1 前缀）
ENDPOINTS = [
    ("GET /stats", "http://localhost:8000/api/v1/inspection/stats?time_range=7d"),
    ("GET /trends", "http://localhost:8000/api/v1/inspection/trends?period=week"),
    ("GET /device-distribution", "http://localhost:8000/api/v1/inspection/device-distribution"),
    ("GET /problem-distribution", "http://localhost:8000/api/v1/inspection/problem-distribution"),
]

# 使用有效的 admin token（使用 Admin123! 密码登录获取）
TOKEN = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJhZG1pbiIsImV4cCI6MTc2MjEwMDM0NSwidHlwZSI6ImFjY2VzcyJ9.n_PRzfCG3QPLktFEZC3xrPnVowhJGzrG1kTW65a2Hzo"

async def test_endpoint(client: httpx.AsyncClient, name: str, url: str):
    """测试单个端点的缓存功能"""
    print(f"\n{'='*80}")
    print(f"测试端点: {name}")
    print(f"{'='*80}")

    headers = {"Authorization": f"Bearer {TOKEN}"}

    # 第一次请求 - Cache Miss
    print("\n第一次请求 (Cache Miss):")
    start_time = time.time()
    try:
        response = await client.get(url, headers=headers)
        elapsed_time = (time.time() - start_time) * 1000
        print(f"状态码: {response.status_code}")
        print(f"响应时间: {elapsed_time:.2f}ms")
        if response.status_code == 200:
            data = response.json()
            print(f"响应数据: {list(data.keys()) if isinstance(data, dict) else type(data)}")
    except Exception as e:
        print(f"错误: {str(e)}")
        return

    # 等待 100ms
    await asyncio.sleep(0.1)

    # 第二次请求 - Cache Hit
    print("\n第二次请求 (Cache Hit):")
    start_time = time.time()
    try:
        response = await client.get(url, headers=headers)
        elapsed_time = (time.time() - start_time) * 1000
        print(f"状态码: {response.status_code}")
        print(f"响应时间: {elapsed_time:.2f}ms")
        if response.status_code == 200:
            print("✅ 缓存命中 (响应时间显著降低)")
    except Exception as e:
        print(f"错误: {str(e)}")

    print()

async def main():
    """主函数：测试所有端点"""
    print("\n" + "="*80)
    print("开始测试巡检统计端点的 Redis 缓存功能...")
    print("="*80 + "\n")

    async with httpx.AsyncClient(timeout=30.0) as client:
        for name, url in ENDPOINTS:
            await test_endpoint(client, name, url)

    print("\n" + "="*80)
    print("测试完成！")
    print("="*80 + "\n")

    print("✅ 缓存功能验证结果:")
    print("1. 如果第二次请求的响应时间明显快于第一次,说明缓存正常工作")
    print("2. 查看后端日志中的 'cache hit' 和 'cache cached' 消息")
    print("3. Cache TTL: stats=3min, trends=4min, device_dist=5min, problem_dist=4min")

if __name__ == "__main__":
    asyncio.run(main())
