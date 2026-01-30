# 巡检模板 API 迁移说明

## 概述

巡检模板功能已完全迁移到新版统一实现，所有旧版文件和兼容层代码已删除。

## 迁移日期

2026-01-30

## 已删除的旧版文件

| 文件路径 | 说明 |
|---------|------|
| `frontend/src/lib/api/templates.ts` | 旧版 API 客户端 |
| `frontend/src/lib/types/template.types.ts` | 旧版类型定义 |
| `frontend/src/hooks/useTemplates.ts` | 旧版 React Query Hooks |

## 新版文件位置

| 功能 | 新版文件路径 |
|------|-------------|
| API 客户端 | `frontend/src/features/inspection/api/inspection.api.ts` |
| 类型定义 | `frontend/src/features/inspection/types/index.ts` |
| React Hooks | `frontend/src/features/inspection/hooks/useInspection.ts` |
| 组件 | `frontend/src/features/inspection/components/` |
| 统一导出 | `frontend/src/features/inspection/index.ts` |

## 类型定义变更

### 新版类型定义

```typescript
interface InspectionTemplate {
  id: string                    // 旧版: number
  name: string
  description: string
  category: 'network' | 'system' | 'security' | 'custom'
  deviceTypes: string[]         // 旧版: { vendors: string[], device_types: string[] }
  checkItems: InspectionCheckItem[]  // 旧版: check_items
  isBuiltIn: boolean           // 旧版: is_default
  isActive: boolean            // 旧版: is_active
  createdAt: string            // 旧版: created_at
  updatedAt: string            // 旧版: updated_at
}

interface InspectionCheckItem {
  id: string
  name: string
  type: 'snmp' | 'ssh' | 'http' | 'ping' | 'script'
  config: CheckItemConfig
  weight: number
}
```

### 字段命名变更

| 旧版字段 (snake_case) | 新版字段 (camelCase) |
|----------------------|---------------------|
| `is_default` | `isBuiltIn` |
| `is_active` | `isActive` |
| `check_items` | `checkItems` |
| `device_types` | `deviceTypes` |
| `created_at` | `createdAt` |
| `updated_at` | `updatedAt` |

### ID 类型变更

- **旧版**: `id: number`
- **新版**: `id: string`

### 设备类型结构变更

- **旧版**: `device_types: { vendors: string[], device_types: string[] }`
- **新版**: `deviceTypes: string[]` (扁平化数组)

## API Hooks 迁移

### Hooks 映射表

| 旧版 Hook | 新版 Hook | 说明 |
|-----------|-----------|------|
| `useTemplates` | `useInspectionTemplates` | 获取模板列表 |
| `useTemplate` | `useInspectionTemplate` | 获取单个模板 |
| `useCreateTemplate` | `useCreateTemplate` | 创建模板 |
| `useUpdateTemplate` | `useUpdateTemplate` | 更新模板 |
| `useDeleteTemplate` | `useDeleteTemplate` | 删除模板 |
| `useCopyTemplate` | `useCloneTemplate` | 克隆模板 |
| `useExportTemplate` | 使用 `exportInspectionTemplate` 函数 | 导出模板 |

### 使用示例

#### 旧版用法（已废弃）

```typescript
// ❌ 不要使用
import { useTemplates, useCreateTemplate } from '@/hooks/useTemplates'
import type { InspectionTemplate } from '@/lib/types/template.types'

const { data } = useTemplates({ page: 1, pageSize: 20 })
```

#### 新版用法（推荐）

```typescript
// ✅ 推荐使用
import { 
  useInspectionTemplates, 
  useInspectionTemplate,
  useCreateTemplate,
  useUpdateTemplate,
  useDeleteTemplate,
  useCloneTemplate,
  InspectionTemplate 
} from '@/features/inspection'

const { data } = useInspectionTemplates({ page: 1, pageSize: 20 })
```

## API 函数使用

### 导入方式

```typescript
import {
  fetchInspectionTemplates,
  fetchInspectionTemplate,
  createInspectionTemplate,
  updateInspectionTemplate,
  deleteInspectionTemplate,
  exportInspectionTemplate,
} from '@/features/inspection'
```

### 使用示例

```typescript
// 获取模板列表
const templates = await fetchInspectionTemplates({
  page: 1,
  pageSize: 20,
  category: 'network',
})

// 获取单个模板
const template = await fetchInspectionTemplate(1)

// 创建模板
const newTemplate = await createInspectionTemplate({
  name: '新模板',
  description: '描述',
  category: 'network',
  deviceTypes: ['router', 'switch'],
  checkItems: [],
  isBuiltIn: false,
  isActive: true,
})

// 更新模板
const updated = await updateInspectionTemplate(1, {
  name: '更新后的名称'
})

// 删除模板
await deleteInspectionTemplate(1)

// 导出模板
const blob = await exportInspectionTemplate(1)
```

## Hooks 使用示例

### 获取模板列表

```typescript
const { data, isLoading, error } = useInspectionTemplates({
  page: 1,
  pageSize: 20,
  category: 'network',
  deviceTypes: ['router'],
})

// data 结构
// {
//   templates: InspectionTemplate[],
//   total: number,
//   pages: number
// }
```

### 创建模板

```typescript
const createMutation = useCreateTemplate()

createMutation.mutate({
  name: '新模板',
  description: '描述',
  category: 'network',
  deviceTypes: ['router', 'switch'],
  checkItems: [],
  isBuiltIn: false,
  isActive: true,
})
```

### 更新模板

```typescript
const updateMutation = useUpdateTemplate()

updateMutation.mutate({
  id: '1',
  data: { 
    name: '更新后的名称',
    description: '新描述'
  }
})
```

### 删除模板

```typescript
const deleteMutation = useDeleteTemplate()

deleteMutation.mutate('1')
```

### 克隆模板

```typescript
const cloneMutation = useCloneTemplate()

cloneMutation.mutate({
  id: '1',
  name: '克隆的模板'
})
```

## 组件使用

### 导入组件

```typescript
import {
  InspectionTemplates,      // 主视图
  TemplateList,             // 模板列表
  TemplateEditor,           // 模板编辑器
  TemplateEditorWrapper,    // 编辑器包装
  TemplateDetailModal,      // 详情弹窗
  TemplateImportModal,      // 导入弹窗
  CheckItemEditor,          // 检查项编辑器
  OIDTester,                // OID 测试工具
} from '@/features/inspection'
```

### 使用示例

```typescript
// 使用主视图
<InspectionTemplates />

// 使用模板列表
<TemplateList
  onTemplateSelect={(id) => console.log(id)}
  selectedTemplateId={selectedId}
  showActions={true}
/>

// 使用编辑器
<TemplateEditorWrapper
  template={template}
  onSuccess={() => router.push('/templates')}
  onCancel={() => router.back()}
/>
```

## 后端兼容层

API 文件中保留了后端数据转换层，用于：
- 将后端返回的 snake_case 字段转换为前端的 camelCase
- 确保前后端数据格式的兼容性
- 这是必要的兼容层，不应删除

转换逻辑位于 `frontend/src/features/inspection/api/inspection.api.ts` 中的 `transformTemplateData` 函数。

## 迁移检查清单

- [x] 旧版文件已删除
- [x] 旧版引用已清除
- [x] 组件已迁移到新版 API
- [x] 字段名已统一为 camelCase
- [x] TypeScript 编译通过
- [x] 所有功能从统一入口导出
- [x] 文档已更新

## 相关文档

- [组件文档](./inspection-components.md)
- [迁移完成报告](./migration-complete.md)
- [API 文档](../../api/template-api.md)

## 注意事项

1. **ID 类型变更**: 新版使用 `string` 类型的 ID，旧版使用 `number`
2. **字段命名**: 统一使用 camelCase，不再使用 snake_case
3. **设备类型**: 简化为字符串数组，不再使用嵌套对象
4. **导入路径**: 统一从 `@/features/inspection` 导入
5. **后端兼容**: API 层会自动处理新旧格式转换

## 问题排查

如果遇到类型错误：
1. 检查是否使用了旧版字段名（snake_case）
2. 检查 ID 类型是否正确（应为 string）
3. 检查导入路径是否正确
4. 运行 `pnpm tsc --noEmit` 检查类型错误

如果遇到运行时错误：
1. 检查后端 API 返回的数据格式
2. 查看浏览器控制台的网络请求
3. 检查 API 转换层是否正常工作
