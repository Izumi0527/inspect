# 华为设备 SNMP 支持

## 概述

本文档说明了系统对华为网络设备的 SNMP 监控支持，包括 CPU、内存和温度数据的采集。

## 支持的华为设备 OID

### CPU 使用率
- **OID**: `1.3.6.1.4.1.2011.5.25.31.1.1.1.1.5`
- **MIB**: `HUAWEI-ENTITY-EXTENT-MIB::hwEntityCpuUsage`
- **数据类型**: Integer/Gauge32
- **单位**: 百分比 (0-100)
- **说明**: 返回设备 CPU 使用率百分比

### 内存使用率
- **OID**: `1.3.6.1.4.1.2011.5.25.31.1.1.1.1.7`
- **MIB**: `HUAWEI-ENTITY-EXTENT-MIB::hwEntityMemUsage`
- **数据类型**: Integer/Gauge32
- **单位**: 百分比 (0-100)
- **说明**: 返回设备内存使用率百分比

### 内存大小
- **OID**: `1.3.6.1.4.1.2011.5.25.31.1.1.1.1.10`
- **MIB**: `HUAWEI-ENTITY-EXTENT-MIB::hwEntityMemSize`
- **数据类型**: Integer/Gauge32
- **单位**: KB (千字节)
- **说明**: 返回设备内存总大小（KB）

### 温度
- **OID**: `1.3.6.1.4.1.2011.5.25.31.1.1.1.1.11`
- **MIB**: `HUAWEI-ENTITY-EXTENT-MIB::hwEntityTemperature`
- **数据类型**: Integer/Gauge32
- **单位**: 摄氏度 (°C)
- **说明**: 返回设备温度

## 采集策略

系统采用多层回退策略来确保最大兼容性：

### CPU 采集顺序
1. **华为特定 OID** (`hwEntityCpuUsage`)
   - 优先尝试华为设备专用 OID
   - 支持多 CPU 模块，取平均值
   
2. **HOST-RESOURCES-MIB** (`hrProcessorLoad`)
   - 标准 MIB，适用于大多数设备
   - 支持多处理器
   
3. **UCD-SNMP-MIB** (Linux 系统)
   - 适用于 Linux/Unix 系统
   - 通过 user/system/idle 计算使用率

### 内存采集顺序
1. **华为特定 OID** (`hwEntityMemUsage` + `hwEntityMemSize`)
   - 优先尝试华为设备专用 OID
   - 同时获取使用率和总大小
   - 支持多内存模块，累加总大小
   
2. **HOST-RESOURCES-MIB** (`hrStorage`)
   - 标准 MIB，查找 RAM 存储类型
   - 通过分配单元计算实际字节数
   
3. **UCD-SNMP-MIB** (Linux 系统)
   - 适用于 Linux/Unix 系统
   - 直接获取总内存和可用内存

## 数据处理

### CPU 数据
- 华为设备返回百分比值 (0-100)
- 多 CPU 模块时计算平均值
- 验证数据范围有效性 (0-100)

### 内存数据
- 华为设备返回 KB 单位，自动转换为字节
- 多内存模块时累加总大小
- 根据使用率百分比计算已用内存

### 日志记录
系统会记录详细的调试日志，包括：
- 使用的 OID 来源（华为/标准/UCD）
- 采集到的数值
- 模块数量（如果有多个）

## 测试验证

### 查看采集日志
```bash
# 查看后端日志
tail -f logs/backend-go/app-dev.log | grep -E "collected (CPU|memory)"
```

### 预期日志输出
```
collected CPU from Huawei OID    cpu_usage=15.5 cpu_count=2
collected memory from Huawei OID memory_usage=45.2 memory_total=4294967296 memory_used=1941962752 modules=2
```

### 数据库验证
```sql
-- 查看最新的 CPU 和内存数据
SELECT 
    metric_name,
    metric_value,
    collected_at
FROM device_metrics
WHERE device_id = 35
  AND metric_name IN ('cpu_usage', 'memory_usage', 'memory_total', 'memory_used')
ORDER BY collected_at DESC
LIMIT 10;
```

## 支持的设备

### 已测试设备
- 华为 S 系列交换机
- 华为 CE 系列数据中心交换机
- 华为 AR 系列路由器

### 兼容性
- **SNMP 版本**: v1, v2c, v3
- **最低 SNMP 权限**: 只读 (read-only)
- **必需 MIB**: HUAWEI-ENTITY-EXTENT-MIB

## 故障排查

### CPU/内存数据未采集
1. **检查 SNMP 配置**
   ```bash
   # 测试 SNMP 连接
   snmpwalk -v2c -c <community> <device_ip> 1.3.6.1.4.1.2011.5.25.31.1.1.1.1.5
   ```

2. **检查设备 MIB 支持**
   - 确认设备已启用 HUAWEI-ENTITY-EXTENT-MIB
   - 检查 SNMP community 权限

3. **查看详细日志**
   ```bash
   # 启用调试日志
   export LOG_LEVEL=debug
   ```

### 数据异常
- **CPU 使用率 > 100%**: 检查设备 OID 返回值
- **内存使用率异常**: 验证内存大小单位转换
- **数据为 0**: 可能是首次采集，等待下次采集周期

## 相关文件

- `backend-go/internal/devices/snmp_collector.go` - SNMP 采集器实现
- `backend-go/internal/scheduler/service.go` - 定时采集调度
- `backend-go/internal/monitoring/service.go` - 指标写入服务

## 更新历史

- **2026-01-21**: 添加华为设备 CPU 和内存 OID 支持
- **2026-01-21**: 添加多模块设备支持（平均值/累加）
- **2026-01-21**: 添加详细调试日志
