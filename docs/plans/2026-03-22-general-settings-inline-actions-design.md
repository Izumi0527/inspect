# 通用设置页按钮内联到基础信息标题行设计说明

## 背景

当前系统设置页采用壳层统一工具栏模式。`GeneralSettings` 会通过
`useSettingsTabCapabilities('general', ...)` 将“保存 / 重置”动作注册到
壳层，再由 `SettingsPageShell -> SettingsToolbar` 在内容区上方渲染成单独模块。

这导致“通用配置”页的动作按钮脱离“基础信息”模块视觉上下文，与页面当前的
表单式内容组织不一致。

## 目标

- 移除通用设置页顶部单独的“保存 / 重置”工具条。
- 将“保存 / 重置”按钮移动到“基础信息”标题同行。
- 按钮行为保持不变，仍然作用于整个“通用配置”页的全部配置项。
- 只影响“通用配置”子分页，不改变其他系统设置子分页的动作区策略。

## 非目标

- 不修改其他子分页（日志设置、安全策略、通知中心等）的工具栏行为。
- 不拆分保存逻辑，不改为分区保存。
- 不调整现有通用设置的数据结构、接口和脏状态计算逻辑。

## 现状分析

### 页面结构

- `SettingsPageShell` 负责系统设置页壳层。
- `SettingsToolbar` 统一渲染搜索、筛选、主次动作按钮。
- `GeneralSettings` 负责通用配置内容区，内部含四个区块：
  - 基础信息
  - 巡检配置
  - 报表配置
  - 用户偏好

### 动作来源

- `GeneralSettings` 当前通过 `useSettingsTabCapabilities('general', {...})`
  注册：
  - `primaryActions: 保存`
  - `secondaryActions: 重置`
- 因此工具按钮并不属于 `BasicInfoSection`，而属于壳层工具栏。

## 方案对比

### 方案一：仅通过样式把壳层按钮“挪”到基础信息附近

- 优点：表面改动少。
- 缺点：按钮真实归属仍在壳层，语义和结构都不合理；响应式和后续维护成本高。

### 方案二：通用设置页本地渲染按钮，并放到基础信息标题同行

- 优点：结构最清晰，语义准确，改动范围只在通用设置相关文件。
- 缺点：需要把页面级动作透传给 `BasicInfoSection`。

### 方案三：为壳层增加“局部动作插槽”

- 优点：框架化程度更高。
- 缺点：本次需求过度设计，不符合最小必要修改原则。

## 结论

采用方案二。

## 实施设计

### 1. `GeneralSettings` 侧

- 保留现有 `saveAll`、`resetAll`、`isDirty`、`isSaving` 逻辑不变。
- `useSettingsTabCapabilities('general', ...)` 只保留：
  - `dirty`
  - `saving`
  - `blockLeave`
- 不再注册 `primaryActions` 和 `secondaryActions`，从而让壳层不再渲染该页独立动作条。
- 将动作能力以本地 props 传给 `BasicInfoSection`。

### 2. `BasicInfoSection` 侧

- 新增可选动作 props，用于接收：
  - `isDirty`
  - `isSaving`
  - `onSave`
  - `onReset`
- 在“基础信息”标题同行渲染按钮。
- 保持原有表单字段和逻辑不变。

### 3. `SectionHeader` 侧

- 扩展一个可选 `actions` 插槽。
- 当提供 `actions` 时，在标题右侧渲染一个动作容器。
- 小屏下允许换行，大屏下保持同行显示。

## 测试策略

- 单元测试：
  - `GeneralSettings` 不再向壳层注册 `保存 / 重置` 动作。
  - `GeneralSettings` 将本地动作传递给 `BasicInfoSection`。
  - `BasicInfoSection` 在标题同行渲染按钮，并保持点击/禁用行为。
- 浏览器验证：
  - `/settings` -> `通用配置`
  - 检查顶部独立工具条消失
  - 检查“基础信息”标题同行出现“重置 / 保存”
  - 检查修改字段后按钮可用、点击正常

## 风险与控制

- 风险：按钮视觉位置变更后，用户可能误解为只保存“基础信息”。
  - 控制：当前需求已明确要求“只移动位置，不改变作用范围”；后续若需要可再补充说明文案。
- 风险：`SectionHeader` 为共享组件，扩展后影响其他调用方。
  - 控制：新增 `actions` 为可选属性，不修改默认布局分支。

## 备注

- 按项目危险操作约束，本次仅创建文档与代码修改，不执行 `git commit`。
