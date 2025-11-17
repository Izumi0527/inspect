"""
Redis缓存管理器
"""
import json
import pickle
from typing import Any, Optional, Union
from datetime import timedelta
import redis.asyncio as redis
import structlog

from src.core.config import settings

logger = structlog.get_logger()


class RedisManager:
    """Redis连接管理器"""
    
    def __init__(self):
        self.redis: Optional[redis.Redis] = None
        self.is_connected = False
    
    async def initialize(self):
        """初始化Redis连接"""
        try:
            # 使用现代 redis-py 异步客户端
            self.redis = redis.from_url(
                settings.REDIS_URL,
                encoding="utf-8",
                decode_responses=True,
                max_connections=20,
                retry_on_timeout=True,
                health_check_interval=30,
                socket_keepalive=True,
                socket_keepalive_options={}
            )
            
            # 测试连接
            await self.redis.ping()
            self.is_connected = True
            
            logger.info("Redis connection initialized", redis_url=settings.REDIS_URL.split("@")[0] + "@***")
            
        except Exception as e:
            logger.warning("Redis connection failed, caching disabled", error=str(e))
            self.is_connected = False
    
    async def close(self):
        """关闭Redis连接"""
        if self.redis:
            await self.redis.aclose()  # 使用现代 redis-py 的异步关闭方法
            self.is_connected = False
            logger.info("Redis connection closed")
    
    async def set(
        self, 
        key: str, 
        value: Any, 
        expire: Optional[Union[int, timedelta]] = None,
        serialize: bool = True
    ) -> bool:
        """设置缓存值"""
        if not self.is_connected:
            return False
            
        try:
            # 序列化值
            if serialize:
                if isinstance(value, (dict, list)):
                    cached_value = json.dumps(value, ensure_ascii=False)
                elif isinstance(value, (str, int, float, bool)):
                    cached_value = str(value)
                else:
                    cached_value = pickle.dumps(value).decode('latin-1')
            else:
                cached_value = value
            
            # 设置过期时间
            if isinstance(expire, timedelta):
                expire = int(expire.total_seconds())
            
            await self.redis.set(key, cached_value, ex=expire)
            return True
            
        except Exception as e:
            logger.error("Redis set failed", key=key, error=str(e))
            return False
    
    async def get(self, key: str, deserialize: bool = True) -> Any:
        """获取缓存值"""
        if not self.is_connected:
            return None
            
        try:
            cached_value = await self.redis.get(key)
            if cached_value is None:
                return None
            
            if not deserialize:
                return cached_value
            
            # 尝试JSON反序列化
            try:
                return json.loads(cached_value)
            except (json.JSONDecodeError, TypeError):
                pass
            
            # 尝试pickle反序列化
            try:
                return pickle.loads(cached_value.encode('latin-1'))
            except:
                pass
            
            # 返回字符串值
            return cached_value
            
        except Exception as e:
            logger.error("Redis get failed", key=key, error=str(e))
            return None
    
    async def delete(self, key: str) -> bool:
        """删除缓存"""
        if not self.is_connected:
            return False
            
        try:
            result = await self.redis.delete(key)
            return result > 0
        except Exception as e:
            logger.error("Redis delete failed", key=key, error=str(e))
            return False
    
    async def exists(self, key: str) -> bool:
        """检查键是否存在"""
        if not self.is_connected:
            return False
            
        try:
            return await self.redis.exists(key) > 0
        except Exception as e:
            logger.error("Redis exists check failed", key=key, error=str(e))
            return False
    
    async def expire(self, key: str, seconds: int) -> bool:
        """设置键的过期时间"""
        if not self.is_connected:
            return False
            
        try:
            return await self.redis.expire(key, seconds)
        except Exception as e:
            logger.error("Redis expire failed", key=key, error=str(e))
            return False
    
    async def ttl(self, key: str) -> int:
        """获取键的剩余生存时间"""
        if not self.is_connected:
            return -1
            
        try:
            return await self.redis.ttl(key)
        except Exception as e:
            logger.error("Redis TTL check failed", key=key, error=str(e))
            return -1
    
    async def keys(self, pattern: str = "*") -> list:
        """获取匹配模式的所有键"""
        if not self.is_connected:
            return []
            
        try:
            return await self.redis.keys(pattern)
        except Exception as e:
            logger.error("Redis keys scan failed", pattern=pattern, error=str(e))
            return []
    
    async def clear_pattern(self, pattern: str) -> int:
        """清除匹配模式的所有键"""
        if not self.is_connected:
            return 0
            
        try:
            keys = await self.keys(pattern)
            if keys:
                return await self.redis.delete(*keys)
            return 0
        except Exception as e:
            logger.error("Redis clear pattern failed", pattern=pattern, error=str(e))
            return 0
    
    async def increment(self, key: str, amount: int = 1) -> int:
        """递增计数器"""
        if not self.is_connected:
            return 0
            
        try:
            return await self.redis.incr(key, amount)
        except Exception as e:
            logger.error("Redis increment failed", key=key, error=str(e))
            return 0
    
    async def hash_set(self, name: str, key: str, value: Any) -> bool:
        """设置哈希值"""
        if not self.is_connected:
            return False
            
        try:
            if isinstance(value, (dict, list)):
                value = json.dumps(value, ensure_ascii=False)
            
            await self.redis.hset(name, key, value)
            return True
        except Exception as e:
            logger.error("Redis hash set failed", name=name, key=key, error=str(e))
            return False
    
    async def hash_get(self, name: str, key: str) -> Any:
        """获取哈希值"""
        if not self.is_connected:
            return None
            
        try:
            value = await self.redis.hget(name, key)
            if value is None:
                return None
                
            try:
                return json.loads(value)
            except (json.JSONDecodeError, TypeError):
                return value
        except Exception as e:
            logger.error("Redis hash get failed", name=name, key=key, error=str(e))
            return None
    
    async def hash_getall(self, name: str) -> dict:
        """获取哈希的所有键值对"""
        if not self.is_connected:
            return {}

        try:
            return await self.redis.hgetall(name)
        except Exception as e:
            logger.error("Redis hash getall failed", name=name, error=str(e))
            return {}

    async def ping(self) -> bool:
        """
        健康检查：测试Redis连接

        Returns:
            bool: 连接是否正常
        """
        if not self.is_connected or not self.redis:
            return False

        try:
            await self.redis.ping()
            return True
        except Exception as e:
            logger.error("Redis ping failed", error=str(e))
            return False

    async def get_info(self) -> dict:
        """
        获取Redis服务器信息

        Returns:
            dict: Redis服务器信息，失败返回空字典
        """
        if not self.is_connected or not self.redis:
            return {}

        try:
            info = await self.redis.info()
            return info
        except Exception as e:
            logger.error("Redis get info failed", error=str(e))
            return {}


# 全局Redis管理器实例
redis_manager = RedisManager()


# 便捷函数
async def init_redis():
    """初始化Redis"""
    await redis_manager.initialize()


async def close_redis():
    """关闭Redis连接"""
    await redis_manager.close()