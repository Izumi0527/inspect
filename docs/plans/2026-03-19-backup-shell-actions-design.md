# 系统设置 · 备份管理壳层动作迁移设计

## 背景
- 备份管理页面当前在 loading / error / normal 三个分支均渲染 `ActionButtons`，导致动作区无法统一交由壳层管理。
- Task5 的目标是让该页面只负责业务内容，保存/重置等按钮由壳层通过能力上报（`useSettingsTabCapabilities`）渲染，同时页面仍保留骨架、错误提示、恢复中的遮罩等状态。
- 测试依赖壳层 toolbar 中名为“保存/重置”的按钮和 `blockLeave:true`，因此能力上报必须覆盖 dirty/saving/blockLeave + actions 组合。

## 方案选项
1. **直接在组件末尾调用 `useSettingsTabCapabilities('backup', {...})`**，把现有 `isDirty` / `isSaving` / `isCreating` / `isRestoring` / `isDeleting` 状态与 `handleSave` / `handleReset` 绑定至壳层 actions。优点为改动最小、测试友好；缺点是需要注意依赖缓存以免频繁重渲染。
2. **抽象一个 `useBackupActions` hook** 来封装 polish 逻辑（计算 `isBusy`、actions 数组、blockLeave 条件），由 `BackupManagement` 调用。结构更清晰但新增文件与 hook 可能延迟交付。
3. **复用现有 `ActionButtons` 组件但在其内部调用能力 hook**，让组件既渲染 UI 也上报能力。该方案维护成本高、会让 `ActionButtons` 同时负责 UI 和壳层能力，违背 Task5 “壳层统一”的目标。

## 推荐
- 选第 1 个方案，在 `BackupManagement` 内部直接准备 `primaryActions` / `secondaryActions` 并通过 `useSettingsTabCapabilities` 上报，避免引入额外组件/hook。为减小依赖抖动，可用 `useMemo` 缓存 action 数组。

## 验证与风险
- 需保障 `tests/frontend/settings/backup/BackupManagement.shellActions.test.tsx` 能找到壳层 `SettingsToolbar` 渲染的“保存/重置”按钮，并且 `blockLeave` 反映 `isDirty || isRestoring`。
- 负载计算要覆盖 `isCreating/isRestoring/isDeleting`，否则按钮状态可能在后台操作期间误可点。
- 改完后仍需确认 loading/error 分支不渲染旧的 `ActionButtons` 提示（包括“• 有未保存的更改”文本）。
