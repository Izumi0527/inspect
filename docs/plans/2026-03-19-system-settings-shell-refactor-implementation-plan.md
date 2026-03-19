# 系统设置框架层统一重构 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 基于 `docs/features/settings/system-settings-uiux-current.md` 中 `4.11/4.12` 的方案，将 `/settings` 9 个子分页重构为“壳层统一、内容自治”的前端架构，统一导航、工具栏、统计区、状态条、危险确认与未保存离开拦截，同时保持现有业务功能不回归。

**Architecture:** 采用“Route Layer + Page Shell Layer + Tab Registry Layer + Capabilities Layer + Feature/Data Layer”五层模型。页面容器通过注册表驱动 Tab 元数据、权限、滚动模式与页面类型；各子页通过 capabilities 向壳层上报 `dirty/saving/stats/actions/banners` 等页面级能力，由壳层统一编排 `TabNav / Toolbar / Stats / Banners / Confirm / LeaveGuard / ContentViewport`。

**Tech Stack:** Next.js(App Router) + React Query + Jest + Testing Library + Tailwind + shadcn/ui。

---

## 0. 前置参考与实施约束

### 0.1 设计与参考基线

- 设计基线：`docs/features/settings/system-settings-uiux-current.md`
- 报表分析页参考：
  - `frontend/src/app/reports/page.tsx`
  - `frontend/src/features/reports/components/ReportsView.tsx`
  - `docs/flows/reports-analysis-flow.md`

### 0.2 实施边界

- 本计划聚焦前端框架层重构，不改动后端 API 语义。
- 本计划不一次性重写 9 个业务子页，而是分阶段迁移。
- 每个阶段都必须满足：
  - 单独可验证
  - 单独可回滚
  - 不要求后续阶段完成才能上线当前阶段

### 0.3 推荐阶段顺序

1. 先建类型、注册表、壳层骨架
2. 再迁移配置类页面（最容易标准化）
3. 再统一危险操作与离开拦截
4. 再迁移列表类页面的统计区与工具栏
5. 最后迁移监控页和共享组件 A11y

---

## 1. 验收标准（全局）

- `/settings` 仍由现有路由入口与权限守卫控制，9 个 Tab 功能不回归。
- Tab 元数据、权限过滤、滚动模式不再散落在 `SettingsView.tsx` 中硬编码。
- 表单配置类 Tab 支持统一的“保存/重置/未保存更改提示/离开拦截”。
- 危险动作不再依赖 `window.confirm`，改用统一确认对话框基础设施。
- 列表类 Tab 的统计卡与工具栏支持由壳层统一承载。
- `monitoring` 在保持 dashboard 形态的前提下接入统一状态条与工具栏能力。
- 壳层与共享组件补齐关键 A11y：Tab 语义、icon-only button `aria-label`、表单 `id/htmlFor/aria-describedby`。

---

## 2. 任务拆解（按阶段实施）

### Task 1：建立壳层类型与注册表基础

**进度：** ✅ 已完成（与 Task 2 合并提交：388ea5a）

**Files:**
- Create: `frontend/src/features/settings/types/shell.types.ts`
- Create: `frontend/src/features/settings/registry/settings-tabs.tsx`
- Modify: `frontend/src/features/settings/components/SettingsView.tsx`
- Test: `tests/frontend/settings/shell/settingsTabRegistry.test.ts`

**Step 1: Write the failing test**

新增 `tests/frontend/settings/shell/settingsTabRegistry.test.ts`，断言：
- 注册表包含 9 个 Tab key
- 每个 Tab 都具有 `label/icon/description/requiredPermissions/kind/scrollMode`
- `users/roles/audit` 的 `scrollMode` 与当前页面行为一致

**Step 2: Run test to verify it fails**

Run: `pnpm -C frontend test -- --runInBand tests/frontend/settings/shell/settingsTabRegistry.test.ts`

Expected: FAIL（注册表文件尚不存在）

**Step 3: Write minimal implementation**

- 在 `shell.types.ts` 定义：
  - `SettingsPageKind`
  - `SettingsScrollMode`
  - `SettingsToolbarMode`
  - `SettingsTabDescriptor`
  - `SettingsPageAction`
  - `SettingsStatCardDescriptor`
  - `SettingsBannerDescriptor`
  - `SettingsToolbarDescriptor`
  - `SettingsTabCapabilities`
- 在 `settings-tabs.tsx` 建立 9 个子分页的 descriptor 列表
- 在 `SettingsView.tsx` 中先把当前内联 tabs 元数据迁移到 registry，但保持现有渲染逻辑不变

**Step 4: Run test to verify it passes**

Run: `pnpm -C frontend test -- --runInBand tests/frontend/settings/shell/settingsTabRegistry.test.ts`

Expected: PASS

**Step 5: Commit**

```bash
git add docs/plans/2026-03-19-system-settings-shell-refactor-implementation-plan.md frontend/src/features/settings/types/shell.types.ts frontend/src/features/settings/registry/settings-tabs.tsx frontend/src/features/settings/components/SettingsView.tsx tests/frontend/settings/shell/settingsTabRegistry.test.ts
git commit -m "refactor(settings): 引入系统设置壳层类型与注册表" -m "新增 settings 壳层类型定义与 Tab 注册表。将 SettingsView 的内联 tabs 元数据迁移为统一注册表来源，为后续壳层重构做基础准备。补充注册表结构测试，确保 9 个子分页元数据完整。"
```

---

### Task 2：搭建壳层骨架与导航状态管理

**进度：** ✅ 已完成（与 Task 1 合并提交：388ea5a）

**Files:**
- Create: `frontend/src/features/settings/shell/SettingsPageShell.tsx`
- Create: `frontend/src/features/settings/shell/SettingsWorkbenchCard.tsx`
- Create: `frontend/src/features/settings/shell/SettingsContentViewport.tsx`
- Create: `frontend/src/features/settings/hooks/useSettingsTabNavigation.ts`
- Modify: `frontend/src/features/settings/components/SettingsView.tsx`
- Test: `tests/frontend/settings/shell/SettingsPageShell.navigation.test.tsx`

**Step 1: Write the failing test**

新增 `SettingsPageShell.navigation.test.tsx`，覆盖：
- URL `?tab=` 合法时渲染对应子页
- URL `?tab=` 非法或不可见时自动纠偏
- 用户点击 Tab 时更新 URL

**Step 2: Run test to verify it fails**

Run: `pnpm -C frontend test -- --runInBand tests/frontend/settings/shell/SettingsPageShell.navigation.test.tsx`

Expected: FAIL（壳层组件尚不存在）

**Step 3: Write minimal implementation**

- `useSettingsTabNavigation.ts` 负责：
  - 解析 URL `tab`
  - 权限过滤后的纠偏
  - 区分 `replace`（纠偏）与 `push`（用户点击）
- `SettingsWorkbenchCard.tsx` 提供统一主工作区 Card 容器
- `SettingsContentViewport.tsx` 根据 `scrollMode` 控制内容区滚动方式
- `SettingsPageShell.tsx` 负责：
  - 可见 tabs 计算
  - activeTab 推导
  - 挂载当前子页
- `SettingsView.tsx` 改为只渲染 `SettingsPageShell`

**Step 4: Run test to verify it passes**

Run:
- `pnpm -C frontend test -- --runInBand tests/frontend/settings/shell/SettingsPageShell.navigation.test.tsx`
- `pnpm -C frontend test -- --runInBand tests/frontend/settings/SettingsView.urlSync.test.tsx`
- `pnpm -C frontend test -- --runInBand tests/frontend/settings/SettingsView.permissionsVisibility.test.tsx`

Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/features/settings/shell/SettingsPageShell.tsx frontend/src/features/settings/shell/SettingsWorkbenchCard.tsx frontend/src/features/settings/shell/SettingsContentViewport.tsx frontend/src/features/settings/hooks/useSettingsTabNavigation.ts frontend/src/features/settings/components/SettingsView.tsx tests/frontend/settings/shell/SettingsPageShell.navigation.test.tsx
git commit -m "refactor(settings): 引入系统设置壳层骨架与导航状态" -m "新增 SettingsPageShell、WorkbenchCard、ContentViewport 与 tab 导航 hook。SettingsView 调整为壳层入口，保留现有 9 个子分页业务内容不变。补充 URL(tab) 与权限纠偏测试。"
```

---

### Task 3：实现壳层上下文与能力上报机制

**进度：** ✅ 已完成（与 Task 4 合并提交：42c153d）

**Files:**
- Create: `frontend/src/features/settings/context/SettingsShellContext.tsx`
- Create: `frontend/src/features/settings/hooks/useSettingsTabCapabilities.ts`
- Create: `frontend/src/features/settings/hooks/useSettingsShellState.ts`
- Create: `frontend/src/features/settings/hooks/useSettingsLeaveGuard.ts`
- Create: `frontend/src/features/settings/shell/SettingsLeaveGuard.tsx`
- Test: `tests/frontend/settings/shell/SettingsTabCapabilities.test.tsx`
- Test: `tests/frontend/settings/shell/SettingsLeaveGuard.test.tsx`

**Step 1: Write the failing tests**

新增测试覆盖：
- 子页可向壳层上报 `dirty/saving/stats/actions/banners`
- 切换 Tab 时如果 `blockLeave=true` 会触发离开拦截

**Step 2: Run tests to verify they fail**

Run:
- `pnpm -C frontend test -- --runInBand tests/frontend/settings/shell/SettingsTabCapabilities.test.tsx`
- `pnpm -C frontend test -- --runInBand tests/frontend/settings/shell/SettingsLeaveGuard.test.tsx`

Expected: FAIL

**Step 3: Write minimal implementation**

- `SettingsShellContext.tsx` 提供：
  - 当前 active tab
  - `setCapabilities(tabKey, caps)`
  - `clearCapabilities(tabKey)`
- `useSettingsTabCapabilities.ts` 供子页调用，自动在 mount/update/unmount 时同步能力
- `useSettingsShellState.ts` 汇总当前 descriptor 与 activeTab capabilities
- `useSettingsLeaveGuard.ts` 处理离开拦截状态
- `SettingsLeaveGuard.tsx` 作为壳层级离开守卫组件

**Step 4: Run tests to verify they pass**

Run:
- `pnpm -C frontend test -- --runInBand tests/frontend/settings/shell/SettingsTabCapabilities.test.tsx`
- `pnpm -C frontend test -- --runInBand tests/frontend/settings/shell/SettingsLeaveGuard.test.tsx`

Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/features/settings/context/SettingsShellContext.tsx frontend/src/features/settings/hooks/useSettingsTabCapabilities.ts frontend/src/features/settings/hooks/useSettingsShellState.ts frontend/src/features/settings/hooks/useSettingsLeaveGuard.ts frontend/src/features/settings/shell/SettingsLeaveGuard.tsx tests/frontend/settings/shell/SettingsTabCapabilities.test.tsx tests/frontend/settings/shell/SettingsLeaveGuard.test.tsx
git commit -m "refactor(settings): 建立壳层能力上报与离开守卫" -m "新增 Settings 壳层上下文、capabilities 上报 hook 与 leave guard。容器可以感知子页 dirty、saving、stats、actions 等页面级能力，为后续统一工具栏与动作区做准备，并补充拦截测试。"
```

---

### Task 4：实现统一 TabNav、Toolbar、Stats 与 Banner 组件

**进度：** ✅ 已完成（与 Task 3 合并提交：42c153d）

**Files:**
- Create: `frontend/src/features/settings/shell/SettingsTabNav.tsx`
- Create: `frontend/src/features/settings/shell/SettingsToolbar.tsx`
- Create: `frontend/src/features/settings/shell/SettingsStatsStrip.tsx`
- Create: `frontend/src/features/settings/shell/SettingsStatusBannerStack.tsx`
- Modify: `frontend/src/features/settings/shell/SettingsPageShell.tsx`
- Test: `tests/frontend/settings/shell/SettingsTabNav.test.tsx`
- Test: `tests/frontend/settings/shell/SettingsToolbar.test.tsx`
- Test: `tests/frontend/settings/shell/SettingsStatsStrip.test.tsx`

**Step 1: Write the failing tests**

覆盖：
- TabNav 具备 `tablist/tab/aria-selected/aria-controls`
- Toolbar 支持 search、actions、空状态
- StatsStrip 正确渲染 `CompactStatCard`

**Step 2: Run tests to verify they fail**

Run:
- `pnpm -C frontend test -- --runInBand tests/frontend/settings/shell/SettingsTabNav.test.tsx`
- `pnpm -C frontend test -- --runInBand tests/frontend/settings/shell/SettingsToolbar.test.tsx`
- `pnpm -C frontend test -- --runInBand tests/frontend/settings/shell/SettingsStatsStrip.test.tsx`

Expected: FAIL

**Step 3: Write minimal implementation**

- `SettingsTabNav.tsx`：
  - 统一渲染 tabs
  - 内建 focus-visible 与键盘左右切换
- `SettingsToolbar.tsx`：
  - 统一搜索框、筛选区、主次动作
- `SettingsStatsStrip.tsx`：
  - 统一渲染统计卡条带
- `SettingsStatusBannerStack.tsx`：
  - 渲染 info/warning/danger/success 提示条
- `SettingsPageShell.tsx` 组合这些壳层组件

**Step 4: Run tests to verify they pass**

Run:
- `pnpm -C frontend test -- --runInBand tests/frontend/settings/shell/SettingsTabNav.test.tsx`
- `pnpm -C frontend test -- --runInBand tests/frontend/settings/shell/SettingsToolbar.test.tsx`
- `pnpm -C frontend test -- --runInBand tests/frontend/settings/shell/SettingsStatsStrip.test.tsx`

Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/features/settings/shell/SettingsTabNav.tsx frontend/src/features/settings/shell/SettingsToolbar.tsx frontend/src/features/settings/shell/SettingsStatsStrip.tsx frontend/src/features/settings/shell/SettingsStatusBannerStack.tsx frontend/src/features/settings/shell/SettingsPageShell.tsx tests/frontend/settings/shell/SettingsTabNav.test.tsx tests/frontend/settings/shell/SettingsToolbar.test.tsx tests/frontend/settings/shell/SettingsStatsStrip.test.tsx
git commit -m "refactor(settings): 新增统一导航工具栏与统计区组件" -m "实现 Settings TabNav、Toolbar、StatsStrip、StatusBannerStack，并接入 SettingsPageShell。统一 9 个子分页的壳层布局与交互语义，补充关键组件测试。"
```

---

### Task 5：迁移配置类页面到壳层动作区

**进度：** ✅ 已完成（已提交：e02918e）

**Files:**
- Modify: `frontend/src/features/settings/components/general/GeneralSettings.tsx`
- Modify: `frontend/src/features/settings/components/security/SecuritySettings.tsx`
- Modify: `frontend/src/features/settings/components/notifications/NotificationSettings.tsx`
- Modify: `frontend/src/features/settings/components/backup/BackupManagement.tsx`
- Test: `tests/frontend/settings/general/GeneralSettings.actions.test.tsx`
- Create: `tests/frontend/settings/security/SecuritySettings.shellActions.test.tsx`
- Create: `tests/frontend/settings/notifications/NotificationSettings.shellActions.test.tsx`
- Create: `tests/frontend/settings/backup/BackupManagement.shellActions.test.tsx`

**Step 1: Write the failing tests**

针对 4 个配置类页面，断言：
- 不再直接渲染顶部 `ActionButtons`
- 通过 capabilities 向壳层上报：
  - `dirty`
  - `saving`
  - `primaryActions=[保存]`
  - `secondaryActions=[重置]`
  - `blockLeave=true`

**Step 2: Run tests to verify they fail**

Run:
- `pnpm -C frontend test -- --runInBand tests/frontend/settings/general/GeneralSettings.actions.test.tsx`
- `pnpm -C frontend test -- --runInBand tests/frontend/settings/security/SecuritySettings.shellActions.test.tsx`
- `pnpm -C frontend test -- --runInBand tests/frontend/settings/notifications/NotificationSettings.shellActions.test.tsx`
- `pnpm -C frontend test -- --runInBand tests/frontend/settings/backup/BackupManagement.shellActions.test.tsx`

Expected: FAIL

**Step 3: Write minimal implementation**

- 删除上述 4 页顶部 `ActionButtons` 的直接渲染
- 在各自组件中使用 `useSettingsTabCapabilities`
- 把保存/重置按钮迁移为壳层 actions
- 配置页内容仅保留 sections 与内容体

**Step 4: Run tests to verify they pass**

Run same commands as Step 2

Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/features/settings/components/general/GeneralSettings.tsx frontend/src/features/settings/components/security/SecuritySettings.tsx frontend/src/features/settings/components/notifications/NotificationSettings.tsx frontend/src/features/settings/components/backup/BackupManagement.tsx tests/frontend/settings/general/GeneralSettings.actions.test.tsx tests/frontend/settings/security/SecuritySettings.shellActions.test.tsx tests/frontend/settings/notifications/NotificationSettings.shellActions.test.tsx tests/frontend/settings/backup/BackupManagement.shellActions.test.tsx
git commit -m "refactor(settings): 配置类页面迁移到壳层动作区" -m "General、Security、Notifications、Backup 不再直接渲染顶部 ActionButtons，改为向壳层上报保存、重置与离开拦截能力。统一配置类页面的动作位置与交互节奏，并补充迁移测试。"
```

---

### Task 6：迁移日志页与统一危险确认基础设施

**进度：** ✅ 已完成（已提交：81d7c65）

**Files:**
- Create: `frontend/src/features/settings/shell/SettingsConfirmDialog.tsx`
- Modify: `frontend/src/features/settings/components/logs/LogsSettings.tsx`
- Modify: `frontend/src/features/settings/components/backup/BackupHistorySection.tsx`
- Modify: `frontend/src/features/settings/components/users/UserManagement.tsx`
- Modify: `frontend/src/features/settings/components/roles/RoleManagement.tsx`
- Test: `tests/frontend/settings/logs/LogsSettings.shellActions.test.tsx`
- Create: `tests/frontend/settings/shell/SettingsConfirmDialog.test.tsx`

**Step 1: Write the failing tests**

覆盖：
- `LogsSettings` 通过壳层上报“保存 / 应用配置 / 刷新状态 / 清理”
- `SettingsConfirmDialog` 可承接危险确认而不是 `window.confirm`

**Step 2: Run tests to verify they fail**

Run:
- `pnpm -C frontend test -- --runInBand tests/frontend/settings/logs/LogsSettings.shellActions.test.tsx`
- `pnpm -C frontend test -- --runInBand tests/frontend/settings/shell/SettingsConfirmDialog.test.tsx`

Expected: FAIL

**Step 3: Write minimal implementation**

- 实现统一 `SettingsConfirmDialog`
- `LogsSettings`：
  - 保存和应用配置迁移到壳层动作区
  - 清理与刷新状态迁移到统一 secondary actions
- 将 `backup/users/roles` 的关键危险操作从 `window.confirm` 迁移到统一确认基础设施

**Step 4: Run tests to verify they pass**

Run same commands as Step 2

Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/features/settings/shell/SettingsConfirmDialog.tsx frontend/src/features/settings/components/logs/LogsSettings.tsx frontend/src/features/settings/components/backup/BackupHistorySection.tsx frontend/src/features/settings/components/users/UserManagement.tsx frontend/src/features/settings/components/roles/RoleManagement.tsx tests/frontend/settings/logs/LogsSettings.shellActions.test.tsx tests/frontend/settings/shell/SettingsConfirmDialog.test.tsx
git commit -m "refactor(settings): 统一危险确认与日志页动作编排" -m "新增 SettingsConfirmDialog 替代散落的 window.confirm。日志设置迁移到壳层动作模型，并开始统一备份、用户、角色页的危险操作确认方式与 loading 反馈。"
```

---

### Task 7：迁移列表类页面的统计区与工具栏

**进度：** ✅ 已完成（已提交：81d7c65, 113d554）

**Files:**
- Modify: `frontend/src/features/settings/components/users/UserManagement.tsx`
- Modify: `frontend/src/features/settings/components/roles/RoleManagement.tsx`
- Modify: `frontend/src/features/settings/components/audit/AuditLogs.tsx`
- Create: `tests/frontend/settings/users/UserManagement.shellToolbar.test.tsx`
- Create: `tests/frontend/settings/roles/RoleManagement.shellToolbar.test.tsx`
- Create: `tests/frontend/settings/audit/AuditLogs.shellToolbar.test.tsx`

**Step 1: Write the failing tests**

覆盖：
- `users/roles/audit` 的 stats、搜索框、刷新/导出等能力由壳层渲染
- 子页只保留表格主体和弹窗主体

**Step 2: Run tests to verify they fail**

Run:
- `pnpm -C frontend test -- --runInBand tests/frontend/settings/users/UserManagement.shellToolbar.test.tsx`
- `pnpm -C frontend test -- --runInBand tests/frontend/settings/roles/RoleManagement.shellToolbar.test.tsx`
- `pnpm -C frontend test -- --runInBand tests/frontend/settings/audit/AuditLogs.shellToolbar.test.tsx`

Expected: FAIL

**Step 3: Write minimal implementation**

- `users`：
  - stats 上报给 `SettingsStatsStrip`
  - 搜索 / 添加用户上报给 `SettingsToolbar`
- `roles`：
  - stats 上报
  - 搜索 / 刷新 / 新建角色迁移到壳层
- `audit`：
  - stats 上报
  - 搜索 / 导出迁移到壳层

**Step 4: Run tests to verify they pass**

Run same commands as Step 2

Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/features/settings/components/users/UserManagement.tsx frontend/src/features/settings/components/roles/RoleManagement.tsx frontend/src/features/settings/components/audit/AuditLogs.tsx tests/frontend/settings/users/UserManagement.shellToolbar.test.tsx tests/frontend/settings/roles/RoleManagement.shellToolbar.test.tsx tests/frontend/settings/audit/AuditLogs.shellToolbar.test.tsx
git commit -m "refactor(settings): 列表类页面迁移统计区与工具栏" -m "Users、Roles、Audit 的统计卡、搜索框与主操作按钮迁移到壳层统一位置。保留表格与弹窗业务内容，统一页面节奏并补充壳层工具栏测试。"
```

---

### Task 8：迁移监控页并统一状态横幅

**进度：** ✅ 已完成（已提交：113d554）

**Files:**
- Modify: `frontend/src/features/settings/components/monitoring/MonitoringDashboard.tsx`
- Modify: `frontend/src/features/settings/hooks/useSystemMonitoring.ts`
- Test: `tests/frontend/settings/monitoring/MonitoringDashboard.errorState.test.tsx`
- Create: `tests/frontend/settings/monitoring/MonitoringDashboard.shellStatus.test.tsx`

**Step 1: Write the failing test**

覆盖：
- `monitoring` 可向壳层上报：
  - 最近刷新时间
  - 自动刷新状态
  - 刷新失败但仍显示旧数据的提示
- 工具栏可承接“重试 / 暂停刷新 / 恢复刷新”

**Step 2: Run test to verify it fails**

Run:
- `pnpm -C frontend test -- --runInBand tests/frontend/settings/monitoring/MonitoringDashboard.errorState.test.tsx`
- `pnpm -C frontend test -- --runInBand tests/frontend/settings/monitoring/MonitoringDashboard.shellStatus.test.tsx`

Expected: FAIL

**Step 3: Write minimal implementation**

- `useSystemMonitoring.ts` 暴露刷新时间与刷新状态
- `MonitoringDashboard.tsx` 上报 banners 与 actions
- 保持 dashboard 内容结构不变，仅迁移框架层状态能力

**Step 4: Run test to verify it passes**

Run same commands as Step 2

Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/features/settings/components/monitoring/MonitoringDashboard.tsx frontend/src/features/settings/hooks/useSystemMonitoring.ts tests/frontend/settings/monitoring/MonitoringDashboard.errorState.test.tsx tests/frontend/settings/monitoring/MonitoringDashboard.shellStatus.test.tsx
git commit -m "refactor(settings): 监控页接入壳层状态与工具栏" -m "MonitoringDashboard 保持 dashboard 形态不变，同时向壳层上报刷新时间、自动刷新状态与重试动作，使监控页纳入统一状态横幅与工具栏体系。"
```

---

### Task 9：收敛共享组件与可访问性治理

**进度：** ✅ 已完成（已提交：d5aaa1a）

**Files:**
- Modify: `frontend/src/features/settings/components/shared/EmptyState.tsx`
- Modify: `frontend/src/features/settings/components/shared/ConfigItem.tsx`
- Modify: `frontend/src/features/settings/components/shared/ConfigInput.tsx`
- Modify: `frontend/src/features/settings/components/shared/ConfigSelect.tsx`
- Modify: `frontend/src/features/settings/components/shared/ConfigSwitch.tsx`
- Modify: `frontend/src/features/settings/shell/SettingsTabNav.tsx`
- Modify: `frontend/src/features/settings/components/users/UserManagement.tsx`
- Modify: `frontend/src/features/settings/components/roles/RoleManagement.tsx`
- Modify: `frontend/src/features/settings/components/backup/BackupHistorySection.tsx`
- Test: `tests/frontend/settings/shared/ConfigItem.a11y.test.tsx`
- Test: `tests/frontend/settings/shell/SettingsTabNav.a11y.test.tsx`
- Test: `tests/frontend/settings/shared/EmptyState.test.tsx`

**Step 1: Write the failing tests**

覆盖：
- `ConfigItem/ConfigInput/ConfigSelect/ConfigSwitch` 建立 `id/htmlFor/aria-describedby`
- `SettingsTabNav` 具备完整 tab 语义和键盘切换
- icon-only 按钮具备 `aria-label`
- `EmptyState` 复用统一 Button 体系

**Step 2: Run tests to verify they fail**

Run:
- `pnpm -C frontend test -- --runInBand tests/frontend/settings/shared/ConfigItem.a11y.test.tsx`
- `pnpm -C frontend test -- --runInBand tests/frontend/settings/shell/SettingsTabNav.a11y.test.tsx`
- `pnpm -C frontend test -- --runInBand tests/frontend/settings/shared/EmptyState.test.tsx`

Expected: FAIL

**Step 3: Write minimal implementation**

- `Config*` 组件支持 `id` 透传与描述关联
- `EmptyState` action 改用统一 Button
- `users/roles/backup` 的 icon-only 按钮补 `aria-label`
- `SettingsTabNav` 完成键盘导航与焦点态

**Step 4: Run tests to verify they pass**

Run same commands as Step 2

Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/features/settings/components/shared/EmptyState.tsx frontend/src/features/settings/components/shared/ConfigItem.tsx frontend/src/features/settings/components/shared/ConfigInput.tsx frontend/src/features/settings/components/shared/ConfigSelect.tsx frontend/src/features/settings/components/shared/ConfigSwitch.tsx frontend/src/features/settings/shell/SettingsTabNav.tsx frontend/src/features/settings/components/users/UserManagement.tsx frontend/src/features/settings/components/roles/RoleManagement.tsx frontend/src/features/settings/components/backup/BackupHistorySection.tsx tests/frontend/settings/shared/ConfigItem.a11y.test.tsx tests/frontend/settings/shell/SettingsTabNav.a11y.test.tsx tests/frontend/settings/shared/EmptyState.test.tsx
git commit -m "refactor(settings): 收敛共享组件并补齐可访问性" -m "统一 EmptyState、Config 组件、TabNav 与 icon-only 按钮的可访问性语义，补齐 id/htmlFor/aria-label/focus-visible 等基础能力，为系统设置页长期维护提供框架层兜底。"
```

---

## 3. 综合回归任务

### Task 10：全量回归与文档同步

**进度：** ✅ 已完成（已通过 `pnpm -C frontend test -- --runInBand tests/frontend/settings` 与 `pnpm -C frontend type-check`）

**Files:**
- Modify: `docs/features/settings/system-settings-uiux-current.md`
- Test: `tests/frontend/settings/**/*`

**Step 1: Run targeted frontend tests**

Run:
- `pnpm -C frontend test -- --runInBand tests/frontend/settings`

Expected: PASS

**Step 2: Run type-check**

Run:
- `pnpm -C frontend type-check`

Expected: PASS

**Step 3: Manual smoke checklist**

手工验证：
- `/settings?tab=general` 保存/重置/离开拦截
- `/settings?tab=logs` 保存/应用/清理
- `/settings?tab=users` 搜索/添加用户/行内操作
- `/settings?tab=roles` 搜索/新建/权限分配弹窗
- `/settings?tab=audit` 搜索/导出
- `/settings?tab=backup` 手动备份/恢复/删除
- `/settings?tab=notifications` 保存/测试发送
- `/settings?tab=monitoring` 重试/自动刷新状态

**Step 4: Update docs**

将 `docs/features/settings/system-settings-uiux-current.md` 中：
- 4.11 标记为“已进入实施”
- 4.12 标记阶段完成情况
- 记录最终壳层组件与 registry 实际落地路径

**Step 5: Commit**

```bash
git add docs/features/settings/system-settings-uiux-current.md
git commit -m "docs(settings): 同步系统设置壳层重构进度与落地结果" -m "更新系统设置 UI/UX 文档中的框架层统一架构与实施状态，补充实际落地的组件、hook、注册表与验证结果，确保设计文档与代码实现保持一致。"
```

---

## 4. 风险与回滚策略

- `SettingsView.tsx` 是高风险入口文件，每次迁移后都必须先跑现有 `tests/frontend/settings/SettingsView.*` 回归。
- 配置类页面迁移到壳层动作区时，最容易引发“保存按钮丢失 / dirty 不同步 / 离开拦截误触发”，必须先完成单测再合并。
- 列表类页面迁移工具栏时，最容易出现“搜索框丢失 / 按钮位置改变 / 空态逻辑回归”，应保持表格主体不动，只迁移顶部壳层能力。
- `monitoring` 页迁移必须坚持“壳层接状态，不改 dashboard 内容密度”的原则，避免过度统一。
- 如果任一阶段出现不稳定，可回滚到前一阶段 commit；本计划设计为每一任务都具备单独提交点。

---

## 5. 完成定义（Definition of Done）

满足以下条件，视为本轮系统设置框架层统一重构完成：

- 9 个子分页均通过 `settingsTabRegistry` 描述，不再依赖散落硬编码。
- `SettingsPageShell` 成为唯一壳层入口，`SettingsView.tsx` 仅作适配。
- 配置页保存/重置/未保存提示/离开拦截统一由壳层承接。
- 列表页统计区与工具栏位置统一。
- 危险操作确认统一走 `SettingsConfirmDialog`。
- 共享组件与壳层补齐核心 A11y。
- `pnpm -C frontend type-check` 通过。
- `pnpm -C frontend test -- --runInBand tests/frontend/settings` 通过。
