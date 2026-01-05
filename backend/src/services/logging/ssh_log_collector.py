"""
SSH日志采集服务

通过SSH连接到网络设备，执行日志查询命令并解析结果
"""
import re
import asyncio
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Tuple
from dataclasses import dataclass
import structlog

from src.infrastructure.device_connection import SSHService
from src.models.device_log import LogLevel, LogFacility, LogSource

logger = structlog.get_logger()


@dataclass
class LogEntry:
    """日志条目数据结构"""
    device_id: int
    level: LogLevel
    facility: LogFacility
    source: LogSource
    message: str
    raw_message: str
    source_ip: Optional[str] = None
    source_process: Optional[str] = None
    log_timestamp: Optional[datetime] = None
    collected_at: Optional[datetime] = None


class SSHLogCollector:
    """SSH日志采集器"""
    
    def __init__(self):
        self.ssh_service = SSHService()
        
        # 厂商特定的日志命令
        self.vendor_commands = {
            "cisco": {
                "system": "show logging",
                "interface": "show logging | include %LINK",
                "security": "show logging | include %SEC",
                "recent": "show logging last 100"
            },
            "huawei": {
                "system": "display logbuffer",
                "interface": "display logbuffer | include IF",
                "security": "display logbuffer | include SEC",
                "recent": "display logbuffer reverse"
            },
            "h3c": {
                "system": "display logbuffer",
                "interface": "display logbuffer | include Link",
                "security": "display logbuffer | include SEC",
                "recent": "display logbuffer reverse"
            },
            "juniper": {
                "system": "show log messages",
                "interface": "show log messages | match interface",
                "security": "show log messages | match security",
                "recent": "show log messages | last 100"
            }
        }
        
        # 日志级别映射
        self.level_patterns = {
            LogLevel.CRITICAL: [r'%CRIT', r'%FATAL', r'%EMERG', r'Critical', r'Fatal'],
            LogLevel.ERROR: [r'%ERR', r'%ERROR', r'Error', r'Err'],
            LogLevel.WARNING: [r'%WARN', r'%WARNING', r'Warning', r'Warn'],
            LogLevel.INFO: [r'%INFO', r'%NOTICE', r'Info', r'Notice'],
            LogLevel.DEBUG: [r'%DEBUG', r'Debug']
        }
        
        # 设施类型映射
        self.facility_patterns = {
            LogFacility.INTERFACE: [r'%LINK', r'%IF', r'interface', r'port', r'Link'],
            LogFacility.SECURITY: [r'%SEC', r'%AUTH', r'security', r'auth', r'login'],
            LogFacility.ROUTING: [r'%OSPF', r'%BGP', r'%RIP', r'routing', r'route'],
            LogFacility.SWITCHING: [r'%STP', r'%VLAN', r'switching', r'bridge'],
            LogFacility.SNMP: [r'%SNMP', r'snmp'],
            LogFacility.SSH: [r'%SSH', r'ssh', r'telnet']
        }
    
    async def collect_device_logs(
        self, 
        device_info: Dict[str, Any], 
        log_type: str = 'system',
        max_entries: int = 100
    ) -> List[LogEntry]:
        """采集设备日志
        
        Args:
            device_info: 设备信息字典
            log_type: 日志类型 (system, interface, security, recent)
            max_entries: 最大日志条目数
            
        Returns:
            List[LogEntry]: 日志条目列表
        """
        try:
            # 连接设备
            await self.ssh_service.connect(device_info)
            
            # 获取日志命令
            vendor = device_info.get('vendor', 'cisco').lower()
            commands = self.vendor_commands.get(vendor, self.vendor_commands['cisco'])
            command = commands.get(log_type, commands['system'])
            
            # 执行命令
            logger.info("Executing log command", 
                       device_ip=device_info['ip_address'], 
                       command=command)
            
            output = await self.ssh_service.execute_command(command)
            
            if not output:
                logger.warning("No log output received", device_ip=device_info['ip_address'])
                return []
            
            # 解析日志
            log_entries = self._parse_logs(
                output, 
                device_info['id'], 
                vendor,
                max_entries
            )
            
            logger.info("Log collection completed", 
                       device_ip=device_info['ip_address'],
                       entries_count=len(log_entries))
            
            return log_entries
            
        except Exception as e:
            logger.error("Failed to collect logs", 
                        device_ip=device_info.get('ip_address', 'unknown'),
                        error=str(e))
            return []
        finally:
            await self.ssh_service.disconnect()
    
    def _parse_logs(
        self, 
        log_output: str, 
        device_id: int, 
        vendor: str,
        max_entries: int
    ) -> List[LogEntry]:
        """解析日志输出
        
        Args:
            log_output: 原始日志输出
            device_id: 设备ID
            vendor: 设备厂商
            max_entries: 最大条目数
            
        Returns:
            List[LogEntry]: 解析后的日志条目
        """
        entries = []
        lines = log_output.strip().split('\n')
        collected_at = datetime.now()
        
        for line in lines[:max_entries]:
            line = line.strip()
            if not line or self._is_header_line(line):
                continue
            
            try:
                entry = self._parse_single_log_line(line, device_id, vendor, collected_at)
                if entry:
                    entries.append(entry)
            except Exception as e:
                logger.debug("Failed to parse log line", line=line, error=str(e))
                continue
        
        return entries
    
    def _parse_single_log_line(
        self, 
        line: str, 
        device_id: int, 
        vendor: str,
        collected_at: datetime
    ) -> Optional[LogEntry]:
        """解析单行日志
        
        Args:
            line: 日志行
            device_id: 设备ID
            vendor: 设备厂商
            collected_at: 采集时间
            
        Returns:
            Optional[LogEntry]: 解析后的日志条目
        """
        # 根据厂商选择解析模式
        if vendor == 'cisco':
            return self._parse_cisco_log(line, device_id, collected_at)
        elif vendor == 'huawei':
            return self._parse_huawei_log(line, device_id, collected_at)
        elif vendor == 'h3c':
            return self._parse_h3c_log(line, device_id, collected_at)
        elif vendor == 'juniper':
            return self._parse_juniper_log(line, device_id, collected_at)
        else:
            return self._parse_generic_log(line, device_id, collected_at)
    
    def _parse_cisco_log(self, line: str, device_id: int, collected_at: datetime) -> Optional[LogEntry]:
        """解析Cisco日志格式
        
        格式示例:
        *Mar  1 00:01:46.611: %SYS-5-CONFIG_I: Configured from console by console
        """
        # Cisco日志格式正则表达式
        cisco_pattern = r'^\*?(\w+\s+\d+\s+\d+:\d+:\d+(?:\.\d+)?):?\s*%?([^:]+):\s*(.+)$'
        match = re.match(cisco_pattern, line)
        
        if match:
            timestamp_str, facility_info, message = match.groups()
            
            # 解析时间戳
            log_timestamp = self._parse_timestamp(timestamp_str, 'cisco')
            
            # 解析设施和级别信息
            level, facility = self._parse_facility_info(facility_info)
            
            return LogEntry(
                device_id=device_id,
                level=level,
                facility=facility,
                source=LogSource.SSH,
                message=message.strip(),
                raw_message=line,
                log_timestamp=log_timestamp,
                collected_at=collected_at
            )
        
        return None
    
    def _parse_huawei_log(self, line: str, device_id: int, collected_at: datetime) -> Optional[LogEntry]:
        """解析华为日志格式
        
        格式示例:
        2024-01-01 10:30:45.123 [IFNET/4/LINK_STATE]:Interface GigabitEthernet0/0/1 has turned UP.
        """
        # 华为日志格式正则表达式
        huawei_pattern = r'^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?)\s+\[([^\]]+)\]:\s*(.+)$'
        match = re.match(huawei_pattern, line)
        
        if match:
            timestamp_str, facility_info, message = match.groups()
            
            # 解析时间戳
            log_timestamp = self._parse_timestamp(timestamp_str, 'huawei')
            
            # 解析设施和级别信息
            level, facility = self._parse_facility_info(facility_info)
            
            return LogEntry(
                device_id=device_id,
                level=level,
                facility=facility,
                source=LogSource.SSH,
                message=message.strip(),
                raw_message=line,
                log_timestamp=log_timestamp,
                collected_at=collected_at
            )
        
        return None
    
    def _parse_h3c_log(self, line: str, device_id: int, collected_at: datetime) -> Optional[LogEntry]:
        """解析H3C日志格式（类似华为）"""
        return self._parse_huawei_log(line, device_id, collected_at)
    
    def _parse_juniper_log(self, line: str, device_id: int, collected_at: datetime) -> Optional[LogEntry]:
        """解析Juniper日志格式
        
        格式示例:
        Jan  1 10:30:45  hostname rpd[1234]: RPD_OSPF_NBRDOWN: OSPF neighbor 192.168.1.1 (realm ospf-v2 area 0.0.0.0 interface ge-0/0/0.0) state changed from Full to Down
        """
        # Juniper日志格式正则表达式
        juniper_pattern = r'^(\w+\s+\d+\s+\d+:\d+:\d+)\s+(\S+)\s+([^:]+):\s*(.+)$'
        match = re.match(juniper_pattern, line)
        
        if match:
            timestamp_str, hostname, process_info, message = match.groups()
            
            # 解析时间戳
            log_timestamp = self._parse_timestamp(timestamp_str, 'juniper')
            
            # 解析级别和设施
            level = self._detect_log_level(message)
            facility = self._detect_log_facility(message)
            
            return LogEntry(
                device_id=device_id,
                level=level,
                facility=facility,
                source=LogSource.SSH,
                message=message.strip(),
                raw_message=line,
                source_process=process_info,
                log_timestamp=log_timestamp,
                collected_at=collected_at
            )
        
        return None
    
    def _parse_generic_log(self, line: str, device_id: int, collected_at: datetime) -> Optional[LogEntry]:
        """解析通用日志格式"""
        # 尝试提取基本信息
        level = self._detect_log_level(line)
        facility = self._detect_log_facility(line)
        
        return LogEntry(
            device_id=device_id,
            level=level,
            facility=facility,
            source=LogSource.SSH,
            message=line.strip(),
            raw_message=line,
            log_timestamp=collected_at,  # 使用采集时间作为日志时间
            collected_at=collected_at
        )
    
    def _parse_timestamp(self, timestamp_str: str, vendor: str) -> Optional[datetime]:
        """解析时间戳"""
        try:
            current_year = datetime.now().year
            
            if vendor == 'cisco':
                # 格式: Mar  1 00:01:46.611
                timestamp_str = timestamp_str.strip('*')
                if '.' in timestamp_str:
                    dt = datetime.strptime(f"{current_year} {timestamp_str}", "%Y %b %d %H:%M:%S.%f")
                else:
                    dt = datetime.strptime(f"{current_year} {timestamp_str}", "%Y %b %d %H:%M:%S")
                return dt
            
            elif vendor in ['huawei', 'h3c']:
                # 格式: 2024-01-01 10:30:45.123
                if '.' in timestamp_str:
                    return datetime.strptime(timestamp_str, "%Y-%m-%d %H:%M:%S.%f")
                else:
                    return datetime.strptime(timestamp_str, "%Y-%m-%d %H:%M:%S")
            
            elif vendor == 'juniper':
                # 格式: Jan  1 10:30:45
                return datetime.strptime(f"{current_year} {timestamp_str}", "%Y %b %d %H:%M:%S")
            
        except Exception as e:
            logger.debug("Failed to parse timestamp", timestamp=timestamp_str, error=str(e))
        
        return None
    
    def _parse_facility_info(self, facility_info: str) -> Tuple[LogLevel, LogFacility]:
        """解析设施和级别信息
        
        Args:
            facility_info: 设施信息字符串，如 "SYS-5-CONFIG_I" 或 "IFNET/4/LINK_STATE"
            
        Returns:
            Tuple[LogLevel, LogFacility]: 日志级别和设施类型
        """
        # 提取级别数字
        level_match = re.search(r'[/-](\d+)[/-]', facility_info)
        if level_match:
            level_num = int(level_match.group(1))
            # Cisco/华为级别映射: 0-2=CRITICAL, 3=ERROR, 4=WARNING, 5-6=INFO, 7=DEBUG
            if level_num <= 2:
                level = LogLevel.CRITICAL
            elif level_num == 3:
                level = LogLevel.ERROR
            elif level_num == 4:
                level = LogLevel.WARNING
            elif level_num in [5, 6]:
                level = LogLevel.INFO
            else:
                level = LogLevel.DEBUG
        else:
            level = LogLevel.INFO
        
        # 检测设施类型
        facility = self._detect_log_facility(facility_info)
        
        return level, facility
    
    def _detect_log_level(self, text: str) -> LogLevel:
        """检测日志级别"""
        text_upper = text.upper()
        
        for level, patterns in self.level_patterns.items():
            for pattern in patterns:
                if re.search(pattern, text_upper):
                    return level
        
        return LogLevel.INFO  # 默认级别
    
    def _detect_log_facility(self, text: str) -> LogFacility:
        """检测日志设施"""
        text_upper = text.upper()
        
        for facility, patterns in self.facility_patterns.items():
            for pattern in patterns:
                if re.search(pattern, text_upper):
                    return facility
        
        return LogFacility.SYSTEM  # 默认设施
    
    def _is_header_line(self, line: str) -> bool:
        """判断是否为标题行"""
        header_patterns = [
            r'^Syslog logging:',
            r'^Console logging:',
            r'^Monitor logging:',
            r'^Buffer logging:',
            r'^Logging to',
            r'^Log Buffer',
            r'^\s*$',  # 空行
            r'^-+$',   # 分隔线
            r'^=+$'    # 分隔线
        ]
        
        for pattern in header_patterns:
            if re.match(pattern, line):
                return True
        
        return False
    
    async def batch_collect_logs(
        self, 
        devices: List[Dict[str, Any]], 
        log_type: str = 'system',
        max_concurrent: int = 5
    ) -> Dict[int, List[LogEntry]]:
        """批量采集设备日志
        
        Args:
            devices: 设备信息列表
            log_type: 日志类型
            max_concurrent: 最大并发数
            
        Returns:
            Dict[int, List[LogEntry]]: 设备ID到日志条目列表的映射
        """
        semaphore = asyncio.Semaphore(max_concurrent)
        results = {}
        
        async def collect_single_device(device_info):
            async with semaphore:
                device_id = device_info['id']
                try:
                    logs = await self.collect_device_logs(device_info, log_type)
                    results[device_id] = logs
                except Exception as e:
                    logger.error("Failed to collect logs for device", 
                               device_id=device_id, error=str(e))
                    results[device_id] = []
        
        # 创建并发任务
        tasks = [collect_single_device(device) for device in devices]
        await asyncio.gather(*tasks, return_exceptions=True)
        
        return results