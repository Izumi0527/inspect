# TimescaleDB Hypertable 迁移错误修复说明

## 问题描述

在启动后端服务时遇到数据库迁移错误：

```
ERROR: operation not supported on hypertables that have compression enabled (SQLSTATE 0A000)
ALTER TABLE "device_metrics" ALTER COLUMN "metric_name" TYPE varchar(100) USING "metric_name"::varchar(100)
failed to initialize app: auto migrate failed: ERROR: operation not supported on hypertables that have compression enabled
```

## 根本原因

### 问题分析

1. **TimescaleDB Hypertable**: `device_metrics`、`interface_metrics`、`system_metrics` 表是 TimescaleDB 的 hypertable
2. **压缩已启用**: 这些 hypertable 启用了数据压缩功能
3. **GORM AutoMigrate**: GORM 检测到模型定义与数据库表结构有差异，尝试执行 `ALTER COLUMN` 操作
4. **TimescaleDB 限制**: TimescaleDB 不支持在启用压缩的 hypertable 上执行 `ALTER COLUMN` 操作

### TimescaleDB 压缩限制

TimescaleDB 的压缩功能会将数据以特殊格式存储，一旦启用压缩：
- 不能修改列类型 (`ALTER COLUMN ... TYPE`)
- 不能添加新列
- 不能删除列
- 需要先禁用压缩才能进行结构变更

### 相关表

| 表名 | 类型 | 时间列 | 说明 |
|------|------|--------|------|
| device_metrics | hypertable | collected_at | 设备监控指标 |
| interface_metrics | hypertable | collected_at | 接口监控指标 |
| system_metrics | hypertable | collected_at | 系统监控指标 |

## 解决方案

### 修改策略

对于已存在的 TimescaleDB hypertable，跳过 GORM 的 AutoMigrate 操作，避免触发 `ALTER COLUMN` 错误。

### 代码修改

**文件**: `backend-go/internal/db/migrate.go`

**关键修改**:

1. **分离迁移逻辑**: 将监控指标表的迁移与其他表分开处理
2. **检测 hypertable**: 在迁移前检查表是否是 TimescaleDB hypertable
3. **跳过已存在的 hypertable**: 对于已存在的 hypertable，跳过 AutoMigrate

```go
// migrateMetricTables 处理监控指标表的迁移
// 对于已存在的 TimescaleDB hypertable，跳过 AutoMigrate 以避免 ALTER COLUMN 错误
func migrateMetricTables(db *gorm.DB, cfg config.Config, logger *zap.Logger) error {
    metricModels := []struct {
        model     interface{}
        tableName string
    }{
        {&monitoring.DeviceMetric{}, "device_metrics"},
        {&monitoring.InterfaceMetric{}, "interface_metrics"},
        {&monitoring.SystemMetric{}, "system_metrics"},
    }

    for _, m := range metricModels {
        tableExists := db.Migrator().HasTable(m.model)

        if tableExists && cfg.TimescaleEnabled {
            isHT := isHypertable(db, m.tableName)
            if isHT {
                // 跳过已存在的 hypertable
                logger.Info("skipping AutoMigrate for existing hypertable",
                    zap.String("table", m.tableName))
                continue
            }
        }

        // 对于新表或非 hypertable，执行正常的 AutoMigrate
        if err := db.AutoMigrate(m.model); err != nil {
            return fmt.Errorf("migrate %s failed: %w", m.tableName, err)
        }
    }

    return nil
}

// isHypertable 检查表是否是 TimescaleDB hypertable
func isHypertable(db *gorm.DB, tableName string) bool {
    var count int64
    err := db.Raw(`
        SELECT COUNT(*) FROM timescaledb_information.hypertables 
        WHERE hypertable_name = ?
    `, tableName).Scan(&count).Error
    if err != nil {
        return false
    }
    return count > 0
}
```

### 迁移流程

```
┌─────────────────────────────────────────────────────────────┐
│                     Migrate() 函数                          │
├─────────────────────────────────────────────────────────────┤
│ 1. 检查 DatabaseAutoMigrate 配置                            │
│ 2. 创建 TimescaleDB 和 uuid-ossp 扩展                       │
│ 3. AutoMigrate 非 hypertable 表                             │
│    - settings, devices, alerts, inspection, logs, etc.      │
│ 4. migrateMetricTables() - 单独处理监控指标表               │
│    ├─ 检查表是否存在                                        │
│    ├─ 检查是否是 hypertable                                 │
│    ├─ 如果是已存在的 hypertable → 跳过 AutoMigrate          │
│    └─ 否则 → 执行 AutoMigrate                               │
│ 5. ensureHypertable() - 确保 hypertable 已创建              │
│ 6. ensureMetricIndexes() - 创建索引                         │
└─────────────────────────────────────────────────────────────┘
```

## 验证方法

### 1. 编译测试

```powershell
cd backend-go
go build ./...
```

### 2. 启动后端

```powershell
$env:ENV_FILE = 'C:\coder\Inspect\.env'
cd backend-go
go run ./cmd/api
```

### 3. 检查日志

启动后应该看到类似日志：

```
INFO: skipping AutoMigrate for existing hypertable (compression may be enabled) table=device_metrics
INFO: skipping AutoMigrate for existing hypertable (compression may be enabled) table=interface_metrics
INFO: skipping AutoMigrate for existing hypertable (compression may be enabled) table=system_metrics
INFO: database migration completed
```

### 4. 验证数据库

```sql
-- 检查 hypertable 状态
SELECT hypertable_name, compression_enabled 
FROM timescaledb_information.hypertables;

-- 检查表结构
\d device_metrics
```

## 注意事项

### 1. 模型变更

如果需要修改监控指标表的结构（如添加列、修改列类型），需要：

1. **禁用压缩**（如果已启用）
2. **解压缩数据**
3. **执行结构变更**
4. **重新启用压缩**

```sql
-- 示例：修改 device_metrics 表结构
-- 1. 禁用压缩
ALTER TABLE device_metrics SET (timescaledb.compress = false);

-- 2. 解压缩所有数据
SELECT decompress_chunk(c) FROM show_chunks('device_metrics') c;

-- 3. 执行结构变更
ALTER TABLE device_metrics ADD COLUMN new_column VARCHAR(100);

-- 4. 重新启用压缩
ALTER TABLE device_metrics SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'device_id'
);

-- 5. 重新压缩数据
SELECT compress_chunk(c) FROM show_chunks('device_metrics') c 
WHERE NOT is_compressed;
```

### 2. 新环境部署

在新环境（没有现有数据库）部署时：
- 监控指标表会正常创建
- 然后转换为 hypertable
- 压缩策略需要单独配置

### 3. 禁用 TimescaleDB

如果不需要 TimescaleDB 功能，可以在 `.env` 中设置：

```properties
TIMESCALE_ENABLED=false
```

这样监控指标表将作为普通 PostgreSQL 表创建和迁移。

## 相关配置

### .env 配置

```properties
# 数据库自动迁移
DB_AUTO_MIGRATE=true

# TimescaleDB 支持
TIMESCALE_ENABLED=true
```

### 禁用自动迁移

如果遇到迁移问题，可以临时禁用自动迁移：

```properties
DB_AUTO_MIGRATE=false
```

然后手动执行数据库迁移脚本。

## 故障排查

### 问题 1: 仍然出现 ALTER COLUMN 错误

**原因**: 可能是 `isHypertable` 函数查询失败

**解决**:
```sql
-- 检查 TimescaleDB 扩展是否安装
SELECT * FROM pg_extension WHERE extname = 'timescaledb';

-- 检查 hypertable 信息视图是否存在
SELECT * FROM timescaledb_information.hypertables;
```

### 问题 2: 新表未创建

**原因**: 表被错误地识别为 hypertable

**解决**:
```sql
-- 检查表是否在 hypertable 列表中
SELECT hypertable_name FROM timescaledb_information.hypertables;

-- 如果不应该是 hypertable，检查表是否存在
SELECT tablename FROM pg_tables WHERE tablename = 'device_metrics';
```

### 问题 3: 压缩数据无法访问

**原因**: 压缩块可能损坏

**解决**:
```sql
-- 检查压缩状态
SELECT chunk_name, is_compressed 
FROM timescaledb_information.chunks 
WHERE hypertable_name = 'device_metrics';

-- 尝试解压缩
SELECT decompress_chunk(c) FROM show_chunks('device_metrics') c;
```

## 相关文档

- [TimescaleDB 压缩文档](https://docs.timescale.com/timescaledb/latest/how-to-guides/compression/)
- [GORM AutoMigrate 文档](https://gorm.io/docs/migration.html)
- [后端数据库连接修复](../backend/backend_database_connection_fix.md)
- [Go 模块路径修复](../backend/go_module_fix.md)

## 修复时间线

- **问题发现**: 2026-01-29 16:56 - 后端启动时迁移失败
- **问题分析**: 2026-01-29 17:00 - 定位到 TimescaleDB 压缩限制
- **方案设计**: 2026-01-29 17:05 - 设计跳过 hypertable 的迁移策略
- **代码修复**: 2026-01-29 17:10 - 修改 migrate.go
- **测试验证**: 2026-01-29 17:15 - 编译测试通过
- **文档更新**: 2026-01-29 17:20 - 创建详细文档

---

**修复状态**: ✅ 已完成  
**修复日期**: 2026-01-29  
**验证状态**: ✅ 编译通过  
**影响范围**: 数据库迁移流程
