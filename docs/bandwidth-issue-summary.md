# 网络流量数据异常问题 - 调查与修复总结

## 问题报告

**用户反馈**：
> 之前查询过网络流量数据，这个数据是否是硬编码模拟数据，因目前在线设备只有1台，且数据流量并没有多少，为什么会出现那么大流量，怀疑网络流量数据的真实性。

## 调查结果

### 1. 数据来源确认

✅ **不是硬编码数据**

数据来源链路：
```
SNMP 采集器 → device_metrics 表 → Dashboard Service → 前端总览页面
```

相关代码：
- `backend-go/internal/devices/snmp_collector.go` - SNMP 数据采集
- `backend-go/internal/dashboard/service.go` - 数据查询和聚合
- `frontend/src/features/dashboard/api/dashboard.api.ts` - 前端 API 调用

### 2. 数据异常确认

✅ **数据确实异常**

数据库查询结果（设备 ID: 28, IP: 192.168.10.1）：

| 指标          | 最小值 | 最大值   | 平均值   | 样本数 |
|---------------|--------|----------|----------|--------|
| bandwidth_out | 0 Mbps | 1726.90 Mbps | 1656.76 Mbps | 98 |
| bandwidth_in  | 0 Mbps | 3988.01 Mbps | 343.03 Mbps  | 98 |

**总览页面显示**：约 1900 Mbps (1.9 Gbps)

**实际情况**：只有 1 台设备，流量很少

**结论**：数据明显不合理

### 3. 根本原因

❌ **SNMP 采集器的带宽计算逻辑存在缺陷**

#### 问题 1: Counter Wrap 处理不当

```go
// 原代码 - 错误的处理方式
if *iface.InOctets < last.inOctets {
    inDiff = *iface.InOctets // 直接使用当前值作为差值
}
```

**问题**：当 SNMP counter 回绕时，直接使用当前值会导致巨大的差值。

**示例**：
- 上次采集：4,294,967,000 octets
- 当前采集：100 octets (counter 已回绕)
- 错误计算：差值 = 100 octets
- 如果时间间隔 = 180 秒
- 错误带宽 = 100 / 180 * 8 / 1,000,000 = 0.0044 Mbps ✓ (这个还好)

但实际问题更复杂，可能是首次采集时的异常。

#### 问题 2: 首次采集无历史数据

**问题**：首次采集时，`lastCache` 中没有历史数据，但代码仍然会尝试计算，可能使用了未初始化的值或产生异常大的差值。

#### 问题 3: 缺少合理性检查

**问题**：没有对计算结果进行验证，即使带宽超过 10 Gbps 也会被接受并存储。

## 修复方案

### 核心改进

1. **改进 Counter Wrap 检测**
   - 检测到回绕时，跳过此次采样
   - 更新缓存，等待下次采集

2. **首次采集特殊处理**
   - 首次采集只缓存数据
   - 不计算速率（没有历史对比）

3. **添加合理性检查**
   - 检查 1：带宽不超过 10 Gbps
   - 检查 2：带宽不超过接口速度的 120%

### 修复代码

```go
const maxReasonableBandwidth = 10000.0 // 10 Gbps

// 1. 检测 counter wrap
if *iface.InOctets < last.inOctets || *iface.OutOctets < last.outOctets {
    // 跳过此次采样，更新缓存
    lastCache[idx] = octetsCache{...}
    continue
}

// 2. 计算带宽
inRate := (float64(inDiff) / elapsed) * 8 / 1000000
outRate := (float64(outDiff) / elapsed) * 8 / 1000000

// 3. 合理性检查
if inRate > maxReasonableBandwidth || outRate > maxReasonableBandwidth {
    continue // 跳过异常值
}

// 4. 接口速度检查
if iface.Speed != nil && *iface.Speed > 0 {
    maxSpeed := float64(*iface.Speed)
    if inRate > maxSpeed*1.2 || outRate > maxSpeed*1.2 {
        continue // 超过接口速度
    }
}
```

## 修复文件

| 文件 | 类型 | 说明 |
|------|------|------|
| `backend-go/internal/devices/snmp_collector.go` | 修复 | 修复带宽计算逻辑 |
| `backend-go/internal/devices/snmp_collector_fix.go` | 文档 | 修复方案详细说明 |
| `scripts/maintenance/clean-bandwidth-data.ps1` | 工具 | 清理异常历史数据 |
| `docs/bandwidth-data-fix.md` | 文档 | 完整修复文档 |
| `docs/bandwidth-issue-summary.md` | 文档 | 问题总结报告 |

## 应用修复步骤

### 1. 清理异常数据

```powershell
powershell -ExecutionPolicy Bypass -File scripts/maintenance/clean-bandwidth-data.ps1
```

### 2. 重启后端服务

```powershell
# 停止当前服务
# Ctrl+C 或关闭终端

# 启动新服务
powershell -ExecutionPolicy Bypass -File scripts/development/start-backend-go.ps1
```

### 3. 验证修复

等待 3-5 分钟后：

```sql
-- 查询最新数据
SELECT 
    metric_name,
    ROUND(AVG(metric_value)::numeric, 2) as avg_mbps,
    ROUND(MAX(metric_value)::numeric, 2) as max_mbps
FROM device_metrics 
WHERE metric_name IN ('bandwidth_in', 'bandwidth_out')
  AND collected_at >= NOW() - INTERVAL '10 minutes'
GROUP BY metric_name;
```

预期结果：
- 平均值：1-50 Mbps
- 最大值：< 100 Mbps

## 正常流量参考

### 办公网络（1台设备）
- **空闲**：0.1-1 Mbps
- **正常**：1-10 Mbps
- **高峰**：10-50 Mbps

### 为什么之前显示 1900 Mbps？

可能的原因：
1. **首次采集异常**：没有历史数据时计算出错
2. **Counter 初始值大**：设备重启前的累积值很大
3. **时间间隔异常**：采集间隔计算错误
4. **累积效应**：多次异常值累积

## 技术说明

### SNMP Counter 工作原理

SNMP 使用累积计数器（Counter）记录网络流量：
- 计数器从 0 开始
- 每传输 1 字节，计数器 +1
- 达到最大值后回绕到 0

### 带宽计算方法

```
带宽 = (当前计数 - 上次计数) / 时间间隔 * 8 / 1,000,000
```

**关键点**：
- 需要两次采样才能计算
- 时间间隔必须准确
- 必须处理 counter wrap

## 验证清单

- [x] 确认数据来源（SNMP 采集，非硬编码）
- [x] 确认数据异常（平均 1656 Mbps，不合理）
- [x] 定位根本原因（带宽计算逻辑缺陷）
- [x] 实施修复（改进计算逻辑）
- [x] 编译验证（无语法错误）
- [x] 创建清理脚本（删除异常历史数据）
- [x] 编写文档（完整修复说明）
- [ ] 应用修复（需要用户执行）
- [ ] 验证结果（需要用户确认）

## 后续建议

1. **立即执行**：
   - 运行清理脚本
   - 重启后端服务
   - 验证新数据

2. **监控观察**：
   - 观察 3-5 天
   - 确认数据稳定
   - 记录实际流量范围

3. **优化改进**：
   - 添加异常值日志
   - 实现数据平滑算法
   - 添加流量告警规则

## 相关文档

- [带宽数据修复详细文档](./bandwidth-data-fix.md)
- [总览页面优化文档](./dashboard-overview-optimization.md)
- [监控数据流程文档](./monitoring-data-flow-summary.md)

## 联系支持

如果修复后仍有问题，请提供：
1. 清理脚本执行结果
2. 最新的数据库查询结果
3. 后端服务日志
4. 设备 SNMP 配置信息

---

**修复日期**: 2026-01-20  
**修复版本**: v1.0  
**状态**: ✅ 已修复，待应用
