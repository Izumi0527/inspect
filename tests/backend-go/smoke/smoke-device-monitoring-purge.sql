-- 删设备清理监控数据 SQL 冒烟（在真 Postgres 上验证，临时表不落盘、不碰真实数据）
-- 验证点：孤儿 device_id 查询的 UNION 去重 / NULL 过滤 / NOT EXISTS 反连现存设备；逐表 DELETE 只清目标设备
-- 归属说明：与 tests/backend-go/internal/devices/device_monitoring_purge_test.go 的 sqlmock 契约测试互补
--（sqlmock 断言 Go 侧生成的 SQL 文本，本脚本验证真实方言执行），故放本目录而非 scripts/。
-- 执行示例（需要可用的 Postgres，本仓库开发容器默认端口 15500）：
--   docker exec -i inspect-postgres-dev psql -U inspect_dev -d inspect_system_dev -v ON_ERROR_STOP=1 \
--     < tests/backend-go/smoke/smoke-device-monitoring-purge.sql
-- 通过标准：全部断言输出 PASS，末尾 ROLLBACK；改动 devices.orphanMonitoringDeviceIDsSQL /
-- purgeDeviceMonitoringData 后应回归执行。
\set ON_ERROR_STOP on
BEGIN;

-- 临时表同名遮蔽真实表（pg_temp 在 search_path 最前），事务内创建、ROLLBACK 即消失
CREATE TEMP TABLE devices (id int PRIMARY KEY, name text);
CREATE TEMP TABLE device_metrics (id bigserial, device_id bigint NOT NULL, metric_name text, collected_at timestamptz);
CREATE TEMP TABLE interface_metrics (id bigserial, device_id bigint NOT NULL, interface_name text, collected_at timestamptz);
CREATE TEMP TABLE device_interfaces (id bigserial, device_id bigint, name text);

-- 21 现存；6、17 已删只剩监控数据；device_interfaces 另有一行 device_id 为 NULL（真实表该列可空）
INSERT INTO devices VALUES (21, '现存设备');
INSERT INTO device_metrics (device_id, metric_name, collected_at) VALUES
    (6, 'cpu_usage', now()), (6, 'memory_usage', now()), (21, 'cpu_usage', now());
INSERT INTO interface_metrics (device_id, interface_name, collected_at) VALUES
    (6, 'if1', now()), (17, 'if1', now()), (21, 'if1', now());
INSERT INTO device_interfaces (device_id, name) VALUES
    (6, 'if1'), (17, 'if1'), (21, 'if1'), (NULL, 'orphan-null');

-- 断言 1：孤儿查询返回且仅返回 6、17（6 跨两表只出现一次；NULL 被滤掉；现存的 21 不入选）
SELECT CASE
    WHEN array_agg(device_id ORDER BY device_id) = ARRAY[6, 17]::bigint[] THEN 'PASS 孤儿查询=[6,17]'
    ELSE 'FAIL 孤儿查询=' || coalesce(array_agg(device_id ORDER BY device_id)::text, 'NULL')
END AS assert_orphans
FROM (
    SELECT referenced.device_id FROM (SELECT device_id FROM device_metrics UNION SELECT device_id FROM interface_metrics UNION SELECT device_id FROM device_interfaces) AS referenced WHERE referenced.device_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM devices AS d WHERE d.id = referenced.device_id) ORDER BY referenced.device_id
) AS orphans;

-- 断言 2：按设备逐表清理 6 后三表该设备清零，其它设备与 NULL 行原样
DELETE FROM device_metrics WHERE device_id = 6;
DELETE FROM interface_metrics WHERE device_id = 6;
DELETE FROM device_interfaces WHERE device_id = 6;

SELECT CASE
    WHEN (SELECT count(*) FROM device_metrics WHERE device_id = 6) = 0
     AND (SELECT count(*) FROM interface_metrics WHERE device_id = 6) = 0
     AND (SELECT count(*) FROM device_interfaces WHERE device_id = 6) = 0 THEN 'PASS 设备 6 三表清零'
    ELSE 'FAIL 设备 6 仍有残留'
END AS assert_purged;

SELECT CASE
    WHEN (SELECT count(*) FROM device_metrics) = 1
     AND (SELECT count(*) FROM interface_metrics) = 2
     AND (SELECT count(*) FROM device_interfaces) = 3 THEN 'PASS 其它设备行数不变'
    ELSE 'FAIL 误删其它设备'
END AS assert_untouched;

-- 断言 3：清完 6 再查孤儿只剩 17（启动清理逐台推进时每轮结果单调收敛）
SELECT CASE
    WHEN array_agg(device_id ORDER BY device_id) = ARRAY[17]::bigint[] THEN 'PASS 清理后孤儿=[17]'
    ELSE 'FAIL 清理后孤儿=' || coalesce(array_agg(device_id ORDER BY device_id)::text, 'NULL')
END AS assert_remaining
FROM (
    SELECT referenced.device_id FROM (SELECT device_id FROM device_metrics UNION SELECT device_id FROM interface_metrics UNION SELECT device_id FROM device_interfaces) AS referenced WHERE referenced.device_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM devices AS d WHERE d.id = referenced.device_id) ORDER BY referenced.device_id
) AS remaining;

ROLLBACK;
