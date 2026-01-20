# 带宽数据异常问题修复

## 问题描述

用户报告总览页面显示的网络流量数据异常偏高：
- 只有 1 台在线设备
- 实际网络流量很少
- 但显示的平均流量达到 **1900+ Mbps** (约 1.9 Gbps)

## 问题分析

### 数据验证

通过数据库查询验证了问题：

```sql
SELECT 
    metric_name,
    ROUND(MIN(metric_value)::numeric, 2) as min_mbps,
    ROUND(MAX(metric_value)::numeric, 2) as max_mbps,
    ROUND(AVG(metric_value)::numeric, 2) as avg_mbps,
    COUNT(*) as sample_count
FROM device_metrics 
WHERE device_id = 28 
  AND metric_name IN ('bandwidth_in', 'bandwidth_out')
  AND collected_at >= NOW() - INTERVAL '24 hours'
GROUP BY metric_name;
```

**结果**：
| metric_name   | min_mbps | max_mbps | avg_mbps | sample_count |
|---------------|----------|----------|----------|--------------|
| bandwidth_out | 0.00     | 1726.90  | 1656.76  | 98           |
| bandwidth_in  | 0.00     | 3988.01  | 343.03   | 98           |

### 根本原因

问题出在 `backend-go/internal/devices/snmp_collector.go` 的 `collectInterfaces` 函数中：

#### 1. Counter Wrap 处理不当

**原代码**：
```go
// Handle counter wrap
if *iface.InOctets < last.inOctets {
    inDiff = *iface.InOctets // Assume wrap, use current value
}
```

**问题**：当检测到 counter wrap 时，直接使用当前值作为差值，这会导致异常大的带宽值。

#### 2. 首次采集无历史数据

**问题**：首次采集时没有历史数据对比，但仍然会尝试计算速率，可能产生异常值。

#### 3. 缺少合理性检查

**问题**：没有对计算出的带宽值进行合理性验证，即使超过 10 Gbps 也会被接受。

## 修复方案

### 1. 改进 Counter Wrap 处理

```go
// 检测 counter wrap - 如果当前值小于历史值，跳过此次采样
if *iface.InOctets < last.inOctets || *iface.OutOctets < last.outOctets {
    // Counter wrapped or reset, skip this sample and update cache
    lastCache[idx] = octetsCache{
        inOctets:  *iface.InOctets,
        outOctets: *iface.OutOctets,
        timestamp: now,
    }
    continue
}
```

**改进**：检测到 counter wrap 时，跳过此次采样，只更新缓存，等待下次采集。

### 2. 首次采集特殊处理

```go
if last, ok := lastCache[idx]; ok {
    // 有历史数据，计算速率
    // ...
} else {
    // 首次采集，只缓存数据，不计算速率
    lastCache[idx] = octetsCache{
        inOctets:  *iface.InOctets,
        outOctets: *iface.OutOctets,
        timestamp: now,
    }
    continue
}
```

**改进**：首次采集时只缓存数据，不计算速率。

### 3. 添加合理性检查

```go
const maxReasonableBandwidth = 10000.0 // 10 Gbps

// 合理性检查 1: 不应超过 10 Gbps
if inRate > maxReasonableBandwidth || outRate > maxReasonableBandwidth {
    // 异常值，跳过但更新缓存
    lastCache[idx] = octetsCache{
        inOctets:  *iface.InOctets,
        outOctets: *iface.OutOctets,
        timestamp: now,
    }
    continue
}

// 合理性检查 2: 如果有接口速度信息，不应超过接口速度的 120%
if iface.Speed != nil && *iface.Speed > 0 {
    maxSpeed := float64(*iface.Speed) // Speed is in Mbps
    if inRate > maxSpeed*1.2 || outRate > maxSpeed*1.2 {
        // 超过接口速度，跳过但更新缓存
        lastCache[idx] = octetsCache{
            inOctets:  *iface.InOctets,
            outOctets: *iface.OutOctets,
            timestamp: now,
        }
        continue
    }
}
```

**改进**：
- 检查 1：带宽不应超过 10 Gbps（数据中心级别）
- 检查 2：带宽不应超过接口速度的 120%

## 修复文件

- `backend-go/internal/devices/snmp_collector.go` - 修复带宽计算逻辑
- `backend-go/internal/devices/snmp_collector_fix.go` - 修复方案说明文档
- `scripts/maintenance/clean-bandwidth-data.ps1` - 清理异常历史数据脚本

## 应用修复

### 步骤 1: 清理异常历史数据

```powershell
# 运行清理脚本
powershell -ExecutionPolicy Bypass -File scripts/maintenance/clean-bandwidth-data.ps1
```

这个脚本会：
1. 显示当前异常数据统计
2. 询问是否删除异常数据（> 1000 Mbps）
3. 删除异常数据
4. 验证清理结果

### 步骤 2: 重启后端服务

```powershell
# 停止当前运行的后端服务（如果有）
# 然后启动新的后端服务
powershell -ExecutionPolicy Bypass -File scripts/development/start-backend-go.ps1
```

### 步骤 3: 验证修复

1. 等待 3-5 分钟，让系统采集新数据
2. 打开总览页面，查看网络流量卡片
3. 流量值应该在合理范围内（通常 < 100 Mbps）

## 预期结果

### 修复前
- 平均流量：1900+ Mbps
- 峰值流量：3988 Mbps
- 明显不合理

### 修复后
- 平均流量：1-50 Mbps（取决于实际网络使用情况）
- 峰值流量：< 100 Mbps
- 符合实际情况

## 正常流量参考

### 办公网络
- **空闲时**：0.1-1 Mbps
- **正常使用**：1-10 Mbps
- **高峰期**：10-50 Mbps

### 数据中心
- **空闲时**：10-100 Mbps
- **正常使用**：100-1000 Mbps
- **高峰期**：1-10 Gbps

## 技术细节

### SNMP Counter 类型

SNMP 使用两种类型的计数器：
- **32-bit Counter**: 最大值 4,294,967,295 (约 4GB)
- **64-bit Counter**: 最大值 18,446,744,073,709,551,615 (约 18EB)

当计数器达到最大值时会回绕到 0，这称为 "counter wrap"。

### 带宽计算公式

```
带宽 (Mbps) = (当前 octets - 上次 octets) / 时间间隔 (秒) * 8 / 1,000,000
```

**说明**：
- octets = 字节数
- * 8 = 转换为比特
- / 1,000,000 = 转换为 Mbps

### 采集间隔

系统默认每 3 分钟采集一次 SNMP 数据。

## 相关文件

- `backend-go/internal/devices/snmp_collector.go` - SNMP 采集器
- `backend-go/internal/dashboard/service.go` - 总览页面数据服务
- `database/init.sql` - 数据库表结构
- `docs/dashboard-overview-optimization.md` - 总览页面优化文档

## 测试验证

### 1. 单元测试（可选）

```bash
cd backend-go
go test ./internal/devices/... -v
```

### 2. 手动测试

1. 清理异常数据
2. 重启后端服务
3. 等待 3-5 分钟
4. 查询数据库验证：

```sql
SELECT 
    metric_name,
    ROUND(AVG(metric_value)::numeric, 2) as avg_mbps,
    ROUND(MAX(metric_value)::numeric, 2) as max_mbps
FROM device_metrics 
WHERE metric_name IN ('bandwidth_in', 'bandwidth_out')
  AND collected_at >= NOW() - INTERVAL '10 minutes'
GROUP BY metric_name;
```

5. 打开总览页面，查看网络流量显示

## 注意事项

1. **首次采集**：修复后，首次采集不会显示带宽数据（显示 0），这是正常的
2. **Counter Wrap**：如果检测到 counter wrap，该次采样会被跳过
3. **异常值**：超过 10 Gbps 或接口速度 120% 的值会被过滤
4. **历史数据**：建议清理异常的历史数据，避免影响统计

## 后续优化建议

1. **添加日志**：记录被过滤的异常值，便于调试
2. **监控告警**：当检测到频繁的 counter wrap 时发送告警
3. **动态阈值**：根据接口类型自动调整合理性检查阈值
4. **数据平滑**：使用移动平均算法平滑带宽数据

## 版本历史

- **2026-01-20**: 初始版本 - 修复带宽计算异常问题
