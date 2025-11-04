"""
巡检脚本模板库
提供常用的巡检脚本模板，用户可以基于这些模板创建自定义检查项
"""

from typing import Dict, List, Any


class InspectionScriptTemplates:
    """巡检脚本模板库"""
    
    @staticmethod
    def get_python_templates() -> List[Dict[str, Any]]:
        """获取Python脚本模板"""
        return [
            {
                "name": "网络连通性检查",
                "description": "使用ping命令检查设备网络连通性",
                "category": "connectivity",
                "script_type": "python",
                "parameters": [
                    {"name": "timeout", "type": "integer", "default": 5, "description": "超时时间(秒)"},
                    {"name": "count", "type": "integer", "default": 4, "description": "ping次数"}
                ],
                "script_content": """
import subprocess
import json
import re

# 从环境变量获取设备IP
device_ip = device_info.get('ip_address')
timeout = script_params.get('timeout', 5)
count = script_params.get('count', 4)

if not device_ip:
    result = {
        "status": "fail",
        "message": "设备IP地址不能为空",
        "value": None
    }
else:
    try:
        # 执行ping命令
        cmd = f"ping -c {count} -W {timeout} {device_ip}"
        proc = subprocess.run(cmd, shell=True, capture_output=True, text=True)
        
        if proc.returncode == 0:
            # 解析ping结果
            output = proc.stdout
            loss_match = re.search(r'(\d+)% packet loss', output)
            time_match = re.search(r'time=([0-9.]+)ms', output)
            
            packet_loss = int(loss_match.group(1)) if loss_match else 0
            avg_time = float(time_match.group(1)) if time_match else 0
            
            if packet_loss == 0:
                result = {
                    "status": "pass",
                    "message": f"设备 {device_ip} 连通性正常，平均延迟 {avg_time}ms",
                    "value": {
                        "packet_loss": packet_loss,
                        "avg_response_time": avg_time,
                        "reachable": True
                    }
                }
            else:
                result = {
                    "status": "warning" if packet_loss < 50 else "fail",
                    "message": f"设备 {device_ip} 有 {packet_loss}% 丢包",
                    "value": {
                        "packet_loss": packet_loss,
                        "avg_response_time": avg_time,
                        "reachable": packet_loss < 100
                    }
                }
        else:
            result = {
                "status": "fail",
                "message": f"无法ping通设备 {device_ip}",
                "value": {
                    "packet_loss": 100,
                    "reachable": False
                }
            }
    except Exception as e:
        result = {
            "status": "fail",
            "message": f"ping检查执行失败: {str(e)}",
            "value": None
        }
"""
            },
            {
                "name": "端口扫描检查",
                "description": "检查指定端口是否开放",
                "category": "connectivity",
                "script_type": "python",
                "parameters": [
                    {"name": "ports", "type": "string", "default": "22,23,80,443", "description": "要检查的端口列表(逗号分隔)"},
                    {"name": "timeout", "type": "integer", "default": 3, "description": "连接超时时间(秒)"}
                ],
                "script_content": """
import socket
import json
from concurrent.futures import ThreadPoolExecutor
import threading

device_ip = device_info.get('ip_address')
ports_str = script_params.get('ports', '22,23,80,443')
timeout = script_params.get('timeout', 3)

try:
    ports = [int(p.strip()) for p in ports_str.split(',')]
except:
    result = {
        "status": "fail",
        "message": "端口参数格式错误",
        "value": None
    }
    exit()

def check_port(ip, port, timeout):
    try:
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(timeout)
        result = sock.connect_ex((ip, port))
        sock.close()
        return port, result == 0
    except:
        return port, False

# 多线程检查端口
open_ports = []
closed_ports = []

with ThreadPoolExecutor(max_workers=10) as executor:
    futures = [executor.submit(check_port, device_ip, port, timeout) for port in ports]
    for future in futures:
        port, is_open = future.result()
        if is_open:
            open_ports.append(port)
        else:
            closed_ports.append(port)

total_ports = len(ports)
open_count = len(open_ports)
open_rate = (open_count / total_ports) * 100

if open_count > 0:
    result = {
        "status": "pass",
        "message": f"检测到 {open_count}/{total_ports} 个端口开放",
        "value": {
            "open_ports": sorted(open_ports),
            "closed_ports": sorted(closed_ports),
            "open_rate": round(open_rate, 2),
            "total_checked": total_ports
        }
    }
else:
    result = {
        "status": "warning",
        "message": f"所有 {total_ports} 个端口都未开放",
        "value": {
            "open_ports": [],
            "closed_ports": sorted(closed_ports),
            "open_rate": 0,
            "total_checked": total_ports
        }
    }
"""
            },
            {
                "name": "HTTP服务检查",
                "description": "检查HTTP/HTTPS服务状态和响应时间",
                "category": "service",
                "script_type": "python",
                "parameters": [
                    {"name": "port", "type": "integer", "default": 80, "description": "HTTP端口"},
                    {"name": "https", "type": "boolean", "default": False, "description": "是否使用HTTPS"},
                    {"name": "path", "type": "string", "default": "/", "description": "检查路径"},
                    {"name": "timeout", "type": "integer", "default": 10, "description": "超时时间(秒)"}
                ],
                "script_content": """
import urllib.request
import urllib.error
import time
import ssl
import json

device_ip = device_info.get('ip_address')
port = script_params.get('port', 80)
use_https = script_params.get('https', False)
path = script_params.get('path', '/')
timeout = script_params.get('timeout', 10)

protocol = "https" if use_https else "http"
url = f"{protocol}://{device_ip}:{port}{path}"

try:
    start_time = time.time()
    
    # 创建请求
    request = urllib.request.Request(url)
    request.add_header('User-Agent', 'InspectionSystem/1.0')
    
    # 如果是HTTPS，忽略SSL证书验证
    context = ssl.create_default_context()
    if use_https:
        context.check_hostname = False
        context.verify_mode = ssl.CERT_NONE
    
    # 发送请求
    with urllib.request.urlopen(request, timeout=timeout, context=context) as response:
        response_time = time.time() - start_time
        status_code = response.getcode()
        content_length = len(response.read())
        headers = dict(response.headers)
        
        if 200 <= status_code < 400:
            result = {
                "status": "pass",
                "message": f"HTTP服务正常，状态码: {status_code}, 响应时间: {response_time:.3f}s",
                "value": {
                    "url": url,
                    "status_code": status_code,
                    "response_time": round(response_time, 3),
                    "content_length": content_length,
                    "server": headers.get('Server', 'Unknown'),
                    "available": True
                }
            }
        else:
            result = {
                "status": "warning",
                "message": f"HTTP服务响应异常，状态码: {status_code}",
                "value": {
                    "url": url,
                    "status_code": status_code,
                    "response_time": round(response_time, 3),
                    "available": False
                }
            }

except urllib.error.HTTPError as e:
    result = {
        "status": "fail",
        "message": f"HTTP请求失败: {e.code} {e.reason}",
        "value": {
            "url": url,
            "status_code": e.code,
            "error": str(e),
            "available": False
        }
    }
except urllib.error.URLError as e:
    result = {
        "status": "fail",
        "message": f"无法连接到HTTP服务: {str(e)}",
        "value": {
            "url": url,
            "error": str(e),
            "available": False
        }
    }
except Exception as e:
    result = {
        "status": "fail",
        "message": f"HTTP检查执行失败: {str(e)}",
        "value": {
            "url": url,
            "error": str(e),
            "available": False
        }
    }
"""
            }
        ]
    
    @staticmethod
    def get_shell_templates() -> List[Dict[str, Any]]:
        """获取Shell脚本模板"""
        return [
            {
                "name": "系统资源检查",
                "description": "检查系统CPU、内存、磁盘使用情况",
                "category": "resource",
                "script_type": "shell",
                "parameters": [
                    {"name": "cpu_threshold", "type": "integer", "default": 80, "description": "CPU使用率警告阈值(%)"},
                    {"name": "memory_threshold", "type": "integer", "default": 85, "description": "内存使用率警告阈值(%)"},
                    {"name": "disk_threshold", "type": "integer", "default": 90, "description": "磁盘使用率警告阈值(%)"}
                ],
                "script_content": """#!/bin/bash

# 获取参数
CPU_THRESHOLD=${PARAM_CPU_THRESHOLD:-80}
MEMORY_THRESHOLD=${PARAM_MEMORY_THRESHOLD:-85}
DISK_THRESHOLD=${PARAM_DISK_THRESHOLD:-90}

# 检查CPU使用率
CPU_USAGE=$(top -bn1 | grep "Cpu(s)" | sed "s/.*, *\\([0-9.]*\\)%* id.*/\\1/" | awk '{print 100 - $1}')
CPU_USAGE=${CPU_USAGE%.*}  # 取整数部分

# 检查内存使用率
MEMORY_INFO=$(free | grep Mem)
TOTAL_MEM=$(echo $MEMORY_INFO | awk '{print $2}')
USED_MEM=$(echo $MEMORY_INFO | awk '{print $3}')
MEMORY_USAGE=$((USED_MEM * 100 / TOTAL_MEM))

# 检查磁盘使用率
DISK_USAGE=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')

# 生成结果
echo "{"
echo '  "cpu_usage": '$CPU_USAGE','
echo '  "memory_usage": '$MEMORY_USAGE','
echo '  "disk_usage": '$DISK_USAGE','
echo '  "thresholds": {'
echo '    "cpu": '$CPU_THRESHOLD','
echo '    "memory": '$MEMORY_THRESHOLD','
echo '    "disk": '$DISK_THRESHOLD
echo '  },'

# 判断状态
STATUS="pass"
MESSAGE="系统资源使用正常"

if [ $CPU_USAGE -gt $CPU_THRESHOLD ] || [ $MEMORY_USAGE -gt $MEMORY_THRESHOLD ] || [ $DISK_USAGE -gt $DISK_THRESHOLD ]; then
    STATUS="warning"
    MESSAGE="系统资源使用率较高"
fi

if [ $CPU_USAGE -gt 95 ] || [ $MEMORY_USAGE -gt 95 ] || [ $DISK_USAGE -gt 95 ]; then
    STATUS="fail"
    MESSAGE="系统资源使用率过高"
fi

echo '  "status": "'$STATUS'",'
echo '  "message": "'$MESSAGE'"'
echo "}"
"""
            },
            {
                "name": "网络接口检查",
                "description": "检查网络接口状态和流量统计",
                "category": "network",
                "script_type": "shell",
                "parameters": [
                    {"name": "interface", "type": "string", "default": "eth0", "description": "要检查的网络接口名"}
                ],
                "script_content": """#!/bin/bash

INTERFACE=${PARAM_INTERFACE:-eth0}

# 检查接口是否存在
if ! ip link show $INTERFACE &> /dev/null; then
    echo '{"status": "fail", "message": "网络接口 '$INTERFACE' 不存在"}'
    exit 1
fi

# 获取接口状态
INTERFACE_STATE=$(ip link show $INTERFACE | grep "state" | awk '{print $9}')
INTERFACE_UP=$([ "$INTERFACE_STATE" = "UP" ] && echo "true" || echo "false")

# 获取IP地址
IP_ADDRESS=$(ip addr show $INTERFACE | grep "inet " | awk '{print $2}' | cut -d'/' -f1)

# 获取流量统计
RX_BYTES=$(cat /sys/class/net/$INTERFACE/statistics/rx_bytes)
TX_BYTES=$(cat /sys/class/net/$INTERFACE/statistics/tx_bytes)
RX_PACKETS=$(cat /sys/class/net/$INTERFACE/statistics/rx_packets)
TX_PACKETS=$(cat /sys/class/net/$INTERFACE/statistics/tx_packets)

# 转换为可读格式
RX_MB=$((RX_BYTES / 1024 / 1024))
TX_MB=$((TX_BYTES / 1024 / 1024))

# 生成结果
echo "{"
echo '  "interface": "'$INTERFACE'",'
echo '  "state": "'$INTERFACE_STATE'",'
echo '  "is_up": '$INTERFACE_UP','
echo '  "ip_address": "'${IP_ADDRESS:-"N/A"}'",'
echo '  "statistics": {'
echo '    "rx_bytes": '$RX_BYTES','
echo '    "tx_bytes": '$TX_BYTES','
echo '    "rx_packets": '$RX_PACKETS','
echo '    "tx_packets": '$TX_PACKETS','
echo '    "rx_mb": '$RX_MB','
echo '    "tx_mb": '$TX_MB
echo '  },'

if [ "$INTERFACE_UP" = "true" ]; then
    echo '  "status": "pass",'
    echo '  "message": "网络接口 '$INTERFACE' 状态正常"'
else
    echo '  "status": "fail",'
    echo '  "message": "网络接口 '$INTERFACE' 未启用"'
fi

echo "}"
"""
            }
        ]
    
    @staticmethod
    def get_all_templates() -> Dict[str, List[Dict[str, Any]]]:
        """获取所有脚本模板"""
        return {
            "python": InspectionScriptTemplates.get_python_templates(),
            "shell": InspectionScriptTemplates.get_shell_templates()
        }
    
    @staticmethod
    def get_template_by_name(name: str) -> Optional[Dict[str, Any]]:
        """根据名称获取模板"""
        all_templates = InspectionScriptTemplates.get_all_templates()
        
        for script_type, templates in all_templates.items():
            for template in templates:
                if template["name"] == name:
                    return template
        
        return None
    
    @staticmethod
    def get_templates_by_category(category: str) -> List[Dict[str, Any]]:
        """根据分类获取模板"""
        all_templates = InspectionScriptTemplates.get_all_templates()
        result = []
        
        for script_type, templates in all_templates.items():
            for template in templates:
                if template.get("category") == category:
                    result.append(template)
        
        return result