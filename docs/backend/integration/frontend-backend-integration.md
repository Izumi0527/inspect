# 前后端集成指南 - Settings API
**网络设备巡检系统 - 前后端对接完整指南**

版本: v1.0.0
更新时间: 2025-01-XX

---

## 📋 目录

1. [概述](#概述)
2. [接口差异分析](#接口差异分析)
3. [修复方案](#修复方案)
4. [CORS 配置](#cors-配置)
5. [认证流程](#认证流程)
6. [标准调用示例](#标准调用示例)
7. [错误处理](#错误处理)
8. [联调步骤](#联调步骤)
9. [常见问题](#常见问题)

---

## 概述

Settings API 前后端集成涉及：
- ✅ **后端**: FastAPI 框架，Python 3.11+
- ✅ **前端**: Next.js 15.x，React 19，TypeScript
- ✅ **认证**: JWT Bearer Token
- ✅ **数据格式**: JSON (支持 camelCase 和 snake_case)

### 技术栈对比

| 组件 | 后端 | 前端 |
|------|------|------|
| 框架 | FastAPI | Next.js 15 |
| 语言 | Python | TypeScript |
| HTTP 客户端 | httpx | fetch API |
| 数据验证 | Pydantic | Zod (可选) |
| 状态管理 | - | Zustand |

---

## 接口差异分析

### ⚠️ 问题 1: General Settings PUT 请求体格式不匹配

#### 当前前端实现 (错误)
```typescript
// frontend/src/features/settings/api/general.api.ts (行 65-68)
httpClient.put('/settings/system/settings/system.application_name', {
  key: 'system.application_name',  // ❌ 多余字段
  value: data.applicationName,
})
```

#### 后端期望格式
```python
# backend/src/api/settings/general.py (行 68-76)
@router.put("/settings/{key}")
async def update_setting(
    key: str,  # key 已在 URL 中
    value: Dict[str, Any],  # 期望 {"value": "实际值"}
    ...
):
    actual_value = value.get("value")  # 提取 value 字段
```

#### 🔧 修复方案
```typescript
// ✅ 正确格式
httpClient.put('/settings/system/settings/system.application_name', {
  value: data.applicationName,  // 只发送 value 字段
})
```

---

### ⚠️ 问题 2: 导出接口响应格式不匹配

#### 当前前端实现
```typescript
// frontend/src/features/settings/api/general.api.ts (行 217-229)
exportConfig: async (): Promise<Blob> => {
  const response = await fetch(url)
  return response.blob()  // ❌ 期望 Blob，但后端返回 JSON
}
```

#### 后端实际响应
```python
# backend/src/api/settings/general.py (行 117-131)
@router.get("/export", response_model=ExportConfigResponse)
async def export_config(...):
    return ExportConfigResponse(
        config_data={"key": {"value": "..."}},  # ✅ JSON 格式
        export_time=datetime.now(),
        total_count=1
    )
```

#### 🔧 修复方案
```typescript
// ✅ 正确实现
exportConfig: async (): Promise<ExportConfigResponse> => {
  return httpClient.get<ExportConfigResponse>('/settings/system/export')
}

// 如果需要下载为文件
exportConfigAsFile: async (): Promise<void> => {
  const data = await httpClient.get<ExportConfigResponse>('/settings/system/export')
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `settings-export-${Date.now()}.json`
  a.click()
  URL.revokeObjectURL(url)
}
```

---

### ⚠️ 问题 3: 导入接口请求格式不匹配

#### 当前前端实现
```typescript
// frontend/src/features/settings/api/general.api.ts (行 235-251)
importConfig: async (file: File): Promise<...> => {
  const formData = new FormData()
  formData.append('file', file)  // ❌ 后端期望 JSON，不是文件上传

  const response = await fetch(url, {
    method: 'POST',
    body: formData
  })
}
```

#### 后端期望格式
```python
# backend/src/api/settings/general.py (行 134-154)
@router.post("/import", response_model=ImportConfigResponse)
async def import_config(
    request: ImportConfigRequest,  # ✅ 期望 JSON 格式
    ...
):
    # request 包含 config_data (dict) 和 overwrite (bool)
```

#### 🔧 修复方案
```typescript
// ✅ 正确实现
importConfig: async (file: File): Promise<ImportConfigResponse> => {
  // 1. 读取文件内容
  const text = await file.text()
  const configData = JSON.parse(text)

  // 2. 发送 JSON 请求
  return httpClient.post<ImportConfigResponse>('/settings/system/import', {
    config_data: configData,  // JSON 格式的配置数据
    overwrite: true
  })
}
```

---

### ✅ 正确的接口（无需修改）

#### Monitoring API
```typescript
// ✅ 前端实现正确
httpClient.get('/settings/monitoring/current')
httpClient.get('/settings/monitoring/history?hours=24')
```

#### Notifications API
```typescript
// ✅ 前端实现正确
httpClient.post('/settings/notifications/test-email', {
  recipient: 'test@example.com',
  subject: '测试',
  content: '内容'
})
```

#### Security API
```typescript
// ✅ 前端实现正确
httpClient.post('/settings/security/test-ldap', { ... })
httpClient.get('/settings/security/sessions')
```

---

## 修复方案

### 方案 A: 修改前端代码（推荐）

#### 修复文件: `frontend/src/features/settings/api/general.api.ts`

```typescript
import { httpClient } from '@/lib/api-client'
import type {
  BasicInfoConfig,
  InspectionConfig,
  ReportConfig,
  UserPreferenceConfig,
  GeneralSettingsResponse,
  ExportConfigResponse,
  ImportConfigResponse,
} from '../types/general.types'

// 后端配置项的类型
interface BackendSetting {
  key: string
  value: any
  category: string
  description?: string
}

export const generalApi = {
  /**
   * 获取所有通用配置
   */
  getGeneralSettings: async (): Promise<GeneralSettingsResponse> => {
    const allSettings = await httpClient.get<BackendSetting[]>('/settings/system/settings')

    const settingsMap = new Map<string, any>()
    allSettings.forEach((setting) => {
      settingsMap.set(setting.key, setting.value)
    })

    return {
      basicInfo: {
        applicationName: settingsMap.get('system.application_name') || '网络设备巡检系统',
        version: settingsMap.get('system.version') || '1.0.0',
        timezone: settingsMap.get('system.timezone') || 'Asia/Shanghai',
      },
      inspectionConfig: {
        maxConcurrentTasks: settingsMap.get('inspection.max_concurrent_tasks') || 10,
        defaultTimeout: settingsMap.get('inspection.default_timeout') || 30,
        retryAttempts: settingsMap.get('inspection.retry_attempts') || 3,
      },
      reportConfig: {
        defaultFormat: settingsMap.get('report.default_format') || 'excel',
        maxExportRecords: settingsMap.get('report.max_export_records') || 10000,
      },
      userPreference: {
        theme: settingsMap.get('user_preference.theme') || 'auto',
        language: settingsMap.get('user_preference.language') || 'zh-CN',
        dateFormat: settingsMap.get('user_preference.date_format') || 'YYYY-MM-DD',
        timeFormat: settingsMap.get('user_preference.time_format') || '24h',
      },
    }
  },

  /**
   * 更新基础信息
   * ✅ 修复: 只发送 value 字段
   */
  updateBasicInfo: async (data: Partial<BasicInfoConfig>): Promise<void> => {
    const updates: Array<Promise<any>> = []

    if (data.applicationName !== undefined) {
      updates.push(
        httpClient.put('/settings/system/settings/system.application_name', {
          value: data.applicationName,  // ✅ 只发送 value
        })
      )
    }

    if (data.timezone !== undefined) {
      updates.push(
        httpClient.put('/settings/system/settings/system.timezone', {
          value: data.timezone,  // ✅ 只发送 value
        })
      )
    }

    await Promise.all(updates)
  },

  /**
   * 更新巡检配置
   * ✅ 修复: 只发送 value 字段
   */
  updateInspectionConfig: async (data: Partial<InspectionConfig>): Promise<void> => {
    const updates: Array<Promise<any>> = []

    if (data.maxConcurrentTasks !== undefined) {
      updates.push(
        httpClient.put('/settings/system/settings/inspection.max_concurrent_tasks', {
          value: data.maxConcurrentTasks,  // ✅ 只发送 value
        })
      )
    }

    if (data.defaultTimeout !== undefined) {
      updates.push(
        httpClient.put('/settings/system/settings/inspection.default_timeout', {
          value: data.defaultTimeout,  // ✅ 只发送 value
        })
      )
    }

    if (data.retryAttempts !== undefined) {
      updates.push(
        httpClient.put('/settings/system/settings/inspection.retry_attempts', {
          value: data.retryAttempts,  // ✅ 只发送 value
        })
      )
    }

    await Promise.all(updates)
  },

  /**
   * 更新报表配置
   * ✅ 修复: 只发送 value 字段
   */
  updateReportConfig: async (data: Partial<ReportConfig>): Promise<void> => {
    const updates: Array<Promise<any>> = []

    if (data.defaultFormat !== undefined) {
      updates.push(
        httpClient.put('/settings/system/settings/report.default_format', {
          value: data.defaultFormat,  // ✅ 只发送 value
        })
      )
    }

    if (data.maxExportRecords !== undefined) {
      updates.push(
        httpClient.put('/settings/system/settings/report.max_export_records', {
          value: data.maxExportRecords,  // ✅ 只发送 value
        })
      )
    }

    await Promise.all(updates)
  },

  /**
   * 更新用户偏好
   * ✅ 修复: 只发送 value 字段
   */
  updateUserPreference: async (data: Partial<UserPreferenceConfig>): Promise<void> => {
    const updates: Array<Promise<any>> = []

    if (data.theme !== undefined) {
      updates.push(
        httpClient.put('/settings/system/settings/user_preference.theme', {
          value: data.theme,  // ✅ 只发送 value
        })
      )
    }

    if (data.language !== undefined) {
      updates.push(
        httpClient.put('/settings/system/settings/user_preference.language', {
          value: data.language,  // ✅ 只发送 value
        })
      )
    }

    if (data.dateFormat !== undefined) {
      updates.push(
        httpClient.put('/settings/system/settings/user_preference.date_format', {
          value: data.dateFormat,  // ✅ 只发送 value
        })
      )
    }

    if (data.timeFormat !== undefined) {
      updates.push(
        httpClient.put('/settings/system/settings/user_preference.time_format', {
          value: data.timeFormat,  // ✅ 只发送 value
        })
      )
    }

    await Promise.all(updates)
  },

  /**
   * 批量保存所有配置
   */
  saveAll: async (data: GeneralSettingsResponse): Promise<void> => {
    const settings: Record<string, any> = {
      'system.application_name': data.basicInfo.applicationName,
      'system.timezone': data.basicInfo.timezone,
      'inspection.max_concurrent_tasks': data.inspectionConfig.maxConcurrentTasks,
      'inspection.default_timeout': data.inspectionConfig.defaultTimeout,
      'inspection.retry_attempts': data.inspectionConfig.retryAttempts,
      'report.default_format': data.reportConfig.defaultFormat,
      'report.max_export_records': data.reportConfig.maxExportRecords,
      'user_preference.theme': data.userPreference.theme,
      'user_preference.language': data.userPreference.language,
      'user_preference.date_format': data.userPreference.dateFormat,
      'user_preference.time_format': data.userPreference.timeFormat,
    }

    await httpClient.post('/settings/system/settings/bulk', { settings })
  },

  /**
   * 导出通用配置
   * ✅ 修复: 返回 JSON 格式
   */
  exportConfig: async (): Promise<ExportConfigResponse> => {
    return httpClient.get<ExportConfigResponse>('/settings/system/export')
  },

  /**
   * 导出为文件
   */
  exportConfigAsFile: async (): Promise<void> => {
    const data = await httpClient.get<ExportConfigResponse>('/settings/system/export')

    // 创建 Blob 并下载
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `settings-export-${new Date().toISOString().slice(0, 10)}.json`
    a.click()
    URL.revokeObjectURL(url)
  },

  /**
   * 导入通用配置
   * ✅ 修复: 发送 JSON 格式而不是 FormData
   */
  importConfig: async (file: File, overwrite: boolean = true): Promise<ImportConfigResponse> => {
    // 读取文件内容
    const text = await file.text()
    const exportData: ExportConfigResponse = JSON.parse(text)

    // 发送 JSON 请求
    return httpClient.post<ImportConfigResponse>('/settings/system/import', {
      config_data: exportData.config_data,
      overwrite: overwrite,
    })
  },
}
```

---

### 方案 B: 添加类型定义（补充）

创建 `frontend/src/features/settings/types/general.types.ts`:

```typescript
// 导出配置响应
export interface ExportConfigResponse {
  config_data: Record<string, {
    value: any
    category?: string
    description?: string
  }>
  export_time: string  // ISO datetime
  total_count: number
}

// 导入配置响应
export interface ImportConfigResponse {
  imported_count: number
  skipped_count: number
  failed_keys: string[]
  message: string
}

// ... 其他类型定义
```

---

## CORS 配置

### 后端 CORS 设置

当前配置 (`backend/src/core/config.py`):
```python
CORS_ORIGINS: Union[str, List[str]] = [
    "http://localhost:3000",
    "http://127.0.0.1:3000"
]
```

### 生产环境配置

在 `.env` 文件中配置:
```bash
# 开发环境
CORS_ORIGINS=["http://localhost:3000","http://127.0.0.1:3000"]

# 生产环境
CORS_ORIGINS=["https://your-domain.com","https://www.your-domain.com"]
```

### 验证 CORS

```bash
# 测试 CORS 预检请求
curl -X OPTIONS http://localhost:8000/api/v1/settings/system/settings \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: GET" \
  -v
```

预期响应头包含:
```
Access-Control-Allow-Origin: http://localhost:3000
Access-Control-Allow-Credentials: true
Access-Control-Allow-Methods: *
Access-Control-Allow-Headers: *
```

---

## 认证流程

### 1. 获取 Token

```typescript
import { api, TokenManager } from '@/lib/api-client'

// 登录
const response = await api.auth.login({
  username: 'admin',
  password: 'password',
  remember_me: true
})

// 保存 Token
TokenManager.setTokens(response.access_token, response.refresh_token)
```

### 2. 自动添加认证头

httpClient 会自动在请求头中添加 Token:

```typescript
// httpClient 内部实现
private buildHeaders(customHeaders?: HeadersInit): Headers {
  const headers = new Headers({ ...this.defaultHeaders, ...customHeaders })

  // 自动添加认证令牌
  const token = TokenManager.getAccessToken()
  if (token) {
    headers.set('Authorization', `Bearer ${token}`)
  }

  return headers
}
```

### 3. Token 刷新

```typescript
// 当收到 401 错误时，自动刷新 Token
if (error.status === 401) {
  try {
    const newTokens = await api.auth.refresh()
    TokenManager.setTokens(newTokens.access_token, newTokens.refresh_token)
    // 重试原请求
  } catch {
    // 刷新失败，跳转登录页
    TokenManager.clearTokens()
    window.location.href = '/login'
  }
}
```

---

## 标准调用示例

### General Settings

```typescript
import { generalApi } from '@/features/settings/api/general.api'

// 1. 获取所有配置
const settings = await generalApi.getGeneralSettings()
console.log(settings.basicInfo.applicationName)

// 2. 更新单个配置
await generalApi.updateBasicInfo({
  applicationName: '新系统名称',
  timezone: 'UTC'
})

// 3. 批量保存
await generalApi.saveAll(settings)

// 4. 导出配置
const exportData = await generalApi.exportConfig()
console.log(exportData.config_data)

// 5. 导出为文件
await generalApi.exportConfigAsFile()

// 6. 导入配置
const file = /* File 对象 */
const result = await generalApi.importConfig(file, true)
console.log(result.message)
```

### Monitoring

```typescript
import { monitoringApi } from '@/features/settings/api/monitoring.api'

// 1. 获取当前监控数据
const current = await monitoringApi.getCurrentMetrics()
console.log(`CPU: ${current.metrics.cpu.usage}%`)
console.log(`Memory: ${current.metrics.memory.usage}%`)

// 2. 获取历史数据
const history = await monitoringApi.getMetricHistory(24) // 最近 24 小时
console.log(history.cpuUsage)
```

### Notifications

```typescript
import { notificationApi } from '@/features/settings/api/notification.api'

// 1. 测试邮件
const emailResult = await notificationApi.testEmail({
  recipient: 'test@example.com',
  subject: '测试邮件',
  content: '这是测试内容'
})
console.log(emailResult.success ? '成功' : '失败')

// 2. 测试短信
const smsResult = await notificationApi.testSms({
  phone_number: '13800138000',
  content: '测试短信'
})
console.log(`SMS ID: ${smsResult.sms_id}`)

// 3. 测试 Webhook
const webhookResult = await notificationApi.testWebhook({
  url: 'https://example.com/webhook',
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  payload: { test: true }
})
console.log(`Response time: ${webhookResult.response_time_ms}ms`)
```

### Security

```typescript
import { securityApi } from '@/features/settings/api/security.api'

// 1. 测试 LDAP 连接
const ldapResult = await securityApi.testLdap({
  server_url: 'ldap://192.168.1.100',
  port: 389,
  bind_dn: 'cn=admin,dc=example,dc=com',
  bind_password: 'password',
  base_dn: 'dc=example,dc=com',
  use_ssl: false
})
console.log(`Found ${ldapResult.user_count} users`)

// 2. 同步 LDAP 用户
const syncResult = await securityApi.syncLdapUsers({
  dry_run: false,
  user_filter: '(objectClass=person)'
})
console.log(`Created: ${syncResult.created}, Updated: ${syncResult.updated}`)

// 3. 获取活跃会话
const sessions = await securityApi.getSessions()
console.log(`Total sessions: ${sessions.total}`)

// 4. 删除会话
await securityApi.deleteSession('session_123')
```

### Users

```typescript
import { usersApi } from '@/features/settings/api/users.api'

// 1. 批量操作
const result = await usersApi.batchOperation({
  operation: 'activate',
  user_ids: [1, 2, 3, 4, 5]
})
console.log(`Success: ${result.success_count}, Failed: ${result.failed_count}`)

// 2. 获取用户统计
const stats = await usersApi.getUserStats()
console.log(`Total users: ${stats.total_users}`)
console.log(`Active: ${stats.active_users}`)
```

---

## 错误处理

### 统一错误处理

```typescript
import { ApiClientError } from '@/lib/api-client'

try {
  const settings = await generalApi.getGeneralSettings()
} catch (error) {
  if (error instanceof ApiClientError) {
    // 处理 API 错误
    switch (error.status) {
      case 400:
        console.error('请求参数错误:', error.message)
        break
      case 401:
        console.error('未授权，请重新登录')
        // 跳转登录页
        break
      case 403:
        console.error('权限不足')
        break
      case 404:
        console.error('资源不存在:', error.message)
        break
      case 422:
        console.error('数据验证失败:', error.detail)
        break
      case 500:
        console.error('服务器错误:', error.message)
        break
      default:
        console.error('未知错误:', error.message)
    }
  } else {
    // 处理其他错误（网络错误等）
    console.error('网络错误或超时')
  }
}
```

### React 组件中的错误处理

```typescript
import { useState } from 'react'
import { generalApi } from '@/features/settings/api/general.api'
import { ApiClientError } from '@/lib/api-client'

function SettingsPage() {
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const handleSave = async () => {
    setLoading(true)
    setError(null)

    try {
      await generalApi.updateBasicInfo({
        applicationName: '新名称'
      })
      // 成功提示
      alert('保存成功')
    } catch (err) {
      if (err instanceof ApiClientError) {
        setError(err.message)
      } else {
        setError('保存失败，请重试')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      {error && <div className="error">{error}</div>}
      <button onClick={handleSave} disabled={loading}>
        {loading ? '保存中...' : '保存'}
      </button>
    </div>
  )
}
```

---

## 联调步骤

### 1. 启动后端服务

```bash
cd backend

# 启动开发服务器
uv run uvicorn src.main:app --reload --host 0.0.0.0 --port 8000

# 或使用 main.py
uv run python src/main.py
```

验证后端启动:
```bash
curl http://localhost:8000/health
# 预期: {"status":"healthy","version":"1.0.0","timestamp":...}
```

访问 API 文档:
- Swagger UI: http://localhost:8000/docs
- ReDoc: http://localhost:8000/redoc

### 2. 启动前端服务

```bash
cd frontend

# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

访问前端: http://localhost:3000

### 3. 配置环境变量

**前端** (`.env.local`):
```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
```

**后端** (`.env`):
```bash
DEBUG=true
CORS_ORIGINS=["http://localhost:3000","http://127.0.0.1:3000"]
SECRET_KEY=your-secret-key-for-development
JWT_SECRET_KEY=your-jwt-secret-key
DATABASE_URL=postgresql+asyncpg://postgres:password@localhost:5432/inspect_db
REDIS_URL=redis://localhost:6379/0
```

### 4. 测试认证流程

```typescript
// 1. 登录
const loginResponse = await api.auth.login({
  username: 'admin',
  password: 'admin123',
  remember_me: true
})

console.log('Access Token:', loginResponse.access_token)
TokenManager.setTokens(loginResponse.access_token, loginResponse.refresh_token)

// 2. 测试需要认证的接口
const settings = await generalApi.getGeneralSettings()
console.log('Settings loaded:', settings)
```

### 5. 测试 CORS

在浏览器开发者工具中检查:
- Network → 选择请求 → Headers
- 确认有 `Access-Control-Allow-Origin: http://localhost:3000`

如果遇到 CORS 错误:
```
Access to fetch at 'http://localhost:8000/api/v1/...' from origin 'http://localhost:3000'
has been blocked by CORS policy
```

检查:
1. 后端 CORS_ORIGINS 配置
2. 前端请求的 Origin 是否在白名单中
3. 是否包含 `withCredentials: true` (如果需要)

### 6. 逐个测试 API 端点

使用 Postman 或 curl 测试每个端点:

```bash
# 获取所有配置
curl http://localhost:8000/api/v1/settings/system/settings \
  -H "Authorization: Bearer <token>"

# 更新配置
curl -X PUT http://localhost:8000/api/v1/settings/system/settings/system.name \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"value": "新名称"}'

# 获取监控数据
curl http://localhost:8000/api/v1/settings/monitoring/current \
  -H "Authorization: Bearer <token>"
```

### 7. 前端集成测试

在前端页面中测试所有功能:
- ✅ 加载数据
- ✅ 修改配置
- ✅ 保存配置
- ✅ 导出配置
- ✅ 导入配置
- ✅ 错误处理
- ✅ 加载状态
- ✅ 成功提示

---

## 常见问题

### Q1: CORS 错误怎么办？

**A**: 检查后端 CORS 配置:
```python
# backend/src/core/config.py
CORS_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"]
```

### Q2: 401 未授权错误？

**A**: 检查 Token:
```typescript
const token = TokenManager.getAccessToken()
console.log('Current token:', token)

// 如果 token 为 null，需要重新登录
if (!token) {
  await api.auth.login({ username, password })
}
```

### Q3: 请求超时怎么办？

**A**: 调整超时配置:
```typescript
// 增加超时时间
httpClient.get('/endpoint', { timeout: 30000 }) // 30 秒
```

### Q4: 数据格式不匹配？

**A**: 检查请求/响应格式:
```typescript
// 使用浏览器开发者工具
// Network → 选择请求 → Preview/Response
// 对比实际响应与类型定义
```

### Q5: 如何调试前后端通信？

**A**: 多种调试方法:

1. **浏览器开发者工具**:
   - Network 面板查看请求/响应
   - Console 查看日志

2. **后端日志**:
   ```bash
   # 查看实时日志
   tail -f logs/backend/app.log
   ```

3. **Postman/cURL 测试**:
   - 独立测试后端接口
   - 排除前端问题

4. **添加调试日志**:
   ```typescript
   // 前端
   console.log('Request:', endpoint, data)
   console.log('Response:', response)

   // 后端
   logger.info("API called", endpoint=endpoint, data=data)
   ```

---

## 检查清单

### 后端检查

- [ ] 后端服务正常启动 (http://localhost:8000/health)
- [ ] API 文档可访问 (http://localhost:8000/docs)
- [ ] CORS 配置正确
- [ ] 数据库连接正常
- [ ] Redis 连接正常 (如果使用)
- [ ] JWT Secret 已配置
- [ ] 环境变量正确设置

### 前端检查

- [ ] 前端服务正常启动 (http://localhost:3000)
- [ ] API_URL 环境变量正确
- [ ] httpClient 配置正确
- [ ] Token 管理正常
- [ ] 错误处理完善
- [ ] 加载状态显示
- [ ] 成功/失败提示

### 接口检查

- [ ] General Settings API (6 个端点)
- [ ] Monitoring API (2 个端点)
- [ ] Audit API (1 个端点)
- [ ] Users API (2 个端点)
- [ ] Notifications API (3 个端点)
- [ ] Security API (4 个端点)

---

## 下一步

1. ✅ **应用修复方案**: 修改前端 general.api.ts
2. ✅ **完整测试**: 测试所有 API 端点
3. ✅ **错误处理**: 完善前端错误处理
4. ✅ **性能优化**: 添加请求缓存、防抖等
5. ✅ **文档更新**: 更新前端 API 调用文档

---

**文档版本**: v1.0.0
**最后更新**: 2025-01-XX
**维护团队**: Full-Stack Team
