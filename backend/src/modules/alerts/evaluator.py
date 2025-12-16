"""
告警规则评估器

负责评估告警条件和获取指标值
"""
from typing import Any, Optional
import structlog

logger = structlog.get_logger()


class AlertEvaluator:
    """告警规则评估器"""

    @staticmethod
    def get_metric_value(metrics: dict, metric_name: str) -> Optional[Any]:
        """从指标数据中获取指定指标的值
        
        支持嵌套属性，如 "connectivity.reachable"
        """
        try:
            keys = metric_name.split(".")
            value = metrics
            
            for key in keys:
                if isinstance(value, dict) and key in value:
                    value = value[key]
                else:
                    return None
            
            return value
        except Exception:
            return None

    @staticmethod
    def evaluate_condition(current_value: Any, operator: str, threshold_value: Any) -> bool:
        """评估告警条件
        
        Args:
            current_value: 当前指标值
            operator: 比较运算符 (>, <, >=, <=, ==, !=)
            threshold_value: 阈值
            
        Returns:
            条件是否满足
        """
        try:
            if operator == ">":
                return current_value > threshold_value
            elif operator == "<":
                return current_value < threshold_value
            elif operator == ">=":
                return current_value >= threshold_value
            elif operator == "<=":
                return current_value <= threshold_value
            elif operator == "==":
                return current_value == threshold_value
            elif operator == "!=":
                return current_value != threshold_value
            else:
                return False
        except Exception:
            return False

    @staticmethod
    def generate_alert_message(device_info: dict, rule: dict, current_value: Any) -> str:
        """生成告警消息
        
        Args:
            device_info: 设备信息
            rule: 告警规则
            current_value: 当前指标值
            
        Returns:
            格式化的告警消息
        """
        device_name = device_info.get("name", f"设备{device_info.get('id')}")
        ip_address = device_info.get("ip_address", "Unknown")
        metric_name = rule["metric_name"]
        operator = rule["operator"]
        threshold = rule["threshold_value"]
        
        message_templates = {
            "connectivity.reachable": f"设备 {device_name} ({ip_address}) 连通性异常，设备不可达",
            "cpu_usage": f"设备 {device_name} ({ip_address}) CPU使用率 {current_value}% 超过阈值 {threshold}%",
            "memory_usage": f"设备 {device_name} ({ip_address}) 内存使用率 {current_value}% 超过阈值 {threshold}%",
            "response_time": f"设备 {device_name} ({ip_address}) 响应时间 {current_value}ms 超过阈值 {threshold}ms",
        }
        
        return message_templates.get(
            metric_name,
            f"设备 {device_name} ({ip_address}) {metric_name} {current_value} {operator} {threshold}"
        )


# 全局实例
alert_evaluator = AlertEvaluator()
