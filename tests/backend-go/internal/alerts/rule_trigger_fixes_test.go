package alerts_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/alerts"
)

func TestDeleteRule_DeletesStatesNullsAlertsAndRemovesRule(t *testing.T) {
	t.Run("成功删除规则并清理状态与置空告警外键", func(t *testing.T) {
		db, mock, cleanup := newAlertsGormDBWithSQLMock(t)
		defer cleanup()

		svc := alerts.NewService(db, zap.NewNop())

		mock.ExpectBegin()
		mock.ExpectExec(`(?is)DELETE FROM "trigger_eval_states" WHERE rule_id = \$1`).
			WithArgs(12).
			WillReturnResult(sqlmock.NewResult(0, 2))
		mock.ExpectExec(`(?is)UPDATE "alerts" SET "rule_id"=\$1 WHERE rule_id = \$2`).
			WithArgs(nil, 12).
			WillReturnResult(sqlmock.NewResult(0, 3))
		mock.ExpectExec(`(?is)DELETE FROM "alert_rules" WHERE id = \$1`).
			WithArgs(12).
			WillReturnResult(sqlmock.NewResult(0, 1))
		mock.ExpectCommit()

		if err := svc.DeleteRule(context.Background(), 12); err != nil {
			t.Fatalf("DeleteRule() error = %v", err)
		}
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Fatalf("sqlmock expectations not met: %v", err)
		}
	})

	t.Run("规则不存在时返回 gorm.ErrRecordNotFound 并回滚", func(t *testing.T) {
		db, mock, cleanup := newAlertsGormDBWithSQLMock(t)
		defer cleanup()

		svc := alerts.NewService(db, zap.NewNop())

		mock.ExpectBegin()
		mock.ExpectExec(`(?is)DELETE FROM "trigger_eval_states" WHERE rule_id = \$1`).
			WithArgs(999).
			WillReturnResult(sqlmock.NewResult(0, 0))
		mock.ExpectExec(`(?is)UPDATE "alerts" SET "rule_id"=\$1 WHERE rule_id = \$2`).
			WithArgs(nil, 999).
			WillReturnResult(sqlmock.NewResult(0, 0))
		mock.ExpectExec(`(?is)DELETE FROM "alert_rules" WHERE id = \$1`).
			WithArgs(999).
			WillReturnResult(sqlmock.NewResult(0, 0))
		mock.ExpectRollback()

		err := svc.DeleteRule(context.Background(), 999)
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			t.Fatalf("DeleteRule() error = %v, want gorm.ErrRecordNotFound", err)
		}
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Fatalf("sqlmock expectations not met: %v", err)
		}
	})
}

func TestEvaluator_MetricAliasesResponseTimeIfAggregationAndNoData(t *testing.T) {
	db, mock, cleanup := newAlertsGormDBWithSQLMock(t)
	defer cleanup()

	now := time.Date(2026, 11, 24, 10, 0, 0, 0, time.UTC)
	eval := alerts.NewEvaluator(db, nil, nil, zap.NewNop())
	eval.SetNowFunc(func() time.Time { return now })

	// 1. response_time 从 devices 快照读取，且规则使用别名 icmp_rtt 命中；
	// 2. if_utilization 从 device_latest_metrics 接口级 utilization_in / utilization_out 聚合 max 合成；
	// 3. nodata 规则 metric=icmp_rtt 查询 LOWER(metric_name) IN (别名集合)，命中 ping_rtt_ms 最新时间不误报断流。
	mock.ExpectQuery(`(?is)SELECT \* FROM "alert_rules" WHERE is_active = \$1`).
		WithArgs(true).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "category", "metric_name", "operator", "threshold_value", "duration", "severity", "is_active", "expression_mode", "nodata_seconds"}).
			AddRow(1, "ICMP延迟过高", "connectivity", "icmp_rtt", ">", 100.0, 0, "warning", true, "threshold", 0).
			AddRow(2, "接口利用率过高", "interface", "if_utilization", ">=", 85.0, 0, "warning", true, "threshold", 0).
			AddRow(3, "ICMP断流检测", "availability", "icmp_rtt", ">", 0.0, 0, "warning", true, "nodata", 300))

	mock.ExpectQuery(`(?is)SELECT id, group_id, name, device_type, ip_address, COALESCE\(topology_role, 'access'\) AS topology_role, status FROM "devices"`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "group_id", "name", "device_type", "ip_address", "topology_role", "status"}).
			AddRow(10, nil, "core-1", "switch", "10.0.0.1", "core", "online"))

	mock.ExpectQuery(`(?is)FROM device_metrics`).
		WillReturnRows(sqlmock.NewRows([]string{"device_id", "metric_name", "metric_value"}))
	mock.ExpectQuery(`(?is)SELECT device_id, metric_name, metric_value FROM "device_latest_metrics"`).
		WillReturnRows(sqlmock.NewRows([]string{"device_id", "metric_name", "metric_value"}))
	mock.ExpectQuery(`(?is)SELECT device_id, metric_name, MAX\(metric_value\) AS metric_value FROM "device_latest_metrics"`).
		WillReturnRows(sqlmock.NewRows([]string{"device_id", "metric_name", "metric_value"}).
			AddRow(10, "utilization_in", 60.0).
			AddRow(10, "utilization_out", 92.5))
	mock.ExpectQuery(`(?is)SELECT id, cpu_usage, memory_usage, temperature, response_time FROM "devices"`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "cpu_usage", "memory_usage", "temperature", "response_time"}).
			AddRow(10, 20.0, 30.0, 40.0, 150.0))

	// evaluateDeviceConnectivity
	mock.ExpectQuery(`(?is)SELECT id, name, ip_address, status FROM "devices"`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "ip_address", "status"}).AddRow(10, "core-1", "10.0.0.1", "online"))
	mock.ExpectQuery(`(?is)SELECT \* FROM "alerts" WHERE device_id = \$1 AND category = \$2 AND status = \$3`).
		WillReturnError(gorm.ErrRecordNotFound)

	// Rule 1: response_time=150 > 100 -> 触发
	mock.ExpectQuery(`(?is)SELECT \* FROM "trigger_eval_states"`).WillReturnError(gorm.ErrRecordNotFound)
	mock.ExpectExec(`(?is)INSERT INTO "trigger_eval_states"`).WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectQuery(`(?is)SELECT \* FROM "alerts" WHERE rule_id = \$1 AND device_id = \$2`).WillReturnError(gorm.ErrRecordNotFound)
	mock.ExpectQuery(`(?is)SELECT \* FROM "alerts" WHERE rule_id = \$1 AND device_id = \$2`).WillReturnError(gorm.ErrRecordNotFound)
	mock.ExpectQuery(`(?is)INSERT INTO "alerts"`).WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(401))

	// Rule 2: if_utilization=92.5 >= 85 -> 触发
	mock.ExpectQuery(`(?is)SELECT \* FROM "trigger_eval_states"`).WillReturnError(gorm.ErrRecordNotFound)
	mock.ExpectExec(`(?is)INSERT INTO "trigger_eval_states"`).WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectQuery(`(?is)SELECT \* FROM "alerts" WHERE rule_id = \$1 AND device_id = \$2`).WillReturnError(gorm.ErrRecordNotFound)
	mock.ExpectQuery(`(?is)SELECT \* FROM "alerts" WHERE rule_id = \$1 AND device_id = \$2`).WillReturnError(gorm.ErrRecordNotFound)
	mock.ExpectQuery(`(?is)INSERT INTO "alerts"`).WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(402))

	// Rule 3 (nodata): 查 LOWER(metric_name) IN (...) 传入 response_time 别名集合（Take 追加 LIMIT $8），返回 60s 前，不触发断流
	mock.ExpectQuery(`(?is)SELECT MAX\(collected_at\) AS collected_at FROM "device_latest_metrics" WHERE device_id = \$1 AND LOWER\(metric_name\) IN \(\$2,\$3,\$4,\$5,\$6,\$7\)`).
		WithArgs(10, "response_time", "icmp_rtt", "icmp.rtt", "ping_rtt_ms", "latency", "rtt", 1).
		WillReturnRows(sqlmock.NewRows([]string{"collected_at"}).AddRow(now.Add(-60 * time.Second)))
	mock.ExpectQuery(`(?is)SELECT \* FROM "trigger_eval_states"`).WillReturnError(gorm.ErrRecordNotFound)
	mock.ExpectExec(`(?is)INSERT INTO "trigger_eval_states"`).WillReturnResult(sqlmock.NewResult(1, 1))

	created, _, err := eval.EvaluateAll(context.Background())
	if err != nil {
		t.Fatalf("EvaluateAll() error = %v", err)
	}
	if created != 2 {
		t.Fatalf("created = %d, want 2 (icmp_rtt snapshot + if_utilization aggregated; nodata should not fire)", created)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestEvaluator_DeviceGroupsFilterWithAncestorInheritance(t *testing.T) {
	db, mock, cleanup := newAlertsGormDBWithSQLMock(t)
	defer cleanup()

	now := time.Date(2026, 11, 24, 10, 0, 0, 0, time.UTC)
	eval := alerts.NewEvaluator(db, nil, nil, zap.NewNop())
	eval.SetNowFunc(func() time.Time { return now })

	// 规则仅适用分组 1（祖先分组）；设备 10 属于分组 3（3->2->1），设备 11 属于分组 4（不匹配），设备 12 无分组（不匹配）
	mock.ExpectQuery(`(?is)SELECT \* FROM "alert_rules" WHERE is_active = \$1`).
		WithArgs(true).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "category", "metric_name", "operator", "threshold_value", "duration", "device_groups", "severity", "is_active", "expression_mode"}).
			AddRow(5, "骨干分组CPU高", "performance", "cpu_usage", ">", 80.0, 0, `[1]`, "warning", true, "threshold"))

	mock.ExpectQuery(`(?is)SELECT id, group_id, name, device_type, ip_address, COALESCE\(topology_role, 'access'\) AS topology_role, status FROM "devices"`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "group_id", "name", "device_type", "ip_address", "topology_role", "status"}).
			AddRow(10, 3, "sw-in-child-group", "switch", "10.0.0.10", "access", "online").
			AddRow(11, 4, "sw-other-group", "switch", "10.0.0.11", "access", "online").
			AddRow(12, nil, "sw-no-group", "switch", "10.0.0.12", "access", "online"))

	mock.ExpectQuery(`(?is)FROM device_metrics`).
		WillReturnRows(sqlmock.NewRows([]string{"device_id", "metric_name", "metric_value"}).
			AddRow(10, "cpu_usage", 95.0).
			AddRow(11, "cpu_usage", 95.0).
			AddRow(12, "cpu_usage", 95.0))
	mock.ExpectQuery(`(?is)SELECT device_id, metric_name, metric_value FROM "device_latest_metrics"`).
		WillReturnRows(sqlmock.NewRows([]string{"device_id", "metric_name", "metric_value"}))
	mock.ExpectQuery(`(?is)SELECT device_id, metric_name, MAX\(metric_value\) AS metric_value FROM "device_latest_metrics"`).
		WillReturnRows(sqlmock.NewRows([]string{"device_id", "metric_name", "metric_value"}))
	mock.ExpectQuery(`(?is)SELECT id, cpu_usage, memory_usage, temperature, response_time FROM "devices"`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "cpu_usage", "memory_usage", "temperature", "response_time"}))

	// evaluateDeviceConnectivity
	mock.ExpectQuery(`(?is)SELECT id, name, ip_address, status FROM "devices"`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "ip_address", "status"}).
			AddRow(10, "sw-in-child-group", "10.0.0.10", "online").
			AddRow(11, "sw-other-group", "10.0.0.11", "online").
			AddRow(12, "sw-no-group", "10.0.0.12", "online"))
	for i := 0; i < 3; i++ {
		mock.ExpectQuery(`(?is)SELECT \* FROM "alerts" WHERE device_id = \$1 AND category = \$2 AND status = \$3`).
			WillReturnError(gorm.ErrRecordNotFound)
	}

	// 预加载一次 device_groups 父子映射（含 5->6->5 环路测试防环）
	mock.ExpectQuery(`(?is)SELECT id, parent_id FROM "device_groups"`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "parent_id"}).
			AddRow(1, nil).
			AddRow(2, 1).
			AddRow(3, 2).
			AddRow(4, nil).
			AddRow(5, 6).
			AddRow(6, 5))

	// 仅设备 10 命中触发评估并创建告警
	mock.ExpectQuery(`(?is)SELECT \* FROM "trigger_eval_states"`).WillReturnError(gorm.ErrRecordNotFound)
	mock.ExpectExec(`(?is)INSERT INTO "trigger_eval_states"`).WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectQuery(`(?is)SELECT \* FROM "alerts" WHERE rule_id = \$1 AND device_id = \$2`).WillReturnError(gorm.ErrRecordNotFound)
	mock.ExpectQuery(`(?is)SELECT \* FROM "alerts" WHERE rule_id = \$1 AND device_id = \$2`).WillReturnError(gorm.ErrRecordNotFound)
	mock.ExpectQuery(`(?is)INSERT INTO "alerts"`).WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(501))

	created, _, err := eval.EvaluateAll(context.Background())
	if err != nil {
		t.Fatalf("EvaluateAll() error = %v", err)
	}
	if created != 1 {
		t.Fatalf("created = %d, want 1 (only device 10 via ancestor group inheritance)", created)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}
