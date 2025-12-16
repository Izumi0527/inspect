# 共享模块 (shared)

提供所有业务模块共用的基础类、工具和异常定义。

## 文件说明

| 文件 | 说明 |
|------|------|
| `base_repository.py` | Repository基类，提供通用CRUD操作 |
| `base_service.py` | Service基类，提供通用业务逻辑模式 |
| `base_schema.py` | Schema基类，包含分页响应等通用模式 |
| `pagination.py` | 分页工具（Paginator, PaginationParams） |
| `exceptions.py` | 业务异常定义（8种异常类型） |
| `validators.py` | 通用验证器（IP/MAC/端口/邮箱等） |

## 使用方式

```python
from src.shared import BaseRepository, BaseService, PaginatedResponse
from src.shared.exceptions import NotFoundException, ValidationException
from src.shared.pagination import get_pagination_params, Paginator
from src.shared.validators import validate_ip_address, validate_mac_address
```

## 异常类型

- `BusinessException` - 业务异常基类
- `NotFoundException` - 资源不存在
- `ValidationException` - 数据验证失败
- `AuthenticationException` - 认证失败
- `AuthorizationException` - 权限不足
- `ConflictException` - 资源冲突
- `RateLimitException` - 请求频率限制
- `ExternalServiceException` - 外部服务异常
