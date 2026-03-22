# 报表分析页移除顶部统计卡片 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 移除报表分析页顶部四个统计卡片，并保持下方标签页与各报表子页面交互不受影响。

**Architecture:** 采用最小必要修改方案，仅调整报表页容器 `ReportsView`。先通过单测锁定“页面不再渲染统计卡片，也不再触发统计 hook”这一目标，再删除对应 JSX 与无用依赖，最后执行针对性验证。

**Tech Stack:** Next.js 15、React 19、Jest、Testing Library、TypeScript

---

### Task 1: 为报表页统计卡片移除补充失败测试

**Files:**
- Create: `frontend/src/features/reports/components/__tests__/ReportsView.test.tsx`
- Modify: 无
- Test: `frontend/src/features/reports/components/__tests__/ReportsView.test.tsx`

**Step 1: Write the failing test**

```tsx
it('不再渲染顶部统计卡片，也不再请求统计数据', () => {
  mockUseReportStats.mockReturnValue({
    data: {
      totalReports: 10,
      generatedToday: 2,
      scheduledReports: 1,
      mostUsedFormat: 'pdf',
    },
    isLoading: false,
  })

  render(<ReportsView />)

  expect(mockUseReportStats).not.toHaveBeenCalled()
  expect(screen.queryByText('总报表数')).not.toBeInTheDocument()
  expect(screen.queryByText('今日生成')).not.toBeInTheDocument()
  expect(screen.queryByText('定时报表')).not.toBeInTheDocument()
  expect(screen.queryByText('热门格式')).not.toBeInTheDocument()
})
```

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --runTestsByPath src/features/reports/components/__tests__/ReportsView.test.tsx`
Expected: FAIL，原因是 `ReportsView` 当前仍会调用 `useReportStats` 并渲染四个统计卡片标题。

### Task 2: 删除报表页顶部统计卡片实现

**Files:**
- Modify: `frontend/src/features/reports/components/ReportsView.tsx`
- Test: `frontend/src/features/reports/components/__tests__/ReportsView.test.tsx`

**Step 1: Write minimal implementation**

```tsx
// 删除 useReportStats / CompactStatCard / 对应图标引用
// 删除“快速统计卡片” JSX 区块
// 保留标签导航、搜索框、标签内容区域
```

**Step 2: Run test to verify it passes**

Run: `pnpm test -- --runTestsByPath src/features/reports/components/__tests__/ReportsView.test.tsx`
Expected: PASS，且页面仍能渲染标签按钮与默认内容。

### Task 3: 做针对性回归验证

**Files:**
- Modify: 无
- Test: `frontend/src/features/reports/components/__tests__/ReportsView.test.tsx`

**Step 1: Run targeted type-safe verification**

Run: `pnpm type-check`
Expected: PASS，确认删除无用引用后前端类型检查通过。

**Step 2: Record current delivery status**

Run: 无
Expected: 在交付说明中明确已完成项、未执行项（如未跑 E2E）与风险范围。
