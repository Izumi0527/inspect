# 业务模块 (modules)

按功能领域组织的业务代码，与前端 `features/` 目录结构对应。

## 模块列表

| 模块 | 说明 | 前端对应 |
|------|------|----------|
| `devices/` | 设备管理 | `features/devices/` |
| `monitoring/` | 实时监控 | `features/monitoring/` |
| `alerts/` | 告警中心 | `features/alerts/` |
| `inspection/` | 巡检管理 | `features/inspection/` |
| `dashboard/` | 仪表板 | `features/dashboard/` |
| `reports/` | 报表分析 | `features/reports/` |
| `traffic/` | 流量分析 | `features/traffic-analysis/` |

## 模块结构

每个模块遵循统一的内部结构：

```
module_name/
├── __init__.py      # 模块入口，导出router和主要类
├── api.py           # API路由定义
├── service.py       # 业务逻辑层
├── repository.py    # 数据访问层（可选）
├── schemas.py       # Pydantic数据模式
└── models.py        # SQLAlchemy模型（可选，复杂模块）
```

## 使用方式

```python
# 导入路由
from src.modules.devices import router as devices_router

# 导入服务
from src.modules.devices.service import DeviceService

# 导入数据模式
from src.modules.devices.schemas import DeviceCreate, DeviceResponse
```

## 依赖关系

- 所有模块依赖 `core/`（基础设施）
- 所有模块依赖 `shared/`（共享工具）
- 模块间通过服务接口通信，避免直接引用
