# Alert Filters Bar Select Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将告警中心 `AlertFiltersBar` 中的“严重级别 / 状态”筛选从原生 `<select>` 统一改造成与日志中心筛选栏一致的 `Select` 体系。

**Architecture:** 仅修改 `AlertFiltersBar` 组件中的两个筛选下拉，复用项目统一的 `Select / SelectTrigger / SelectValue / SelectContent / SelectItem` 组合，保留 `AlertsView` 现有筛选数据流和 `onFilterChange` 契约不变。测试优先新增组件级用例，验证不再使用原生 `<select>`、回调参数不变、`renderAsCard` 双模式不回归。

**Tech Stack:** React 19、Next.js 15、Radix Select、Jest、Testing Library

---

### Task 1: 新增组件级失败测试

**Files:**
- Create: `tests/frontend/alerts/components/AlertFiltersBar.test.tsx`

**Step 1: 写组件级筛选栏测试**

- 覆盖“不再渲染原生 `<select>`”
- 覆盖“存在两个统一下拉：严重级别 / 状态”
- 覆盖“切换后仍调用 `onFilterChange('severityFilter'/'statusFilter', value)`”
- 覆盖 `selectedCount > 0` 时批量按钮仍渲染
- 覆盖 `renderAsCard={false}` 分支

**Step 2: 运行测试确认失败**

Run: `pnpm --dir frontend test --runInBand tests/frontend/alerts/components/AlertFiltersBar.test.tsx`

Expected: FAIL，原因应与组件仍使用原生 `<select>`、未渲染统一 `Select` 结构有关。

### Task 2: 实现统一下拉

**Files:**
- Modify: `frontend/src/features/alerts/components/AlertFiltersBar.tsx`

**Step 1: 引入统一 Select 组件**

- 从统一组件出口引入 `Select / SelectTrigger / SelectValue / SelectContent / SelectItem`
- 保留 `Card / CardContent / Button / Input` 的既有用法

**Step 2: 替换原生 `<select>`**

- 严重级别下拉改为统一 `Select`
- 状态下拉改为统一 `Select`
- `value` 继续直接使用当前字符串值
- `onValueChange` 继续调用 `onFilterChange`
- 为两个 `SelectTrigger` 补上清晰的 `aria-label`

**Step 3: 保持原有布局和文案**

- 保留现有搜索框、批量按钮、高级筛选按钮
- 保留“所有严重级别 / 所有状态”文案
- 保持 `renderAsCard` 双模式结构不变

### Task 3: 运行聚焦验证

**Files:**
- Verify only

**Step 1: 运行组件级测试**

Run: `pnpm --dir frontend test --runInBand tests/frontend/alerts/components/AlertFiltersBar.test.tsx`

Expected: PASS

**Step 2: 运行告警中心现有回归测试**

Run: `pnpm --dir frontend test --runInBand tests/frontend/alerts/components/AlertsView.test.tsx`

Expected: PASS

**Step 3: 可选运行语义 token 约束测试**

Run: `pnpm --dir frontend test --runInBand tests/frontend/theme/semanticTokenConvergence.business.test.ts`

Expected: 若环境稳定则 PASS；如出现与本任务无关失败，需单独标注，不混淆本次结果。
