-- 初始化默认告警规则
-- 用于监控中心的告警信息展示

-- 1. CPU使用率过高告警
INSERT INTO alert_rules (
    name, description, category, metric_name, operator, threshold_value,
    duration, severity, is_active, auto_resolve, notification_enabled,
    email_enabled, webhook_enabled, cooldown_minutes, created_at, updated_at
) VALUES (
    'CPU使用率过高',
    '当设备CPU使用率超过80%时触发告警',
    'performance',
    'cpu_usage',
    '>',
    80.0,
    300,
    'warning',
    true,
    true,
    true,
    false,
    false,
    30,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
) ON CONFLICT DO NOTHING;

-- 2. CPU使用率严重过高告警
INSERT INTO alert_rules (
    name, description, category, metric_name, operator, threshold_value,
    duration, severity, is_active, auto_resolve, notification_enabled,
    email_enabled, webhook_enabled, cooldown_minutes, created_at, updated_at
) VALUES (
    'CPU使用率严重过高',
    '当设备CPU使用率超过90%时触发严重告警',
    'performance',
    'cpu_usage',
    '>',
    90.0,
    180,
    'critical',
    true,
    true,
    true,
    false,
    false,
    15,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
) ON CONFLICT DO NOTHING;

-- 3. 内存使用率过高告警
INSERT INTO alert_rules (
    name, description, category, metric_name, operator, threshold_value,
    duration, severity, is_active, auto_resolve, notification_enabled,
    email_enabled, webhook_enabled, cooldown_minutes, created_at, updated_at
) VALUES (
    '内存使用率过高',
    '当设备内存使用率超过85%时触发告警',
    'performance',
    'memory_usage',
    '>',
    85.0,
    300,
    'warning',
    true,
    true,
    true,
    false,
    false,
    30,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
) ON CONFLICT DO NOTHING;

-- 4. 设备温度过高告警
INSERT INTO alert_rules (
    name, description, category, metric_name, operator, threshold_value,
    duration, severity, is_active, auto_resolve, notification_enabled,
    email_enabled, webhook_enabled, cooldown_minutes, created_at, updated_at
) VALUES (
    '设备温度过高',
    '当设备温度超过75°C时触发告警',
    'hardware',
    'temperature',
    '>',
    75.0,
    180,
    'warning',
    true,
    true,
    true,
    false,
    false,
    30,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
) ON CONFLICT DO NOTHING;

-- 5. 设备温度严重过高告警
INSERT INTO alert_rules (
    name, description, category, metric_name, operator, threshold_value,
    duration, severity, is_active, auto_resolve, notification_enabled,
    email_enabled, webhook_enabled, cooldown_minutes, created_at, updated_at
) VALUES (
    '设备温度严重过高',
    '当设备温度超过85°C时触发严重告警',
    'hardware',
    'temperature',
    '>',
    85.0,
    120,
    'critical',
    true,
    true,
    true,
    false,
    false,
    15,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
) ON CONFLICT DO NOTHING;

-- 6. 设备离线告警
INSERT INTO alert_rules (
    name, description, category, metric_name, operator, threshold_value,
    duration, severity, is_active, auto_resolve, notification_enabled,
    email_enabled, webhook_enabled, cooldown_minutes, created_at, updated_at
) VALUES (
    '设备离线',
    '当设备超过5分钟未响应时触发告警',
    'connectivity',
    'response_time',
    '>',
    300000.0,
    60,
    'critical',
    true,
    true,
    true,
    false,
    false,
    10,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
) ON CONFLICT DO NOTHING;

-- 显示创建的告警规则数量
SELECT COUNT(*) as alert_rules_count FROM alert_rules WHERE is_active = true;
