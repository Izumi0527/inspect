"""
企业级网络设备巡检系统 - 测试包

包含以下测试模块：

核心功能测试：
- test_db: 数据库连接和SQLAlchemy ORM测试
- test_redis_cache: Redis缓存服务、JWT黑名单、用户设备缓存测试
- test_influxdb: InfluxDB时序数据库集成功能测试

业务功能测试：
- test_escalation: 告警升级机制测试，验证告警升级服务核心功能
- test_websocket: WebSocket实时通信功能测试，包括连接、心跳、房间订阅
- test_main: 简化的API服务测试，验证基础API接口和数据库连接

使用方法：
    # 单独运行测试
    python -m tests.test_db
    python -m tests.test_redis_cache
    python -m tests.test_influxdb
    python -m tests.test_escalation
    python -m tests.test_websocket
    python -m tests.test_main
    
    # 使用统一测试调度脚本
    ./scripts/run-all-tests.ps1 -AppLayer          # 运行所有应用层测试
    ./scripts/run-all-tests.ps1 -DatabaseOnly      # 仅测试数据库
    ./scripts/run-all-tests.ps1 -RedisOnly         # 仅测试Redis缓存
    ./scripts/run-all-tests.ps1 -InfluxDBOnly      # 仅测试InfluxDB
    ./scripts/run-all-tests.ps1 -Full              # 运行完整测试套件

测试覆盖范围：
- 数据库连接和ORM操作
- 缓存系统和会话管理
- 时序数据库和监控指标
- 告警系统和升级机制
- WebSocket实时通信
- REST API基础功能
"""

__version__ = "1.0.0"
__all__ = [
    "test_db",
    "test_redis_cache", 
    "test_influxdb",
    "test_escalation",
    "test_websocket",
    "test_main"
]