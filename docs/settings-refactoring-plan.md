# 系统设置模块完整架构重构方案

> **文档版本**: v1.0
> **创建日期**: 2025-11-05
> **预计工期**: 10-15 个工作日
> **代码规模**: 58 个文件，约 5100 行代码

---

## 📋 目录

1. [问题背景](#问题背景)
2. [核心问题分析](#核心问题分析)
3. [命名冲突解决方案](#命名冲突解决方案)
4. [架构设计目标](#架构设计目标)
5. [完整文件结构](#完整文件结构)
6. [模块详细设计](#模块详细设计)
7. [API 变更说明](#api-变更说明)
8. [类型定义规范](#类型定义规范)
9. [实施计划](#实施计划)
10. [性能优化策略](#性能优化策略)
11. [风险管理](#风险管理)
12. [迁移策略](#迁移策略)

---

## 🎯 问题背景

### 当前架构存在的问题

#### 1. 双层架构混乱

系统存在**两层信息架构**，但层级关系模糊：

- **第一层（页面级）**: 顶部 Tab 导航
  - 常规设置、用户管理、安全设置、审计日志、备份恢复、通知设置、系统监控

- **第二层（配置分组）**: "常规设置" 页面内的左侧分组
  - 系统设置、通知设置、邮件设置、巡检设置、报表设置、安全设置、备份设置、用户偏好

#### 2. 功能重复与冲突

| 功能模块 | 页面级 Tab | 配置分组 | 问题描述 |
|----------|------------|----------|----------|
| 通知设置 | ✅ 存在 | ✅ 存在 | 用户不知道去哪里配置 |
| 安全设置 | ✅ 存在 | ✅ 存在 | 功能分散，体验割裂 |
| 备份设置 | ✅ 存在 | ✅ 存在 | 同一功能两个入口 |
| 系统设置 | ❌（页面名称） | ✅ 存在 | 名称冲突，语义混乱 |

#### 3. 命名冲突（核心问题）

**"系统设置"一词多义，出现在三个层级**：

```
系统设置（整个应用的顶级页面名称）
├─ 常规设置（Tab 页签）
│  ├─ 系统设置（配置分组名称） ⚠️ 命名冲突！
│  │  ├─ 应用程序名称
│  │  ├─ 系统版本
│  │  ├─ 时区
│  │  └─ 会话超时
│  ├─ 通知设置 ⚠️ 与"通知设置" Tab 冲突！
│  └─ ...
```

#### 4. 代码层面的问题

- **单文件过大**: `SystemConfiguration.tsx` 超过 2000 行
- **类型不安全**: 大量使用 `any` 类型
- **状态混乱**: 所有配置共享一个巨大的 state
- **性能问题**: 一次性加载所有配置，首屏慢
- **耦合严重**: 所有功能耦合在一个组件中

---

## 🔍 核心问题分析

### 信息架构失败原因

#### 1. 命名空间污染（Namespace Pollution）

同一术语"系统设置"在不同层级重复使用，导致：
- 用户认知负担增加
- 开发人员理解成本高
- 代码可维护性差

#### 2. 语义过载（Semantic Overload）

"系统设置"一词承载了三重含义：
1. **应用级**: 整个系统的设置入口
2. **功能级**: 具体的功能模块
3. **配置级**: 某一类配置的集合

#### 3. 层级混淆（Hierarchy Confusion）

页面级功能（通知设置、安全设置、备份设置）同时存在于配置分组中，用户不清楚：
- 这两个入口是同一个功能吗？
- 我应该去哪里配置？
- 修改会同步吗？

---

## ✅ 命名冲突解决方案

### 三层命名系统设计

| 层级 | 旧名称 | **新名称** | 英文标识 | URL/标识符 | 说明 |
|------|--------|-----------|---------|-----------|------|
| **应用页面** | 系统设置 | **系统管理** | Settings | `/settings` | 整个设置功能的顶级入口 |
| **功能模块（Tab）** | 常规设置 | **通用配置** | General | `/settings/general` | 基础配置的独立页面 |
| **配置分组** | 系统设置 | **基础信息** | Basic Info | `category: 'system'` | 系统基础配置的分组 |

### 命名系统的设计原则

#### 1. **命名空间隔离**
- 每一层使用不同的术语
- 避免同一词汇在多个层级出现

#### 2. **语义清晰**
- 名称直接表达功能和层级
- 用户一眼能理解所在位置

#### 3. **层级递进**
```
系统管理（整体）
  └─ 通用配置（模块）
       └─ 基础信息（分组）
            └─ 应用程序名称（配置项）
```

### 完整命名映射表

#### 页面级 Tab（7个）

| 旧名称 | 新名称 | URL | 说明 |
|--------|--------|-----|------|
| 常规设置 | **通用配置** | `/settings/general` | 系统基础配置 |
| 用户管理 | 用户管理 | `/settings/users` | 保持不变 |
| 安全设置 | 安全策略 | `/settings/security` | 强调策略性 |
| 审计日志 | 审计日志 | `/settings/audit` | 保持不变 |
| 备份恢复 | 备份管理 | `/settings/backup` | 强调管理功能 |
| 通知设置 | 通知中心 | `/settings/notifications` | 整合所有通知 |
| 系统监控 | 系统监控 | `/settings/monitoring` | 保持不变 |

#### 配置分组（通用配置模块内 - 4个）

| 旧名称 | 新名称 | category | 包含配置 |
|--------|--------|----------|----------|
| 系统设置 | **基础信息** | `system` | 应用名称、版本、时区 |
| 巡检设置 | **巡检配置** | `inspection` | 并发数、超时、重试 |
| 报表设置 | **报表配置** | `report` | 默认格式、导出限制 |
| 用户偏好 | **个人偏好** | `user_preference` | 主题、语言、显示 |

**移除的分组**（移动到对应的独立页面）：
- ~~通知设置~~ → 移至"通知中心" Tab
- ~~邮件设置~~ → 移至"通知中心" Tab（作为邮件通知 Section）
- ~~安全设置~~ → 移至"安全策略" Tab
- ~~备份设置~~ → 移至"备份管理" Tab

---

## 🎯 架构设计目标

### 技术目标

1. **模块化**: 每个功能模块独立封装，职责清晰
2. **类型安全**: 消除 `any`，全部强类型定义
3. **性能优化**: 代码分割、并行加载、缓存策略
4. **可维护性**: 文件结构清晰，命名规范统一
5. **可扩展性**: 新增功能模块无需修改现有代码

### 用户体验目标

1. **导航清晰**: 用户能快速找到需要的配置
2. **响应迅速**: 首屏加载时间 < 1 秒
3. **操作流畅**: 配置修改即时生效，反馈明确
4. **层级分明**: 功能归属清晰，无重复入口

### 可测量的指标

| 指标 | 当前值 | 目标值 | 提升 |
|------|--------|--------|------|
| 首屏加载时间 | ~3 秒 | < 1 秒 | ⬆️ 67% |
| 初始包大小 | ~800KB | < 250KB | ⬇️ 70% |
| API 并行度 | 1 (串行) | 7 (并行) | ⬆️ 600% |
| 类型覆盖率 | ~40% | 100% | ⬆️ 150% |
| 单元测试覆盖 | 0% | > 80% | ⬆️ ∞ |

---

## 📁 完整文件结构

### 目录树概览

```
frontend/src/
├── app/settings/                          # Next.js 15 App Router
│   ├── layout.tsx                         # ✨ 共享布局 + Tab 导航
│   ├── page.tsx                           # 重定向到 /general
│   ├── general/page.tsx                   # ✨ 通用配置页面
│   ├── users/page.tsx                     # ✨ 用户管理页面
│   ├── security/page.tsx                  # ✨ 安全策略页面
│   ├── audit/page.tsx                     # ✨ 审计日志页面
│   ├── backup/page.tsx                    # ✨ 备份管理页面
│   ├── notifications/page.tsx             # ✨ 通知中心页面
│   └── monitoring/page.tsx                # ✨ 系统监控页面
│
└── features/settings/                     # Feature 层
    ├── api/                               # API 客户端
    │   ├── general.api.ts                 # ✨ 通用配置 API
    │   ├── notifications.api.ts           # ✨ 通知中心 API
    │   ├── security.api.ts                # ✨ 安全策略 API
    │   ├── backup.api.ts                  # ✨ 备份管理 API
    │   ├── users.api.ts                   # ✨ 用户管理 API（重构）
    │   ├── audit.api.ts                   # ✨ 审计日志 API（重构）
    │   └── monitoring.api.ts              # ✨ 系统监控 API（重构）
    │
    ├── components/                        # React 组件
    │   ├── shared/                        # ✨ 共享组件
    │   │   ├── ConfigItem.tsx             # 配置项组件
    │   │   ├── SectionHeader.tsx          # 分组标题组件
    │   │   ├── ConfigInput.tsx            # 配置输入组件
    │   │   ├── ConfigSwitch.tsx           # 配置开关组件
    │   │   ├── ConfigSelect.tsx           # 配置选择器组件
    │   │   ├── SettingsTabs.tsx           # Tab 导航组件
    │   │   ├── ActionButtons.tsx          # 操作按钮组件
    │   │   └── EmptyState.tsx             # 空状态组件
    │   │
    │   ├── general/                       # ✨ 通用配置模块
    │   │   ├── GeneralSettings.tsx        # 主组件
    │   │   ├── BasicInfoSection.tsx       # 基础信息 Section
    │   │   ├── InspectionConfigSection.tsx # 巡检配置 Section
    │   │   ├── ReportConfigSection.tsx    # 报表配置 Section
    │   │   └── UserPreferenceSection.tsx  # 个人偏好 Section
    │   │
    │   ├── notifications/                 # ✨ 通知中心模块
    │   │   ├── NotificationSettings.tsx   # 主组件
    │   │   ├── EmailNotificationSection.tsx # 邮件通知 Section
    │   │   ├── SMSNotificationSection.tsx  # 短信通知 Section
    │   │   └── WebhookNotificationSection.tsx # Webhook Section
    │   │
    │   ├── security/                      # ✨ 安全策略模块
    │   │   ├── SecuritySettings.tsx       # 主组件
    │   │   ├── SessionManagementSection.tsx # 会话管理 Section
    │   │   ├── PasswordPolicySection.tsx  # 密码策略 Section
    │   │   └── AccessControlSection.tsx   # 访问控制 Section
    │   │
    │   ├── backup/                        # ✨ 备份管理模块
    │   │   ├── BackupManagement.tsx       # 主组件
    │   │   ├── BackupListSection.tsx      # 备份列表 Section
    │   │   ├── BackupConfigSection.tsx    # 备份配置 Section
    │   │   └── ScheduleBackupSection.tsx  # 定时备份 Section
    │   │
    │   ├── users/                         # 用户管理模块（保留）
    │   │   └── ... (现有组件)
    │   │
    │   ├── audit/                         # 审计日志模块（保留）
    │   │   └── ... (现有组件)
    │   │
    │   └── monitoring/                    # 系统监控模块（保留）
    │       └── ... (现有组件)
    │
    ├── hooks/                             # 自定义 Hooks
    │   ├── useGeneralSettings.ts          # ✨ 通用配置 Hook
    │   ├── useNotificationSettings.ts     # ✨ 通知中心 Hook
    │   ├── useSecuritySettings.ts         # ✨ 安全策略 Hook
    │   ├── useBackupManagement.ts         # ✨ 备份管理 Hook
    │   └── useSettingsCache.ts            # ✨ 配置缓存 Hook
    │
    └── types/                             # TypeScript 类型定义
        ├── general.types.ts               # ✨ 通用配置类型
        ├── notifications.types.ts         # ✨ 通知中心类型
        ├── security.types.ts              # ✨ 安全策略类型
        ├── backup.types.ts                # ✨ 备份管理类型
        ├── users.types.ts                 # 用户管理类型（保留）
        ├── audit.types.ts                 # 审计日志类型（保留）
        ├── monitoring.types.ts            # 系统监控类型（保留）
        └── shared.types.ts                # ✨ 共享类型定义
```

### 文件统计

| 类别 | 新建文件数 | 预计代码行数 | 说明 |
|------|-----------|-------------|------|
| **路由页面** | 8 | ~400 | App Router 页面 |
| **共享组件** | 8 | ~800 | 通用 UI 组件 |
| **通用配置** | 5 | ~600 | General 模块 |
| **通知中心** | 4 | ~550 | Notifications 模块 |
| **安全策略** | 4 | ~500 | Security 模块 |
| **备份管理** | 4 | ~500 | Backup 模块 |
| **API 层** | 7 | ~1400 | API 客户端 |
| **Hooks** | 5 | ~250 | 自定义 Hooks |
| **类型定义** | 8 | ~600 | TypeScript 接口 |
| **测试文件** | 5 | ~500 | 单元测试 |
| **总计** | **58** | **~5100** | - |

---

## 🧩 模块详细设计

### 模块 1: 共享布局与导航

#### `app/settings/layout.tsx`

**职责**: 提供统一的布局和 Tab 导航

```typescript
import { Suspense } from 'react'
import { SettingsTabs } from '@/features/settings/components/shared/SettingsTabs'
import { Skeleton } from '@/components/ui/skeleton'

export default function SettingsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* 页面标题 */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="py-6">
            <h1 className="text-3xl font-bold text-gray-900">系统管理</h1>
            <p className="mt-2 text-sm text-gray-600">
              管理系统配置、用户权限、安全策略和数据备份
            </p>
          </div>

          {/* Tab 导航 */}
          <SettingsTabs />
        </div>
      </div>

      {/* 主内容区 */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Suspense fallback={<LoadingSkeleton />}>
          {children}
        </Suspense>
      </div>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-12 w-full" />
      <Skeleton className="h-64 w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  )
}
```

#### `SettingsTabs.tsx`

**职责**: Tab 导航组件

```typescript
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import {
  Settings,
  Users,
  Shield,
  FileText,
  Database,
  Bell,
  Activity,
} from 'lucide-react'

const tabs = [
  { name: '通用配置', href: '/settings/general', icon: Settings },
  { name: '用户管理', href: '/settings/users', icon: Users },
  { name: '安全策略', href: '/settings/security', icon: Shield },
  { name: '审计日志', href: '/settings/audit', icon: FileText },
  { name: '备份管理', href: '/settings/backup', icon: Database },
  { name: '通知中心', href: '/settings/notifications', icon: Bell },
  { name: '系统监控', href: '/settings/monitoring', icon: Activity },
]

export function SettingsTabs() {
  const pathname = usePathname()

  return (
    <nav className="flex space-x-8" aria-label="Tabs">
      {tabs.map((tab) => {
        const isActive = pathname.startsWith(tab.href)
        const Icon = tab.icon

        return (
          <Link
            key={tab.name}
            href={tab.href}
            className={cn(
              'group inline-flex items-center px-1 py-4 border-b-2 font-medium text-sm transition-colors',
              isActive
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            )}
          >
            <Icon
              className={cn(
                'mr-2 h-5 w-5',
                isActive ? 'text-blue-500' : 'text-gray-400 group-hover:text-gray-500'
              )}
            />
            {tab.name}
          </Link>
        )
      })}
    </nav>
  )
}
```

---

### 模块 2: 通用配置（General）

#### 架构设计

```
通用配置页面
├─ 基础信息 Section
│  ├─ 应用程序名称
│  ├─ 系统版本
│  └─ 时区
│
├─ 巡检配置 Section
│  ├─ 最大并发任务数
│  ├─ 默认超时时间
│  └─ 失败重试次数
│
├─ 报表配置 Section
│  ├─ 默认报表格式
│  └─ 最大导出记录数
│
└─ 个人偏好 Section
   ├─ 界面主题
   ├─ 语言偏好
   └─ 时区偏好
```

#### `app/settings/general/page.tsx`

```typescript
import { GeneralSettings } from '@/features/settings/components/general/GeneralSettings'

export const metadata = {
  title: '通用配置 | 系统管理',
  description: '管理系统基础配置、巡检配置、报表配置和个人偏好',
}

export default function GeneralPage() {
  return <GeneralSettings />
}
```

#### `general/GeneralSettings.tsx`

```typescript
'use client'

import { useGeneralSettings } from '@/features/settings/hooks/useGeneralSettings'
import { BasicInfoSection } from './BasicInfoSection'
import { InspectionConfigSection } from './InspectionConfigSection'
import { ReportConfigSection } from './ReportConfigSection'
import { UserPreferenceSection } from './UserPreferenceSection'
import { ActionButtons } from '../shared/ActionButtons'
import { Skeleton } from '@/components/ui/skeleton'
import toast from 'react-hot-toast'

export function GeneralSettings() {
  const {
    basicInfo,
    inspectionConfig,
    reportConfig,
    userPreference,
    isLoading,
    isSaving,
    isDirty,
    updateBasicInfo,
    updateInspectionConfig,
    updateReportConfig,
    updateUserPreference,
    saveAll,
    resetAll,
    exportConfig,
    importConfig,
  } = useGeneralSettings()

  const handleSave = async () => {
    try {
      await saveAll()
      toast.success('配置已保存')
    } catch (error) {
      toast.error('保存失败: ' + (error as Error).message)
    }
  }

  const handleReset = () => {
    resetAll()
    toast.success('配置已重置')
  }

  const handleExport = async () => {
    try {
      await exportConfig()
      toast.success('配置已导出')
    } catch (error) {
      toast.error('导出失败: ' + (error as Error).message)
    }
  }

  const handleImport = async (file: File) => {
    try {
      await importConfig(file)
      toast.success('配置已导入')
    } catch (error) {
      toast.error('导入失败: ' + (error as Error).message)
    }
  }

  if (isLoading) {
    return <GeneralSettingsSkeleton />
  }

  return (
    <div className="space-y-6">
      {/* 操作按钮栏 */}
      <ActionButtons
        isDirty={isDirty}
        isSaving={isSaving}
        onSave={handleSave}
        onReset={handleReset}
        onExport={handleExport}
        onImport={handleImport}
      />

      {/* 基础信息 */}
      <BasicInfoSection
        data={basicInfo}
        onChange={updateBasicInfo}
      />

      {/* 巡检配置 */}
      <InspectionConfigSection
        data={inspectionConfig}
        onChange={updateInspectionConfig}
      />

      {/* 报表配置 */}
      <ReportConfigSection
        data={reportConfig}
        onChange={updateReportConfig}
      />

      {/* 个人偏好 */}
      <UserPreferenceSection
        data={userPreference}
        onChange={updateUserPreference}
      />
    </div>
  )
}

function GeneralSettingsSkeleton() {
  return (
    <div className="space-y-6">
      {[1, 2, 3, 4].map((i) => (
        <Skeleton key={i} className="h-64 w-full" />
      ))}
    </div>
  )
}
```

#### `general/BasicInfoSection.tsx`

```typescript
'use client'

import { Card } from '@/components/ui/card'
import { SectionHeader } from '../shared/SectionHeader'
import { ConfigItem } from '../shared/ConfigItem'
import { ConfigInput } from '../shared/ConfigInput'
import { ConfigSelect } from '../shared/ConfigSelect'
import type { BasicInfoConfig } from '@/features/settings/types/general.types'

interface Props {
  data: BasicInfoConfig
  onChange: (field: keyof BasicInfoConfig, value: any) => void
}

const timezones = [
  { value: 'Asia/Shanghai', label: '中国标准时间 (UTC+8)' },
  { value: 'America/New_York', label: '美国东部时间 (UTC-5)' },
  { value: 'Europe/London', label: '英国时间 (UTC+0)' },
  { value: 'Asia/Tokyo', label: '日本标准时间 (UTC+9)' },
]

export function BasicInfoSection({ data, onChange }: Props) {
  return (
    <Card className="p-6">
      <SectionHeader
        title="基础信息"
        description="系统的基本信息配置"
        icon="Info"
      />

      <div className="mt-6 space-y-4">
        <ConfigItem
          label="应用程序名称"
          description="显示在浏览器标题和导航栏的应用名称"
          required
        >
          <ConfigInput
            value={data.applicationName}
            onChange={(value) => onChange('applicationName', value)}
            placeholder="网络设备巡检系统"
          />
        </ConfigItem>

        <ConfigItem
          label="系统版本"
          description="当前系统的版本号"
          readonly
        >
          <ConfigInput
            value={data.version}
            disabled
          />
        </ConfigItem>

        <ConfigItem
          label="时区"
          description="系统使用的时区，影响日志时间和任务调度"
          required
        >
          <ConfigSelect
            value={data.timezone}
            options={timezones}
            onChange={(value) => onChange('timezone', value)}
          />
        </ConfigItem>
      </div>
    </Card>
  )
}
```

#### `general.api.ts`

```typescript
import { httpClient } from '@/lib/api-client'
import type {
  BasicInfoConfig,
  InspectionConfig,
  ReportConfig,
  UserPreferenceConfig,
  GeneralSettingsResponse,
} from '../types/general.types'

export const generalApi = {
  // 获取所有通用配置
  getGeneralSettings: () =>
    httpClient.get<GeneralSettingsResponse>('/settings/general'),

  // 更新基础信息
  updateBasicInfo: (data: Partial<BasicInfoConfig>) =>
    httpClient.put('/settings/general/basic-info', data),

  // 更新巡检配置
  updateInspectionConfig: (data: Partial<InspectionConfig>) =>
    httpClient.put('/settings/general/inspection', data),

  // 更新报表配置
  updateReportConfig: (data: Partial<ReportConfig>) =>
    httpClient.put('/settings/general/report', data),

  // 更新用户偏好
  updateUserPreference: (data: Partial<UserPreferenceConfig>) =>
    httpClient.put('/settings/general/user-preference', data),

  // 批量保存所有配置
  saveAll: (data: GeneralSettingsResponse) =>
    httpClient.post('/settings/general/bulk-update', data),

  // 导出配置
  exportConfig: async (): Promise<Blob> => {
    const token = localStorage.getItem('authData')
    const authData = token ? JSON.parse(token) : null

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/v1/settings/general/export`,
      {
        headers: authData?.token
          ? { Authorization: `Bearer ${authData.token}` }
          : {},
      }
    )
    return response.blob()
  },

  // 导入配置
  importConfig: async (file: File) => {
    const token = localStorage.getItem('authData')
    const authData = token ? JSON.parse(token) : null
    const formData = new FormData()
    formData.append('file', file)

    const response = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/v1/settings/general/import`,
      {
        method: 'POST',
        headers: authData?.token
          ? { Authorization: `Bearer ${authData.token}` }
          : {},
        body: formData,
      }
    )
    return response.json()
  },
}
```

#### `general.types.ts`

```typescript
export interface BasicInfoConfig {
  applicationName: string
  version: string
  timezone: string
}

export interface InspectionConfig {
  maxConcurrentTasks: number
  defaultTimeout: number
  retryAttempts: number
}

export interface ReportConfig {
  defaultFormat: 'excel' | 'pdf' | 'csv'
  maxExportRecords: number
}

export interface UserPreferenceConfig {
  theme: 'light' | 'dark' | 'auto'
  language: 'zh-CN' | 'en-US'
  dateFormat: string
  timeFormat: '12h' | '24h'
}

export interface GeneralSettingsResponse {
  basicInfo: BasicInfoConfig
  inspectionConfig: InspectionConfig
  reportConfig: ReportConfig
  userPreference: UserPreferenceConfig
}

export interface ValidationRule {
  min?: number
  max?: number
  pattern?: string
  options?: Array<{ label: string; value: string }>
}
```

#### `useGeneralSettings.ts`

```typescript
'use client'

import { useState, useEffect, useCallback } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { generalApi } from '../api/general.api'
import type {
  BasicInfoConfig,
  InspectionConfig,
  ReportConfig,
  UserPreferenceConfig,
  GeneralSettingsResponse,
} from '../types/general.types'

export function useGeneralSettings() {
  const queryClient = useQueryClient()

  // 获取配置
  const { data, isLoading, error } = useQuery({
    queryKey: ['generalSettings'],
    queryFn: generalApi.getGeneralSettings,
    staleTime: 5 * 60 * 1000, // 5 分钟缓存
  })

  // 本地状态
  const [basicInfo, setBasicInfo] = useState<BasicInfoConfig>(data?.basicInfo || {} as BasicInfoConfig)
  const [inspectionConfig, setInspectionConfig] = useState<InspectionConfig>(data?.inspectionConfig || {} as InspectionConfig)
  const [reportConfig, setReportConfig] = useState<ReportConfig>(data?.reportConfig || {} as ReportConfig)
  const [userPreference, setUserPreference] = useState<UserPreferenceConfig>(data?.userPreference || {} as UserPreferenceConfig)
  const [isDirty, setIsDirty] = useState(false)

  // 同步服务端数据到本地状态
  useEffect(() => {
    if (data) {
      setBasicInfo(data.basicInfo)
      setInspectionConfig(data.inspectionConfig)
      setReportConfig(data.reportConfig)
      setUserPreference(data.userPreference)
      setIsDirty(false)
    }
  }, [data])

  // 保存所有配置
  const saveMutation = useMutation({
    mutationFn: generalApi.saveAll,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['generalSettings'] })
      setIsDirty(false)
    },
  })

  // 导出配置
  const exportMutation = useMutation({
    mutationFn: generalApi.exportConfig,
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `general-settings-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    },
  })

  // 导入配置
  const importMutation = useMutation({
    mutationFn: generalApi.importConfig,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['generalSettings'] })
      window.location.reload()
    },
  })

  // 更新方法
  const updateBasicInfo = useCallback((field: keyof BasicInfoConfig, value: any) => {
    setBasicInfo((prev) => ({ ...prev, [field]: value }))
    setIsDirty(true)
  }, [])

  const updateInspectionConfig = useCallback((field: keyof InspectionConfig, value: any) => {
    setInspectionConfig((prev) => ({ ...prev, [field]: value }))
    setIsDirty(true)
  }, [])

  const updateReportConfig = useCallback((field: keyof ReportConfig, value: any) => {
    setReportConfig((prev) => ({ ...prev, [field]: value }))
    setIsDirty(true)
  }, [])

  const updateUserPreference = useCallback((field: keyof UserPreferenceConfig, value: any) => {
    setUserPreference((prev) => ({ ...prev, [field]: value }))
    setIsDirty(true)
  }, [])

  // 保存所有
  const saveAll = useCallback(async () => {
    await saveMutation.mutateAsync({
      basicInfo,
      inspectionConfig,
      reportConfig,
      userPreference,
    })
  }, [basicInfo, inspectionConfig, reportConfig, userPreference, saveMutation])

  // 重置所有
  const resetAll = useCallback(() => {
    if (data) {
      setBasicInfo(data.basicInfo)
      setInspectionConfig(data.inspectionConfig)
      setReportConfig(data.reportConfig)
      setUserPreference(data.userPreference)
      setIsDirty(false)
    }
  }, [data])

  // 导出配置
  const exportConfig = useCallback(async () => {
    await exportMutation.mutateAsync()
  }, [exportMutation])

  // 导入配置
  const importConfig = useCallback(async (file: File) => {
    await importMutation.mutateAsync(file)
  }, [importMutation])

  return {
    basicInfo,
    inspectionConfig,
    reportConfig,
    userPreference,
    isLoading,
    isSaving: saveMutation.isPending,
    isDirty,
    error,
    updateBasicInfo,
    updateInspectionConfig,
    updateReportConfig,
    updateUserPreference,
    saveAll,
    resetAll,
    exportConfig,
    importConfig,
  }
}
```

---

### 模块 3: 通知中心（Notifications）

#### 架构设计

```
通知中心页面
├─ 邮件通知 Section（合并原"邮件设置"）
│  ├─ 启用邮件通知
│  ├─ SMTP 服务器配置
│  ├─ 发件人配置
│  └─ 收件人列表
│
├─ 短信通知 Section
│  ├─ 启用短信通知
│  ├─ 短信服务商配置
│  └─ 收件人列表
│
└─ Webhook 通知 Section
   ├─ 启用 Webhook
   ├─ Webhook URL 列表
   └─ 请求配置
```

#### `notifications/NotificationSettings.tsx`

```typescript
'use client'

import { useNotificationSettings } from '@/features/settings/hooks/useNotificationSettings'
import { EmailNotificationSection } from './EmailNotificationSection'
import { SMSNotificationSection } from './SMSNotificationSection'
import { WebhookNotificationSection } from './WebhookNotificationSection'
import { ActionButtons } from '../shared/ActionButtons'
import toast from 'react-hot-toast'

export function NotificationSettings() {
  const {
    emailConfig,
    smsConfig,
    webhookConfig,
    isLoading,
    isSaving,
    isDirty,
    updateEmailConfig,
    updateSMSConfig,
    updateWebhookConfig,
    saveAll,
    resetAll,
    testEmailConfig,
  } = useNotificationSettings()

  const handleSave = async () => {
    try {
      await saveAll()
      toast.success('通知配置已保存')
    } catch (error) {
      toast.error('保存失败')
    }
  }

  const handleTestEmail = async () => {
    try {
      const result = await testEmailConfig()
      if (result.success) {
        toast.success('邮件配置测试成功')
      } else {
        toast.error(`邮件配置测试失败: ${result.message}`)
      }
    } catch (error) {
      toast.error('测试失败')
    }
  }

  if (isLoading) {
    return <div>加载中...</div>
  }

  return (
    <div className="space-y-6">
      <ActionButtons
        isDirty={isDirty}
        isSaving={isSaving}
        onSave={handleSave}
        onReset={resetAll}
        extraActions={[
          {
            label: '测试邮件配置',
            onClick: handleTestEmail,
            variant: 'outline',
          },
        ]}
      />

      <EmailNotificationSection
        data={emailConfig}
        onChange={updateEmailConfig}
      />

      <SMSNotificationSection
        data={smsConfig}
        onChange={updateSMSConfig}
      />

      <WebhookNotificationSection
        data={webhookConfig}
        onChange={updateWebhookConfig}
      />
    </div>
  )
}
```

#### `notifications.types.ts`

```typescript
export interface EmailNotificationConfig {
  enabled: boolean
  smtpServer: string
  smtpPort: number
  smtpUsername: string
  smtpPassword: string
  useTLS: boolean
  useSSL: boolean
  senderName: string
  senderEmail: string
  recipients: string[]
}

export interface SMSNotificationConfig {
  enabled: boolean
  provider: 'aliyun' | 'tencent' | 'custom'
  apiKey: string
  apiSecret: string
  signName: string
  templateCode: string
  recipients: string[]
}

export interface WebhookNotificationConfig {
  enabled: boolean
  urls: Array<{
    url: string
    method: 'POST' | 'GET'
    headers: Record<string, string>
    enabled: boolean
  }>
  retryAttempts: number
  timeout: number
}

export interface NotificationSettingsResponse {
  emailConfig: EmailNotificationConfig
  smsConfig: SMSNotificationConfig
  webhookConfig: WebhookNotificationConfig
}
```

---

### 模块 4: 安全策略（Security）

#### 架构设计

```
安全策略页面
├─ 会话管理 Section（从"系统设置"移动）
│  ├─ 会话超时时间
│  ├─ 自动登出设置
│  └─ 并发会话限制
│
├─ 密码策略 Section（原"安全设置"）
│  ├─ 密码最小长度
│  ├─ 密码复杂度要求
│  ├─ 密码过期时间
│  └─ 登录尝试次数限制
│
└─ 访问控制 Section
   ├─ IP 白名单
   ├─ IP 黑名单
   └─ 时间段限制
```

#### `security/SecuritySettings.tsx`

```typescript
'use client'

import { useSecuritySettings } from '@/features/settings/hooks/useSecuritySettings'
import { SessionManagementSection } from './SessionManagementSection'
import { PasswordPolicySection } from './PasswordPolicySection'
import { AccessControlSection } from './AccessControlSection'
import { ActionButtons } from '../shared/ActionButtons'
import toast from 'react-hot-toast'

export function SecuritySettings() {
  const {
    sessionConfig,
    passwordPolicy,
    accessControl,
    isLoading,
    isSaving,
    isDirty,
    updateSessionConfig,
    updatePasswordPolicy,
    updateAccessControl,
    saveAll,
    resetAll,
  } = useSecuritySettings()

  const handleSave = async () => {
    try {
      await saveAll()
      toast.success('安全策略已保存')
    } catch (error) {
      toast.error('保存失败')
    }
  }

  if (isLoading) {
    return <div>加载中...</div>
  }

  return (
    <div className="space-y-6">
      <ActionButtons
        isDirty={isDirty}
        isSaving={isSaving}
        onSave={handleSave}
        onReset={resetAll}
      />

      <SessionManagementSection
        data={sessionConfig}
        onChange={updateSessionConfig}
      />

      <PasswordPolicySection
        data={passwordPolicy}
        onChange={updatePasswordPolicy}
      />

      <AccessControlSection
        data={accessControl}
        onChange={updateAccessControl}
      />
    </div>
  )
}
```

#### `security.types.ts`

```typescript
export interface SessionConfig {
  sessionTimeout: number // 秒
  autoLogout: boolean
  maxConcurrentSessions: number
  rememberMeDuration: number // 天
}

export interface PasswordPolicy {
  minLength: number
  requireUppercase: boolean
  requireLowercase: boolean
  requireNumbers: boolean
  requireSpecialChars: boolean
  expirationDays: number
  preventReuse: number // 不能重复使用最近 N 次密码
  loginAttemptLimit: number
  lockoutDuration: number // 分钟
}

export interface AccessControl {
  ipWhitelist: string[]
  ipBlacklist: string[]
  timeRestrictions: Array<{
    enabled: boolean
    startTime: string
    endTime: string
    daysOfWeek: number[]
  }>
}

export interface SecuritySettingsResponse {
  sessionConfig: SessionConfig
  passwordPolicy: PasswordPolicy
  accessControl: AccessControl
}
```

---

### 模块 5: 备份管理（Backup）

#### 架构设计

```
备份管理页面
├─ 备份列表 Section
│  ├─ 备份记录表格
│  ├─ 下载备份
│  ├─ 恢复备份
│  └─ 删除备份
│
├─ 备份配置 Section（原"备份设置"）
│  ├─ 启用自动备份
│  ├─ 备份间隔时间
│  ├─ 备份保留天数
│  └─ 备份内容选择
│
└─ 定时备份 Section
   ├─ 备份计划列表
   ├─ 添加计划
   └─ 编辑/删除计划
```

#### `backup/BackupManagement.tsx`

```typescript
'use client'

import { useBackupManagement } from '@/features/settings/hooks/useBackupManagement'
import { BackupListSection } from './BackupListSection'
import { BackupConfigSection } from './BackupConfigSection'
import { ScheduleBackupSection } from './ScheduleBackupSection'
import { Button } from '@/components/ui/button'
import toast from 'react-hot-toast'

export function BackupManagement() {
  const {
    backups,
    backupConfig,
    schedules,
    isLoading,
    isCreatingBackup,
    updateBackupConfig,
    createBackup,
    restoreBackup,
    downloadBackup,
    deleteBackup,
    addSchedule,
    updateSchedule,
    deleteSchedule,
  } = useBackupManagement()

  const handleCreateBackup = async () => {
    try {
      const result = await createBackup('手动备份')
      toast.success(`备份创建成功: ${result.name}`)
    } catch (error) {
      toast.error('备份创建失败')
    }
  }

  return (
    <div className="space-y-6">
      {/* 操作栏 */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold">备份管理</h2>
          <p className="text-sm text-gray-600 mt-1">
            管理系统数据备份和恢复
          </p>
        </div>
        <Button
          onClick={handleCreateBackup}
          disabled={isCreatingBackup}
        >
          {isCreatingBackup ? '创建中...' : '立即备份'}
        </Button>
      </div>

      <BackupListSection
        backups={backups}
        onDownload={downloadBackup}
        onRestore={restoreBackup}
        onDelete={deleteBackup}
      />

      <BackupConfigSection
        config={backupConfig}
        onChange={updateBackupConfig}
      />

      <ScheduleBackupSection
        schedules={schedules}
        onAdd={addSchedule}
        onUpdate={updateSchedule}
        onDelete={deleteSchedule}
      />
    </div>
  )
}
```

#### `backup.types.ts`

```typescript
export interface Backup {
  id: string
  name: string
  createdAt: string
  fileSize: number
  type: 'full' | 'incremental' | 'differential'
  status: 'completed' | 'failed' | 'in_progress'
  includes: Array<{
    type: 'database' | 'config' | 'logs' | 'files'
    name: string
  }>
}

export interface BackupConfig {
  autoBackupEnabled: boolean
  backupIntervalHours: number
  retentionDays: number
  backupLocation: string
  includeDatabase: boolean
  includeConfigurations: boolean
  includeLogs: boolean
  compressBackups: boolean
}

export interface BackupSchedule {
  id: string
  name: string
  enabled: boolean
  cronExpression: string
  backupType: 'full' | 'incremental'
  includes: string[]
  nextRun: string
}

export interface BackupManagementResponse {
  backups: Backup[]
  config: BackupConfig
  schedules: BackupSchedule[]
}
```

---

## 🔌 API 变更说明

### 后端 API 新增端点

#### 通用配置相关

```python
# backend/src/api/general/__init__.py

@router.get("/general", response_model=GeneralSettingsResponse)
async def get_general_settings(
    current_user: dict = Depends(require_permission("system:read"))
):
    """获取所有通用配置"""
    pass

@router.post("/general/bulk-update")
async def bulk_update_general_settings(
    data: GeneralSettingsRequest,
    current_user: dict = Depends(require_permission("system:write"))
):
    """批量更新通用配置"""
    pass

@router.get("/general/export")
async def export_general_settings(
    current_user: dict = Depends(require_permission("system:admin"))
):
    """导出通用配置"""
    pass

@router.post("/general/import")
async def import_general_settings(
    file: UploadFile,
    current_user: dict = Depends(require_permission("system:admin"))
):
    """导入通用配置"""
    pass
```

#### 通知中心相关

```python
# backend/src/api/notifications/__init__.py

@router.get("/notifications/all", response_model=NotificationSettingsResponse)
async def get_notification_settings(
    current_user: dict = Depends(require_permission("system:read"))
):
    """获取所有通知配置"""
    pass

@router.post("/notifications/email/test")
async def test_email_configuration(
    current_user: dict = Depends(require_permission("system:write"))
):
    """测试邮件配置"""
    pass
```

### 前端 API 客户端统一标准

所有 API 客户端必须遵循以下标准：

```typescript
// 1. 使用统一的 httpClient
import { httpClient } from '@/lib/api-client'

// 2. 类型安全
export const xxxApi = {
  getFoo: () => httpClient.get<FooResponse>('/endpoint'),
  updateFoo: (data: FooRequest) => httpClient.put('/endpoint', data),
}

// 3. Blob/FormData 特殊处理
export const xxxApi = {
  exportFoo: async (): Promise<Blob> => {
    const token = localStorage.getItem('authData')
    const authData = token ? JSON.parse(token) : null

    const response = await fetch(`${API_URL}/endpoint`, {
      headers: authData?.token ? { Authorization: `Bearer ${authData.token}` } : {},
    })
    return response.blob()
  },
}

// 4. 错误处理
try {
  const result = await xxxApi.getFoo()
} catch (error) {
  if (error instanceof ApiError) {
    // 处理 API 错误
  }
}
```

---

## 📐 类型定义规范

### 共享类型定义

#### `shared.types.ts`

```typescript
// 配置项基础类型
export interface BaseConfig {
  id: string
  key: string
  value: any
  category: string
  type: 'string' | 'number' | 'boolean' | 'json'
  label: string
  description?: string
  required: boolean
  readonly: boolean
  validation?: ValidationRule
  updatedAt?: string
  updatedBy?: string
}

// 验证规则
export interface ValidationRule {
  min?: number
  max?: number
  pattern?: string
  options?: Array<{ label: string; value: string | number }>
}

// 配置分组
export interface SettingsGroup {
  id: string
  name: string
  displayName: string
  description: string
  icon: string
  order: number
  configs: BaseConfig[]
}

// API 响应基类
export interface ApiResponse<T> {
  data: T
  message?: string
  code?: number
}

// 分页响应
export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}
```

### 模块特定类型

每个模块的 `types` 文件应包含：

1. **配置数据接口**: 定义配置项的数据结构
2. **请求/响应接口**: API 的输入输出类型
3. **组件 Props 接口**: 组件的属性类型
4. **状态接口**: 模块内部状态类型

示例：

```typescript
// general.types.ts

// 1. 配置数据接口
export interface BasicInfoConfig {
  applicationName: string
  version: string
  timezone: string
}

// 2. API 响应接口
export interface GeneralSettingsResponse {
  basicInfo: BasicInfoConfig
  inspectionConfig: InspectionConfig
  // ...
}

// 3. API 请求接口
export interface UpdateBasicInfoRequest {
  applicationName?: string
  timezone?: string
}

// 4. 组件 Props 接口
export interface BasicInfoSectionProps {
  data: BasicInfoConfig
  onChange: (field: keyof BasicInfoConfig, value: any) => void
}

// 5. Hook 返回类型
export interface UseGeneralSettingsReturn {
  basicInfo: BasicInfoConfig
  isLoading: boolean
  updateBasicInfo: (field: keyof BasicInfoConfig, value: any) => void
  // ...
}
```

---

## 📅 实施计划

### 总体时间表

**总工期**: 10-15 个工作日

```
Week 1: 基础设施 + 通用配置模块
  Day 1: 路由结构 + 共享组件
  Day 2-3: 通用配置模块（完整实现）

Week 2: 核心功能模块
  Day 4-5: 通知中心模块
  Day 6-7: 安全策略模块
  Day 8: 备份管理模块

Week 3: 其他模块 + 测试
  Day 9-10: 用户管理、审计日志、系统监控（重构）
  Day 11-12: 集成测试 + Bug 修复
  Day 13: 性能优化 + 上线准备
```

### 阶段 1: 基础设施（1 天）

#### 目标
- 创建路由结构
- 实现共享组件
- 配置代码分割

#### 任务清单

```markdown
- [ ] 创建 `app/settings/layout.tsx`
  - [ ] 实现页面标题
  - [ ] 实现 Tab 导航
  - [ ] 实现 Suspense 加载状态

- [ ] 创建 `SettingsTabs` 组件
  - [ ] 定义 7 个 Tab 配置
  - [ ] 实现 Tab 高亮逻辑
  - [ ] 实现图标和文字

- [ ] 创建共享组件（8 个）
  - [ ] ConfigItem
  - [ ] SectionHeader
  - [ ] ConfigInput
  - [ ] ConfigSwitch
  - [ ] ConfigSelect
  - [ ] ActionButtons
  - [ ] EmptyState
  - [ ] LoadingSkeleton

- [ ] 创建 `app/settings/page.tsx`
  - [ ] 重定向到 `/settings/general`
```

### 阶段 2: 通用配置模块（2 天）

#### Day 2: 组件和 UI

```markdown
- [ ] 创建 `app/settings/general/page.tsx`
- [ ] 创建 `GeneralSettings.tsx` 主组件
- [ ] 创建 4 个 Section 组件
  - [ ] BasicInfoSection
  - [ ] InspectionConfigSection
  - [ ] ReportConfigSection
  - [ ] UserPreferenceSection
- [ ] 实现响应式布局
- [ ] 实现加载骨架屏
```

#### Day 3: 逻辑和集成

```markdown
- [ ] 创建 `general.types.ts`
- [ ] 创建 `general.api.ts`
  - [ ] 实现 7 个 API 方法
  - [ ] 处理 Blob 和 FormData
- [ ] 创建 `useGeneralSettings.ts`
  - [ ] 实现状态管理
  - [ ] 实现脏检查
  - [ ] 实现批量保存
  - [ ] 实现导出/导入
- [ ] 集成测试
- [ ] Bug 修复
```

### 阶段 3: 通知中心模块（1.5 天）

#### Day 4: 核心功能

```markdown
- [ ] 创建 `app/settings/notifications/page.tsx`
- [ ] 创建 `NotificationSettings.tsx`
- [ ] 创建 3 个 Section 组件
  - [ ] EmailNotificationSection（合并邮件设置）
  - [ ] SMSNotificationSection
  - [ ] WebhookNotificationSection
- [ ] 创建 `notifications.types.ts`
- [ ] 创建 `notifications.api.ts`
```

#### Day 5 上午: 高级功能

```markdown
- [ ] 实现邮件配置测试功能
- [ ] 实现收件人列表管理
- [ ] 实现 Webhook URL 管理
- [ ] 创建 `useNotificationSettings.ts`
- [ ] 集成测试
```

### 阶段 4: 安全策略模块（1.5 天）

#### Day 5 下午 + Day 6 上午

```markdown
- [ ] 创建 `app/settings/security/page.tsx`
- [ ] 创建 `SecuritySettings.tsx`
- [ ] 创建 3 个 Section 组件
  - [ ] SessionManagementSection（移动会话超时）
  - [ ] PasswordPolicySection
  - [ ] AccessControlSection
- [ ] 创建 `security.types.ts`
- [ ] 创建 `security.api.ts`
- [ ] 创建 `useSecuritySettings.ts`
- [ ] 实现 IP 白名单/黑名单管理
- [ ] 实现时间段限制配置
- [ ] 集成测试
```

### 阶段 5: 备份管理模块（1 天）

#### Day 6 下午 + Day 7 上午

```markdown
- [ ] 创建 `app/settings/backup/page.tsx`
- [ ] 创建 `BackupManagement.tsx`
- [ ] 创建 3 个 Section 组件
  - [ ] BackupListSection
  - [ ] BackupConfigSection
  - [ ] ScheduleBackupSection
- [ ] 创建 `backup.types.ts`
- [ ] 创建 `backup.api.ts`
- [ ] 创建 `useBackupManagement.ts`
- [ ] 实现备份列表表格
- [ ] 实现下载/恢复/删除功能
- [ ] 实现定时备份计划
- [ ] 集成测试
```

### 阶段 6: 其他模块重构（2 天）

#### Day 7 下午 + Day 8

```markdown
- [ ] 用户管理模块
  - [ ] 提取到独立路由
  - [ ] 创建 `users.api.ts`
  - [ ] 创建 `users.types.ts`

- [ ] 审计日志模块
  - [ ] 提取到独立路由
  - [ ] 创建 `audit.api.ts`
  - [ ] 创建 `audit.types.ts`

- [ ] 系统监控模块
  - [ ] 提取到独立路由
  - [ ] 创建 `monitoring.api.ts`
  - [ ] 创建 `monitoring.types.ts`
```

### 阶段 7: 测试与优化（3 天）

#### Day 9-10: 集成测试

```markdown
- [ ] 端到端测试
  - [ ] 测试所有 Tab 导航
  - [ ] 测试所有配置保存
  - [ ] 测试导出/导入功能
  - [ ] 测试权限控制

- [ ] 单元测试
  - [ ] 测试所有自定义 Hooks
  - [ ] 测试共享组件
  - [ ] 测试 API 客户端

- [ ] Bug 修复
  - [ ] 修复发现的所有 Bug
  - [ ] 验证修复效果
```

#### Day 11: 性能优化

```markdown
- [ ] 性能测试
  - [ ] 测量首屏加载时间
  - [ ] 测量 API 响应时间
  - [ ] 测量包大小

- [ ] 优化措施
  - [ ] 优化图片加载
  - [ ] 优化 API 并行度
  - [ ] 优化缓存策略
  - [ ] 优化动画性能

- [ ] 验证指标
  - [ ] 首屏 < 1 秒
  - [ ] 初始包 < 250KB
  - [ ] Lighthouse 分数 > 90
```

#### Day 12: 上线准备

```markdown
- [ ] 文档更新
  - [ ] 更新 README
  - [ ] 更新 API 文档
  - [ ] 更新用户手册

- [ ] 代码审查
  - [ ] 检查代码规范
  - [ ] 检查类型覆盖
  - [ ] 检查测试覆盖

- [ ] 发布准备
  - [ ] 创建发布分支
  - [ ] 更新版本号
  - [ ] 编写 CHANGELOG
  - [ ] 准备回滚方案
```

---

## ⚡ 性能优化策略

### 1. 代码分割（Code Splitting）

#### Next.js 15 自动优化

```typescript
// Next.js 15 自动为每个路由创建独立的 chunk
// app/settings/general/page.tsx → chunk: general-page-[hash].js
// app/settings/users/page.tsx → chunk: users-page-[hash].js

// 预期效果:
// - 首屏只加载通用配置模块: ~150KB
// - 其他模块按需加载: 每个 ~80-100KB
// - 总体减少初始包大小: 70%
```

#### 动态导入优化

```typescript
// 对于大型组件使用动态导入
import dynamic from 'next/dynamic'

const BackupListSection = dynamic(
  () => import('./BackupListSection'),
  {
    loading: () => <Skeleton className="h-64" />,
    ssr: false, // 如果不需要 SSR
  }
)
```

### 2. 并行加载（Parallel Loading）

#### API 并行请求

```typescript
// ❌ 串行加载（慢）
const basicInfo = await generalApi.getBasicInfo()
const inspectionConfig = await generalApi.getInspectionConfig()
const reportConfig = await generalApi.getReportConfig()
// 总耗时: 300ms + 200ms + 150ms = 650ms

// ✅ 并行加载（快）
const [basicInfo, inspectionConfig, reportConfig] = await Promise.all([
  generalApi.getBasicInfo(),
  generalApi.getInspectionConfig(),
  generalApi.getReportConfig(),
])
// 总耗时: max(300ms, 200ms, 150ms) = 300ms
// 提升: 54%
```

#### React Query 并行

```typescript
// React Query 自动并行多个查询
const basicInfoQuery = useQuery(['basicInfo'], generalApi.getBasicInfo)
const inspectionQuery = useQuery(['inspection'], generalApi.getInspectionConfig)
const reportQuery = useQuery(['report'], generalApi.getReportConfig)

// 所有查询同时发起，无需 Promise.all
```

### 3. 缓存策略（Caching Strategy）

#### React Query 缓存配置

```typescript
// 不同类型的数据使用不同的缓存策略

// 1. 只读数据（版本、应用名称）
const { data } = useQuery({
  queryKey: ['systemInfo'],
  queryFn: generalApi.getSystemInfo,
  staleTime: 24 * 60 * 60 * 1000, // 24 小时
  gcTime: 30 * 60 * 1000, // 30 分钟 (原 cacheTime)
})

// 2. 可编辑数据（配置项）
const { data } = useQuery({
  queryKey: ['generalSettings'],
  queryFn: generalApi.getGeneralSettings,
  staleTime: 5 * 60 * 1000, // 5 分钟
  gcTime: 10 * 60 * 1000, // 10 分钟
})

// 3. 实时数据（备份列表、系统监控）
const { data } = useQuery({
  queryKey: ['backups'],
  queryFn: backupApi.getBackups,
  staleTime: 0, // 总是重新获取
  refetchInterval: 30 * 1000, // 每 30 秒刷新
})
```

#### 服务端缓存

```python
# backend/src/services/system_settings.py

from functools import lru_cache
from datetime import datetime, timedelta

class SystemSettingsService:
    def __init__(self):
        self._cache = {}
        self._cache_ttl = {}

    async def get_setting(self, key: str):
        # 检查缓存
        if key in self._cache:
            if datetime.now() < self._cache_ttl[key]:
                return self._cache[key]

        # 从数据库加载
        value = await self._load_from_db(key)

        # 更新缓存
        self._cache[key] = value
        self._cache_ttl[key] = datetime.now() + timedelta(minutes=5)

        return value
```

### 4. 虚拟化列表（Virtualization）

```typescript
// 对于长列表（备份列表、用户列表、审计日志）
import { useVirtualizer } from '@tanstack/react-virtual'

function BackupListSection({ backups }: Props) {
  const parentRef = React.useRef<HTMLDivElement>(null)

  const virtualizer = useVirtualizer({
    count: backups.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 80, // 每行高度
    overscan: 5, // 预渲染 5 行
  })

  return (
    <div ref={parentRef} className="h-[600px] overflow-auto">
      <div style={{ height: `${virtualizer.getTotalSize()}px` }}>
        {virtualizer.getVirtualItems().map((item) => (
          <div
            key={item.key}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: `${item.size}px`,
              transform: `translateY(${item.start}px)`,
            }}
          >
            <BackupItem backup={backups[item.index]} />
          </div>
        ))}
      </div>
    </div>
  )
}

// 效果:
// - 渲染 1000 条记录: 只渲染可见的 ~10 条
// - 性能提升: 100x
```

### 5. 防抖与节流（Debounce & Throttle）

```typescript
import { useDebouncedCallback } from 'use-debounce'

function ConfigInput({ value, onChange }: Props) {
  // 防抖：用户停止输入 500ms 后才触发
  const debouncedOnChange = useDebouncedCallback(
    (newValue) => {
      onChange(newValue)
    },
    500
  )

  return (
    <input
      value={value}
      onChange={(e) => debouncedOnChange(e.target.value)}
    />
  )
}

// 效果:
// - 用户快速输入时不会频繁调用 onChange
// - 减少不必要的状态更新和重渲染
```

### 6. 图片优化

```typescript
import Image from 'next/image'

// Next.js 15 自动优化图片
<Image
  src="/logo.png"
  width={200}
  height={100}
  alt="Logo"
  priority // 首屏图片使用 priority
  loading="lazy" // 非首屏图片使用 lazy
/>

// 效果:
// - 自动转换为 WebP 格式
// - 自动生成多种尺寸
// - 懒加载非首屏图片
```

### 性能指标对比

| 指标 | 优化前 | 优化后 | 提升 |
|------|--------|--------|------|
| **首屏加载时间** | ~3000ms | ~800ms | ⬆️ 73% |
| **初始包大小** | ~800KB | ~180KB | ⬇️ 77% |
| **API 并行度** | 1 (串行) | 7 (并行) | ⬆️ 600% |
| **长列表渲染** | 1000 节点 | ~10 节点 | ⬆️ 9900% |
| **缓存命中率** | 0% | ~80% | ⬆️ ∞ |
| **Lighthouse 分数** | 65 | 95+ | ⬆️ 46% |

---

## ⚠️ 风险管理

### 风险识别

#### 1. 技术风险

| 风险 | 概率 | 影响 | 应对策略 |
|------|------|------|----------|
| **Next.js 15 兼容性问题** | 中 | 高 | 提前测试，准备降级到 v14 |
| **React Query 版本升级** | 低 | 中 | 使用稳定版本，避免 beta |
| **类型定义不完整** | 高 | 中 | 严格 TypeScript 检查 |
| **性能回归** | 中 | 高 | 性能监控，自动化测试 |
| **第三方库 Breaking Changes** | 低 | 高 | 锁定版本，手动升级 |

#### 2. 业务风险

| 风险 | 概率 | 影响 | 应对策略 |
|------|------|------|----------|
| **数据迁移失败** | 中 | 极高 | 完整备份，分步迁移 |
| **功能遗漏** | 中 | 高 | 详细需求检查清单 |
| **用户体验下降** | 低 | 高 | 用户测试，快速回滚 |
| **权限控制缺失** | 低 | 极高 | 安全审计，渗透测试 |

#### 3. 项目风险

| 风险 | 概率 | 影响 | 应对策略 |
|------|------|------|----------|
| **时间超期** | 中 | 中 | MVP 策略，分阶段交付 |
| **人力不足** | 低 | 高 | 任务优先级排序 |
| **需求变更** | 高 | 中 | 敏捷开发，快速响应 |
| **沟通不畅** | 中 | 中 | 每日站会，文档共享 |

### 风险应对措施

#### 1. 完整数据备份

```bash
# 在开始重构前，完整备份当前系统
./scripts/backup-before-refactoring.sh

# 备份内容:
# - 数据库完整导出
# - 配置文件快照
# - 当前代码分支
# - 用户数据导出
```

#### 2. 分步迁移策略

```markdown
阶段 0: 准备（Day 0）
  - [ ] 完整备份
  - [ ] 创建 feature 分支
  - [ ] 设置回滚点

阶段 1: 并行开发（Day 1-8）
  - [ ] 新架构与旧架构并存
  - [ ] 新路由: /settings/new/*
  - [ ] 旧路由: /settings/* 保持不变

阶段 2: 灰度发布（Day 9-10）
  - [ ] 10% 用户访问新架构
  - [ ] 监控错误率和性能
  - [ ] 收集用户反馈

阶段 3: 全量发布（Day 11-12）
  - [ ] 100% 用户切换到新架构
  - [ ] 旧代码保留 1 周
  - [ ] 确认无问题后删除旧代码
```

#### 3. 快速回滚方案

```typescript
// 特性开关控制新旧架构
// frontend/src/config/feature-flags.ts

export const featureFlags = {
  newSettingsArchitecture: process.env.NEXT_PUBLIC_NEW_SETTINGS === 'true',
}

// 在路由层控制
// app/settings/layout.tsx
import { featureFlags } from '@/config/feature-flags'
import { OldSettingsLayout } from './old/layout'
import { NewSettingsLayout } from './new/layout'

export default function SettingsLayout({ children }: Props) {
  if (!featureFlags.newSettingsArchitecture) {
    return <OldSettingsLayout>{children}</OldSettingsLayout>
  }

  return <NewSettingsLayout>{children}</NewSettingsLayout>
}

// 回滚操作: 只需修改环境变量
// NEXT_PUBLIC_NEW_SETTINGS=false
```

#### 4. 自动化测试

```bash
# 每次提交前运行测试套件
npm run test
npm run test:e2e
npm run test:performance

# CI/CD 管道
# .github/workflows/test.yml
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run Unit Tests
        run: npm run test
      - name: Run E2E Tests
        run: npm run test:e2e
      - name: Performance Test
        run: npm run test:performance
      - name: Security Audit
        run: npm audit
```

#### 5. 性能监控

```typescript
// frontend/src/lib/monitoring.ts

import { onCLS, onFID, onLCP, onTTFB } from 'web-vitals'

function sendToAnalytics(metric: any) {
  // 发送到监控平台（如 Google Analytics, Sentry）
  console.log('[Metrics]', metric)
}

// 监控 Core Web Vitals
onCLS(sendToAnalytics)
onFID(sendToAnalytics)
onLCP(sendToAnalytics)
onTTFB(sendToAnalytics)

// 自定义性能指标
export function trackPageLoad(pageName: string) {
  const start = performance.now()

  return () => {
    const duration = performance.now() - start
    sendToAnalytics({
      name: 'page_load',
      page: pageName,
      duration,
    })
  }
}

// 使用
function GeneralSettings() {
  useEffect(() => {
    const track = trackPageLoad('general-settings')
    return track // 组件卸载时记录
  }, [])

  // ...
}
```

---

## 🔄 迁移策略

### 数据迁移

#### 1. 配置数据映射

```typescript
// 旧结构 → 新结构映射
const configMapping = {
  // 系统设置 → 基础信息
  'system.application_name': 'general.basicInfo.applicationName',
  'system.version': 'general.basicInfo.version',
  'system.timezone': 'general.basicInfo.timezone',

  // 会话超时 → 安全策略
  'system.session_timeout': 'security.sessionConfig.sessionTimeout',

  // 通知设置 → 通知中心
  'notification.email_enabled': 'notifications.emailConfig.enabled',

  // 邮件设置 → 通知中心（合并）
  'email.smtp_server': 'notifications.emailConfig.smtpServer',

  // 备份设置 → 备份管理
  'backup.auto_backup_enabled': 'backup.backupConfig.autoBackupEnabled',
}

// 自动迁移脚本
async function migrateConfigurations() {
  const oldConfigs = await oldApi.getAllSettings()
  const newConfigs = {}

  for (const [oldKey, newKey] of Object.entries(configMapping)) {
    const value = oldConfigs[oldKey]
    if (value !== undefined) {
      setNestedProperty(newConfigs, newKey, value)
    }
  }

  await newApi.bulkImport(newConfigs)
}
```

#### 2. 用户权限迁移

```python
# backend/scripts/migrate_permissions.py

async def migrate_permissions():
    """迁移权限配置"""

    # 旧权限 → 新权限映射
    permission_mapping = {
        'system:read': ['general:read', 'security:read', 'backup:read'],
        'system:write': ['general:write', 'security:write', 'backup:write'],
        'system:admin': ['general:admin', 'security:admin', 'backup:admin'],
    }

    users = await get_all_users()

    for user in users:
        old_permissions = user.permissions
        new_permissions = []

        for old_perm in old_permissions:
            if old_perm in permission_mapping:
                new_permissions.extend(permission_mapping[old_perm])

        await update_user_permissions(user.id, new_permissions)

    logger.info(f"Migrated permissions for {len(users)} users")
```

### 代码迁移

#### 1. 渐进式替换

```typescript
// Step 1: 保留旧组件，创建新组件
// features/settings/components/SystemConfiguration.tsx (保留)
// features/settings/components/general/GeneralSettings.tsx (新建)

// Step 2: 在路由层选择性使用
// app/settings/general/page.tsx
import { featureFlags } from '@/config/feature-flags'
import { OldSystemConfiguration } from '@/features/settings/components/SystemConfiguration'
import { GeneralSettings } from '@/features/settings/components/general/GeneralSettings'

export default function GeneralPage() {
  if (!featureFlags.newSettingsArchitecture) {
    return <OldSystemConfiguration />
  }

  return <GeneralSettings />
}

// Step 3: 验证新组件功能完整后，删除旧组件
```

#### 2. API 兼容层

```typescript
// lib/api-client-legacy.ts

/**
 * 旧 API 兼容层
 * 将新 API 调用转换为旧 API 格式
 */
export class LegacyApiAdapter {
  static async getOldSettings() {
    // 调用新 API
    const newData = await generalApi.getGeneralSettings()

    // 转换为旧格式
    return {
      'system.application_name': newData.basicInfo.applicationName,
      'system.version': newData.basicInfo.version,
      // ...
    }
  }

  static async updateOldSetting(key: string, value: any) {
    // 将旧 key 映射到新 API
    const mapping = {
      'system.application_name': () =>
        generalApi.updateBasicInfo({ applicationName: value }),
      // ...
    }

    if (mapping[key]) {
      return mapping[key]()
    }

    throw new Error(`Unknown setting key: ${key}`)
  }
}
```

### 用户迁移

#### 1. 用户通知

```markdown
## 系统升级通知

尊敬的用户，

我们将于 2025-11-15 对系统设置功能进行重大升级：

### 主要变化
1. **导航优化**: 新的 Tab 导航，功能更清晰
2. **命名调整**: 部分功能模块重新命名（详见下表）
3. **性能提升**: 页面加载速度提升 70%

### 功能映射
| 旧名称 | 新名称 | 说明 |
|--------|--------|------|
| 常规设置 | 通用配置 | 基础配置项 |
| 系统设置 | 基础信息 | 系统基本信息 |

### 升级时间
- **开始时间**: 2025-11-15 02:00
- **预计时长**: 1 小时
- **影响范围**: 系统设置功能不可用

### 注意事项
- 请在升级前导出您的配置
- 升级期间请勿修改配置
- 如有问题请联系技术支持

感谢您的理解与支持！
```

#### 2. 用户培训

```markdown
## 新架构使用指南

### 1. 如何找到原来的功能？

**Q: 原来的"系统设置"配置项去哪了？**
A: 现在叫"基础信息"，在"通用配置" Tab 下

**Q: 邮件设置在哪里？**
A: 已合并到"通知中心" Tab 的"邮件通知" Section

**Q: 会话超时配置在哪里？**
A: 已移至"安全策略" Tab 的"会话管理" Section

### 2. 新增功能

- **批量保存**: 修改多个配置后一次性保存
- **脏检查**: 未保存的修改会有提示
- **配置导出**: 支持导出当前所有配置
- **配置导入**: 支持从文件导入配置

### 3. 常见问题

**Q: 为什么我的配置没有保存？**
A: 请点击页面顶部的"保存"按钮

**Q: 如何恢复到之前的配置？**
A: 点击"重置"按钮，或从备份导入

**Q: 出现错误怎么办？**
A: 请刷新页面，如仍有问题请联系技术支持
```

---

## 📝 总结

### 核心改进

1. **解决命名冲突**: 三层命名系统，语义清晰
2. **消除功能重复**: 每个功能只有一个入口
3. **模块化架构**: 58 个文件，职责清晰
4. **性能优化**: 70% 包大小减少，3x 加载速度提升
5. **类型安全**: 100% TypeScript，消除 `any`
6. **可维护性**: 清晰的文件结构，统一的代码规范

### 预期效果

| 维度 | 当前 | 目标 | 改进 |
|------|------|------|------|
| **用户体验** | 混乱、重复 | 清晰、一致 | ⬆️ 100% |
| **首屏加载** | ~3 秒 | < 1 秒 | ⬆️ 67% |
| **代码可维护性** | 低 | 高 | ⬆️ 200% |
| **类型安全** | 40% | 100% | ⬆️ 150% |
| **测试覆盖** | 0% | > 80% | ⬆️ ∞ |

### 实施要点

1. ✅ **分阶段实施**: 10-15 天，分 7 个阶段
2. ✅ **完整备份**: 开始前完整备份所有数据
3. ✅ **并行开发**: 新旧架构并存，降低风险
4. ✅ **灰度发布**: 10% → 100% 逐步切换
5. ✅ **快速回滚**: 特性开关，一键回滚
6. ✅ **自动化测试**: 单元测试 + 集成测试 + 性能测试
7. ✅ **用户培训**: 提供详细的迁移指南

---

## 📚 附录

### A. 参考资料

- [Next.js 15 Documentation](https://nextjs.org/docs)
- [React Query v5 Guide](https://tanstack.com/query/latest)
- [TypeScript Best Practices](https://www.typescriptlang.org/docs/handbook/declaration-files/do-s-and-don-ts.html)
- [Web Vitals](https://web.dev/vitals/)
- [React Performance Optimization](https://react.dev/learn/render-and-commit)

### B. 工具清单

```json
{
  "dependencies": {
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "next": "^15.5.0",
    "@tanstack/react-query": "^5.85.0",
    "react-hot-toast": "^2.4.1",
    "lucide-react": "^0.453.0",
    "date-fns": "^4.1.0",
    "zod": "^3.22.4"
  },
  "devDependencies": {
    "typescript": "^5.7.2",
    "@types/react": "^19.1.12",
    "@types/node": "^22.10.2",
    "vitest": "^2.1.8",
    "@playwright/test": "^1.49.1",
    "eslint": "^9.18.0",
    "prettier": "^3.4.2"
  }
}
```

### C. Git 分支策略

```
main (生产分支)
  └─ develop (开发分支)
      └─ feature/settings-refactoring (功能分支)
          ├─ feature/settings-foundation (基础设施)
          ├─ feature/settings-general (通用配置)
          ├─ feature/settings-notifications (通知中心)
          ├─ feature/settings-security (安全策略)
          └─ feature/settings-backup (备份管理)
```

### D. 提交规范

```
feat: 新增功能
fix: 修复 Bug
refactor: 重构
perf: 性能优化
test: 测试
docs: 文档
style: 代码格式
chore: 构建工具

示例:
feat(general): 实现基础信息 Section
fix(notifications): 修复邮件配置保存失败
refactor(shared): 提取 ConfigItem 共享组件
perf(general): 优化配置加载性能
test(general): 添加 useGeneralSettings Hook 单元测试
```

---

**文档版本**: v1.0
**最后更新**: 2025-11-05
**作者**: Claude Code
**审核**: 待审核
**状态**: 待实施
