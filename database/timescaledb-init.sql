-- ==========================================
-- TimescaleDB 时序数据库初始化脚本
-- ==========================================
-- 功能: 在 PostgreSQL 基础上启用 TimescaleDB 扩展，创建时序表结构和优化策略
-- 架构: 方案 B（接口级指标单独表）- 设备指标与接口指标分离存储
-- 执行时机: PostgreSQL 基础迁移完成后自动执行
-- 性能优化: 包含数据压缩、保留策略、连续聚合等企业级功能
-- 数据保留: 原始数据90天，聚合数据1年，7天后自动压缩
-- ==========================================

-- ==========================================
-- 1. 启用 TimescaleDB 扩展
-- ==========================================
-- 说明: 在现有 PostgreSQL 数据库上启用时序数据库功能
CREATE EXTENSION IF NOT EXISTS timescaledb;

-- ==========================================
-- 2. 转换现有表为时序表 (Hypertable)
-- ==========================================
-- 说明: 将已存在的 device_metrics 表转换为 TimescaleDB 的时序表
-- 分区键: collected_at (按时间自动分区，提高查询性能)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'device_metrics'
    ) THEN
        -- 创建时序表，按 collected_at 字段进行时间分区
        PERFORM create_hypertable('device_metrics', 'collected_at', if_not_exists => TRUE);
    END IF;
END $$;

-- ==========================================
-- 3. 创建接口级指标表 (interface_metrics)
-- ==========================================
-- 说明: 存储网络接口级别的性能指标数据
-- 用途: 端口流量、带宽利用率、错误包统计等接口维度的监控数据
CREATE TABLE IF NOT EXISTS interface_metrics (
    id BIGSERIAL PRIMARY KEY,                                    -- 主键，自增长整数
    device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,  -- 设备ID，外键关联
    interface_name VARCHAR(100) NOT NULL,                        -- 接口名称 (如: eth0, GigabitEthernet1/0/1)
    metric_name VARCHAR(100) NOT NULL,                          -- 指标名称 (如: bandwidth_in, packet_loss)
    metric_value DOUBLE PRECISION,                              -- 指标数值 (支持小数)
    metric_unit VARCHAR(20),                                    -- 指标单位 (如: Mbps, %, pps)
    tags JSONB,                                                 -- 扩展标签 (JSON格式，支持灵活的元数据)
    collected_at TIMESTAMPTZ NOT NULL,                         -- 数据采集时间 (时区感知)
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP  -- 记录创建时间
);

-- 创建查询优化索引
CREATE INDEX IF NOT EXISTS idx_interface_metrics_device_time
    ON interface_metrics (device_id, collected_at DESC);        -- 按设备和时间查询优化

CREATE INDEX IF NOT EXISTS idx_interface_metrics_device_iface_metric_time
    ON interface_metrics (device_id, interface_name, metric_name, collected_at DESC);  -- 复合查询优化

-- 转换为时序表
SELECT create_hypertable('interface_metrics', 'collected_at', if_not_exists => TRUE);

-- ==========================================
-- 4. 创建设备状态历史表 (device_status_history)
-- ==========================================
-- 说明: 记录设备在线状态、响应时间等可用性监控数据
-- 用途: 设备宕机统计、SLA计算、故障分析等
CREATE TABLE IF NOT EXISTS device_status_history (
    id BIGSERIAL PRIMARY KEY,                                    -- 主键
    device_id INTEGER NOT NULL REFERENCES devices(id) ON DELETE CASCADE,  -- 设备ID
    device_ip VARCHAR(45),                                       -- 设备IP地址 (支持IPv4/IPv6)
    status VARCHAR(20) NOT NULL,                                -- 设备状态 (online, offline, unreachable)
    status_code SMALLINT,                                       -- 状态码 (HTTP状态码或自定义)
    response_time DOUBLE PRECISION,                             -- 响应时间 (毫秒)
    error_message TEXT,                                         -- 错误信息 (故障详情)
    collected_at TIMESTAMPTZ NOT NULL,                         -- 状态检查时间
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP  -- 记录创建时间
);

-- 创建查询优化索引
CREATE INDEX IF NOT EXISTS idx_device_status_history_device_time
    ON device_status_history (device_id, collected_at DESC);    -- 按设备查询历史状态

CREATE INDEX IF NOT EXISTS idx_device_status_history_status_time
    ON device_status_history (status, collected_at DESC);       -- 按状态类型统计

-- 转换为时序表
SELECT create_hypertable('device_status_history', 'collected_at', if_not_exists => TRUE);

-- ==========================================
-- 5. 创建系统指标表 (system_metrics)
-- ==========================================
-- 说明: 存储服务器和系统级别的性能指标
-- 用途: CPU使用率、内存占用、磁盘IO、系统负载等监控数据
CREATE TABLE IF NOT EXISTS system_metrics (
    id BIGSERIAL PRIMARY KEY,                                    -- 主键
    host VARCHAR(255),                                          -- 主机名或IP地址
    metric_name VARCHAR(100) NOT NULL,                          -- 指标名称 (如: cpu_usage, memory_used)
    metric_value DOUBLE PRECISION,                              -- 指标数值
    metric_unit VARCHAR(20),                                    -- 指标单位 (如: %, GB, IOPS)
    tags JSONB,                                                 -- 扩展标签 (如: {"region": "us-east", "env": "prod"})
    collected_at TIMESTAMPTZ NOT NULL,                         -- 数据采集时间
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP  -- 记录创建时间
);

-- 创建查询优化索引
CREATE INDEX IF NOT EXISTS idx_system_metrics_host_time
    ON system_metrics (host, collected_at DESC);                -- 按主机查询

CREATE INDEX IF NOT EXISTS idx_system_metrics_metric_time
    ON system_metrics (metric_name, collected_at DESC);         -- 按指标类型查询

CREATE INDEX IF NOT EXISTS idx_system_metrics_host_metric_time
    ON system_metrics (host, metric_name, collected_at DESC);   -- 复合查询优化

-- 转换为时序表
SELECT create_hypertable('system_metrics', 'collected_at', if_not_exists => TRUE);

-- ==========================================
-- 6. 创建用户活动日志表 (user_activity_logs)
-- ==========================================
-- 说明: 记录用户操作行为，用于审计和行为分析
-- 用途: 安全审计、用户行为分析、操作统计等
CREATE TABLE IF NOT EXISTS user_activity_logs (
    id BIGSERIAL PRIMARY KEY,                                    -- 主键
    user_id VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL, -- 用户ID (UUID格式)
    action VARCHAR(100) NOT NULL,                               -- 操作类型 (如: login, create_device, delete_report)
    resource VARCHAR(100),                                      -- 操作资源 (如: device, report, user)
    details JSONB,                                              -- 操作详情 (JSON格式存储具体参数)
    activity_count INTEGER NOT NULL DEFAULT 1,                 -- 活动计数 (用于聚合相同操作)
    collected_at TIMESTAMPTZ NOT NULL,                         -- 操作时间
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP  -- 记录创建时间
);

-- 创建查询优化索引
CREATE INDEX IF NOT EXISTS idx_user_activity_logs_user_time
    ON user_activity_logs (user_id, collected_at DESC);         -- 按用户查询操作历史

CREATE INDEX IF NOT EXISTS idx_user_activity_logs_action_time
    ON user_activity_logs (action, collected_at DESC);          -- 按操作类型统计

CREATE INDEX IF NOT EXISTS idx_user_activity_logs_resource_time
    ON user_activity_logs (resource, collected_at DESC);        -- 按资源类型查询

-- 转换为时序表
SELECT create_hypertable('user_activity_logs', 'collected_at', if_not_exists => TRUE);

-- ==========================================
-- 7. 配置数据压缩策略
-- ==========================================
-- 说明: 启用 TimescaleDB 的数据压缩功能，大幅减少存储空间占用
-- 压缩算法: 列式压缩，针对时序数据优化
-- 触发条件: 数据写入7天后自动压缩
-- 压缩比例: 通常可达到 90% 以上的压缩率

-- 设备指标表压缩配置
ALTER TABLE IF EXISTS device_metrics
    SET (
        timescaledb.compress,                                    -- 启用压缩
        timescaledb.compress_segmentby = 'device_id, metric_name',  -- 按设备和指标分组压缩
        timescaledb.compress_orderby = 'collected_at DESC'       -- 按时间倒序排列 (最新数据优先)
    );

-- 接口指标表压缩配置
ALTER TABLE IF EXISTS interface_metrics
    SET (
        timescaledb.compress,                                    -- 启用压缩
        timescaledb.compress_segmentby = 'device_id, interface_name, metric_name',  -- 按设备、接口、指标分组
        timescaledb.compress_orderby = 'collected_at DESC'       -- 按时间倒序排列
    );

-- 设备状态历史表压缩配置
ALTER TABLE IF EXISTS device_status_history
    SET (
        timescaledb.compress,                                    -- 启用压缩
        timescaledb.compress_segmentby = 'device_id, status',    -- 按设备和状态分组
        timescaledb.compress_orderby = 'collected_at DESC'       -- 按时间倒序排列
    );

-- 系统指标表压缩配置
ALTER TABLE IF EXISTS system_metrics
    SET (
        timescaledb.compress,                                    -- 启用压缩
        timescaledb.compress_segmentby = 'host, metric_name',    -- 按主机和指标分组
        timescaledb.compress_orderby = 'collected_at DESC'       -- 按时间倒序排列
    );

-- 用户活动日志表压缩配置
ALTER TABLE IF EXISTS user_activity_logs
    SET (
        timescaledb.compress,                                    -- 启用压缩
        timescaledb.compress_segmentby = 'user_id, action, resource',  -- 按用户、操作、资源分组
        timescaledb.compress_orderby = 'collected_at DESC'       -- 按时间倒序排列
    );

-- ==========================================
-- 8. 配置自动化数据管理策略
-- ==========================================
-- 说明: 设置数据压缩和保留策略，实现自动化的数据生命周期管理
-- 压缩策略: 7天后自动压缩，节省存储空间
-- 保留策略: 90天后自动删除，控制数据库大小
DO $$
DECLARE
    tbl TEXT;  -- 表名变量
BEGIN
    -- 遍历所有时序表
    FOREACH tbl IN ARRAY ARRAY[
        'device_metrics',        -- 设备指标表
        'interface_metrics',     -- 接口指标表
        'device_status_history', -- 设备状态历史表
        'system_metrics',        -- 系统指标表
        'user_activity_logs'     -- 用户活动日志表
    ]
    LOOP
        -- 检查表是否存在
        IF EXISTS (
            SELECT 1
            FROM information_schema.tables
            WHERE table_schema = 'public'
              AND table_name = tbl
        ) THEN
            -- 添加压缩策略 (7天后压缩)
            IF NOT EXISTS (
                SELECT 1
                FROM timescaledb_information.jobs
                WHERE hypertable_name = tbl
                  AND proc_name = 'policy_compression'
            ) THEN
                PERFORM add_compression_policy(tbl, INTERVAL '7 days');
            END IF;

            -- 添加保留策略 (90天后删除)
            IF NOT EXISTS (
                SELECT 1
                FROM timescaledb_information.jobs
                WHERE hypertable_name = tbl
                  AND proc_name = 'policy_retention'
            ) THEN
                PERFORM add_retention_policy(tbl, INTERVAL '90 days');
            END IF;
        END IF;
    END LOOP;
END $$;

-- ==========================================
-- 9. 创建连续聚合视图 (小时级汇总)
-- ==========================================
-- 说明: 创建预计算的聚合视图，大幅提高历史数据查询性能
-- 聚合粒度: 1小时 (可根据需要调整为分钟级或天级)
-- 统计指标: 平均值、最小值、最大值、样本数量
-- 更新频率: 每小时自动刷新一次
DO $$
BEGIN
    -- 设备指标小时级聚合视图
    IF NOT EXISTS (
        SELECT 1
        FROM pg_matviews
        WHERE schemaname = 'public'
          AND matviewname = 'device_metrics_hourly'
    ) THEN
        EXECUTE $$
            CREATE MATERIALIZED VIEW device_metrics_hourly
            WITH (timescaledb.continuous) AS
            SELECT
                time_bucket('1 hour', collected_at) AS bucket,   -- 时间桶 (1小时)
                device_id,                                       -- 设备ID
                metric_name,                                     -- 指标名称
                AVG(metric_value) AS avg_value,                 -- 平均值
                MIN(metric_value) AS min_value,                 -- 最小值
                MAX(metric_value) AS max_value,                 -- 最大值
                COUNT(*) AS samples                             -- 样本数量
            FROM device_metrics
            GROUP BY bucket, device_id, metric_name
            WITH NO DATA                                        -- 创建时不填充数据
        $$;
    END IF;

    -- 接口指标小时级聚合视图
    IF NOT EXISTS (
        SELECT 1
        FROM pg_matviews
        WHERE schemaname = 'public'
          AND matviewname = 'interface_metrics_hourly'
    ) THEN
        EXECUTE $$
            CREATE MATERIALIZED VIEW interface_metrics_hourly
            WITH (timescaledb.continuous) AS
            SELECT
                time_bucket('1 hour', collected_at) AS bucket,   -- 时间桶 (1小时)
                device_id,                                       -- 设备ID
                interface_name,                                  -- 接口名称
                metric_name,                                     -- 指标名称
                AVG(metric_value) AS avg_value,                 -- 平均值
                MIN(metric_value) AS min_value,                 -- 最小值
                MAX(metric_value) AS max_value,                 -- 最大值
                COUNT(*) AS samples                             -- 样本数量
            FROM interface_metrics
            GROUP BY bucket, device_id, interface_name, metric_name
            WITH NO DATA                                        -- 创建时不填充数据
        $$;
    END IF;

    -- 系统指标小时级聚合视图
    IF NOT EXISTS (
        SELECT 1
        FROM pg_matviews
        WHERE schemaname = 'public'
          AND matviewname = 'system_metrics_hourly'
    ) THEN
        EXECUTE $$
            CREATE MATERIALIZED VIEW system_metrics_hourly
            WITH (timescaledb.continuous) AS
            SELECT
                time_bucket('1 hour', collected_at) AS bucket,   -- 时间桶 (1小时)
                host,                                            -- 主机名
                metric_name,                                     -- 指标名称
                AVG(metric_value) AS avg_value,                 -- 平均值
                MIN(metric_value) AS min_value,                 -- 最小值
                MAX(metric_value) AS max_value,                 -- 最大值
                COUNT(*) AS samples                             -- 样本数量
            FROM system_metrics
            GROUP BY bucket, host, metric_name
            WITH NO DATA                                        -- 创建时不填充数据
        $$;
    END IF;
END $$;

-- ==========================================
-- 10. 配置连续聚合自动刷新策略
-- ==========================================
-- 说明: 设置聚合视图的自动更新策略，确保聚合数据的实时性
-- 刷新频率: 每小时执行一次
-- 数据范围: 处理90天内的数据，保留1小时的缓冲时间
DO $$
BEGIN
    -- 设备指标聚合视图刷新策略
    IF NOT EXISTS (
        SELECT 1
        FROM timescaledb_information.jobs
        WHERE hypertable_name = 'device_metrics_hourly'
          AND proc_name = 'policy_refresh_continuous_aggregate'
    ) THEN
        PERFORM add_continuous_aggregate_policy(
            'device_metrics_hourly',                            -- 聚合视图名称
            start_offset => INTERVAL '90 days',                 -- 开始偏移 (处理90天内数据)
            end_offset => INTERVAL '1 hour',                    -- 结束偏移 (保留1小时缓冲)
            schedule_interval => INTERVAL '1 hour'              -- 执行频率 (每小时)
        );
    END IF;

    -- 接口指标聚合视图刷新策略
    IF NOT EXISTS (
        SELECT 1
        FROM timescaledb_information.jobs
        WHERE hypertable_name = 'interface_metrics_hourly'
          AND proc_name = 'policy_refresh_continuous_aggregate'
    ) THEN
        PERFORM add_continuous_aggregate_policy(
            'interface_metrics_hourly',                         -- 聚合视图名称
            start_offset => INTERVAL '90 days',                 -- 开始偏移
            end_offset => INTERVAL '1 hour',                    -- 结束偏移
            schedule_interval => INTERVAL '1 hour'              -- 执行频率
        );
    END IF;

    -- 系统指标聚合视图刷新策略
    IF NOT EXISTS (
        SELECT 1
        FROM timescaledb_information.jobs
        WHERE hypertable_name = 'system_metrics_hourly'
          AND proc_name = 'policy_refresh_continuous_aggregate'
    ) THEN
        PERFORM add_continuous_aggregate_policy(
            'system_metrics_hourly',                            -- 聚合视图名称
            start_offset => INTERVAL '90 days',                 -- 开始偏移
            end_offset => INTERVAL '1 hour',                    -- 结束偏移
            schedule_interval => INTERVAL '1 hour'              -- 执行频率
        );
    END IF;
END $$;

-- ==========================================
-- 11. 配置聚合视图数据保留策略
-- ==========================================
-- 说明: 设置聚合数据的保留期限，平衡存储成本和数据价值
-- 保留期限: 1年 (365天) - 聚合数据通常保留更长时间用于趋势分析
DO $$
BEGIN
    -- 设备指标聚合视图保留策略 (保留1年)
    IF NOT EXISTS (
        SELECT 1
        FROM timescaledb_information.jobs
        WHERE hypertable_name = 'device_metrics_hourly'
          AND proc_name = 'policy_retention'
    ) THEN
        PERFORM add_retention_policy('device_metrics_hourly', INTERVAL '365 days');
    END IF;

    -- 接口指标聚合视图保留策略 (保留1年)
    IF NOT EXISTS (
        SELECT 1
        FROM timescaledb_information.jobs
        WHERE hypertable_name = 'interface_metrics_hourly'
          AND proc_name = 'policy_retention'
    ) THEN
        PERFORM add_retention_policy('interface_metrics_hourly', INTERVAL '365 days');
    END IF;

    -- 系统指标聚合视图保留策略 (保留1年)
    IF NOT EXISTS (
        SELECT 1
        FROM timescaledb_information.jobs
        WHERE hypertable_name = 'system_metrics_hourly'
          AND proc_name = 'policy_retention'
    ) THEN
        PERFORM add_retention_policy('system_metrics_hourly', INTERVAL '365 days');
    END IF;
END $$;

-- ==========================================
-- TimescaleDB 初始化完成
-- ==========================================
-- 配置总结:
-- 1. ✅ 时序表 (Hypertables): 5个表自动按时间分区
-- 2. ✅ 数据压缩: 7天后自动压缩，节省90%+存储空间
-- 3. ✅ 数据保留: 原始数据90天，聚合数据1年
-- 4. ✅ 连续聚合: 小时级预计算视图，提升查询性能
-- 5. ✅ 自动化策略: 压缩、保留、刷新全自动管理
-- 
-- 性能优势:
-- - 查询性能提升: 10-100倍 (得益于时间分区和索引优化)
-- - 存储空间节省: 90%+ (得益于列式压缩)
-- - 运维成本降低: 自动化数据生命周期管理
-- 
-- 监控建议:
-- - 定期检查压缩率: SELECT * FROM timescaledb_information.compressed_chunk_stats;
-- - 监控存储使用: SELECT * FROM timescaledb_information.hypertable;
-- - 查看后台任务: SELECT * FROM timescaledb_information.jobs;
-- ==========================================
