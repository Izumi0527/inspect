# 📊 仪表板（Dashboard）API

> **端点前缀**：`/api/v1/dashboard`  
> **认证**：所有端点均需要 `Authorization: Bearer <token>`

## 1) 获取仪表板概览

**GET** `/api/v1/dashboard/overview`

用于 `/dashboard` 总览页首屏数据（统计卡片 + 最近告警 + 网络概览）。

**响应字段（关键）**
- `stats[]`：统计卡片数组，`unit` 可能为 `bps`（前端需按单位格式化 `value`）
- `recent_alerts[]`：最近告警
- `network_overview[]`：网络概览分组
- `last_updated`：后端更新时间（RFC3339）

**示例**
```bash
curl -X GET "http://localhost:8001/api/v1/dashboard/overview" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 2) 通知中心聚合（告警 + 系统消息）

**GET** `/api/v1/dashboard/notifications?limit=20`

该接口用于 Dashboard 顶栏“通知中心”，后端会聚合：
- 告警（alerts）
- 巡检（inspections）
- 报表（reports）
- 扫描（network_scans）

**Query 参数**
- `limit`：返回条数（默认 20，最大 50）

**响应字段（关键）**
- `notifications[]`
  - `type`：`alert` | `system`
  - `severity`：`critical` | `warning` | `info` | `success`
  - `timestamp`：时间戳（RFC3339）
  - `link`：前端跳转链接（例如 `/alerts?id=123`）
- `read`：是否已读（**后端按用户维度持久化**）
- `last_updated`
- `unread_count`：未读数量（按本次返回窗口统计，通常与 `limit` 绑定）

**示例**
```bash
curl -X GET "http://localhost:8001/api/v1/dashboard/notifications?limit=20" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## 3) 通知已读/清空（后端持久化）

### 3.1 标记已读

**POST** `/api/v1/dashboard/notifications/read`

**Body（二选一）**
- 指定通知：
```json
{ "ids": ["alert-123", "report-9"] }
```
- 全部已读（最近窗口）：
```json
{ "all": true, "window_limit": 200 }
```

**响应**
```json
{ "updated": 2 }
```

### 3.2 清空（隐藏）通知

**POST** `/api/v1/dashboard/notifications/dismiss`

**Body（二选一）**
- 指定通知：
```json
{ "ids": ["alert-123", "report-9"] }
```
- 全部清空（最近窗口）：
```json
{ "all": true, "window_limit": 200 }
```

**响应**
```json
{ "updated": 2 }
```

## 4) 其他仪表板端点（可选）

- **GET** `/api/v1/dashboard/device-status`：设备状态摘要
- **GET** `/api/v1/dashboard/alert-summary`：告警摘要
- **GET** `/api/v1/dashboard/recent-alerts?limit=5`：最近告警（列表）
- **GET** `/api/v1/dashboard/network-overview`：网络概览
- **GET** `/api/v1/dashboard/system-status`：系统服务状态
- **GET** `/api/v1/dashboard/top-devices-by-alerts?limit=5`：告警最多设备
- **GET** `/api/v1/dashboard/recent-activities?limit=10`：最近活动（当前可能为空）
- **GET** `/api/v1/dashboard/bandwidth-stats`：带宽统计（单位 `bps`）

