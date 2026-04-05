# 监控中心页面数据流分析

## 📊 系统架构概览

```
┌─────────────────────────────────────────────────────────────────┐
│                     前端监控页面 (React 19)                      │
│  MonitoringView.tsx + useMonitoringV2 Hook                      │
└────────────────────────┬────────────────────────────────────────┘
                          │ HTTP/WebSocket
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                  后端 API 服务 (Go + Echo)                       │
│  MonitoringHandler + MetricsWriter Service                      │
└────────────────────────┬────────────────────────────────────────┘
                          │ SQL Queries
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│      数据库 (PostgreSQL + TimescaleDB + Redis[可选])            │
│  device_metrics (时序表) + devices (设备表)                     │
└─────────────────────────────────────────────────────────────────┘
```

## 🧭 监控中心业务逻辑流程图（页面级）

> 说明：该流程图聚焦 `/monitoring` 页面从“鉴权 → 拉取数据 → 分区降级渲染 → 用户交互/轮询更新”的闭环。
> 注意：`NEXT_PUBLIC_DISABLE_AUTH_CHECK=true` 仅在开发环境（`NODE_ENV=development`）生效；生产/测试环境会忽略该开关，避免误配置导致越权访问。

```mermaid
flowchart TD
  A[进入 /monitoring] --> B{开发环境 && NEXT_PUBLIC_DISABLE_AUTH_CHECK?}
  B -->|true| C[直接渲染 MonitoringView]
  B -->|false| D[RouteGuard: 登录 + monitoring:read]
  D -->|未登录| E[跳转 /login]
  D -->|无权限| E2[AccessDenied: 无权限访问]
  D -->|通过| C

  C --> F[useMonitoringV2(useQuery)]
  C --> V{页面可见?}
  V -->|否| V0[暂停轮询 + 退订 WS 房间]
  V -->|是| WS[WebSocket: 订阅 device_metrics；有 alerts:read 再订阅 alerts]
  WS --> WSEvt[推送: device_metrics/alert]
  WSEvt --> WSR{页面可见?}
  WSR -->|否| WSR0[忽略推送（避免后台刷新）]
  WSR -->|是| WSR1[受控刷新: debounce -> refetch()]
  F --> G[fetchMonitoringDataV2]
  G --> H{优先聚合接口?}
  H -->|是| H0[POST /api/v1/monitoring/dashboard/v2]
  H0 --> I[返回 MonitoringDataEnvelope{data, sections, hasPartialFailure}]
  H -->|后端未升级(404)| Hx[回退: Promise.allSettled 并行多端点]
  Hx --> H1[GET /api/v1/monitoring/stats]
  Hx --> H2[POST /api/v1/monitoring/system/performance]
  Hx --> H3[POST /api/v1/monitoring/devices/temperature]
  Hx --> H4[GET /api/v1/monitoring/devices/distribution]
  Hx --> H5[GET /api/v1/monitoring/availability]
  Hx --> H6[POST /api/v1/monitoring/network/traffic/history]
  Hx --> H7[GET /api/v1/alerts (列表)]
  Hx --> I[组装 MonitoringDataEnvelope{data, sections, hasPartialFailure}]
  I --> J{是否全部分区失败?}
  J -->|是| K[全局错误态 + 重试(refetch)]
  J -->|否| L[页面渲染]

  L --> M{某分区 ok?}
  M -->|false| N[分区降级: FailureCard/提示]
  M -->|true| O[渲染卡片/图表]

  L --> P[手动刷新: refetch()]
  L --> Q[导出报告: POST /api/v1/monitoring/reports/export（time_range=当前选择）]
  Q --> Q2{返回 download_token?}
  Q2 -->|是| Q3[下载: form POST /api/v1/monitoring/reports/download（token）→ 浏览器原生下载（避免 blob 占内存）]
  Q2 -->|否| Q4[兼容回退: GET download_url（Authorization）→ blob 保存]
  F --> R[断线兜底轮询: refetchInterval（仅离线且页面可见）]
```

### 补充：分区状态（sections）的语义约定

监控中心聚合接口（`POST /api/v1/monitoring/dashboard/v2`）会返回分区状态 `sections`，用于前端做“分区降级渲染”。  
除基础字段外，部分分区可能出现“权限限制”场景（例如实时告警）。

- `sections.<key>.ok`：是否成功获取该分区数据
- `sections.<key>.message`：失败或提示信息（可选）
- `sections.<key>.limitedByPermission`：是否因权限限制而隐藏该分区（可选）
- `sections.<key>.requiredPermission`：访问该分区所需的最小权限（可选）

约定：

- `limitedByPermission=true` 时，该分区属于“权限限制”而非“技术失败”，不应计入 `hasPartialFailure/failedSections`。
- 前端在无权限时应展示“无权限提示卡片”，而不是“加载失败/重试”样式，避免误导。

## 1️⃣ 前端数据获取流程

### 1.1 监控页面组件 (MonitoringView.tsx)

**主要职责:**
- 展示6个统计卡片 (总设备、可用性、活跃告警、平均CPU、平均内存、网络流量)
- 显示2个图表 (系统性能趋势 + 设备温度监控)
- 显示3个详情卡片 (设备状态分布 + 整体可用性 + 实时告警)
- 显示网络流量历史图表

**数据获取方式:**
```typescript
// ✅ 推荐：WebSocket 在线时由推送触发“受控刷新”；断线时启用轮询兜底
const [timeRange, setTimeRange] = useState('24h') // 24h / 7d / 30d
const pageVisible = document.visibilityState !== 'hidden' // 可用 Page Visibility API 维护成 state

const { data, isLoading, error, refetch } = useMonitoringV2({
  timeRange,
  // 页面不可见时暂停轮询；同时 MonitoringView 会退订 WS 房间且忽略推送触发的 refetch，降低后台刷新开销
  enablePolling: !wsConnected && pageVisible,
  refetchInterval: 120000, // 断线兜底轮询间隔（2分钟）
})
```

### 1.2 自定义 Hook (useMonitoringV2.ts)

**功能:**
- 使用 React Query 管理数据获取
- 断线兜底轮询（默认 2 分钟，可配置）
- 错误处理与重试机制
- 缓存管理 (5分钟缓存, 1分钟陈旧时间)

**关键配置:**
```typescript
// ✅ 按用户隔离缓存，避免同一浏览器内切换账号时短暂展示上一账号的监控数据
queryKey: ['monitoring-v2', userCacheKey, timeRange]
refetchInterval: 120000  // 轮询间隔（默认2分钟）
enablePolling: true      // 是否启用轮询（监控页面会按 WS 状态动态开关）
staleTime: 60 * 1000    // 陈旧时间
gcTime: 5 * 60 * 1000   // 缓存时间
retry: 1                 // 兜底重试1次（底层 HttpClient 已含重试）
```

### 1.3 API 客户端 (monitoring.api.ts)

**核心 API 端点:**

| 功能 | 端点 | 说明 |
|------|------|------|
| 监控中心聚合(v2) | `POST /monitoring/dashboard/v2` | ✅ 推荐：单请求返回页面所需数据 + 分区状态 |
| 统计数据 | `GET /monitoring/stats` | 6个关键指标 |
| 系统性能 | `POST /monitoring/system/performance` | 历史性能数据 |
| 温度历史 | `POST /monitoring/devices/temperature` | 温度趋势 |
| 设备分布 | `GET /monitoring/devices/distribution` | 设备状态分布 |
| 可用性 | `GET /monitoring/availability` | 整体可用性 |
| 流量历史 | `POST /monitoring/network/traffic/history` | 流量历史 |
| 实时告警 | `GET /alerts` | 列表取最新N条 |
| 报告导出 | `POST /monitoring/reports/export` | 生成并返回下载信息（包含兼容字段 download_url；并可返回 download_token + download_form_url 供大文件下载） |
| 报告下载(token) | `POST /monitoring/reports/download` | 表单提交 download_token/token 触发浏览器原生下载（避免 fetch→blob 内存占用） |
| 报告下载预检(token) | `POST /monitoring/reports/download/check` | （可选）在发起表单下载前预检 token 是否有效、文件是否存在，提升错误提示体验 |

**数据转换流程:**
```
后端 API 响应 → 数据规范化 → 前端类型转换 → React 组件渲染
```

补充说明：
- 为降低后端字段漂移或类型不一致导致的运行时异常（尤其是图表），`fetchMonitoringDataV2` 会对 v2 聚合响应做**最小必要的深度规范化**：时间戳、数值字段、温度 devices map、告警 severity 等。

## 2️⃣ 后端数据采集与提供

### 2.1 监控处理器 (MonitoringHandler)

**注册的路由:**
```go
// 查询端点
GET  /monitoring/devices/:device_id/metrics      // 单设备当前指标
GET  /monitoring/devices/:device_id/history      // 单设备历史指标
GET  /monitoring/devices/status                  // 所有设备状态
GET  /monitoring/stats                           // 监控统计
GET  /monitoring/availability                    // 可用性
GET  /monitoring/devices/distribution            // 设备分布
GET  /monitoring/reports/download/:filename      // 报告下载（兼容：Authorization）

// 写入端点
POST /monitoring/devices/:device_id/metrics      // 写入设备指标
POST /monitoring/system/metrics                  // 写入系统指标
POST /monitoring/devices/historical              // 批量历史查询
POST /monitoring/system/performance              // 系统性能历史
POST /monitoring/devices/temperature             // 温度历史
POST /monitoring/network/traffic/history         // 流量历史
POST /monitoring/dashboard/v2                    // 监控中心聚合接口（推荐）
POST /monitoring/reports/export                  // 报告导出（返回 download_token + download_form_url）
POST /monitoring/reports/download                // 报告下载（票据：form POST，避免 blob 占内存）
POST /monitoring/reports/download/check          // 报告下载票据预检（可选：用于更友好的错误提示）
```

### 2.2 指标写入服务 (MetricsWriter)

**核心方法:**

1. **WriteDeviceMetrics** - 写入设备指标
   - 输入: DeviceMetricsRequest (设备ID、指标、接口数据)
   - 处理: 规范化指标 → 构建记录 → 事务写入
   - 输出: 写入数量统计

2. **WriteSystemMetrics** - 写入系统指标
   - 输入: SystemMetricsRequest (主机名、指标)
   - 处理: 验证 → 规范化 → 写入
   - 输出: 写入数量

3. **GetDeviceMetrics** - 获取设备当前指标
   - 查询: device_metrics 表最新记录
   - 回退: 从 devices 表快照获取

4. **GetDeviceMetricsHistory** - 获取历史指标
   - 时间范围查询
   - 支持多指标过滤
   - 返回时间序列数据

### 2.3 数据库查询 (queries.go)

**关键查询函数:**

| 函数 | 功能 | 数据源 |
|------|------|--------|
| GetDevicesStatus | 所有设备状态 | devices 表 |
| GetDeviceStatusDistribution | 设备状态分布 | devices 表 GROUP BY |
| GetAvailability | 可用性计算 | devices 表 (在线/总数) |
| GetMonitoringStats | 6个关键指标 | devices + alerts 表 |
| GetSystemPerformanceHistory | 系统性能趋势 | system_metrics 表 |
| GetTemperatureHistory | 温度历史 | device_metrics 表 |
| GetNetworkTrafficHistory | 流量历史 | device_metrics 表 |
| GetBulkMetricsHistory | 批量历史查询 | device_metrics 表 |

**查询优化:**
- 使用 TimescaleDB 时间分桶 (time_bucket)
- 自动选择聚合粒度 (5分钟/15分钟/1小时/6小时/24小时)
- 支持小时级聚合表 (device_metrics_hourly)

## 3️⃣ SNMP 数据采集

### 3.1 SNMP 采集器 (SNMPCollector)

**采集的指标:**

| 类别 | 指标 | OID | 说明 |
|------|------|-----|------|
| 系统 | 系统正常运行时间 | 1.3.6.1.2.1.1.3.0 | TimeTicks (百分之一秒) |
| CPU | CPU 使用率 | 1.3.6.1.2.1.25.3.3.1.2 | HOST-RESOURCES-MIB |
| 内存 | 内存使用率 | 1.3.6.1.2.1.25.2.3.1.* | 总量/已用 |
| 温度 | 设备温度 | 1.3.6.1.4.1.9.9.91.1.1.1.1.4 | Cisco/Huawei/Juniper |
| 接口 | 接口速率 | 1.3.6.1.2.1.31.1.1.1.15 | 64位高速接口 |
| 接口 | 入站字节 | 1.3.6.1.2.1.31.1.1.1.6 | 64位计数器 |
| 接口 | 出站字节 | 1.3.6.1.2.1.31.1.1.1.10 | 64位计数器 |

**采集流程:**
```
1. 创建 SNMP 连接 (支持 v1/v2c/v3)
2. 并行采集各类指标
3. 计算接口速率 (基于字节差值)
4. 返回 SNMPMetrics 结构体
5. 前端通过 POST /monitoring/devices/:id/metrics 写入
```

**支持的 SNMP 版本:**
- SNMPv1 (基础)
- SNMPv2c (社区字符串)
- SNMPv3 (用户认证 + 加密)

### 3.2 接口速率计算

**优先级顺序:**
1. ifHighSpeed (OID 1.3.6.1.2.1.31.1.1.1.15) - 优先级3
2. ifSpeed (OID 1.3.6.1.2.1.2.2.1.5) - 优先级2
3. 自定义字段 (speed_mbps, link_speed_mbps) - 优先级1

**流量计算:**
```
流量 (Mbps) = (字节差值 / 时间间隔) * 8 / 1,000,000
```

## 4️⃣ 数据库表结构

### 4.1 核心表

**devices 表** - 设备清单
```sql
id, name, ip_address, status, 
cpu_usage, memory_usage, disk_usage, temperature,
uptime, response_time, last_seen,
is_monitored, monitor_interval, is_active
```

**device_metrics 表** (TimescaleDB Hypertable)
```sql
id, device_id, metric_name, metric_value, metric_unit,
interface_name, tags, collected_at, created_at
-- 自动按时间分区
```

**device_interfaces 表** - 设备接口
```sql
id, device_id, name, description, speed, 
last_updated, updated_at
```

**alerts 表** - 告警记录
```sql
id, device_id, severity, message, status,
created_at, acknowledged_at
```

### 4.2 聚合表

**device_metrics_hourly** - 小时级聚合
```sql
bucket, device_id, metric_name, 
avg_value, min_value, max_value, count
```

**system_metrics_hourly** - 系统指标小时聚合
```sql
bucket, metric_name, 
avg_value, min_value, max_value
```

## 5️⃣ 数据流时序图

### 5.1 实时监控流程

```
时间 → 事件
T0   前端加载 MonitoringView
     ↓
T1   useMonitoringV2 Hook 触发
     ↓
T2   调用 fetchMonitoringDataV2()
      ├─ ✅ 优先: POST /monitoring/dashboard/v2
      └─ 🔁 回退(404): Promise.allSettled 并行多端点
           ├─ GET /monitoring/stats
           ├─ POST /monitoring/system/performance
           ├─ POST /monitoring/devices/temperature
           ├─ GET /monitoring/devices/distribution
           ├─ GET /monitoring/availability
           ├─ POST /monitoring/network/traffic/history
           └─ GET /alerts (列表)
     ↓
T3   后端 MonitoringHandler 处理请求
     ├─ 调用 MetricsWriter 查询方法
     ├─ 执行 SQL 查询
     └─ 返回 JSON 响应
     ↓
T4   前端接收数据
     ├─ 数据规范化
     ├─ 类型转换
     └─ 更新 React 状态
     ↓
T5   组件重新渲染
     ├─ 更新统计卡片
     ├─ 更新图表
     └─ 更新详情卡片
     ↓
T6   120秒后自动轮询 (回到 T2)
```

### 5.2 SNMP 采集流程

```
采集器启动
  ↓
遍历所有设备
  ↓
对每个设备:
  ├─ 创建 SNMP 连接
  ├─ 并行采集指标:
  │  ├─ 系统正常运行时间
  │  ├─ CPU 使用率
  │  ├─ 内存使用率
  │  ├─ 设备温度
  │  └─ 接口指标 (速率、流量)
  ├─ 计算接口速率
  ├─ 关闭连接
  └─ 返回 SNMPMetrics
  ↓
前端调用 POST /monitoring/devices/:id/metrics
  ↓
后端 WriteDeviceMetrics()
  ├─ 规范化指标
  ├─ 构建记录
  └─ 事务写入数据库
  ↓
数据存储到 device_metrics 表
  ↓
TimescaleDB 自动分区和压缩
```

## 6️⃣ 关键数据转换

### 6.1 前端数据规范化

```typescript
// 后端响应 → 前端类型
{
  total_devices: 50,
  availability: 98.5,
  active_alerts: 3,
  avg_cpu: 45.2,
  avg_memory: 62.1,
  avg_network: 125.5
}
↓
StatCardData[] {
  { id: 'total_devices', title: '总设备', value: '50' },
  { id: 'availability', title: '可用性', value: '98.5%' },
  { id: 'active_alerts', title: '活跃告警', value: '3' },
  { id: 'avg_cpu', title: '平均 CPU', value: '45.2%' },
  { id: 'avg_memory', title: '平均内存', value: '62.1%' },
  { id: 'avg_network', title: '网络流量', value: '125.5 Mbps' }
}
```

### 6.2 流量单位转换

```
后端存储: bps (比特/秒)
  ↓
转换公式: Mbps = bps / 1,000,000
  ↓
前端显示: Mbps (兆比特/秒)

示例:
125,000,000 bps → 125 Mbps
```

### 6.3 温度数据聚合

```
原始数据 (device_metrics):
  device_id=1, metric_name='temperature', value=45.2
  device_id=2, metric_name='temperature', value=52.1
  device_id=3, metric_name='temperature', value=48.5
  ↓
聚合为:
{
  timestamp: '2024-01-14T10:00:00Z',
  devices: {
    'device_1': 45.2,
    'device_2': 52.1,
    'device_3': 48.5
  }
}
```

## 7️⃣ 性能优化策略

### 7.1 查询优化

1. **时间分桶聚合**
   - 6小时内: 5分钟粒度
   - 48小时内: 15分钟粒度
   - 7天内: 1小时粒度
   - 30天内: 6小时粒度
   - 30天以上: 24小时粒度

2. **小时级聚合表**
   - 自动计算 avg/min/max
   - 加速历史查询
   - 减少原始数据扫描

3. **索引优化**
   ```sql
   -- 复合索引
   CREATE INDEX idx_device_metrics_device_time 
   ON device_metrics (device_id, collected_at DESC);
   
   -- 指标名称索引
   CREATE INDEX idx_device_metrics_name 
   ON device_metrics (metric_name);
   ```

### 7.2 缓存策略

1. **React Query 缓存**
   - 缓存时间: 5分钟
   - 陈旧时间: 1分钟
   - 断线兜底轮询: 120秒（可配置；WebSocket 在线时页面可关闭轮询，由推送触发受控刷新）

2. **Redis 缓存** (可选)
   - 缓存热点查询
   - TTL: 建议 30秒（可配置：`MONITORING_CACHE_TTL`；可通过 `MONITORING_CACHE_ENABLED=false` 关闭）

3. **浏览器缓存**
   - Service Worker 缓存静态资源
   - 离线支持

### 7.3 并发优化

1. **SNMP 并发采集**
   - 默认20个并发
   - 可配置最大并发数

2. **数据库连接池**
   - 连接复用
   - 减少连接开销

3. **批量操作**
   - 批量写入指标
   - 批量查询历史数据

## 8️⃣ 常见问题排查

### 问题1: 监控数据为空

**可能原因:**
1. 没有设备记录 (devices 表为空)
2. SNMP 采集未运行
3. 数据库连接失败
4. 后端 API 未启动

**排查步骤:**
```sql
-- 检查设备数量
SELECT COUNT(*) FROM devices WHERE is_active = true;

-- 检查最新指标
SELECT * FROM device_metrics 
ORDER BY collected_at DESC LIMIT 10;

-- 检查告警数量
SELECT COUNT(*) FROM alerts;
```

### 问题2: 图表显示异常

**可能原因:**
1. 时间范围设置错误
2. 数据点不足
3. 单位转换错误
4. 前端渲染错误

**排查步骤:**
```typescript
// 检查数据点数量
console.log('Data points:', data.systemPerformance.length);

// 检查时间范围
console.log('Time range:', start, end);

// 检查单位转换
console.log('Converted value:', bpsToMbps(value));
```

### 问题3: 性能下降

**可能原因:**
1. 查询时间范围过长
2. 没有使用聚合表
3. 缺少索引
4. 轮询间隔过短

**优化方案:**
```typescript
// 增加轮询间隔
refetchInterval: 120000  // 改为120秒

// 减少时间范围
timeRange: '30d'  // 改为 '7d' 或 '24h'

// 使用聚合表
SELECT * FROM device_metrics_hourly  // 替代 device_metrics
```

## 9️⃣ 扩展建议

### 9.1 实时推送

使用 WebSocket 替代轮询:
```typescript
// 连接 WebSocket（注意：实际路径包含 /api/v1/ws/:user_id）
// ✅ 鉴权：使用 Sec-WebSocket-Protocol 子协议携带 access token，避免把 token 放到 URL query（会被中间件记录）。
const userId = currentUser.id
const accessToken = TokenManager.getAccessToken()
const ws = new WebSocket(`ws://localhost:8000/api/v1/ws/${userId}`, ['inspect-token', accessToken!])

ws.onopen = () => {
  // 订阅监控数据（房间：device_metrics）
  ws.send(JSON.stringify({
    type: 'subscribe',
    data: { room: 'device_metrics' },
  }))
}

// 接收实时更新（后端会发送 Envelope：{timestamp, message_id, type, data}）
ws.onmessage = (event) => {
  const message = JSON.parse(event.data)
  if (message.type !== 'device_metrics') return

  // ✅ 推荐做法：推送触发“受控刷新”（debounce），避免 refetch 风暴
  // refetchDebounced()
}
```

### 9.2 告警规则引擎

```go
// 定义告警规则
type AlertRule struct {
  ID        int
  Condition string  // "cpu_usage > 80"
  Severity  string  // "critical", "warning"
  Action    string  // "email", "webhook"
}

// 评估规则
func (r *AlertRule) Evaluate(metrics DeviceMetrics) bool {
  // 解析条件表达式
  // 计算结果
  // 返回是否触发
}
```

### 9.3 机器学习异常检测

```python
# 基于历史数据训练模型
from sklearn.ensemble import IsolationForest

model = IsolationForest(contamination=0.05)
model.fit(historical_metrics)

# 检测异常
anomalies = model.predict(current_metrics)
```

## 🔟 总结

**监控中心数据流的核心特点:**

1. ✅ **实时性** - 断线时 120秒轮询兜底；WebSocket 在线时通过推送触发受控刷新（减少无效轮询）
2. ✅ **准确性** - 多源数据采集 (SNMP、系统指标、应用指标)
3. ✅ **可扩展性** - TimescaleDB 时序数据库，自动分区和压缩
4. ✅ **高性能** - 聚合表、索引优化、缓存策略
5. ✅ **易维护** - 清晰的分层架构，模块化设计

**关键指标:**
- 数据采集延迟: < 5秒
- 查询响应时间: < 1秒
- 缓存命中率: > 80%
- 系统可用性: > 99.9%
