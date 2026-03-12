# 巡检管理完善与定时策略落地 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让“巡检管理”页面的模板/策略/执行/统计链路在前后端真正闭环可用：修复模板 `device_types` 契约不一致、复制模板丢字段/失败、执行历史与策略无法关联、评分失真、Tailwind 生产样式缺失；并**落地定时策略自动触发**（兼容前端 Quartz 风格 Cron）。

**Architecture:** 保持现有“手动触发 → 创建 inspections → 异步执行 → 写入 inspection_results → WS 推送进度”的执行引擎不推倒重来；在后端新增“策略定时调度器”周期扫描 `inspection_strategies`，基于 Cron 计算 `next_run_time` 并到点触发执行。模板侧采用“兼容双形态”策略：`device_types` 支持数组/对象两种存储，API 统一对外输出 `deviceTypes: string[]`，前端 transform 与后端过滤同时兼容，避免依赖数据库迁移。

**Tech Stack:** Next.js 15 / React / TypeScript / React Query / Jest；Go(Echo) / GORM / PostgreSQL(JSONB) / robfig/cron；WS 推送（room=`scan_progress`）

---

## ✅ 验收标准（必须全部满足）

1. **模板列表筛选有效**：在内置模板（`device_types` 为对象）场景下，前端“厂商/设备类型”筛选能正确过滤出对应模板。
2. **模板详情字段完整**：模板详情中检查项 `config.unit`、`config.parsePattern` 等字段不再被前端丢弃；复制/导出/导入后字段保持一致。
3. **复制模板可用**：前端点击“复制模板”走后端 `POST /inspection/templates/:id/copy`，复制成功且不触发校验失败。
4. **执行历史可按策略关联**：手动触发/定时触发都会把执行记录关联到策略；`GET /inspection/executions?strategy_id=...` 返回该策略下的执行记录。
5. **评分不因 skip 失真**：后端评分计算不把 `skip` 计入分母（避免暂不支持的检查类型把分数拉低）。
6. **定时策略真正生效**：创建“定时巡检”策略后，后端会计算并维护 `next_run_time`；到点自动触发执行，并通过 WS 推送进度。
7. **生产样式稳定**：巡检统计与模板向导里不再使用 Tailwind 动态拼接 class，生产构建不丢颜色样式。
8. **文档契约一致**：`docs/api/template-api.md`、`docs/api/websocket-contract.md`、`docs/flows/inspection-strategy-flow.md` 与实现一致。

## ⚠️ 关键约束/约定

- **禁止直接引入数据库迁移作为前置条件**：优先“兼容双形态”让现网数据立刻可用。
- 后端对 `device_types` 的**推荐写入格式**：`string[]`（仅设备类型），但必须兼容历史对象格式：`{"vendors":[...],"device_types":[...]}`。
- 前端 Cron 目前为 Quartz 风格（含秒与 `?`）；后端统一**规范化为 5 段 Cron**再计算调度时间。
- 执行时的 `git commit` 属于高风险操作：**执行阶段需先获得明确确认**（本计划文档仅给出建议提交点）。

---

### Task 1: 后端-为 `device_types` 双形态解码写失败测试

**Files:**
- Create: `tests/backend-go/internal/http/handlers/inspection_template_device_types_test.go`

**Step 1: Write the failing test**

- 使用 `go:linkname` 访问 `buildTemplateResponse`（当前不支持对象形态，会把 `deviceTypes` 解码为空数组）。
- 用一个 `inspection.Template{DeviceTypes: datatypes.JSON(<object-json>)}` 断言返回的 `deviceTypes` 至少包含 `router`。

**Step 2: Run test to verify it fails**

Run:
`cd "tests/backend-go"; go test "./internal/http/handlers" -run "TestBuildTemplateResponse_ShouldDecodeDeviceTypesObject" -count=1`

Expected: FAIL（`deviceTypes` 为空或不含 `router`）

**Step 3: Write minimal implementation**

- 暂不实现（留到 Task 2）

**Step 4: Run test to verify it passes**

- 暂不执行（留到 Task 2）

**Step 5: Commit**

```bash
git add "tests/backend-go/internal/http/handlers/inspection_template_device_types_test.go"
git commit -m "test(inspection): lock template device_types decoding"
```

---

### Task 2: 后端-实现 `buildTemplateResponse` 兼容对象/数组两种 `device_types`

**Files:**
- Modify: `backend-go/internal/http/handlers/inspection.go`
- Test: `tests/backend-go/internal/http/handlers/inspection_template_device_types_test.go`

**Step 1: Write the failing test**

- 复用 Task 1（已失败）

**Step 2: Run test to verify it fails**

Run:
`cd "tests/backend-go"; go test "./internal/http/handlers" -run "TestBuildTemplateResponse_ShouldDecodeDeviceTypesObject" -count=1`

Expected: FAIL

**Step 3: Write minimal implementation**

- 在 `buildTemplateResponse` 内对 `template.DeviceTypes`：
  1) 先尝试 `[]string` 解码；
  2) 失败则尝试解码为 `inspection.DeviceTypesConfig`，取 `DeviceTypesConfig.DeviceTypes` 作为对外 `deviceTypes/device_types`。

建议实现片段（示意）：

```go
var deviceTypes []string
if err := json.Unmarshal(template.DeviceTypes, &deviceTypes); err != nil {
  var cfg inspection.DeviceTypesConfig
  if err2 := json.Unmarshal(template.DeviceTypes, &cfg); err2 == nil {
    deviceTypes = cfg.DeviceTypes
  } else {
    deviceTypes = []string{}
  }
}
```

**Step 4: Run test to verify it passes**

Run:
`cd "tests/backend-go"; go test "./internal/http/handlers" -run "TestBuildTemplateResponse_ShouldDecodeDeviceTypesObject" -count=1`

Expected: PASS

**Step 5: Commit**

```bash
git add "backend-go/internal/http/handlers/inspection.go" "tests/backend-go/internal/http/handlers/inspection_template_device_types_test.go"
git commit -m "fix(inspection): decode template device_types object format"
```

---

### Task 3: 后端-模板列表过滤兼容对象/数组两种 `device_types`

**Files:**
- Modify: `backend-go/internal/inspection/service.go`
- (Optional) Create: `tests/backend-go/internal/inspection/templates_filter_sql_test.go`

**Step 1: Write the failing test**

- 如果采用“SQL 断言”方式：在 DryRun 模式下构造 `gorm.DB`，调用 `Service.List`，断言生成 SQL 同时包含：
  - `jsonb_typeof(device_types) = 'array' AND device_types @> ...`
  - `jsonb_typeof(device_types) = 'object' AND (device_types->'device_types') @> ...`

**Step 2: Run test to verify it fails**

Run:
`cd "tests/backend-go"; go test "./internal/inspection" -run "TestListTemplates_ShouldFilterDeviceTypesForArrayAndObject" -count=1`

Expected: FAIL（SQL/条件缺失）

**Step 3: Write minimal implementation**

- 在 `Service.List` 的 `filters.DeviceType` 分支，将单一 `device_types @> ...` 改为“数组/对象并列 OR”过滤：
  - 数组：`device_types @> '["router"]'`
  - 对象：`COALESCE(device_types->'device_types','[]'::jsonb) @> '["router"]'`
- 在 `filters.Vendor` 分支，保留 name/description ILIKE 的同时，补充对象形态 vendor 过滤：
  - `COALESCE(device_types->'vendors','[]'::jsonb) @> '["Cisco"]'`

**Step 4: Run test to verify it passes**

Run:
`cd "tests/backend-go"; go test "./internal/inspection" -run "TestListTemplates_ShouldFilterDeviceTypesForArrayAndObject" -count=1`

Expected: PASS

**Step 5: Commit**

```bash
git add "backend-go/internal/inspection/service.go" "tests/backend-go/internal/inspection/templates_filter_sql_test.go"
git commit -m "fix(inspection): support device_types object filtering in templates list"
```

---

### Task 4: 前端-模板 transform 兼容对象 `device_types`，并保留检查项 config 全字段（先写失败测试）

**Files:**
- Create: `tests/frontend/inspection/api/inspection.api.test.ts`
- Modify: `frontend/src/features/inspection/api/inspection.api.ts`
- Modify: `frontend/src/features/inspection/types/index.ts`

**Step 1: Write the failing test**

- mock `@/lib/api-client` 的 `api.get`，让 `fetchInspectionTemplate()` 返回：
  - `device_types: { vendors: ["Cisco"], device_types: ["router"] }`
  - `check_items` 中包含 `config.unit`、`config.parsePattern`、`config.oid_used/oid_free` 等字段
- 断言：
  - `result.deviceTypes` 为 `["router"]`
  - `result.checkItems[?].config.unit`、`parsePattern` 等仍存在（未被丢弃）

**Step 2: Run test to verify it fails**

Run:
`pnpm -C "frontend" test -- --runInBand "tests/frontend/inspection/api/inspection.api.test.ts"`

Expected: FAIL（`deviceTypes` 为空、或 `config.unit/parsePattern` 丢失）

**Step 3: Write minimal implementation**

1) 扩展类型允许保留额外字段：

在 `CheckItemConfig` 增加索引签名与常用字段（至少 `unit`、`parsePattern`）：

```ts
export interface CheckItemConfig {
  oid?: string
  oid_used?: string
  oid_free?: string
  unit?: string
  parsePattern?: string
  [key: string]: unknown
}
```

2) `transformTemplateData` 对对象形态提取 `device_types.device_types`：
- 当 `data["device_types"]` 为对象时，取其 `device_types` 字段作为 `deviceTypes`

3) `mapCheckItem` 改为“以原始 config 为底座”，只做必要的规范化（timeout/threshold/expectedValue），**不要丢弃未知字段**：

```ts
const config: InspectionCheckItem['config'] = { ...configRecord }
// 再补齐 expectedValue/threshold 等规范化字段
```

**Step 4: Run test to verify it passes**

Run:
`pnpm -C "frontend" test -- --runInBand "tests/frontend/inspection/api/inspection.api.test.ts"`

Expected: PASS

**Step 5: Commit**

```bash
git add "frontend/src/features/inspection/api/inspection.api.ts" "frontend/src/features/inspection/types/index.ts" "tests/frontend/inspection/api/inspection.api.test.ts"
git commit -m "fix(inspection): preserve template check item config and device_types object"
```

---

### Task 5: 后端-放宽 SNMP 校验以兼容 `oid_used/oid_free` 与“无 OID 的 SNMP 连通性检查”（TDD）

**Files:**
- Create: `tests/backend-go/internal/inspection/validator_snmp_test.go`
- Modify: `backend-go/internal/inspection/validator.go`

**Step 1: Write the failing test**

在测试中调用：

```go
v := inspection.NewTemplateValidator(&inspection.Service{})
err := v.ValidateSNMPConfig(map[string]interface{}{"oid_used": "1.3.6.1.4.1.9.9.48.1.1.1.5", "oid_free": "1.3.6.1.4.1.9.9.48.1.1.1.6"})
```

断言 `err == nil`；并增加：
- `config` 为空 map 时也应 `err == nil`
- `oid_used` 非法格式时应返回 `ValidationError`（Field 指向对应 key）

**Step 2: Run test to verify it fails**

Run:
`cd "tests/backend-go"; go test "./internal/inspection" -run "TestValidateSNMPConfig_" -count=1`

Expected: FAIL（当前强制 `oid` 必填）

**Step 3: Write minimal implementation**

- 修改 `ValidateSNMPConfig`：
  - 若存在 `oid`：按原规则校验
  - 否则若存在 `oid_used/oid_free`（支持 snake 与 camel）：分别校验格式
  - 若以上均不存在：直接返回 nil（表示“SNMP 连通性/采集型检查”）

**Step 4: Run test to verify it passes**

Run:
`cd "tests/backend-go"; go test "./internal/inspection" -run "TestValidateSNMPConfig_" -count=1`

Expected: PASS

**Step 5: Commit**

```bash
git add "backend-go/internal/inspection/validator.go" "tests/backend-go/internal/inspection/validator_snmp_test.go"
git commit -m "fix(inspection): relax snmp config validation for builtin templates"
```

---

### Task 6: 前端-模板复制改为调用后端 copy API（避免“拉取再创建”导致字段丢失/校验失败）

**Files:**
- Modify: `frontend/src/features/inspection/api/inspection.api.ts`
- Modify: `frontend/src/features/inspection/hooks/useInspection.ts`
- (Optional) Test: `tests/frontend/inspection/api/inspection.api.test.ts`

**Step 1: Write the failing test**

- 为 `copyInspectionTemplate(id,name)` 增加测试：断言 `api.post` 被调用到 `/inspection/templates/:id/copy`，并返回 transform 后模板。

**Step 2: Run test to verify it fails**

Run:
`pnpm -C "frontend" test -- --runInBand "tests/frontend/inspection/api/inspection.api.test.ts"`

Expected: FAIL（函数不存在或 hook 仍走 create）

**Step 3: Write minimal implementation**

- 在 `inspection.api.ts` 新增：
  - `export async function copyInspectionTemplate(id: number, name?: string): Promise<InspectionTemplate>`
- 修改 `useCloneTemplate`：直接调用 `copyInspectionTemplate(Number(id), name)`，不再 `fetch + create`。

**Step 4: Run test to verify it passes**

Run:
`pnpm -C "frontend" test -- --runInBand "tests/frontend/inspection/api/inspection.api.test.ts"`

Expected: PASS

**Step 5: Commit**

```bash
git add "frontend/src/features/inspection/api/inspection.api.ts" "frontend/src/features/inspection/hooks/useInspection.ts" "tests/frontend/inspection/api/inspection.api.test.ts"
git commit -m "fix(inspection): use backend template copy endpoint"
```

---

### Task 7: 后端-手动触发也写入 `schedule_id=strategy_id`，修复执行历史按策略关联

**Files:**
- Modify: `backend-go/internal/http/handlers/inspection.go`
- (Optional) Create: `tests/backend-go/internal/http/handlers/inspection_trigger_strategy_association_test.go`

**Step 1: Write the failing test**

- 以 linkname 或 handler 单测方式断言：触发策略创建 inspections 时 `ScheduleID` 不为 nil。

**Step 2: Run test to verify it fails**

Run:
`cd "tests/backend-go"; go test "./internal/http/handlers" -run "TestTriggerStrategy_ShouldSetScheduleID" -count=1`

Expected: FAIL（当前为 nil）

**Step 3: Write minimal implementation**

- 修改 `TriggerStrategy`：将 `CreateInspections` 的 `ScheduleID` 从 `nil` 改为 `&strategyID`。
- 同步修正误导性注释（`schedule_id` 目前用于策略关联）。

**Step 4: Run test to verify it passes**

Run:
`cd "tests/backend-go"; go test "./internal/http/handlers" -run "TestTriggerStrategy_ShouldSetScheduleID" -count=1`

Expected: PASS

**Step 5: Commit**

```bash
git add "backend-go/internal/http/handlers/inspection.go" "tests/backend-go/internal/http/handlers/inspection_trigger_strategy_association_test.go"
git commit -m "fix(inspection): associate manual executions with strategy via schedule_id"
```

---

### Task 8: 后端-评分计算不把 `skip` 计入分母（避免分数被“暂不支持类型”拉低）

**Files:**
- Create: `tests/backend-go/internal/http/handlers/inspection_score_test.go`
- Modify: `backend-go/internal/http/handlers/inspection.go`

**Step 1: Write the failing test**

- 构造一个 `inspection.Inspection`：`TotalChecks=4, Passed=1, Failed=0, Warning=0, Skipped=3`
- 断言最终 `score == 100`（仅 1 个有效检查，且 pass）

**Step 2: Run test to verify it fails**

Run:
`cd "tests/backend-go"; go test "./internal/http/handlers" -run "TestComputeScore_ShouldIgnoreSkipped" -count=1`

Expected: FAIL（当前 score=25）

**Step 3: Write minimal implementation**

- 将 `computeScore(total, passed)` 改为按 `passed+failed+warning` 作为分母；
- 调整调用点：用 `resolvePassedChecks/resolveFailedChecks/resolveWarningChecks` 计算分数。

**Step 4: Run test to verify it passes**

Run:
`cd "tests/backend-go"; go test "./internal/http/handlers" -run "TestComputeScore_ShouldIgnoreSkipped" -count=1`

Expected: PASS

**Step 5: Commit**

```bash
git add "backend-go/internal/http/handlers/inspection.go" "tests/backend-go/internal/http/handlers/inspection_score_test.go"
git commit -m "fix(inspection): compute score without skipped checks"
```

---

### Task 9: 后端-新增 Cron 规范化工具函数（Quartz → 5 段 Cron）并写单测

**Files:**
- Create: `backend-go/internal/inspection/cron.go`
- Create: `tests/backend-go/internal/inspection/cron_normalize_test.go`

**Step 1: Write the failing test**

断言以下转换成立：
- `0 0 2 * * ?` → `0 2 * * *`
- `0 */30 * * * ?` → `*/30 * * * *`
- `0 0 2 ? * MON` → `0 2 * * MON`
- `0 0 2 1 * ?` → `0 2 1 * *`

**Step 2: Run test to verify it fails**

Run:
`cd "tests/backend-go"; go test "./internal/inspection" -run "TestNormalizeCronExpression_" -count=1`

Expected: FAIL（函数不存在）

**Step 3: Write minimal implementation**

在 `inspection/cron.go` 实现：

```go
func NormalizeCronExpression(expr string) (string, error)
```

规则：
- 5 段：直接返回（并把 `?` 替换为 `*`）
- 6 段：丢弃秒字段
- 7 段：丢弃秒字段与年字段
- dom/dow 中的 `?` 统一替换为 `*`

**Step 4: Run test to verify it passes**

Run:
`cd "tests/backend-go"; go test "./internal/inspection" -run "TestNormalizeCronExpression_" -count=1`

Expected: PASS

**Step 5: Commit**

```bash
git add "backend-go/internal/inspection/cron.go" "tests/backend-go/internal/inspection/cron_normalize_test.go"
git commit -m "feat(inspection): add quartz cron normalization"
```

---

### Task 10: 后端-策略 CRUD 自动维护 `next_run_time`（创建/更新/启用）

**Files:**
- Modify: `backend-go/internal/inspection/service.go`
- (Optional) Create: `tests/backend-go/internal/inspection/strategy_next_run_test.go`

**Step 1: Write the failing test**

- 在不连真实 DB 的情况下，优先对“纯函数”做单测：
  - `ComputeNextRunTime(normalizedCron, from)` 能返回预期时间
- 若要覆盖 Service 层：用 `sqlmock` + gorm 断言创建/更新时会写入 `next_run_time`（可选）。

**Step 2: Run test to verify it fails**

Run:
`cd "tests/backend-go"; go test "./internal/inspection" -run "TestComputeNextRunTime_" -count=1`

Expected: FAIL

**Step 3: Write minimal implementation**

- 在 `CreateStrategy`：
  - 若 `type=scheduled && enabled=true`：校验 cron 非空、可规范化、可解析；写入 `NextRunTime`
  - 若 `type=manual`：忽略 cron（可置 nil）
- 在 `UpdateStrategy` / `ToggleStrategy`：
  - cron/type/enabled 变化时重新计算并写入 `next_run_time`
  - 禁用时将 `next_run_time` 置空

**Step 4: Run test to verify it passes**

Run:
`cd "tests/backend-go"; go test "./internal/inspection" -run "TestComputeNextRunTime_" -count=1`

Expected: PASS

**Step 5: Commit**

```bash
git add "backend-go/internal/inspection/service.go" "tests/backend-go/internal/inspection/strategy_next_run_test.go"
git commit -m "feat(inspection): maintain next_run_time for scheduled strategies"
```

---

### Task 11: 后端-实现“策略定时调度器”：到点自动触发执行 + 幂等抢占

**Files:**
- Modify: `backend-go/internal/http/handlers/inspection.go`
- Modify: `backend-go/internal/app/app.go`
- (Optional) Create: `tests/backend-go/internal/http/handlers/inspection_strategy_scheduler_test.go`

**Step 1: Write the failing test**

- 最小单测目标：验证“到点策略会被 claim 并触发一次”，二次并发不会重复触发。
- 推荐先把“claim 更新”逻辑抽成函数（便于单测），如：
  - `claimDueStrategy(ctx, db, strategyID, now) (claimed bool, next time.Time, err error)`

**Step 2: Run test to verify it fails**

Run:
`cd "tests/backend-go"; go test "./internal/http/handlers" -run "TestStrategyScheduler_" -count=1`

Expected: FAIL（未实现）

**Step 3: Write minimal implementation**

1) 在 `InspectionHandler` 增加：
- `StartStrategyScheduler(ctx context.Context) <-chan struct{}`
- 内部 ticker 周期（建议 30s 或 60s）执行：
  - 初始化：对 `next_run_time IS NULL` 的 scheduled 策略只计算并写入 `next_run_time`（不立即触发）
  - 到期：查询 `next_run_time <= now` 的策略列表；对每条策略先做原子 `UPDATE ... WHERE next_run_time <= now AND enabled=true AND type='scheduled'` 抢占；抢占成功才触发

2) 触发执行复用现有执行引擎：
- 抽取无权限版本的触发函数（供 scheduler 与 API handler 共用），统一：
  - `ScheduleID = &strategyID`
  - `Trigger = scheduled/manual`
  - goroutine 异步执行 `executeInspectionsAsync`

3) 在 `app.New()` 中启动 scheduler，并在 `Shutdown` 中 cancel 等待退出（避免 goroutine 泄漏）。

**Step 4: Run test to verify it passes**

Run:
`cd "tests/backend-go"; go test "./internal/http/handlers" -run "TestStrategyScheduler_" -count=1`

Expected: PASS

**Step 5: Commit**

```bash
git add "backend-go/internal/http/handlers/inspection.go" "backend-go/internal/app/app.go" "tests/backend-go/internal/http/handlers/inspection_strategy_scheduler_test.go"
git commit -m "feat(inspection): schedule strategies with cron and next_run_time"
```

---

### Task 12: 前端-Tailwind 动态 class 固化为静态映射（避免生产丢样式）

**Files:**
- Modify: `frontend/src/features/inspection/components/InspectionAnalytics.tsx`
- Modify: `frontend/src/features/inspection/components/CreateTemplateWizard.tsx`
- Modify: `frontend/src/features/inspection/components/QuickTemplateCreate.tsx`

**Step 1: Write the failing test**

- 可选：这里更偏构建期问题，单测价值不高；优先走 lint/type-check + build 作为验证。

**Step 2: Run test to verify it fails**

Run:
`pnpm -C "frontend" build`

Expected: 当前生产包可能出现样式缺失（该步骤更多是后续验收/肉眼检查）

**Step 3: Write minimal implementation**

- 将 `bg-${color}-100` / `text-${color}-600` 等动态拼接替换为“颜色枚举 → class 映射表”，例如：

```ts
const COLOR_CLASS: Record<string, { bg: string; text: string; icon: string; darkBg: string }> = {
  blue: { bg: "bg-blue-100", text: "text-blue-600", icon: "text-blue-500", darkBg: "dark:bg-blue-900/30" },
  green: { ... },
  // ...
}
```

**Step 4: Run test to verify it passes**

Run:
`pnpm -C "frontend" lint && pnpm -C "frontend" type-check && pnpm -C "frontend" build`

Expected: PASS

**Step 5: Commit**

```bash
git add "frontend/src/features/inspection/components/InspectionAnalytics.tsx" "frontend/src/features/inspection/components/CreateTemplateWizard.tsx" "frontend/src/features/inspection/components/QuickTemplateCreate.tsx"
git commit -m "fix(inspection): remove dynamic tailwind classes in inspection views"
```

---

### Task 13: 文档对齐（模板/WS/策略流程）

**Files:**
- Modify: `docs/api/template-api.md`
- Modify: `docs/api/websocket-contract.md`
- Modify: `docs/flows/inspection-strategy-flow.md`

**Step 1: Write the failing test**

- 文档不写单测；以“对照实现”验收。

**Step 2: Run test to verify it fails**

- 人工校对：
  - `template-api.md` 当前示例仍是对象 `device_types`，与 API 对外 `deviceTypes: string[]` 不一致
  - `websocket-contract.md` 示例字段 `scan_id` 与实现字段 `id` 不一致
  - `inspection-strategy-flow.md` 标注 scheduled 未实现，需要更新为“已实现”

**Step 3: Write minimal implementation**

- `template-api.md`：明确 `device_types` 支持两种形态（历史对象/推荐数组），并说明响应统一输出 `deviceTypes: string[]`
- `websocket-contract.md`：把 `scan_progress.data` 示例改为 `{ "id": "123", "progress": 30, "status": "running" }`
- `inspection-strategy-flow.md`：更新数据模型说明（`schedule_id` 当前用于策略关联），补充定时调度器流程与幂等抢占说明

**Step 4: Run test to verify it passes**

- 以实现为准完成校对（无自动化）

**Step 5: Commit**

```bash
git add "docs/api/template-api.md" "docs/api/websocket-contract.md" "docs/flows/inspection-strategy-flow.md"
git commit -m "docs(inspection): align inspection contracts and scheduling flow"
```

---

### Task 14: 回归验证（≤60s）与交付检查清单

**Files:**
- N/A

**Step 1: Run backend unit tests**

Run:
`cd "tests/backend-go"; go test "./..." -count=1`

Expected: PASS（建议总耗时 ≤60s；如超时则改为按包运行）

**Step 2: Run frontend unit tests**

Run:
`pnpm -C "frontend" test -- --runInBand`

Expected: PASS（如超时，改为只跑 inspection 相关用例）

**Step 3: Build checks**

Run:
`pnpm -C "frontend" type-check && pnpm -C "frontend" build`

Expected: PASS

**Step 4: Manual smoke（建议）**

- 创建 1 个“定时巡检”策略（cron 使用预置：`0 0 2 * * ?`）
- 确认后端返回 `next_run_time` 非空
- 等待到点或将 cron 改为“每分钟”后验证自动触发：
  - `GET /inspection/executions` 出现新记录
  - WS 推送进度能让执行历史实时更新

