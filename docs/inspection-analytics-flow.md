# 巡检管理 - 统计分析子页面 逻辑流程图

> 本文档详细描述巡检管理页面中统计分析子页面的完整逻辑流程，包括前端组件交互、数据获取、后端处理和数据库查询。

## 一、系统架构概览

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              前端 (Next.js + React)                          │
├─────────────────────────────────────────────────────────────────────────────┤
│  InspectionView.tsx                                                          │
│       │                                                                      │
│       └── InspectionAnalytics.tsx (统计分析组件)                              │
│               │                                                              │
│               ├── useInspectionStats()      ─┐                               │
│               ├── useInspectionTrends()      │  React Query Hooks            │
│               ├── useDeviceDistribution()    │                               │
│               └── useProblemDistribution()  ─┘                               │
│                       │                                                      │
│                       ▼                                                      │
│               inspection.api.ts (API 调用层)                                  │
└───────────────────────────────────────────────────────────────────────────────┘
                        │ HTTP Request
                        ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                              后端 (Go + Echo)                                 │
├───────────────────────────────────────────────────────────────────────────────┤
│  router.go                                                                    │
│       │                                                                       │
│       └── inspection.go (Handler)                                             │
│               │                                                               │
│               ├── GetStats()                                                  │
│               ├── GetTrends()                                                 │
│               ├── GetDeviceDistribution()                                     │
│               └── GetProblemDistribution()                                    │
└───────────────────────────────────────────────────────────────────────────────┘
                        │ SQL Query
                        ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│                           数据库 (PostgreSQL)                                 │
├───────────────────────────────────────────────────────────────────────────────┤
│  inspection_strategies  │  inspections  │  inspection_results  │  devices     │
└───────────────────────────────────────────────────────────────────────────────┘
```

## 二、页面加载流程

### 2.1 整体加载时序图

```
用户访问巡检管理页面
        │
        ▼
┌───────────────────┐
│ InspectionView    │
│ 组件挂载          │
└─────────┬─────────┘
          │
          ▼
┌───────────────────┐
│ 渲染标签页导航     │
│ [策略][模板]      │
│ [历史][统计分析]  │
└─────────┬─────────┘
          │
          │ 用户点击"统计分析"标签
          ▼
┌───────────────────┐
│ InspectionAnalytics│
│ 组件挂载          │
└─────────┬─────────┘
          │
          ▼
┌───────────────────────────────────────────────────────┐
│              并行发起 4 个 API 请求                    │
├───────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐   │
│  │ Stats API   │  │ Trends API  │  │ Device Dist │   │
│  │ /stats      │  │ /trends     │  │ /device-    │   │
│  │             │  │             │  │ distribution│   │
│  └─────────────┘  └─────────────┘  └─────────────┘   │
│                                                       │
│  ┌─────────────┐                                     │
│  │ Problem Dist│                                     │
│  │ /problem-   │                                     │
│  │ distribution│                                     │
│  └─────────────┘                                     │
└───────────────────────────────────────────────────────┘
          │
          ▼
┌───────────────────┐
│ 数据返回后渲染     │
│ - KPI 卡片        │
│ - 趋势图表        │
│ - 分布图表        │
│ - 详情表格        │
└───────────────────┘
```


### 2.2 组件初始化流程

```
InspectionAnalytics 组件挂载
        │
        ▼
┌───────────────────────────────────────┐
│ 初始化状态                             │
│ - timePeriod: 'week' (默认按周)        │
│ - dateRange: { startDate, endDate }   │
└─────────────────┬─────────────────────┘
                  │
                  ▼
┌───────────────────────────────────────┐
│ useEffect 监听 timePeriod 变化         │
│ 自动计算 dateRange:                    │
│ - day: 最近7天                         │
│ - week: 最近4周                        │
│ - month: 最近12个月                    │
└─────────────────┬─────────────────────┘
                  │
                  ▼
┌───────────────────────────────────────┐
│ 触发数据获取 Hooks                     │
│ - useInspectionStats()                │
│ - useInspectionTrends(params)         │
│ - useDeviceDistribution()             │
│ - useProblemDistribution()            │
└───────────────────────────────────────┘
```

## 三、数据获取流程

### 3.1 统计汇总数据流程 (Stats)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         统计汇总数据获取流程                                  │
└─────────────────────────────────────────────────────────────────────────────┘

前端组件                    前端API                     后端Handler
────────────────────────────────────────────────────────────────────────────────
useInspectionStats()
        │
        │ queryFn
        ▼
fetchInspectionStats(timeRange?)
        │
        │ GET /api/v1/inspection/stats?range=week
        ▼
                                            GetStats(c echo.Context)
                                                    │
                                                    ▼
                                            ┌───────────────────┐
                                            │ 1. 权限验证        │
                                            │ inspections:read  │
                                            └─────────┬─────────┘
                                                      │
                                                      ▼
                                            ┌───────────────────┐
                                            │ 2. 查询策略统计    │
                                            │ - totalStrategies │
                                            │ - activeStrategies│
                                            └─────────┬─────────┘
                                                      │
                                                      ▼
                                            ┌───────────────────┐
                                            │ 3. 计算时间范围    │
                                            │ resolveStatsRange │
                                            └─────────┬─────────┘
                                                      │
                                                      ▼
                                            ┌───────────────────┐
                                            │ 4. 计算当前周期    │
                                            │ computeStatsSummary│
                                            │ - executions      │
                                            │ - successRate     │
                                            │ - avgScore        │
                                            └─────────┬─────────┘
                                                      │
                                                      ▼
                                            ┌───────────────────┐
                                            │ 5. 计算上一周期    │
                                            │ (用于对比变化)     │
                                            └─────────┬─────────┘
                                                      │
                                                      ▼
                                            ┌───────────────────┐
                                            │ 6. 计算变化百分比  │
                                            │ pctChange()       │
                                            │ deltaChange()     │
                                            └─────────┬─────────┘
                                                      │
        ┌─────────────────────────────────────────────┘
        │ JSON Response
        ▼
transformStatsData(response.data)
        │
        │ 字段映射转换
        ▼
返回 InspectionStats 对象
        │
        │ React Query 缓存 (2分钟)
        ▼
组件重新渲染 KPI 卡片
```

### 3.2 趋势数据流程 (Trends)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           趋势数据获取流程                                    │
└─────────────────────────────────────────────────────────────────────────────┘

前端组件                    前端API                     后端Handler
────────────────────────────────────────────────────────────────────────────────
useInspectionTrends({
  period: 'week',
  startDate: '2026-01-07',
  endDate: '2026-02-04'
})
        │
        │ queryFn
        ▼
fetchInspectionTrends(params)
        │
        │ GET /api/v1/inspection/trends?period=week&start_date=...&end_date=...
        ▼
                                            GetTrends(c echo.Context)
                                                    │
                                                    ▼
                                            ┌───────────────────┐
                                            │ 1. 解析参数        │
                                            │ - period          │
                                            │ - start_date      │
                                            │ - end_date        │
                                            └─────────┬─────────┘
                                                      │
                                                      ▼
                                            ┌───────────────────┐
                                            │ 2. 确定时间粒度    │
                                            │ date_trunc():     │
                                            │ - day → 'day'     │
                                            │ - week → 'week'   │
                                            │ - month → 'month' │
                                            └─────────┬─────────┘
                                                      │
                                                      ▼
                                            ┌───────────────────┐
                                            │ 3. 执行聚合查询    │
                                            │ SELECT            │
                                            │   date_trunc(...),│
                                            │   COUNT(*),       │
                                            │   SUM(success),   │
                                            │   SUM(failed),    │
                                            │   AVG(score)      │
                                            │ FROM inspections  │
                                            │ GROUP BY date     │
                                            └─────────┬─────────┘
                                                      │
        ┌─────────────────────────────────────────────┘
        │ JSON Array Response
        ▼
list.map(mapTrendPoint)
        │
        │ 转换为 TrendPoint[]
        ▼
返回趋势数据数组
        │
        │ React Query 缓存 (5分钟)
        ▼
组件重新渲染趋势图表
```


### 3.3 设备分布数据流程

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         设备分布数据获取流程                                  │
└─────────────────────────────────────────────────────────────────────────────┘

前端组件                    前端API                     后端Handler
────────────────────────────────────────────────────────────────────────────────
useDeviceDistribution()
        │
        │ queryFn
        ▼
fetchDeviceDistribution()
        │
        │ GET /api/v1/inspection/device-distribution
        ▼
                                            GetDeviceDistribution(c echo.Context)
                                                    │
                                                    ▼
                                            ┌───────────────────┐
                                            │ 1. 权限验证        │
                                            └─────────┬─────────┘
                                                      │
                                                      ▼
                                            ┌───────────────────┐
                                            │ 2. 执行分组查询    │
                                            │ SELECT            │
                                            │   device_type,    │
                                            │   COUNT(*)        │
                                            │ FROM devices      │
                                            │ GROUP BY          │
                                            │   device_type     │
                                            └─────────┬─────────┘
                                                      │
                                                      ▼
                                            ┌───────────────────┐
                                            │ 3. 分配颜色值      │
                                            │ colors[i % len]   │
                                            └─────────┬─────────┘
                                                      │
        ┌─────────────────────────────────────────────┘
        │ JSON Array Response
        ▼
items.map(item => ({
  name, value, color
}))
        │
        │ React Query 缓存 (10分钟)
        ▼
组件重新渲染饼图
```

### 3.4 问题分布数据流程

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         问题分布数据获取流程                                  │
└─────────────────────────────────────────────────────────────────────────────┘

前端组件                    前端API                     后端Handler
────────────────────────────────────────────────────────────────────────────────
useProblemDistribution()
        │
        │ queryFn
        ▼
fetchProblemDistribution()
        │
        │ GET /api/v1/inspection/problem-distribution
        ▼
                                            GetProblemDistribution(c echo.Context)
                                                    │
                                                    ▼
                                            ┌───────────────────┐
                                            │ 1. 权限验证        │
                                            └─────────┬─────────┘
                                                      │
                                                      ▼
                                            ┌───────────────────┐
                                            │ 2. 执行分组查询    │
                                            │ SELECT            │
                                            │   check_item_type,│
                                            │   COUNT(*)        │
                                            │ FROM              │
                                            │   inspection_     │
                                            │   results         │
                                            │ WHERE status IN   │
                                            │   ('fail','warn') │
                                            │ GROUP BY type     │
                                            │ ORDER BY count    │
                                            └─────────┬─────────┘
                                                      │
                                                      ▼
                                            ┌───────────────────┐
                                            │ 3. 映射中文标签    │
                                            │ categoryNames map │
                                            │ snmp → SNMP检查   │
                                            │ ssh → SSH检查     │
                                            │ ...               │
                                            └─────────┬─────────┘
                                                      │
        ┌─────────────────────────────────────────────┘
        │ JSON Array Response
        ▼
items.map(item => ({
  category, count
}))
        │
        │ React Query 缓存 (5分钟)
        ▼
组件重新渲染柱状图
```

## 四、用户交互流程

### 4.1 时间周期切换流程

```
用户选择时间周期 (day/week/month)
        │
        ▼
┌───────────────────────────────────────┐
│ handlePeriodChange(value)             │
│ setTimePeriod(value)                  │
└─────────────────┬─────────────────────┘
                  │
                  │ 触发 useEffect
                  ▼
┌───────────────────────────────────────┐
│ 根据 timePeriod 计算 dateRange        │
│                                       │
│ switch (timePeriod) {                 │
│   case 'day':                         │
│     startDate = now - 7天             │
│   case 'week':                        │
│     startDate = now - 28天            │
│   case 'month':                       │
│     startDate = now - 365天           │
│ }                                     │
└─────────────────┬─────────────────────┘
                  │
                  │ dateRange 变化
                  ▼
┌───────────────────────────────────────┐
│ useInspectionTrends 重新获取数据       │
│ queryKey 变化触发 refetch             │
└─────────────────┬─────────────────────┘
                  │
                  ▼
┌───────────────────────────────────────┐
│ 后端根据新的 period 参数               │
│ 调整 date_trunc() 粒度                │
└─────────────────┬─────────────────────┘
                  │
                  ▼
┌───────────────────────────────────────┐
│ 返回新粒度的趋势数据                   │
│ 图表重新渲染                          │
└───────────────────────────────────────┘
```


### 4.2 刷新数据流程

```
用户点击"刷新"按钮
        │
        ▼
┌───────────────────────────────────────┐
│ handleRefreshAll()                    │
└─────────────────┬─────────────────────┘
                  │
                  ▼
┌───────────────────────────────────────┐
│ Promise.all([                         │
│   refetchStats(),                     │
│   refetchTrends(),                    │
│   refetchDevice(),                    │
│   refetchProblem()                    │
│ ])                                    │
└─────────────────┬─────────────────────┘
                  │
                  │ 并行发起 4 个请求
                  ▼
┌───────────────────────────────────────┐
│ 后端返回最新数据                       │
│ React Query 更新缓存                  │
│ 组件重新渲染                          │
└───────────────────────────────────────┘
```

### 4.3 导出报告流程

```
用户点击"导出报告"按钮
        │
        ▼
┌───────────────────────────────────────┐
│ handleExportReport()                  │
└─────────────────┬─────────────────────┘
                  │
                  ▼
┌───────────────────────────────────────┐
│ toast.loading('正在生成报告...')       │
└─────────────────┬─────────────────────┘
                  │
                  ▼
┌───────────────────────────────────────┐
│ exportAnalyticsReport({               │
│   period: timePeriod,                 │
│   startDate: dateRange.startDate,     │
│   endDate: dateRange.endDate,         │
│   formatType: 'excel',                │
│   includeCharts: true                 │
│ })                                    │
└─────────────────┬─────────────────────┘
                  │
                  │ POST /api/v1/inspection/analytics/export
                  ▼
┌───────────────────────────────────────┐
│ 后端 ExportAnalytics()                │
│ 1. 解析参数                           │
│ 2. 调用 reports.GenerateReportFile()  │
│ 3. 返回文件流                         │
└─────────────────┬─────────────────────┘
                  │
                  │ Blob Response
                  ▼
┌───────────────────────────────────────┐
│ 前端处理文件下载                       │
│ 1. 获取 Content-Disposition           │
│ 2. 创建 Blob URL                      │
│ 3. 创建 <a> 元素触发下载              │
│ 4. 清理资源                           │
└─────────────────┬─────────────────────┘
                  │
                  ▼
┌───────────────────────────────────────┐
│ toast.success('报告已开始下载')        │
└───────────────────────────────────────┘
```

## 五、数据库查询详情

### 5.1 统计汇总查询

```sql
-- 查询策略总数
SELECT COUNT(*) FROM inspection_strategies;

-- 查询活跃策略数
SELECT COUNT(*) FROM inspection_strategies WHERE enabled = true;

-- 计算周期统计 (computeStatsSummary)
SELECT 
    COUNT(*) AS total_executions,
    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS success_count,
    AVG(CASE WHEN total_checks > 0 
        THEN passed_checks::float / total_checks * 100 
        ELSE NULL END) AS avg_score
FROM inspections
WHERE created_at >= :start_date AND created_at <= :end_date;
```

### 5.2 趋势数据查询

```sql
-- 按周分组的趋势查询
SELECT 
    date_trunc('week', created_at) AS date,
    COUNT(*) AS executions,
    SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS success,
    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
    AVG(CASE WHEN total_checks > 0 
        THEN passed_checks::float / total_checks * 100 
        ELSE NULL END) AS avg_score
FROM inspections
WHERE created_at >= :start_date AND created_at <= :end_date
GROUP BY date_trunc('week', created_at)
ORDER BY date;
```

### 5.3 设备分布查询

```sql
SELECT 
    device_type,
    COUNT(*) AS count
FROM devices
GROUP BY device_type;
```

### 5.4 问题分布查询

```sql
SELECT 
    check_item_type AS category,
    COUNT(*) AS count
FROM inspection_results
WHERE status IN ('fail', 'warning')
GROUP BY check_item_type
ORDER BY COUNT(*) DESC;
```

## 六、组件渲染结构

```
InspectionAnalytics
│
├── 操作栏
│   ├── Select (时间周期选择器)
│   │   ├── SelectItem: 按天
│   │   ├── SelectItem: 按周
│   │   └── SelectItem: 按月
│   ├── Button: 刷新
│   └── Button: 导出报告
│
├── KPI 指标卡片 (Grid 4列)
│   ├── Card: 总执行次数
│   │   ├── 数值: stats.todayExecutions
│   │   └── 变化: stats.changes.executionsChange
│   ├── Card: 成功率
│   │   ├── 数值: stats.successRate
│   │   └── 变化: stats.changes.successRateChange
│   ├── Card: 平均评分
│   │   ├── 数值: stats.avgScore
│   │   └── 变化: stats.changes.avgScoreChange
│   └── Card: 活跃策略
│       ├── 数值: stats.activeStrategies
│       └── 变化: stats.changes.strategiesChange
│
├── 趋势图表 (Grid 2列)
│   ├── Card: 执行次数趋势
│   │   └── AreaChartComponent
│   │       ├── xKey: date
│   │       └── areas: [executions, success]
│   └── Card: 巡检评分趋势
│       └── LineChartComponent
│           ├── xKey: date
│           └── lines: [avgScore]
│
├── 分布图表 (Grid 2列)
│   ├── Card: 设备类型分布
│   │   └── PieChartComponent
│   │       └── data: deviceDistribution
│   └── Card: 常见问题分布
│       └── BarChartComponent
│           ├── xKey: category
│           └── bars: [count]
│
└── 详情表格
    └── Card: 最近执行详情
        └── Table
            ├── 列: 日期
            ├── 列: 执行次数
            ├── 列: 成功率
            ├── 列: 平均评分
            └── 列: 问题数
```


## 七、状态管理与缓存策略

### 7.1 React Query 缓存配置

| 数据类型 | queryKey | staleTime | 说明 |
|----------|----------|-----------|------|
| 统计汇总 | `['inspection', 'stats', timeRange]` | 2分钟 | 频繁变化，缓存时间短 |
| 趋势数据 | `['inspection', 'trends', params]` | 5分钟 | 中等变化频率 |
| 设备分布 | `['inspection', 'device-distribution']` | 10分钟 | 变化较少，缓存时间长 |
| 问题分布 | `['inspection', 'problem-distribution']` | 5分钟 | 中等变化频率 |

### 7.2 缓存失效触发条件

```
缓存失效场景:
│
├── 自动失效
│   └── staleTime 到期后下次访问时 refetch
│
├── 手动失效
│   ├── 用户点击刷新按钮
│   └── 调用 refetch() 方法
│
└── 参数变化
    ├── timePeriod 变化 → trends 重新获取
    └── dateRange 变化 → trends 重新获取
```

## 八、错误处理流程

### 8.1 前端错误处理

```
API 请求
    │
    ▼
┌───────────────────────────────────────┐
│ try {                                 │
│   const response = await api.get()    │
│ } catch (error) {                     │
│   console.error('获取数据失败:', error) │
│   return 默认空数据                    │
│ }                                     │
└───────────────────────────────────────┘
    │
    │ 错误时返回空数据，不阻塞页面渲染
    ▼
┌───────────────────────────────────────┐
│ 组件正常渲染，显示空状态或默认值        │
└───────────────────────────────────────┘
```

### 8.2 后端错误处理

```
请求到达 Handler
    │
    ▼
┌───────────────────────────────────────┐
│ 1. 服务可用性检查                      │
│    if h.Service == nil {              │
│      return 503 Service Unavailable   │
│    }                                  │
└─────────────────┬─────────────────────┘
                  │
                  ▼
┌───────────────────────────────────────┐
│ 2. 权限验证                           │
│    if _, err := requirePermission()   │
│      return 403 Forbidden             │
│    }                                  │
└─────────────────┬─────────────────────┘
                  │
                  ▼
┌───────────────────────────────────────┐
│ 3. 数据库连接检查                      │
│    if db == nil {                     │
│      return 503 Database unavailable  │
│    }                                  │
└─────────────────┬─────────────────────┘
                  │
                  ▼
┌───────────────────────────────────────┐
│ 4. 查询执行                           │
│    if err := db.Scan().Error {        │
│      return 500 Internal Server Error │
│    }                                  │
└─────────────────┬─────────────────────┘
                  │
                  ▼
┌───────────────────────────────────────┐
│ 5. 返回成功响应                        │
│    return inspectionOK(c, data)       │
└───────────────────────────────────────┘
```

## 九、性能优化策略

### 9.1 前端优化

| 优化项 | 实现方式 | 效果 |
|--------|----------|------|
| 数据缓存 | React Query staleTime | 减少重复请求 |
| 并行请求 | 4个 hooks 同时执行 | 缩短加载时间 |
| 条件渲染 | isLoading 状态判断 | 避免空数据渲染 |
| 骨架屏 | Loading 占位组件 | 提升用户体验 |

### 9.2 后端优化

| 优化项 | 实现方式 | 效果 |
|--------|----------|------|
| 聚合查询 | SQL GROUP BY | 减少数据传输 |
| 索引优化 | created_at, status 索引 | 加速查询 |
| 连接池 | GORM 连接池配置 | 复用数据库连接 |
| 权限缓存 | Auth Service 缓存 | 减少权限查询 |

## 十、API 接口规范

### 10.1 统计汇总接口

```
GET /api/v1/inspection/stats

请求参数:
  - range: string (可选) - 时间范围，如 "week", "month"

响应格式:
{
  "code": 200,
  "message": "success",
  "data": {
    "totalStrategies": 5,
    "activeStrategies": 3,
    "todayExecutions": 42,
    "successRate": 95.2,
    "avgScore": 88.5,
    "changes": {
      "executionsChange": "+12.5%",
      "successRateChange": "+2.3%",
      "avgScoreChange": "-1.2%",
      "strategiesChange": "0.0%"
    },
    "recentExecutions": []
  }
}
```

### 10.2 趋势数据接口

```
GET /api/v1/inspection/trends

请求参数:
  - period: string (必填) - 时间粒度: "day" | "week" | "month"
  - start_date: string (可选) - 开始日期 YYYY-MM-DD
  - end_date: string (可选) - 结束日期 YYYY-MM-DD

响应格式:
{
  "code": 200,
  "message": "success",
  "data": [
    {
      "date": "2026-01-27T00:00:00Z",
      "executions": 120,
      "success": 114,
      "failed": 6,
      "avgScore": 92.5
    },
    ...
  ]
}
```

### 10.3 设备分布接口

```
GET /api/v1/inspection/device-distribution

响应格式:
{
  "code": 200,
  "message": "success",
  "data": [
    { "name": "Router", "value": 25, "color": "#5470C6" },
    { "name": "Switch", "value": 42, "color": "#91CC75" },
    { "name": "Firewall", "value": 18, "color": "#FAC858" }
  ]
}
```

### 10.4 问题分布接口

```
GET /api/v1/inspection/problem-distribution

响应格式:
{
  "code": 200,
  "message": "success",
  "data": [
    { "category": "SNMP检查", "count": 45 },
    { "category": "SSH检查", "count": 32 },
    { "category": "Ping检查", "count": 18 }
  ]
}
```

### 10.5 导出报告接口

```
POST /api/v1/inspection/analytics/export

请求参数:
  - period: string - 时间粒度
  - start_date: string - 开始日期
  - end_date: string - 结束日期
  - format_type: string - 导出格式: "excel" | "pdf"
  - include_charts: boolean - 是否包含图表

响应:
  - Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet
  - Content-Disposition: attachment; filename="statistics_report_xxx.xlsx"
  - Body: 文件二进制流
```

---

## 附录：文件路径索引

| 文件 | 路径 | 说明 |
|------|------|------|
| 统计分析组件 | `frontend/src/features/inspection/components/InspectionAnalytics.tsx` | 前端主组件 |
| 数据获取 Hooks | `frontend/src/features/inspection/hooks/useInspection.ts` | React Query Hooks |
| API 调用函数 | `frontend/src/features/inspection/api/inspection.api.ts` | HTTP 请求封装 |
| 类型定义 | `frontend/src/features/inspection/types/index.ts` | TypeScript 类型 |
| 后端处理器 | `backend-go/internal/http/handlers/inspection.go` | Go HTTP Handler |
| 业务逻辑 | `backend-go/internal/inspection/service.go` | 业务服务层 |
| 数据模型 | `backend-go/internal/inspection/models.go` | GORM 模型定义 |
