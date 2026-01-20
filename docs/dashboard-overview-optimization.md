# 总览页面优化说明

## 1. 网络流量数据来源

### 数据查询逻辑

**位置**: `backend-go/internal/dashboard/service.go` - `queryAvgNetworkMetric()` 方法

**查询策略**:
```go
// 1. 优先查询入站流量指标
avgInbound = AVG(bandwidth_in, network_bytes_in, throughput_in)

// 2. 查询出站流量指标
avgOutbound = AVG(bandwidth_out, network_bytes_out, throughput_out)

// 3. 计算总流量
totalTraffic = avgInbound + avgOutbound

// 4. 如果没有入站/出站数据，使用带宽利用率作为后备
if (no inbound/outbound data) {
    fallback = AVG(bandwidth_utilization)
}
```

### 数据源表

- **主表**: `device_metrics`
- **时间范围**: 最近 1 小时
- **指标名称**:
  - 入站: `bandwidth_in`, `network_bytes_in`, `throughput_in`
  - 出站: `bandwidth_out`, `network_bytes_out`, `throughput_out`
  - 后备: `bandwidth_utilization`

### 数据流程

```
设备 SNMP 采集
    ↓
device_metrics 表
    ↓
Dashboard Service 查询（最近1小时平均值）
    ↓
/api/v1/dashboard/overview
    ↓
前端总览页面 - 网络流量卡片
```

### 数据格式化

```go
// 如果有数据
formatNetworkValue(avgNetwork, true) → "2231.0 Mbps"

// 如果没有数据
formatNetworkValue(0, false) → "-"
```

## 2. 网络概览卡片图标优化

### 优化前的问题

1. **图标映射不智能**: 只有 3 个固定图标（Network, Monitor, Shield）
2. **switch 设备显示不当**: 所有 switch 类型设备都显示为通用图标
3. **视觉效果单调**: 缺少图标细节和动画效果

### 优化后的改进

#### 2.1 扩展图标库

新增图标类型：
- `Network` - 网络/交换机
- `Router` - 路由器
- `Wifi` - 无线设备/AP
- `Shield` - 安全设备/防火墙
- `Server` - 服务器
- `Monitor` - 通用监控设备

#### 2.2 智能图标匹配

```typescript
const getIconForDeviceType = (title: string): keyof typeof iconMap => {
  const lowerTitle = title.toLowerCase()
  
  // 交换机 → Network 图标
  if (lowerTitle.includes('switch') || lowerTitle.includes('交换机')) {
    return 'Network'
  }
  
  // 路由器 → Router 图标
  if (lowerTitle.includes('router') || lowerTitle.includes('路由')) {
    return 'Router'
  }
  
  // 无线设备 → Wifi 图标
  if (lowerTitle.includes('wifi') || lowerTitle.includes('无线') || lowerTitle.includes('ap')) {
    return 'Wifi'
  }
  
  // 安全设备 → Shield 图标
  if (lowerTitle.includes('firewall') || lowerTitle.includes('防火墙') || lowerTitle.includes('安全')) {
    return 'Shield'
  }
  
  // 服务器 → Server 图标
  if (lowerTitle.includes('server') || lowerTitle.includes('服务器')) {
    return 'Server'
  }
  
  // 默认 → Monitor 图标
  return 'Monitor'
}
```

#### 2.3 视觉效果优化

**图标样式**:
```tsx
<IconComponent 
  className="w-12 h-12 text-white drop-shadow-md" 
  strokeWidth={1.5}  // 更细的线条，更精致
/>
```

**动画效果**:
```tsx
// 卡片悬停缩放
className="group hover:scale-105 transition-transform duration-200"

// 阴影过渡
className="shadow-lg group-hover:shadow-xl transition-all duration-200"
```

**字体优化**:
```tsx
// 标题字体大小调整
className="text-base"  // 从默认大小调整为 base
```

### 优化效果对比

| 项目 | 优化前 | 优化后 |
|------|--------|--------|
| 图标种类 | 3 种 | 6 种 |
| switch 图标 | 通用图标 | Network 专用图标 |
| 图标线条 | 默认粗细 | 1.5px 精致线条 |
| 阴影效果 | 静态 | 动态过渡 |
| 悬停动画 | 无 | 缩放 + 阴影 |
| 图标阴影 | 无 | drop-shadow-md |

## 3. 数据流程图

### 总览页面完整数据流

```
┌─────────────────────────────────────────────────────────┐
│                    前端总览页面                          │
│                  /dashboard/page.tsx                     │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│              useDashboardData Hook                       │
│         fetchDashboardData() API 调用                    │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│           GET /api/v1/dashboard/overview                 │
│         backend-go/internal/http/handlers                │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│          Dashboard Service - GetOverview()               │
│      backend-go/internal/dashboard/service.go            │
└────────────────────────┬────────────────────────────────┘
                         │
        ┌────────────────┼────────────────┐
        │                │                │
        ▼                ▼                ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ 设备状态统计  │ │ 告警统计     │ │ 网络流量查询  │
│ devices 表   │ │ alerts 表    │ │device_metrics│
└──────────────┘ └──────────────┘ └──────────────┘
        │                │                │
        └────────────────┼────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│                  返回 JSON 数据                          │
│  {                                                       │
│    stats: [在线设备, 活跃告警, 网络流量, 系统负载],      │
│    recent_alerts: [...],                                 │
│    network_overview: [...]                               │
│  }                                                       │
└────────────────────────┬────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────┐
│              前端组件渲染                                │
│  - StatsGrid (4个统计卡片)                              │
│  - RecentAlertsCard (最近告警)                          │
│  - NetworkOverviewCard (网络概览 - 优化后的图标)        │
└─────────────────────────────────────────────────────────┘
```

## 4. 相关文件

### 后端文件
- `backend-go/internal/dashboard/service.go` - Dashboard 服务实现
- `backend-go/internal/http/handlers/dashboard.go` - API 处理器
- `backend-go/internal/app/app.go` - 服务初始化

### 前端文件
- `frontend/src/features/dashboard/components/DashboardView.tsx` - 总览页面主视图
- `frontend/src/features/dashboard/components/NetworkOverviewCard.tsx` - 网络概览卡片（已优化）
- `frontend/src/features/dashboard/components/StatsGrid.tsx` - 统计卡片网格
- `frontend/src/features/dashboard/api/dashboard.api.ts` - API 调用
- `frontend/src/features/dashboard/hooks/useDashboard.ts` - 数据管理 Hook

## 5. 测试验证

### 验证网络流量数据

1. **检查数据库**:
```sql
-- 查看最近1小时的网络流量指标
SELECT 
    metric_name, 
    AVG(metric_value) as avg_value,
    COUNT(*) as sample_count
FROM device_metrics
WHERE metric_name IN ('bandwidth_in', 'bandwidth_out', 'network_bytes_in', 'network_bytes_out')
  AND collected_at >= NOW() - INTERVAL '1 hour'
GROUP BY metric_name;
```

2. **查看 API 响应**:
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:8000/api/v1/dashboard/overview
```

3. **前端验证**:
- 打开总览页面
- 查看"网络流量"卡片的数值
- 应显示类似 "2231.0 Mbps" 的格式

### 验证图标优化

1. **查看网络概览卡片**:
- 打开总览页面
- 滚动到"网络概览"区域
- 观察不同设备类型的图标

2. **测试悬停效果**:
- 鼠标悬停在设备图标上
- 应看到缩放动画和阴影变化

3. **验证图标匹配**:
- switch 设备 → Network 图标（网络节点）
- router 设备 → Router 图标（路由器）
- wifi/ap 设备 → Wifi 图标（无线信号）
- firewall 设备 → Shield 图标（盾牌）
- server 设备 → Server 图标（服务器）

## 6. 性能优化建议

### 网络流量数据缓存

当前网络流量数据每次都查询数据库，建议添加缓存：

```go
// 在 Dashboard Service 中添加 Redis 缓存
func (s *Service) queryAvgNetworkMetric(ctx context.Context) (float64, bool, error) {
    // 1. 尝试从 Redis 获取缓存（TTL: 1分钟）
    cacheKey := "dashboard:network_traffic:1h"
    if cached, found := s.redis.Get(ctx, cacheKey); found {
        return parseCachedValue(cached)
    }
    
    // 2. 查询数据库
    value, hasData, err := s.queryFromDatabase(ctx)
    
    // 3. 写入缓存
    if err == nil && hasData {
        s.redis.Set(ctx, cacheKey, value, 1*time.Minute)
    }
    
    return value, hasData, err
}
```

### 前端轮询优化

当前前端每 60 秒刷新一次，可以优化为：
- 网络流量数据：60 秒刷新
- 设备状态：30 秒刷新
- 告警数据：15 秒刷新（更实时）

## 7. 未来改进方向

1. **网络流量趋势图**: 在总览页面添加小型趋势图，显示最近 24 小时的流量变化
2. **实时流量监控**: 使用 WebSocket 推送实时流量数据
3. **流量告警**: 当流量超过阈值时，在总览页面显示告警提示
4. **设备类型图标自定义**: 允许管理员为不同设备类型配置自定义图标
5. **网络拓扑可视化**: 在网络概览卡片中添加简单的拓扑图
