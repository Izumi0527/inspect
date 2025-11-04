"""
InfluxDB时序数据库连接管理器
"""
from typing import Optional, Dict, List, Any
import aiohttp
import json
from datetime import datetime, timezone
import structlog

from src.core.config import settings

logger = structlog.get_logger()


class InfluxDBClient:
    """InfluxDB客户端"""
    
    def __init__(self):
        self.base_url: Optional[str] = None
        self.token: Optional[str] = None
        self.org: Optional[str] = None  
        self.bucket: str = "monitoring"
        self.is_connected = False
        self._session: Optional[aiohttp.ClientSession] = None
    
    async def initialize(self):
        """初始化InfluxDB连接"""
        # 从配置中获取连接信息
        self.base_url = getattr(settings, 'INFLUXDB_URL', None)
        self.token = getattr(settings, 'INFLUXDB_TOKEN', None)
        self.org = getattr(settings, 'INFLUXDB_ORG', None)
        self.bucket = getattr(settings, 'INFLUXDB_BUCKET', 'monitoring')
        
        if not all([self.base_url, self.token, self.org]):
            logger.info("InfluxDB configuration not found, time series storage disabled")
            self.is_connected = False
            return
        
        # 创建HTTP会话
        self._session = aiohttp.ClientSession(
            headers={
                "Authorization": f"Token {self.token}",
                "Content-Type": "application/json"
            },
            timeout=aiohttp.ClientTimeout(total=30)
        )
        
        # 测试连接
        try:
            await self._ping()
            
            # 验证组织是否存在
            org_exists = await self._check_org_exists()
            if not org_exists:
                logger.warning(
                    "InfluxDB organization does not exist, attempting to use default organization",
                    requested_org=self.org
                )
                # 尝试使用默认组织
                await self._try_default_org()
            
            # 验证bucket是否存在
            bucket_exists = await self._check_bucket_exists()
            if not bucket_exists:
                logger.warning(
                    "InfluxDB bucket does not exist, attempting to use default bucket",
                    requested_bucket=self.bucket
                )
                # 尝试使用默认bucket或创建
                await self._try_default_bucket()
            
            self.is_connected = True
            logger.info(
                "InfluxDB connection initialized successfully",
                url=self.base_url,
                org=self.org,
                bucket=self.bucket
            )
        except Exception as e:
            logger.warning(
                "InfluxDB connection failed, time series storage disabled",
                error=str(e),
                error_type=type(e).__name__
            )
            self.is_connected = False
            if self._session:
                await self._session.close()
                self._session = None
    
    async def close(self):
        """关闭连接"""
        if self._session:
            await self._session.close()
            self._session = None
        self.is_connected = False
        logger.info("InfluxDB connection closed")
    
    async def _ping(self):
        """测试连接"""
        if not self._session:
            raise Exception("Session not initialized")
        
        url = f"{self.base_url}/ping"
        async with self._session.get(url) as response:
            if response.status not in [200, 204]:
                raise Exception(f"Ping failed with status {response.status}")
    
    async def _check_org_exists(self) -> bool:
        """检查组织是否存在"""
        if not self._session:
            return False
        
        try:
            url = f"{self.base_url}/api/v2/orgs"
            async with self._session.get(url) as response:
                if response.status == 200:
                    data = await response.json()
                    orgs = data.get('orgs', [])
                    for org in orgs:
                        if org.get('name') == self.org:
                            return True
                return False
        except Exception as e:
            logger.debug("Error checking organization existence", error=str(e))
            return False
    
    async def _try_default_org(self):
        """尝试使用默认组织"""
        if not self._session:
            return
        
        try:
            url = f"{self.base_url}/api/v2/orgs"
            async with self._session.get(url) as response:
                if response.status == 200:
                    data = await response.json()
                    orgs = data.get('orgs', [])
                    if orgs:
                        # 使用第一个可用的组织
                        default_org = orgs[0]['name']
                        logger.info(
                            "Using default organization",
                            original_org=self.org,
                            default_org=default_org
                        )
                        self.org = default_org
        except Exception as e:
            logger.warning("Failed to find default organization", error=str(e))
    
    async def _check_bucket_exists(self) -> bool:
        """检查bucket是否存在"""
        if not self._session:
            return False
        
        try:
            url = f"{self.base_url}/api/v2/buckets"
            params = {"org": self.org}
            async with self._session.get(url, params=params) as response:
                if response.status == 200:
                    data = await response.json()
                    buckets = data.get('buckets', [])
                    for bucket in buckets:
                        if bucket.get('name') == self.bucket:
                            return True
                return False
        except Exception as e:
            logger.debug("Error checking bucket existence", error=str(e))
            return False
    
    async def _try_default_bucket(self):
        """尝试使用默认bucket或创建"""
        if not self._session:
            return
        
        try:
            url = f"{self.base_url}/api/v2/buckets"
            params = {"org": self.org}
            async with self._session.get(url, params=params) as response:
                if response.status == 200:
                    data = await response.json()
                    buckets = data.get('buckets', [])
                    if buckets:
                        # 使用第一个可用的bucket
                        default_bucket = buckets[0]['name']
                        logger.info(
                            "Using default bucket",
                            original_bucket=self.bucket,
                            default_bucket=default_bucket
                        )
                        self.bucket = default_bucket
        except Exception as e:
            logger.warning("Failed to find default bucket", error=str(e))
    
    async def write_points(self, measurement: str, tags: Dict[str, str], fields: Dict[str, Any], timestamp: Optional[datetime] = None) -> bool:
        """
        写入数据点
        
        Args:
            measurement: 测量名称
            tags: 标签（用于索引和分组）
            fields: 字段（实际数据）
            timestamp: 时间戳，默认为当前时间
        """
        if not self.is_connected or not self._session:
            return False
        
        if timestamp is None:
            timestamp = datetime.now(timezone.utc)
        
        # 构建InfluxDB Line Protocol格式的数据
        line_protocol = self._build_line_protocol(measurement, tags, fields, timestamp)
        
        try:
            url = f"{self.base_url}/api/v2/write"
            params = {
                "org": self.org,
                "bucket": self.bucket,
                "precision": "ns"
            }
            
            async with self._session.post(
                url,
                params=params,
                data=line_protocol
            ) as response:
                if response.status == 204:
                    return True
                else:
                    error_text = await response.text()
                    logger.error(
                        "Failed to write to InfluxDB",
                        status=response.status,
                        error=error_text,
                        measurement=measurement
                    )
                    return False
                    
        except Exception as e:
            logger.error(
                "Error writing to InfluxDB",
                error=str(e),
                measurement=measurement
            )
            return False
    
    async def write_batch_points(self, points: List[Dict]) -> bool:
        """
        批量写入数据点
        
        Args:
            points: 数据点列表，每个点包含measurement、tags、fields、timestamp
        """
        if not self.is_connected or not self._session or not points:
            return False
        
        # 构建批量Line Protocol数据
        lines = []
        for point in points:
            line = self._build_line_protocol(
                point["measurement"],
                point.get("tags", {}),
                point["fields"],
                point.get("timestamp")
            )
            lines.append(line)
        
        line_protocol = "\n".join(lines)
        
        try:
            url = f"{self.base_url}/api/v2/write"
            params = {
                "org": self.org,
                "bucket": self.bucket,
                "precision": "ns"
            }
            
            async with self._session.post(
                url,
                params=params,
                data=line_protocol
            ) as response:
                if response.status == 204:
                    logger.debug(f"Successfully wrote {len(points)} points to InfluxDB")
                    return True
                else:
                    error_text = await response.text()
                    logger.error(
                        "Failed to write batch to InfluxDB",
                        status=response.status,
                        error=error_text,
                        point_count=len(points)
                    )
                    return False
                    
        except Exception as e:
            logger.error(
                "Error writing batch to InfluxDB",
                error=str(e),
                point_count=len(points)
            )
            return False
    
    async def query(self, flux_query: str) -> Optional[List[Dict]]:
        """
        执行Flux查询
        
        Args:
            flux_query: Flux查询语句
            
        Returns:
            查询结果列表
        """
        if not self.is_connected or not self._session:
            return None
        
        try:
            url = f"{self.base_url}/api/v2/query"
            params = {"org": self.org}
            data = {"query": flux_query, "type": "flux"}
            
            async with self._session.post(
                url,
                params=params,
                json=data,
                headers={"Accept": "application/json"}
            ) as response:
                if response.status == 200:
                    result = await response.json()
                    return self._parse_query_result(result)
                else:
                    error_text = await response.text()
                    logger.error(
                        "InfluxDB query failed",
                        status=response.status,
                        error=error_text
                    )
                    return None
                    
        except Exception as e:
            logger.error("Error querying InfluxDB", error=str(e))
            return None
    
    def _build_line_protocol(self, measurement: str, tags: Dict[str, str], fields: Dict[str, Any], timestamp: Optional[datetime] = None) -> str:
        """构建InfluxDB Line Protocol格式字符串"""
        # 转义特殊字符
        measurement = self._escape_measurement(measurement)
        
        # 构建标签部分
        tag_parts = []
        for key, value in tags.items():
            escaped_key = self._escape_tag_key(str(key))
            escaped_value = self._escape_tag_value(str(value))
            tag_parts.append(f"{escaped_key}={escaped_value}")
        
        tags_str = "," + ",".join(tag_parts) if tag_parts else ""
        
        # 构建字段部分
        field_parts = []
        for key, value in fields.items():
            escaped_key = self._escape_field_key(str(key))
            field_value = self._format_field_value(value)
            field_parts.append(f"{escaped_key}={field_value}")
        
        fields_str = ",".join(field_parts)
        
        # 构建时间戳（纳秒精度）
        if timestamp is None:
            timestamp = datetime.now(timezone.utc)
        
        timestamp_ns = int(timestamp.timestamp() * 1_000_000_000)
        
        return f"{measurement}{tags_str} {fields_str} {timestamp_ns}"
    
    def _escape_measurement(self, value: str) -> str:
        """转义measurement名称"""
        return value.replace(" ", "\\ ").replace(",", "\\,")
    
    def _escape_tag_key(self, value: str) -> str:
        """转义标签键"""
        return value.replace(" ", "\\ ").replace(",", "\\,").replace("=", "\\=")
    
    def _escape_tag_value(self, value: str) -> str:
        """转义标签值"""
        return value.replace(" ", "\\ ").replace(",", "\\,").replace("=", "\\=")
    
    def _escape_field_key(self, value: str) -> str:
        """转义字段键"""
        return value.replace(" ", "\\ ").replace(",", "\\,").replace("=", "\\=")
    
    def _format_field_value(self, value: Any) -> str:
        """格式化字段值"""
        if isinstance(value, bool):
            return str(value).lower()
        elif isinstance(value, int):
            return f"{value}i"
        elif isinstance(value, float):
            return str(value)
        elif isinstance(value, str):
            # 字符串需要用引号包围并转义
            escaped = value.replace("\\", "\\\\").replace('"', '\\"')
            return f'"{escaped}"'
        else:
            # 其他类型转为字符串
            escaped = str(value).replace("\\", "\\\\").replace('"', '\\"')
            return f'"{escaped}"'
    
    def _parse_query_result(self, result: Any) -> List[Dict]:
        """解析查询结果"""
        # 这里应该根据InfluxDB的返回格式解析数据
        # 简化实现，实际项目中需要更完善的解析逻辑
        if isinstance(result, list):
            return result
        elif isinstance(result, dict) and "values" in result:
            return result["values"]
        else:
            return []


# 全局InfluxDB客户端实例
influxdb_client = InfluxDBClient()


# 便捷函数
async def init_influxdb():
    """初始化InfluxDB"""
    await influxdb_client.initialize()


async def close_influxdb():
    """关闭InfluxDB连接"""
    await influxdb_client.close()


# 业务数据记录函数
async def record_device_metrics(device_id: int, device_ip: str, metrics: Dict[str, Any]):
    """记录设备性能指标"""
    if not influxdb_client.is_connected:
        return False
    
    tags = {
        "device_id": str(device_id),
        "device_ip": device_ip,
        "metric_type": "performance"
    }
    
    return await influxdb_client.write_points(
        measurement="device_metrics",
        tags=tags,
        fields=metrics
    )


async def record_device_status(device_id: int, device_ip: str, status: str, response_time: Optional[float] = None):
    """记录设备状态"""
    if not influxdb_client.is_connected:
        return False
    
    tags = {
        "device_id": str(device_id),
        "device_ip": device_ip,
        "status": status
    }
    
    fields = {"status_code": 1 if status == "online" else 0}
    if response_time is not None:
        fields["response_time"] = response_time
    
    return await influxdb_client.write_points(
        measurement="device_status",
        tags=tags,
        fields=fields
    )


async def record_network_scan(scan_id: str, network: str, scan_type: str, result: Dict[str, Any]):
    """记录网络扫描结果"""
    if not influxdb_client.is_connected:
        return False
    
    tags = {
        "scan_id": scan_id,
        "network": network,
        "scan_type": scan_type
    }
    
    fields = {
        "devices_found": result.get("device_count", 0),
        "scan_duration": result.get("duration", 0),
        "success": result.get("success", False)
    }
    
    return await influxdb_client.write_points(
        measurement="network_scan",
        tags=tags,
        fields=fields
    )


async def record_user_activity(user_id: str, action: str, resource: str, details: Optional[Dict] = None):
    """记录用户活动"""
    if not influxdb_client.is_connected:
        return False
    
    tags = {
        "user_id": user_id,
        "action": action,
        "resource": resource
    }
    
    fields = {"count": 1}
    if details:
        # 将详细信息转为字符串字段
        for key, value in details.items():
            if isinstance(value, (str, int, float, bool)):
                fields[f"detail_{key}"] = value
    
    return await influxdb_client.write_points(
        measurement="user_activity",
        tags=tags,
        fields=fields
    )