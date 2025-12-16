import asyncio
import socket
import subprocess
import platform
import ipaddress
import json
import time
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple, Union, Any
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
import struct
import ping3
import structlog

from src.core.config import settings
from src.infrastructure.device_connection import SNMPService

logger = structlog.get_logger()

@dataclass
class NetworkDevice:
    """网络设备信息"""
    ip_address: str
    hostname: Optional[str] = None
    mac_address: Optional[str] = None
    vendor: Optional[str] = None
    device_type: Optional[str] = None
    open_ports: List[int] = None
    services: Dict[int, str] = None
    response_time: Optional[float] = None
    last_seen: Optional[datetime] = None
    snmp_info: Optional[Dict[str, Any]] = None
    os_info: Optional[str] = None

@dataclass
class ScanResult:
    """扫描结果"""
    scan_id: str
    target_network: str
    scan_type: str
    started_at: datetime
    completed_at: Optional[datetime] = None
    status: str = "running"  # running, completed, failed
    devices_found: int = 0
    total_hosts_scanned: int = 0
    devices: List[NetworkDevice] = None
    error_message: Optional[str] = None

class NetworkScanner:
    """网络扫描器"""
    
    def __init__(self):
        self.thread_executor = ThreadPoolExecutor(max_workers=50)
        self.snmp_service = SNMPService()
        self.active_scans = {}
        
        # 常见端口映射
        self.common_ports = {
            21: "FTP",
            22: "SSH", 
            23: "Telnet",
            25: "SMTP",
            53: "DNS",
            80: "HTTP",
            110: "POP3",
            143: "IMAP",
            161: "SNMP",
            443: "HTTPS",
            993: "IMAPS",
            995: "POP3S",
            3389: "RDP",
            5432: "PostgreSQL",
            3306: "MySQL",
            1521: "Oracle",
            27017: "MongoDB",
            6379: "Redis"
        }
        
        # 设备类型识别规则
        self.device_type_patterns = {
            "switch": ["switch", "catalyst", "nexus", "s2700", "s5700", "comware"],
            "router": ["router", "asr", "isr", "ar", "ne", "mx", "srx"],
            "firewall": ["asa", "pix", "srx", "fortigate", "checkpoint", "usg"],
            "server": ["server", "linux", "windows", "ubuntu", "centos", "redhat"],
            "printer": ["printer", "hp", "canon", "epson", "laserjet"],
            "ap": ["access point", "ap", "aironet", "wireless"]
        }
        
        # MAC地址厂商前缀（部分）
        self.vendor_oui = {
            "00:1B:67": "Cisco",
            "00:0C:29": "VMware",
            "08:00:27": "VirtualBox",
            "00:50:56": "VMware",
            "00:1A:A0": "Dell",
            "00:23:AE": "Intel",
            "00:E0:4C": "Realtek",
            "F4:CF:E2": "Huawei",
            "70:72:3C": "Hewlett Packard",
            "00:90:F5": "3Com"
        }
    
    async def start_network_scan(
        self, 
        target_network: str,
        scan_type: str = "ping",
        port_scan: bool = False,
        snmp_scan: bool = False,
        deep_scan: bool = False
    ) -> str:
        """启动网络扫描"""
        try:
            # 验证网络地址格式
            try:
                network = ipaddress.ip_network(target_network, strict=False)
            except ValueError as e:
                raise ValueError(f"无效的网络地址: {target_network}")
            
            # 生成扫描ID
            scan_id = f"scan_{int(time.time())}_{hash(target_network) % 10000}"
            
            # 创建扫描结果对象
            scan_result = ScanResult(
                scan_id=scan_id,
                target_network=target_network,
                scan_type=scan_type,
                started_at=datetime.now(),
                devices=[]
            )
            
            self.active_scans[scan_id] = scan_result
            
            # 启动异步扫描任务
            asyncio.create_task(self._execute_network_scan(
                scan_id, network, scan_type, port_scan, snmp_scan, deep_scan
            ))
            
            logger.info("Network scan started", 
                       scan_id=scan_id,
                       target_network=target_network,
                       scan_type=scan_type)
            
            return scan_id
            
        except Exception as e:
            logger.error("Failed to start network scan", 
                        target_network=target_network,
                        error=str(e))
            raise
    
    async def _execute_network_scan(
        self,
        scan_id: str,
        network: ipaddress.IPv4Network,
        scan_type: str,
        port_scan: bool,
        snmp_scan: bool,
        deep_scan: bool
    ):
        """执行网络扫描"""
        scan_result = self.active_scans[scan_id]
        
        try:
            # 获取要扫描的主机列表
            hosts_to_scan = list(network.hosts())
            scan_result.total_hosts_scanned = len(hosts_to_scan)
            
            logger.info("Starting network scan execution",
                       scan_id=scan_id,
                       total_hosts=len(hosts_to_scan))
            
            # 执行主机发现扫描
            if scan_type in ["ping", "full"]:
                alive_hosts = await self._ping_scan(hosts_to_scan)
                logger.info("Ping scan completed", 
                           scan_id=scan_id,
                           alive_hosts=len(alive_hosts))
            else:
                alive_hosts = [(str(ip), None) for ip in hosts_to_scan]
            
            # 为每个活跃主机创建设备对象
            devices = []
            for ip, response_time in alive_hosts:
                device = NetworkDevice(
                    ip_address=ip,
                    response_time=response_time,
                    last_seen=datetime.now(),
                    open_ports=[],
                    services={}
                )
                devices.append(device)
            
            scan_result.devices = devices
            scan_result.devices_found = len(devices)
            
            # 执行端口扫描
            if port_scan and devices:
                logger.info("Starting port scan", 
                           scan_id=scan_id,
                           device_count=len(devices))
                await self._port_scan(devices)
            
            # 执行SNMP扫描
            if snmp_scan and devices:
                logger.info("Starting SNMP scan",
                           scan_id=scan_id, 
                           device_count=len(devices))
                await self._snmp_scan(devices)
            
            # 执行深度扫描（设备指纹识别）
            if deep_scan and devices:
                logger.info("Starting deep scan",
                           scan_id=scan_id,
                           device_count=len(devices))
                await self._deep_scan(devices)
            
            # 完成扫描
            scan_result.status = "completed"
            scan_result.completed_at = datetime.now()
            
            logger.info("Network scan completed", 
                       scan_id=scan_id,
                       devices_found=scan_result.devices_found,
                       duration=(scan_result.completed_at - scan_result.started_at).total_seconds())
            
        except Exception as e:
            scan_result.status = "failed"
            scan_result.error_message = str(e)
            scan_result.completed_at = datetime.now()
            
            logger.error("Network scan failed", 
                        scan_id=scan_id,
                        error=str(e))
    
    async def _ping_scan(self, hosts: List[ipaddress.IPv4Address]) -> List[Tuple[str, float]]:
        """执行Ping扫描"""
        alive_hosts = []
        
        # 并发执行ping
        ping_tasks = []
        for host in hosts:
            task = asyncio.create_task(self._ping_host(str(host)))
            ping_tasks.append(task)
        
        # 等待所有ping任务完成
        ping_results = await asyncio.gather(*ping_tasks, return_exceptions=True)
        
        for host, result in zip(hosts, ping_results):
            if isinstance(result, Exception):
                continue
            if result is not None:
                alive_hosts.append((str(host), result))
        
        return alive_hosts
    
    async def _ping_host(self, host: str) -> Optional[float]:
        """Ping单个主机"""
        try:
            # 使用线程池执行ping（因为ping3可能会阻塞）
            response_time = await asyncio.get_event_loop().run_in_executor(
                self.thread_executor,
                self._sync_ping_host,
                host
            )
            return response_time
        except Exception as e:
            logger.debug("Ping failed", host=host, error=str(e))
            return None
    
    def _sync_ping_host(self, host: str) -> Optional[float]:
        """同步执行ping"""
        try:
            # 首先尝试使用ping3库
            try:
                response_time = ping3.ping(host, timeout=2)
                if response_time is not None:
                    return response_time * 1000  # 转换为毫秒
            except:
                pass
            
            # 回退到系统ping命令
            if platform.system().lower() == "windows":
                cmd = ["ping", "-n", "1", "-w", "2000", host]
            else:
                cmd = ["ping", "-c", "1", "-W", "2", host]
            
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=5)
            
            if result.returncode == 0:
                # 解析响应时间
                output = result.stdout
                if "time=" in output:
                    try:
                        time_part = output.split("time=")[1].split()[0]
                        if "ms" in time_part:
                            return float(time_part.replace("ms", ""))
                        elif "s" in time_part:
                            return float(time_part.replace("s", "")) * 1000
                    except:
                        pass
                return 0.0  # 有响应但无法解析时间
            
            return None
            
        except Exception as e:
            logger.debug("Sync ping failed", host=host, error=str(e))
            return None
    
    async def _port_scan(self, devices: List[NetworkDevice]) -> None:
        """执行端口扫描"""
        # 定义要扫描的端口列表
        ports_to_scan = [22, 23, 21, 80, 443, 161, 162, 25, 53, 110, 143, 993, 995, 3389]
        
        # 为每个设备创建端口扫描任务
        scan_tasks = []
        for device in devices:
            task = asyncio.create_task(self._scan_device_ports(device, ports_to_scan))
            scan_tasks.append(task)
        
        # 并发执行端口扫描
        await asyncio.gather(*scan_tasks, return_exceptions=True)
    
    async def _scan_device_ports(self, device: NetworkDevice, ports: List[int]) -> None:
        """扫描单个设备的端口"""
        open_ports = []
        services = {}
        
        # 并发扫描所有端口
        port_tasks = []
        for port in ports:
            task = asyncio.create_task(self._check_port(device.ip_address, port))
            port_tasks.append((port, task))
        
        # 等待所有端口扫描完成
        for port, task in port_tasks:
            try:
                is_open = await task
                if is_open:
                    open_ports.append(port)
                    services[port] = self.common_ports.get(port, f"Port {port}")
            except Exception as e:
                logger.debug("Port scan failed", 
                           ip=device.ip_address, 
                           port=port, 
                           error=str(e))
        
        device.open_ports = open_ports
        device.services = services
        
        # 基于开放端口推断设备类型
        device.device_type = self._infer_device_type(open_ports, services)
        
        logger.debug("Port scan completed", 
                    ip=device.ip_address, 
                    open_ports=open_ports)
    
    async def _check_port(self, ip: str, port: int, timeout: float = 2.0) -> bool:
        """检查单个端口是否开放"""
        try:
            # 使用asyncio创建TCP连接
            future = asyncio.open_connection(ip, port)
            reader, writer = await asyncio.wait_for(future, timeout=timeout)
            
            # 立即关闭连接
            writer.close()
            await writer.wait_closed()
            
            return True
            
        except (asyncio.TimeoutError, ConnectionRefusedError, OSError):
            return False
        except Exception as e:
            logger.debug("Port check error", ip=ip, port=port, error=str(e))
            return False
    
    def _infer_device_type(self, open_ports: List[int], services: Dict[int, str]) -> str:
        """基于开放端口推断设备类型"""
        # SNMP通常表示网络设备
        if 161 in open_ports:
            if 22 in open_ports or 23 in open_ports:
                # 有SSH/Telnet和SNMP的通常是网络设备
                return "network_device"
        
        # HTTP/HTTPS + SSH可能是服务器
        if (80 in open_ports or 443 in open_ports) and 22 in open_ports:
            return "server"
        
        # 只有RDP的可能是Windows服务器
        if 3389 in open_ports:
            return "windows_server"
        
        # 数据库端口
        db_ports = {3306, 5432, 1521, 27017}
        if any(port in open_ports for port in db_ports):
            return "database_server"
        
        # 邮件服务器端口
        mail_ports = {25, 110, 143, 993, 995}
        if any(port in open_ports for port in mail_ports):
            return "mail_server"
        
        # 默认分类
        if 22 in open_ports:
            return "linux_server"
        elif 23 in open_ports:
            return "network_device"
        elif 80 in open_ports or 443 in open_ports:
            return "web_server"
        else:
            return "unknown"
    
    async def _snmp_scan(self, devices: List[NetworkDevice]) -> None:
        """执行SNMP扫描"""
        # 常用的SNMP community字符串
        communities = ["public", "private", "community"]
        
        snmp_tasks = []
        for device in devices:
            # 只扫描有SNMP端口开放的设备
            if 161 in (device.open_ports or []):
                task = asyncio.create_task(self._snmp_scan_device(device, communities))
                snmp_tasks.append(task)
        
        if snmp_tasks:
            await asyncio.gather(*snmp_tasks, return_exceptions=True)
    
    async def _snmp_scan_device(self, device: NetworkDevice, communities: List[str]) -> None:
        """SNMP扫描单个设备"""
        for community in communities:
            try:
                # 尝试获取系统信息
                system_info = await self.snmp_service.get_system_info(
                    device.ip_address, community
                )
                
                if system_info and system_info.get("system_description"):
                    device.snmp_info = system_info
                    
                    # 更新设备信息
                    if system_info.get("system_name"):
                        device.hostname = system_info["system_name"]
                    
                    if system_info.get("detected_vendor"):
                        device.vendor = system_info["detected_vendor"]
                    
                    # 更精确的设备类型识别
                    desc = system_info.get("system_description", "").lower()
                    for device_type, keywords in self.device_type_patterns.items():
                        if any(keyword in desc for keyword in keywords):
                            device.device_type = device_type
                            break
                    
                    logger.debug("SNMP scan successful", 
                               ip=device.ip_address, 
                               vendor=device.vendor,
                               device_type=device.device_type)
                    break
                    
            except Exception as e:
                logger.debug("SNMP scan failed", 
                           ip=device.ip_address, 
                           community=community, 
                           error=str(e))
                continue
    
    async def _deep_scan(self, devices: List[NetworkDevice]) -> None:
        """执行深度扫描（服务指纹识别、MAC地址获取等）"""
        deep_scan_tasks = []
        for device in devices:
            task = asyncio.create_task(self._deep_scan_device(device))
            deep_scan_tasks.append(task)
        
        await asyncio.gather(*deep_scan_tasks, return_exceptions=True)
    
    async def _deep_scan_device(self, device: NetworkDevice) -> None:
        """深度扫描单个设备"""
        try:
            # 尝试获取MAC地址
            mac_address = await self._get_mac_address(device.ip_address)
            if mac_address:
                device.mac_address = mac_address
                device.vendor = self._identify_vendor_by_mac(mac_address)
            
            # 尝试获取主机名
            if not device.hostname:
                hostname = await self._get_hostname(device.ip_address)
                if hostname:
                    device.hostname = hostname
            
            # 服务横幅抓取
            await self._grab_service_banners(device)
            
        except Exception as e:
            logger.debug("Deep scan failed", 
                        ip=device.ip_address, 
                        error=str(e))
    
    async def _get_mac_address(self, ip: str) -> Optional[str]:
        """获取IP对应的MAC地址"""
        try:
            # 在Windows上使用arp命令
            if platform.system().lower() == "windows":
                cmd = ["arp", "-a", ip]
            else:
                cmd = ["arp", "-n", ip]
            
            result = await asyncio.get_event_loop().run_in_executor(
                self.thread_executor,
                lambda: subprocess.run(cmd, capture_output=True, text=True, timeout=5)
            )
            
            if result.returncode == 0:
                output = result.stdout
                # 解析MAC地址
                import re
                mac_pattern = r'([0-9a-fA-F]{2}[:-]){5}[0-9a-fA-F]{2}'
                match = re.search(mac_pattern, output)
                if match:
                    return match.group(0).upper().replace('-', ':')
            
            return None
            
        except Exception as e:
            logger.debug("Failed to get MAC address", ip=ip, error=str(e))
            return None
    
    async def _get_hostname(self, ip: str) -> Optional[str]:
        """获取主机名"""
        try:
            result = await asyncio.get_event_loop().run_in_executor(
                self.thread_executor,
                socket.gethostbyaddr,
                ip
            )
            return result[0] if result else None
        except:
            return None
    
    def _identify_vendor_by_mac(self, mac_address: str) -> str:
        """通过MAC地址识别厂商"""
        if not mac_address:
            return "Unknown"
        
        # 提取OUI（前3个字节）
        oui = mac_address[:8]  # XX:XX:XX格式
        
        return self.vendor_oui.get(oui, "Unknown")
    
    async def _grab_service_banners(self, device: NetworkDevice) -> None:
        """抓取服务横幅信息"""
        if not device.open_ports:
            return
        
        banner_tasks = []
        for port in device.open_ports[:5]:  # 限制只抓取前5个端口的横幅
            if port in [21, 22, 23, 25, 80, 110, 143]:  # 只抓取特定服务的横幅
                task = asyncio.create_task(self._grab_banner(device.ip_address, port))
                banner_tasks.append((port, task))
        
        for port, task in banner_tasks:
            try:
                banner = await task
                if banner and device.services:
                    device.services[port] = f"{device.services.get(port, '')}: {banner[:100]}"
            except Exception as e:
                logger.debug("Banner grab failed", 
                           ip=device.ip_address, 
                           port=port, 
                           error=str(e))
    
    async def _grab_banner(self, ip: str, port: int, timeout: float = 3.0) -> Optional[str]:
        """抓取单个服务的横幅"""
        try:
            reader, writer = await asyncio.wait_for(
                asyncio.open_connection(ip, port), 
                timeout=timeout
            )
            
            # 读取横幅（通常服务会主动发送）
            banner = await asyncio.wait_for(
                reader.read(1024), 
                timeout=2.0
            )
            
            writer.close()
            await writer.wait_closed()
            
            if banner:
                return banner.decode('utf-8', errors='ignore').strip()
            
            return None
            
        except Exception:
            return None
    
    def get_scan_result(self, scan_id: str) -> Optional[ScanResult]:
        """获取扫描结果"""
        return self.active_scans.get(scan_id)
    
    def get_active_scans(self) -> List[ScanResult]:
        """获取所有活跃扫描任务"""
        return list(self.active_scans.values())
    
    async def stop_scan(self, scan_id: str) -> bool:
        """停止扫描任务"""
        if scan_id in self.active_scans:
            scan_result = self.active_scans[scan_id]
            if scan_result.status == "running":
                scan_result.status = "cancelled"
                scan_result.completed_at = datetime.now()
                logger.info("Scan cancelled", scan_id=scan_id)
                return True
        return False
    
    def cleanup_old_scans(self, older_than_hours: int = 24) -> None:
        """清理旧的扫描记录"""
        cutoff_time = datetime.now() - timedelta(hours=older_than_hours)
        scan_ids_to_remove = []
        
        for scan_id, scan_result in self.active_scans.items():
            if scan_result.completed_at and scan_result.completed_at < cutoff_time:
                scan_ids_to_remove.append(scan_id)
        
        for scan_id in scan_ids_to_remove:
            del self.active_scans[scan_id]
            logger.info("Old scan cleaned up", scan_id=scan_id)


# 创建全局网络扫描器实例
network_scanner = NetworkScanner()