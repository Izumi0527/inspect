"""
Audit Settings Service
审计日志扩展服务层
"""
from datetime import datetime, timedelta
import structlog

from src.schemas.settings.audit import AuditStats

logger = structlog.get_logger()


class AuditSettingsService:
    """审计日志扩展服务"""

    def __init__(self):
        pass

    async def get_audit_statistics(self) -> AuditStats:
        """
        获取审计日志统计数据

        Returns:
            审计统计信息
        """
        try:
            # TODO: 从数据库获取实际统计数据
            # 这里返回模拟数据
            now = datetime.now()
            today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
            week_start = today_start - timedelta(days=today_start.weekday())
            month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

            # 模拟统计数据
            total_logs = 10000
            failed_count = 500

            stats = AuditStats(
                total_logs=total_logs,
                logs_today=150,
                logs_this_week=1200,
                logs_this_month=4500,
                logs_by_action={
                    "login": 2000,
                    "logout": 1800,
                    "create": 1500,
                    "update": 2000,
                    "delete": 500,
                    "view": 2200
                },
                logs_by_status={
                    "success": 9500,
                    "failed": 500
                },
                logs_by_resource_type={
                    "user": 3000,
                    "device": 4000,
                    "inspection": 2000,
                    "backup": 1000
                },
                top_active_users=[
                    {
                        "user_id": 1,
                        "username": "admin",
                        "operation_count": 500,
                        "last_activity": (now - timedelta(minutes=5)).isoformat()
                    },
                    {
                        "user_id": 2,
                        "username": "operator1",
                        "operation_count": 350,
                        "last_activity": (now - timedelta(minutes=10)).isoformat()
                    },
                    {
                        "user_id": 3,
                        "username": "operator2",
                        "operation_count": 300,
                        "last_activity": (now - timedelta(minutes=15)).isoformat()
                    }
                ],
                top_actions=[
                    {"action": "view", "count": 2200},
                    {"action": "login", "count": 2000},
                    {"action": "update", "count": 2000},
                    {"action": "logout", "count": 1800},
                    {"action": "create", "count": 1500}
                ],
                failed_operations_count=failed_count,
                failed_operations_rate=round(failed_count / total_logs * 100, 2)
            )

            logger.info("Retrieved audit statistics", total_logs=stats.total_logs)
            return stats

        except Exception as e:
            logger.error("Failed to get audit statistics", error=str(e))
            raise


# 全局实例
audit_settings_service = AuditSettingsService()
