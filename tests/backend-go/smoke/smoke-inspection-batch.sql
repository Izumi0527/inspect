-- 执行历史批次聚合 SQL 冒烟（在真 Postgres 上验证，临时表不落盘、不碰真实数据）
-- 验证点：CASE 分组键、HAVING 批次级过滤、排序 tiebreaker、历史归并展开、批量取消表达式
-- 归属说明：属后端测试资产，与 tests/backend-go 的 sqlmock 契约测试互补
--（sqlmock 断言 SQL 生成文本，本脚本验证真实方言执行），故放本目录而非 scripts/。
-- 执行示例（需要可用的 Postgres，本仓库开发容器默认端口 15500）：
--   docker exec -i inspect-postgres-dev psql -U inspect_dev -d inspect_system_dev -v ON_ERROR_STOP=1 \
--     < tests/backend-go/smoke/smoke-inspection-batch.sql
-- 通过标准：全部断言输出 PASS，末尾 ROLLBACK；改动批次聚合 SQL（executionGroupKeyExpr 等）后应回归执行。
\set ON_ERROR_STOP on
BEGIN;

CREATE TEMP TABLE "inspections" (
    id int primary key,
    device_id int,
    schedule_id int,
    batch_id text,
    name text,
    status text,
    started_at timestamptz,
    completed_at timestamptz,
    created_at timestamptz,
    total_checks int,
    passed_checks int,
    failed_checks int,
    warning_checks int,
    skipped_checks int,
    duration int,
    updated_at timestamptz
);

INSERT INTO "inspections" VALUES
-- 新批次 b-uuid-1：2 台设备（1 完成 / 1 运行中）
(1, 101, 9, 'b-uuid-1', '策略A 手动触发', 'completed', '2026-06-30 09:00+00', '2026-06-30 09:02+00', '2026-06-30 09:00+00', 10, 10, 0, 0, 0, 120),
(2, 102, 9, 'b-uuid-1', '策略A 手动触发', 'running',   '2026-06-30 09:00+00', NULL,                  '2026-06-30 09:00+00', 10, 5, 0, 0, 0, NULL),
-- 历史批次：同一次触发的 2 台设备（created_at 精确相同、无 batch_id）
(3, 103, 9, '', '策略A 手动触发', 'completed', '2026-06-29 08:00+00', '2026-06-29 08:02+00', '2026-06-29 08:00+00', 10, 10, 0, 0, 0, 120),
(4, 104, 9, '', '策略A 手动触发', 'completed', '2026-06-29 08:00+00', '2026-06-29 08:02+00', '2026-06-29 08:00+00', 10, 9, 1, 0, 0, 120),
-- 两次独立触发：同策略同名、created_at 不同 → 不得合并
(5, 105, 9, '', '策略A 手动触发', 'completed', '2026-06-28 08:00+00', '2026-06-28 08:02+00', '2026-06-28 08:00+00', 10, 10, 0, 0, 0, 120),
(6, 105, 9, '', '策略A 手动触发', 'completed', '2026-06-27 08:00+00', '2026-06-27 08:02+00', '2026-06-27 08:00+00', 10, 10, 0, 0, 0, 120);

-- 断言 1：无过滤时批次总数 = 4（新批次 1 + 历史对 1 + 独立触发 2）
SELECT CASE WHEN cnt = 4 THEN 'PASS' ELSE 'FAIL' END AS t1_no_filter_batch_count, cnt FROM (
  SELECT count(*) AS cnt FROM (
    SELECT CASE WHEN batch_id IS NOT NULL AND batch_id <> '' THEN 'b:' || batch_id ELSE 'l:' || COALESCE(CAST(schedule_id AS VARCHAR(255)), '0') || ':' || COALESCE(name, '') || ':' || COALESCE(CAST(created_at AS VARCHAR(255)), '') END AS group_key
    FROM "inspections" GROUP BY CASE WHEN batch_id IS NOT NULL AND batch_id <> '' THEN 'b:' || batch_id ELSE 'l:' || COALESCE(CAST(schedule_id AS VARCHAR(255)), '0') || ':' || COALESCE(name, '') || ':' || COALESCE(CAST(created_at AS VARCHAR(255)), '') END
  ) AS grouped_executions
) s;

-- 断言 2/3：状态筛选（running）与日期筛选走批次级 HAVING → 只命中新批次
SELECT CASE WHEN cnt = 1 THEN 'PASS' ELSE 'FAIL' END AS t2_status_date_having_hit, cnt FROM (
  SELECT count(*) AS cnt FROM (
    SELECT CASE WHEN batch_id IS NOT NULL AND batch_id <> '' THEN 'b:' || batch_id ELSE 'l:' || COALESCE(CAST(schedule_id AS VARCHAR(255)), '0') || ':' || COALESCE(name, '') || ':' || COALESCE(CAST(created_at AS VARCHAR(255)), '') END AS group_key
    FROM "inspections"
    GROUP BY CASE WHEN batch_id IS NOT NULL AND batch_id <> '' THEN 'b:' || batch_id ELSE 'l:' || COALESCE(CAST(schedule_id AS VARCHAR(255)), '0') || ':' || COALESCE(name, '') || ':' || COALESCE(CAST(created_at AS VARCHAR(255)), '') END
    HAVING bool_or(status IN ('running'))
       AND MIN(COALESCE(started_at, created_at)) >= '2026-06-01'
       AND MIN(COALESCE(started_at, created_at)) < '2026-07-01'
  ) AS grouped_executions
) s;

-- 断言 4：状态筛选命中的批次，行回查返回完整批次（2 行而非 1 行）
SELECT CASE WHEN cnt = 2 THEN 'PASS' ELSE 'FAIL' END AS t3_full_batch_rows, cnt FROM (
  SELECT count(*) AS cnt FROM "inspections"
  WHERE CASE WHEN batch_id IS NOT NULL AND batch_id <> '' THEN 'b:' || batch_id ELSE 'l:' || COALESCE(CAST(schedule_id AS VARCHAR(255)), '0') || ':' || COALESCE(name, '') || ':' || COALESCE(CAST(created_at AS VARCHAR(255)), '') END IN ('b:b-uuid-1')
) s;

-- 断言 4b（评审 M1 补充）：「批次已完成」= COUNT(*) = COUNT(completed_at) 放批次级 HAVING，
-- 不再用行级 WHERE completed_at IS NOT NULL 截断批次。
-- 数据前置：id=2 尚为 running 且 completed_at 为 NULL（断言 7 的 UPDATE 会改它，故本断言必须先执行）。
-- 期望：全完成且在窗口内的批次命中 = 3（历史对 3,4 + 独立单行批次 5、6）；
-- 唯一含运行中设备的新批次（1,2）被排除（由断言 4c 精确验证）。
SELECT CASE WHEN cnt = 3 THEN 'PASS' ELSE 'FAIL' END AS t4b_completed_batch_having, cnt FROM (
  SELECT count(*) AS cnt FROM (
    SELECT CASE WHEN batch_id IS NOT NULL AND batch_id <> '' THEN 'b:' || batch_id ELSE 'l:' || COALESCE(CAST(schedule_id AS VARCHAR(255)), '0') || ':' || COALESCE(name, '') || ':' || COALESCE(CAST(created_at AS VARCHAR(255)), '') END AS group_key
    FROM "inspections"
    GROUP BY CASE WHEN batch_id IS NOT NULL AND batch_id <> '' THEN 'b:' || batch_id ELSE 'l:' || COALESCE(CAST(schedule_id AS VARCHAR(255)), '0') || ':' || COALESCE(name, '') || ':' || COALESCE(CAST(created_at AS VARCHAR(255)), '') END
    HAVING COUNT(*) = COUNT(completed_at)
       AND MAX(completed_at) >= '2026-06-01'
       AND MAX(completed_at) < '2026-07-01'
  ) AS grouped_executions
) s;

-- 断言 4c（评审 M1 补充）：含运行中设备的新批次（1 完成 / 1 运行中）在「批次已完成」
-- 条件下不得命中——行级 WHERE 的旧实现会把它截成只剩已完成的 1 行，新口径直接排除整批。
SELECT CASE WHEN cnt = 0 THEN 'PASS' ELSE 'FAIL' END AS t4c_running_batch_excluded, cnt FROM (
  SELECT count(*) AS cnt FROM (
    SELECT CASE WHEN batch_id IS NOT NULL AND batch_id <> '' THEN 'b:' || batch_id ELSE 'l:' || COALESCE(CAST(schedule_id AS VARCHAR(255)), '0') || ':' || COALESCE(name, '') || ':' || COALESCE(CAST(created_at AS VARCHAR(255)), '') END AS group_key
    FROM "inspections"
    GROUP BY CASE WHEN batch_id IS NOT NULL AND batch_id <> '' THEN 'b:' || batch_id ELSE 'l:' || COALESCE(CAST(schedule_id AS VARCHAR(255)), '0') || ':' || COALESCE(name, '') || ':' || COALESCE(CAST(created_at AS VARCHAR(255)), '') END
    HAVING COUNT(*) = COUNT(completed_at)
  ) AS grouped_executions
  WHERE group_key = 'b:b-uuid-1'
) s;

-- 断言 5：排序 + tiebreaker 可执行且顺序确定（新批次 → 历史对 → 6.28 → 6.27）
SELECT CASE WHEN string_agg(min_id::text, ',' ORDER BY ord) = '1,3,5,6' THEN 'PASS' ELSE 'FAIL' END AS t4_order_deterministic,
       string_agg(min_id::text, ',' ORDER BY ord) AS actual_order
FROM (
  SELECT min_id, row_number() OVER () AS ord FROM (
    SELECT MIN(id) AS min_id, MIN(COALESCE(started_at, created_at)) AS start_time
    FROM "inspections"
    GROUP BY CASE WHEN batch_id IS NOT NULL AND batch_id <> '' THEN 'b:' || batch_id ELSE 'l:' || COALESCE(CAST(schedule_id AS VARCHAR(255)), '0') || ':' || COALESCE(name, '') || ':' || COALESCE(CAST(created_at AS VARCHAR(255)), '') END
    ORDER BY start_time DESC, min_id DESC
  ) keys
) s;

-- 断言 6：历史归并展开（IS NOT DISTINCT FROM 精确匹配 created_at）→ 恰好 2 行
SELECT CASE WHEN cnt = 2 THEN 'PASS' ELSE 'FAIL' END AS t5_legacy_expand_rows, cnt FROM (
  SELECT count(*) AS cnt FROM "inspections"
  WHERE ((batch_id IS NULL OR batch_id = ''))
    AND COALESCE(schedule_id, 0) = 9
    AND COALESCE(name, '') = '策略A 手动触发'
    AND created_at IS NOT DISTINCT FROM '2026-06-29 08:00+00'
) s;

-- 断言 7：批量取消表达式语法与语义（仅运行中的 id=2 受影响，duration 回填非负）
UPDATE "inspections"
SET status = 'cancelled',
    completed_at = now(),
    updated_at = now(),
    duration = CASE WHEN started_at IS NOT NULL THEN GREATEST(0, EXTRACT(EPOCH FROM (now() - started_at))::int) ELSE duration END
WHERE id IN (1, 2) AND status IN ('running', 'pending');
SELECT CASE WHEN cnt = 1 THEN 'PASS' ELSE 'FAIL' END AS t6_batch_cancel_rows, cnt FROM (
  SELECT count(*) AS cnt FROM "inspections" WHERE id = 2 AND status = 'cancelled' AND duration >= 0
) s;

-- 断言 8：历史批次回填（与代码 BackfillLegacyBatchIDs 相同语句）：
-- legacy 行 3,4 / 5 / 6 按同语义归并，赋确定性 batch_id 'legacy-<min_id>'
WITH legacy_groups AS (
    SELECT MIN(id) AS min_id, schedule_id, name, created_at
    FROM "inspections"
    WHERE batch_id IS NULL OR batch_id = ''
    GROUP BY schedule_id, name, created_at
)
UPDATE "inspections" i
SET batch_id = 'legacy-' || lg.min_id::text
FROM legacy_groups lg
WHERE (i.batch_id IS NULL OR i.batch_id = '')
  AND i.schedule_id IS NOT DISTINCT FROM lg.schedule_id
  AND i.name IS NOT DISTINCT FROM lg.name
  AND i.created_at IS NOT DISTINCT FROM lg.created_at;

-- 断言 9：回填后分组总数不变（仍为 4，归并语义等价切换到 batch_id）
SELECT CASE WHEN cnt = 4 THEN 'PASS' ELSE 'FAIL' END AS t7_post_backfill_group_count, cnt FROM (
  SELECT count(*) AS cnt FROM (
    SELECT CASE WHEN batch_id IS NOT NULL AND batch_id <> '' THEN 'b:' || batch_id ELSE 'l:' || COALESCE(CAST(schedule_id AS VARCHAR(255)), '0') || ':' || COALESCE(name, '') || ':' || COALESCE(CAST(created_at AS VARCHAR(255)), '') END AS group_key
    FROM "inspections" GROUP BY CASE WHEN batch_id IS NOT NULL AND batch_id <> '' THEN 'b:' || batch_id ELSE 'l:' || COALESCE(CAST(schedule_id AS VARCHAR(255)), '0') || ':' || COALESCE(name, '') || ':' || COALESCE(CAST(created_at AS VARCHAR(255)), '') END
  ) AS grouped_executions
) s;

-- 断言 10：回填标识确定性（批内最小 ID）+ 按 batch_id 索引直达展开完整批次
SELECT CASE WHEN cnt = 2 AND bid = 'legacy-3' THEN 'PASS' ELSE 'FAIL' END AS t8_backfill_id_and_expand, cnt, bid FROM (
  SELECT (SELECT batch_id FROM "inspections" WHERE id = 4) AS bid,
         (SELECT count(*) AS cnt FROM "inspections" WHERE batch_id = 'legacy-3')
) s;

ROLLBACK;
