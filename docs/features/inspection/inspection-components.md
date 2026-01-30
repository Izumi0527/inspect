# 巡检模板组件文档

这个文档描述了巡检模板管理功能的所有前端组件。

## 组件位置

所有组件位于 `frontend/src/features/inspection/components/` 目录。

## 组件列表

### 筛选组件
- **VendorFilter** - 厂商筛选下拉框
- **DeviceTypeFilter** - 设备类型筛选下拉框
- **CategoryFilter** - 分类筛选下拉框

### 列表和卡片组件
- **TemplateCard** - 模板卡片，显示模板摘要信息
- **TemplateList** - 模板列表，集成筛选、搜索和分页功能

### 详情展示组件
- **CheckItemGroup** - 检查项分组展示，按类别分组
- **TemplateDetail** - 模板详情页面，显示完整的模板信息
- **TemplateDetailModal** - 模板详情弹窗

### 编辑组件
- **CheckItemEditor** - 检查项编辑器，支持创建和编辑检查项
- **TemplateEditor** - 模板编辑器，支持创建和编辑模板
- **TemplateEditorWrapper** - 模板编辑器包装组件，处理 API 调用

### 导入导出和工具组件
- **TemplateImportExport** - 模板导入导出组件
- **TemplateImportModal** - 模板导入弹窗
- **OIDTester** - OID 测试工具，用于测试 SNMP OID 是否可用

### 主要视图组件
- **InspectionTemplates** - 巡检模板主视图，包含列表、筛选、操作等完整功能

## 使用示例

### 模板列表页面
```tsx
import { TemplateList } from '@/features/inspection/components'

function TemplatesPage() {
  const [selectedId, setSelectedId] = useState<string | null>(null)
  
  return (
    <TemplateList
      onTemplateSelect={setSelectedId}
      selectedTemplateId={selectedId}
      showActions={true}
    />
  )
}
```

### 模板详情页面
```tsx
import { TemplateDetail } from '@/features/inspection/components'

function TemplateDetailPage({ id }: { id: string }) {
  return (
    <TemplateDetail
      templateId={id}
      onCopy={(id) => console.log('Copy', id)}
      onExport={(id) => console.log('Export', id)}
      onEdit={(id) => console.log('Edit', id)}
    />
  )
}
```

### 模板编辑页面
```tsx
import { TemplateEditorWrapper } from '@/features/inspection/components'
import { useInspectionTemplate } from '@/features/inspection'

function EditTemplatePage({ id }: { id: string }) {
  const { data: template } = useInspectionTemplate(Number(id))
  
  return (
    <TemplateEditorWrapper
      template={template}
      onSuccess={() => router.push('/inspection/templates')}
      onCancel={() => router.back()}
    />
  )
}
```

### 使用 OID 测试工具
```tsx
import { OIDTester } from '@/features/inspection/components'

function OIDTestPage() {
  return (
    <OIDTester
      defaultDeviceId={1}
      defaultOid="1.3.6.1.2.1.1.3.0"
      onTestSuccess={(result) => {
        console.log('OID test success:', result)
      }}
    />
  )
}
```

## API 和 Hooks

### 导入方式
```tsx
import {
  // Hooks
  useInspectionTemplates,
  useInspectionTemplate,
  useCreateTemplate,
  useUpdateTemplate,
  useDeleteTemplate,
  useCloneTemplate,
  
  // API 函数
  fetchInspectionTemplates,
  fetchInspectionTemplate,
  createInspectionTemplate,
  updateInspectionTemplate,
  deleteInspectionTemplate,
  exportInspectionTemplate,
  
  // 类型
  InspectionTemplate,
  InspectionCheckItem,
} from '@/features/inspection'
```

### Hooks 使用示例
```tsx
// 获取模板列表
const { data, isLoading } = useInspectionTemplates({
  page: 1,
  pageSize: 20,
  category: 'network',
})

// 创建模板
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

// 更新模板
const updateMutation = useUpdateTemplate()
updateMutation.mutate({
  id: '1',
  data: { name: '更新后的名称' }
})

// 删除模板
const deleteMutation = useDeleteTemplate()
deleteMutation.mutate('1')

// 克隆模板
const cloneMutation = useCloneTemplate()
cloneMutation.mutate({
  id: '1',
  name: '克隆的模板'
})
```

## 类型定义

### InspectionTemplate
```typescript
interface InspectionTemplate {
  id: string
  name: string
  description: string
  category: 'network' | 'system' | 'security' | 'custom'
  deviceTypes: string[]
  checkItems: InspectionCheckItem[]
  isBuiltIn: boolean
  isActive: boolean
  createdAt: string
  updatedAt: string
}
```

### InspectionCheckItem
```typescript
interface InspectionCheckItem {
  id: string
  name: string
  type: 'snmp' | 'ssh' | 'http' | 'ping' | 'script'
  config: CheckItemConfig
  weight: number
}
```

## 页面路由

- `/inspection` - 巡检主页面
- `/inspection/templates` - 模板列表（包含在主页面中）
- `/inspection/strategies` - 策略列表（包含在主页面中）
- `/inspection/executions` - 执行记录（包含在主页面中）

## 测试

组件测试文件位于 `frontend/src/features/inspection/components/__tests__/` 目录。

运行测试：
```bash
cd frontend
pnpm test -- --testPathPattern=inspection/components
```

## 相关文档

- [巡检模板 API 迁移说明](./api-migration.md)
- [迁移完成报告](./migration-complete.md)
- [API 文档](../../api/template-api.md)
