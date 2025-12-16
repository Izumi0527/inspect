# 巡检模块
from .service import InspectionService
from .checkers import InspectionCheckers
from .executor import InspectionExecutor
from .task_queue import (
    InspectionTaskQueue, TaskPriority, InspectionTaskResult,
    celery_app, task_queue_manager
)
from .result_parser import (
    DeviceSpecificParser, RegexResultParser, ParsePattern, 
    ParseResultType, inspection_result_parser
)

# 报告服务
from .report import InspectionReportService

# 脚本模板
from .templates import InspectionScriptTemplates

# 协议服务 (SNMP/SSH) - 使用别名避免与主InspectionService冲突
from .protocol import (
    SNMPService as ProtocolSNMPService,
    SSHService as ProtocolSSHService,
    DeviceConnectionType,
    InspectionService as ProtocolInspectionService,
    inspection_service as protocol_inspection_service
)

# 为向后兼容，也导出原始名称 (用于从旧inspection.py迁移的代码)
from .protocol import SNMPService, SSHService

__all__ = [
    # 核心服务
    "InspectionService",
    "InspectionCheckers", 
    "InspectionExecutor",
    
    # 任务队列
    "InspectionTaskQueue",
    "TaskPriority", 
    "InspectionTaskResult",
    "celery_app",
    "task_queue_manager",
    
    # 结果解析器
    "DeviceSpecificParser",
    "RegexResultParser",
    "ParsePattern",
    "ParseResultType",
    "inspection_result_parser",
    
    # 报告服务
    "InspectionReportService",
    
    # 脚本模板
    "InspectionScriptTemplates",
    
    # 协议服务 (SNMP/SSH)
    "ProtocolSNMPService",
    "ProtocolSSHService",
    "DeviceConnectionType",
    "ProtocolInspectionService",
    "protocol_inspection_service",
    # 向后兼容别名
    "SNMPService",
    "SSHService",
    
    # 服务实例
    "inspection_service"
]

# 创建服务实例
inspection_service = InspectionService()