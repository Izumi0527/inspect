# 巡检管理审查问题修复计划

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 修复巡检管理及四个子分页审查中识别出的 6 类问题，并补齐最小必要回归测试。

**Architecture:** 优先收敛前后端契约，再统一统计分析口径与错误处理，最后补策略页分页、删除确认与回归测试。修复过程遵循最小必要改动，优先保证行为一致性与可验证性。

**Tech Stack:** Next.js + React + TanStack Query + Jest，Go + Echo + GORM + Go Test

---

## 一、必须先修

### 任务 1：统一策略模板契约

**优先级：P0**

**目标：**
- 明确策略是“单模板”还是“多模板”。
- 消除“前端可选多个、后端只执行第一个”的语义错位。
- 禁止空模板策略静默回退为默认检查。

**建议方案：**
- 推荐采用“单模板”方案。
- 原因：当前执行链路、统计展示、执行历史结构都更接近“一个策略对应一个模板，再对多设备展开”。
- 如果坚持多模板，需要同步改造执行模型、结果聚合与前端展示，成本明显更高。

**前端涉及文件：**
- [StrategyModal.tsx](/C:/Coder/Inspect/frontend/src/features/inspection/components/StrategyModal.tsx)
- [InspectionStrategies.tsx](/C:/Coder/Inspect/frontend/src/features/inspection/components/InspectionStrategies.tsx)
- [useInspection.ts](/C:/Coder/Inspect/frontend/src/features/inspection/hooks/useInspection.ts)
- [inspection.api.ts](/C:/Coder/Inspect/frontend/src/features/inspection/api/inspection.api.ts)
- [types/index.ts](/C:/Coder/Inspect/frontend/src/features/inspection/types/index.ts)

**后端涉及文件：**
- [inspection.go](/C:/Coder/Inspect/backend-go/internal/http/handlers/inspection.go)
- [service.go](/C:/Coder/Inspect/backend-go/internal/inspection/service.go)
- [models.go](/C:/Coder/Inspect/backend-go/internal/inspection/models.go)

**测试涉及文件：**
- [StrategyModal.select-unification.test.tsx](/C:/Coder/Inspect/tests/frontend/inspection/components/StrategyModal.select-unification.test.tsx)
- [inspection_trigger_strategy_association_test.go](/C:/Coder/Inspect/tests/backend-go/internal/http/handlers/inspection_trigger_strategy_association_test.go)
- 新增：
  - `tests/frontend/inspection/components/InspectionStrategies.contract.test.tsx`
  - `tests/backend-go/internal/http/handlers/inspection_strategy_template_contract_test.go`

**执行项：**
1. 确认业务决策为“单模板”并固化到前端类型、表单与提交结构。
2. 将策略弹窗中的模板选择由多选改为单选，文案改为“巡检模板”。
3. 前端提交结构改为单模板字段，或在提交前明确只保留单个模板并提示用户。
4. 后端 `CreateStrategy` / `UpdateStrategy` 增加模板必填校验。
5. 后端触发执行前，若无模板则直接返回 400，不再回退默认检查项。
6. 清理默认检查回退逻辑与“第一个模板生效”的隐式行为。

**验收标准：**
- UI 只能选择一个模板。
- 后端无法创建无模板策略。
- 触发执行时，执行模板与页面显示一致。
- 不再出现“选多个只跑一个”。

**建议提交拆分：**
- `fix(inspection): 统一策略模板为单模板契约`
- `test(inspection): 补充策略模板契约回归测试`

---

### 任务 2：统一统计分析口径

**优先级：P0**

**目标：**
- 让 KPI、趋势图、设备分布、问题分布都遵循同一时间范围。
- 修正文案与字段含义不一致的问题。

**前端涉及文件：**
- [InspectionAnalytics.tsx](/C:/Coder/Inspect/frontend/src/features/inspection/components/InspectionAnalytics.tsx)
- [InspectionView.tsx](/C:/Coder/Inspect/frontend/src/features/inspection/components/InspectionView.tsx)
- [useInspection.ts](/C:/Coder/Inspect/frontend/src/features/inspection/hooks/useInspection.ts)
- [inspection.api.ts](/C:/Coder/Inspect/frontend/src/features/inspection/api/inspection.api.ts)

**后端涉及文件：**
- [inspection.go](/C:/Coder/Inspect/backend-go/internal/http/handlers/inspection.go)

**测试涉及文件：**
- [InspectionAnalytics.select-unification.test.tsx](/C:/Coder/Inspect/tests/frontend/inspection/components/InspectionAnalytics.select-unification.test.tsx)
- 新增：
  - `tests/frontend/inspection/components/InspectionAnalytics.range-consistency.test.tsx`
  - `tests/backend-go/internal/http/handlers/inspection_analytics_range_contract_test.go`

**执行项：**
1. 统一前端周期定义与后端范围协议。
2. 明确 `day/week/month` 分别映射的真实时间范围。
3. `useInspectionStats` 接收并传递时间范围参数。
4. `device-distribution` 和 `problem-distribution` 后端接口补时间过滤参数。
5. KPI 标题从“总执行次数”改成与实际字段一致，或改后端返回字段为总量。
6. 页面刷新时，四类图表和 KPI 使用同一组范围参数。

**验收标准：**
- 切换周期后，KPI、趋势图、分布图同步变化。
- 页面文案与实际数据口径一致。
- 后端 stats / trends / distribution 支持同一套范围语义。

**建议提交拆分：**
- `fix(inspection): 统一统计分析时间口径`
- `test(inspection): 补充统计分析口径一致性测试`

---

### 任务 3：修复 inspection API 吞异常的问题

**优先级：P0**

**目标：**
- 区分加载失败与空数据。
- 让 React Query 能拿到真实错误，从而显示错误态。

**前端涉及文件：**
- [inspection.api.ts](/C:/Coder/Inspect/frontend/src/features/inspection/api/inspection.api.ts)
- [InspectionStrategies.tsx](/C:/Coder/Inspect/frontend/src/features/inspection/components/InspectionStrategies.tsx)
- [InspectionTemplates.tsx](/C:/Coder/Inspect/frontend/src/features/inspection/components/InspectionTemplates.tsx)
- [InspectionExecutions.tsx](/C:/Coder/Inspect/frontend/src/features/inspection/components/InspectionExecutions.tsx)
- [InspectionAnalytics.tsx](/C:/Coder/Inspect/frontend/src/features/inspection/components/InspectionAnalytics.tsx)
- [useInspection.ts](/C:/Coder/Inspect/frontend/src/features/inspection/hooks/useInspection.ts)

**测试涉及文件：**
- [inspection.api.test.ts](/C:/Coder/Inspect/tests/frontend/inspection/api/inspection.api.test.ts)
- 新增：
  - `tests/frontend/inspection/api/inspection.api.error-handling.test.ts`
  - `tests/frontend/inspection/components/InspectionStrategies.error-state.test.tsx`
  - `tests/frontend/inspection/components/InspectionExecutions.error-state.test.tsx`

**执行项：**
1. 梳理 inspection API 中哪些函数不应吞异常。
2. 对“列表/详情/统计”类请求统一改为抛出错误，由 hook 和页面处理。
3. 页面补充错误态展示与重试入口。
4. 保留真正需要降级默认值的极少数场景，并在代码里写清理由。

**验收标准：**
- 请求失败时页面明确显示错误，而不是渲染为“0 条”或“暂无数据”。
- 模板页原有错误态分支能被真实触发。
- 策略页、执行页、统计页具备最小错误态。

**建议提交拆分：**
- `fix(inspection): 修复前端异常吞没导致的空态误判`
- `test(inspection): 补充错误态回归测试`

---

### 任务 4：为策略页补分页与完整列表能力

**优先级：P1**

**目标：**
- 修复只展示前 20 条策略的问题。
- 避免列表在数据增长后静默截断。

**前端涉及文件：**
- [InspectionStrategies.tsx](/C:/Coder/Inspect/frontend/src/features/inspection/components/InspectionStrategies.tsx)
- [useInspection.ts](/C:/Coder/Inspect/frontend/src/features/inspection/hooks/useInspection.ts)
- [inspection.api.ts](/C:/Coder/Inspect/frontend/src/features/inspection/api/inspection.api.ts)

**后端涉及文件：**
- [inspection.go](/C:/Coder/Inspect/backend-go/internal/http/handlers/inspection.go)

**测试涉及文件：**
- 新增：
  - `tests/frontend/inspection/components/InspectionStrategies.pagination.test.tsx`

**执行项：**
1. 给策略页增加 `page/pageSize` 状态。
2. 调用 `useInspectionStrategies` 时传入分页参数。
3. 页面补分页控件，风格尽量与执行页、模板页一致。
4. 如有必要，补总条数与每页条数选择。

**验收标准：**
- 策略数超过 20 条时，用户可访问后续页。
- 前端分页参数与后端 `skip/limit` 转换正确。

**建议提交：**
- `fix(inspection): 为巡检策略页补充分页能力`

---

## 二、可以后修

### 任务 5：为策略删除补二次确认

**优先级：P2**

**目标：**
- 降低误删风险。
- 与模板、执行记录删除交互保持一致。

**前端涉及文件：**
- [InspectionStrategies.tsx](/C:/Coder/Inspect/frontend/src/features/inspection/components/InspectionStrategies.tsx)

**测试涉及文件：**
- 新增：
  - `tests/frontend/inspection/components/InspectionStrategies.confirm-dialog.test.tsx`

**执行项：**
1. 参照模板删除或执行删除弹窗增加确认层。
2. 弹窗内展示策略名称与影响提示。
3. 删除成功后刷新列表并给出 toast。

**验收标准：**
- 点击删除不会直接发请求。
- 二次确认后才真正执行删除。

**建议提交：**
- `fix(inspection): 为策略删除补充确认弹窗`

---

### 任务 6：补 inspection 模块最小必要回归测试

**优先级：P2**

**目标：**
- 让前四项修复有测试护栏。
- 先补最关键场景，不追求一次性补齐全部。

**前端优先补测：**
- 策略模板单模板契约
- 策略页分页
- analytics 统一时间范围
- 失败态显示而非空态

**后端优先补测：**
- 无模板策略创建/更新拒绝
- 触发执行时模板缺失返回 400
- analytics 四类接口统一接受时间范围
- 关键 handler 的参数错误、资源不存在、权限失败分支

**建议测试文件：**
- `tests/frontend/inspection/components/InspectionStrategies.contract.test.tsx`
- `tests/frontend/inspection/components/InspectionStrategies.pagination.test.tsx`
- `tests/frontend/inspection/components/InspectionAnalytics.range-consistency.test.tsx`
- `tests/frontend/inspection/api/inspection.api.error-handling.test.ts`
- `tests/backend-go/internal/http/handlers/inspection_strategy_template_contract_test.go`
- `tests/backend-go/internal/http/handlers/inspection_analytics_range_contract_test.go`

**验收标准：**
- 前四项问题修复后都有对应回归测试。
- 单次聚焦测试命令均可在 60 秒内完成。

**建议提交：**
- `test(inspection): 补充巡检管理关键回归测试`

---

## 三、推荐执行顺序

1. 先完成任务 1，锁定策略模板契约。
2. 再完成任务 2，统一统计分析时间口径。
3. 接着完成任务 3，修复 API 吞异常与页面错误态。
4. 然后完成任务 4，补齐策略页分页。
5. 再完成任务 5，补删除确认。
6. 最后完成任务 6，系统补齐回归测试。

---

## 四、建议验证命令

**前端：**
- `pnpm test -- --runInBand --runTestsByPath "../tests/frontend/inspection/api/inspection.api.test.ts"`
- `pnpm test -- --runInBand --runTestsByPath "../tests/frontend/inspection/components/InspectionAnalytics.select-unification.test.tsx"`
- `pnpm test -- --runInBand --runTestsByPath "../tests/frontend/inspection/components/InspectionStrategies.pagination.test.tsx"`
- `pnpm type-check`

**后端：**
- `go test ./internal/inspection ./internal/http/handlers -run "Inspection|Strategy|Template|Analytics" -count=1`

---

## 五、交付标准

- 前后端契约一致，不再存在前端语义和后端执行不一致。
- analytics 页面所有模块遵循同一时间范围。
- 请求失败显示错误态，不再误展示为空态。
- 策略列表支持完整浏览。
- 策略删除具备确认保护。
- 关键修复具备最小回归测试。
