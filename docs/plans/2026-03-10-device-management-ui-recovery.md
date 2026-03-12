# Device Management UI Recovery Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 清理设备管理页旧骨架与旧批量交互残留，恢复到截图 1 对应的新页面布局，同时保留真实前后端联调能力。

**Architecture:** 保留 `DeviceManagementView` 现有真实 API 数据链路，只对页面骨架、批量更新入口和模态容器进行收敛。通过先写失败测试、再最小化修改组件接线与布局，删除设备页中的旧实现残留，避免影响详情、编辑、统计、筛选和跨页选择逻辑。

**Tech Stack:** Next.js 15、React、TypeScript、Jest、Testing Library、项目自定义原子组件（Modal / Card / Table）

---

### Task 1: 固化设备页“恢复后”的 UI 行为测试

**Files:**
- Modify: `tests/frontend/devices/components/DeviceManagementView.test.tsx`
- Modify: `tests/frontend/devices/components/DeviceDetailsModal.test.tsx`

**Step 1: Write the failing test**

- 为设备管理页补充或调整测试，覆盖以下行为：
  - 点击批量更新后，出现的是模态语义下的内容，而不是页面内嵌展开区。
  - 页面仍保留现有统计卡片、操作按钮和设备列表。
  - 批量更新组件只在打开时渲染。

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --runInBand tests/frontend/devices/components/DeviceManagementView.test.tsx`

Expected: 至少有 1 个与当前旧骨架残留相关的断言失败。

**Step 3: Write minimal implementation**

- 根据失败信息，在设备管理页与批量更新组件中做最小接线调整，不提前做大范围重构。

**Step 4: Run test to verify it passes**

Run: `pnpm test -- --runInBand tests/frontend/devices/components/DeviceManagementView.test.tsx`

Expected: PASS

**Step 5: Commit**

```bash
git add tests/frontend/devices/components/DeviceManagementView.test.tsx frontend/src/features/devices/components/DeviceManagementView.tsx frontend/src/features/devices/components/BulkDeviceUpdate.tsx
git commit -m "test: lock device management ui recovery behavior"
```

### Task 2: 清理设备页中的旧批量交互残留

**Files:**
- Modify: `frontend/src/features/devices/components/DeviceManagementView.tsx`
- Modify: `frontend/src/features/devices/components/BulkDeviceUpdate.tsx`
- History (已删除): `frontend/src/features/devices/components/BulkOperationModal.tsx`（旧批量入口，当前设备页不再引用）

**Step 1: Write the failing test**

- 通过现有测试补充断言，要求设备页只保留一套批量更新入口，且批量更新组件符合当前模态体系。

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --runInBand tests/frontend/devices/components/DeviceManagementView.test.tsx tests/frontend/devices/components/DeviceDetailsModal.test.tsx`

Expected: FAIL，表明旧批量交互残留仍影响页面结构。

**Step 3: Write minimal implementation**

- 移除 `DeviceManagementView` 中不再需要的旧批量交互接线。
- 将 `BulkDeviceUpdate` 改造为基于当前 `ModalContent`/`SimpleModal` 的规范弹层。
- `BulkOperationModal` 在当前仓库中已移除；设备页主链路批量更新入口为 `DeviceManagementView` 直接渲染 `BulkDeviceUpdate`（`SimpleModal` 语义）。

**Step 4: Run test to verify it passes**

Run: `pnpm test -- --runInBand tests/frontend/devices/components/DeviceManagementView.test.tsx tests/frontend/devices/components/DeviceDetailsModal.test.tsx`

Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/features/devices/components/DeviceManagementView.tsx frontend/src/features/devices/components/BulkDeviceUpdate.tsx tests/frontend/devices/components/DeviceManagementView.test.tsx
git commit -m "refactor: remove legacy device management bulk ui"
```

### Task 3: 恢复设备页与截图 1 一致的新布局细节

**Files:**
- Modify: `frontend/src/features/devices/components/DeviceManagementView.tsx`
- Modify: `frontend/src/components/atoms/table.tsx`

**Step 1: Write the failing test**

- 为设备页补充断言，校验：
  - 顶部统计卡片文案和顺序符合当前新页面。
  - 列表头部操作区仍存在“探测本页 / 下载模板 / 批量导入 / 添加设备”。
  - 页面渲染不出现内嵌批量编辑区。

**Step 2: Run test to verify it fails**

Run: `pnpm test -- --runInBand tests/frontend/devices/components/DeviceManagementView.test.tsx tests/frontend/components/atoms/table.test.tsx`

Expected: FAIL，表明页面仍有旧版容器特征。

**Step 3: Write minimal implementation**

- 细调 `DeviceManagementView` 的卡片区、按钮区、空态区和表格包裹结构，使页面回归截图 1 所示骨架。
- 如有必要，仅做最小的 `Table` 容器适配，不改选择逻辑。

**Step 4: Run test to verify it passes**

Run: `pnpm test -- --runInBand tests/frontend/devices/components/DeviceManagementView.test.tsx tests/frontend/components/atoms/table.test.tsx`

Expected: PASS

**Step 5: Commit**

```bash
git add frontend/src/features/devices/components/DeviceManagementView.tsx frontend/src/components/atoms/table.tsx tests/frontend/devices/components/DeviceManagementView.test.tsx tests/frontend/components/atoms/table.test.tsx
git commit -m "feat: restore device management page layout"
```

### Task 4: 完整验证设备页恢复结果

**Files:**
- Verify only

**Step 1: Run targeted frontend tests**

Run:

```bash
pnpm test -- --runInBand tests/frontend/devices/api/devices.api.test.ts tests/frontend/devices/components/DeviceManagementView.test.tsx tests/frontend/devices/components/DeviceDetailsModal.test.tsx tests/frontend/devices/hooks/useDevices.test.ts tests/frontend/devices/utils/deviceFormMapper.test.ts tests/frontend/components/atoms/table.test.tsx
```

Expected: PASS

**Step 2: Run type check**

Run: `pnpm type-check`

Expected: PASS

**Step 3: Run build**

Run: `pnpm build`

Expected: PASS（允许记录与设备页无关的既有 warning）

**Step 4: Commit**

```bash
git add .
git commit -m "test: verify device management ui recovery"
```
