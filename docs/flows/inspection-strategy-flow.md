# 巡检策略触发流程分析

## 概述

本文档详细分析巡检策略的手动触发和定时触发的完整流程，以及当前系统存在的问题和改进建议。

## 数据模型关系

```
┌─────────────────────────┐     ┌─────────────────────────┐
│  inspection_strategies  │     │  inspection_schedules   │
│  (巡检策略表)            │     │  (巡检计划表)            │
├─────────────────────────┤     ├─────────────────────────┤
│  id                     │     │  id                     │
│  name                   │     │  name                   │
│  type (scheduled/manual)│     │  cron_expression        │
│  cron                   │     │  template_id            │
│  devices (JSON)         │     │  device_group_id        │
│  templates (JSON)       │     │  is_active              │
│  enabled                │     │  next_run               │
└─────────────────────────┘     └─────────────────────────┘
           │                               │
           │                               │
           ▼                               ▼
┌─────────────────────────────────────────────────────────┐
│                      inspections                         │
│                    (巡检任务表)                           │
├─────────────────────────────────────────────────────────┤
│  id                                                      │
│  device_id          → devices.id                         │
│  template_id        → inspection_templates.id            │
│  schedule_id        → inspection_schedules.id (NOT strategies!) │
│  name                                                    │
│  trigger (manual/scheduled)                              │
│  status (pending/running/completed/failed)               │
│  started_at, completed_at, duration                      │
│  total_checks, passed_checks, failed_checks              │
└─────────────────────────────────────────────────────────┘
           │
           ▼
┌─────────────────────────────────────────────────────────┐
│                  inspection_results                      │
│                  (巡检结果表)                             │
├─────────────────────────────────────────────────────────┤
│  id                                                      │
│  inspection_id      → inspections.id                     │
│  check_item_name                                         │
│  status (pass/warning/fail/skip)                         │
│  actual_value, expected_value                            │
└─────────────────────────────────────────────────────────┘
```

## 手动触发流程

### 当前实现

```
┌──────────────┐    POST /api/v1/inspection/strategies/:id/trigger
│   前端页面    │ ─────────────────────────────────────────────────►
│  点击"执行"   │
└──────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │   TriggerStrategy Handler     │
                    │   (inspection.go:646)         │
                    ├───────────────────────────────┤
                    │ 1. 验证权限                    │
                    │ 2. 获取策略信息                │
                    │ 3. 解析设备列表和模板列表       │
                    │ 4. 调用 CreateInspections     │
                    └───────────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │   CreateInspections           │
                    │   (service.go:439)            │
                    ├───────────────────────────────┤
                    │ 为每个设备创建一条             │
                    │ inspections 记录              │
                    │ status = "pending"            │
                    └───────────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────┐
                    │   返回 inspection_ids         │
                    │   HTTP 200                    │
                    └───────────────────────────────┘
                                    │
                                    ▼
                              ❌ 流程结束
                         (没有后续执行逻辑!)
```

### 问题分析

**核心问题：创建了巡检任务记录，但没有实际执行巡检！**

当前 `TriggerStrategy` 只做了以下事情：
1. 在 `inspections` 表中创建记录（status = "pending"）
2. 返回创建的 inspection_ids

**缺失的部分：**
- 没有启动实际的巡检执行逻辑
- 没有调用设备探测服务
- 没有收集 SNMP 数据
- 没有更新巡检状态为 "running" → "completed"
- 没有写入 `inspection_results` 表

## 定时触发流程

### 当前实现

```
┌──────────────────────────────────────────────────────────────┐
│                    Scheduler Service                          │
│                    (scheduler/service.go)                     │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────────┐                                         │
│  │  Start()        │  启动调度器                              │
│  │  (定时循环)      │                                         │
│  └────────┬────────┘                                         │
│           │                                                   │
│           ▼                                                   │
│  ┌─────────────────┐                                         │
│  │ checkAndRunTasks│  每60秒检查一次                          │
│  └────────┬────────┘                                         │
│           │                                                   │
│           ▼                                                   │
│  ┌─────────────────┐                                         │
│  │ 查询 scheduled_ │  查找到期且未运行的任务                   │
│  │ tasks 表        │  WHERE enabled=true                      │
│  │                 │  AND next_run <= now                     │
│  │                 │  AND status != 'running'                 │
│  └────────┬────────┘                                         │
│           │                                                   │
│           ▼                                                   │
│  ┌─────────────────┐                                         │
│  │ executeTask()   │  根据 task_type 执行不同逻辑             │
│  └────────┬────────┘                                         │
│           │                                                   │
│           ├── task_type = "device_inspection"                │
│           │   └── executeDeviceInspection()                  │
│           │       ├── 获取所有活跃设备                        │
│           │       ├── BatchProbeDevices() 批量探测            │
│           │       ├── 更新设备状态                            │
│           │       └── 收集 SNMP 指标                          │
│           │                                                   │
│           ├── task_type = "metrics_collection_5min"          │
│           │   └── executeMetricsCollection()                 │
│           │                                                   │
│           └── task_type = "network_scan"                     │
│               └── executeNetworkScan()                       │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

### 定时任务与巡检策略的关系

**重要发现：定时任务系统 (scheduled_tasks) 和巡检策略系统 (inspection_strategies) 是两套独立的系统！**

| 系统 | 表 | 用途 |
|------|-----|------|
| 定时任务系统 | `scheduled_tasks` | 系统级定时任务（设备巡检、指标收集、网络扫描等） |
| 巡检策略系统 | `inspection_strategies` | 用户自定义的巡检策略 |

当前问题：
- `inspection_strategies` 表中的策略**没有被任何调度器执行**
- 用户创建的巡检策略只是存储在数据库中，没有实际运行

## 完整的巡检执行流程（应该实现的）

```
┌──────────────┐
│  触发来源     │
├──────────────┤
│ • 手动触发    │
│ • 定时触发    │
└──────┬───────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│                    创建巡检任务                                │
│                    (inspections 表)                           │
│                    status = "pending"                         │
└──────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│                    启动巡检执行                                │
│                    status = "running"                         │
├──────────────────────────────────────────────────────────────┤
│ 1. 获取模板的检查项列表                                        │
│ 2. 获取目标设备信息                                            │
│ 3. 根据检查项类型执行检查：                                     │
│    • SNMP: 查询 OID 获取值                                     │
│    • SSH: 执行命令获取输出                                      │
│    • HTTP: 发送请求检查响应                                     │
│    • Ping: 检测连通性                                          │
│ 4. 对比阈值，判断检查结果                                       │
│ 5. 写入 inspection_results 表                                  │
└──────────────────────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────────────┐
│                    完成巡检                                    │
│                    status = "completed" / "failed"            │
├──────────────────────────────────────────────────────────────┤
│ • 更新 inspections 表的统计字段                                │
│   (total_checks, passed_checks, failed_checks 等)             │
│ • 计算巡检得分                                                 │
│ • 发送通知（如果配置了）                                        │
└──────────────────────────────────────────────────────────────┘
```

## 改进建议

### 方案一：在 TriggerStrategy 中直接执行巡检

```go
func (h InspectionHandler) TriggerStrategy(c echo.Context) error {
    // ... 现有代码 ...
    
    // 创建巡检记录
    inspections, err := h.Service.CreateInspections(...)
    
    // 【新增】异步执行巡检
    go func() {
        for _, insp := range inspections {
            h.executeInspection(context.Background(), insp)
        }
    }()
    
    return inspectionOKWithMessage(c, "触发策略执行成功", ...)
}

func (h InspectionHandler) executeInspection(ctx context.Context, insp Inspection) {
    // 1. 更新状态为 running
    h.Service.UpdateInspectionStatus(ctx, insp.ID, StatusRunning, nil)
    
    // 2. 获取模板检查项
    template, _ := h.Service.GetTemplate(ctx, *insp.TemplateID)
    checkItems := parseCheckItems(template.CheckItems)
    
    // 3. 获取设备信息
    device, _ := h.DeviceService.GetDevice(ctx, insp.DeviceID)
    
    // 4. 执行每个检查项
    results := []Result{}
    for _, item := range checkItems {
        result := h.executeCheckItem(ctx, device, item)
        results = append(results, result)
    }
    
    // 5. 保存结果并更新状态
    h.Service.SaveResults(ctx, insp.ID, results)
    h.Service.UpdateInspectionStatus(ctx, insp.ID, StatusCompleted, nil)
}
```

### 方案二：将巡检策略集成到调度器

修改 `scheduler/service.go`，添加对 `inspection_strategies` 表的支持：

```go
func (s *Service) checkAndRunStrategies(ctx context.Context) {
    // 查询到期的巡检策略
    strategies := s.inspectionService.ListDueStrategies(ctx)
    
    for _, strategy := range strategies {
        go s.executeStrategy(ctx, strategy)
    }
}
```

## 当前系统状态总结

| 功能 | 状态 | 说明 |
|------|------|------|
| 创建巡检策略 | ✅ 正常 | 可以创建、编辑、删除策略 |
| 手动触发策略 | ✅ 已实现 | 创建巡检记录并异步执行巡检 |
| 定时触发策略 | ❌ 未实现 | 策略的 cron 表达式没有被调度器使用 |
| 系统定时任务 | ✅ 正常 | scheduled_tasks 表的任务正常执行 |
| 巡检结果记录 | ✅ 已实现 | inspection_results 表有数据写入 |

## 已实现的功能（2026-01-31）

### 手动触发巡检执行流程

```
┌──────────────┐    POST /api/v1/inspection/strategies/:id/trigger
│   前端页面    │ ─────────────────────────────────────────────────►
│  点击"执行"   │
└──────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────────────────────┐
                    │   TriggerStrategy Handler                     │
                    │   (inspection.go)                             │
                    ├───────────────────────────────────────────────┤
                    │ 1. 验证权限                                    │
                    │ 2. 获取策略信息                                │
                    │ 3. 解析设备列表和模板列表                       │
                    │ 4. 调用 CreateInspections 创建 pending 记录    │
                    │ 5. 启动异步执行 goroutine                      │
                    │ 6. 立即返回响应给前端                          │
                    └───────────────────────────────────────────────┘
                                    │
                                    ▼ (异步)
                    ┌───────────────────────────────────────────────┐
                    │   executeInspectionsAsync                     │
                    ├───────────────────────────────────────────────┤
                    │ 1. 获取模板检查项                              │
                    │ 2. 遍历每个巡检任务执行                        │
                    └───────────────────────────────────────────────┘
                                    │
                                    ▼
                    ┌───────────────────────────────────────────────┐
                    │   executeInspection (每个设备)                 │
                    ├───────────────────────────────────────────────┤
                    │ 1. 更新状态为 running                          │
                    │ 2. 获取设备信息                                │
                    │ 3. 执行设备探测 (ICMP + SNMP)                  │
                    │ 4. 执行检查项并生成结果                        │
                    │ 5. 保存结果到 inspection_results 表            │
                    │ 6. 更新统计信息                                │
                    │ 7. 更新状态为 completed                        │
                    └───────────────────────────────────────────────┘
```

### 新增的代码

1. **InspectionHandler 新增依赖**:
   - `DeviceService`: 获取设备信息
   - `ProbeService`: 执行设备探测
   - `Logger`: 日志记录

2. **新增方法**:
   - `executeInspectionsAsync`: 异步执行巡检任务
   - `executeInspection`: 执行单个巡检
   - `executeCheckItems`: 执行检查项
   - `executeICMPCheck`: 执行 ICMP 检查
   - `executeSNMPCheck`: 执行 SNMP 检查

3. **inspection/service.go 新增方法**:
   - `SaveInspectionResult`: 保存巡检结果
   - `UpdateInspectionStats`: 更新巡检统计

## 文件位置参考

- 策略触发 Handler: `backend-go/internal/http/handlers/inspection.go:646`
- 创建巡检记录: `backend-go/internal/inspection/service.go:439`
- 调度器服务: `backend-go/internal/scheduler/service.go`
- 设备巡检执行: `backend-go/internal/scheduler/service.go:509`
- 巡检模型定义: `backend-go/internal/inspection/models.go`
