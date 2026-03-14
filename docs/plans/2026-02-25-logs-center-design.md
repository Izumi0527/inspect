# 日志中心（Logs Center）专项复审与修复设计

日期：2026-02-25

## 目标与成功标准

目标：把“日志中心”从目前的“看似对接但接口契约不一致、功能不可用/半可用”的状态，修复为“前端真实对接后端 API，导出可用、采集可用、过滤一致、关键回归测试覆盖”。

成功标准：
- 日志列表与统计：页面加载后能稳定展示统计卡片与列表（不依赖 `{data: ...}` 信封格式）。
- 过滤：`level/facility/source/search/start_time/end_time/device_id` 过滤能真实影响查询结果（source 必须生效）。
- 删除：单条删除与批量删除成功后能刷新列表。
- 导出：CSV/XLSX 可下载；在前后端分离部署下也能工作（使用 `NEXT_PUBLIC_API_URL + /api/v1` 并携带 token）。
- 采集：可在日志中心选择设备进行单台/批量采集，展示每台设备成功条数/失败原因；采集后可刷新列表与统计。
- 回归测试：前端（logsApi 解包/导出鉴权/采集结果明细渲染）与后端（批量采集响应明细）均有自动化覆盖。

## 现状复审结论（关键问题）

### 1. 前端 `logsApi` 的响应解包方式与后端不一致（高风险）

前端：`frontend/src/features/logs/api/logsApi.ts` 多数接口按 `{ data: X }` 解包：

```ts
const response = await api.get<{ data: LogStatistics }>(...)
return response.data
```

但通用 API 客户端：`frontend/src/lib/api-client.ts` 的 `handleResponse` 会直接返回后端 JSON（不会自动解包到 `data` 字段）。

后端：`backend-go/internal/http/handlers/logs.go` 多数接口直接 `c.JSON(200, obj)`，返回裸对象/数组/Map，而非 `{ data: ... }` 信封。

结论：日志列表、统计、最近日志、解析规则、批量删除等接口在真实环境下大概率拿到 `undefined` 或结构不一致，导致页面空白/报错或操作成功提示不可信。

### 2. 导出实现与真实路由/响应类型不一致（高风险）

前端：`frontend/src/features/logs/components/LogsView.tsx` 手拼 `exportUrl = /api/logs/export?...`，且通过 `<a href>` 触发下载：
- 缺少 `/v1` 前缀（后端实际 `GET /api/v1/logs/export`）。
- 未使用 `NEXT_PUBLIC_API_URL`，前后端分离部署会打到前端域名。
- 未携带 `Authorization`，后端有鉴权时会 401。

后端：`ExportLogs` 返回 `c.Blob(...)` 文件流（CSV/XLSX），不是 JSON。

结论：导出在多数部署形态下不可用，且即使打到正确路由，`api-client` 的 JSON/text 解析也无法得到 `Blob`。

### 3. “来源过滤”前端已有但后端未实现（中高风险）

前端类型与 UI 已有 `source`：
- `frontend/src/features/logs/types/index.ts`：`LogQueryParams.source`
- `frontend/src/features/logs/components/LogFiltersBar.tsx`：来源下拉框

但后端 `logs.LogFilter` 与 `buildLogFilter/buildLogQuery` 不支持 `source` 条件。

结论：来源过滤是“假过滤”，会误导用户。

### 4. “采集日志”入口目前是 toast 文案（功能缺失）

`frontend/src/features/logs/components/LogsView.tsx` 的采集菜单仅提示“开发中”，未调用：
- `POST /api/v1/logs/devices/:device_id/logs/collect`
- `POST /api/v1/logs/batch-collect`

结论：采集能力未闭环，且页面空数据时给出“采集设备日志”的引导，但没有可用入口。

## 修复方案与取舍

### 总体策略

1. **不改动全局 `api-client` 行为**（避免牵连其他模块），而是在日志模块 `logsApi.ts` 内部做“响应解包兼容”：
   - 兼容裸对象/数组
   - 兼容 `{ data: X }`
   - 兼容 `{ success: true, data: X }`

2. **导出不走 `api-client`**，直接 `fetch(url, {Authorization})` + `blob()`：
   - URL：`(NEXT_PUBLIC_API_URL||http://127.0.0.1:38000) + /api/v1/logs/export`
   - 参数：透传过滤参数 + `format/include_raw/include_stats`

3. **后端补齐 `source` 过滤**：扩展 `logs.LogFilter` 与查询构造，使 UI 过滤真实生效。

4. **批量采集响应增加明细**（向后兼容）：
   - 新增 `collected` 与 `failed` 字段，便于前端展示每台设备结果。

5. **新增采集弹窗**：在日志中心内实现“设备选择 + 参数设置 + 结果明细展示”，形成可用闭环。

### 方案对比（关键点）

- 方案 A（推荐）：前端 logsApi 本地兼容解包 + 后端保持裸返回风格
  - 优点：改动面集中；不影响其他模块；风险可控
  - 缺点：每个模块可能都要自己做兼容（但可以逐步统一）

- 方案 B：改 `api-client` 全局自动解包 `{data:...}`
  - 优点：代码更“省事”
  - 缺点：破坏性强，可能导致已有模块类型/行为变化；风险不可控

- 方案 C：后端统一改成 `{success,data,message}` 信封
  - 优点：契约统一
  - 缺点：迁移面广（大量 handler）、需要同步前端多处适配；不适合本次专项快速修复

## 业务逻辑流程图（目标态）

```mermaid
flowchart TD
  A[进入 /logs] --> B[鉴权/拿 token]
  B --> C1[加载统计 GET /api/v1/logs/statistics?hours=24]
  B --> C2[加载列表 GET /api/v1/logs?skip&limit&device_id&level&facility&source&search&start_time&end_time]
  C1 --> D[渲染统计卡片]
  C2 --> E[渲染日志表格+分页]

  E --> F1[用户修改过滤条件]
  F1 --> C2

  E --> F2[点击日志行]
  F2 --> G[打开详情弹窗]

  E --> F3[单条删除 DELETE /api/v1/logs/:log_id]
  F3 --> C2

  E --> F4[批量删除 POST /api/v1/logs/batch-delete]
  F4 --> C2

  E --> F5[导出 GET /api/v1/logs/export (blob)]
  F5 --> H[浏览器下载 CSV/XLSX]

  E --> F6[采集日志 打开采集弹窗]
  F6 --> I1[加载设备列表 GET /api/v1/devices...]
  F6 --> I2[单设备采集 POST /api/v1/logs/devices/:id/logs/collect]
  F6 --> I3[批量采集 POST /api/v1/logs/batch-collect]
  I2 --> C2
  I3 --> C2
```

## 后端接口契约（本次涉及）

- `GET /api/v1/logs`：返回 `logs.LogListResponse`
- `GET /api/v1/logs/statistics`：返回 `logs.LogStatistics`
- `POST /api/v1/logs/batch-delete`：返回 `{ deleted_count: number }`
- `GET /api/v1/logs/export`：返回 `Blob`（`text/csv` 或 xlsx MIME）
- `POST /api/v1/logs/devices/:id/logs/collect`：返回 `logs.LogCollectionResponse`
- `POST /api/v1/logs/batch-collect`：返回（向后兼容）
  - 既有：`success/message/collected_count/device_id`
  - 新增：`collected`、`failed`

## 测试策略（回归）

前端（Jest）：
- `logsApi`：验证三种返回格式（裸/`{data}`/`{success,data}`）均能正确解包。
- 导出：验证 URL 前缀与 `Authorization` 头，且走 `blob()` 下载路径。
- 采集弹窗：验证设备选择、触发批量采集、渲染成功/失败明细。

后端（Go tests module `tests/backend-go`）：
- 批量采集响应构造：验证 JSON 序列化包含 `collected`/`failed`，且旧字段仍存在。

