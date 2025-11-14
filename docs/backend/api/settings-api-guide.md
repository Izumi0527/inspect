# Settings API 使用指南
**网络设备巡检系统 - 统一设置页面 API 文档**

版本: v1.0.0
更新时间: 2025-01-XX

---

## 📋 目录

1. [概述](#概述)
2. [认证说明](#认证说明)
3. [API 端点列表](#api-端点列表)
4. [模块详细说明](#模块详细说明)
   - [General Settings (通用配置)](#1-general-settings-通用配置)
   - [Monitoring (系统监控)](#2-monitoring-系统监控)
   - [Audit (审计日志)](#3-audit-审计日志)
   - [Users (用户管理扩展)](#4-users-用户管理扩展)
   - [Notifications (通知配置)](#5-notifications-通知配置)
   - [Security (安全配置)](#6-security-安全配置)
5. [错误处理](#错误处理)
6. [示例代码](#示例代码)

---

## 概述

Settings API 提供了系统配置管理的统一接口，包含 6 个核心模块，共 18 个 API 端点。

### 技术栈
- **框架**: FastAPI 0.115+
- **认证**: JWT Bearer Token
- **数据格式**: JSON
- **字段命名**: 支持 camelCase 和 snake_case

### Base URL
```
http://your-domain/api/v1/settings
```

### 特性
- ✅ RESTful 设计
- ✅ 异步处理 (async/await)
- ✅ 自动数据验证 (Pydantic)
- ✅ 完整错误处理
- ✅ 结构化日志记录
- ✅ 99% 测试覆盖率

---

## 认证说明

所有 API 端点都需要 JWT Bearer Token 认证。

### 请求头格式
```http
Authorization: Bearer <your_jwt_token>
```

### 示例
```bash
curl -X GET "http://your-domain/api/v1/settings/system/settings" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### 权限要求
不同端点可能有不同的权限要求，详见各端点说明。

---

## API 端点列表

### 通用配置 (General Settings)
| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/system/settings` | 获取所有配置 |
| GET | `/system/settings/{key}` | 获取单个配置 |
| PUT | `/system/settings/{key}` | 更新单个配置 |
| POST | `/system/settings/bulk` | 批量更新配置 |
| GET | `/system/export` | 导出配置 |
| POST | `/system/import` | 导入配置 |

### 系统监控 (Monitoring)
| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/monitoring/current` | 获取当前监控指标 |
| GET | `/monitoring/history` | 获取历史监控数据 |

### 审计日志 (Audit)
| 方法 | 端点 | 说明 |
|------|------|------|
| GET | `/audit/stats` | 获取审计统计数据 |

### 用户管理扩展 (Users)
| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/users/batch` | 批量用户操作 |
| GET | `/users/stats` | 获取用户统计 |

### 通知配置 (Notifications)
| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/notifications/test-email` | 测试邮件配置 |
| POST | `/notifications/test-sms` | 测试短信配置 |
| POST | `/notifications/test-webhook` | 测试Webhook配置 |

### 安全配置 (Security)
| 方法 | 端点 | 说明 |
|------|------|------|
| POST | `/security/test-ldap` | 测试LDAP连接 |
| POST | `/security/sync-ldap-users` | 同步LDAP用户 |
| GET | `/security/sessions` | 获取活跃会话 |
| DELETE | `/security/sessions/{id}` | 删除指定会话 |

---

## 模块详细说明

## 1. General Settings (通用配置)

### 1.1 获取所有配置

**端点**: `GET /api/v1/settings/system/settings`

**查询参数**:
- `category` (可选): 配置分类筛选
  - 可选值: `system`, `notification`, `email`, `inspection`, `report`, `security`, `backup`

**响应**:
```json
[
  {
    "key": "system.name",
    "value": "巡检系统",
    "category": "system",
    "description": "系统名称"
  },
  {
    "key": "system.timezone",
    "value": "Asia/Shanghai",
    "category": "system",
    "description": "系统时区"
  }
]
```

**示例**:
```bash
# 获取所有配置
curl -X GET "http://your-domain/api/v1/settings/system/settings" \
  -H "Authorization: Bearer <token>"

# 按分类筛选
curl -X GET "http://your-domain/api/v1/settings/system/settings?category=system" \
  -H "Authorization: Bearer <token>"
```

---

### 1.2 获取单个配置

**端点**: `GET /api/v1/settings/system/settings/{key}`

**路径参数**:
- `key`: 配置键名 (例: `system.name`)

**响应**:
```json
{
  "key": "system.name",
  "value": "巡检系统",
  "category": "system",
  "description": "系统名称"
}
```

**错误响应**:
- `404`: 配置项不存在

---

### 1.3 更新单个配置

**端点**: `PUT /api/v1/settings/system/settings/{key}`

**路径参数**:
- `key`: 配置键名

**请求体**:
```json
{
  "value": "新的系统名称"
}
```

**响应**:
```json
{
  "key": "system.name",
  "value": "新的系统名称",
  "category": "system",
  "description": "系统名称"
}
```

**错误响应**:
- `400`: 缺少 value 字段
- `404`: 配置项不存在

---

### 1.4 批量更新配置

**端点**: `POST /api/v1/settings/system/settings/bulk`

**请求体**:
```json
{
  "settings": {
    "system.name": "新名称",
    "system.timezone": "UTC",
    "system.language": "en"
  }
}
```

**响应**:
```json
{
  "updated_count": 3,
  "failed_keys": [],
  "message": "成功更新 3 个配置项"
}
```

**部分失败响应**:
```json
{
  "updated_count": 2,
  "failed_keys": ["nonexistent.key"],
  "message": "成功更新 2 个配置项，1 个失败"
}
```

---

### 1.5 导出配置

**端点**: `GET /api/v1/settings/system/export`

**响应**:
```json
{
  "config_data": {
    "system.name": {
      "value": "巡检系统",
      "category": "system",
      "description": "系统名称"
    },
    "system.timezone": {
      "value": "Asia/Shanghai",
      "category": "system",
      "description": "系统时区"
    }
  },
  "export_time": "2025-01-15T10:30:00Z",
  "total_count": 2
}
```

**用途**: 备份配置、迁移到其他环境

---

### 1.6 导入配置

**端点**: `POST /api/v1/settings/system/import`

**请求体**:
```json
{
  "config_data": {
    "system.name": {
      "value": "导入的系统名称"
    },
    "system.timezone": {
      "value": "UTC"
    }
  },
  "overwrite": true
}
```

**参数说明**:
- `config_data`: 配置数据 (与导出格式一致)
- `overwrite`: 是否覆盖已有配置 (默认 false)

**响应**:
```json
{
  "imported_count": 2,
  "skipped_count": 0,
  "failed_keys": [],
  "message": "成功导入 2 个配置项"
}
```

---

## 2. Monitoring (系统监控)

### 2.1 获取当前监控指标

**端点**: `GET /api/v1/settings/monitoring/current`

**响应**:
```json
{
  "metrics": {
    "cpu": {
      "usage": 45.5,
      "cores": 8,
      "temperature": null
    },
    "memory": {
      "total": 17179869184,
      "used": 8589934592,
      "free": 8589934592,
      "usage": 50.0
    },
    "disk": {
      "total": 536870912000,
      "used": 322122547200,
      "free": 214748364800,
      "usage": 60.0
    },
    "network": {
      "bytesSent": 104857600,
      "bytesReceived": 524288000,
      "packetsSent": 10000,
      "packetsReceived": 50000
    }
  },
  "services": [
    {
      "name": "FastAPI",
      "status": "healthy",
      "response_time": 25,
      "uptime": 86400
    },
    {
      "name": "PostgreSQL",
      "status": "healthy",
      "response_time": 10,
      "uptime": 90000
    }
  ],
  "system": {
    "hostname": "server-01",
    "platform": "Linux 5.15.0",
    "uptime": 604800,
    "process_uptime": 172800
  },
  "timestamp": "2025-01-15T10:30:00Z"
}
```

**字段说明**:
- `cpu.usage`: CPU 使用率 (%)
- `memory.usage`: 内存使用率 (%)
- `disk.usage`: 磁盘使用率 (%)
- `services[].status`: 服务状态 (`healthy`, `degraded`, `unhealthy`)
- `uptime`: 运行时间 (秒)

---

### 2.2 获取历史监控数据

**端点**: `GET /api/v1/settings/monitoring/history`

**查询参数**:
- `hours`: 时间范围 (小时)，范围 1-168，默认 24

**示例**:
```bash
# 获取最近 24 小时数据
curl -X GET "http://your-domain/api/v1/settings/monitoring/history?hours=24" \
  -H "Authorization: Bearer <token>"

# 获取最近 7 天数据
curl -X GET "http://your-domain/api/v1/settings/monitoring/history?hours=168" \
  -H "Authorization: Bearer <token>"
```

**响应**:
```json
{
  "cpuUsage": [
    {"timestamp": "2025-01-15T09:00:00Z", "value": 45.0},
    {"timestamp": "2025-01-15T09:30:00Z", "value": 50.0}
  ],
  "memoryUsage": [
    {"timestamp": "2025-01-15T09:00:00Z", "value": 55.0},
    {"timestamp": "2025-01-15T09:30:00Z", "value": 60.0}
  ],
  "diskUsage": [
    {"timestamp": "2025-01-15T09:00:00Z", "value": 60.0},
    {"timestamp": "2025-01-15T09:30:00Z", "value": 60.0}
  ],
  "networkIo": [
    {"timestamp": "2025-01-15T09:00:00Z", "value": 100.0},
    {"timestamp": "2025-01-15T09:30:00Z", "value": 150.0}
  ]
}
```

**用途**: 绘制监控图表、性能分析

---

## 3. Audit (审计日志)

### 3.1 获取审计统计数据

**端点**: `GET /api/v1/settings/audit/stats`

**响应**:
```json
{
  "total_logs": 10000,
  "logs_today": 150,
  "logs_this_week": 1200,
  "logs_this_month": 5000,
  "logs_by_action": {
    "CREATE": 3000,
    "UPDATE": 4000,
    "DELETE": 2000,
    "LOGIN": 1000
  },
  "logs_by_status": {
    "SUCCESS": 9500,
    "FAILED": 500
  },
  "logs_by_resource_type": {
    "USER": 3000,
    "DEVICE": 4000,
    "SETTINGS": 2000,
    "ALERT": 1000
  },
  "top_active_users": [
    {"user_id": 1, "username": "admin", "count": 500},
    {"user_id": 2, "username": "operator1", "count": 300}
  ],
  "top_actions": [
    {"action": "UPDATE", "count": 4000},
    {"action": "CREATE", "count": 3000}
  ],
  "failed_operations_count": 500,
  "failed_operations_rate": 5.0
}
```

**用途**: 审计日志统计、安全分析、合规报告

---

## 4. Users (用户管理扩展)

### 4.1 批量用户操作

**端点**: `POST /api/v1/settings/users/batch`

**请求体**:
```json
{
  "operation": "activate",
  "user_ids": [1, 2, 3, 4, 5],
  "params": {}
}
```

**支持的操作类型**:
- `activate`: 激活用户
- `deactivate`: 停用用户
- `delete`: 删除用户
- `reset_password`: 重置密码
- `unlock`: 解锁账户
- `assign_role`: 分配角色

**assign_role 示例**:
```json
{
  "operation": "assign_role",
  "user_ids": [1, 2, 3],
  "params": {
    "role": "operator"
  }
}
```

**响应**:
```json
{
  "success_count": 5,
  "failed_count": 0,
  "failed_users": [],
  "message": "成功激活 5 个用户"
}
```

**部分失败响应**:
```json
{
  "success_count": 4,
  "failed_count": 1,
  "failed_users": [
    {"user_id": 5, "reason": "用户已被删除"}
  ],
  "message": "成功激活 4 个用户，1 个失败"
}
```

---

### 4.2 获取用户统计

**端点**: `GET /api/v1/settings/users/stats`

**响应**:
```json
{
  "total_users": 150,
  "active_users": 120,
  "inactive_users": 30,
  "locked_users": 5,
  "users_by_role": {
    "admin": 10,
    "operator": 50,
    "viewer": 90
  },
  "recent_logins": 75,
  "users_created_this_month": 10
}
```

---

## 5. Notifications (通知配置)

### 5.1 测试邮件配置

**端点**: `POST /api/v1/settings/notifications/test-email`

**请求体**:
```json
{
  "recipient": "test@example.com",
  "subject": "测试邮件",
  "content": "这是一封测试邮件"
}
```

**字段说明**:
- `recipient`: 接收邮箱 (可选，不填则发送给配置的发件人)
- `subject`: 邮件主题 (可选，有默认值)
- `content`: 邮件内容 (可选，有默认值)

**响应**:
```json
{
  "success": true,
  "message": "邮件发送成功"
}
```

**失败响应**:
```json
{
  "success": false,
  "message": "SMTP连接失败: Connection refused"
}
```

---

### 5.2 测试短信配置

**端点**: `POST /api/v1/settings/notifications/test-sms`

**请求体**:
```json
{
  "phone_number": "13800138000",
  "content": "测试短信"
}
```

**响应**:
```json
{
  "success": true,
  "message": "短信发送成功",
  "sms_id": "sms_12345"
}
```

---

### 5.3 测试Webhook配置

**端点**: `POST /api/v1/settings/notifications/test-webhook`

**请求体**:
```json
{
  "url": "https://example.com/webhook",
  "method": "POST",
  "headers": {
    "Content-Type": "application/json",
    "Authorization": "Bearer token123"
  },
  "payload": {
    "event": "test",
    "message": "测试消息"
  }
}
```

**支持的 HTTP 方法**: `GET`, `POST`, `PUT`, `PATCH`

**响应**:
```json
{
  "success": true,
  "message": "Webhook调用成功",
  "status_code": 200,
  "response_body": "{\"status\":\"ok\"}",
  "response_time_ms": 150
}
```

---

## 6. Security (安全配置)

### 6.1 测试LDAP连接

**端点**: `POST /api/v1/settings/security/test-ldap`

**请求体**:
```json
{
  "server_url": "ldap://192.168.1.100",
  "port": 389,
  "bind_dn": "cn=admin,dc=example,dc=com",
  "bind_password": "password",
  "base_dn": "dc=example,dc=com",
  "use_ssl": false
}
```

**响应**:
```json
{
  "success": true,
  "message": "LDAP连接成功",
  "user_count": 50
}
```

---

### 6.2 同步LDAP用户

**端点**: `POST /api/v1/settings/security/sync-ldap-users`

**请求体**:
```json
{
  "dry_run": false,
  "user_filter": "(objectClass=person)"
}
```

**参数说明**:
- `dry_run`: 模拟运行，不实际创建用户
- `user_filter`: LDAP 过滤条件 (可选)

**响应**:
```json
{
  "success": true,
  "message": "同步成功",
  "total_found": 100,
  "created": 20,
  "updated": 30,
  "skipped": 40,
  "failed": 10,
  "dry_run": false
}
```

---

### 6.3 获取活跃会话

**端点**: `GET /api/v1/settings/security/sessions`

**响应**:
```json
{
  "total": 2,
  "sessions": [
    {
      "session_id": "session_123",
      "user_id": 1,
      "username": "admin",
      "ip_address": "192.168.1.100",
      "user_agent": "Mozilla/5.0",
      "created_at": "2025-01-15T09:00:00Z",
      "last_activity": "2025-01-15T10:30:00Z",
      "expires_at": null,
      "is_active": true
    }
  ]
}
```

---

### 6.4 删除指定会话

**端点**: `DELETE /api/v1/settings/security/sessions/{session_id}`

**路径参数**:
- `session_id`: 会话 ID

**响应**:
```json
{
  "success": true,
  "message": "会话已删除"
}
```

**错误响应**:
- `404`: 会话不存在

---

## 错误处理

### 标准错误响应格式

```json
{
  "detail": "错误详细信息"
}
```

### HTTP 状态码

| 状态码 | 说明 |
|--------|------|
| 200 | 请求成功 |
| 400 | 请求参数错误 |
| 401 | 未授权 (缺少或无效的 Token) |
| 403 | 禁止访问 (权限不足) |
| 404 | 资源不存在 |
| 422 | 数据验证失败 |
| 500 | 服务器内部错误 |

### 常见错误示例

#### 401 未授权
```json
{
  "detail": "Not authenticated"
}
```

#### 404 资源不存在
```json
{
  "detail": "配置项不存在: system.nonexistent"
}
```

#### 422 验证失败
```json
{
  "detail": [
    {
      "loc": ["body", "recipient"],
      "msg": "value is not a valid email address",
      "type": "value_error.email"
    }
  ]
}
```

#### 500 服务器错误
```json
{
  "detail": "获取配置失败: Database connection error"
}
```

---

## 示例代码

### Python (使用 requests)

```python
import requests

BASE_URL = "http://your-domain/api/v1/settings"
TOKEN = "your_jwt_token"

headers = {
    "Authorization": f"Bearer {TOKEN}",
    "Content-Type": "application/json"
}

# 获取所有配置
response = requests.get(f"{BASE_URL}/system/settings", headers=headers)
settings = response.json()

# 更新单个配置
response = requests.put(
    f"{BASE_URL}/system/settings/system.name",
    json={"value": "新名称"},
    headers=headers
)
updated_setting = response.json()

# 测试邮件配置
response = requests.post(
    f"{BASE_URL}/notifications/test-email",
    json={
        "recipient": "test@example.com",
        "subject": "测试",
        "content": "测试内容"
    },
    headers=headers
)
result = response.json()
print(f"Email test: {result['success']}")
```

### JavaScript (使用 fetch)

```javascript
const BASE_URL = 'http://your-domain/api/v1/settings';
const TOKEN = 'your_jwt_token';

const headers = {
  'Authorization': `Bearer ${TOKEN}`,
  'Content-Type': 'application/json'
};

// 获取所有配置
async function getAllSettings() {
  const response = await fetch(`${BASE_URL}/system/settings`, { headers });
  const settings = await response.json();
  return settings;
}

// 更新单个配置
async function updateSetting(key, value) {
  const response = await fetch(`${BASE_URL}/system/settings/${key}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify({ value })
  });
  return await response.json();
}

// 获取监控数据
async function getCurrentMetrics() {
  const response = await fetch(`${BASE_URL}/monitoring/current`, { headers });
  return await response.json();
}
```

### cURL

```bash
# 获取所有配置
curl -X GET "http://your-domain/api/v1/settings/system/settings" \
  -H "Authorization: Bearer <token>"

# 更新配置
curl -X PUT "http://your-domain/api/v1/settings/system/settings/system.name" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"value": "新名称"}'

# 批量操作
curl -X POST "http://your-domain/api/v1/settings/users/batch" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "operation": "activate",
    "user_ids": [1, 2, 3]
  }'
```

---

## 最佳实践

### 1. 错误处理
```javascript
async function fetchSettings() {
  try {
    const response = await fetch(url, { headers });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.detail);
    }

    return await response.json();
  } catch (error) {
    console.error('Failed to fetch settings:', error);
    // 用户友好的错误提示
  }
}
```

### 2. Token 刷新
```javascript
async function requestWithAuth(url, options = {}) {
  let token = getToken();

  // 检查 token 是否过期
  if (isTokenExpired(token)) {
    token = await refreshToken();
  }

  options.headers = {
    ...options.headers,
    'Authorization': `Bearer ${token}`
  };

  return fetch(url, options);
}
```

### 3. 批量操作优化
```javascript
// ❌ 不推荐: 逐个更新
for (const key in settings) {
  await updateSetting(key, settings[key]);
}

// ✅ 推荐: 批量更新
await bulkUpdateSettings(settings);
```

---

## 技术支持

- **API 文档**: http://your-domain/docs (Swagger UI)
- **源代码**: https://github.com/your-org/inspect
- **问题反馈**: https://github.com/your-org/inspect/issues

---

**文档版本**: v1.0.0
**最后更新**: 2025-01-XX
**维护团队**: Backend Team
