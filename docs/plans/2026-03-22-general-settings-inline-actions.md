# General Settings Inline Actions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 将系统设置中“通用配置”页的“保存 / 重置”按钮从壳层工具条移动到“基础信息”标题同行，并保持其作用范围仍为整个通用设置页。

**Architecture:** 采用最小必要修改方案。`GeneralSettings` 不再向壳层注册动作按钮，而是将页面级保存/重置能力透传给 `BasicInfoSection`。`BasicInfoSection` 借助共享 `SectionHeader` 的动作插槽在标题同行本地渲染按钮，其余配置区块与保存逻辑保持不变。

**Tech Stack:** Next.js 15、React 19、TypeScript、Jest、Testing Library

---

### Task 1: 写失败测试锁定壳层动作移除与本地动作透传

**Files:**
- Create: `frontend/src/features/settings/components/general/__tests__/GeneralSettings.test.tsx`
- Test: `frontend/src/features/settings/components/general/__tests__/GeneralSettings.test.tsx`

**Step 1: Write the failing test**

```tsx
it('不再向壳层注册保存和重置动作，并将动作透传给基础信息区块', () => {
  render(<GeneralSettings />)

  const capabilities = mockUseSettingsTabCapabilities.mock.calls[0][1]
  expect(capabilities.primaryActions).toBeUndefined()
  expect(capabilities.secondaryActions).toBeUndefined()
  expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '重置' })).toBeInTheDocument()
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --runTestsByPath src/features/settings/components/general/__tests__/GeneralSettings.test.tsx`
Expected: FAIL，因为当前 `GeneralSettings` 仍向壳层注册动作，且未向 `BasicInfoSection` 传递本地动作。

### Task 2: 写失败测试锁定基础信息标题同行动作区

**Files:**
- Create: `frontend/src/features/settings/components/general/__tests__/BasicInfoSection.test.tsx`
- Test: `frontend/src/features/settings/components/general/__tests__/BasicInfoSection.test.tsx`

**Step 1: Write the failing test**

```tsx
it('在基础信息标题同行渲染保存和重置按钮', async () => {
  render(<BasicInfoSection {...props} actions={actions} />)

  expect(screen.getByRole('group', { name: '基础信息操作' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '保存' })).toBeInTheDocument()
  expect(screen.getByRole('button', { name: '重置' })).toBeInTheDocument()
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --runTestsByPath src/features/settings/components/general/__tests__/BasicInfoSection.test.tsx`
Expected: FAIL，因为当前 `BasicInfoSection` 与 `SectionHeader` 还不支持动作区。

### Task 3: 最小实现通用设置页按钮内联

**Files:**
- Modify: `frontend/src/features/settings/components/general/GeneralSettings.tsx`
- Modify: `frontend/src/features/settings/components/general/BasicInfoSection.tsx`
- Modify: `frontend/src/features/settings/components/shared/SectionHeader.tsx`
- Optional Modify: `frontend/src/features/settings/registry/settings-tabs.tsx`
- Test: `frontend/src/features/settings/components/general/__tests__/GeneralSettings.test.tsx`
- Test: `frontend/src/features/settings/components/general/__tests__/BasicInfoSection.test.tsx`

**Step 1: Write minimal implementation**

```tsx
// GeneralSettings:
useSettingsTabCapabilities('general', {
  dirty: isDirty,
  saving: isSaving,
  blockLeave: Boolean(isDirty),
})

<BasicInfoSection
  data={basicInfo}
  onChange={updateBasicInfo}
  actions={{
    isDirty,
    isSaving,
    onSave: handleSave,
    onReset: handleReset,
  }}
/>
```

```tsx
// BasicInfoSection:
<SectionHeader
  title="基础信息"
  description="系统的基本信息配置"
  icon="Info"
  actions={
    <div role="group" aria-label="基础信息操作">
      ...
    </div>
  }
/>
```

**Step 2: Run tests to verify they pass**

Run: `pnpm test -- --runTestsByPath src/features/settings/components/general/__tests__/GeneralSettings.test.tsx src/features/settings/components/general/__tests__/BasicInfoSection.test.tsx`
Expected: PASS，确认按钮不再由壳层动作条输出，且基础信息标题同行显示正确动作按钮。

### Task 4: 做定向回归验证

**Files:**
- Modify: 无
- Test: 上述测试文件

**Step 1: Run type check**

Run: `pnpm type-check`
Expected: PASS

**Step 2: Run browser-level verification**

Run: 手动打开 `/settings`
Expected: 通用配置页顶部独立动作条消失，“基础信息”标题同行显示“重置 / 保存”。

### Task 5: 交付说明

**Files:**
- Modify: 无

**Step 1: Summarize verified scope**

Run: 无
Expected: 明确说明已验证项、未验证项，以及按钮虽然位于“基础信息”区块但仍作用于整个“通用配置”页。
