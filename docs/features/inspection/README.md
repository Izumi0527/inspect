# 巡检功能文档

本目录包含巡检功能的完整文档。

## 文档列表

### 📚 主要文档

1. **[API 迁移说明](./api-migration.md)**
   - 旧版到新版的迁移指南
   - API 和 Hooks 使用说明
   - 类型定义变更
   - 代码示例

2. **[组件文档](./inspection-components.md)**
   - 所有组件的说明
   - 组件使用示例
   - API 和 Hooks 参考
   - 类型定义

3. **[迁移完成报告](./migration-complete.md)**
   - 迁移状态总结
   - 文件结构变更
   - 验证结果
   - 相关文档链接

## 快速开始

### 导入方式

```typescript
// 导入 Hooks
import { 
  useInspectionTemplates,
  useCreateTemplate,
  useUpdateTemplate,
  useDeleteTemplate,
  useCloneTemplate
} from '@/features/inspection'

// 导入组件
import {
  InspectionTemplates,
  TemplateList,
  TemplateEditor,
  OIDTester
} from '@/features/inspection'

// 导入类型
import type {
  InspectionTemplate,
  InspectionCheckItem
} from '@/features/inspection'
```

### 基本使用

```typescript
// 获取模板列表
const { data, isLoading } = useInspectionTemplates({
  page: 1,
  pageSize: 20,
})

// 创建模板
const createMutation = useCreateTemplate()
createMutation.mutate({
  name: '新模板',
  category: 'network',
  deviceTypes: ['router'],
  checkItems: [],
  isBuiltIn: false,
  isActive: true,
})
```

## 文件位置

### 源代码
```
frontend/src/features/inspection/
├── api/inspection.api.ts          # API 客户端
├── hooks/useInspection.ts         # React Hooks
├── types/index.ts                 # 类型定义
├── components/                    # 组件目录
│   ├── InspectionTemplates.tsx   # 主视图
│   ├── TemplateList.tsx          # 模板列表
│   ├── TemplateEditor.tsx        # 编辑器
│   ├── OIDTester.tsx             # OID 测试工具
│   └── ...                       # 其他组件
└── index.ts                       # 统一导出
```

### 文档
```
docs/features/inspection/
├── README.md                      # 本文件
├── api-migration.md               # API 迁移说明
├── inspection-components.md       # 组件文档
└── migration-complete.md          # 迁移完成报告
```

## 主要特性

### 模板管理
- ✅ 创建、编辑、删除模板
- ✅ 克隆模板
- ✅ 导入/导出模板
- ✅ 模板筛选和搜索
- ✅ 分页支持

### 检查项管理
- ✅ 支持多种检查类型（SNMP、SSH、HTTP、Ping、Script）
- ✅ 检查项编辑器
- ✅ 权重配置
- ✅ 阈值设置

### 工具
- ✅ OID 测试工具
- ✅ 常用 OID 快捷选择
- ✅ 实时测试结果

## 类型系统

### 核心类型

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

interface InspectionCheckItem {
  id: string
  name: string
  type: 'snmp' | 'ssh' | 'http' | 'ping' | 'script'
  config: CheckItemConfig
  weight: number
}
```

## 迁移状态

🎉 **已完成** - 2026-01-30

- ✅ 旧版文件已删除
- ✅ 新版 API 已实现
- ✅ 所有组件已迁移
- ✅ TypeScript 编译通过
- ✅ 文档已完善

## 相关链接

- [API 文档](../../api/template-api.md)
- [WebSocket 协议](../../api/websocket-contract.md)
- [后端 API 文档](../../api/README.md)

## 问题反馈

如有问题或建议，请联系开发团队。
