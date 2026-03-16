# 报表分析页面审查与修复方案（2026-03-16）

## 0. 执行进度（更新至 2026-03-17）

- [x] 输出审查结论与问题清单
- [x] 输出业务流程图（含接口时序）
- [x] 修复后端 P0（自定义配置更新不清空、关键 handler 判空、分页边界）
- [x] 修复后端统计报表 500：移除对 `devices.disk_usage`（当前库无该列）的直接读取，避免统计/巡检相关接口报错
- [x] 修复前端 P0/P1（巡检分页、趋势指标选择、统计导出、自定义配置 CRUD/导入/复制）
- [x] 回归验证（前端 type-check + 后端 go test 关键包）
  - 说明：当前仓库 `pnpm -C frontend run lint` 仍会因其他模块的历史问题失败（与本次改动无直接关联），详见“验收与回归清单”。
- [x] 新增 Playwright E2E：覆盖四个 Tab 的关键按钮/控件并跑通
  - 相关文件：`frontend/tests/e2e/reports-analysis.spec.ts`、`frontend/tests/e2e/setup/global-setup.ts`
  - 验证命令：`pnpm -C frontend test:e2e`
- [x] 修复自定义报表空态：空列表时仍渲染配置弹窗/确认弹窗（否则“创建自定义报表”无法打开弹窗）
- [x] 统一弹窗层级：将 `ConfigPreviewModal` 迁移到 Radix `Modal`，消除“弹窗点击被拦截/层级不稳定”
- [x] 修复 Radix Dialog 控制台报错：报表模块相关弹窗补齐 `ModalTitle`（提升可访问性并减少噪声日志）

## 1. 背景与目标

本次目标：

1) 深度审查 `/reports`（报表分析）页面下四个子模块（巡检报告/趋势分析/统计报表/自定义报表）的**分页能力**、**前后端是否完善**。  
2) 核对前端是否**真实对接后端 API**（而非仅 mock/静态数据）。  
3) 梳理端到端业务逻辑流程图（含关键接口与时序），校验逻辑闭环是否正常。  
4) 基于审查输出修复/优化计划并**落地修复**，提供可验证的回归清单。  

## 2. 现状结论（代码核对）

### 2.1 前端确实对接真实后端 API，但存在“可回退 mock”的开关

- 前端统一 API 前缀：`frontend/src/lib/api-client.ts` 内 `API_PREFIX = '/api/v1'`，`api.get/post/...` 会拼接该前缀。
- 报表模块 API 汇聚：`frontend/src/features/reports/api/reports.api.ts` 内的 `fetchReports / getTrendAnalysis / getStatistics* / fetchCustomReportConfigs ...` 均直接调用后端路由（如 `/reports`、`/reports/trends/analysis`、`/reports/statistics/kpi`、`/reports/custom/configs` 等）。
- 注意：报表模块存在“非生产 + `NEXT_PUBLIC_REPORTS_ENABLE_MOCK=1` 时回退默认数据”的逻辑（用于开发兜底）。验收“真对接”时应确保关闭该开关，避免误判。
  - ✅ 已实现：在 `/reports` 页面增加显式 Banner 提示当前处于 mock 回退模式，避免“看似有数据/无报错但实际未联调”的验收误判。

### 2.2 分页与闭环总体判断

- 巡检报告列表：前端已落地 `Table.pagination` 并传 `page/page_size`，分页闭环可用；但搜索/格式筛选仍为**前端本页过滤**（已在 UI 明示），中长期建议后端纳入 `keyword/format` 做分页统计以对齐 total 口径。
- 趋势分析：属于时序图表，不涉及传统分页；“指标选择”已驱动请求 metrics 与图表 lines，搜索过滤字段与展示口径一致，错误态支持重试。
- 统计报表：主要为聚合统计与图表，不涉及传统分页；“导出数据”已对接 `POST /api/v1/reports/export/excel`（后端当前输出 CSV 下载链接），并补齐导出中按钮状态。
- 自定义报表：列表/预览/生成/下载链路存在；已补齐“创建/编辑/复制/导入/删除”配置管理闭环，并统一 `configId` 为 `string` 避免 NaN；后端 `UpdateCustomConfig` 已修复“误清空配置”的数据破坏风险。

> 追加审查发现（来自并行子代理审查结论）：
> - 巡检列表的“搜索/格式筛选”当前为**前端本页过滤**，即使接入分页也会存在“total 与表格行数口径不一致”的体验风险；短期可在 UI 明示“仅对本页生效”，中长期建议后端支持 `keyword/format` 参与分页统计。
> - 自定义报表存在 `configId` **Number()→NaN** 风险与预览入参结构不匹配（会导致预览失败/不稳定）；需统一使用 `string` 并对齐预览 hook 签名。

## 3. 四个子模块审查要点（按模块）

### 3.1 巡检报告（Inspection）

审查结论：

- **后端**：`GET /api/v1/reports` 支持 `page/page_size(type/status/created_by/start_date/end_date)` 并返回 `total`。
- **前端**：已落地 `page/pageSize` 传参与 `Table.pagination`，分页闭环可用；搜索/格式筛选为**前端本页过滤**（已在 UI 明示）。

修复进度：

- [x] 落地 `Table.pagination`，并将 `page/pageSize` 传给 `useReports`。
- [x] 过滤条件变化（状态/格式/搜索）重置到第一页，避免空页。
- [x] 搜索/描述过滤对 `title/description` 空值兜底，避免 `.toLowerCase()` 白屏。
- [x] 操作权限：生成/编辑/删除等按 `reports:create / reports:update / reports:delete` 控制（最小暴露）。

### 3.2 趋势分析（Trends）

审查结论：

- **对接**：`POST /api/v1/reports/trends/analysis`。
- **现状**：指标选择已驱动请求与图表展示，搜索过滤口径一致；错误态支持重试。

修复进度：

- [x] 统一“指标选择 → 请求 metrics → 图表 lines → 搜索过滤字段”口径。
- [x] 错误态补“重试”能力（react-query `refetch`）。
- [x] 日期聚合口径调整为“按浏览器本地日期”生成 key，避免 `split('T')[0]` 的时区跨天偏差。

### 3.3 统计报表（Statistics）

审查结论：

- **对接**：`POST /api/v1/reports/statistics/data`、`/kpi`、`/rankings`、`/generate` 均存在。
- **现状**：“导出数据”已落地对接；参数命名 camelCase/snake_case 混用虽被后端兼容解析，但长期存在一致性风险。

修复进度：

- [x] 用现有导出接口 `POST /api/v1/reports/export/excel`（后端实际输出 CSV）落地“导出数据”闭环。
- [x] 导出按钮增加“导出中...”与禁用态，避免重复提交。
- [x] 统一统计类请求参数命名（前端统一 camelCase，后端兼容解析）。

### 3.4 自定义报表（Custom）

审查结论：

- **对接**：`GET /api/v1/reports/custom/configs`、`POST /.../:id/preview`、`POST /.../:id/generate` 等链路存在。
- **现状**：已补齐创建/编辑/复制/导入/删除闭环（JSON 编辑）；预览接口参数对齐；统一 `configId` 为 `string`，避免 `NaN`。
- **后端风险**：`UpdateCustomConfig` “误清空配置”问题已修复，并补齐回归单测覆盖。

修复进度：

- [x] 前端补齐 CRUD/复制/导入闭环（Modal 表单 + JSON 编辑方式落地）。
- [x] 修复 preview 的参数签名与 configId 处理，避免 NaN/请求异常。
- [x] 后端修复 UpdateCustomConfig 的“只在显式携带配置字段时更新 config”。

## 4. 问题清单（优先级）

### P0（必须修复）

- [x] 1) 后端 `UpdateCustomConfig` 可能误清空 `config`（数据破坏风险）。
- [x] 2) 巡检报告列表前端分页未实现（只看到第一页）。
- [x] 3) 趋势分析指标下拉不生效且图表与请求不一致（核心交互失效）。
- [x] 4) 统计报表“导出数据”占位（业务不闭环）。
- [x] 5) 自定义报表配置管理（创建/编辑/复制/导入）缺失（业务不闭环）。

### P1（应修复）

- [x] 1) 后端多个 handler 缺少 `h.Service == nil` 判空（极端配置下 panic 风险）。
- [x] 2) `ListReports` page/pageSize 缺少边界 clamp（被恶意/误参触发性能风险）。
- [x] 3) 巡检报告生成/编辑/删除按权限隐藏/禁用（最小暴露原则）。
- [x] 4) 趋势/统计错误态补“重试”与更清晰提示。（趋势/统计均已补齐重试入口）

### P2（可选优化）

1) 统一日期口径（UTC vs 本地）与报表标题命名策略。
2) 导出接口语义（Excel=CSV）对齐：前端文案/后端返回可逐步规范。

## 5. 修复实施计划（可执行步骤）

### 5.1 文档与流程图

1) 新增流程图文档：`docs/flows/reports-analysis-flow.md`（Mermaid flowchart + sequence）。  
2) 在本文件维护执行进度与验证清单，保证变更可追溯。  

### 5.2 后端（P0→P1）

目标文件：`backend-go/internal/http/handlers/reports.go`

1) [x] 修复 `UpdateCustomConfig`：仅当请求携带 `template/parameters/charts/tables/filters/layout` 任一字段时才写入 `updates["config"]`。  
2) [x] 为关键 handler 增加 `h.Service == nil` 判空（返回 503，而非 panic）。  
3) [x] `ListReports` 对 page/pageSize clamp（page>=1；pageSize 在合理范围，例如 1~100）。  
4) [x] `status=scheduled` 过滤与返回口径对齐（DB 层过滤 + `buildReportResponse` 标准化输出）。  
5) [x] 修复统计/巡检报表查询 500：当前数据库 `devices` 表无 `disk_usage` 字段，移除相关 select，磁盘指标统一来自 `device_metrics`。  

### 5.3 前端（P0→P1）

1) [x] 巡检报告分页：`frontend/src/features/reports/components/InspectionReports.tsx` 落地 page/pageSize state 与 `Table.pagination`，调用 `useReports({page,pageSize,...})`，使用后端 total。  
2) [x] 趋势分析：`frontend/src/features/reports/components/TrendAnalysis.tsx` 让指标选择驱动 `metrics` 请求与图表 `lines`，并统一搜索过滤字段；错误态补重试。  
3) [x] 统计报表：`frontend/src/features/reports/components/StatisticsReports.tsx` 调用 `useExportToExcel` 实现导出闭环，拼装 sheets（概览/KPI/分布/排行）。  
4) [x] 自定义报表：`frontend/src/features/reports/components/CustomReports.tsx` + 相关 modal，补齐创建/编辑/复制/导入模板闭环；修复 preview 文案与参数处理。  
5) [x] 权限控制：在仅 `reports:read` 时隐藏/禁用 destructive 操作（生成/编辑/删除/导出/配置管理）。  

## 6. 验收与回归清单（建议）

### 6.1 自动化（≤60s 优先）

- 前端：`pnpm -C frontend run type-check`
- 前端：`pnpm -C frontend run lint`（当前仓库会因历史问题失败：`frontend/src/lib/authz/permission.ts` 存在 `module = ...` 触发 `@next/next/no-assign-module-variable`，另有 `MonitoringView.tsx` unused var 警告）
- 后端：`cd backend-go && go test ./...` 建议缩小到相关包（例如 `./internal/http/handlers`）并控制在 60s 内

### 6.2 手工冒烟

1) `/reports` → 巡检报告：切换状态筛选/格式筛选/搜索；分页翻页；生成/预览/下载/删除（按权限不同角色验证按钮显隐）。  
2) 趋势分析：切换 7/30/90 天；切换指标；图表线条与指标一致；错误态可重试。  
3) 统计报表：切换日期范围/过滤；刷新；生成报告下载；导出数据下载（CSV）。  
4) 自定义报表：创建配置→预览→生成下载；编辑配置不丢失字段；复制配置可保存为新配置；导入模板（JSON）可落库并可生成；删除配置生效。  

---

## 7. 第二轮审查与收尾（2026-03-17）

本轮目标：在“已修复 P0/P1 功能闭环”的基础上，进一步确认四个 Tab 真对接、流程图口径一致，并修复影响长期可维护性/验收准确性的关键问题。

### 7.1 二次审查结论要点

- Playwright 已验证：四个 Tab（巡检/趋势/统计/自定义）均能正常渲染，并真实请求后端 `/api/v1/reports/...` 且返回 2xx（见 `frontend/tests/e2e/reports-analysis.spec.ts`）。
- 说明：MCP 浏览器连接（connectOverCDP）在当前环境仍不稳定，因此改用项目内 Playwright Test Runner 做可重复回归。
- 二次审查中识别到的关键遗留点已处理：报表模块已清理 `// @ts-nocheck`、日期口径避免 `toISOString().split('T')[0]` 的 UTC 偏移风险、流程图字段口径已对齐（见 7.2）。

### 7.2 待优化/修复清单（本轮执行）

- [x] 1) 复核四个 Tab 真对接后端：用 Playwright/Network 记录确认四类核心请求均为 2xx（inspection list / trends analysis / statistics data+kpi+rankings / custom configs）。
- [x] 2) 修正 `docs/flows/reports-analysis-flow.md`：对齐列表响应字段（`success/data/reports/total/pages`）、分页 clamp、`scheduled` 语义与 camelCase/snake_case 说明。
- [x] 3) 前端统一日期生成口径：将 `toISOString().split('T')[0]` 替换为本地日期 `YYYY-MM-DD`（避免 UTC 偏移导致日期范围错误）。
- [x] 4) 清理报表模块 `// @ts-nocheck`：恢复 TypeScript strict type-check，补齐必要的类型与错误处理（不引入新的 any 扩散）。
- [x] 5) 后端下载文件名校验加固：`DownloadReportFile` 增加路径穿越/绝对路径防护（仅允许安全文件名）。
- [x] 6) 回归验证：`pnpm -C frontend run type-check`、`cd tests/backend-go && go test ./...`、Playwright 冒烟四 Tab。
