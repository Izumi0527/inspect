# 基础设施模块 (infrastructure)

提供与外部系统交互的基础设施服务。

## 子模块

### cache/
Redis缓存服务封装。

```python
from src.infrastructure.cache import cache_service
await cache_service.get("key")
await cache_service.set("key", "value", ttl=3600)
```

### device_connection/
设备连接服务，支持SNMP和SSH协议。

```python
from src.infrastructure.device_connection import SNMPService, SSHService

# SNMP连接
snmp = SNMPService()
result = await snmp.get_device_info(device)

# SSH连接
ssh = SSHService()
result = await ssh.execute_command(device, "show version")
```

## 设计原则

- 封装外部依赖，提供统一接口
- 支持连接池和重试机制
- 提供健康检查功能
