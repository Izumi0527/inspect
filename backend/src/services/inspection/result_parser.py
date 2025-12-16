"""
巡检结果解析器
用于解析和标准化来自不同设备和协议的巡检数据
"""
import re
import json
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Any, Union, Tuple
from dataclasses import dataclass, field
from enum import Enum
import structlog
from abc import ABC, abstractmethod

from src.models.inspection import CheckItemStatus
from src.infrastructure.device_connection import CheckResult

logger = structlog.get_logger()


class ParseResultType(str, Enum):
    """解析结果类型"""
    NUMERIC = "numeric"
    PERCENTAGE = "percentage"
    STATUS = "status"
    LIST = "list"
    BOOLEAN = "boolean"
    TEXT = "text"
    JSON = "json"


@dataclass
class ParsePattern:
    """解析模式定义"""
    name: str
    pattern: str  # 正则表达式或其他模式
    result_type: ParseResultType
    unit: Optional[str] = None
    transform_func: Optional[str] = None  # 转换函数名称
    description: str = ""
    
    def to_dict(self) -> Dict[str, Any]:
        """转换为字典"""
        return {
            "name": self.name,
            "pattern": self.pattern,
            "result_type": self.result_type.value,
            "unit": self.unit,
            "transform_func": self.transform_func,
            "description": self.description
        }


class BaseResultParser(ABC):
    """结果解析器基类"""
    
    def __init__(self):
        self.logger = structlog.get_logger()
    
    @abstractmethod
    def parse(self, raw_data: str, pattern: ParsePattern) -> Any:
        """解析原始数据"""
        pass
    
    @abstractmethod
    def validate_result(self, parsed_result: Any, expected_value: Any) -> CheckItemStatus:
        """验证解析结果"""
        pass


class RegexResultParser(BaseResultParser):
    """基于正则表达式的结果解析器"""
    
    def __init__(self):
        super().__init__()
        
        # 内置转换函数
        self.transform_functions = {
            "to_float": lambda x: float(x) if x else 0.0,
            "to_int": lambda x: int(float(x)) if x else 0,
            "to_percentage": lambda x: float(x.replace('%', '')) if x else 0.0,
            "to_upper": lambda x: x.upper() if x else "",
            "to_lower": lambda x: x.lower() if x else "",
            "strip_whitespace": lambda x: x.strip() if x else "",
            "bytes_to_mb": lambda x: float(x) / (1024 * 1024) if x else 0.0,
            "seconds_to_days": lambda x: float(x) / (24 * 3600) if x else 0.0,
        }
    
    def parse(self, raw_data: str, pattern: ParsePattern) -> Any:
        """使用正则表达式解析数据"""
        try:
            if not raw_data:
                return None
            
            # 编译正则表达式
            regex = re.compile(pattern.pattern, re.MULTILINE | re.IGNORECASE)
            
            # 执行匹配
            matches = regex.findall(raw_data)
            
            if not matches:
                self.logger.warning("No matches found", 
                                  pattern=pattern.pattern,
                                  data_preview=raw_data[:100])
                return None
            
            # 处理匹配结果
            if len(matches) == 1:
                # 单个匹配
                match = matches[0]
                if isinstance(match, tuple):
                    # 多个捕获组，返回第一个非空的
                    result = next((g for g in match if g), None)
                else:
                    result = match
            else:
                # 多个匹配，根据结果类型处理
                if pattern.result_type == ParseResultType.LIST:
                    result = matches
                else:
                    # 取第一个匹配
                    match = matches[0]
                    result = match[0] if isinstance(match, tuple) else match
            
            # 应用转换函数
            if pattern.transform_func and pattern.transform_func in self.transform_functions:
                transform_func = self.transform_functions[pattern.transform_func]
                result = transform_func(result)
            
            # 根据结果类型进行最终转换
            return self._convert_by_type(result, pattern.result_type)
            
        except Exception as e:
            self.logger.error("Regex parsing failed", 
                            pattern=pattern.pattern,
                            error=str(e),
                            data_preview=raw_data[:200])
            return None
    
    def _convert_by_type(self, value: Any, result_type: ParseResultType) -> Any:
        """根据结果类型转换值"""
        try:
            if value is None:
                return None
            
            if result_type == ParseResultType.NUMERIC:
                return float(value) if isinstance(value, str) else value
            elif result_type == ParseResultType.PERCENTAGE:
                if isinstance(value, str):
                    return float(value.replace('%', ''))
                return float(value)
            elif result_type == ParseResultType.BOOLEAN:
                if isinstance(value, str):
                    return value.lower() in ['true', 'yes', '1', 'on', 'up', 'active', 'enabled']
                return bool(value)
            elif result_type == ParseResultType.JSON:
                if isinstance(value, str):
                    return json.loads(value)
                return value
            elif result_type == ParseResultType.TEXT:
                return str(value)
            elif result_type == ParseResultType.STATUS:
                return str(value).strip()
            elif result_type == ParseResultType.LIST:
                if isinstance(value, list):
                    return value
                return [value]
            else:
                return value
                
        except Exception as e:
            self.logger.warning("Type conversion failed", 
                              value=value,
                              result_type=result_type.value,
                              error=str(e))
            return value
    
    def validate_result(self, parsed_result: Any, expected_value: Any) -> CheckItemStatus:
        """验证解析结果"""
        try:
            if parsed_result is None:
                return CheckItemStatus.ERROR
            
            if expected_value is None:
                return CheckItemStatus.PASS
            
            # 根据类型进行验证
            if isinstance(expected_value, dict):
                return self._validate_complex(parsed_result, expected_value)
            else:
                return self._validate_simple(parsed_result, expected_value)
                
        except Exception as e:
            self.logger.error("Result validation failed", 
                            parsed_result=parsed_result,
                            expected_value=expected_value,
                            error=str(e))
            return CheckItemStatus.ERROR
    
    def _validate_simple(self, parsed_result: Any, expected_value: Any) -> CheckItemStatus:
        """简单值验证"""
        if str(parsed_result) == str(expected_value):
            return CheckItemStatus.PASS
        else:
            return CheckItemStatus.FAIL
    
    def _validate_complex(self, parsed_result: Any, expected_value: Dict) -> CheckItemStatus:
        """复杂条件验证"""
        try:
            operator = expected_value.get("operator", "eq")
            target_value = expected_value.get("value")
            tolerance = expected_value.get("tolerance", 0)
            
            if operator == "eq":  # 等于
                return CheckItemStatus.PASS if parsed_result == target_value else CheckItemStatus.FAIL
            elif operator == "ne":  # 不等于
                return CheckItemStatus.PASS if parsed_result != target_value else CheckItemStatus.FAIL
            elif operator == "gt":  # 大于
                return CheckItemStatus.PASS if parsed_result > target_value else CheckItemStatus.FAIL
            elif operator == "gte":  # 大于等于
                return CheckItemStatus.PASS if parsed_result >= target_value else CheckItemStatus.FAIL
            elif operator == "lt":  # 小于
                return CheckItemStatus.PASS if parsed_result < target_value else CheckItemStatus.FAIL
            elif operator == "lte":  # 小于等于
                return CheckItemStatus.PASS if parsed_result <= target_value else CheckItemStatus.FAIL
            elif operator == "range":  # 范围内
                min_val = expected_value.get("min", float('-inf'))
                max_val = expected_value.get("max", float('inf'))
                return CheckItemStatus.PASS if min_val <= parsed_result <= max_val else CheckItemStatus.FAIL
            elif operator == "contains":  # 包含
                return CheckItemStatus.PASS if target_value in str(parsed_result) else CheckItemStatus.FAIL
            elif operator == "regex":  # 正则匹配
                return CheckItemStatus.PASS if re.search(target_value, str(parsed_result)) else CheckItemStatus.FAIL
            elif operator == "tolerance":  # 容差范围
                diff = abs(float(parsed_result) - float(target_value))
                return CheckItemStatus.PASS if diff <= tolerance else CheckItemStatus.FAIL
            else:
                self.logger.warning("Unknown operator", operator=operator)
                return CheckItemStatus.ERROR
                
        except Exception as e:
            self.logger.error("Complex validation failed", error=str(e))
            return CheckItemStatus.ERROR


class DeviceSpecificParser:
    """设备特定解析器"""
    
    def __init__(self):
        self.logger = structlog.get_logger()
        
        # 预定义的设备解析模式
        self.device_patterns = self._initialize_device_patterns()
        
        # 解析器实例
        self.regex_parser = RegexResultParser()
    
    def _initialize_device_patterns(self) -> Dict[str, Dict[str, ParsePattern]]:
        """初始化设备解析模式"""
        patterns = {
            # Cisco设备解析模式
            "cisco": {
                "cpu_usage": ParsePattern(
                    name="cisco_cpu_usage",
                    pattern=r"CPU utilization for five seconds: (\d+)%",
                    result_type=ParseResultType.PERCENTAGE,
                    unit="%",
                    transform_func="to_float",
                    description="Cisco设备CPU使用率"
                ),
                "memory_usage": ParsePattern(
                    name="cisco_memory_usage", 
                    pattern=r"Processor\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)",
                    result_type=ParseResultType.NUMERIC,
                    unit="bytes",
                    transform_func="to_int",
                    description="Cisco设备内存使用情况"
                ),
                "interface_status": ParsePattern(
                    name="cisco_interface_status",
                    pattern=r"(\S+)\s+is\s+(up|down),.*line protocol is (up|down)",
                    result_type=ParseResultType.LIST,
                    description="Cisco接口状态"
                ),
                "uptime": ParsePattern(
                    name="cisco_uptime",
                    pattern=r"uptime is (.+)",
                    result_type=ParseResultType.TEXT,
                    description="Cisco设备运行时间"
                ),
                "version": ParsePattern(
                    name="cisco_version",
                    pattern=r"Cisco IOS Software.*Version (\S+)",
                    result_type=ParseResultType.TEXT,
                    description="Cisco IOS版本"
                )
            },
            
            # 华为设备解析模式
            "huawei": {
                "cpu_usage": ParsePattern(
                    name="huawei_cpu_usage",
                    pattern=r"CPU utilization:\s*(\d+)%",
                    result_type=ParseResultType.PERCENTAGE,
                    unit="%",
                    transform_func="to_float",
                    description="华为设备CPU使用率"
                ),
                "memory_usage": ParsePattern(
                    name="huawei_memory_usage",
                    pattern=r"Memory utilization:\s*(\d+)%",
                    result_type=ParseResultType.PERCENTAGE,
                    unit="%",
                    transform_func="to_float",
                    description="华为设备内存使用率"
                ),
                "interface_status": ParsePattern(
                    name="huawei_interface_status",
                    pattern=r"(\S+)\s+(\w+)\s+(up|down)\s+(up|down)",
                    result_type=ParseResultType.LIST,
                    description="华为接口状态"
                ),
                "version": ParsePattern(
                    name="huawei_version",
                    pattern=r"VRP.*Version\s+(\S+)",
                    result_type=ParseResultType.TEXT,
                    description="华为VRP版本"
                )
            },
            
            # H3C设备解析模式
            "h3c": {
                "cpu_usage": ParsePattern(
                    name="h3c_cpu_usage",
                    pattern=r"CPU utilization in last 5 minutes: (\d+)%",
                    result_type=ParseResultType.PERCENTAGE,
                    unit="%",
                    transform_func="to_float",
                    description="H3C设备CPU使用率"
                ),
                "memory_usage": ParsePattern(
                    name="h3c_memory_usage",
                    pattern=r"Memory utilization: (\d+)%",
                    result_type=ParseResultType.PERCENTAGE,
                    unit="%",
                    transform_func="to_float",
                    description="H3C设备内存使用率"
                )
            }
        }
        
        return patterns
    
    def parse_device_output(
        self, 
        raw_output: str, 
        device_vendor: str, 
        check_type: str,
        expected_value: Any = None
    ) -> CheckResult:
        """解析设备输出"""
        try:
            vendor = device_vendor.lower()
            
            # 查找对应的解析模式
            if vendor not in self.device_patterns:
                return CheckResult(
                    check_item_name=check_type,
                    check_item_type=check_type,
                    status=CheckItemStatus.ERROR.value,
                    message=f"不支持的设备厂商: {device_vendor}"
                )
            
            vendor_patterns = self.device_patterns[vendor]
            if check_type not in vendor_patterns:
                return CheckResult(
                    check_item_name=check_type,
                    check_item_type=check_type,
                    status=CheckItemStatus.ERROR.value,
                    message=f"不支持的检查类型: {check_type}"
                )
            
            pattern = vendor_patterns[check_type]
            
            # 执行解析
            parsed_result = self.regex_parser.parse(raw_output, pattern)
            
            if parsed_result is None:
                return CheckResult(
                    check_item_name=check_type,
                    check_item_type=check_type,
                    status=CheckItemStatus.ERROR.value,
                    message="解析失败，未找到匹配的数据",
                    error_details={"raw_output_preview": raw_output[:200]}
                )
            
            # 验证结果
            validation_status = self.regex_parser.validate_result(parsed_result, expected_value)
            
            # 构建检查结果
            return CheckResult(
                check_item_name=check_type,
                check_item_type=check_type,
                status=validation_status.value,
                expected_value=str(expected_value) if expected_value else None,
                actual_value=str(parsed_result),
                message=self._generate_result_message(validation_status, parsed_result, expected_value),
                additional_info={
                    "pattern_used": pattern.name,
                    "result_type": pattern.result_type.value,
                    "unit": pattern.unit
                }
            )
            
        except Exception as e:
            self.logger.error("Device output parsing failed", 
                            device_vendor=device_vendor,
                            check_type=check_type,
                            error=str(e))
            
            return CheckResult(
                check_item_name=check_type,
                check_item_type=check_type,
                status=CheckItemStatus.ERROR.value,
                message=f"解析异常: {str(e)}",
                error_details={"exception": str(e)}
            )
    
    def _generate_result_message(
        self, 
        status: CheckItemStatus, 
        actual_value: Any, 
        expected_value: Any
    ) -> str:
        """生成结果消息"""
        if status == CheckItemStatus.PASS:
            return f"检查通过，实际值: {actual_value}"
        elif status == CheckItemStatus.FAIL:
            return f"检查失败，实际值: {actual_value}，期望值: {expected_value}"
        elif status == CheckItemStatus.ERROR:
            return f"检查出错，实际值: {actual_value}"
        else:
            return f"检查跳过，实际值: {actual_value}"
    
    def add_custom_pattern(self, vendor: str, check_type: str, pattern: ParsePattern):
        """添加自定义解析模式"""
        try:
            vendor = vendor.lower()
            
            if vendor not in self.device_patterns:
                self.device_patterns[vendor] = {}
            
            self.device_patterns[vendor][check_type] = pattern
            
            self.logger.info("Custom pattern added", 
                           vendor=vendor,
                           check_type=check_type,
                           pattern_name=pattern.name)
            
        except Exception as e:
            self.logger.error("Failed to add custom pattern", 
                            vendor=vendor,
                            check_type=check_type,
                            error=str(e))
    
    def get_supported_vendors(self) -> List[str]:
        """获取支持的设备厂商列表"""
        return list(self.device_patterns.keys())
    
    def get_supported_check_types(self, vendor: str) -> List[str]:
        """获取指定厂商支持的检查类型"""
        vendor = vendor.lower()
        return list(self.device_patterns.get(vendor, {}).keys())
    
    def export_patterns(self) -> Dict[str, Any]:
        """导出所有解析模式"""
        exported = {}
        for vendor, patterns in self.device_patterns.items():
            exported[vendor] = {
                check_type: pattern.to_dict()
                for check_type, pattern in patterns.items()
            }
        return exported
    
    def import_patterns(self, patterns_data: Dict[str, Any]):
        """导入解析模式"""
        try:
            for vendor, vendor_patterns in patterns_data.items():
                if vendor not in self.device_patterns:
                    self.device_patterns[vendor] = {}
                
                for check_type, pattern_data in vendor_patterns.items():
                    pattern = ParsePattern(
                        name=pattern_data["name"],
                        pattern=pattern_data["pattern"],
                        result_type=ParseResultType(pattern_data["result_type"]),
                        unit=pattern_data.get("unit"),
                        transform_func=pattern_data.get("transform_func"),
                        description=pattern_data.get("description", "")
                    )
                    self.device_patterns[vendor][check_type] = pattern
            
            self.logger.info("Patterns imported successfully")
            
        except Exception as e:
            self.logger.error("Failed to import patterns", error=str(e))
            raise


# 全局解析器实例
inspection_result_parser = DeviceSpecificParser()