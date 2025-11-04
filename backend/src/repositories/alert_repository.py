"""
告警数据访问层 (Repository Pattern)

职责：
- 抽象数据访问逻辑，隔离业务层和数据存储层
- 提供统一的数据访问接口，支持不同的存储实现（内存、数据库、缓存）
- 简化单元测试（可以轻松Mock Repository）

设计原则：
- 单一职责：只负责数据访问，不包含业务逻辑
- 依赖倒置：Service层依赖Repository接口，而非具体实现
- 开闭原则：扩展新的存储实现无需修改Service层
"""

from abc import ABC, abstractmethod
from typing import List, Optional, Dict, Any, Tuple
from datetime import datetime

from ..models.alert import AlertSeverity, AlertStatus, AlertCategory


# ==================== Repository 接口定义 ====================

class AlertRuleRepositoryInterface(ABC):
    """告警规则仓储接口"""

    @abstractmethod
    async def get_rule_by_id(self, rule_id: int) -> Optional[Dict[str, Any]]:
        """根据ID获取告警规则"""
        pass

    @abstractmethod
    async def get_rules(
        self,
        skip: int = 0,
        limit: int = 10,
        category: Optional[AlertCategory] = None,
        severity: Optional[AlertSeverity] = None,
        is_active: Optional[bool] = None
    ) -> Tuple[List[Dict[str, Any]], int]:
        """分页获取告警规则列表"""
        pass

    @abstractmethod
    async def create_rule(self, rule_data: Dict[str, Any], created_by: int) -> Dict[str, Any]:
        """创建告警规则"""
        pass

    @abstractmethod
    async def update_rule(self, rule_id: int, rule_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """更新告警规则"""
        pass

    @abstractmethod
    async def delete_rule(self, rule_id: int) -> bool:
        """删除告警规则"""
        pass

    @abstractmethod
    async def check_rule_name_exists(self, name: str, exclude_rule_id: Optional[int] = None) -> bool:
        """检查规则名称是否已存在"""
        pass


class AlertRepositoryInterface(ABC):
    """告警记录仓储接口"""

    # ==================== 基础CRUD操作 ====================

    @abstractmethod
    async def get_alert_by_id(self, alert_id: int) -> Optional[Dict[str, Any]]:
        """根据ID获取告警"""
        pass

    @abstractmethod
    async def get_alerts(
        self,
        skip: int = 0,
        limit: int = 20,
        device_id: Optional[int] = None,
        severity: Optional[AlertSeverity] = None,
        status: Optional[AlertStatus] = None,
        category: Optional[AlertCategory] = None,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None,
        search: Optional[str] = None
    ) -> Tuple[List[Dict[str, Any]], int]:
        """分页获取告警列表（带过滤条件）"""
        pass

    @abstractmethod
    async def create_alert(self, alert_data: Dict[str, Any]) -> Dict[str, Any]:
        """创建告警"""
        pass

    @abstractmethod
    async def update_alert(self, alert_id: int, alert_data: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """更新告警"""
        pass

    @abstractmethod
    async def delete_alert(self, alert_id: int) -> bool:
        """删除告警（物理删除）"""
        pass

    # ==================== 状态操作 ====================

    @abstractmethod
    async def acknowledge_alert(self, alert_id: int, user_id: int, note: Optional[str] = None) -> bool:
        """确认告警"""
        pass

    @abstractmethod
    async def resolve_alert(self, alert_id: int, user_id: int, note: Optional[str] = None) -> bool:
        """解决告警"""
        pass

    @abstractmethod
    async def reactivate_alert(self, alert_id: int, user_id: int, reason: Optional[str] = None) -> bool:
        """重新激活告警"""
        pass

    @abstractmethod
    async def close_alert(self, alert_id: int, user_id: int) -> bool:
        """关闭/归档告警（软删除）"""
        pass

    # ==================== 批量操作 ====================

    @abstractmethod
    async def bulk_acknowledge(self, alert_ids: List[int], user_id: int, note: Optional[str] = None) -> Tuple[int, List[int]]:
        """批量确认告警

        Returns:
            (success_count, failed_ids)
        """
        pass

    @abstractmethod
    async def bulk_resolve(self, alert_ids: List[int], user_id: int, note: Optional[str] = None) -> Tuple[int, List[int]]:
        """批量解决告警

        Returns:
            (success_count, failed_ids)
        """
        pass

    @abstractmethod
    async def bulk_close(self, alert_ids: List[int], user_id: int) -> Tuple[int, List[int]]:
        """批量关闭告警

        Returns:
            (success_count, failed_ids)
        """
        pass

    # ==================== 查询操作 ====================

    @abstractmethod
    async def get_active_alerts(
        self,
        device_id: Optional[int] = None,
        severity: Optional[AlertSeverity] = None
    ) -> List[Dict[str, Any]]:
        """获取活跃告警列表"""
        pass

    @abstractmethod
    async def get_recent_alerts(self, limit: int = 5) -> List[Dict[str, Any]]:
        """获取最新告警列表（按时间倒序）"""
        pass

    @abstractmethod
    async def get_alerts_by_device(self, device_id: int, limit: int = 100) -> List[Dict[str, Any]]:
        """获取指定设备的告警列表"""
        pass

    @abstractmethod
    async def get_alerts_by_rule(self, rule_id: int) -> List[Dict[str, Any]]:
        """获取指定规则触发的告警列表"""
        pass

    # ==================== 统计操作 ====================

    @abstractmethod
    async def get_alert_statistics(self) -> Dict[str, Any]:
        """获取告警统计信息

        Returns:
            {
                "total_active": int,
                "total_resolved": int,
                "by_severity": {"critical": int, "warning": int, "info": int},
                "by_status": {"open": int, "acknowledged": int, "resolved": int},
                "by_category": {"performance": int, "security": int, ...},
                "by_device": {device_id: count, ...},
                "trends": {...}
            }
        """
        pass

    @abstractmethod
    async def get_alert_count_by_status(self, status: AlertStatus) -> int:
        """获取指定状态的告警数量"""
        pass

    @abstractmethod
    async def get_alert_count_by_severity(self, severity: AlertSeverity) -> int:
        """获取指定严重级别的告警数量"""
        pass

    # ==================== 历史记录操作 ====================

    @abstractmethod
    async def get_alert_history(
        self,
        skip: int = 0,
        limit: int = 100,
        start_date: Optional[datetime] = None,
        end_date: Optional[datetime] = None
    ) -> Tuple[List[Dict[str, Any]], int]:
        """获取告警历史记录（已解决/已关闭的告警）"""
        pass

    @abstractmethod
    async def archive_old_alerts(self, days: int = 90) -> int:
        """归档旧告警（将N天前的告警标记为已归档）

        Returns:
            归档的告警数量
        """
        pass


# ==================== 组合接口 ====================

class AlertRepositoryInterface(AlertRepositoryInterface, ABC):
    """完整的告警仓储接口（包含告警规则和告警记录）"""

    # 告警规则操作（委托给 AlertRuleRepositoryInterface）
    rules: AlertRuleRepositoryInterface

    pass
