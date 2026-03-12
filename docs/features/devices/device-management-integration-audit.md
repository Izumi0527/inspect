# 设备管理页面联调与业务流程梳理

## 页面职责

设备管理页负责承接以下主流程：

- 设备分页查询、筛选、搜索与统计展示
- 新增设备、编辑设备、删除设备
- 设备详情查看
- 单设备探测、批量探测
- 设备性能查看与健康检查
- 批量导入、批量更新、批量删除

## 前后端接口映射

| 页面能力 | 前端入口                                  | 前端 API                   | 后端接口                                |
| -------- | ----------------------------------------- | -------------------------- | --------------------------------------- |
| 设备列表 | `DeviceManagementView` 初始化、筛选、分页 | `fetchDevices()`           | `GET /devices`                          |
| 设备统计 | 统计卡片                                  | `fetchDeviceStats()`       | `GET /devices/statistics`               |
| 新增设备 | `AddDeviceModal`                          | `createDevice()`           | `POST /devices`                         |
| 编辑设备 | `EditDeviceModal`                         | `updateDevice()`           | `PUT /devices/:device_id`               |
| 删除设备 | 列表删除按钮                              | `deleteDevice()`           | `DELETE /devices/:device_id`            |
| 设备详情 | `DeviceDetailsModal` 打开时               | `fetchDevice()`            | `GET /devices/:device_id`               |
| 健康检查 | 详情弹窗按钮                              | `healthCheckDevice()`      | `POST /devices/:device_id/health-check` |
| 性能数据 | 详情弹窗打开/切换时间范围                 | `fetchDevicePerformance()` | `GET /devices/:device_id/performance`   |
| 批量删除 | 批量工具栏                                | `batchDeleteDevices()`     | `POST /devices/batch-delete`            |
| 批量更新 | 批量工具栏                                | `bulkUpdateDevices()`      | `POST /devices/batch-update`            |
| 批量探测 | 批量工具栏、本页探测                      | `batchProbeDevices()`      | `POST /devices/batch-probe`             |
| 批量导入 | 导入弹窗                                  | `bulkImportDevices()`      | `POST /devices/batch-import`            |

## 当前业务主流程图

```mermaid
flowchart TD
    A[进入设备管理页] --> B[初始化筛选状态<br/>URL ?search=... -> searchQuery]
    A --> S0[加载统计<br/>GET /devices/statistics]
    B --> Q0[构建列表查询参数<br/>page/page_size/search/status/device_type]
    Q0 --> L0[加载列表<br/>GET /devices]
    L0 --> RACE[requestId 竞态保护<br/>仅最新响应写入 state]
    RACE --> OK{列表加载成功?}

    OK -- 否 --> ETYPE{HTTP 403?}
    ETYPE -- 是 --> P403[无权限页<br/>返回/重试(loadDevices)]
    ETYPE -- 否 --> PERR[错误页<br/>刷新页面/重试(loadDevices)]
    OK -- 是 --> UI[渲染页面<br/>统计卡片 + 筛选区 + 表格 + 批量栏]

    UI --> POLL_L[每 60s 列表静默轮询<br/>loadDevices(silent=true)]
    UI --> POLL_S[每 60s 统计轮询<br/>loadStats()]
    POLL_L --> UI
    POLL_S --> UI

    UI --> SF0[搜索/筛选变化]
    SF0 --> SF1[搜索 350ms 防抖]
    SF1 --> SF2[筛选签名变化 -> 清空跨页选择]
    SF2 --> SF3{当前页=1?}
    SF3 -- 否 --> SF4[重置到第 1 页]
    SF4 --> Q0
    SF3 -- 是 --> Q0

    UI --> PG0[分页变化]
    PG0 --> PG1[保留跨页已选快照]
    PG1 --> Q0

    UI --> NB0{非阻断错误且仍有表格数据?}
    NB0 -- 是 --> NB1[错误提示条<br/>显示错误 + 重试按钮]
    NB1 --> NB2[点击重试<br/>清除 error -> loadDevices()]
    NB2 --> Q0
    NB0 -- 否 --> UI

    UI --> SP0[单条探测]
    SP0 --> SP1[POST /devices/:id/probe<br/>?update_status=...]
    SP1 --> SP2{后端允许写回?}
    SP2 -- 否 --> SP3[权限降级/只读探测<br/>不写库]
    SP2 -- 是 --> SP4[探测并尝试写回 DB]
    SP3 --> SP5[响应 status_updated=false]
    SP4 --> SP6[响应 status_updated=true/false]
    SP5 --> SP7[Toast 展示 ICMP/SNMP 结果]
    SP6 --> SP7
    SP7 --> SP8{前端允许刷新?}
    SP8 -- 是 --> R0[刷新列表 + 刷新统计]
    SP8 -- 否 --> UI
    R0 --> UI

    UI --> BP0[批量探测（选中/本页）]
    BP0 --> BP1[POST /devices/batch-probe<br/>?update_status=...<br/>Body: device_ids,max_concurrent]
    BP1 --> BP2{后端允许写回?}
    BP2 -- 否 --> BP3[权限降级/只读批量探测]
    BP2 -- 是 --> BP4[批量探测并逐台尝试写回]
    BP3 --> BP5[响应 results + status_updated=false<br/>status_updated_count=0]
    BP4 --> BP6[响应 results + status_updated<br/>status_updated_count>0]
    BP5 --> BP7[Toast 展示汇总<br/>probed/在线/SNMP成功]
    BP6 --> BP7
    BP7 --> BP8{前端允许刷新?}
    BP8 -- 是 --> R0
    BP8 -- 否 --> UI

    UI --> BU0[批量更新]
    BU0 --> BU1[弹窗：选择字段与值]
    BU1 --> BU2[POST /devices/batch-update]
    BU2 --> BU3[Toast：成功/失败]
    BU3 --> R0

    UI --> BD0[批量删除]
    BD0 --> BD1[二次确认]
    BD1 --> BD2[POST /devices/batch-delete<br/>Body: [1,2,3] 或 {device_ids:[]}]
    BD2 --> BD3[Toast：成功/部分失败<br/>可含失败设备预览]
    BD3 --> BD4[刷新列表 + 刷新统计<br/>即使部分失败也刷新]
    BD4 --> UI

    UI --> IM0[CSV 批量导入]
    IM0 --> IM1[步骤1 上传(upload)<br/>选择/拖拽 CSV]
    IM1 --> IM2{后缀/解析成功?}
    IM2 -- 否 --> IME1[上传错误提示<br/>仅 .csv / 解析失败说明]
    IME1 --> IM1
    IM2 -- 是 --> IM3[步骤2 映射(mapping)<br/>自动识别表头 + 手动调整]
    IM3 --> IM4{必填字段映射齐全?}
    IM4 -- 否 --> IME2[映射错误提示<br/>缺少必填字段]
    IME2 --> IM3
    IM4 -- 是 --> IM5[步骤3 预览(preview)<br/>展示将导入的记录]
    IM5 --> IM6[提交：开始导入]
    IM6 --> IM7{前端校验通过?}
    IM7 -- 否 --> IMR0[步骤4 结果(result)<br/>失败：行号/原因]
    IM7 -- 是 --> IM8[POST /devices/batch-import]
    IM8 --> IMR1[步骤4 结果(result)<br/>成功/部分跳过（含错误列表）]
    IMR0 --> IM9{imported_count > 0 ?}
    IMR1 --> IM9
    IM9 -- 是 --> R0
    IM9 -- 否 --> UI
```

> 备注：当前实现中，若 URL 初始包含 `?search=`，会先触发一次默认列表请求（search 为空），随后在 `filters.searchQuery` 写入并完成 350ms 防抖后，再触发一次带 search 的列表请求；`useDevices` 的 requestId 保护会避免旧响应覆盖新结果。

### 探测写回语义（update_status / status_updated / status_updated_count）

- `update_status`：Query 参数，默认 `true`；表示“允许后端将探测结果写回设备状态”。
- 权限降级：当请求方缺少 `devices:update` 权限时，即便传 `update_status=true`，后端也会强制降级为只读探测（不写回 DB）。前端页面会在无更新权限时自动以 `updateStatus=false` 调用探测接口，避免触发无效写回。
- 返回字段：
  - 单条探测/健康检查：响应可能包含 `status_updated: boolean`（本次是否成功写回）。
  - 批量探测：响应可能额外包含 `status_updated_count: number`（成功写回台数），且 `status_updated` 通常表示是否存在至少 1 台写回成功。

### 刷新触发条件（以当前代码实现为准）

- **列表刷新（loadDevices）触发：** 页面初始化；分页变化；筛选/搜索变化（搜索 350ms 防抖后触发，且筛选变化会清空跨页选择并必要时重置为第 1 页）；`useDevices` 60s 静默轮询；错误态点击“重试加载”；单设备探测完成（仅当允许写回状态时，`DeviceProbeButton.onProbeComplete` 才会触发刷新）；编辑成功；新增成功；单设备删除确认；批量探测完成（仅当允许写回状态时才会刷新）；批量更新完成（至少成功更新 1 台才会刷新）；批量删除完成后刷新（即使部分失败也会刷新）；批量导入仅在 `imported_count>0` 时刷新。
- **统计刷新（loadStats / fetchDeviceStats）触发：** 页面初始化；60s 统计轮询；单设备探测完成（仅当允许写回状态时才会刷新）；编辑成功；新增成功；单设备删除确认；批量探测完成（仅当允许写回状态时才会刷新）；批量更新完成（至少成功更新 1 台才会刷新）；批量删除完成后刷新（即使部分失败也会刷新）；批量导入仅在 `imported_count>0` 时刷新。

## 本轮修复重点

- 设备编辑与详情弹窗改为“凭据只写不回显”，避免敏感信息从后端回流前端。
- 前端映射补齐 `snmp_port` 与 `*_configured` 状态，确保表单、详情、接口三处一致。
- 详情弹窗已真实接入健康检查与性能数据接口，不再只是静态占位展示。
- 设备统计改为基于 `alerts` 活跃告警统计，补齐 `alerting_devices` 字段，避免依赖设备缓存字段造成统计失真。
- 设备管理页已接入批量更新/批量探测能力，并在操作完成后刷新列表与统计；批量删除完成后会刷新列表与统计（即使部分失败）。
- 统计卡片已补齐与设备列表一致的 `60s` 轮询刷新，避免列表更新后统计仍停留旧值。
- 设备管理页批量选择已升级为“跨页 ID + 设备快照”模型，翻页后仍可保留已选设备并继续批量更新。
- 服务端分页场景下，切换筛选条件时仍会主动清空跨页选择，避免旧筛选结果残留为“幽灵选择”。
- 通用表格组件的页头复选框已改为只反映当前页勾选状态，跨页已选设备不会误导当前页的全选状态。
- `useDevices` 已增加“仅最新请求可回写状态”的保护，避免轮询、分页、筛选和操作刷新并发时出现旧响应覆盖新列表。
- 设备列表 API 映射已保留缺失的性能字段为空值，列表页在无采样时会显示 `-`，不再伪造 `0.0%`。
- 设备详情弹窗在性能指标缺失时统一展示 `-`，不再用 `0.0%` 伪装成真实采样值。
- 设备详情弹窗已补齐“打开详情 -> 拉性能 -> 执行健康检查 -> 切换时间范围再次拉取性能”的组件级回归测试。

## 现阶段结论

- 设备管理页主流程已经形成完整前后端闭环。
- 关键敏感字段已经改为脱敏返回，编辑场景留空不会误覆盖已有凭据。
- 批量更新、健康检查、性能查看三个此前未闭环的能力已接入主流程。
- 前端设备管理页与后端设备 API 已真实对接，当前未发现“静态假数据驱动页面”的残留路径。
- 列表查询链路已具备基础竞态保护，旧请求晚返回时不会再覆盖最新筛选/分页结果。
- 批量选择策略已调整为“同一筛选上下文内支持跨页保留选择”，批量更新弹窗能够正确展示跨页设备快照。
- 设备性能字段在“未返回采样值”的场景下已保持语义一致，前端不会再将缺失值误展示为 `0.0%`。

## 后续建议

- 为批量更新补充字段白名单测试，防止后续误把前端临时字段透传到后端。
- 若后续需要在多个设备子页面之间共享批量选择，建议再把当前页面内的设备快照模型上提到统一 store。
