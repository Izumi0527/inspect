# 统一统计卡片（单卡）样式 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 以“设备管理”页统计卡片为基准，统一总览、巡检管理、告警中心、日志中心、报表分析 5 个页面的“单卡”视觉规格（内边距/字体/图标/阴影等），同时保持各页面现有的卡片数量与网格列数不变。

**Architecture:** 抽取一个共享的“紧凑统计卡”组件（`CompactStatCard`），以设备管理页的 DOM 结构与 Tailwind 类名为基准实现；五个页面只替换卡片内部实现，容器布局（grid/flex、列数、gap、卡片数量）保持原样。

**Tech Stack:** Next.js(React) + TailwindCSS + TypeScript + Jest + React Testing Library

---

## 执行进度（截至 2026-03-18）

- [x] Task 1：失败测试（CompactStatCard 结构与样式）
- [x] Task 2：实现 CompactStatCard（测试转绿）
- [x] Task 3：总览页 StatsGrid 替换统计卡（保持布局不变）
- [x] Task 4：巡检管理页 InspectionView 替换快速统计卡（保持布局不变）
- [x] Task 5：告警中心 AlertStatsGrid 替换统计卡（保持布局不变）
- [x] Task 6：日志中心 LogStatsGrid 替换统计卡（保持布局不变）
- [x] Task 7：报表分析 ReportsView 替换快速统计卡（保持布局不变）
- [x] Task 8：全量校验（类型检查 / 单测）
- [ ] Task 9：Git 提交（可选）

备注：
- 关键产物：`frontend/src/components/shared/CompactStatCard.tsx`、`frontend/src/components/shared/__tests__/CompactStatCard.test.tsx`

### Task 1: 写失败测试（CompactStatCard 结构与样式）

**Files:**
- Create: `frontend/src/components/shared/__tests__/CompactStatCard.test.tsx`

**Step 1: Write the failing test**
- 断言默认渲染包含以下关键类名（与设备管理页一致）：
  - `CardContent` 使用 `p-2.5`
  - 标题使用 `text-xs font-medium text-muted-foreground leading-tight`
  - 数值使用 `text-lg font-bold leading-none`
  - 图标容器使用 `p-1 rounded-md`
- 断言传入 `onClick` 时：
  - 外层可点击（`button`）并占满宽度（`block w-full`）
  - 点击触发回调

**Step 2: Run test to verify it fails**
Run: `pnpm -C frontend test frontend/src/components/shared/__tests__/CompactStatCard.test.tsx`
Expected: FAIL（组件不存在或渲染结构不匹配）

---

### Task 2: 实现 CompactStatCard（让测试转绿）

**Files:**
- Create: `frontend/src/components/shared/CompactStatCard.tsx`
- Modify: `frontend/src/components/shared/index.ts`

**Step 1: Write minimal implementation**
- 组件使用 `@/components/atoms` 的 `Card/CardContent`
- DOM 结构与设备管理页一致：`flex items-center` + 左图标块 + 右侧标题/数值
- 支持 `iconClassName/iconBgClassName/valueClassName/className/onClick/ariaLabel`
- 若提供 `onClick`，使用 `button` 包裹 `Card`，并提供 `focus-visible:ring`（不改变单卡尺寸）

**Step 2: Run test to verify it passes**
Run: `pnpm -C frontend test frontend/src/components/shared/__tests__/CompactStatCard.test.tsx`
Expected: PASS

---

### Task 3: 总览页替换统计卡（保持 4 卡/4 列布局不变）

**Files:**
- Modify: `frontend/src/features/dashboard/components/StatsGrid.tsx`

**Step 1: Replace StatCard usage**
- 用 `CompactStatCard` 替换 `StatCard`
- 保持容器：`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4`
- loading skeleton 同步缩小到紧凑规格（对齐 `p-2.5` 与图标块尺寸）

**Step 2: Run tests**
Run: `pnpm -C frontend test`
Expected: PASS

---

### Task 4: 巡检管理页替换快速统计卡（保持 4 卡/4 列布局不变）

**Files:**
- Modify: `frontend/src/features/inspection/components/InspectionView.tsx`

**Step 1: Replace inline Card blocks**
- 将 4 个 `Card`（`p-4 text-center`）替换为 `CompactStatCard`
- 为 4 张卡补齐 Lucide 图标（仅视觉，不改数据逻辑）
- 保持容器：`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3`

**Step 2: Run tests**
Run: `pnpm -C frontend test`
Expected: PASS

---

### Task 5: 告警中心替换统计卡（保持 7 卡/7 列布局不变）

**Files:**
- Modify: `frontend/src/features/alerts/components/AlertStatsGrid.tsx`

**Step 1: Replace CardShell**
- 用 `CompactStatCard` 统一每张卡的内边距/字体/图标块规格
- 仍保留点击筛选能力（`onCardClick`）
- 保持容器：`grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3`
- 趋势行保持不变

**Step 2: Run tests**
Run: `pnpm -C frontend test`
Expected: PASS

---

### Task 6: 日志中心替换统计卡（保持 4 卡/4 列布局不变）

**Files:**
- Modify: `frontend/src/features/logs/components/LogStatsGrid.tsx`

**Step 1: Replace StatCard usage**
- 用 `CompactStatCard` 替换 `StatCard`
- 保持容器：`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4`

**Step 2: Run tests**
Run: `pnpm -C frontend test`
Expected: PASS

---

### Task 7: 报表分析替换快速统计卡（保持 4 卡 + flex 布局不变）

**Files:**
- Modify: `frontend/src/features/reports/components/ReportsView.tsx`

**Step 1: Replace inline Card blocks**
- 将 4 个 `Card`（`p-4 text-center` + `min-w-[120px]`）替换为 `CompactStatCard`
- 保持容器：`flex gap-3`
- 保持每张卡的 `min-w-[120px]`（只改“单卡内部”规格）

**Step 2: Run tests**
Run: `pnpm -C frontend test`
Expected: PASS

---

### Task 8: 全量校验（类型/单测）

**Files:**
- None

**Step 1: Type check**
Run: `pnpm -C frontend type-check`
Expected: PASS

**Step 2: Unit tests**
Run: `pnpm -C frontend test`
Expected: PASS

---

### Task 9（可选）: Git 提交

⚠️ 本仓库要求 `git commit` 需明确确认；若需要提交，我会在你确认后执行。

Run:
- `git add frontend/src docs/plans/2026-03-17-unify-stat-card-style.md`
- `git commit -m "style(ui): 统一统计卡片单卡样式"`
