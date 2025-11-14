# Frontend API 修复文件
**修复后的 general.api.ts - 即用版本**

将此文件替换 `frontend/src/features/settings/api/general.api.ts`

```typescript
import { httpClient } from '@/lib/api-client'
import type {
  BasicInfoConfig,
  InspectionConfig,
  ReportConfig,
  UserPreferenceConfig,
  GeneralSettingsResponse,
} from '../types/general.types'

// ==================== 类型定义 ====================

/**
 * 后端配置项类型
 */
interface BackendSetting {
  key: string
  value: any
  category: string
  description?: string
}

/**
 * 导出配置响应类型
 */
export interface ExportConfigResponse {
  config_data: Record<string, {
    value: any
    category?: string
    description?: string
  }>
  export_time: string  // ISO datetime
  total_count: number
}

/**
 * 导入配置响应类型
 */
export interface ImportConfigResponse {
  imported_count: number
  skipped_count: number
  failed_keys: string[]
  message: string
}

// ==================== API 实现 ====================

export const generalApi = {
  /**
   * 获取所有通用配置
   * GET /api/v1/settings/system/settings
   */
  getGeneralSettings: async (): Promise<GeneralSettingsResponse> => {
    const allSettings = await httpClient.get<BackendSetting[]>('/settings/system/settings')

    // 创建 key-value 映射
    const settingsMap = new Map<string, any>()
    allSettings.forEach((setting) => {
      settingsMap.set(setting.key, setting.value)
    })

    // 转换为结构化数据
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
   * PUT /api/v1/settings/system/settings/{key}
   * ✅ 修复: 只发送 { value } 而不是 { key, value }
   */
  updateBasicInfo: async (data: Partial<BasicInfoConfig>): Promise<void> => {
    const updates: Array<Promise<any>> = []

    if (data.applicationName !== undefined) {
      updates.push(
        httpClient.put('/settings/system/settings/system.application_name', {
          value: data.applicationName  // ✅ 只发送 value
        })
      )
    }

    if (data.timezone !== undefined) {
      updates.push(
        httpClient.put('/settings/system/settings/system.timezone', {
          value: data.timezone  // ✅ 只发送 value
        })
      )
    }

    await Promise.all(updates)
  },

  /**
   * 更新巡检配置
   * PUT /api/v1/settings/system/settings/{key}
   * ✅ 修复: 只发送 { value }
   */
  updateInspectionConfig: async (data: Partial<InspectionConfig>): Promise<void> => {
    const updates: Array<Promise<any>> = []

    if (data.maxConcurrentTasks !== undefined) {
      updates.push(
        httpClient.put('/settings/system/settings/inspection.max_concurrent_tasks', {
          value: data.maxConcurrentTasks  // ✅ 只发送 value
        })
      )
    }

    if (data.defaultTimeout !== undefined) {
      updates.push(
        httpClient.put('/settings/system/settings/inspection.default_timeout', {
          value: data.defaultTimeout  // ✅ 只发送 value
        })
      )
    }

    if (data.retryAttempts !== undefined) {
      updates.push(
        httpClient.put('/settings/system/settings/inspection.retry_attempts', {
          value: data.retryAttempts  // ✅ 只发送 value
        })
      )
    }

    await Promise.all(updates)
  },

  /**
   * 更新报表配置
   * PUT /api/v1/settings/system/settings/{key}
   * ✅ 修复: 只发送 { value }
   */
  updateReportConfig: async (data: Partial<ReportConfig>): Promise<void> => {
    const updates: Array<Promise<any>> = []

    if (data.defaultFormat !== undefined) {
      updates.push(
        httpClient.put('/settings/system/settings/report.default_format', {
          value: data.defaultFormat  // ✅ 只发送 value
        })
      )
    }

    if (data.maxExportRecords !== undefined) {
      updates.push(
        httpClient.put('/settings/system/settings/report.max_export_records', {
          value: data.maxExportRecords  // ✅ 只发送 value
        })
      )
    }

    await Promise.all(updates)
  },

  /**
   * 更新用户偏好
   * PUT /api/v1/settings/system/settings/{key}
   * ✅ 修复: 只发送 { value }
   */
  updateUserPreference: async (data: Partial<UserPreferenceConfig>): Promise<void> => {
    const updates: Array<Promise<any>> = []

    if (data.theme !== undefined) {
      updates.push(
        httpClient.put('/settings/system/settings/user_preference.theme', {
          value: data.theme  // ✅ 只发送 value
        })
      )
    }

    if (data.language !== undefined) {
      updates.push(
        httpClient.put('/settings/system/settings/user_preference.language', {
          value: data.language  // ✅ 只发送 value
        })
      )
    }

    if (data.dateFormat !== undefined) {
      updates.push(
        httpClient.put('/settings/system/settings/user_preference.date_format', {
          value: data.dateFormat  // ✅ 只发送 value
        })
      )
    }

    if (data.timeFormat !== undefined) {
      updates.push(
        httpClient.put('/settings/system/settings/user_preference.time_format', {
          value: data.timeFormat  // ✅ 只发送 value
        })
      )
    }

    await Promise.all(updates)
  },

  /**
   * 批量保存所有配置
   * POST /api/v1/settings/system/settings/bulk
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
   * GET /api/v1/settings/system/export
   * ✅ 修复: 返回 JSON 格式而不是 Blob
   */
  exportConfig: async (): Promise<ExportConfigResponse> => {
    return httpClient.get<ExportConfigResponse>('/settings/system/export')
  },

  /**
   * 导出配置为文件下载
   * GET /api/v1/settings/system/export → 下载为 JSON 文件
   */
  exportConfigAsFile: async (): Promise<void> => {
    const data = await httpClient.get<ExportConfigResponse>('/settings/system/export')

    // 创建 Blob 并下载
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `settings-export-${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  },

  /**
   * 导入通用配置
   * POST /api/v1/settings/system/import
   * ✅ 修复: 发送 JSON 格式而不是 FormData
   */
  importConfig: async (file: File, overwrite: boolean = true): Promise<ImportConfigResponse> => {
    // 1. 读取文件内容
    const text = await file.text()

    // 2. 解析 JSON
    const exportData: ExportConfigResponse = JSON.parse(text)

    // 3. 发送 JSON 请求
    return httpClient.post<ImportConfigResponse>('/settings/system/import', {
      config_data: exportData.config_data,
      overwrite: overwrite
    })
  },

  /**
   * 获取单个配置（额外方法）
   * GET /api/v1/settings/system/settings/{key}
   */
  getSetting: async (key: string): Promise<BackendSetting> => {
    return httpClient.get<BackendSetting>(`/settings/system/settings/${key}`)
  },

  /**
   * 更新单个配置（通用方法）
   * PUT /api/v1/settings/system/settings/{key}
   */
  updateSetting: async (key: string, value: any): Promise<BackendSetting> => {
    return httpClient.put<BackendSetting>(`/settings/system/settings/${key}`, { value })
  },
}

// ==================== 导出 ====================

export default generalApi
```

---

## 变更说明

### 修复 1: PUT 请求体格式
**修改前**:
```typescript
httpClient.put('/settings/system/settings/system.application_name', {
  key: 'system.application_name',  // ❌ 多余
  value: data.applicationName,
})
```

**修改后**:
```typescript
httpClient.put('/settings/system/settings/system.application_name', {
  value: data.applicationName,  // ✅ 只发送 value
})
```

### 修复 2: 导出接口返回类型
**修改前**:
```typescript
exportConfig: async (): Promise<Blob> => {
  const response = await fetch(url)
  return response.blob()  // ❌ 后端返回 JSON 不是 Blob
}
```

**修改后**:
```typescript
exportConfig: async (): Promise<ExportConfigResponse> => {
  return httpClient.get<ExportConfigResponse>('/settings/system/export')
}
```

### 修复 3: 导入接口请求格式
**修改前**:
```typescript
importConfig: async (file: File): Promise<...> => {
  const formData = new FormData()
  formData.append('file', file)  // ❌ 后端期望 JSON
  const response = await fetch(url, {
    method: 'POST',
    body: formData
  })
}
```

**修改后**:
```typescript
importConfig: async (file: File, overwrite: boolean = true): Promise<ImportConfigResponse> => {
  const text = await file.text()
  const exportData = JSON.parse(text)

  return httpClient.post<ImportConfigResponse>('/settings/system/import', {
    config_data: exportData.config_data,
    overwrite: overwrite
  })
}
```

---

## 新增功能

1. **exportConfigAsFile()**: 导出并自动下载为文件
2. **getSetting()**: 获取单个配置
3. **updateSetting()**: 更新单个配置（通用方法）

---

## 使用示例

```typescript
import { generalApi } from '@/features/settings/api/general.api'

// 获取配置
const settings = await generalApi.getGeneralSettings()

// 更新配置
await generalApi.updateBasicInfo({
  applicationName: '新系统名称'
})

// 导出为文件
await generalApi.exportConfigAsFile()

// 导入配置
const file = /* 用户选择的文件 */
const result = await generalApi.importConfig(file, true)
console.log(result.message)
```

---

**文件路径**: `frontend/src/features/settings/api/general.api.ts`
**最后更新**: 2025-01-XX
