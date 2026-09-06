# 修复文档：执行历史页下载巡检报告 PDF 报 "failed to generate report"

- 日期：2026-09-06
- 影响版本：≤ 1.1.5
- 现象：执行历史页点击某条巡检记录 → 下载巡检报告 PDF，前端 toast 提示英文原文 "failed to generate report"。
- 状态：修复中

---

## 一、问题现象

用户在「巡检管理 → 执行历史」点击某条记录，选择下载 PDF 格式巡检报告时，
前端弹出错误 `failed to generate report`，报告无法下载，且无任何中文提示或可排查的日志线索。

## 二、调用链与证据链

### 2.1 请求链路

```
执行历史 / 详情弹窗（InspectionExecutions.tsx:271 / ExecutionDetailModal.tsx:101）
  → POST /api/v1/inspection/reports/generate（inspection.api.ts:1359）
    → InspectionHandler.GenerateInspectionReport（inspection_analytics.go:371）
      → reports.GenerateReportFile（report_generator.go:14）
        → writeInspectionReport → writeInspectionPDF（report_render_pdf.go:32）
          → newReportPDF → pdfkit.RegisterFonts → ResolveFontPaths（fonts.go:44）
```

错误文案 `failed to generate report` 唯一来源：`inspection_analytics.go:456`，
即 `GenerateReportFile` 返回 error 的分支。

### 2.2 排查证据

| # | 证据 | 结论 |
|---|------|------|
| 1 | `backend-go/internal/reports/pdfkit/fonts.go:141-163` 字体候选仅含 Windows 系统字体与少数 Linux `.ttf` 路径；`gofpdf v1.4.3` UTF8 加载器拒绝 `.ttc/.otf`（见 `docs/plans/2026-05-09-pdf-style-redesign.md:48`） | 渲染强依赖宿主机恰好存在中文 `.ttf` |
| 2 | `backend-go/Dockerfile`：development / release 阶段均为 alpine，仅安装 `git ca-certificates`，无任何字体 | 容器内 PDF 生成 100% 失败 |
| 3 | `scripts/` 全部部署脚本 grep `font/字体` 零命中 | 裸部署环境同样无保障 |
| 4 | `logs/backend-go/app.log`（6/19–9/6）中 18 次 `POST reports/generate` 均为 200（8 月），无 `🔥 Server Error` 记录 | 报错请求不来自本机原生实例 |
| 5 | dev 库 `reports` 表最近 20 条全部 `completed`，无 `failed` 记录 | 失败发生在另一部署环境 |
| 6 | `data/reports/` 目录为空 | 本机从未持久化报告文件（或已被清理） |
| 7 | `tests/backend-go/.../report_render_pdf_test.go:59` 存在 `未找到可用的PDF中文字体` 的 skip 分支；本机跑全套 reports 测试 PASS | 开发者已踩过无字体坑；本机链路健康，失败环境即无字体环境 |

### 2.3 根因结论

**主因（确定性）**：`ResolveFontPaths` 在无中文 `.ttf` 的宿主机（alpine 容器、精简 Linux
服务器、部分 Windows 安装形态）上必然返回
`未找到可用的PDF中文字体，请设置 REPORT_PDF_FONT_CJK_PATH`，
`GenerateInspectionReport` 捕获后统一降级为英文通用文案 `"failed to generate report"`。

**伴生缺陷**：

1. **真实错误不上日志**：失败分支仅将 `err` 写入 `reports.error_message`（`inspection_analytics.go:452`），
   且 `_, _` 忽略写库结果；zap 无任何记录。
2. **请求日志误导**：`request_logger.go` 在 Echo 错误处理器（位于中间件链之外）写响应**之前**读取
   `c.Response().Status`，失败请求恒显示 `✅ HTTP Request status=200`，无法按状态码分级。
3. **前端直出英文**：`useInspection.ts:554` 将后端 `error.message` 原样 toast，无中文映射。

## 三、修复方案

### 3.1 内嵌中文 .ttf 兜底（根治，本方案核心）

- 下载 OFL 授权字体 Noto Sans SC（Regular，`.ttf`）入库：
  `backend-go/assets/fonts/NotoSansSC-Regular.ttf` + `LICENSE-OFL.txt`。
- `pdfkit` 新增 `embedded_font.go`：`go:embed` 持有字体字节；
  系统候选全部落空时，将内嵌字体提取到 `os.TempDir()/inspect-pdf-fonts/`（`sync.Once` 幂等），
  作为第 4 级回退。回退链变为：
  `环境变量覆盖 → Windows 系统字体 → Linux 常见路径 → 内嵌字体（必中）`。
- 效果：任何部署形态（原生 / Docker / 安装器）PDF 生成不再依赖宿主机字体；
  系统字体可用时仍优先系统字体，渲染风格不变。
- 兼容性预案：若 gofpdf 无法解析 Noto 可变字体版，则替换为静态 ttf
  （LXGW WenKai Regular，OFL）或 fonttools 子集化版本，回退链结构不变。

### 3.2 错误可观测性（防复发）

- `GenerateInspectionReport` / `ExportAnalytics` 失败分支补
  `h.Logger.Error("生成巡检报告失败", zap.Error(err), zap.Int("report_id", ...))`；
  `echo.NewHTTPError(...).SetInternal(err)` 保留底层错误链。
- `request_logger.go`：`err != nil` 时无论最终响应码一律按错误级别记录，
  消除 "✅ 200" 假象。

### 3.3 Docker 挂载字体（开发环境提速）

- `docker-compose.dev.yml` backend 追加单文件只读挂载
  `C:/Windows/Fonts/simhei.ttf:/app/fonts/simhei.ttf:ro` 与
  `REPORT_PDF_FONT_CJK_PATH: /app/fonts/simhei.ttf`；
  Linux 开发者不配置该变量时自动落入内嵌兜底（注释说明）。

### 3.4 前端文案

- `useInspection.ts` 的 `useGenerateReport.onError`：后端 message 为英文技术文案时
  映射为「巡检报告生成失败，请稍后重试或联系管理员」，原始信息保留 `console.error`。

## 四、影响面与风险

| 改动 | 影响 | 风险与对策 |
|------|------|-----------|
| 字体入库（约 10MB） | 仓库体积增加 | OFL 允许再分发，随附许可证；构建产物增大可接受 |
| gofpdf 解析内嵌字体 | 渲染新路径 | 以单测验证「内嵌字体 → 注册 → 输出 PDF」全链路；不兼容则换静态 ttf |
| 临时目录提取字体 | 首次生成稍慢 | `sync.Once` 幂等；gofpdf 对同一文件自带解析缓存 |
| RequestLogger 级别调整 | 日志分级变化 | 失败请求从 ✅ 变 ❌，属修正而非破坏 |
| SetInternal(err) | 错误响应新增 details？ | 当前 ErrorHandler 不输出 Internal，仅日志可见，无信息泄露 |

## 五、测试计划

1. Go 单测（`tests/backend-go/internal/reports`）：
   - 内嵌字体提取幂等性（重复调用同一路径）；
   - 用内嵌字体走 `RegisterFonts` → 输出最小 PDF（模拟无系统字体环境）。
2. 既有全套 reports 测试回归。
3. `go build ./...`（backend-go）+ 前端 lint/test。
4. 手工回归：执行历史页真实生成 PDF 成功；Docker dev 容器内生成成功。

## 六、回滚策略

- 字体兜底、日志增强、SetInternal、前端文案均为增量小改，`git revert` 单提交即可整体回滚；
- compose 挂载独立成段，删除挂载行即恢复原状；
- 数据库无 schema 变更，无需数据回滚。

## 七、后续建议（不在本次范围）

- 失败报告在 `GET /reports/:id/status` 透出 `error_message`，前端可展示具体原因；
- 为 `ResolveFontPaths` 增加启动期自检日志，部署时即发现字体问题；
- 统一后端错误文案的中英文策略（i18n 资源化）。
