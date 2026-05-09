# 2026-05-09 — PDF 预览样式全量升级设计

> 本文档为 [`C:\Users\Administrator\.claude\plans\pdf-pdf-pdf-quizzical-muffin.md`](../../) 的最终落地记录。  
> 实施分支基线：`main` @ `164ef47`（"feat(scripts): 新增生产环境启动脚本"）。

## Why

项目里历史遗留两套 PDF 生成路径，视觉水平断层：

- **`reports` 包**（报表中心）使用 `gofpdf`，已有 hero / 卡片 / 表格基础，但配色（Flat UI 蓝 `#3498DB` + Material 紫 `#667EEA`）与前端 Tailwind 体系脱节，且无图表/封面/目录。
- **`monitoring` 包**（监控中心）走 `monitoring/report.go::buildSimplePDF`，**手工拼装 PDF 1.4 字节流**，仅 Helvetica Type-1 单字体；`sanitizePDFLine` 把所有非 ASCII 字符（含中文）替换为 `?`，导致 `"监控报告"` → `"??"`，所有 section 用 `[Stats Overview]` 等英文字面字符串。

前端无任何 PDF 渲染依赖（jspdf / react-pdf / pdfjs / html2canvas 全无），`ReportPreviewModal.tsx` 用 `<iframe src={blobUrl}>` 把 PDF 交给浏览器原生 viewer。**「PDF 预览样式」≡「后端生成的 PDF 文件本身的样式」**，所有审美升级必须在 Go 侧完成。

本次目标：消灭监控 PDF 的中文乱码 + 把两个出口统一到一个现代化、品牌化的渲染体系，配色对齐前端 Tailwind/shadcn。

## How

### 1. 新建 `pdfkit/` 子包（`backend-go/internal/reports/pdfkit/`）

> 全局规则 Layer 2.2 要求每层文件夹 ≤ 8 个文件，`reports/` 已有 9 个 Go 文件。新增 PDF 能力下沉到子包，避免顶层文件数继续恶化，且让 `monitoring` 等其他模块可以单独 import `pdfkit` 而不绕路 `reports`。

| 文件 | 角色 |
|---|---|
| `tokens.go` | Tailwind v4 对齐色板（indigo/emerald/amber/rose/slate）+ 间距 + 字号 + 语义别名（ColorPrimary / ColorSuccess / ...） |
| `fonts.go` | CJK + Latin 双字体注册；环境变量覆盖；`.ttf-only` 候选（gofpdf v1.4.3 拒绝 .ttc/.otf） |
| `chrome.go` | `WriteCoverPage` / `WriteTableOfContents` / `WriteChapterDivider` / 渐变与点线 helper |
| `components.go` | `WriteHeroBanner` / `SectionTitle` / `WriteStatCardRow` / `ProgressBar` / `WriteSoftTable` / `EmptyState` / `PageFooter` |
| `charts.go` | `RenderDonutChart` / `RenderBarChart` / `RenderLineChart` + `EmbedChart` + LRU PNG 缓存（cap=64） |
| `monitoring.go` | `MonitoringPDFInput` 类型 + `RenderMonitoringPDF(path, input)` 端到端入口 |

### 2. 设计 tokens 对齐表

| 场景 | 旧值 | 新值（Tailwind 对齐） | Token |
|---|---|---|---|
| 主品牌色 | `#3498DB` | `#6366F1` | `ColorIndigo500` / `ColorPrimary` |
| 强调色 | `#667EEA` | `#4F46E5` | `ColorIndigo600` / `ColorPrimaryStrong` |
| 成功 | `#4CAF50` | `#10B981` | `ColorEmerald500` / `ColorSuccess` |
| 警告 | `#FF9800` | `#F59E0B` | `ColorAmber500` / `ColorWarning` |
| 危险 | `#F44336` | `#F43F5E` | `ColorRose500` / `ColorDanger` |
| 文字 | `#2C3E50` | `#0F172A` | `ColorSlate900` / `ColorText` |
| 弱化文字 | `#7F8C8D` | `#64748B` | `ColorSlate500` / `ColorTextMuted` |
| 边框 | `#E2E8F0` | `#E2E8F0` ✓ | `ColorSlate200` / `ColorBorder` |
| 卡片背景 | `#F8FAFC` | `#F8FAFC` ✓ | `ColorSlate50` / `ColorSurfaceMuted` |

### 3. 字体策略

`gofpdf v1.4.3` 的 UTF8 字体加载器（`utf8fontfile.go:106`）**拒绝 .ttc 与 .otf** —— 错误信息只有 `not supported`，无任何提示。我们：

- 候选列表只保留 `.ttf` 文件（Windows: SimHei/SimSun/Arial；Linux: WenQuanYi MicroHei/DejaVu/Liberation/Inter）
- 环境变量 `REPORT_PDF_FONT_CJK_PATH` / `REPORT_PDF_FONT_LATIN_PATH` 显式覆盖；保留 legacy `REPORT_PDF_FONT_PATH` 兼容
- 同时注册三个字体族：`cjk`（中文）、`latin`（西文/数字）、`report`（向后兼容旧调用点）
- Latin 字体不可用时自动 alias 到 CJK，调用 `SetFont("latin", ...)` 不会 panic

### 4. 监控 PDF 迁移

删除 `monitoring/report.go` 中的：
- `buildSimplePDF` / `buildPDFContent` / `escapePDFString` / `sanitizePDFLine`
- `buildReportLines` / `formatMonitoringAlertLine` / `reportTimeRangeLabel` / `reportSectionLabels`
- `truncateLines` / 常量 `maxPDFLines = 45`

新流程：
```
ExportMonitoringReport
   └─ renderMonitoringReport (csv | excel | pdf)
        └─ renderMonitoringReportPDF
             ├─ os.CreateTemp 拿临时文件路径
             ├─ buildMonitoringPDFInput 把 MonitoringReportData → pdfkit.MonitoringPDFInput
             ├─ pdfkit.RenderMonitoringPDF(path, input)
             │     ├─ RegisterFonts
             │     ├─ WriteHeroBanner（标题 + 副标题 + chips + INSPECT 角标）
             │     ├─ SectionTitle("统计概览") + WriteStatCardRow（白底 + 顶色条 + 大数字）
             │     ├─ SectionTitle("性能趋势") + go-chart LineChart
             │     ├─ SectionTitle("网络流量") + go-chart LineChart
             │     └─ SectionTitle("告警记录") + WriteSoftTable
             └─ os.ReadFile 返回字节给 ExportMonitoringReport 现有契约
```

### 5. 报表中心图表接入

| 函数 | 接入位置 | 图表 |
|---|---|---|
| `writeInspectionPDF` | `writePDFProgressBar` 后 | DonutChart（通过/警告/失败/错误占比） |
| `writeStatisticsPDF` | "设备类型分布" 表格前 | BarChart |
| `writeStatisticsPDF` | "位置分布" 表格前 | BarChart |
| `writeDeviceSummaryPDF` | metric cards 后 | DonutChart（在线/告警/离线） |

每个 helper（`embedInspectionDonut` / `embedDistributionBar` / `embedDeviceSummaryDonut`）都是 best-effort：图表渲染失败不影响表格输出，确保 PDF 永远能产出。

### 6. PNG 缓存

go-chart 渲染单次 ~5-15ms，但同一报表里同 spec 可能被多次调用（监控 PDF 的性能折线图在 stats / charts 两个 section 都引用了相同数据）。`pdfkit/charts.go` 提供：
- spec 哈希（`sha1` of 字段串拼，按 chart kind 前缀避免跨类型碰撞）
- map + 顺序数组实现的简单 cap-bounded 缓存（cap=64，超限时一次性 evict 8 个最老的）
- 同 PNG 在同一 PDF 内重复 `EmbedChart` 时，gofpdf v1.4.3 的 `RegisterImageOptionsReader` 已内部幂等（`fpdf.go:3168-3171`），不需要额外去重

## Verification

| 测试 | 结果 |
|---|---|
| `tests/backend-go/internal/reports/...` | ✓ pass（含新增 `pdfkit_test.go` 覆盖 chart/cover/table 单测） |
| `tests/backend-go/internal/monitoring/...` | ✓ pass（`report_pdf_template_test.go` 已切到结构性断言：`%PDF-` + `/Type /Page` + `/Font` + size ≥ 8KB） |
| `go vet ./internal/reports/...` | ✓ no issues |
| 现有 dashboard 测试 | ✗ pre-existing failure（与本次改动无关，notification dedupe 逻辑） |

手动验证步骤（实施时执行）：
```powershell
# 启动后端
.\scripts\dev-start.ps1 -Services backend
# 触发监控 PDF 导出（中文标题 + 折线图 + 告警表格）
curl -X POST http://localhost:8080/api/v1/monitoring/reports/export `
  -H "Authorization: Bearer $TOKEN" `
  -d '{"format":"pdf","time_range":"24h","sections":["stats","charts","alerts"]}'
# 触发报表中心三种 PDF（inspection / statistics / device_summary）
# 用浏览器打开 4 份 PDF，肉眼检查：
#  - 标题/章节中文不再是 ??
#  - 配色统一（indigo 主色，emerald/amber/rose 状态色）
#  - 图表正确渲染（环形/柱状/折线）
#  - 字体清爽（CJK + Latin 配对）
#  - 表格仅水平线 + slate-50 zebra
```

## Trade-offs

| 决策 | 理由 |
|---|---|
| `pdfkit` 子包而非顶层文件 | 满足 Layer 2.2 文件数约束；让 monitoring 反向依赖 reports 子包不需要导入整个 reports |
| 用 `RGB [3]int` 而非自定义 Color struct | gofpdf 原生接收 3 个 int，零转换开销；现有调用点保持兼容 |
| 仅 .ttf 字体（不支持 .ttc） | gofpdf v1.4.3 限制；候选列表里 SimHei/SimSun/WenQuanYi 都有 .ttf 版本足够覆盖主流场景 |
| 渐变用堆叠矩形模拟 | gofpdf 无原生渐变；40 个 band 在 PDF 默认 zoom 下平滑，hairline 通过 0.05mm 重叠消除 |
| dotted leader 用小圆点 | gofpdf v1.4.3 无 dash pattern 接口 |
| PNG 缓存 cap=64 简单 FIFO | 单 PDF 通常 <10 张图；cap 上限内存 <6MB；避免引入 hashicorp/golang-lru 依赖 |
| 测试断言不查 PDF 内文 | 新流程走 gofpdf 的 stream 编码，CJK 字符在压缩后无法直接 substring 匹配；改为查结构性 marker（`/Type /Page` / `/Font` / size 下限）更稳健 |

## Risks & Rollback

| 风险 | 缓解 |
|---|---|
| 容器/CI 环境缺中文字体 | `RegisterFonts` 返回明确错误 + 测试 `t.Skip` 兜底；生产 Dockerfile 应预装 `fonts-noto-cjk` 并设 `REPORT_PDF_FONT_CJK_PATH` |
| go-chart 渲染失败 | 嵌入 helper 全部 best-effort，错误时跳过图表只画表格 |
| 短报告封面页让单页变两页 | `WriteCoverPage` / `WriteTableOfContents` 都不在主流程里强制启用，仅在显式调用时生成 |
| monitoring 反依赖 reports | 已确认 reports 不依赖 monitoring，无循环 |

**回滚**：所有改动都集中在 `pdfkit/` 子包 + `monitoring/report.go` 一个文件 + 一个测试，`git revert` 单次 commit 即可回到旧 `buildSimplePDF` 路径。

## What's Next

- 截图前后对比附 PR 描述（实施完成后补充）
- `pdfkit` 后续可扩展：BulletChart（达成率）、Sparkline 表格内嵌、Footer 二维码（报告唯一标识）
- 前端 `ReportPreviewModal.tsx` 当前是 iframe + 浏览器内置 viewer；如果用户希望更可控的预览（缩放控件、缩略图、暗色模式），可考虑引入 PDF.js（~1MB 依赖），不在本次范围
