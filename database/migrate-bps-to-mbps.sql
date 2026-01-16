-- ==========================================
-- 网络带宽单位迁移脚本 (bps → Mbps)
-- ==========================================
-- 功能: 将网络相关指标的单位从 bps (bits per second) 转换为 Mbps (Megabits per second)
-- 目的: 统一网络带宽指标单位，提高数据可读性和一致性
-- 转换比例: 1 Mbps = 1,000,000 bps
-- 执行时间: 约 2-5 分钟（取决于数据量）
-- 注意事项: 此脚本使用事务确保数据一致性，如遇错误会自动回滚
-- ==========================================

BEGIN;

-- ==========================================
-- 1. 更新设备指标表 (device_metrics)
-- ==========================================
-- 说明: 转换设备级别的网络带宽和流量指标
-- 影响字段: metric_value (数值除以1,000,000), metric_unit (更新为'Mbps')
UPDATE device_metrics
SET metric_value = metric_value / 1000000.0,  -- 转换为 Mbps (除以100万)
    metric_unit = 'Mbps'                      -- 更新单位标识
WHERE metric_name IN (
    'bandwidth_in',        -- 入站带宽
    'bandwidth_out',       -- 出站带宽
    'network_bytes_in',    -- 网络入站字节数
    'network_bytes_out',   -- 网络出站字节数
    'throughput_in',       -- 入站吞吐量
    'throughput_out',      -- 出站吞吐量
    'network_traffic'      -- 网络流量
)
  AND metric_value IS NOT NULL                                    -- 确保数值不为空
  AND (metric_unit IS NULL OR LOWER(metric_unit) IN ('bps', 'b/s', 'bit/s')); -- 只转换 bps 单位的数据

-- ==========================================
-- 2. 更新系统指标表 (system_metrics)
-- ==========================================
-- 说明: 转换系统级别的网络带宽和流量指标
-- 影响字段: metric_value (数值除以1,000,000), metric_unit (更新为'Mbps')
UPDATE system_metrics
SET metric_value = metric_value / 1000000.0,  -- 转换为 Mbps (除以100万)
    metric_unit = 'Mbps'                      -- 更新单位标识
WHERE metric_name IN (
    'bandwidth_in',        -- 入站带宽
    'bandwidth_out',       -- 出站带宽
    'network_bytes_in',    -- 网络入站字节数
    'network_bytes_out',   -- 网络出站字节数
    'throughput_in',       -- 入站吞吐量
    'throughput_out',      -- 出站吞吐量
    'network_traffic'      -- 网络流量
)
  AND metric_value IS NOT NULL                                    -- 确保数值不为空
  AND (metric_unit IS NULL OR LOWER(metric_unit) IN ('bps', 'b/s', 'bit/s')); -- 只转换 bps 单位的数据

-- ==========================================
-- 3. 更新接口指标表 (interface_metrics)
-- ==========================================
-- 说明: 转换网络接口级别的带宽和速度指标
-- 影响字段: metric_value (数值除以1,000,000), metric_unit (更新为'Mbps')
-- 特别说明: 包含更多接口相关的速度指标类型
UPDATE interface_metrics
SET metric_value = metric_value / 1000000.0,  -- 转换为 Mbps (除以100万)
    metric_unit = 'Mbps'                      -- 更新单位标识
WHERE metric_name IN (
    -- 通用网络指标
    'bandwidth_in',        -- 入站带宽
    'bandwidth_out',       -- 出站带宽
    'network_bytes_in',    -- 网络入站字节数
    'network_bytes_out',   -- 网络出站字节数
    'throughput_in',       -- 入站吞吐量
    'throughput_out',      -- 出站吞吐量
    'network_traffic',     -- 网络流量
    
    -- SNMP 接口速度指标
    'ifspeed',             -- 接口速度 (SNMP ifSpeed)
    'if_high_speed',       -- 高速接口速度 (SNMP ifHighSpeed)
    'ifhighspeed',         -- 高速接口速度 (简写)
    'speed',               -- 通用速度
    'link_speed',          -- 链路速度
    'linkspeed',           -- 链路速度 (简写)
    'speed_bps',           -- 以 bps 为单位的速度
    'link_speed_bps'       -- 以 bps 为单位的链路速度
)
  AND metric_value IS NOT NULL                                    -- 确保数值不为空
  AND (metric_unit IS NULL OR LOWER(metric_unit) IN ('bps', 'b/s', 'bit/s')); -- 只转换 bps 单位的数据

-- ==========================================
-- 4. 更新设备接口表 (device_interfaces)
-- ==========================================
-- 说明: 转换设备接口配置表中的速度字段
-- 影响字段: speed (数值除以1,000,000并四舍五入), last_updated, updated_at
-- 特别说明: 只处理速度 >= 1,000,000 bps 的记录，避免误转换小数值
UPDATE device_interfaces
SET speed = ROUND(speed::numeric / 1000000.0)::bigint,  -- 转换为 Mbps 并四舍五入为整数
    last_updated = COALESCE(last_updated, NOW()),       -- 如果 last_updated 为空则设为当前时间
    updated_at = NOW()                                  -- 更新修改时间戳
WHERE speed IS NOT NULL    -- 确保速度字段不为空
  AND speed >= 1000000;    -- 只处理 >= 1Mbps 的接口（避免误转换低速接口）

-- ==========================================
-- 提交事务
-- ==========================================
-- 说明: 如果所有更新操作都成功执行，则提交事务
-- 如果任何步骤失败，PostgreSQL 会自动回滚所有更改
COMMIT;

-- ==========================================
-- 迁移完成
-- ==========================================
-- 执行后建议:
-- 1. 检查数据一致性: SELECT DISTINCT metric_unit FROM device_metrics WHERE metric_name LIKE '%bandwidth%';
-- 2. 验证数值范围: SELECT MIN(metric_value), MAX(metric_value) FROM device_metrics WHERE metric_unit = 'Mbps';
-- 3. 更新应用程序中的单位显示逻辑
-- 4. 更新监控图表的 Y 轴标签和刻度
-- ==========================================
