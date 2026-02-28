# API 文档

## 📡 API 概览

企业级网络设备巡检系统提供完整的RESTful API，支持设备管理、监控、告警、巡检、报表等核心功能。

### 基础信息

- **基础URL**: `http://localhost:8001/api/v1`
- **API版本**: v1
- **认证方式**: Bearer Token (JWT)
- **内容类型**: `application/json`
- **字符编码**: `UTF-8`

### API状态

✅ **前后端API已完全对接** (更新时间: 2026-01-14)

- **API匹配度**: 100%
- **总端点数**: 100+
- **已修复问题**: 20个
- **新增端点**: 24个

详细修复报告: [API对接修复报告](../api-fix-completion-report.md)

---

## 🔐 认证

### 获取访问令牌

```http
POST /api/v1/auth/login
Content-Type: application/json

{
  "username": "admin",
  "password": "password",
  "remember_me": true
}
```

**响应**:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refresh_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": 86400,
  "user": {
    "id": 1,
    "username": "admin",
    "role": "admin"
  }
}
```

### 使用令牌

在所有需要认证的请求中添加 `Authorization` 头：

```http
GET /api/v1/devices
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## 📚 API 模块

### 1. 设备管理 (Devices)

**端点前缀**: `/devices`

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/devices` | 获取设备列表 |
| GET | `/devices/search` | 设备搜索（支持 `q`、`limit`） |
| GET | `/devices/:device_id` | 获取设备详情 |
| POST | `/devices` | 创建设备 |
| PUT | `/devices/:device_id` | 更新设备 |
| DELETE | `/devices/:device_id` | 删除设备 |
| GET | `/devices/statistics` | 获取设备统计 |
| POST | `/devices/:device_id/probe` | 探测设备 (ICMP + SNMP) |
| POST | `/devices/batch-probe` | 批量探测设备 |
| POST | `/devices/bulk-action` | 批量操作设备 |
| POST | `/devices/batch-update` | 批量更新设备 |
| POST | `/devices/batch-import` | 批量导入设备 |
| POST | `/devices/batch-delete` | 批量删除设备 |
| POST | `/devices/:device_id/health-check` | 设备健康检查 |
| GET | `/devices/:device_id/performance` | 获取设备性能数据 |

**示例**:
```bash
# 获取设备列表
curl -X GET "http://localhost:8001/api/v1/devices?page=1&page_size=20" \
  -H "Authorization: Bearer YOUR_TOKEN"

# 探测设备
curl -X POST "http://localhost:8001/api/v1/devices/1/probe" \
  -H "Authorization: Bearer YOUR_TOKEN"

# 批量探测
curl -X POST "http://localhost:8001/api/v1/devices/batch-probe" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"device_ids": [1, 2, 3], "max_concurrent": 20}'
```

---

### 2. 监控 (Monitoring)

**端点前缀**: `/monitoring`

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/monitoring/overview` | 监控概览 |
| GET | `/monitoring/devices` | 监控设备列表 |
| GET | `/monitoring/devices/status` | 设备状态列表 |
| GET | `/monitoring/stats` | 监控统计 |
| GET | `/monitoring/devices/distribution` | 设备状态分布 |
| GET | `/monitoring/availability` | 可用性统计 |
| GET | `/monitoring/devices/:device_id/metrics` | 设备当前指标 |
| GET | `/monitoring/devices/:device_id/history` | 设备历史指标 |
| GET | `/monitoring/devices/:device_id/status` | 设备当前状态 |
| GET | `/monitoring/historical` | 历史监控数据 |
| POST | `/monitoring/devices/historical` | 批量设备历史 |
| POST | `/monitoring/system/performance` | 系统性能历史 |
| POST | `/monitoring/network/traffic/history` | 网络流量历史 |

**示例**:
```bash
# 获取监控概览
curl -X GET "http://localhost:8001/api/v1/monitoring/overview" \
  -H "Authorization: Bearer YOUR_TOKEN"

# 获取设备指标
curl -X GET "http://localhost:8001/api/v1/monitoring/devices/1/metrics" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### 3. 告警 (Alerts)

**端点前缀**: `/alerts`

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/alerts` | 获取告警列表 |
| GET | `/alerts/:alert_id` | 获取告警详情 |
| POST | `/alerts/:alert_id/acknowledge` | 确认告警 |
| POST | `/alerts/:alert_id/resolve` | 解决告警 |
| POST | `/alerts/:alert_id/reactivate` | 重新激活告警 |
| DELETE | `/alerts/:alert_id` | 删除告警 |
| POST | `/alerts/bulk` | 批量操作告警 |
| GET | `/alerts/statistics` | 告警统计 |
| GET | `/alerts/recent` | 最近告警 |
| GET | `/alerts/rules` | 获取告警规则 |
| GET | `/alerts/rules/:rule_id` | 获取规则详情 |
| POST | `/alerts/rules` | 创建告警规则 |
| PUT | `/alerts/rules/:rule_id` | 更新告警规则 |
| DELETE | `/alerts/rules/:rule_id` | 删除告警规则 |

**查询与返回约定（实现基线）**:
- `GET /alerts` 返回分页对象：`alerts`, `total`, `page`, `page_size`, `current_page`, `has_next`, `has_prev`
- `category` 支持多值：`?category=security&category=performance` 或 `?category=security,performance`
- `GET /alerts/export` 与 `GET /alerts` 使用同一筛选维度（状态、级别、分类、设备、时间范围、搜索、排序）

**示例**:
```bash
# 获取告警列表
curl -X GET "http://localhost:8001/api/v1/alerts?page=1&severity=critical" \
  -H "Authorization: Bearer YOUR_TOKEN"

# 确认告警
curl -X POST "http://localhost:8001/api/v1/alerts/1/acknowledge" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"comment": "已确认，正在处理"}'

# 获取告警统计
curl -X GET "http://localhost:8001/api/v1/alerts/statistics" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### 4. 流量分析 (Traffic)

**端点前缀**: `/traffic`

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/traffic/summary` | 流量摘要 |
| GET | `/traffic/devices/:device_id` | 设备流量 |
| GET | `/traffic/devices/:device_id/trend` | 流量趋势 |
| GET | `/traffic/top-talkers` | TOP流量设备 |
| GET | `/traffic/bandwidth-utilization` | 带宽利用率 |
| GET | `/traffic/bandwidth-utilization/top` | TOP带宽利用率 |

**示例**:
```bash
# 获取流量摘要
curl -X GET "http://localhost:8001/api/v1/traffic/summary?hours=24" \
  -H "Authorization: Bearer YOUR_TOKEN"

# 获取设备流量趋势
curl -X GET "http://localhost:8001/api/v1/traffic/devices/1/trend?interval=1h" \
  -H "Authorization: Bearer YOUR_TOKEN"

# 获取TOP流量设备
curl -X GET "http://localhost:8001/api/v1/traffic/top-talkers?limit=10" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### 5. 系统设置 (Settings)

**端点前缀**: `/settings`

#### 通用设置

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/settings/general/categories` | 获取配置分类 |
| GET | `/settings/general/settings` | 获取所有设置 |
| GET | `/settings/general/settings/:key` | 获取单个设置 |
| PUT | `/settings/general/settings/:key` | 更新设置 |
| POST | `/settings/general/settings/bulk` | 批量更新设置 |
| POST | `/settings/general/settings/:key/reset` | 重置设置 |
| GET | `/settings/general/info` | 获取系统信息 |

#### 用户管理

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/settings/users` | 获取用户列表 |
| GET | `/settings/users/:user_id` | 获取用户详情 |
| POST | `/settings/users` | 创建用户 |
| PUT | `/settings/users/:user_id` | 更新用户 |
| DELETE | `/settings/users/:user_id` | 删除用户 |
| POST | `/settings/users/bulk-operation` | 批量操作用户 |
| POST | `/settings/users/import` | 导入用户 |
| GET | `/settings/users/:user_id/permissions` | 获取用户权限 |
| GET | `/settings/users/stats` | 获取用户统计 |

#### 角色管理

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/settings/roles` | 获取角色列表 |
| GET | `/settings/roles/:role_id` | 获取角色详情 |
| POST | `/settings/roles` | 创建角色 |
| PUT | `/settings/roles/:role_id` | 更新角色 |
| DELETE | `/settings/roles/:role_id` | 删除角色 |
| GET | `/settings/permissions` | 获取权限列表 |

#### 通知设置

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/settings/notifications` | 获取通知配置 |
| POST | `/settings/notifications/test-email` | 测试邮件 |
| POST | `/settings/notifications/test-sms` | 测试短信 |
| POST | `/settings/notifications/test-webhook` | 测试Webhook |

#### 安全设置

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/settings/security` | 获取安全配置 |
| GET | `/settings/security/sessions` | 获取会话列表 |

#### 备份管理

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/settings/backup/config` | 获取备份配置 |
| GET | `/settings/backup/history` | 获取备份历史 |
| POST | `/settings/backup/create` | 创建备份 |
| POST | `/settings/backup/:backup_id/restore` | 恢复备份 |
| DELETE | `/settings/backup/:backup_id` | 删除备份 |

#### 审计日志

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/settings/audit/logs` | 获取审计日志 |
| GET | `/settings/audit/logs/:log_id` | 获取日志详情 |
| DELETE | `/settings/audit/cleanup` | 清理日志 |

**示例**:
```bash
# 获取系统设置
curl -X GET "http://localhost:8001/api/v1/settings/general/settings" \
  -H "Authorization: Bearer YOUR_TOKEN"

# 更新设置
curl -X PUT "http://localhost:8001/api/v1/settings/general/settings/system.name" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"key": "system.name", "value": "我的巡检系统"}'

# 获取用户列表
curl -X GET "http://localhost:8001/api/v1/settings/users?page=1&page_size=20" \
  -H "Authorization: Bearer YOUR_TOKEN"
```

---

### 6. 巡检 (Inspection)

**端点前缀**: `/inspection`

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/inspection/templates` | 获取巡检模板 |
| GET | `/inspection/templates/:template_id` | 获取模板详情 |
| POST | `/inspection/templates` | 创建模板 |
| PUT | `/inspection/templates/:template_id` | 更新模板 |
| DELETE | `/inspection/templates/:template_id` | 删除模板 |
| GET | `/inspection/tasks` | 获取巡检任务 |
| GET | `/inspection/tasks/:task_id` | 获取任务详情 |
| POST | `/inspection/tasks` | 创建任务 |
| POST | `/inspection/tasks/:task_id/cancel` | 取消任务 |
| GET | `/inspection/results` | 获取巡检结果 |
| GET | `/inspection/results/:result_id` | 获取结果详情 |

---

### 7. 报表 (Reports)

**端点前缀**: `/reports`

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/reports` | 获取报表列表 |
| GET | `/reports/:report_id` | 获取报表详情 |
| POST | `/reports/:type` | 生成报表 |
| GET | `/reports/:report_id/download` | 下载报表 |
| DELETE | `/reports/:report_id` | 删除报表 |

---

### 8. 仪表板 (Dashboard)

**端点前缀**: `/dashboard`

| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/dashboard/overview` | 仪表板概览 |
| GET | `/dashboard/device-status` | 设备状态摘要 |
| GET | `/dashboard/alert-summary` | 告警摘要 |
| GET | `/dashboard/recent-activities` | 最近活动（支持 `?limit=`） |
| GET | `/dashboard/system-status` | 系统服务状态 |
| GET | `/dashboard/top-devices-by-alerts` | 告警最多设备（支持 `?limit=`） |
| GET | `/dashboard/recent-alerts` | 最近告警（支持 `?limit=`） |
| GET | `/dashboard/network-overview` | 网络概览 |
| GET | `/dashboard/bandwidth-stats` | 带宽统计 |
| GET | `/dashboard/notifications` | 通知中心聚合（支持 `?limit=`） |

---

## 🔄 WebSocket API

实时数据推送使用WebSocket协议。

**连接地址**: `ws://localhost:8001/api/v1/ws/{user_id}`

详细文档: [WebSocket协议文档](websocket-contract.md)

---

## 📝 通用规范

### 分页参数

所有列表接口支持分页参数：

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `page` | integer | 1 | 页码 |
| `page_size` | integer | 20 | 每页数量 |

### 排序参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `sort_by` | string | 排序字段 |
| `sort_order` | string | 排序方向 (asc/desc) |

### 筛选参数

| 参数 | 类型 | 说明 |
|------|------|------|
| `search` | string | 搜索关键字 |
| `status` | string | 状态筛选 |
| `start_date` | string | 开始日期 (ISO 8601) |
| `end_date` | string | 结束日期 (ISO 8601) |

### 响应格式

**成功响应**:
```json
{
  "data": [...],
  "total": 100,
  "page": 1,
  "page_size": 20,
  "pages": 5
}
```

**错误响应**:
```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Invalid request parameters",
    "details": {
      "field": "device_id",
      "issue": "must be a positive integer"
    }
  }
}
```

### HTTP状态码

| 状态码 | 说明 |
|--------|------|
| 200 | 成功 |
| 201 | 创建成功 |
| 204 | 删除成功 |
| 400 | 请求参数错误 |
| 401 | 未认证 |
| 403 | 无权限 |
| 404 | 资源不存在 |
| 409 | 资源冲突 |
| 422 | 验证失败 |
| 500 | 服务器错误 |

---

## 🧪 测试工具

### Postman集合

导入 `openapi.json` 到Postman进行API测试。

### cURL示例

```bash
# 设置环境变量
export API_URL="http://localhost:8001/api/v1"
export TOKEN="your_jwt_token"

# 获取设备列表
curl -X GET "$API_URL/devices" \
  -H "Authorization: Bearer $TOKEN"

# 创建设备
curl -X POST "$API_URL/devices" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "核心交换机",
    "ip_address": "192.168.1.1",
    "device_type": "switch",
    "snmp_version": "v3"
  }'
```

---

## 📚 相关文档

- [API对接修复报告](../api-fix-completion-report.md)
- [API修复指南](../api-fix-guide.md)
- [WebSocket协议文档](websocket-contract.md)
- [OpenAPI规范](openapi.json)
- [后端快速启动](../backend-go-quickstart.md)
- [开发环境指南](../development-environment-guide.md)

---

## 🔄 更新日志

### 2026-01-14
- ✅ 完成前后端API对接修复
- ✅ 修复系统设置路径不匹配问题
- ✅ 修复设备批量操作路径
- ✅ 重构流量分析模块API调用
- ✅ 补充24个缺失的API端点
- ✅ API匹配度达到100%

### 2025-12-16
- 初始API文档创建
- 定义基础API规范

---

**文档版本**: v1.1  
**最后更新**: 2026-01-14  
**维护者**: 开发团队
