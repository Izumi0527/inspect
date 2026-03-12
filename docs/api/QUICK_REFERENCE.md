# API 快速参考

快速查找常用API端点。

---

## 🔐 认证

```bash
# 登录
POST /api/v1/auth/login
Body: {"username": "admin", "password": "password"}

# 刷新令牌
POST /api/v1/auth/refresh
Body: {"refresh_token": "..."}

# 获取用户信息
GET /api/v1/auth/profile
```

---

## 📱 设备管理

```bash
# 设备列表
GET /api/v1/devices?page=1&page_size=20

# 设备详情
GET /api/v1/devices/:device_id

# 创建设备
POST /api/v1/devices
Body: {"name": "...", "ip_address": "...", "device_type": "..."}

# 更新设备
PUT /api/v1/devices/:device_id

# 删除设备
DELETE /api/v1/devices/:device_id

# 设备探测（可选写回状态）
# - update_status=true 且具备 devices:update 权限时，后端会尝试写回设备状态
# - 响应可能包含 status_updated
POST /api/v1/devices/:device_id/probe?update_status=true

# 批量探测
# - update_status=true 且具备 devices:update 权限时，后端会尝试写回设备状态
# - 响应可能包含 status_updated / status_updated_count
POST /api/v1/devices/batch-probe?update_status=true
Body: {"device_ids": [1,2,3], "max_concurrent": 20}

# 批量删除（可用数组或对象两种 payload）
POST /api/v1/devices/batch-delete
Body: [1,2,3]
# 或 Body: {"device_ids":[1,2,3]}

# 批量更新（updates 为必填）
POST /api/v1/devices/batch-update
Body: {"device_ids":[1,2,3], "updates":{"location":"机房-A"}}

# 批量导入
POST /api/v1/devices/batch-import
Body: {"devices":[{"name":"sw-01","ip_address":"192.168.1.1","device_type":"switch","vendor":"cisco"}],"auto_detect":true,"skip_duplicates":true}

# 健康检查（可选写回状态）
POST /api/v1/devices/:device_id/health-check?update_status=true

# 性能数据
GET /api/v1/devices/:device_id/performance?time_range=1h

# 设备统计
GET /api/v1/devices/statistics

# 批量操作
POST /api/v1/devices/bulk-action
# 支持的 action: batch_delete / batch_update / batch_add_group / batch_remove_group / batch_config / start_inspection
# 批量删除
Body: {"action": "batch_delete", "device_ids": [1,2,3]}
# 批量更新（updates 为必填）
Body: {"action": "batch_update", "device_ids": [1,2,3], "updates": {"location": "机房-A"}}
```

---

## 📊 监控

```bash
# 监控概览
GET /api/v1/monitoring/overview

# 设备状态列表
GET /api/v1/monitoring/devices/status

# 监控统计
GET /api/v1/monitoring/stats

# 设备当前指标
GET /api/v1/monitoring/devices/:device_id/metrics

# 设备历史指标
GET /api/v1/monitoring/devices/:device_id/history?start_time=...&end_time=...

# 设备当前状态
GET /api/v1/monitoring/devices/:device_id/status
```

---

## 🚨 告警

```bash
# 告警列表
GET /api/v1/alerts?page=1&severity=critical

# 告警详情
GET /api/v1/alerts/:alert_id

# 确认告警
POST /api/v1/alerts/:alert_id/acknowledge
Body: {"comment": "已确认"}

# 解决告警
POST /api/v1/alerts/:alert_id/resolve
Body: {"comment": "已解决", "solution": "..."}

# 告警统计
GET /api/v1/alerts/statistics

# 最近告警
GET /api/v1/alerts/recent?limit=10

# 批量操作
POST /api/v1/alerts/bulk
Body: {"action": "acknowledge", "alert_ids": [1,2,3]}

# 告警规则
GET /api/v1/alerts/rules
POST /api/v1/alerts/rules
PUT /api/v1/alerts/rules/:rule_id
DELETE /api/v1/alerts/rules/:rule_id
```

---

## 🌐 流量分析

```bash
# 流量摘要
GET /api/v1/traffic/summary?hours=24

# 设备流量
GET /api/v1/traffic/devices/:device_id

# 流量趋势
GET /api/v1/traffic/devices/:device_id/trend?interval=1h

# TOP流量设备
GET /api/v1/traffic/top-talkers?limit=10&sort_by=total_bytes

# 带宽利用率
GET /api/v1/traffic/bandwidth-utilization?threshold=80

# TOP带宽利用率
GET /api/v1/traffic/bandwidth-utilization/top?limit=10
```

---

## 🔧 系统设置

### 通用设置

```bash
# 配置分类
GET /api/v1/settings/general/categories

# 所有设置
GET /api/v1/settings/general/settings

# 单个设置
GET /api/v1/settings/general/settings/:key

# 更新设置
PUT /api/v1/settings/general/settings/:key
Body: {"key": "...", "value": "..."}

# 批量更新
POST /api/v1/settings/general/settings/bulk
Body: {"settings": {"key1": "value1", "key2": "value2"}}

# 重置设置
POST /api/v1/settings/general/settings/:key/reset

# 系统信息
GET /api/v1/settings/general/info
```

### 用户管理

```bash
# 用户列表
GET /api/v1/settings/users?page=1&page_size=20

# 用户详情
GET /api/v1/settings/users/:user_id

# 创建用户
POST /api/v1/settings/users
Body: {"username": "...", "password": "...", "role": "..."}

# 更新用户
PUT /api/v1/settings/users/:user_id

# 删除用户
DELETE /api/v1/settings/users/:user_id

# 用户权限
GET /api/v1/settings/users/:user_id/permissions

# 批量操作
POST /api/v1/settings/users/bulk-operation
Body: {"operation": "activate", "user_ids": [1,2,3]}
```

### 角色管理

```bash
# 角色列表
GET /api/v1/settings/roles

# 角色详情
GET /api/v1/settings/roles/:role_id

# 权限列表
GET /api/v1/settings/permissions
```

### 通知设置

```bash
# 通知配置
GET /api/v1/settings/notifications

# 测试邮件
POST /api/v1/settings/notifications/test-email
Body: {"recipient": "test@example.com"}

# 测试短信
POST /api/v1/settings/notifications/test-sms
Body: {"recipient": "13800138000"}

# 测试Webhook
POST /api/v1/settings/notifications/test-webhook
Body: {"url": "https://example.com/webhook"}
```

### 备份管理

```bash
# 备份配置
GET /api/v1/settings/backup/config

# 备份历史
GET /api/v1/settings/backup/history

# 创建备份
POST /api/v1/settings/backup/create
Body: {"name": "...", "type": "full"}

# 恢复备份
POST /api/v1/settings/backup/:backup_id/restore

# 删除备份
DELETE /api/v1/settings/backup/:backup_id
```

### 审计日志

```bash
# 审计日志
GET /api/v1/settings/audit/logs?page=1&action=login

# 日志详情
GET /api/v1/settings/audit/logs/:log_id

# 清理日志
DELETE /api/v1/settings/audit/cleanup?before_date=2025-01-01
```

---

## 🔍 巡检

```bash
# 巡检模板
GET /api/v1/inspection/templates
POST /api/v1/inspection/templates
PUT /api/v1/inspection/templates/:template_id
DELETE /api/v1/inspection/templates/:template_id

# 巡检任务
GET /api/v1/inspection/tasks
POST /api/v1/inspection/tasks
POST /api/v1/inspection/tasks/:task_id/cancel

# 巡检结果
GET /api/v1/inspection/results
GET /api/v1/inspection/results/:result_id
```

---

## 📈 报表

```bash
# 报表列表
GET /api/v1/reports?page=1&type=inspection

# 报表详情
GET /api/v1/reports/:report_id

# 生成报表
POST /api/v1/reports/:type
Body: {"format": "excel", "date_range": {...}}

# 下载报表
GET /api/v1/reports/:report_id/download

# 删除报表
DELETE /api/v1/reports/:report_id
```

---

## 📊 仪表板

```bash
# 仪表板概览
GET /api/v1/dashboard/overview

# 设备状态摘要
GET /api/v1/dashboard/device-status

# 告警摘要
GET /api/v1/dashboard/alert-summary

# 最近告警
GET /api/v1/dashboard/recent-alerts?limit=5

# 网络概览
GET /api/v1/dashboard/network-overview

# 通知中心聚合（告警 + 系统消息）
GET /api/v1/dashboard/notifications?limit=20
```

---

## 🔄 WebSocket

```javascript
// 连接WebSocket
// 注意：WebSocket 连接地址包含 user_id
const ws = new WebSocket('ws://localhost:8001/api/v1/ws/1')

// 订阅设备状态
ws.send(JSON.stringify({
  type: 'subscribe',
  data: { room: 'device_metrics' }
}))

// 接收消息
ws.onmessage = (event) => {
  const data = JSON.parse(event.data)
  console.log('Received:', data)
}
```

---

## 📝 通用参数

### 分页

```
?page=1&page_size=20
```

### 排序

```
?sort_by=created_at&sort_order=desc
```

### 筛选

```
?search=keyword&status=active&start_date=2026-01-01&end_date=2026-01-31
```

### 时间范围

```
?time_range=24h
?start_time=2026-01-01T00:00:00Z&end_time=2026-01-31T23:59:59Z
```

---

## 🔑 认证头

所有需要认证的请求都需要添加：

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## 📊 响应格式

### 成功响应

```json
{
  "data": [...],
  "total": 100,
  "page": 1,
  "page_size": 20,
  "pages": 5
}
```

### 错误响应

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "Invalid request parameters",
    "details": {...}
  }
}
```

---

## 🚀 快速开始

### 1. 获取令牌

```bash
curl -X POST http://localhost:8001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"password"}'
```

### 2. 使用令牌

```bash
export TOKEN="your_jwt_token"

curl -X GET http://localhost:8001/api/v1/devices \
  -H "Authorization: Bearer $TOKEN"
```

### 3. 创建资源

```bash
curl -X POST http://localhost:8001/api/v1/devices \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "核心交换机",
    "ip_address": "192.168.1.1",
    "device_type": "switch"
  }'
```

---

**文档版本**: v1.1  
**最后更新**: 2026-01-14  
**完整文档**: [API README](README.md)
