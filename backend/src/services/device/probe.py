"""
设备探测服务

提供ICMP ping探测和SNMP连接测试功能
"""
import asyncio
import subprocess
import platform
import time
from typing import Dict, Any, Optional
from dataclasses import dataclass
from datetime import datetime
import structlog

from src.core.snmp import create_snmp_client, SNMPVersion, SNMPSecurityLevel
from src.services.device.snmp_utils import (
    extract_snmp_config,
    normalize_snmp_version,
    normalize_snmp_security_level,
    normalize_snmp_auth_protocol,
    normalize_snmp_priv_protocol,
)

logger = structlog.get_logger()


@dataclass
class ProbeResult:
    """探测结果"""
    device_id: int
    ip_address: str
    # ICMP 探测结果
    icmp_reachable: bool
    icmp_response_time: Optional[float] = None  # 毫秒
    icmp_error: Optional[str] = None
    # SNMP 探测结果
    snmp_reachable: bool = False
    snmp_response_time: Optional[float] = None  # 毫秒
    snmp_error: Optional[str] = None
    snmp_system_info: Optional[str] = None
    # 探测时间
    probed_at: datetime = None
    
    def __post_init__(self):
        if self.probed_at is None:
            # 使用不带时区的 UTC 时间，与数据库 TIMESTAMP WITHOUT TIME ZONE 兼容
            self.probed_at = datetime.utcnow()
    
    @property
    def status(self) -> str:
        """根据探测结果返回设备状态"""
        if self.icmp_reachable:
            return "online"
        return "offline"
    
    @property
    def icmp_status(self) -> str:
        """ICMP状态"""
        return "online" if self.icmp_reachable else "offline"
    
    @property
    def snmp_status(self) -> str:
        """SNMP状态"""
        if self.snmp_reachable:
            return "success"
        if self.snmp_error and "not configured" in self.snmp_error.lower():
            return "not_configured"
        return "failed"


class DeviceProbeService:
    """设备探测服务"""
    
    def __init__(self):
        self.logger = logger.bind(component="device_probe")
        self._probe_cache: Dict[int, ProbeResult] = {}
        self._cache_ttl = 30  # 缓存30秒
    
    async def probe_device(
        self,
        device_id: int,
        ip_address: str,
        snmp_community: Optional[str] = None,
        snmp_version: str = "2c",
        snmp_port: int = 161,
        tags: Optional[Dict[str, Any]] = None,
        use_cache: bool = True
    ) -> ProbeResult:
        """
        探测设备连接状态
        
        Args:
            device_id: 设备ID
            ip_address: 设备IP地址
            snmp_community: SNMP Community字符串
            snmp_version: SNMP版本
            snmp_port: SNMP端口
            use_cache: 是否使用缓存
            
        Returns:
            探测结果
        """
        # 检查缓存
        if use_cache and device_id in self._probe_cache:
            cached_result = self._probe_cache[device_id]
            age = (datetime.utcnow() - cached_result.probed_at).total_seconds()
            if age < self._cache_ttl:
                self.logger.debug("Using cached probe result", device_id=device_id, age=age)
                return cached_result
        
        self.logger.info("Probing device", device_id=device_id, ip_address=ip_address)
        
        # 并发执行ICMP和SNMP探测
        icmp_task = asyncio.create_task(self._probe_icmp(ip_address))
        snmp_task = asyncio.create_task(
            self._probe_snmp(ip_address, snmp_community, snmp_version, snmp_port, tags)
        )
        
        icmp_result, snmp_result = await asyncio.gather(icmp_task, snmp_task)
        
        # 构建探测结果
        result = ProbeResult(
            device_id=device_id,
            ip_address=ip_address,
            icmp_reachable=icmp_result["reachable"],
            icmp_response_time=icmp_result.get("response_time"),
            icmp_error=icmp_result.get("error"),
            snmp_reachable=snmp_result["reachable"],
            snmp_response_time=snmp_result.get("response_time"),
            snmp_error=snmp_result.get("error"),
            snmp_system_info=snmp_result.get("system_info")
        )
        
        # 更新缓存
        self._probe_cache[device_id] = result
        
        self.logger.info(
            "Device probe completed",
            device_id=device_id,
            icmp_reachable=result.icmp_reachable,
            snmp_reachable=result.snmp_reachable,
            icmp_time=result.icmp_response_time,
            snmp_time=result.snmp_response_time
        )
        
        return result
    
    def _run_ping_sync(self, ip_address: str) -> Dict[str, Any]:
        """
        同步执行 ping 命令（在线程中运行）
        
        Windows 上 uvicorn 使用的事件循环不支持 asyncio.create_subprocess_exec，
        所以使用 subprocess.run 在线程中执行
        """
        start_time = time.time()
        
        system = platform.system().lower()
        if system == "windows":
            cmd = ["ping", "-n", "1", "-w", "3000", ip_address]
            encoding = 'gbk'
        else:
            cmd = ["ping", "-c", "1", "-W", "3", ip_address]
            encoding = 'utf-8'
        
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                timeout=10.0
            )
            
            elapsed_time = (time.time() - start_time) * 1000
            
            try:
                stdout_text = result.stdout.decode(encoding, errors='replace').strip()
            except Exception:
                stdout_text = result.stdout.decode('utf-8', errors='replace').strip()
            
            try:
                stderr_text = result.stderr.decode(encoding, errors='replace').strip()
            except Exception:
                stderr_text = result.stderr.decode('utf-8', errors='replace').strip()
            
            return {
                "returncode": result.returncode,
                "stdout": stdout_text,
                "stderr": stderr_text,
                "elapsed_time": elapsed_time
            }
        except subprocess.TimeoutExpired:
            return {"error": "timeout"}
        except Exception as e:
            return {"error": f"{type(e).__name__}: {str(e)}"}
    
    async def _probe_icmp(self, ip_address: str) -> Dict[str, Any]:
        """
        ICMP Ping探测
        
        Returns:
            {"reachable": bool, "response_time": float, "error": str}
        """
        try:
            self.logger.debug("Starting ICMP probe", ip_address=ip_address)
            
            # 在线程中执行 ping 命令，避免 Windows 事件循环不支持 subprocess 的问题
            result = await asyncio.to_thread(self._run_ping_sync, ip_address)
            
            # 检查是否有错误
            if "error" in result:
                error_msg = result["error"]
                if error_msg == "timeout":
                    self.logger.warning("ICMP probe timeout", ip_address=ip_address)
                    return {"reachable": False, "error": "Ping timeout"}
                else:
                    self.logger.error("ICMP probe error", ip_address=ip_address, error=error_msg)
                    return {"reachable": False, "error": error_msg}
            
            returncode = result["returncode"]
            stdout_text = result["stdout"]
            stderr_text = result["stderr"]
            elapsed_time = result["elapsed_time"]
            
            self.logger.debug(
                "Ping command completed",
                ip_address=ip_address,
                returncode=returncode,
                elapsed_time=elapsed_time
            )
            
            if returncode == 0:
                response_time = self._parse_ping_time(stdout_text)
                
                self.logger.info(
                    "ICMP probe success",
                    ip_address=ip_address,
                    response_time=response_time or elapsed_time
                )
                
                return {
                    "reachable": True,
                    "response_time": response_time or elapsed_time
                }
            else:
                error_msg = stderr_text or stdout_text or f"Ping failed (exit code: {returncode})"
                
                self.logger.warning(
                    "ICMP probe failed",
                    ip_address=ip_address,
                    returncode=returncode,
                    error=error_msg[:200]
                )
                
                return {
                    "reachable": False,
                    "error": error_msg
                }
                
        except Exception as e:
            import traceback
            error_detail = f"{type(e).__name__}: {str(e)}"
            self.logger.error(
                "ICMP probe exception",
                ip_address=ip_address,
                error=error_detail,
                traceback=traceback.format_exc()
            )
            return {
                "reachable": False,
                "error": error_detail
            }
    
    def _parse_ping_time(self, output: str) -> Optional[float]:
        """从ping输出中解析响应时间"""
        import re
        
        # Windows: time=XXms 或 time<1ms
        # Linux: time=XX.X ms
        patterns = [
            r'time[=<](\d+(?:\.\d+)?)\s*ms',
            r'时间[=<](\d+)ms',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, output, re.IGNORECASE)
            if match:
                try:
                    return float(match.group(1))
                except ValueError:
                    pass
        
        return None
    
    async def _probe_snmp(
        self,
        ip_address: str,
        snmp_community: Optional[str],
        snmp_version: str,
        snmp_port: int,
        tags: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        SNMP连接探测
        
        Returns:
            {"reachable": bool, "response_time": float, "error": str, "system_info": str}
        """
        snmp_config = extract_snmp_config(tags)
        snmp_port = snmp_config.get("port") or snmp_port
        snmp_version_raw = snmp_config.get("version") or snmp_version
        snmp_ver = normalize_snmp_version(snmp_version_raw) or SNMPVersion.V2C
        snmp_community = snmp_config.get("v2c_config", {}).get("community") or snmp_community

        if snmp_ver in [SNMPVersion.V1, SNMPVersion.V2C] and not snmp_community:
            return {
                "reachable": False,
                "error": "SNMP community not configured"
            }
        
        try:
            start_time = time.time()

            v3_config = snmp_config.get("v3_config") or {}
            v3_username = v3_config.get("username")
            v3_security_level = (
                normalize_snmp_security_level(v3_config.get("security_level"))
                or SNMPSecurityLevel.NO_AUTH_NO_PRIV
            )
            v3_auth_protocol = normalize_snmp_auth_protocol(v3_config.get("auth_protocol"))
            v3_priv_protocol = normalize_snmp_priv_protocol(v3_config.get("priv_protocol"))
            v3_auth_key = v3_config.get("auth_password") or v3_config.get("auth_key")
            v3_priv_key = v3_config.get("priv_password") or v3_config.get("priv_key")
            
            if snmp_ver == SNMPVersion.V3:
                if not v3_username:
                    return {
                        "reachable": False,
                        "error": "SNMP v3 username not configured"
                    }
                if v3_security_level in [SNMPSecurityLevel.AUTH_NO_PRIV, SNMPSecurityLevel.AUTH_PRIV] and not v3_auth_key:
                    return {
                        "reachable": False,
                        "error": "SNMP v3 auth password not configured"
                    }
                if v3_security_level == SNMPSecurityLevel.AUTH_PRIV and not v3_priv_key:
                    return {
                        "reachable": False,
                        "error": "SNMP v3 priv password not configured"
                    }
            
            # 创建SNMP客户端
            snmp_client = await create_snmp_client(
                host=ip_address,
                port=snmp_port,
                version=snmp_ver,
                community=snmp_community,
                username=v3_username,
                security_level=v3_security_level,
                auth_protocol=v3_auth_protocol,
                auth_key=v3_auth_key,
                priv_protocol=v3_priv_protocol,
                priv_key=v3_priv_key,
                timeout=3.0,  # 3秒超时
                retries=1  # 只重试1次
            )
            
            # 测试连接
            async with snmp_client:
                # 获取系统描述 (sysDescr)
                results = await snmp_client.get("1.3.6.1.2.1.1.1.0")
                
                elapsed_time = (time.time() - start_time) * 1000  # 转换为毫秒
                
                if results and not results[0].error:
                    system_info = results[0].value[:100] if results[0].value else None
                    return {
                        "reachable": True,
                        "response_time": elapsed_time,
                        "system_info": system_info
                    }
                else:
                    error_msg = results[0].error if results else "No response"
                    return {
                        "reachable": False,
                        "error": error_msg,
                        "response_time": elapsed_time
                    }
                    
        except asyncio.TimeoutError:
            return {
                "reachable": False,
                "error": "SNMP timeout"
            }
        except Exception as e:
            self.logger.error("SNMP probe failed", ip_address=ip_address, error=str(e))
            return {
                "reachable": False,
                "error": str(e)
            }
    
    async def batch_probe_devices(
        self,
        devices: list[Dict[str, Any]],
        max_concurrent: int = 20
    ) -> Dict[int, ProbeResult]:
        """
        批量探测设备
        
        Args:
            devices: 设备列表，每个设备包含 id, ip_address, snmp_community 等字段
            max_concurrent: 最大并发数
            
        Returns:
            设备ID到探测结果的映射
        """
        semaphore = asyncio.Semaphore(max_concurrent)
        
        async def probe_with_semaphore(device: Dict[str, Any]) -> tuple[int, ProbeResult]:
            async with semaphore:
                result = await self.probe_device(
                    device_id=device["id"],
                    ip_address=device["ip_address"],
                    snmp_community=device.get("snmp_community"),
                    snmp_version=device.get("snmp_version", "2c"),
                    snmp_port=device.get("snmp_port", 161),
                    tags=device.get("tags"),
                    use_cache=False  # 批量探测不使用缓存
                )
                return device["id"], result
        
        tasks = [probe_with_semaphore(device) for device in devices]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        # 构建结果字典
        probe_results = {}
        for result in results:
            if isinstance(result, Exception):
                self.logger.error("Batch probe error", error=str(result))
                continue
            device_id, probe_result = result
            probe_results[device_id] = probe_result
        
        return probe_results
    
    def clear_cache(self, device_id: Optional[int] = None):
        """清除探测缓存"""
        if device_id is None:
            self._probe_cache.clear()
            self.logger.info("Cleared all probe cache")
        elif device_id in self._probe_cache:
            del self._probe_cache[device_id]
            self.logger.info("Cleared probe cache", device_id=device_id)


# 全局设备探测服务实例
device_probe_service = DeviceProbeService()
