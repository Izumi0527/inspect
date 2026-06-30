# 巡检模板全流程因果链审计报告（模板"未真正生效"问题）

- 日期：2026-06-30
- 任务性质：纯代码审计，**未修改任何代码**
- 项目状态：开发阶段，未发布/未部署，无历史数据与兼容负担（修复可彻底重构）
- 用户现象：选不同巡检模板（如"基础设备巡检"），巡检报告里的项目却总是一样、且"基础"模板也输出一大堆并不需要的内容，疑似模板没生效。

---

## 一、结论先行（TL;DR）

主链路是**忠实闭环**的：模板"创建 → 存储 → 策略绑定 → 触发 → 取 templateID → 按 CheckItems 执行 → 每项一条 inspection_results"每一环都真实使用了所选模板，巡检确实按模板项执行并逐项落库。**不存在"模板 ID 丢失/被覆盖/前端写死结果"这类断点。**

用户感知到的"模板没生效 / 都一样 / 一大堆"，是**三个叠加的设计缺陷**造成的，而非主链路断裂：

1. **模板内容本身高度雷同、无区分度，且命名名不副实**（数据/内容问题）。
2. **导出报告（PDF/Word/Excel）在每台设备段硬编码渲染 CPU/内存/接口/温度等"性能指标"，数据取自 `devices` 表当前快照，与本次巡检模板与结果完全无关** —— 这是"一大堆不需要内容"的主要观感来源，且属于"设备现状冒充巡检结果"的张冠李戴（**核心造假痕迹**）。
3. **执行端只实现 icmp/snmp 两类检查，其余类型（ssh/http/script）静默跳过**（代码注释自认），模板若配了这些类型即"配了不执行"。

---

## 二、全流程因果链逐环判定（附证据）

| 环节 | 判定 | 证据（文件:行） |
|---|---|---|
| 1. 模板创建（前端组装 checkItems） | 忠实 | `QuickTemplateCreate.tsx:49-89` 预设项真实；自定义见 `CreateTemplateWizard.tsx`，checkItems 可配置 |
| 2. 模板提交（前端→后端 payload） | 忠实 | `inspection.api.ts` check_items 完整序列化 |
| 3. 模板存储（后端落库） | 忠实 | `inspection_templates.go:123 readJSONColumn` → `service.CreateTemplate`，原样 marshal 进 `inspection_templates.check_items(jsonb)` |
| 4. 内置模板同步 | 忠实但**内容雷同** | `builtin_templates.go:147 EnsureBuiltinTemplates` 启动幂等 upsert；但 `builtinTemplateSeeds()` 仅 4 个模板，CheckItems 全部来自同一 `vrpStyleCheckItems()`（8 项），华为/H3C 仅 OID 不同 |
| 5. 策略绑定模板 | 忠实 | `inspection_strategies.go:105/171` 读 templates[]；`StrategyModal.tsx:268` 单选写入 |
| 6. 触发取 templateID | 忠实 | `inspection_strategies.go:267-296`：`templates := decodeJSONIntSlice(strategy.Templates)` → `templateID := &templates[0]` → `CreateInspections(TemplateID)` → `go executeInspectionsAsync(inspections, templateID)` |
| 7. 执行加载模板 CheckItems | 忠实 | `inspection_execution.go:25-37`：`templateID!=nil` → `GetTemplate` → `checkItems = decodeJSONMapSlice(template.CheckItems)` |
| 8. 逐项执行 | 忠实（每模板项 1 条结果） | `inspection_execution.go:283-345 executeCheckItems`：`for item := range checkItems` 各产 1 条 `Result`；`SaveInspectionResult` 落 `inspection_results` |
| 9. 执行详情（前端弹窗） | 忠实 | `inspection_tasks.go:410 GetExecution` → `ListResultsByInspectionID` → `buildExecutionSummary`；`ExecutionDetailModal.tsx:420-477` 只渲染 `deviceResults[].checkResults` |
| 10. 导出报告检查项块 | 忠实 | `report_data.go:503-506` `SELECT ... FROM inspection_results WHERE inspection_id IN`；`report_render_pdf.go:123-140` `if len(CheckResults)>0` 才渲染 |
| 11. **导出报告性能块** | **不忠实（核心问题）** | `report_data.go:445-451` `LEFT JOIN devices d ... d.cpu_usage, d.memory_usage`；`:481-485` 从 `device_interfaces` 统计接口；`:600-605` 塞入 `Performance`；`report_render_pdf.go:116-118`、`report_render_excel.go:300-332` **无条件**渲染"CPU/内存/接口/温度/运行时间" |

**因果闭环判定**：第 1–10 环忠实闭环（巡检按模板执行、结果按模板落库、详情按结果展示）。**断点在第 11 环**：导出报告把"设备表当前快照"作为固定维度强行拼进每台设备的报告段，与模板与本次 inspection_results 无关。

---

## 三、敷衍 / 简化 / 造假痕迹清单（用户特别要求彻查）

1. **【造假·张冠李戴】报告性能块冒充巡检结果**
   `report_data.go:445-451/481-485/600-605` 与 `report_render_pdf.go:116-118`、`report_render_excel.go:300-332`。报告每台设备无条件输出 CPU/内存/接口/温度，数据来自 `devices` 表（由定时采集写入的"最近快照"）和 `device_interfaces`，**不是本次巡检采集、也不受模板约束**。这是用户"基础模板也输出一大堆"的主因，且把"设备现状"伪装成"巡检结果"。

2. **【内容造假·无区分度】模板雷同 + 命名名不副实**
   - 内置：`builtin_templates.go:108-139` 仅 4 个模板，CheckItems 全为同一套 8 项（连通性/SNMP/CPU/内存/温度/运行时间/接口/带宽），华为与 H3C 只是 OID 不同。
   - 前端预设：`QuickTemplateCreate.tsx:63-88` "防火墙基础巡检"与"服务器基础巡检"的 checkItems **完全相同**；"网络设备基础巡检"也高度重合。
   - 命名：三者皆称"基础巡检"，却都含 CPU/内存（内置 8 项含温度/带宽）。"基础 = 只在线"在系统中不存在对应模板。→ 用户在这些模板间切换，结果自然几乎一致。

3. **【死代码·占位】废弃解码器残留**
   `inspection_helpers.go:201-206`：`decodeJSONMapSliceLegacy` 与 `decodeJSONMapSliceUnused`（后者直接 `return nil`）。真正被调用的是 `decodeJSONMapSlice`（正确），但保留这两个无用函数是典型敷衍痕迹。

4. **【简化·掩盖】模板为空时静默回退默认项**
   `inspection_execution.go:95-113 normalizeInspectionCheckItems`：当 checkItems 为空时**静默**返回固定的 ICMP+SNMP 两项，而不报错。若模板解码失败/为空，会被掩盖成"看起来在跑默认巡检"，掩盖模板未加载。

5. **【简化·吞错误】报告查询忽略 error**
   `report_data.go:503` 等多处 `_ = db...Scan(&...).Error`，查询失败被丢弃，报告静默产出空/残缺内容，无任何告警。

6. **【执行侧敷衍】非 icmp/snmp 类型静默跳过**
   `builtin_templates.go:27-28` 注释自认："type 仅用 icmp / snmp（ssh/http/script 当前会被后端跳过）"；对应 `inspection_execution.go:317-326 executeCheckItems` 的 `default: result.Status = "skip"`。若前端允许用户配置 ssh/http/script 检查项，则属"前端可配、后端不执行"。

7. **【耦合脆弱】SNMP 检查项靠"名称关键词"分派**
   `inspection_execution.go:444-466 executeSNMPCheck` 用 itemName 是否含"cpu/内存/接口/温度/带宽"等中文关键词决定查哪个指标；`builtin_templates.go:29-31` 注释明确"名称中的关键词不可随意更改""带宽项不能叫接口带宽以免被接口分支抢匹配"。这意味着用户改个名称就可能让检查项落入 `default` 分支（仅报"SNMP 服务正常"），是隐蔽的脆弱点。

---

## 四、根因归纳

- **直接根因（观感"一大堆/都一样"）**：报告渲染层（痕迹 1）无条件输出与模板无关的设备性能块 + 模板内容雷同（痕迹 2）。两者叠加，使"换模板"在报告上几乎看不出差异，且精简模板也被撑出一堆固定维度。
- **结构性根因**：报告数据模型把"巡检结果"（inspection_results，随模板变化）与"设备现状"（devices 快照，固定维度）混为一谈，且后者被硬编码进每台设备段；模板体系（内置 + 预设）未做真正的差异化设计。
- **诚信类根因**：痕迹 1/3/4/5/6 共同表现为"以看起来完成来替代真正按模板执行/输出"，即用户所指"敷衍/简化/造假"。

---

## 五、修复方向建议（开发阶段，可彻底重构，无兼容负担）

> 仅为方向，**本次不实施**。利用"无历史数据/无兼容负担"，建议直接做干净实现：

1. **报告性能块改为由模板/结果驱动**：报告每台设备渲染的检查项，**只来自 inspection_results**；CPU/内存/接口/温度等仅当模板包含对应检查项、且本次确有采集结果时才输出。删除 `report_data.go` 中对 `devices.cpu_usage/memory_usage` 与 `device_interfaces` 的固定拼接（或将其降级为可选的"设备档案"附录，并明确标注非本次巡检数据）。
2. **模板体系差异化**：重做内置/预设模板，使"基础/标准/全面"等档位的 checkItems 真正不同；提供名副其实的"仅在线状态"精简模板。删除华为/H3C 仅 OID 不同却各算一个模板的冗余设计（OID 应由后端厂商注册表按设备厂商解析，模板只描述"检查什么"）。
3. **去掉静默回退与吞错误**：`normalizeInspectionCheckItems` 改为：模板存在但 checkItems 为空/解码失败时，**显式将任务标记失败并记录原因**，而非静默套默认项；报告查询的 `error` 必须处理并上报。
4. **检查项分派去关键词化**：以 checkItem 的稳定 `id`/`type`/`metric` 字段（而非中文名称）分派指标，消除"改名即失效"的脆弱点。
5. **类型支持对齐前后端**：ssh/http/script 要么后端实现，要么前端模板表单禁止选择并明确标注"暂不支持"。
6. **清理死代码**：删除 `decodeJSONMapSliceLegacy`/`decodeJSONMapSliceUnused`。

---

## 六、需用实际运行/数据进一步确认的点（代码层无法 100% 断定）

1. 用户口中的"基础设备巡检"具体对应哪条记录（最接近前端预设"网络设备基础巡检"=4 项，或某个内置 8 项模板）——需查 `inspection_templates` 表实际数据。
2. 某次具体巡检的 `inspection_results` 实际条数，以验证"是否真的逐项=模板项数"（代码逻辑已确证，建议运行期抽样核对一次）。
3. 报告中 CPU/内存若显示为 0/空，是否叠加了此前"凭据脱敏导致 SNMP 采集失败"的问题（devices 快照本身就是 0）——两问题会互相放大观感。

---

## 附：关键代码位置索引

- 触发取模板：`backend-go/internal/http/handlers/inspection_strategies.go:252-298`
- 执行加载/逐项执行：`backend-go/internal/http/handlers/inspection_execution.go:20-43, 95-113, 142-345`
- 模板存储：`backend-go/internal/http/handlers/inspection_templates.go:102-145`
- 内置模板：`backend-go/internal/inspection/builtin_templates.go:33-221`
- 报告数据组装：`backend-go/internal/reports/report_data.go:418-610`
- 报告渲染硬编码：`backend-go/internal/reports/report_render_pdf.go:116-140`、`report_render_excel.go:300-332`
- 前端预设模板：`frontend/src/features/inspection/components/QuickTemplateCreate.tsx:48-89`
- 前端详情渲染：`frontend/src/features/inspection/components/ExecutionDetailModal.tsx:414-547`


---

## 七、实施后修订说明（2026-07-01，重构落地后回填）

实施核实阶段发现分析阶段有两处判断需更正，特此诚实回填：

1. **痕迹 3「死代码 decodeJSONMapSliceLegacy / decodeJSONMapSliceUnused」实为误报，予以撤销。**
   经 grep 权威核实，`inspection_helpers.go` 中只有实现正确的 `decodeJSONMapSlice`，并不存在 Legacy/Unused 这两个函数。原判断源自一次工具读取的渲染损坏输出（行号重叠、内容错乱）。本次重构未发现该死代码，故无需清理。

2. **report_data.go 的 `InspectionPerformanceMetrics`（每设备 CPU/内存/接口）已停止渲染，但结构与填充暂留为内部死数据。**
   重构已从全部巡检报告渲染层（PDF/Word/Excel）移除该性能块展示，并修复 `inspection_results` 查询的吞错误。但 `report_data.go` 仍计算 `InspectionPerformanceMetrics`（不再被任何渲染引用）。鉴于该文件存在工具读取限制、连锁删除风险较高，登记为低优先级后续清理项。统计报表的 `PerformanceStats` 为独立合法功能，未受影响。

## 八、实施结果对照（痕迹 → 处置）

- 痕迹 1（报告硬编码性能块/张冠李戴）→ 已修复：渲染层只输出 inspection_results 驱动的检查项。
- 痕迹 2（模板雷同 + 命名名不副实）→ 已修复：内置/前端预设统一为「连通性 / 基础健康 / 标准 / 全面」4 档，厂商无关、含名副其实的「仅在线」连通性档。
- 痕迹 3（死代码）→ 误报，撤销（见上）。
- 痕迹 4（normalize 静默回退）→ 已修复：改为模板无有效检查项时显式判任务失败。
- 痕迹 5（report 吞错误）→ 已修复 inspection_results 主查询；统计概览的容错查询按设计保留。
- 痕迹 6（ssh/http/script 静默跳过）→ 已对齐：ssh/http 真实实现；script 出于安全前端禁选 + 后端显式拒绝。
- 痕迹 7（SNMP 名称关键词分派）→ 已修复：改为按稳定 metric 字段分派，改名不影响。
