# 告警系统数据库表结构设计

**设计时间**: 2025-01-03
**版本**: v1.0
**目标数据库**: PostgreSQL 14+

---

## 📋 设计目标

1. **数据持久化**：服务重启后数据不丢失
2. **高性能查询**：支持复杂的过滤、排序、聚合查询
3. **可扩展性**：预留扩展字段，支持未来功能
4. **数据完整性**：外键约束、索引优化
5. **审计合规**：记录所有操作历史

---

## 📊 表结构设计

### 1. alert_rules 表 - 告警规则

存储告警规则配置，用于自动触发告警。

```sql
CREATE TABLE alert_rules (
    -- 主键
    id SERIAL PRIMARY KEY,

    -- 基本信息
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    category VARCHAR(50) NOT NULL,  -- performance, connectivity, security, configuration, hardware, other

    -- 规则条件
    metric_name VARCHAR(100) NOT NULL,
    operator VARCHAR(10) NOT NULL,  -- >, <, >=, <=, ==, !=
    threshold_value FLOAT NOT NULL,
    duration INTEGER NOT NULL DEFAULT 300,  -- 持续时间（秒）

    -- 告警配置
    severity VARCHAR(20) NOT NULL,  -- info, warning, critical, fatal
    auto_resolve BOOLEAN NOT NULL DEFAULT TRUE,

    -- 适用范围（JSON数组）
    device_types JSONB DEFAULT '[]'::jsonb,
    device_groups JSONB DEFAULT '[]'::jsonb,
    specific_devices JSONB DEFAULT '[]'::jsonb,

    -- 通知配置
    notification_enabled BOOLEAN NOT NULL DEFAULT TRUE,
    email_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    webhook_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    webhook_url VARCHAR(500),

    -- 状态
    is_active BOOLEAN NOT NULL DEFAULT TRUE,

    -- 审计字段
    created_by INTEGER NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

    -- 索引
    CONSTRAINT check_operator CHECK (operator IN ('>', '<', '>=', '<=', '==', '!=')),
    CONSTRAINT check_severity CHECK (severity IN ('info', 'warning', 'critical', 'fatal')),
    CONSTRAINT check_category CHECK (category IN ('performance', 'connectivity', 'security', 'configuration', 'hardware', 'other'))
);

-- 索引
CREATE INDEX idx_alert_rules_category ON alert_rules(category);
CREATE INDEX idx_alert_rules_severity ON alert_rules(severity);
CREATE INDEX idx_alert_rules_is_active ON alert_rules(is_active);
CREATE INDEX idx_alert_rules_created_at ON alert_rules(created_at DESC);
```

**字段说明**：
- `device_types`, `device_groups`, `specific_devices`: 使用JSONB存储数组，支持灵活查询
- `duration`: 告警触发前需要持续多久（秒）
- `auto_resolve`: 是否在条件恢复后自动解决告警

---

### 2. alerts 表 - 告警记录

存储所有告警记录（活跃告警和历史告警）。

```sql
CREATE TABLE alerts (
    -- 主键
    id SERIAL PRIMARY KEY,

    -- 关联
    device_id INTEGER NOT NULL,
    rule_id INTEGER,

    -- 基本信息
    title VARCHAR(500) NOT NULL,
    message TEXT NOT NULL,
    category VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'open',  -- open, acknowledged, resolved, closed

    -- 指标信息
    metric_name VARCHAR(100),
    current_value FLOAT,
    threshold_value FLOAT,

    -- 时间戳
    first_occurred TIMESTAMP NOT NULL DEFAULT NOW(),
    last_occurred TIMESTAMP NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP NOT NULL DEFAULT NOW(),

    -- 统计信息
    occurrence_count INTEGER NOT NULL DEFAULT 1,
    notification_count INTEGER NOT NULL DEFAULT 0,
    escalation_level INTEGER NOT NULL DEFAULT 0,

    -- 确认信息
    acknowledged_at TIMESTAMP,
    acknowledged_by INTEGER,
    acknowledge_note TEXT,

    -- 解决信息
    resolved_at TIMESTAMP,
    resolved_by INTEGER,
    resolution_note TEXT,

    -- 重新激活信息
    reactivated_at TIMESTAMP,
    reactivated_by INTEGER,
    reactivation_reason TEXT,

    -- 关闭信息
    closed_at TIMESTAMP,
    closed_by INTEGER,

    -- 外键约束
    CONSTRAINT fk_alerts_rule FOREIGN KEY (rule_id) REFERENCES alert_rules(id) ON DELETE SET NULL,

    -- 检查约束
    CONSTRAINT check_alert_severity CHECK (severity IN ('info', 'warning', 'critical', 'fatal')),
    CONSTRAINT check_alert_status CHECK (status IN ('open', 'acknowledged', 'resolved', 'closed')),
    CONSTRAINT check_alert_category CHECK (category IN ('performance', 'connectivity', 'security', 'configuration', 'hardware', 'other'))
);

-- 索引（性能优化）
CREATE INDEX idx_alerts_device_id ON alerts(device_id);
CREATE INDEX idx_alerts_rule_id ON alerts(rule_id);
CREATE INDEX idx_alerts_severity ON alerts(severity);
CREATE INDEX idx_alerts_status ON alerts(status);
CREATE INDEX idx_alerts_category ON alerts(category);
CREATE INDEX idx_alerts_first_occurred ON alerts(first_occurred DESC);
CREATE INDEX idx_alerts_created_at ON alerts(created_at DESC);

-- 复合索引（常用查询组合）
CREATE INDEX idx_alerts_status_severity ON alerts(status, severity);
CREATE INDEX idx_alerts_device_status ON alerts(device_id, status);
CREATE INDEX idx_alerts_status_created ON alerts(status, created_at DESC);
```

**字段说明**：
- `status`: 告警状态流转：open → acknowledged → resolved 或 open → closed
- `occurrence_count`: 告警重复触发次数
- `escalation_level`: 升级级别（预留字段）
- 所有时间戳字段使用TIMESTAMP类型，支持时区
- 外键使用`ON DELETE SET NULL`：删除规则时告警记录保留但rule_id置空

---

### 3. alert_operation_history 表 - 告警操作历史

记录所有告警操作，用于审计追踪。

```sql
CREATE TABLE alert_operation_history (
    -- 主键
    id SERIAL PRIMARY KEY,

    -- 关联
    alert_id INTEGER NOT NULL,

    -- 操作信息
    operation_type VARCHAR(50) NOT NULL,  -- create, acknowledge, resolve, reactivate, close, delete, update
    operator_id INTEGER NOT NULL,
    operator_name VARCHAR(100) NOT NULL,
    operation_time TIMESTAMP NOT NULL DEFAULT NOW(),

    -- 操作内容
    note TEXT,
    previous_status VARCHAR(20),
    new_status VARCHAR(20),

    -- 元数据（JSON格式存储额外信息）
    metadata JSONB DEFAULT '{}'::jsonb,

    -- 外键约束
    CONSTRAINT fk_history_alert FOREIGN KEY (alert_id) REFERENCES alerts(id) ON DELETE CASCADE,

    -- 检查约束
    CONSTRAINT check_operation_type CHECK (operation_type IN ('create', 'acknowledge', 'resolve', 'reactivate', 'close', 'delete', 'update'))
);

-- 索引
CREATE INDEX idx_history_alert_id ON alert_operation_history(alert_id);
CREATE INDEX idx_history_operation_type ON alert_operation_history(operation_type);
CREATE INDEX idx_history_operator_id ON alert_operation_history(operator_id);
CREATE INDEX idx_history_operation_time ON alert_operation_history(operation_time DESC);
```

**字段说明**：
- `operation_type`: 操作类型，覆盖所有告警生命周期操作
- `metadata`: 使用JSONB存储额外信息，如修改的字段、原始值等
- `ON DELETE CASCADE`: 告警删除时级联删除操作历史

---

## 🔄 数据流转

### 告警状态流转图

```
┌──────┐
│ open │ (新创建)
└──┬───┘
   │
   ├──► acknowledged (确认)
   │         │
   │         └──► resolved (解决) ──► 移至历史
   │
   ├──► resolved (直接解决) ──► 移至历史
   │
   └──► closed (关闭/归档) ──► 移至历史

历史告警可以 reactivate (重新激活) ──► open
```

### 数据查询策略

1. **活跃告警查询**：
   ```sql
   SELECT * FROM alerts WHERE status IN ('open', 'acknowledged') ORDER BY first_occurred DESC;
   ```

2. **历史告警查询**：
   ```sql
   SELECT * FROM alerts WHERE status IN ('resolved', 'closed') ORDER BY resolved_at DESC;
   ```

3. **统计查询**：
   ```sql
   -- 按严重级别统计
   SELECT severity, COUNT(*) FROM alerts WHERE status = 'open' GROUP BY severity;

   -- 按设备统计
   SELECT device_id, COUNT(*) FROM alerts WHERE status = 'open' GROUP BY device_id;
   ```

---

## 📈 性能优化

### 1. 索引策略

**单列索引**：
- 高频过滤字段：`status`, `severity`, `device_id`, `rule_id`
- 排序字段：`first_occurred`, `created_at`

**复合索引**：
- 常见查询组合：`(status, severity)`, `(device_id, status)`, `(status, created_at)`

### 2. 分区表（可选，大规模场景）

当告警记录超过百万级别时，可以按时间分区：

```sql
-- 按月分区
CREATE TABLE alerts_2025_01 PARTITION OF alerts
    FOR VALUES FROM ('2025-01-01') TO ('2025-02-01');

CREATE TABLE alerts_2025_02 PARTITION OF alerts
    FOR VALUES FROM ('2025-02-01') TO ('2025-03-01');
```

### 3. 数据归档

定期归档旧数据到历史表：

```sql
-- 创建归档表
CREATE TABLE alerts_archive (LIKE alerts INCLUDING ALL);

-- 归档90天前的数据
INSERT INTO alerts_archive
SELECT * FROM alerts WHERE resolved_at < NOW() - INTERVAL '90 days' AND status = 'resolved';

DELETE FROM alerts WHERE resolved_at < NOW() - INTERVAL '90 days' AND status = 'resolved';
```

---

## 🛡️ 数据完整性

### 外键约束

1. `alerts.rule_id` → `alert_rules.id` (ON DELETE SET NULL)
2. `alert_operation_history.alert_id` → `alerts.id` (ON DELETE CASCADE)

### 检查约束

1. 枚举值验证：`severity`, `status`, `category`, `operator`
2. 时间逻辑验证（可选）：
   ```sql
   ALTER TABLE alerts ADD CONSTRAINT check_time_order
   CHECK (first_occurred <= last_occurred);
   ```

---

## 🔍 查询示例

### 常用查询

```sql
-- 1. 获取活跃告警列表（分页）
SELECT * FROM alerts
WHERE status IN ('open', 'acknowledged')
ORDER BY first_occurred DESC
LIMIT 20 OFFSET 0;

-- 2. 获取指定设备的告警
SELECT * FROM alerts
WHERE device_id = 1 AND status = 'open'
ORDER BY severity DESC, first_occurred DESC;

-- 3. 获取告警统计
SELECT
    COUNT(*) FILTER (WHERE status = 'open') AS open_count,
    COUNT(*) FILTER (WHERE status = 'acknowledged') AS acknowledged_count,
    COUNT(*) FILTER (WHERE severity = 'critical') AS critical_count
FROM alerts WHERE status IN ('open', 'acknowledged');

-- 4. 获取告警趋势（最近7天）
SELECT
    DATE(created_at) AS date,
    COUNT(*) AS count,
    COUNT(*) FILTER (WHERE severity = 'critical') AS critical_count
FROM alerts
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date;

-- 5. 获取告警操作历史
SELECT
    aoh.*,
    a.title AS alert_title
FROM alert_operation_history aoh
JOIN alerts a ON aoh.alert_id = a.id
WHERE aoh.alert_id = 1
ORDER BY aoh.operation_time DESC;
```

---

## 📝 迁移脚本规划

### Alembic迁移顺序

1. **Migration 001**: 创建 `alert_rules` 表
2. **Migration 002**: 创建 `alerts` 表
3. **Migration 003**: 创建 `alert_operation_history` 表
4. **Migration 004**: 创建索引
5. **Migration 005**: 插入默认告警规则数据

---

## 🎯 数据模型对应关系

### InMemoryAlertRepository → Database

| 内存存储 | 数据库表 | 说明 |
|---------|---------|------|
| `alert_rules: Dict[int, Dict]` | `alert_rules` 表 | 告警规则 |
| `active_alerts: Dict[int, Dict]` | `alerts` (status IN ('open', 'acknowledged')) | 活跃告警 |
| `alert_history: List[Dict]` | `alerts` (status IN ('resolved', 'closed')) | 历史告警 |
| - | `alert_operation_history` 表 | 操作历史（新增） |

---

## ⚠️ 注意事项

1. **时区处理**：
   - 所有TIMESTAMP字段使用UTC时区存储
   - 应用层负责时区转换

2. **软删除 vs 硬删除**：
   - 告警采用软删除（status = 'closed'）
   - 告警规则采用软删除（is_active = false）
   - 操作历史不删除（审计要求）

3. **JSON字段**：
   - `device_types`, `device_groups`, `specific_devices`: 存储数组
   - `metadata`: 存储任意额外信息
   - 使用JSONB而非JSON，支持索引和高效查询

4. **扩展性**：
   - 预留`metadata`字段用于存储扩展信息
   - 枚举值使用VARCHAR而非ENUM类型，便于后续扩展

---

## 📊 估算容量

假设系统规模：
- 设备数量：1000台
- 告警规则：50条
- 每天新增告警：1000条
- 数据保留：90天活跃 + 1年历史

**存储估算**：
- `alert_rules`: 50行 × 2KB = 100KB
- `alerts` (活跃): 90天 × 1000条/天 × 1KB = 90MB
- `alerts` (历史): 365天 × 1000条/天 × 1KB = 365MB
- `alert_operation_history`: 365天 × 3000条/天 × 500B = 547MB

**总计**: ~1GB/年

建议配置：
- PostgreSQL 内存: 2-4GB
- 磁盘空间: 10GB+
- 连接池: 10-20

---

**设计完成日期**: 2025-01-03
**审核状态**: 待实现
**下一步**: 创建SQLAlchemy ORM模型
