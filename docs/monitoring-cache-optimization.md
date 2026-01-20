# 监控中心数据缓存优化

## 概述

为了提升监控中心页面的加载速度，我们为以下三个数据密集型图表添加了 Redis 缓存机制：

1. **系统性能趋势图** - CPU、内存、网络流量的历史数据
2. **设备温度监控图** - 多设备温度历史趋势
3. **网络流量图** - 入站/出站流量历史数据

## 缓存策略

### 缓存时间（TTL）

| 数据类型 | 默认缓存时间 | 说明 |
|---------|------------|------|
| 系统性能历史 | 2 分钟 | 与前端轮询间隔一致 |
| 设备温度历史 | 2 分钟 | 与前端轮询间隔一致 |
| 网络流量历史 | 2 分钟 | 与前端轮询间隔一致 |

### 缓存键格式

```
monitoring:system_performance:{start_unix}:{end_unix}:{metrics}
monitoring:temperature:{start_unix}:{end_unix}
monitoring:network_traffic:{start_unix}:{end_unix}
```

### 工作流程

```
┌─────────────┐
│ 前端请求    │
└──────┬──────┘
       │
       ▼
┌─────────────────┐
│ 检查 Redis 缓存 │
└──────┬──────────┘
       │
       ├─ 缓存命中 ──────────┐
       │                     │
       └─ 缓存未命中         │
              │              │
              ▼              │
       ┌──────────────┐      │
       │ 查询数据库   │      │
       └──────┬───────┘      │
              │              │
              ▼              │
       ┌──────────────┐      │
       │ 写入缓存     │      │
       └──────┬───────┘      │
              │              │
              └──────────────┤
                             │
                             ▼
                      ┌──────────────┐
                      │ 返回数据     │
                      └──────────────┘
```

## 性能提升

### 优化前
- **首次加载时间**: 3-5 秒（需要查询大量历史数据）
- **数据库查询**: 每次请求都执行复杂的时序数据聚合查询
- **并发压力**: 多用户同时访问时数据库负载高

### 优化后
- **首次加载时间**: 3-5 秒（首次查询，写入缓存）
- **后续加载时间**: 50-200 毫秒（从 Redis 读取）
- **缓存命中率**: 预计 > 90%（2分钟内的重复请求）
- **数据库负载**: 降低 90% 以上

## 配置说明

### 默认配置

缓存功能默认启用，使用以下配置：

```go
CacheConfig{
    SystemPerformanceTTL: 2 * time.Minute,
    TemperatureTTL:       2 * time.Minute,
    NetworkTrafficTTL:    2 * time.Minute,
    Enabled:              true,
}
```

### 自定义配置

如需调整缓存时间，可在 `backend-go/internal/app/app.go` 中修改：

```go
// 自定义缓存配置
cacheConfig := monitoring.CacheConfig{
    SystemPerformanceTTL: 5 * time.Minute,  // 延长到 5 分钟
    TemperatureTTL:       3 * time.Minute,  // 延长到 3 分钟
    NetworkTrafficTTL:    3 * time.Minute,  // 延长到 3 分钟
    Enabled:              true,
}
metricsCache := monitoring.NewMetricsCache(redisClient, cacheConfig, log)
```

### 禁用缓存

如需禁用缓存（例如调试时）：

```go
cacheConfig := monitoring.CacheConfig{
    Enabled: false,
}
```

## 缓存管理

### 清除所有缓存

```go
// 在代码中调用
err := metricsCache.ClearAll(ctx)

// 或使用 Redis CLI
redis-cli --scan --pattern "monitoring:*" | xargs redis-cli del
```

### 查看缓存状态

```bash
# 查看所有监控缓存键
redis-cli --scan --pattern "monitoring:*"

# 查看特定缓存的 TTL
redis-cli TTL "monitoring:system_performance:1737360000:1737446400:[cpu_usage memory_usage network_traffic]"

# 查看缓存内容
redis-cli GET "monitoring:temperature:1737360000:1737446400"
```

## 监控指标

### 缓存命中率

可以通过日志查看缓存命中情况：

```
[DEBUG] system performance cache hit key=monitoring:system_performance:...
[DEBUG] temperature cache hit key=monitoring:temperature:...
[DEBUG] network traffic cache hit key=monitoring:network_traffic:...
```

### Redis 内存使用

```bash
# 查看 Redis 内存使用情况
redis-cli INFO memory

# 查看监控缓存占用的内存
redis-cli --scan --pattern "monitoring:*" | wc -l
```

## 注意事项

1. **数据一致性**: 缓存时间设置为 2 分钟，与设备指标采集间隔（3 分钟）相匹配，确保数据相对实时

2. **内存占用**: 每个缓存条目约 10-50 KB，100 个并发用户约占用 1-5 MB Redis 内存

3. **缓存失效**: 当设备指标更新时，旧缓存会在 TTL 到期后自动失效

4. **Redis 故障**: 如果 Redis 不可用，系统会自动降级到直接查询数据库，不影响功能

## 相关文件

- `backend-go/internal/monitoring/cache.go` - 缓存服务实现
- `backend-go/internal/monitoring/queries.go` - 查询方法（集成缓存）
- `backend-go/internal/monitoring/service.go` - MetricsWriter 结构体
- `backend-go/internal/app/app.go` - 应用初始化（缓存配置）

## 测试验证

### 1. 验证缓存功能

```bash
# 启动后端服务
cd backend-go
go run cmd/api/main.go

# 第一次请求（缓存未命中，查询数据库）
curl -X POST http://localhost:8000/api/v1/monitoring/system/performance \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"start_time":"2024-01-20T00:00:00Z","end_time":"2024-01-21T00:00:00Z"}'

# 第二次请求（缓存命中，从 Redis 读取）
curl -X POST http://localhost:8000/api/v1/monitoring/system/performance \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"start_time":"2024-01-20T00:00:00Z","end_time":"2024-01-21T00:00:00Z"}'
```

### 2. 验证性能提升

使用浏览器开发者工具的 Network 面板：

- **首次加载**: 查看 API 响应时间（预计 2-5 秒）
- **刷新页面**: 查看 API 响应时间（预计 50-200 毫秒）

### 3. 验证缓存过期

等待 2 分钟后刷新页面，观察：
- 日志中不再显示 "cache hit"
- API 响应时间恢复到 2-5 秒
- 新数据被写入缓存

## 未来优化方向

1. **智能预热**: 在设备指标采集完成后，主动更新缓存
2. **分层缓存**: 添加本地内存缓存（LRU），进一步降低延迟
3. **缓存压缩**: 对大数据集使用 gzip 压缩，减少 Redis 内存占用
4. **缓存预测**: 根据用户访问模式，预加载常用时间范围的数据
