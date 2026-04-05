# 日志中心审查与修复方案（2026-03-16）

## 1. 背景与目标

本次目标：

1) 深度审查「日志中心」页面前端/后端是否完善（含权限、异常分支、状态一致性、导出/采集/删除链路）。  
2) 核对前端是否真实对接后端 API（非 mock/假数据）。  
3) 梳理端到端业务逻辑流程图，确认主链路与异常链路是否闭环。  
4) 基于审查输出问题清单（P0/P1/P2）与可执行修复计划，并落地修复与回归测试。

运行端口约定（本地开发）：
- 前端：`http://127.0.0.1:33000`
- 后端：`http://127.0.0.1:8000`（API 基础路径：`/api/v1`）

---

## 2. 现状结论（已核对源码）

### 2.1 前端确实对接真实后端 API

入口页面与模块：
- 路由入口：`frontend/src/app/logs/page.tsx`（`RouteGuard` 保护权限 `Permission.SYSTEM_LOGS`）
- 视图组件：`frontend/src/features/logs/components/LogsView.tsx`
- API 访问：`frontend/src/features/logs/api/logsApi.ts`
  - 列表/统计/采集/删除/解析规则等走 `api-client`（`api.get/post/put/delete`）
  - 导出走 `fetch(url).blob()`（文件流下载，携带 `Authorization`）

结论：前端请求链路为真实网络请求，非 mock。

### 2.2 后端已提供日志中心所需 API（路由齐全）

后端入口：
- 路由注册：`backend-go/internal/http/handlers/logs.go` → `LogsHandler.Register()`
- Service：`backend-go/internal/logs/service.go`

接口覆盖：
- `GET /api/v1/logs`（列表 + 过滤 + 分页）
- `GET /api/v1/logs/statistics`（统计卡片）
- `GET /api/v1/logs/export`（CSV/XLSX 文件流）
- `POST /api/v1/logs/devices/:device_id/logs/collect`（单设备采集）
- `POST /api/v1/logs/batch-collect`（批量采集）
- `DELETE /api/v1/logs/:log_id`、`POST /api/v1/logs/batch-delete`（删除/批量删除）
- 解析规则 CRUD、syslog 状态与应用、日志清理等（属于扩展能力）

---

## 3. 业务流程图（Mermaid）

```mermaid
flowchart TD
  A[访问 /logs] --> B{RouteGuard<br/>requireAuth + system:logs}
  B -- 未登录/无权限 --> B1[前端拦截/跳转登录或提示]
  B -- 通过 --> C[LogsView 挂载]

  C --> D[初始化状态<br/>page/pageSize/filters]
  D --> E1[useLogFilters<br/>filters -> queryParams]
  D --> E2[useLogs(fullQueryParams)<br/>触发 loadLogs]
  D --> E3[useLogStats(hours=24)<br/>触发 loadStats]
  D --> E4[useLogSelection/useLogCollection]

  E2 -->|GET| F[GET /api/v1/logs<br/>skip/limit + filters]
  F --> G[渲染 LogList + 分页]

  E3 -->|GET| H[GET /api/v1/logs/statistics?hours=24]
  H --> I[渲染 LogStatsGrid]

  G --> J{用户交互}
  J --> K[过滤变更<br/>重置页码->重新查询]
  J --> L[分页/每页条数变更<br/>重新查询]
  J --> M[点击日志项<br/>打开详情弹窗]
  J --> N[单条删除<br/>DELETE /api/v1/logs/:id<br/>成功后刷新列表]
  J --> O[批量删除<br/>POST /api/v1/logs/batch-delete<br/>成功后刷新列表并清空选择]
  J --> P[导出<br/>GET /api/v1/logs/export -> blob 下载]
  J --> Q[采集日志<br/>打开采集弹窗]
  Q --> Q1[加载设备列表<br/>GET /api/v1/devices...]
  Q -->|单台| R[POST /api/v1/logs/devices/:id/logs/collect]
  Q -->|批量| S[POST /api/v1/logs/batch-collect]
  R --> T[展示结果/失败原因]
  S --> T
  T --> U[采集后刷新列表与统计]
```

---

## 4. 问题清单（按严重度）

### P0（安全）后端日志接口“鉴权但不鉴权权限”

现象：`backend-go/internal/http/handlers/logs.go` 多数接口调用 `requirePermission(..., \"\")`，空权限字符串意味着只校验 token，不校验授权权限。  
风险：拥有任意有效 token 的用户可能读取/删除/采集/导出日志（严重越权）。

### P0（逻辑一致性）前端吞错导致“成功提示/清空选择”等行为与真实结果不一致

- `useLogs.loadLogs/batchDeleteLogs` 捕获异常后不向上反馈，导致上层无法判断失败。
- `LogsView.handleRefresh` 可能在失败时仍 toast “数据已刷新”。
- `LogsView.handleBatchDelete` 可能在删除失败时仍清空选中。

### P1（体验/稳定性）采集弹窗异常分支不闭环

- 批量采集失败时可能出现未捕获的 Promise 拒绝或缺少“失败明细/可解释反馈”。
- 设备列表加载失败与“确实无设备”未区分，容易误导排障。

### P1（性能）过滤/搜索缺少防抖导致请求风暴

输入关键字每次按键都会触发一次列表请求；设备搜索同理。

### P2（UI/交互）细节 bug 与一致性问题

- 日志列表 hover 样式 class 拼写问题导致 hover 失效。
- 全选/半选逻辑需以“当前页可见日志”为准，避免误导。
- 单条删除缺少二次确认（与批量删除交互不一致）。

---

## 5. 修复策略与计划（可执行）

### 5.1 后端（P0）：补齐权限模型并与前端一致

1) 新增日志管理权限（写操作）：`system:logs:manage`（建议赋予 `admin` 与 `operator`，不赋予 `viewer`）。  
2) 读接口统一要求 `system:logs`。  
3) 写接口（删除/批量删除/采集/批量采集/解析规则变更）要求 `system:logs:manage`。  
4) syslog/apply 与 cleanup 仍保持 `system:config`（属于系统配置/清理范畴）。

回归测试：补齐 handler 权限测试，确保 403/503 等语义稳定。

### 5.2 前端（P0/P1）：修复状态一致性 + 异常闭环 + 防抖

1) `useLogs/useLogStats/useLogCollection`：返回明确的 success/failure（或统一结构），上层根据结果决定 toast/清理状态。  
2) `LogsView`：
   - 刷新仅在成功时提示成功；失败要提示失败或部分成功。
   - 批量删除仅在成功后清空选中。
   - 分页越界自愈：`currentPage > totalPages` 自动回退并重查。
3) `LogCollectionModal`：
   - 采集失败展示失败原因，不出现未处理异常。
   - 设备搜索加防抖；设备加载失败显示“加载失败/重试”。
4) 交互一致性：
   - 单条删除补确认。
   - 无管理权限时隐藏“删除/批量删除/采集”入口（与后端 RBAC 对齐）。

回归测试：补齐/更新前端日志中心测试（Jest），覆盖“失败不清空/刷新提示准确/无权限隐藏操作”。

---

## 6. 验证清单

- 后端：`cd tests/backend-go && go test ./internal/http/handlers -run Logs -count=1`
- 前端：`pnpm -C frontend run type-check`、`pnpm -C frontend test -- logs`（或运行现有 logs 相关测试文件）
- 手工点验（可选）：用 `viewer/operator/admin` 三种权限登录验证：
  - viewer：可看列表/详情/统计/导出，但看不到采集与删除入口。
  - operator/admin：除查看外，还可采集与删除；失败时提示准确且不误清空状态。

---

## 7. 落地进度（截至 2026-03-16）

### 7.1 已完成修复（已落地到代码）

- ✅ 后端补齐 RBAC 权限校验（读 `system:logs`；写 `system:logs:manage`；syslog/cleanup 仍归 `system:config`）
- ✅ 后端导出安全与健壮性
  - 设备导出数量限制（默认上限 200）
  - 表格公式注入防护（对可疑单元格前置 `'`）
  - keyword 为空时分页参数回填，避免 `page_size=0` 引发前端分页异常
- ✅ 前端：状态一致性修复（失败不再提示成功、不再误清空选择、刷新提示区分成功/失败）
- ✅ 前端：权限对齐（无 `system:logs:manage` 时隐藏采集/删除/批量操作/选择框入口）
- ✅ 前端：搜索防抖（日志搜索 350ms 防抖）
- ✅ 前端：采集弹窗闭环（设备搜索防抖、加载失败/空态区分、重试、采集失败明细展示、关闭时清理局部状态）
- ✅ 前端测试适配（`usePermission` mock、导出参数来源改为 `queryParams`）
- ✅ 前端：导出错误提示增强（包含 HTTP 状态码与后端 message/文本），无 token 不发送空 Authorization 头
- ✅ 前端测试增强（exportLogs 非 2xx 错误解析、LogsView 权限分支回归）

### 7.2 已执行验证（本地命令输出记录）

- 后端单测：`go test ./internal/http/handlers -run Logs -count=1 -timeout 60s` ✅
- 前端类型检查：`pnpm -C frontend run type-check` ✅
- 前端 logs 用例：`pnpm -C frontend test -- ../tests/frontend/logs` ✅

---

## 8. UAT 验收清单（viewer/operator/admin）

### 8.1 环境准备

- 后端启动（示例）：`cd backend-go && go run ./cmd/server`（以项目实际为准）
- 前端启动：`pnpm -C frontend dev`（端口默认 `33000`）
- 三类账号/角色（推荐）：
  - viewer：仅 `system:logs`
  - operator：`system:logs` + `system:logs:manage`
  - admin：全量权限

> 注意：本次新增了 `system:logs:manage`。若你的环境未重跑 seed/未同步权限，operator 可能仍缺权限而看不到管理入口或被后端 403。

### 8.2 页面级验收（UI 可见性 + 主链路）

#### A) viewer（只读）

1) 访问 `/logs`：页面可进入，列表与统计能加载。
2) 过滤器：
   - 输入搜索关键字（快速连续输入）：网络请求应在停顿后触发（搜索已做 350ms 防抖），无明显请求风暴。
   - 级别/设施/来源/时间范围：变更后列表刷新且页码回到第 1 页。
3) 导出：
   - 点击“导出 → CSV”：应下载 `.csv`；提示“日志导出成功 (CSV)”。
   - 点击“导出 → Excel”：应下载 `.xlsx`；提示“日志导出成功 (XLSX)”。
4) 权限限制（关键）：
   - 页面不应出现：采集日志按钮、批量操作入口、列表选择框、单条删除按钮。

#### B) operator/admin（可管理）

1) 访问 `/logs`：同 viewer（列表/统计/过滤/导出都正常）。
2) 单条删除：
   - 日志项右侧出现删除按钮；点击后弹出二次确认；确认后删除成功会刷新列表。
3) 批量删除：
   - 列表出现选择框与全选；勾选多条后出现“批量操作”；执行批量删除：
     - 成功：提示成功且清空选择。
     - 失败：不应清空选择，并提示失败原因。
4) 采集日志（弹窗闭环）：
   - 打开采集弹窗：设备列表加载正常；设备搜索输入时为防抖请求（停顿后刷新列表）。
   - 设备列表异常场景：当设备接口失败时，弹窗显示“设备列表加载失败”与“重试”按钮；恢复后点击重试可正常加载。
   - 采集执行：
     - 单台采集：结果区展示成功/失败与明细；成功或采集到日志后会触发列表/统计刷新。
     - 批量采集：结果区展示成功/失败明细；失败不应产生未捕获异常。

### 8.3 API 级验收（RBAC 200/403 预期）

> 目标：证明“前端确实对接后端 + 后端权限生效”。建议用浏览器 Network 或 curl/Postman 验证。

- viewer（仅 `system:logs`）应满足：
  - ✅ `GET /api/v1/logs` → 200
  - ✅ `GET /api/v1/logs/statistics` → 200
  - ✅ `GET /api/v1/logs/export?format=csv` → 200（文件流）
  - ✅ `GET /api/v1/logs/export?format=xlsx` → 200（文件流）
  - ❌ `DELETE /api/v1/logs/:id` → 403
  - ❌ `POST /api/v1/logs/batch-delete` → 403
  - ❌ `POST /api/v1/logs/devices/:device_id/logs/collect` → 403
  - ❌ `POST /api/v1/logs/batch-collect` → 403

- operator/admin（具备 `system:logs:manage`）应满足：
  - ✅ 上述所有 GET → 200
  - ✅ 删除/采集/批量操作相关写接口 → 200

### 8.4 安全与边界验收（可选但建议）

1) 导出滥用保护：
   - `device_ids` 超过 200（如 201 个）导出应返回 400（避免大导出拖垮服务）。
2) 表格公式注入防护：
   - 若某条日志 message 以 `=`/`+`/`-`/`@` 开头，导出后的单元格应被前置 `'`，避免 Excel 公式执行。

---

## 9. 追加优化项（2026-03-16 补充）

> 这些属于“增强项/可用性提升”，不影响已修复的 P0/P1 主结论，但能显著降低运维排障成本与回归风险。

### P1（可用性）导出失败错误提示可解释（✅ 已完成）

现状：`exportLogs()` 对非 2xx 统一抛 `导出失败`，前端只能给出笼统提示。  
期望：错误提示至少包含 HTTP 状态码，并尽可能带上后端返回的 `message` / 文本内容（长度做截断）。  
验收点：当后端返回 403/400/500 时，toast 文案能提示类似 `导出失败（403）：权限不足`。

### P2（健壮性）无 token 时不发送空 Authorization 头（✅ 已完成）

现状：无 token 时仍发送 `Authorization: ''`。  
期望：无 token 时不设置 `Authorization` 头，减少中间件/网关对“空头”误判的可能性。  
验收点：无 token 时请求 headers 中不包含 Authorization；有 token 时仍为 `Bearer xxx`。

### P2（质量）补齐 logs 导出失败与权限分支自动化用例（✅ 已完成）

期望：
- `logsApi exportLogs`：覆盖非 2xx 错误解析（JSON/文本）与 message 拼接逻辑。
- `LogsView`：覆盖 `system:logs:manage=false` 时隐藏采集/删除/批量入口（避免权限回归）。
