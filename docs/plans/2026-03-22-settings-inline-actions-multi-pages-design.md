# 系统设置多子分页按钮下移设计说明

## 背景

在系统设置页中，`日志设置`、`安全策略`、`备份管理`、`通知中心`
四个子分页当前仍通过 `useSettingsTabCapabilities` 把页面动作注册给壳层，
由 `SettingsToolbar` 渲染成内容区上方的独立按钮模块。

上一任务中，`通用配置` 已经完成同类改造：按钮不再占用壳层独立模块，
而是下移到首个配置区块标题同行，行为保持不变。

本次目标是把这四个子分页也统一改成同一交互模式。

## 目标

- 移除这四个子分页顶部独立按钮模块。
- 将页面级功能按钮下移到各自首个主要配置模块标题同行。
- 按钮职责保持不变，仍作用于各自整页对应子分页。
- 仅影响这四个子分页，不改其他设置页。

## 非目标

- 不改后端接口。
- 不改保存/重置/应用/测试等业务逻辑。
- 不改为分区保存。
- 不重构整个系统设置壳层。

## 现状分析

### 安全策略

- 页面文件：`frontend/src/features/settings/components/security/SecuritySettings.tsx`
- 首个区块：`frontend/src/features/settings/components/security/SessionManagementSection.tsx`
- 特点：
  - 仅有 `保存 / 重置`
  - 首个区块已使用 `SectionHeader`
  - 可直接复用 `GeneralSettings -> BasicInfoSection` 模式

### 备份管理

- 页面文件：`frontend/src/features/settings/components/backup/BackupManagement.tsx`
- 首个区块：`frontend/src/features/settings/components/backup/BackupConfigSection.tsx`
- 特点：
  - 页面级动作仍是 `保存 / 重置`
  - 备份历史区块内另有创建/恢复/下载/删除，不在本次迁移范围
  - 首个区块已使用 `SectionHeader`

### 通知中心

- 页面文件：`frontend/src/features/settings/components/notifications/NotificationSettings.tsx`
- 首个区块：`frontend/src/features/settings/components/notifications/EmailNotificationSection.tsx`
- 特点：
  - 页面级动作仍是 `保存 / 重置`
  - 各区块内部已有“发送测试”按钮，和页面级保存动作不同层次
  - 首个区块已使用 `SectionHeader`

### 日志设置

- 页面文件：`frontend/src/features/settings/components/logs/LogsSettings.tsx`
- 首个区块：页面内联 `section`，标题为“数据保留”
- 特点：
  - 页面级动作不止 `保存 / 重置`，还包含：
    - `应用配置`
    - `刷新状态`
    - `立即清理`
  - 首个区块不是独立组件，暂未使用 `SectionHeader`
  - 页内存在两处“请使用顶部工具栏”的说明文案，需要同步改写

## 方案对比

### 方案一：继续用壳层工具条，仅通过样式下移

- 优点：表面改动少
- 缺点：结构仍是壳层控制，后续维护混乱，和“模块内动作”语义不一致

### 方案二：页面停止注册壳层 actions，并把动作透传到首个模块

- 优点：最符合现有 `通用配置` 的实现模式，改动面可控
- 缺点：需要分别在四页做局部接线

### 方案三：给壳层增加“局部插槽转发”

- 优点：理论上更体系化
- 缺点：明显过度设计，本次需求不需要

## 结论

采用方案二。

## 具体设计

### 通用策略

1. 页面级逻辑不变：
   - 保留当前 `handleSave`、`handleReset`、`handleApply...` 等方法
   - 保留 `isDirty`、`isSaving`、`blockLeave`
2. 页面不再向壳层注册 `primaryActions` / `secondaryActions`
3. 将原先的页面级动作对象透传给首个主要配置模块
4. 由首个主要配置模块通过 `SectionHeader.actions` 在标题同行本地渲染

### 三个标准页

适用于：
- `安全策略`
- `备份管理`
- `通知中心`

实现方式：
- 页面层停止注册壳层动作
- 首个模块增加可选 `actions` props
- 首个模块通过 `SectionHeader.actions` 渲染按钮

### 日志设置页

日志设置需要单独处理：

1. 抽出首个“数据保留”模块为独立组件或本地复用 `SectionHeader`
2. 将以下按钮一起下移到“数据保留”标题同行：
   - `保存`
   - `应用配置`
   - `重置`
   - `刷新状态`
   - `立即清理`
3. 将页内两处“页面顶部工具栏”文案改成内联模块表述，避免误导

## 风险与控制

- 风险：日志设置按钮较多，标题同行可能拥挤
  - 控制：使用 `flex-wrap`，小屏自动换行
- 风险：按钮下移到首个模块后，用户可能误解为仅作用于首个模块
  - 控制：维持页面级逻辑不变；如需补充说明，优先使用简短描述而非大规模文案改造
- 风险：`toolbarMode` 元数据与实际行为不一致
  - 控制：同步把这四页改为 `local`

## 测试策略

- 单元测试：
  - 页面不再向壳层注册 `primaryActions / secondaryActions`
  - 首个模块标题同行出现对应按钮
  - 禁用状态与点击行为保持正确
- 浏览器回归：
  - 打开 `/settings`
  - 逐页切到这四个子分页
  - 确认顶部独立按钮模块消失
  - 确认按钮出现在首个模块标题同行

## 备注

- 本次不执行 `git commit`
- 若后续希望完全统一“首个模块动作组”的渲染代码，可再抽共享组件；当前先以最小必要修改完成交付
