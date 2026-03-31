# 日志中心筛选栏下拉统一实现规范

## 1. 背景与目标

为减少页面下拉交互不一致、可访问性缺失、测试维护成本高等问题，前端页面/弹窗/表单中的业务下拉统一采用“日志中心筛选栏”实现方式。  
本规范用于约束后续新增与改造场景，确保全站下拉组件行为、可访问性与测试策略一致。

## 2. 统一收益（为什么要统一）

- 降低认知成本：用户在不同页面看到一致的下拉交互与视觉反馈。
- 降低维护成本：统一组件出口与写法，减少重复封装和兼容分支。
- 提升可访问性：统一要求 `SelectTrigger` 必须具备明确 `aria-label`。
- 提升测试稳定性：统一测试策略，优先做轻量组件级回归，减少脆弱 UI 细节依赖。

## 3. 强制组件标准

所有业务下拉必须从统一出口引入并使用以下组件组合：

```tsx
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
```

标准结构如下（可按业务补 className）：

```tsx
<Select value={value} onValueChange={handleChange}>
  <SelectTrigger aria-label="筛选条件名称">
    <SelectValue placeholder="请选择" />
  </SelectTrigger>
  <SelectContent>
    <SelectItem value="all">全部</SelectItem>
    <SelectItem value="x">选项X</SelectItem>
  </SelectContent>
</Select>
```

禁止项：

- 禁止在业务页面继续新增原生 `<select>`。
- 禁止从旧出口（如 `@/components/atoms/select`）引入下拉组件用于业务场景。
- 禁止省略 `SelectTrigger` 的可访问名称。

## 4. 可访问性规则（aria-label）

- 每个 `SelectTrigger` 必须提供明确且业务可读的 `aria-label`。
- `aria-label` 应描述“该下拉在筛选什么”，避免使用“下拉框1/2”等无语义文案。
- 推荐命名方式：
  - `"日志级别筛选"`
  - `"每页条数"`
  - `"监控时间范围"`
  - `"报告类别"`

## 5. 值处理规则

- `Select` 选中值统一按字符串流转。
- 若业务状态是数字或联合类型，在 `onValueChange` 内完成转换，不要在组件外部隐式转换。
- 推荐写法：

```tsx
onValueChange={(next) => setPageSize(Number(next))}
```

```tsx
onValueChange={(next) => onFilterChange('severityFilter', next as AlertSeverity | 'all')}
```

## 6. 测试推荐写法

- 优先使用轻量组件级测试，聚焦“是否已统一下拉实现”和“回调契约是否保持不变”。
- 测试中通常 `mock '@/components/ui/select'`，避免把测试耦合到底层实现细节。
- 最小断言建议：
  - 不再渲染原生 `<select>`。
  - 渲染出带明确可访问名称的 `combobox`。
  - 触发选项切换后，业务回调参数与原契约一致。

## 7. 已完成页面示例（可复用参考）

- 日志中心：
  - `frontend/src/features/logs/components/LogFiltersBar.tsx`
  - `frontend/src/features/logs/components/LogList.tsx`
- 告警中心：
  - `frontend/src/features/alerts/components/AlertFiltersBar.tsx`
  - `frontend/src/features/alerts/components/AdvancedFilters.tsx`
- 监控中心：
  - `frontend/src/features/monitoring/components/shared/MonitoringHeaderActions.tsx`
- 设备、巡检、报表、系统设置等模块已按同一规范逐步收敛。

## 8. 新增页面/弹窗/表单下拉实施 Checklist

- [ ] 下拉组件从 `@/components/ui/select` 引入。
- [ ] 使用 `Select + SelectTrigger + SelectValue + SelectContent + SelectItem` 完整结构。
- [ ] 每个 `SelectTrigger` 都有明确 `aria-label`。
- [ ] 选中值先按字符串处理，必要时在 `onValueChange` 内做类型转换。
- [ ] 未使用原生 `<select>` 与旧下拉出口。
- [ ] 补充最小必要组件测试，覆盖“无原生 `<select>` + 回调契约不变”。

## 9. 适用范围与执行要求

- 适用范围：前端所有页面、弹窗、表单中的业务下拉。
- 执行要求：后续新增或改造下拉必须遵循本规范；代码评审与测试验收按本规范检查。

