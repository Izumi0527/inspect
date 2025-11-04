#!/usr/bin/env python3
"""
Redis缓存功能测试脚本
"""
import asyncio
import sys
from pathlib import Path

# 添加项目根目录到Python路径
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from src.core.redis import redis_manager
from src.services.cache_service import cache_service
import structlog

logger = structlog.get_logger()


async def test_redis_connection():
    """测试Redis连接"""
    print("🔄 测试Redis连接...")
    
    try:
        await redis_manager.initialize()
        
        if redis_manager.is_connected:
            print("✅ Redis连接成功")
            return True
        else:
            print("❌ Redis连接失败")
            return False
            
    except Exception as e:
        print(f"❌ Redis连接错误: {e}")
        return False


async def test_basic_cache_operations():
    """测试基本缓存操作"""
    print("\n🔄 测试基本缓存操作...")
    
    try:
        # 测试设置和获取
        success = await redis_manager.set("test_key", "test_value", expire=60)
        if not success:
            print("❌ 设置缓存失败")
            return False
            
        value = await redis_manager.get("test_key")
        if value != "test_value":
            print(f"❌ 获取缓存失败: 期望 'test_value', 实际 '{value}'")
            return False
            
        # 测试JSON数据
        test_data = {"name": "测试设备", "ip": "192.168.1.100", "status": "online"}
        success = await redis_manager.set("test_json", test_data, expire=60)
        if not success:
            print("❌ 设置JSON缓存失败")
            return False
            
        retrieved_data = await redis_manager.get("test_json")
        if retrieved_data != test_data:
            print(f"❌ 获取JSON缓存失败: {retrieved_data}")
            return False
            
        # 测试删除
        success = await redis_manager.delete("test_key")
        if not success:
            print("❌ 删除缓存失败")
            return False
            
        # 验证删除
        value = await redis_manager.get("test_key")
        if value is not None:
            print("❌ 缓存删除验证失败")
            return False
            
        print("✅ 基本缓存操作测试通过")
        return True
        
    except Exception as e:
        print(f"❌ 基本缓存操作错误: {e}")
        return False


async def test_cache_service():
    """测试缓存服务层"""
    print("\n🔄 测试缓存服务层...")
    
    try:
        # 测试用户缓存
        user_data = {
            "id": "user123",
            "username": "test_user",
            "role": "admin",
            "email": "test@example.com"
        }
        
        success = await cache_service.cache_user("user123", user_data)
        if not success:
            print("❌ 用户缓存设置失败")
            return False
            
        cached_user = await cache_service.get_cached_user("user123")
        if cached_user != user_data:
            print(f"❌ 用户缓存获取失败: {cached_user}")
            return False
            
        # 测试设备缓存
        device_data = {
            "id": 1,
            "name": "测试路由器",
            "ip": "192.168.1.1",
            "type": "router",
            "status": "online"
        }
        
        success = await cache_service.cache_device(1, device_data)
        if not success:
            print("❌ 设备缓存设置失败")
            return False
            
        cached_device = await cache_service.get_cached_device(1)
        if cached_device != device_data:
            print(f"❌ 设备缓存获取失败: {cached_device}")
            return False
            
        # 测试JWT令牌黑名单
        test_token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.token"
        success = await cache_service.cache_token_blacklist(test_token, 3600)
        if not success:
            print("❌ JWT令牌黑名单设置失败")
            return False
            
        is_blacklisted = await cache_service.is_token_blacklisted(test_token)
        if not is_blacklisted:
            print("❌ JWT令牌黑名单检查失败")
            return False
            
        print("✅ 缓存服务层测试通过")
        return True
        
    except Exception as e:
        print(f"❌ 缓存服务层错误: {e}")
        return False


async def test_cache_statistics():
    """测试缓存统计"""
    print("\n🔄 测试缓存统计...")
    
    try:
        stats = await cache_service.get_cache_stats()
        
        if not stats.get("connected"):
            print("❌ 缓存统计显示未连接")
            return False
            
        print(f"✅ 缓存统计获取成功: {stats}")
        return True
        
    except Exception as e:
        print(f"❌ 缓存统计错误: {e}")
        return False


async def cleanup():
    """清理测试数据"""
    print("\n🧹 清理测试数据...")
    
    try:
        # 清理测试键
        test_keys = ["test_key", "test_json", "inspect:user:user123", "inspect:device:1"]
        for key in test_keys:
            await redis_manager.delete(key)
            
        # 清理JWT令牌黑名单测试数据
        await redis_manager.clear_pattern("inspect:auth:blacklist:*")
        
        await redis_manager.close()
        print("✅ 清理完成")
        
    except Exception as e:
        print(f"❌ 清理错误: {e}")


async def main():
    """主测试函数"""
    print("=" * 50)
    print("🚀 Redis缓存集成测试开始")
    print("=" * 50)
    
    # 测试连接
    if not await test_redis_connection():
        print("\n❌ Redis连接测试失败，请检查Redis服务是否启动")
        return
    
    # 测试基本操作
    if not await test_basic_cache_operations():
        await cleanup()
        return
    
    # 测试服务层
    if not await test_cache_service():
        await cleanup()
        return
        
    # 测试统计
    if not await test_cache_statistics():
        await cleanup()
        return
    
    # 清理
    await cleanup()
    
    print("\n" + "=" * 50)
    print("🎉 所有Redis缓存测试通过！")
    print("=" * 50)


if __name__ == "__main__":
    asyncio.run(main())