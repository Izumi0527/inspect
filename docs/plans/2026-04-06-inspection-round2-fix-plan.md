# 巡检管理二轮复审问题修复计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复巡检管理第二轮复审中确认的 7 类问题，优先打通执行链路、统一时间口径，再收敛前端消费语义与错误处理，并补齐最小回归测试门禁。

**Architecture:** 先修“事实错误”再修“展示错误”。第一阶段修复后端假启动与时间契约，确保数据本身正确；第二阶段统一前端统计字段、缓存失效和错误态；第三阶段补齐契约测试、组件测试和聚焦回归测试，避免同类问题再次出现。

**Tech Stack:** Next.js + React + TanStack Query + Jest，Go + Echo + GORM + Go Test

---

## 0. 统一修复原则

### 原则 1：时间语义统一

- `created_at`：表示任务/执行记录创建时间，只用于“任务创建视角”
- `scheduled_at`：表示计划执行时间，只用于“计划任务视角”
- `started_at`：表示实际开始执行时间，作为“执行统计 / 执行趋势 / 执行列表筛选”的统一主口径
- `completed_at`：表示执行完成时间，只用于“完成视角 / 完成耗时 / 完成结果”

### 原则 2：关键详情接口不允许吞错

- 列表接口允许返回空列表
- 关键详情接口、关键资源查询接口失败时必须显式抛错
- 资源不存在时优先返回 `404`
- 前端必须区分“空态”“错误态”“资源不存在”

### 原则 3：同一统计字段只能有一种业务含义

- 不允许后端返回“区间执行数”，前端一处展示“执行次数”，另一处展示“今日执行”
- 若调整统计字段语义，应同时更新后端响应、前端类型、页面文案和测试断言

---

## 一、必须先修

### 任务 1：修复 `StartTask` 假启动

**优先级：P1**

**目标：**

- 让 `POST /inspection/tasks/:id/start` 真正进入巡检执行链
- 避免前端出现“已启动但无结果、无进度”的假阳性状态

**涉及文件：**

- 修改：[inspection.go](/C:/Coder/Inspect/backend-go/internal/http/handlers/inspection.go)
- 可能修改：[service.go](/C:/Coder/Inspect/backend-go/internal/inspection/service.go)
- 新增/修改测试：
  - `tests/backend-go/internal/http/handlers/inspection_start_task_contract_test.go`

**根因分析：**

- 当前 `StartTask` 只调用 `UpdateInspectionStatus(..., running, ...)`
- 真正的执行逻辑在 `executeInspectionsAsync -> executeInspection`
- 两者之间没有打通

**推荐修复方案：**

1. 在 `StartTask` 里先读取任务详情，并校验当前状态是否允许启动。
2. 取出任务对应模板，解析检查项。
3. 以异步方式调用现有执行链，而不是仅改状态。
4. 避免重复启动：
   - `running` 状态再次启动直接拒绝
   - `completed/cancelled/failed` 是否允许重跑，需要明确业务规则
5. 若业务要求“重跑生成新执行记录”，则不要复用 `StartTask` 当前接口行为，应新开“重跑”语义接口。

**验收标准：**

- 调用 `POST /inspection/tasks/:id/start` 后，任务有真实进度推进
- 有结果落库
- 最终状态能走到 `completed/failed/cancelled`
- 重复启动行为有明确限制

**聚焦验证：**

- `go test ./internal/http/handlers -run TestStartTask_ -count=1`

---

### 任务 2：统一巡检“执行时间”口径为 `started_at`

**优先级：P1**

**目标：**

- 让 stats、trends、device-distribution、problem-distribution、执行列表、任务列表在“执行视角”下使用一致时间语义
- 解决同一时间窗统计互相对不上的问题

**涉及文件：**

- 修改：[inspection.go](/C:/Coder/Inspect/backend-go/internal/http/handlers/inspection.go)
- 修改：[service.go](/C:/Coder/Inspect/backend-go/internal/inspection/service.go)
- 可能修改：[models.go](/C:/Coder/Inspect/backend-go/internal/inspection/models.go)
- 新增/修改测试：
  - `tests/backend-go/internal/http/handlers/inspection_analytics_time_contract_test.go`
  - `tests/backend-go/internal/http/handlers/inspection_execution_list_time_filter_test.go`
  - `tests/backend-go/internal/http/handlers/inspection_task_list_date_boundary_test.go`

**根因分析：**

- `GetStats`、两个分布接口按 `created_at`
- `GetTrends` 按 `COALESCE(created_at, started_at, completed_at)`
- `ListExecutions` 按 `started_at`
- `ListTasks` 按 `created_at`
- 当前代码实际上混用了“记录创建时间”和“执行开始时间”

**推荐修复方案：**

1. 明确“执行统计主口径 = started_at”。
2. `GetStats` 改为按 `started_at` 统计执行次数、成功率、平均分。
3. `GetTrends` 移除 `COALESCE(created_at, started_at, completed_at)`，统一改为 `started_at`。
4. `GetDeviceDistribution`、`GetProblemDistribution` 改为关联执行记录的 `started_at`。
5. `ListExecutions` 保持按 `started_at`，但对 `pending` 记录需有明确产品决策：
   - 方案 A：执行历史只展示已开始执行的记录，则过滤掉纯 `pending`
   - 方案 B：执行历史保留 `pending`，则日期筛选需要定义回退字段
6. `ListTasks` 保持任务视角，用 `created_at` 或 `scheduled_at`，但要与执行列表明确区分，不再混用“执行时间”语义。
7. 修正 `end_date` 边界，统一采用 `< end + 24h`。

**验收标准：**

- 同一范围下，stats、trends、分布图、执行列表数字能相互印证
- 日期边界不会漏掉结束日当天数据
- `pending` 记录在筛选逻辑上的行为有明确规则

**聚焦验证：**

- `go test ./internal/http/handlers -run "Test(GetStats_|GetTrends_|GetDeviceDistribution_|GetProblemDistribution_|ListExecutions_|ListTasks_)" -count=1`

---

### 任务 3：收敛统计字段契约，替换 `todayExecutions` 的歧义语义

**优先级：P1**

**目标：**

- 让后端返回字段、前端类型、总览页文案、统计页文案保持同一含义

**涉及文件：**

- 修改：[inspection.go](/C:/Coder/Inspect/backend-go/internal/http/handlers/inspection.go)
- 修改：[index.ts](/C:/Coder/Inspect/frontend/src/features/inspection/types/index.ts)
- 修改：[inspection.api.ts](/C:/Coder/Inspect/frontend/src/features/inspection/api/inspection.api.ts)
- 修改：[InspectionView.tsx](/C:/Coder/Inspect/frontend/src/features/inspection/components/InspectionView.tsx)
- 修改：[InspectionAnalytics.tsx](/C:/Coder/Inspect/frontend/src/features/inspection/components/InspectionAnalytics.tsx)
- 新增/修改测试：
  - `tests/backend-go/internal/http/handlers/inspection_stats_response_contract_test.go`
  - `tests/frontend/inspection/components/InspectionView.stats-semantics.test.tsx`
  - `tests/frontend/inspection/components/InspectionAnalytics.range-consistency.test.tsx`

**根因分析：**

- 后端显式范围下返回的是“区间执行数”
- 字段名仍叫 `todayExecutions`
- 总览页仍展示“今日执行”
- 统计页展示“执行次数”

**推荐修复方案：**

1. 推荐新增明确字段名，如 `executionCount`。
2. 前端先优先消费新字段。
3. 如需平滑过渡，可短期内同时返回：
   - `executionCount`
   - 保留 `todayExecutions` 作为兼容字段，但加注释并限制仅过渡期使用
4. 总览页文案改为与真实语义一致：
   - 如果沿用统一范围统计，改为“执行次数”
   - 若总览必须展示“今日执行”，则必须单独请求今日范围，不可复用分析统计字段

**验收标准：**

- 同一字段在所有页面只表达一种业务含义
- 类型定义与接口返回一致
- 文案不再混用“今日执行”和“执行次数”

---

## 二、应跟进修复

### 任务 4：统一任务/结果错误语义，修复 `GetTaskResults` 的 200 + []

**优先级：P2**

**目标：**

- 正确区分“任务不存在”和“任务存在但无结果”

**涉及文件：**

- 修改：[inspection.go](/C:/Coder/Inspect/backend-go/internal/http/handlers/inspection.go)
- 可能修改：[service.go](/C:/Coder/Inspect/backend-go/internal/inspection/service.go)
- 新增/修改测试：
  - `tests/backend-go/internal/http/handlers/inspection_task_results_contract_test.go`

**推荐修复方案：**

1. `GetTaskResults` 先校验任务是否存在。
2. 不存在返回 `404`。
3. 存在但无结果返回 `200 + []`。
4. 与 `GetTask`、`GetTaskProgress` 的错误语义保持一致。

**验收标准：**

- 错误资源 ID 不会再被伪装成空结果

---

### 任务 5：修复详情类 API 吞错与前端误判空态

**优先级：P2**

**目标：**

- 让详情加载失败时显示错误态，而不是“模板不存在”或“暂无结果”

**涉及文件：**

- 修改：[inspection.api.ts](/C:/Coder/Inspect/frontend/src/features/inspection/api/inspection.api.ts)
- 修改：[useInspection.ts](/C:/Coder/Inspect/frontend/src/features/inspection/hooks/useInspection.ts)
- 修改：[TemplateDetail.tsx](/C:/Coder/Inspect/frontend/src/features/inspection/components/TemplateDetail.tsx)
- 修改：[ExecutionDetailModal.tsx](/C:/Coder/Inspect/frontend/src/features/inspection/components/ExecutionDetailModal.tsx)
- 可能修改：[InspectionTemplates.tsx](/C:/Coder/Inspect/frontend/src/features/inspection/components/InspectionTemplates.tsx)
- 新增/修改测试：
  - `tests/frontend/inspection/api/inspection.api.detail-error-handling.test.ts`
  - `tests/frontend/inspection/components/TemplateDetail.error-state.test.tsx`
  - `tests/frontend/inspection/components/ExecutionDetailModal.error-state.test.tsx`

**推荐修复方案：**

1. `fetchInspectionTemplate`、`fetchExecutionDetail` 等关键详情接口失败时改为抛错。
2. React Query 保留 `error`，由组件决定展示错误态。
3. `TemplateDetail` 明确区分：
   - 加载中
   - 404/不存在
   - 请求失败
4. `ExecutionDetailModal` 在详情请求失败时展示错误提示，并允许重试。
5. 不再用列表摘要静默冒充完整详情。

**验收标准：**

- 网络异常/500/详情缺失时，页面出现明确错误提示
- 空态只用于真实无数据场景

---

### 任务 6：补齐前端 analytics 缓存失效与比较文案

**优先级：P2**

**目标：**

- 让执行触发、删除记录后统计页自动更新
- 让 KPI 比较文案跟随当前周期变化

**涉及文件：**

- 修改：[useInspection.ts](/C:/Coder/Inspect/frontend/src/features/inspection/hooks/useInspection.ts)
- 修改：[InspectionAnalytics.tsx](/C:/Coder/Inspect/frontend/src/features/inspection/components/InspectionAnalytics.tsx)
- 新增/修改测试：
  - `tests/frontend/inspection/hooks/useTriggerExecution.invalidate.test.tsx`
  - `tests/frontend/inspection/hooks/useDeleteExecution.invalidate.test.tsx`
  - `tests/frontend/inspection/components/InspectionAnalytics.compare-label.test.tsx`

**推荐修复方案：**

1. `useTriggerExecution` 成功后补失效：
   - `['inspection', 'trends']`
   - `['inspection', 'device-distribution']`
   - `['inspection', 'problem-distribution']`
2. `useDeleteExecution` 同步补齐相同 query key 的失效。
3. 抽出比较文案映射：
   - `day -> vs 前一日`
   - `week -> vs 上周`
   - `month -> vs 上月`
4. 如果未来支持显式自定义日期范围，比较文案应进一步改成“vs 上一统计周期”。

**验收标准：**

- 触发执行、删除记录后统计页无需手动刷新即可更新
- KPI 比较文案与当前时间粒度一致

---

## 三、测试与验收收口

### 任务 7：补齐最小回归门禁

**优先级：P2**

**目标：**

- 用最少但高价值的测试锁住这轮修复

**建议补测清单：**

1. 后端契约测试：
   - `StartTask` 真正触发执行
   - analytics 统一使用 `started_at`
   - `end_date` 边界包含结束日当天
   - `GetTaskResults` 不存在任务返回 `404`
2. 前端组件/Hook 测试：
   - 总览页与统计页共享统计字段语义
   - `useTriggerExecution/useDeleteExecution` 补齐 analytics 缓存失效
   - 模板详情、执行详情错误态
   - KPI 比较文案随周期变化
3. 聚焦回归命令：
   - 前端：inspection 相关组件与 API 测试
   - 后端：inspection handlers 契约测试

**建议执行顺序：**

1. 先补/改后端契约测试
2. 再修后端逻辑
3. 再补前端语义与错误态测试
4. 最后修前端实现

---

## 四、推荐实施顺序

1. 修 `StartTask` 假启动
2. 统一时间口径为 `started_at`
3. 修统计字段契约与总览/统计页文案
4. 修任务结果错误语义
5. 修详情 API 吞错与前端错误态
6. 修 analytics 缓存失效和比较文案
7. 跑聚焦回归测试并收口

---

## 五、建议提交拆分

- `fix(inspection): 打通任务启动执行链路`
- `fix(inspection): 统一巡检执行时间口径`
- `fix(inspection): 收敛统计字段与页面语义`
- `fix(inspection): 统一任务结果与详情错误语义`
- `fix(inspection): 补齐统计页缓存失效与比较文案`
- `test(inspection): 补充巡检管理二轮复审回归测试`
