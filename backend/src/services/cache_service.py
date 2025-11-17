"""
缓存服务层
"""
import hashlib
import time
from typing import Any, Optional, Union, Callable, List
from datetime import timedelta
from functools import wraps
import structlog

from src.core.redis import redis_manager

logger = structlog.get_logger()


class CacheService:
    """缓存服务"""
    
    # 缓存键前缀
    PREFIXES = {
        "user": "user",
        "device": "device",
        "scan": "scan",
        "auth": "auth",
        "session": "session",
        "permission": "perm",
        "device_status": "dev_status",
        "device_metrics": "dev_metrics",
        "inspection_stats": "insp_stats",      # 巡检统计
        "inspection_trends": "insp_trends",    # 巡检趋势
        "device_dist": "dev_dist",             # 设备分布
        "problem_dist": "prob_dist"            # 问题分布
    }

    # 默认过期时间（秒）
    DEFAULT_EXPIRE = {
        "user": 300,        # 5分钟
        "device": 600,      # 10分钟
        "scan": 1800,       # 30分钟
        "auth": 1800,       # 30分钟
        "session": 86400,   # 24小时
        "permission": 3600, # 1小时
        "device_status": 60,        # 1分钟
        "device_metrics": 300,      # 5分钟
        "inspection_stats": 180,    # 3分钟 - 统计数据
        "inspection_trends": 240,   # 4分钟 - 趋势数据
        "device_dist": 300,         # 5分钟 - 设备分布
        "problem_dist": 240         # 4分钟 - 问题分布
    }
    
    def __init__(self):
        self.redis = redis_manager
    
    def _make_key(self, prefix: str, identifier: Union[str, int]) -> str:
        """生成缓存键"""
        return f"inspect:{prefix}:{identifier}"
    
    def _hash_key(self, data: str) -> str:
        """生成哈希键"""
        return hashlib.md5(data.encode()).hexdigest()[:16]
    
    # ==================== 用户缓存 ====================
    
    async def cache_user(self, user_id: str, user_data: dict, expire: Optional[int] = None) -> bool:
        """缓存用户信息"""
        key = self._make_key(self.PREFIXES["user"], user_id)
        expire = expire or self.DEFAULT_EXPIRE["user"]
        return await self.redis.set(key, user_data, expire=expire)
    
    async def get_cached_user(self, user_id: str) -> Optional[dict]:
        """获取缓存的用户信息"""
        key = self._make_key(self.PREFIXES["user"], user_id)
        return await self.redis.get(key)
    
    async def invalidate_user(self, user_id: str) -> bool:
        """使用户缓存失效"""
        key = self._make_key(self.PREFIXES["user"], user_id)
        return await self.redis.delete(key)
    
    async def cache_user_by_username(self, username: str, user_data: dict, expire: Optional[int] = None) -> bool:
        """根据用户名缓存用户信息"""
        key = self._make_key(self.PREFIXES["user"], f"username:{username}")
        expire = expire or self.DEFAULT_EXPIRE["user"]
        return await self.redis.set(key, user_data, expire=expire)
    
    async def get_cached_user_by_username(self, username: str) -> Optional[dict]:
        """根据用户名获取缓存的用户信息"""
        key = self._make_key(self.PREFIXES["user"], f"username:{username}")
        return await self.redis.get(key)
    
    # ==================== JWT令牌缓存 ====================
    
    async def cache_token_blacklist(self, token: str, expire_seconds: int) -> bool:
        """将令牌加入黑名单"""
        token_hash = self._hash_key(token)
        key = self._make_key(self.PREFIXES["auth"], f"blacklist:{token_hash}")
        return await self.redis.set(key, "1", expire=expire_seconds)
    
    async def is_token_blacklisted(self, token: str) -> bool:
        """检查令牌是否在黑名单中"""
        token_hash = self._hash_key(token)
        key = self._make_key(self.PREFIXES["auth"], f"blacklist:{token_hash}")
        return await self.redis.exists(key)
    
    async def cache_user_session(self, user_id: str, session_data: dict, expire: Optional[int] = None) -> bool:
        """缓存用户会话信息"""
        key = self._make_key(self.PREFIXES["session"], user_id)
        expire = expire or self.DEFAULT_EXPIRE["session"]
        return await self.redis.set(key, session_data, expire=expire)
    
    async def get_cached_user_session(self, user_id: str) -> Optional[dict]:
        """获取缓存的用户会话信息"""
        key = self._make_key(self.PREFIXES["session"], user_id)
        return await self.redis.get(key)
    
    async def invalidate_user_session(self, user_id: str) -> bool:
        """使用户会话缓存失效"""
        key = self._make_key(self.PREFIXES["session"], user_id)
        return await self.redis.delete(key)
    
    # ==================== 设备缓存 ====================
    
    async def cache_device(self, device_id: int, device_data: dict, expire: Optional[int] = None) -> bool:
        """缓存设备信息"""
        key = self._make_key(self.PREFIXES["device"], device_id)
        expire = expire or self.DEFAULT_EXPIRE["device"]
        return await self.redis.set(key, device_data, expire=expire)
    
    async def get_cached_device(self, device_id: int) -> Optional[dict]:
        """获取缓存的设备信息"""
        key = self._make_key(self.PREFIXES["device"], device_id)
        return await self.redis.get(key)
    
    async def invalidate_device(self, device_id: int) -> bool:
        """使设备缓存失效"""
        key = self._make_key(self.PREFIXES["device"], device_id)
        return await self.redis.delete(key)
    
    async def cache_device_list(self, list_key: str, devices: List[dict], expire: Optional[int] = None) -> bool:
        """缓存设备列表"""
        key = self._make_key(self.PREFIXES["device"], f"list:{list_key}")
        expire = expire or self.DEFAULT_EXPIRE["device"]
        return await self.redis.set(key, devices, expire=expire)
    
    async def get_cached_device_list(self, list_key: str) -> Optional[List[dict]]:
        """获取缓存的设备列表"""
        key = self._make_key(self.PREFIXES["device"], f"list:{list_key}")
        return await self.redis.get(key)

    async def cache_active_devices(self, devices: List[dict], expire: Optional[int] = None) -> bool:
        """缓存活跃设备列表（专用于监控服务）"""
        key = self._make_key(self.PREFIXES["device"], "active_list")
        expire = expire or 300  # 5分钟缓存
        device_data = [
            {
                "id": device.get("id"),
                "name": device.get("name"),
                "ip_address": device.get("ip_address"),
                "device_type": device.get("device_type"),
                "is_active": device.get("is_active"),
                "is_monitored": device.get("is_monitored")
            }
            for device in devices
        ]
        return await self.redis.set(key, device_data, expire=expire)
    
    async def get_cached_active_devices(self) -> Optional[List[dict]]:
        """获取缓存的活跃设备列表"""
        key = self._make_key(self.PREFIXES["device"], "active_list")
        return await self.redis.get(key)
    
    async def invalidate_active_devices(self) -> bool:
        """使活跃设备列表缓存失效"""
        key = self._make_key(self.PREFIXES["device"], "active_list")
        return await self.redis.delete(key)
    
    # ==================== 设备状态缓存 ====================
    
    async def cache_device_status(self, device_id: int, status: str, response_time: Optional[float] = None) -> bool:
        """缓存设备状态"""
        key = self._make_key(self.PREFIXES["device_status"], device_id)
        status_data = {
            "status": status,
            "response_time": response_time,
            "last_update": int(time.time())
        }
        return await self.redis.set(key, status_data, expire=self.DEFAULT_EXPIRE["device_status"])
    
    async def get_cached_device_status(self, device_id: int) -> Optional[dict]:
        """获取缓存的设备状态"""
        key = self._make_key(self.PREFIXES["device_status"], device_id)
        return await self.redis.get(key)
    
    async def cache_multiple_device_status(self, status_data: dict) -> bool:
        """批量缓存设备状态"""
        success_count = 0
        for device_id, status_info in status_data.items():
            if await self.cache_device_status(device_id, **status_info):
                success_count += 1
        return success_count == len(status_data)
    
    # ==================== 网络扫描缓存 ====================
    
    async def cache_scan_result(self, scan_id: str, scan_data: dict, expire: Optional[int] = None) -> bool:
        """缓存扫描结果"""
        key = self._make_key(self.PREFIXES["scan"], scan_id)
        expire = expire or self.DEFAULT_EXPIRE["scan"]
        return await self.redis.set(key, scan_data, expire=expire)
    
    async def get_cached_scan_result(self, scan_id: str) -> Optional[dict]:
        """获取缓存的扫描结果"""
        key = self._make_key(self.PREFIXES["scan"], scan_id)
        return await self.redis.get(key)
    
    async def invalidate_scan_result(self, scan_id: str) -> bool:
        """使扫描结果缓存失效"""
        key = self._make_key(self.PREFIXES["scan"], scan_id)
        return await self.redis.delete(key)
    
    # ==================== 权限缓存 ====================
    
    async def cache_user_permissions(self, user_id: str, permissions: List[str], expire: Optional[int] = None) -> bool:
        """缓存用户权限"""
        key = self._make_key(self.PREFIXES["permission"], user_id)
        expire = expire or self.DEFAULT_EXPIRE["permission"]
        return await self.redis.set(key, permissions, expire=expire)
    
    async def get_cached_user_permissions(self, user_id: str) -> Optional[List[str]]:
        """获取缓存的用户权限"""
        key = self._make_key(self.PREFIXES["permission"], user_id)
        return await self.redis.get(key)
    
    async def invalidate_user_permissions(self, user_id: str) -> bool:
        """使用户权限缓存失效"""
        key = self._make_key(self.PREFIXES["permission"], user_id)
        return await self.redis.delete(key)

    # ==================== 巡检统计缓存 ====================

    async def cache_inspection_stats(self, time_range: str, stats_data: dict, expire: Optional[int] = None) -> bool:
        """缓存巡检统计数据"""
        key = self._make_key(self.PREFIXES["inspection_stats"], time_range)
        expire = expire or self.DEFAULT_EXPIRE["inspection_stats"]
        return await self.redis.set(key, stats_data, expire=expire)

    async def get_cached_inspection_stats(self, time_range: str) -> Optional[dict]:
        """获取缓存的巡检统计数据"""
        key = self._make_key(self.PREFIXES["inspection_stats"], time_range)
        return await self.redis.get(key)

    async def invalidate_inspection_stats(self, time_range: Optional[str] = None) -> bool:
        """使巡检统计缓存失效"""
        if time_range:
            key = self._make_key(self.PREFIXES["inspection_stats"], time_range)
            return await self.redis.delete(key)
        else:
            # 清除所有统计缓存
            pattern = self._make_key(self.PREFIXES["inspection_stats"], "*")
            return await self.redis.clear_pattern(pattern) > 0

    async def cache_inspection_trends(self, cache_key: str, trends_data: list, expire: Optional[int] = None) -> bool:
        """缓存巡检趋势数据"""
        key = self._make_key(self.PREFIXES["inspection_trends"], cache_key)
        expire = expire or self.DEFAULT_EXPIRE["inspection_trends"]
        return await self.redis.set(key, trends_data, expire=expire)

    async def get_cached_inspection_trends(self, cache_key: str) -> Optional[list]:
        """获取缓存的巡检趋势数据"""
        key = self._make_key(self.PREFIXES["inspection_trends"], cache_key)
        return await self.redis.get(key)

    async def invalidate_inspection_trends(self) -> bool:
        """使所有巡检趋势缓存失效"""
        pattern = self._make_key(self.PREFIXES["inspection_trends"], "*")
        return await self.redis.clear_pattern(pattern) > 0

    async def cache_device_distribution(self, distribution_data: list, expire: Optional[int] = None) -> bool:
        """缓存设备类型分布数据"""
        key = self._make_key(self.PREFIXES["device_dist"], "all")
        expire = expire or self.DEFAULT_EXPIRE["device_dist"]
        return await self.redis.set(key, distribution_data, expire=expire)

    async def get_cached_device_distribution(self) -> Optional[list]:
        """获取缓存的设备类型分布数据"""
        key = self._make_key(self.PREFIXES["device_dist"], "all")
        return await self.redis.get(key)

    async def invalidate_device_distribution(self) -> bool:
        """使设备类型分布缓存失效"""
        key = self._make_key(self.PREFIXES["device_dist"], "all")
        return await self.redis.delete(key)

    async def cache_problem_distribution(self, distribution_data: list, expire: Optional[int] = None) -> bool:
        """缓存问题分布数据"""
        key = self._make_key(self.PREFIXES["problem_dist"], "all")
        expire = expire or self.DEFAULT_EXPIRE["problem_dist"]
        return await self.redis.set(key, distribution_data, expire=expire)

    async def get_cached_problem_distribution(self) -> Optional[list]:
        """获取缓存的问题分布数据"""
        key = self._make_key(self.PREFIXES["problem_dist"], "all")
        return await self.redis.get(key)

    async def invalidate_problem_distribution(self) -> bool:
        """使问题分布缓存失效"""
        key = self._make_key(self.PREFIXES["problem_dist"], "all")
        return await self.redis.delete(key)

    async def invalidate_all_inspection_caches(self) -> None:
        """清除所有巡检相关缓存"""
        await self.invalidate_inspection_stats()
        await self.invalidate_inspection_trends()
        await self.invalidate_device_distribution()
        await self.invalidate_problem_distribution()
        logger.info("All inspection related cache cleared")
    
    # ==================== 通用缓存操作 ====================
    
    async def clear_user_related_cache(self, user_id: str) -> None:
        """清除用户相关的所有缓存"""
        await self.invalidate_user(user_id)
        await self.invalidate_user_session(user_id)
        await self.invalidate_user_permissions(user_id)
        
        logger.info("User related cache cleared", user_id=user_id)
    
    async def clear_device_related_cache(self, device_id: int) -> None:
        """清除设备相关的所有缓存"""
        await self.invalidate_device(device_id)
        await self.invalidate_active_devices()
        # 清除单设备状态与指标缓存
        await self.redis.delete(self._make_key(self.PREFIXES["device_status"], device_id))
        await self.redis.delete(self._make_key(self.PREFIXES["device_metrics"], device_id))
        
        # 清除设备列表缓存（通配符清除）
        pattern = self._make_key(self.PREFIXES["device"], "list:*")
        await self.redis.clear_pattern(pattern)
        
        logger.info("Device related cache cleared", device_id=device_id)
    
    async def get_cache_stats(self) -> dict:
        """获取缓存统计信息"""
        if not self.redis.is_connected:
            return {"connected": False}
        
        try:
            total_keys = len(await self.redis.keys("inspect:*"))
            
            stats = {"connected": True, "total_keys": total_keys}
            
            # 分类统计
            for prefix in self.PREFIXES.values():
                pattern = f"inspect:{prefix}:*"
                count = len(await self.redis.keys(pattern))
                stats[f"{prefix}_keys"] = count
            
            return stats
            
        except Exception as e:
            logger.error("Failed to get cache stats", error=str(e))
            return {"connected": True, "error": str(e)}


# 缓存装饰器
def cached(
    key_prefix: str,
    expire: int = 300,
    key_func: Optional[Callable] = None
):
    """
    缓存装饰器
    
    Args:
        key_prefix: 缓存键前缀
        expire: 过期时间（秒）
        key_func: 自定义键生成函数
    """
    def decorator(func):
        @wraps(func)
        async def wrapper(*args, **kwargs):
            cache_service = CacheService()
            
            # 生成缓存键
            if key_func:
                cache_key = key_func(*args, **kwargs)
            else:
                # 默认使用函数名和参数生成键
                params_str = f"{args}_{kwargs}"
                cache_key = f"{key_prefix}_{cache_service._hash_key(params_str)}"
            
            # 尝试从缓存获取
            cached_result = await cache_service.redis.get(cache_key)
            if cached_result is not None:
                logger.debug("Cache hit", key=cache_key, function=func.__name__)
                return cached_result
            
            # 执行原函数
            result = await func(*args, **kwargs)
            
            # 缓存结果
            await cache_service.redis.set(cache_key, result, expire=expire)
            logger.debug("Cache set", key=cache_key, function=func.__name__)
            
            return result
        
        return wrapper
    return decorator


# 全局缓存服务实例
cache_service = CacheService()
