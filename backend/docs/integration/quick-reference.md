# Settings API 快速参考
**前端开发者速查手册**

---

## 🚀 快速开始

### 1. 环境配置

**前端 `.env.local`**:
```bash
NEXT_PUBLIC_API_URL=http://localhost:8000
```

**后端 `.env`**:
```bash
DEBUG=true
CORS_ORIGINS=["http://localhost:3000"]
```

### 2. 启动服务

```bash
# 后端
cd backend && uv run python src/main.py

# 前端
cd frontend && npm run dev
```

### 3. 基本使用

```typescript
import { generalApi } from '@/features/settings/api/general.api'

// 获取配置
const settings = await generalApi.getGeneralSettings()

// 更新配置
await generalApi.updateBasicInfo({ applicationName: '新名称' })
```

---

## 📚 API 端点速查

### General Settings

| 方法 | 端点 | 前端调用 |
|------|------|----------|
| GET | `/settings/system/settings` | `generalApi.getGeneralSettings()` |
| GET | `/settings/system/settings/{key}` | `generalApi.getSetting(key)` |
| PUT | `/settings/system/settings/{key}` | `generalApi.updateSetting(key, value)` |
| POST | `/settings/system/settings/bulk` | `generalApi.saveAll(data)` |
| GET | `/settings/system/export` | `generalApi.exportConfig()` |
| POST | `/settings/system/import` | `generalApi.importConfig(file)` |

### Monitoring

| 方法 | 端点 | 前端调用 |
|------|------|----------|
| GET | `/settings/monitoring/current` | `monitoringApi.getCurrentMetrics()` |
| GET | `/settings/monitoring/history?hours=24` | `monitoringApi.getMetricHistory(24)` |

### Notifications

| 方法 | 端点 | 前端调用 |
|------|------|----------|
| POST | `/settings/notifications/test-email` | `notificationApi.testEmail(data)` |
| POST | `/settings/notifications/test-sms` | `notificationApi.testSms(data)` |
| POST | `/settings/notifications/test-webhook` | `notificationApi.testWebhook(data)` |

### Security

| 方法 | 端点 | 前端调用 |
|------|------|----------|
| POST | `/settings/security/test-ldap` | `securityApi.testLdap(data)` |
| POST | `/settings/security/sync-ldap-users` | `securityApi.syncLdapUsers(data)` |
| GET | `/settings/security/sessions` | `securityApi.getSessions()` |
| DELETE | `/settings/security/sessions/{id}` | `securityApi.deleteSession(id)` |

### Users

| 方法 | 端点 | 前端调用 |
|------|------|----------|
| POST | `/settings/users/batch` | `usersApi.batchOperation(data)` |
| GET | `/settings/users/stats` | `usersApi.getUserStats()` |

### Audit

| 方法 | 端点 | 前端调用 |
|------|------|----------|
| GET | `/settings/audit/stats` | `auditApi.getAuditStats()` |

---

## 💡 常用代码片段

### 获取并显示配置

```typescript
import { useState, useEffect } from 'react'
import { generalApi } from '@/features/settings/api/general.api'

function SettingsComponent() {
  const [settings, setSettings] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const data = await generalApi.getGeneralSettings()
        setSettings(data)
      } catch (error) {
        console.error('Failed to load settings:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchSettings()
  }, [])

  if (loading) return <div>Loading...</div>

  return <div>{settings?.basicInfo.applicationName}</div>
}
```

### 保存配置

```typescript
import { generalApi } from '@/features/settings/api/general.api'

async function handleSave() {
  try {
    await generalApi.updateBasicInfo({
      applicationName: '新系统名称',
      timezone: 'UTC'
    })
    alert('保存成功')
  } catch (error) {
    alert('保存失败')
  }
}
```

### 错误处理

```typescript
import { ApiClientError } from '@/lib/api-client'

try {
  await generalApi.updateBasicInfo(data)
} catch (error) {
  if (error instanceof ApiClientError) {
    if (error.status === 401) {
      // 跳转登录页
      window.location.href = '/login'
    } else {
      alert(error.message)
    }
  }
}
```

### 批量更新

```typescript
import { generalApi } from '@/features/settings/api/general.api'

const settings = {
  basicInfo: { applicationName: '新名称', timezone: 'UTC' },
  inspectionConfig: { maxConcurrentTasks: 20 },
  reportConfig: { defaultFormat: 'pdf' },
  userPreference: { theme: 'dark' }
}

await generalApi.saveAll(settings)
```

### 导出配置

```typescript
import { generalApi } from '@/features/settings/api/general.api'

// 方法 1: 获取 JSON 数据
const exportData = await generalApi.exportConfig()
console.log(exportData.config_data)

// 方法 2: 直接下载文件
await generalApi.exportConfigAsFile()
```

### 导入配置

```typescript
import { generalApi } from '@/features/settings/api/general.api'

function ImportButton() {
  const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const result = await generalApi.importConfig(file, true)
      alert(`${result.message}\n成功: ${result.imported_count}, 跳过: ${result.skipped_count}`)
    } catch (error) {
      alert('导入失败')
    }
  }

  return <input type="file" accept=".json" onChange={handleImport} />
}
```

### 测试邮件配置

```typescript
import { notificationApi } from '@/features/settings/api/notification.api'

async function testEmail() {
  try {
    const result = await notificationApi.testEmail({
      recipient: 'test@example.com',
      subject: '测试邮件',
      content: '这是测试内容'
    })

    if (result.success) {
      alert('邮件发送成功')
    } else {
      alert(`发送失败: ${result.message}`)
    }
  } catch (error) {
    alert('测试失败')
  }
}
```

### 获取系统监控

```typescript
import { monitoringApi } from '@/features/settings/api/monitoring.api'

async function loadMonitoring() {
  const data = await monitoringApi.getCurrentMetrics()

  return {
    cpu: `${data.metrics.cpu.usage.toFixed(1)}%`,
    memory: `${data.metrics.memory.usage.toFixed(1)}%`,
    disk: `${data.metrics.disk.usage.toFixed(1)}%`,
    services: data.services.map(s => ({
      name: s.name,
      healthy: s.status === 'healthy'
    }))
  }
}
```

### 批量用户操作

```typescript
import { usersApi } from '@/features/settings/api/users.api'

async function activateUsers(userIds: number[]) {
  const result = await usersApi.batchOperation({
    operation: 'activate',
    user_ids: userIds
  })

  console.log(`成功: ${result.success_count}`)

  if (result.failed_count > 0) {
    console.error('失败的用户:', result.failed_users)
  }
}
```

---

## ⚠️ 注意事项

### 1. 认证 Token

所有请求都需要 Token:
```typescript
import { TokenManager } from '@/lib/api-client'

// 登录后保存 Token
TokenManager.setTokens(accessToken, refreshToken)

// httpClient 会自动添加到请求头
```

### 2. 错误处理

必须捕获错误:
```typescript
try {
  await api.method()
} catch (error) {
  // 处理错误
}
```

### 3. 请求体格式

**PUT 请求** - 只发送 `{ value }`:
```typescript
// ✅ 正确
httpClient.put('/settings/system/settings/key', { value: 'newValue' })

// ❌ 错误
httpClient.put('/settings/system/settings/key', { key: 'key', value: 'newValue' })
```

**POST 批量更新** - 发送 `{ settings: {...} }`:
```typescript
// ✅ 正确
httpClient.post('/settings/system/settings/bulk', {
  settings: { 'key1': 'value1', 'key2': 'value2' }
})
```

**POST 导入** - 发送 `{ config_data, overwrite }`:
```typescript
// ✅ 正确
httpClient.post('/settings/system/import', {
  config_data: { ... },
  overwrite: true
})

// ❌ 错误 (不要用 FormData)
const formData = new FormData()
formData.append('file', file)
```

### 4. 响应格式

不同端点返回格式不同:
```typescript
// General Settings
{ key: string, value: any, category: string }

// Monitoring
{ metrics: {...}, services: [...], system: {...} }

// Notifications
{ success: boolean, message: string, ... }
```

---

## 🔧 调试技巧

### 1. 查看网络请求

**浏览器开发者工具**:
- F12 → Network
- 查看 Request/Response

### 2. 添加日志

```typescript
console.log('Request:', endpoint, data)
console.log('Response:', response)
```

### 3. 使用 API 文档

访问 http://localhost:8000/docs 测试后端接口

### 4. 检查 Token

```typescript
const token = TokenManager.getAccessToken()
console.log('Current token:', token)
```

### 5. CORS 问题

如果出现 CORS 错误，检查:
- 后端 `CORS_ORIGINS` 配置
- 前端请求的 Origin

---

## 📖 完整文档

- **API 使用指南**: `backend/docs/api/settings-api-guide.md`
- **集成指南**: `backend/docs/integration/frontend-backend-integration.md`
- **测试指南**: `backend/docs/testing/test-execution-guide.md`

---

**最后更新**: 2025-01-XX
**维护团队**: Full-Stack Team
