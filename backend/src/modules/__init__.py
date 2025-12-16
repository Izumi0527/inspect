"""
业务模块 - 按功能领域组织的业务代码

模块列表:
- auth: 认证授权
- dashboard: 仪表板
- devices: 设备管理
- monitoring: 实时监控
- alerts: 告警中心
- inspection: 巡检管理
- reports: 报表分析
- traffic: 流量分析
- scheduler: 任务调度
- settings: 系统设置（从api/settings导入，避免循环依赖）

每个模块内部结构:
- api.py: API路由定义
- service.py: 业务逻辑
- repository.py: 数据访问
- schemas.py: 数据模式
- models.py: 数据模型（可选）

使用方式:
    from src.modules.devices import router as devices_router
    from src.modules.devices.service import DeviceService
"""

# 导出所有模块路由（不包括settings，避免循环依赖）
from src.modules.auth import router as auth_router
from src.modules.devices import router as devices_router
from src.modules.monitoring import router as monitoring_router
from src.modules.alerts import router as alerts_router
from src.modules.inspection import router as inspection_router
from src.modules.dashboard import router as dashboard_router
from src.modules.reports import router as reports_router
from src.modules.traffic import router as traffic_router
from src.modules.scheduler import router as scheduler_router

__all__ = [
    "auth_router",
    "devices_router",
    "monitoring_router",
    "alerts_router",
    "inspection_router",
    "dashboard_router",
    "reports_router",
    "traffic_router",
    "scheduler_router",
]
