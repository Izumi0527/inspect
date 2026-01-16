# 监控中心 API 参考文档

## 📋 API 端点总览

### 统计与概览

| 方法 | 端点 | 功能 | 返回类型 |
|------|------|------|---------|
| GET | `/monitoring/stats` | 获取6个关键指标 | MonitoringStats |
| GET | `/monitoring/overview` | 获取监控概览 | MonitoringOverview |
| GET | `/monitoring/status` | 获取系统状态快照 | SystemStatusSnapshot |

### 设备监控

| 方法 | 端点 | 功能 | 返回类型 |
|------|------|------|---------|
| GET | `/monitoring/devices/status` | 所有设备状态 | DeviceStatusSummary[] |
| GET | `/monitoring/devices/:device_id/metrics` | 单设备当前指标 | DeviceMetricsResponse |
| GET | `/monitoring/devices/:device_id/history` | 单设备历史指标 | MetricsHistoryResponse |
| GET | `/monitoring/devices/distribution` | 设备状态分布 | DeviceStatusDistribution |
| POST | `/monitoring/devices/:device_id/metrics` | 写入设备指标 | WriteResult |
| POST | `/monitoring/devices/historical` | 批量历史查询 | HistoryPoint[] |

### 系统性能

| 方法 | 端点 | 功能 | 返回类型 |
|------|------|------|---------|
| POST | `/monitoring/system/performance` | 系统性能历史 | SystemPerformancePoint[] |
| POST | `/monitoring/system/metrics` | 写入系统指标 | WriteResult |

### 设备温度

| 方法 | 端点 | 功能 | 返回类型 |
|------|------|------|---------|
| POST | `/monitoring/devices/temperature` | 温度历史 | TemperatureHistoryPoint[] |

### 网络流量

| 方法 | 端点 | 功能 | 返回类型 |
|------|------|------|---------|
| GET | `/traffic/summary` | 流量摘要 | NetworkTraffic |
| POST | `/monitoring/network/traffic/history` | 流量历史 | NetworkTrafficPoint[] |

### 可用性

| 方法 | 端点 | 功能 | 返回类型 |
|------|------|------|---------|
| GET | `/monitoring/availability` | 可用性数据 | AvailabilitySnapshot |

### 告警

| 方法 | 端点 | 功能 | 返回类型 |
|------|------|------|---------|
| GET | `/alerts/statistics` | 告警统计 | AlertSummary |

---

## 📊 数据类型定义

### MonitoringStats

```json
{
  "total_devices": 50,
  "availability": 98.5,
  "active_alerts": 3,
  "avg_cpu": 45.2,
  "avg_memory": 62.1,
  "avg_network": 125.5
}
```

### DeviceStatusSummary

```json
{
  "device_id": 1,
  "name": "Router-01",
  "device_name": "Router-01",
  "ip_address": "192.168.1.1",
  "status": "healthy",
  "device_status": "online",
  "cpu_usage": 45.2,
  "memory_usage": 62.1,
  "uptime": "3600",
  "last_seen": "2024-01-14T10:00:00Z",
  "alert_count": 0,
  "response_time": 12.5
}
```

### DeviceMetricsResponse

```json
{
  "device_id": 1,
  "timestamp": "2024-01-14T10:00:00Z",
  "cpu_usage": 45.2,
  "memory_usage": 62.1,
  "disk_usage": 75.3,
  "temperature": 48.5,
  "uptime": 3600,
  "bandwidth_in": 125.5,
  "bandwidth_out": 98.3,
  "packet_loss": 0.1,
  "custom_metrics": {}
}
```

### HistoryPoint

```json
{
  "timestamp": "2024-01-14T10:00:00Z",
  "metric_type": "cpu_usage",
  "metric_name": "cpu_usage",
  "value": 45.2,
  "device_id": 1,
  "metric_unit": "%",
  "interface_name": null,
  "tags": {}
}
```

### SystemPerformancePoint

```json
{
  "timestamp": "2024-01-14T10:00:00Z",
  "cpu_usage": 45.2,
  "memory_usage": 62.1,
  "network_traffic": 125.5
}
```

### TemperatureHistoryPoint

```json
{
  "timestamp": "2024-01-14T10:00:00Z",
  "devices": {
    "device_1": 45.2,
    "device_2": 52.1,
    "device_3": 48.5
  }
}
```

### NetworkTrafficPoint

```json
{
  "timestamp": "2024-01-14T10:00:00Z",
  "inbound": 125.5,
  "outbound": 98.3
}
```

### DeviceStatusDistribution

```json
{
  "healthy": 45,
  "warning": 3,
  "critical": 1,
  "offline": 1
}
```

### AvailabilitySnapshot

```json
{
  "current": 98.5,
  "target": 99.9,
  "trend": "stable",
  "last_update": "2024-01-14T10:00:00Z"
}
```

---

## 🔄 请求/响应示例

### 获取监控统计

**请求:**
```bash
curl -X GET "http://localhost:8001/api/v1/monitoring/stats" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**响应:**
```json
{
  "total_devices": 50,
  "availability": 98.5,
  "active_alerts": 3,
  "avg_cpu": 45.2,
  "avg_memory": 62.1,
  "avg_network": 125.5
}
```

### 获取设备状态

**请求:**
```bash
curl -X GET "http://localhost:8001/api/v1/monitoring/devices/status" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**响应:**
```json
[
  {
    "device_id": 1,
    "name": "Router-01",
    "ip_address": "192.168.1.1",
    "status": "healthy",
    "cpu_usage": 45.2,
    "memory_usage": 62.1,
    "uptime": "3600",
    "last_seen": "2024-01-14T10:00:00Z",
    "alert_count": 0
  },
  {
    "device_id": 2,
    "name": "Switch-01",
    "ip_address": "192.168.1.2",
    "status": "warning",
    "cpu_usage": 78.5,
    "memory_usage": 85.2,
    "uptime": "7200",
    "last_seen": "2024-01-14T10:00:00Z",
    "alert_count": 2
  }
]
```

### 写入设备指标

**请求:**
```bash
curl -X POST "http://localhost:8001/api/v1/monitoring/devices/1/metrics" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": 1,
    "collected_at": "2024-01-14T10:00:00Z",
    "metrics": {
      "cpu_usage": {"value": 45.2, "unit": "%"},
      "memory_usage": {"value": 62.1, "unit": "%"},
      "temperature": {"value": 48.5, "unit": "°C"}
    },
    "interfaces": [
      {
        "name": "eth0",
        "description": "Ethernet 0",
        "ifHighSpeed": 1000,
        "in_octets": 1234567890,
        "out_octets": 987654321
      }
    ],
    "tags": {
      "location": "datacenter-1",
      "vendor": "cisco"
    }
  }'
```

**响应:**
```json
{
  "success": true,
  "device_id": 1,
  "device_metrics_count": 3,
  "interface_metrics_count": 3
}
```

### 获取历史数据

**请求:**
```bash
curl -X POST "http://localhost:8001/api/v1/monitoring/devices/historical" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "device_ids": [1, 2, 3],
    "start_time": "2024-01-14T00:00:00Z",
    "end_time": "2024-01-14T23:59:59Z",
    "metrics": ["cpu_usage", "memory_usage", "bandwidth_utilization"]
  }'
```

**响应:**
```json
[
  {
    "timestamp": "2024-01-14T10:00:00Z",
    "metric_type": "cpu_usage",
    "metric_name": "cpu_usage",
    "value": 45.2,
    "device_id": 1,
    "metric_unit": "%"
  },
  {
    "timestamp": "2024-01-14T10:00:00Z",
    "metric_type": "memory_usage",
    "metric_name": "memory_usage",
    "value": 62.1,
    "device_id": 1,
    "metric_unit": "%"
  }
]
```

### 获取系统性能历史

**请求:**
```bash
curl -X POST "http://localhost:8001/api/v1/monitoring/system/performance" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "start_time": "2024-01-14T00:00:00Z",
    "end_time": "2024-01-14T23:59:59Z",
    "metrics": ["cpu_usage", "memory_usage", "network_traffic"]
  }'
```

**响应:**
```json
[
  {
    "timestamp": "2024-01-14T10:00:00Z",
    "cpu_usage": 45.2,
    "memory_usage": 62.1,
    "network_traffic": 125.5
  },
  {
    "timestamp": "2024-01-14T11:00:00Z",
    "cpu_usage": 48.5,
    "memory_usage": 65.3,
    "network_traffic": 132.1
  }
]
```

---

## ⚙️ 查询参数

### 时间范围参数

| 参数 | 类型 | 说明 | 示例 |
|------|------|------|------|
| start_time | ISO8601 | 开始时间 | 2024-01-14T00:00:00Z |
| end_time | ISO8601 | 结束时间 | 2024-01-14T23:59:59Z |
| time_range | string | 时间范围快捷值 | 24h, 7d, 30d |

### 指标过滤参数

| 参数 | 类型 | 说明 | 示例 |
|------|------|------|------|
| metrics | string[] | 指标名称列表 | cpu_usage,memory_usage |
| metric_names | string | 逗号分隔的指标名称 | cpu_usage,memory_usage |

### 分页参数

| 参数 | 类型 | 说明 | 示例 |
|------|------|------|------|
| page | int | 页码 | 1 |
| page_size | int | 每页数量 | 20 |
| limit | int | 返回数量限制 | 100 |

---

## 🔐 认证

所有 API 端点都需要 Bearer Token 认证:

```bash
Authorization: Bearer <JWT_TOKEN>
```

---

## ❌ 错误处理

### 错误响应格式

```json
{
  "error": "error_code",
  "message": "Human readable error message",
  "details": {
    "field": "error details"
  }
}
```

### 常见错误码

| 状态码 | 错误码 | 说明 |
|--------|--------|------|
| 400 | INVALID_REQUEST | 请求参数无效 |
| 401 | UNAUTHORIZED | 未授权 |
| 403 | FORBIDDEN | 禁止访问 |
| 404 | NOT_FOUND | 资源不存在 |
| 500 | INTERNAL_ERROR | 服务器内部错误 |
| 503 | SERVICE_UNAVAILABLE | 服务不可用 |

---

## 📈 性能指标

### 响应时间

| 端点 | 平均响应时间 | 最大响应时间 |
|------|-------------|------------|
| /monitoring/stats | < 100ms | < 500ms |
| /monitoring/devices/status | < 200ms | < 1s |
| /monitoring/devices/historical | < 500ms | < 5s |
| /monitoring/system/performance | < 300ms | < 2s |

### 吞吐量

- 单个设备指标写入: > 1000 req/s
- 批量历史查询: > 100 req/s
- 并发连接数: > 1000

---

## 🔄 WebSocket 实时推送

### 连接

```javascript
const ws = new WebSocket('ws://localhost:8001/ws');

ws.onopen = () => {
  console.log('Connected');
};
```

### 订阅监控数据

```javascript
ws.send(JSON.stringify({
  type: 'subscribe',
  channel: 'device_metrics',
  device_ids: [1, 2, 3]
}));
```

### 接收实时更新

```javascript
ws.onmessage = (event) => {
  const message = JSON.parse(event.data);
  
  if (message.type === 'device_metrics') {
    console.log('Device metrics:', message.data);
  }
};
```

### 消息格式

```json
{
  "type": "device_metrics",
  "data": {
    "device_id": 1,
    "metrics": {
      "cpu_usage": 45.2,
      "memory_usage": 62.1
    },
    "collected_at": "2024-01-14T10:00:00Z"
  }
}
```

---

## 📚 SDK 使用示例

### TypeScript/JavaScript

```typescript
import { api } from '@/lib/api-client';

// 获取监控统计
const stats = await api.get('/monitoring/stats');

// 获取设备状态
const devices = await api.get('/monitoring/devices/status');

// 写入设备指标
const result = await api.post('/monitoring/devices/1/metrics', {
  metrics: {
    cpu_usage: { value: 45.2, unit: '%' },
    memory_usage: { value: 62.1, unit: '%' }
  }
});
```

### Go

```go
import "github.com/your-org/inspect-system/backend-go/internal/monitoring"

// 获取监控统计
stats, err := metricsWriter.GetMonitoringStats(ctx)

// 获取设备状态
devices, err := metricsWriter.GetDevicesStatus(ctx)

// 写入设备指标
result, err := metricsWriter.WriteDeviceMetrics(ctx, req)
```

### Python

```python
import requests

# 获取监控统计
response = requests.get(
    'http://localhost:8001/api/v1/monitoring/stats',
    headers={'Authorization': f'Bearer {token}'}
)
stats = response.json()

# 写入设备指标
response = requests.post(
    'http://localhost:8001/api/v1/monitoring/devices/1/metrics',
    headers={'Authorization': f'Bearer {token}'},
    json={
        'metrics': {
            'cpu_usage': {'value': 45.2, 'unit': '%'},
            'memory_usage': {'value': 62.1, 'unit': '%'}
        }
    }
)
```

---

## 🚀 最佳实践

1. **使用缓存** - 利用 React Query 缓存减少 API 调用
2. **批量查询** - 使用 `/monitoring/devices/historical` 批量获取数据
3. **时间范围** - 合理设置时间范围以提高查询性能
4. **错误处理** - 实现重试机制和错误恢复
5. **监控延迟** - 定期检查 API 响应时间
6. **限流保护** - 实现客户端限流以避免过载
