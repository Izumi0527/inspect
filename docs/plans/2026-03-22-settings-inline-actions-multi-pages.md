# Settings Inline Actions Multi Pages Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将系统设置中的日志设置、安全策略、备份管理、通知中心四个子分页的页面级功能按钮从壳层独立模块下移到各自首个主要配置模块标题同行，同时保持按钮职责不变。

**Architecture:** 沿用通用配置的实现模式。页面层保留原有业务逻辑和脏状态管理，但不再把动作按钮注册给壳层；改为把动作透传给首个模块，再通过 `SectionHeader.actions` 在本地渲染。日志设置因首个模块未抽离且额外动作较多，需要单独收口。

**Tech Stack:** Next.js 15、React 19、TypeScript、Jest、Testing Library、Playwright

---

### Task 1: 为三个标准页写失败测试

**Files:**
- Create: `frontend/src/features/settings/components/__tests__/SettingsInlineActions.standard-pages.test.tsx`
- Test: `frontend/src/features/settings/components/__tests__/SettingsInlineActions.standard-pages.test.tsx`

**Step 1: Write the failing test**

```tsx
it('安全策略/备份管理/通知中心不再向壳层注册按钮，并把动作传给首个模块', () => {
  render(<SecuritySettings />)
  render(<BackupManagement />)
  render(<NotificationSettings />)

  expect(capabilities.primaryActions).toBeUndefined()
  expect(capabilities.secondaryActions).toBeUndefined()
  expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '重置' })).toBeInTheDocument()
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --runTestsByPath src/features/settings/components/__tests__/SettingsInlineActions.standard-pages.test.tsx`
Expected: FAIL，因为三个页面当前仍向壳层注册动作，首个模块还没有本地动作区。

### Task 2: 为日志设置写失败测试

**Files:**
- Create: `frontend/src/features/settings/components/__tests__/LogsInlineActions.test.tsx`
- Test: `frontend/src/features/settings/components/__tests__/LogsInlineActions.test.tsx`

**Step 1: Write the failing test**

```tsx
it('日志设置将保存/应用配置/重置/刷新状态/立即清理下移到数据保留标题同行', () => {
  render(<LogsSettings />)

  expect(capabilities.primaryActions).toBeUndefined()
  expect(capabilities.secondaryActions).toBeUndefined()
  expect(screen.getByRole('group', { name: '数据保留操作' })).toBeInTheDocument()
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --runTestsByPath src/features/settings/components/__tests__/LogsInlineActions.test.tsx`
Expected: FAIL，因为日志设置仍使用壳层工具条且文案仍引用“顶部工具栏”。

### Task 3: 实现三个标准页迁移

**Files:**
- Modify: `frontend/src/features/settings/components/security/SecuritySettings.tsx`
- Modify: `frontend/src/features/settings/components/security/SessionManagementSection.tsx`
- Modify: `frontend/src/features/settings/components/backup/BackupManagement.tsx`
- Modify: `frontend/src/features/settings/components/backup/BackupConfigSection.tsx`
- Modify: `frontend/src/features/settings/components/notifications/NotificationSettings.tsx`
- Modify: `frontend/src/features/settings/components/notifications/EmailNotificationSection.tsx`
- Modify: `frontend/src/features/settings/registry/settings-tabs.tsx`
- Test: `frontend/src/features/settings/components/__tests__/SettingsInlineActions.standard-pages.test.tsx`

**Step 1: Write minimal implementation**

```tsx
useSettingsTabCapabilities('security', {
  dirty: isDirty,
  saving: isSaving,
  blockLeave: isDirty,
})

<SessionManagementSection
  data={sessionManagement}
  onChange={updateSessionManagement}
  actions={{
    isDirty,
    isSaving,
    onSave: handleSave,
    onReset: handleReset,
  }}
/>
```

**Step 2: Run focused test**

Run: `pnpm test -- --runTestsByPath src/features/settings/components/__tests__/SettingsInlineActions.standard-pages.test.tsx`
Expected: PASS

### Task 4: 实现日志设置迁移

**Files:**
- Modify: `frontend/src/features/settings/components/logs/LogsSettings.tsx`
- Optional Create: `frontend/src/features/settings/components/logs/LogsRetentionSection.tsx`
- Modify: `frontend/src/features/settings/registry/settings-tabs.tsx`
- Test: `frontend/src/features/settings/components/__tests__/LogsInlineActions.test.tsx`

**Step 1: Write minimal implementation**

```tsx
useSettingsTabCapabilities('logs', {
  dirty: isDirty,
  saving,
  blockLeave: Boolean(isDirty),
})

<SectionHeader
  title="数据保留"
  actions={<div role="group" aria-label="数据保留操作">...</div>}
/>
```

并同步把“顶部工具栏”相关说明文案改为当前位置描述。

**Step 2: Run focused test**

Run: `pnpm test -- --runTestsByPath src/features/settings/components/__tests__/LogsInlineActions.test.tsx`
Expected: PASS

### Task 5: 做聚焦验证与浏览器回归

**Files:**
- Modify: 无

**Step 1: Run all focused tests**

Run: `pnpm test -- --runTestsByPath src/features/settings/components/__tests__/SettingsInlineActions.standard-pages.test.tsx src/features/settings/components/__tests__/LogsInlineActions.test.tsx`
Expected: PASS

**Step 2: Run type check**

Run: `pnpm type-check`
Expected: PASS

**Step 3: Browser verification**

Run: 打开 `/settings`
Expected:
- 四个子分页顶部独立按钮模块均消失
- 按钮改到首个模块标题同行
- 修改字段后按钮启用、重置后恢复禁用

### Task 6: 交付说明

**Files:**
- Modify: 无

**Step 1: Summarize verified scope**

Run: 无
Expected: 明确说明四页按钮位置已下移，但仍各自作用于整页对应子分页。
