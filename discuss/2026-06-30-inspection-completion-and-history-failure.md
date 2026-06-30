# 巡检"无完成提示"与"执行历史某时间点后全失败"根因分析与修复方案

- 日期：2026-06-30
- 范围：`backend-go/internal/http/handlers/inspection_execution.go`、`frontend/src/features/inspection/*`
- 关联问题：
  - 问题 1：每次触发巡检后只弹"触发成功，巡检任务已开始执行"，任务真正跑完后没有任何"完成"提示。
  - 问题 2：查看"执行历史"，发现某个时间点之前的任务全部成功、之后的任务全部失败。

---

## 一、问题 2：执行历史在某时间点后全部失败

### 1.1 调用链

手动触发巡检策略的后端链路：

1. `handlers/inspection_strategies.go:296` → `go h.executeInspectionsAsync(...)`（脱离 HTTP 生命周期的异步 goroutine）
2. `inspection_execution.go:20 executeInspectionsAsync` → 对每个 inspection 顺序调用 `executeInspection`
3. `inspection_execution.go:142 executeInspection`：
   - 第 158 行 `device, err = h.DeviceService.GetDeviceByID(ctx, insp.DeviceID)` 获取设备
   - 第 170-179 行把 `device.SnmpCommunity` 传给 `ProbeService.ProbeDevice` 做 SNMP 探测
   - 第 295/347 行 `collectInspectionSNMPMetrics` 用 `device.SnmpCommunity` 采集指标

### 1.2 根因

`GetDeviceByID` 返回的是**对外脱敏**的 `*devices.DeviceResponse`，而非内部领域对象 `Device`。脱敏逻辑见 `devices/service.go:714 buildDeviceResponse`：

- 第 733 行：`SnmpCommunity: nil // 脱敏：凭据不随列表/详情响应下发`
- 第 741 行：`EnablePassword: nil`

因此巡检执行时 `device.SnmpCommunity == nil`。空 community 进入 `ProbeService.ProbeDevice`（`devices/probe.go:87`）后，SNMP 探测判定不可达，`ProbeResult.SnmpReachable == false`。随后 `inspection_execution.go:409 executeSNMPCheck` 在 `!probeResult.SnmpReachable` 分支把每个 SNMP 检查项标记为 `fail`，整个任务被 `markInspectionExecutionFailed` 置为 `failed`。

> 注意：默认检查项（`normalizeInspectionCheckItems`，第 95 行）含 ICMP + SNMP 两项；只要存在 SNMP 项且 community 为空，任务必然出现失败项。

### 1.3 时间分界（为什么"之前成功、之后失败"）

通过 `git log` 锁定分界提交：

- `6d0b095`（2026-06-20）`fix(devices): 设备凭据响应脱敏并以"留空=保持原值"防误抹` —— 该提交把 `buildDeviceResponse` 的 `SnmpCommunity` 改为 `nil`。
- 此提交**之前**：`GetDeviceByID` 返回真实 community，巡检 SNMP 正常 → 任务成功。
- 此提交**之后**：community 恒为 `nil`，巡检 SNMP 全失败 → 任务失败。

补充：后续 `ac29616` / `3086aef`（2026-06-26，凭据 AES-256-GCM 加密入库）不是本问题主因——在脱敏这一步 community 已被截成 `nil`，根本到不了"密文是否能解密"的环节。最初"加密回归"的假设经一手代码核对后被证伪，真凶是更早的**响应脱敏**。

### 1.4 旁证：定时调度为何不受影响

`scheduler/service.go` 的定时采集走另一条路径：

- `executeTask`（第 418 行）→ `deviceService.ListActiveDevices`（第 568/1000 行）→ 返回 `[]Device`
- `Device` 经 `models.go:112 AfterFind` 钩子在查询后**自动解密**全部凭据（含 `SnmpCommunity`），拿到的是明文。

因此定时巡检/指标采集一直正常。这恰好说明：**内部执行就该使用返回 `Device` 的方法（凭据可用），而 `DeviceResponse` 是对外 DTO（凭据脱敏），巡检误用了后者。**

### 1.5 修复方案

将 `executeInspection` 改为使用 `GetDeviceRecord`（`devices/service.go:51`，返回 `Device` 值，已含 `AfterFind` 解密后的明文凭据），替换脱敏的 `GetDeviceByID`：

1. 第 156-165 行：`var device *devices.DeviceResponse` 改为 `var device *devices.Device`；获取改为
   ```go
   record, gerr := h.DeviceService.GetDeviceRecord(ctx, insp.DeviceID)
   // 错误处理同前
   device = &record
   ```
   取地址保持指针语义，使后续 `device != nil` 判空与字段访问完全不变。
2. 三个函数签名 `*devices.DeviceResponse` → `*devices.Device`：
   - `executeInspection`（第 142 行，局部变量）
   - `executeCheckItems`（第 283 行参数）
   - `collectInspectionSNMPMetrics`（第 347 行参数）

类型安全论证：`Device` 与 `DeviceResponse` 在巡检用到的字段上类型完全一致——`ID int`、`IPAddress string`、`Vendor string`、`SnmpCommunity *string`、`SnmpVersion *string`、`SnmpPort *int`、`Tags datatypes.JSON`。`ProbeDevice`（community/version/port 为 `*string/*int`）与 `SNMPMetricsCollector.CollectMetrics`（额外 vendor `string`、tags `interface{}`）的入参均匹配，故字段访问与下游调用**零改动**。

`DeviceService` 字段为具体类型 `*devices.Service`（`inspection.go:44`），已具备 `GetDeviceRecord` 方法，**无需改任何接口**。

安全性：`device` 仅在执行内部使用，不随任何 API 响应返回前端，凭据不外泄；与 scheduler 既有做法一致，不破坏 `6d0b095` 的对外脱敏目标。

---

## 二、问题 1：缺少"巡检完成"提示

### 2.1 现状

- 触发提示来自 `hooks/useInspection.ts:346 useTriggerExecution` 的 `onSuccess`（第 360 行 `toast.success('巡检任务已启动')`，文案默认"触发成功"），**只在触发瞬间**出现。
- 后端其实**已经广播完成事件**：`executeInspection` 在收口时调用 `broadcastScanProgress(StatusCompleted, 100)`（第 276 行），失败时经 `markInspectionExecutionFailed` → `broadcastScanProgress(StatusFailed)`（第 134 行），均发往 WS 房间 `scan_progress`。
- 前端 `lib/websocket.ts` 已能把 `scan_progress` 消息解析出 `INSPECTION_COMPLETE` 事件（终态 status：completed/failed/... 时）。

根因：**前端没有任何组件监听 `INSPECTION_COMPLETE` 去弹提示**。`InspectionExecutions.tsx` 仅监听 `INSPECTION_PROGRESS`（第 126 行）用于刷新列表，未做完成提示。基础设施齐备，只差"最后一公里"的订阅。

### 2.2 挂载点选择

`InspectionView.tsx`（第 37-57 行）采用 **tab 懒挂载**：`InspectionExecutions` 只有在用户点过"执行历史"tab 后才挂载。若把完成监听放在 `InspectionExecutions`，则用户在"巡检策略"tab 触发后停留原地、从未开过历史 tab 时，**收不到完成提示**。

因此完成提示监听应放在 **`InspectionView` 顶层**（只要进入巡检页面就始终挂载），保证触发后无论停在哪个子 tab 都能收到提示。

### 2.3 修复方案

在 `InspectionView.tsx` 顶层新增（不改动现有 tab 逻辑）：

1. `import toast from 'react-hot-toast'`、`import { useWebSocketEvent, WebSocketEvents, wsManager } from '@/lib/websocket'`。
2. `useEffect` 调用 `wsManager.subscribeToInspectionTasks()`（幂等，已有 `wasSubscribed` 保护）+ 在 `CONNECT` 时重订阅。
3. `useWebSocketEvent(WebSocketEvents.INSPECTION_COMPLETE, payload => ...)`：解析 `status`，`completed/success` → `toast.success('巡检任务已完成')`；`failed/error` → `toast.error('巡检任务执行失败')`。

职责划分：`InspectionView` 顶层负责"完成提示 toast"（全局唯一，避免重复弹窗）；`InspectionExecutions` 保留进度更新与列表刷新（仅历史 tab）。

已知行为：一个策略可能派生多个设备的 inspection，每个完成各广播一次，会逐个弹提示。先保持逐条提示（YAGNI）；若后续嫌吵，再做"按触发批次聚合 + 短防抖"的二次优化。

---

## 三、影响面、风险与验证

### 影响面
- 后端：仅 `inspection_execution.go` 一文件，改设备获取来源（脱敏 DTO → 内部领域对象）+ 三处函数签名；无接口/数据结构变更。
- 前端：仅 `InspectionView.tsx` 新增订阅与提示；纯增量，不动现有逻辑。

### 风险
- 低。后端改动沿用 scheduler 既有范式；`GetDeviceRecord` 经 `AfterFind` 解密，兼容存量明文与新密文（`Decrypt` 对无前缀值原样返回）。
- 凭据不外泄：`device` 不进入任何响应体。

### 验证
1. 后端编译：`scripts/test.ps1 -Scope backend`（或 `scripts/test.sh --scope backend`）。
2. 前端类型检查：`scripts/test.ps1 -Scope frontend`。
3. 手动回归：对配置了 SNMP 的设备触发巡检 → 期望 SNMP 检查项 `pass`、任务 `completed`；任务跑完时前端弹出"巡检任务已完成"提示。
4. 反向确认：故意配置错误 community → 任务 `failed` 且前端弹"巡检任务执行失败"。

---

## 四、待办清单

- [ ] 后端：`inspection_execution.go` 改用 `GetDeviceRecord` + 三处签名 `*DeviceResponse`→`*Device`
- [ ] 前端：`InspectionView.tsx` 增加 `INSPECTION_COMPLETE` 监听与 toast 提示
- [ ] 验证：后端 `go build` + 前端 `tsc` 通过；手动回归两条路径
