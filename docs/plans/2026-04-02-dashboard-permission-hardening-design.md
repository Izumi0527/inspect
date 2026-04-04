# 总览页权限收敛与错误语义修复设计

> 目标：修复总览页在权限、错误处理、首页副作用动作、通知缓存隔离上的结构性问题，并保持现有页面入口与接口路径稳定。

## 1. 设计原则

- 后端做真实授权，前端不再依赖占位值猜权限。
- 聚合接口允许“分区降级”，但技术失败必须进入真实错误态。
- 首页卡片不直接触发高副作用后台任务。
- 通知查询缓存按用户隔离，避免跨账号短暂串数据。

## 2. 最优长期方案

### 2.1 总览接口权限模型

- 保持 `/api/v1/dashboard/overview` 路径不变。
- 后端基于当前用户权限构造分区状态：
  - `stats.devices` / `networkOverview` 依赖 `devices:read`
  - `stats.alerts` / `recentAlerts` 依赖 `alerts:read`
  - `stats.bandwidth` 依赖 `monitoring:read`
- 返回结构增加 `sections` 与 `permissions` 元信息，语义对齐监控中心 `dashboard/v2`：
  - `sections.<key>.ok`
  - `sections.<key>.message`
  - `sections.<key>.limitedByPermission`
  - `sections.<key>.requiredPermission`
- 对于无权限分区，返回安全占位数据，但明确标记为权限受限。

### 2.2 总览页前端消费策略

- `fetchDashboardData()` 不再吞掉接口异常；网络/5xx/契约错误直接抛出。
- `DashboardView` 改为读取显式 `sections` 元信息：
  - 权限受限：展示权限提示
  - 技术失败：展示错误态/重试
- 页面入口增加“任一相关读权限即可访问”的门禁，防止完全无相关权限账号落入空壳首页。

### 2.3 Dashboard 其他接口权限

- `/dashboard/device-status`、`/dashboard/network-overview` 需要 `devices:read`
- `/dashboard/alert-summary`、`/dashboard/recent-alerts`、`/dashboard/top-devices-by-alerts` 需要 `alerts:read`
- `/dashboard/bandwidth-stats`、`/dashboard/system-status` 需要 `monitoring:read`
- `/dashboard/notifications*` 继续允许登录态访问，但通知内容按来源权限过滤

### 2.4 通知中心权限与缓存

- 后端通知来源按权限过滤：
  - 告警通知：`alerts:read`
  - 巡检通知：`inspections:read`
  - 报表通知：`reports:read`
  - 扫描通知：`devices:read`
- 前端通知查询键引入 `user.id`
- 退出登录时清理 React Query 缓存，避免旧数据残留

### 2.5 快速操作去副作用

- 首页“快速操作”改为“快捷入口”
- 不再在首页直接触发：
  - `/devices/scan`
  - `/reports/generate`
- 点击仅跳转到对应模块，由模块页自行承载确认、参数填写和任务创建

## 3. 测试策略

- 前端：
  - RouteGuard 任一权限放行/无权限拦截
  - dashboard API：异常上抛、权限元信息解析
  - QuickActionsCard：仅导航不触发副作用
  - UserMenu：退出登录清缓存
- 后端：
  - Dashboard handler 端点权限测试
  - Dashboard 权限辅助逻辑测试
  - Dashboard 通知来源权限过滤测试

## 4. 兼容性约束

- 不改现有接口路径
- 不删除旧数据字段
- 新增元信息字段时保持旧前端未升级前仍可安全读取
