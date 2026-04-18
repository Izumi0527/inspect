# 监控中心按钮真实验证记录（2026-04-18）

## 目标

使用 Chrome MCP 对监控中心页面的可见按钮做真实链路验证；若发现自动化不可稳定触发的问题，则先定位根因，再做最小修复并复测。

## 验证环境

- 前端页面：`http://127.0.0.1:3000/monitoring`
- 后端接口：`http://127.0.0.1:8000/api/v1`
- 浏览器工具：Chrome MCP
- 验证时间：2026-04-18

## 按钮级结果

### 1. 监控时间范围

- 操作：`近24小时 -> 近7天`
- 结果：通过
- 证据：
  - `reqid=229` `POST /api/v1/monitoring/dashboard/v2`，请求体 `{"time_range":"24h","alerts_limit":10}`
  - `reqid=233` `POST /api/v1/monitoring/dashboard/v2`，请求体 `{"time_range":"7d","alerts_limit":10}`

### 2. 刷新

- 操作：点击 `刷新`
- 结果：通过
- 证据：
  - `reqid=237` `POST /api/v1/monitoring/dashboard/v2`

### 3. 导出报告

- 操作：点击 `导出报告`，选择 `CSV`
- 结果：通过
- 证据：
  - `reqid=239` `POST /api/v1/monitoring/reports/export`
  - `reqid=240` `POST /api/v1/monitoring/reports/download/check`
  - `reqid=242` `POST /api/v1/monitoring/reports/download`
  - 下载响应头包含 `attachment; filename="monitoring-report-20260418-131056.csv"`

### 4. 实时告警项

- 操作：直接点击实时告警项
- 初始现象：Chrome MCP 点击后，页面跳转反馈不稳定
- 根因：列表项使用 `motion.div role="button"`，自动化点击和无障碍语义不够稳定
- 修复：改为原生 `motion.button type="button"`
- 复测结果：通过
- 证据：
  - `reqid=315` `GET /alerts?id=11&_rsc=...`
  - `reqid=328` `GET /api/v1/alerts/11`
  - `reqid=330` `GET /api/v1/alerts/11`

### 5. 查看全部告警

- 操作：点击 `查看全部 9 条告警`
- 结果：通过
- 证据：
  - 页面跳转到 `/alerts`
  - 页面出现 `告警中心`、`告警列表`

### 6. 侧栏折叠

- 操作：点击左上角侧栏折叠按钮
- 结果：通过
- 证据：
  - 导航文字隐藏，仅保留图标

### 7. 主题设置

- 操作：打开 `主题设置`，切换浅色/深色模式
- 结果：通过
- 证据：
  - 切换浅色后：`document.documentElement.className` 包含 `light`，`localStorage.theme=light`
  - 切换深色后：`document.documentElement.className` 包含 `dark`，`localStorage.theme=dark`

### 8. 通知中心

- 操作：打开 `通知中心`，切换 `消息` / `告警` 分类
- 结果：通过
- 证据：
  - 菜单内容随分类切换，`消息(2)` 显示报表通知，`告警(9)` 显示告警通知列表

### 9. 通知中心 - 全部已读

- 操作：点击 `全部已读`
- 结果：通过
- 证据：
  - `reqid=363` `POST /api/v1/dashboard/notifications/read`
  - 请求体：`{"all":true,"window_limit":200}`
  - 响应体：`{"updated":38}`
  - 执行后顶部未读徽标消失

### 10. 通知中心 - 清空

- 操作：点击 `清空`
- 结果：通过
- 证据：
  - `reqid=367` `POST /api/v1/dashboard/notifications/dismiss`
  - 请求体：`{"all":true,"window_limit":200}`
  - 响应体：`{"updated":38}`
  - 菜单显示 `暂无最近通知`

### 11. 通知中心 - 查看全部通知

- 操作：点击 `查看全部通知`
- 结果：通过
- 证据：
  - 页面跳转到 `/alerts`
  - 产生 `/api/v1/alerts` 与 `/api/v1/alerts/statistics` 真实请求

### 12. 用户菜单 - 系统设置

- 操作：打开用户菜单，点击 `系统设置`
- 结果：通过
- 证据：
  - 页面跳转到 `/settings?tab=general`
  - `reqid=377` `GET /api/v1/settings/general`

### 13. 用户菜单 - 退出登录

- 操作：打开用户菜单，点击 `退出登录`
- 结果：通过
- 证据：
  - `reqid=385` `POST /api/v1/auth/logout`
  - 响应体：`{"message":"登出成功"}`
  - 页面跳转到 `/login?redirect=%2Fsettings`

## 代码修复

- 文件：`frontend/src/features/monitoring/components/cards/RealTimeAlertsCard.tsx`
- 变更：将实时告警项容器从 `motion.div role="button"` 改为原生 `motion.button`
- 目的：提升自动化点击稳定性和原生可访问性

## 新增测试

- 文件：`tests/frontend/monitoring/components/RealTimeAlertsCard.accessibility.test.tsx`
- 断言：
  - 实时告警项必须渲染为原生 `button`
  - 点击后应跳转到 `/alerts?id=<id>`

## 本地验证

- 命令：

```bash
pnpm -C frontend test -- "../tests/frontend/monitoring/components/RealTimeAlertsCard.accessibility.test.tsx" --runInBand
```

- 结果：通过
