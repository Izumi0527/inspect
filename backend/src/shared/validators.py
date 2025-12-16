"""
通用验证器 - 提供常用的数据验证函数
"""
import re
from typing import Optional, List, Any
from ipaddress import ip_address, ip_network


def validate_ip_address(ip: str) -> bool:
    """
    验证IP地址格式
    
    Args:
        ip: IP地址字符串
        
    Returns:
        是否为有效的IP地址
    """
    try:
        ip_address(ip)
        return True
    except ValueError:
        return False


def validate_ip_network(network: str) -> bool:
    """
    验证IP网段格式
    
    Args:
        network: IP网段字符串（如 192.168.1.0/24）
        
    Returns:
        是否为有效的IP网段
    """
    try:
        ip_network(network, strict=False)
        return True
    except ValueError:
        return False


def validate_mac_address(mac: str) -> bool:
    """
    验证MAC地址格式
    
    支持格式:
    - AA:BB:CC:DD:EE:FF
    - AA-BB-CC-DD-EE-FF
    - AABBCCDDEEFF
    
    Args:
        mac: MAC地址字符串
        
    Returns:
        是否为有效的MAC地址
    """
    patterns = [
        r'^([0-9A-Fa-f]{2}:){5}[0-9A-Fa-f]{2}$',  # AA:BB:CC:DD:EE:FF
        r'^([0-9A-Fa-f]{2}-){5}[0-9A-Fa-f]{2}$',  # AA-BB-CC-DD-EE-FF
        r'^[0-9A-Fa-f]{12}$'                       # AABBCCDDEEFF
    ]
    return any(re.match(pattern, mac) for pattern in patterns)


def validate_port(port: int) -> bool:
    """
    验证端口号
    
    Args:
        port: 端口号
        
    Returns:
        是否为有效的端口号（1-65535）
    """
    return isinstance(port, int) and 1 <= port <= 65535


def validate_email(email: str) -> bool:
    """
    验证邮箱格式
    
    Args:
        email: 邮箱地址
        
    Returns:
        是否为有效的邮箱格式
    """
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return bool(re.match(pattern, email))


def validate_hostname(hostname: str) -> bool:
    """
    验证主机名格式
    
    Args:
        hostname: 主机名
        
    Returns:
        是否为有效的主机名
    """
    if not hostname or len(hostname) > 253:
        return False
    
    # 允许以点结尾（FQDN）
    if hostname.endswith('.'):
        hostname = hostname[:-1]
    
    # 检查每个标签
    labels = hostname.split('.')
    pattern = r'^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$'
    
    return all(re.match(pattern, label) for label in labels)


def validate_snmp_community(community: str) -> bool:
    """
    验证SNMP Community字符串
    
    Args:
        community: SNMP Community字符串
        
    Returns:
        是否为有效的Community字符串
    """
    if not community:
        return False
    # Community字符串长度限制
    if len(community) > 255:
        return False
    # 不允许包含特殊控制字符
    return all(32 <= ord(c) <= 126 for c in community)


def validate_required_fields(data: dict, required: List[str]) -> List[str]:
    """
    验证必填字段
    
    Args:
        data: 待验证数据
        required: 必填字段列表
        
    Returns:
        缺失的字段列表
    """
    missing = []
    for field in required:
        value = data.get(field)
        if value is None or (isinstance(value, str) and not value.strip()):
            missing.append(field)
    return missing


def validate_string_length(
    value: str,
    min_length: int = 0,
    max_length: int = 255
) -> bool:
    """
    验证字符串长度
    
    Args:
        value: 字符串值
        min_length: 最小长度
        max_length: 最大长度
        
    Returns:
        是否在有效长度范围内
    """
    if not isinstance(value, str):
        return False
    return min_length <= len(value) <= max_length


def validate_in_list(value: Any, allowed: List[Any]) -> bool:
    """
    验证值是否在允许列表中
    
    Args:
        value: 待验证值
        allowed: 允许的值列表
        
    Returns:
        是否在允许列表中
    """
    return value in allowed


def sanitize_string(value: str, max_length: int = 255) -> str:
    """
    清理字符串（去除首尾空白，限制长度）
    
    Args:
        value: 原始字符串
        max_length: 最大长度
        
    Returns:
        清理后的字符串
    """
    if not isinstance(value, str):
        return ""
    return value.strip()[:max_length]
