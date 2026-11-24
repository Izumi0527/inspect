package monitoring_test

import (
	"context"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"go.uber.org/zap"

	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
)

func TestDashboardV2_LoadEffectiveThresholdsAndMaintenanceAnnotations(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()

	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())
	now := time.Date(2026, 11, 24, 12, 0, 0, 0, time.UTC)
	maintStart := now.Add(-30 * time.Minute)
	maintEnd := now.Add(30 * time.Minute)

	// 1. loadEffectiveThresholds：校验过滤 COALESCE(expression_mode, 'threshold') IN ('threshold', 'hysteresis') 与 ORDER BY id ASC
	mock.ExpectQuery(`(?is)SELECT metric_name, severity, threshold_value FROM "alert_rules" WHERE COALESCE\(is_active, true\) = true AND COALESCE\(expression_mode, 'threshold'\) IN \('threshold', 'hysteresis'\) AND metric_name IN \('cpu_usage', 'memory_usage', 'temperature'\) ORDER BY id ASC`).
		WillReturnRows(sqlmock.NewRows([]string{"metric_name", "severity", "threshold_value"}).
			AddRow("cpu_usage", "warning", 75.0).
			AddRow("cpu_usage", "critical", 92.0))

	// 2. queryHealthDistribution
	mock.ExpectQuery(`(?is)SELECT id, status, cpu_usage, memory_usage FROM "devices" WHERE is_active = \$1 AND id IN \(\$2\)`).
		WithArgs(true, 10).
		WillReturnRows(sqlmock.NewRows([]string{"id", "status", "cpu_usage", "memory_usage"}))
	mock.ExpectQuery(`(?is)SELECT \* FROM "monitor_maintenances" WHERE enabled = \$1`).
		WithArgs(true).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))

	// 3. queryGroupSummaries & queryMaskedNotificationChannels
	mock.ExpectQuery(`(?is)SELECT .* FROM devices AS d LEFT JOIN device_groups AS dg`).
		WillReturnRows(sqlmock.NewRows([]string{"group_id", "group_name", "total_devices", "online_devices", "offline_devices", "warning_devices", "max_cpu", "max_memory"}))
	mock.ExpectQuery(`(?is)SELECT key, value FROM "system_settings"`).
		WillReturnRows(sqlmock.NewRows([]string{"key", "value"}))

	// 4. queryDashboardAnnotations：canReadAlerts=false 时不查 alerts，但必须查询 [startTime, endTime] 内启用中的 once 维护窗口，且按 deviceIDs + 祖先分组过滤
	mock.ExpectQuery(`(?is)SELECT \* FROM "monitor_maintenances" WHERE enabled = \$1 AND schedule_type = \$2 AND end_time >= \$3 AND start_time <= \$4 ORDER BY start_time DESC, id DESC LIMIT \$5`).
		WithArgs(true, monitoring.MaintenanceScheduleOnce, now.Add(-time.Hour), now, 20).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "mode", "schedule_type", "start_time", "end_time", "timezone", "enabled"}).
			AddRow(int64(11), "核心割接", "collect_silence", "once", maintStart, maintEnd, "Asia/Shanghai", true).
			AddRow(int64(12), "无关机房割接", "collect_silence", "once", maintStart, maintEnd, "Asia/Shanghai", true))
	mock.ExpectQuery(`(?is)SELECT \* FROM "monitor_maintenance_targets" WHERE maintenance_id IN \(\$1,\$2\)`).
		WithArgs(int64(11), int64(12)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "maintenance_id", "target_type", "target_id"}).
			AddRow(int64(1), int64(11), "device_group", int64(1)).
			AddRow(int64(2), int64(12), "device_group", int64(99)))
	mock.ExpectQuery(`(?is)SELECT id, group_id FROM "devices" WHERE id IN \(\$1\)`).
		WithArgs(10).
		WillReturnRows(sqlmock.NewRows([]string{"id", "group_id"}).AddRow(10, 3))
	mock.ExpectQuery(`(?is)SELECT id, parent_id FROM "device_groups"`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "parent_id"}).
			AddRow(1, nil).
			AddRow(2, 1).
			AddRow(3, 2))

	enrichment := writer.BuildDashboardV2Enrichment(
		context.Background(),
		now.Add(-time.Hour),
		now,
		[]int{10},
		5*time.Minute,
		nil,
		false,
		false,
	)

	if enrichment.Thresholds.CPU.Warn != 75.0 || enrichment.Thresholds.CPU.Crit != 92.0 {
		t.Fatalf("unexpected CPU thresholds: %+v", enrichment.Thresholds.CPU)
	}
	if len(enrichment.Annotations) != 1 {
		t.Fatalf("len(Annotations) = %d, want 1", len(enrichment.Annotations))
	}
	ann := enrichment.Annotations[0]
	if ann.Type != "maintenance" || ann.Title != "计划维护：核心割接" || ann.Timestamp != maintStart.UTC().Format(time.RFC3339) {
		t.Fatalf("unexpected maintenance annotation: %+v", ann)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestQueryHostsMatrix_MaintenanceStatusFilterIncludesActiveMaintenanceDevices(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()

	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())
	now := time.Now().UTC()

	// 1. GetActiveMaintenanceMapForDevices 返回设备 7 处于活跃维护
	mock.ExpectQuery(`(?is)SELECT \* FROM "monitor_maintenances" WHERE enabled = \$1`).
		WithArgs(true).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "mode", "schedule_type", "start_time", "end_time", "timezone", "enabled"}).
			AddRow(int64(21), "夜间维护", "collect_silence", "once", now.Add(-time.Hour), now.Add(time.Hour), "Asia/Shanghai", true))
	mock.ExpectQuery(`(?is)SELECT \* FROM "monitor_maintenance_targets" WHERE maintenance_id IN \(\$1\)`).
		WithArgs(int64(21)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "maintenance_id", "target_type", "target_id"}).
			AddRow(int64(1), int64(21), "device", int64(7)))
	mock.ExpectQuery(`(?is)SELECT id, group_id FROM "devices" WHERE is_active = \$1`).
		WithArgs(true).
		WillReturnRows(sqlmock.NewRows([]string{"id", "group_id"}).AddRow(7, nil))
	mock.ExpectQuery(`(?is)SELECT id, parent_id FROM "device_groups"`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "parent_id"}))

	// 2. Count & List SQL 必须包含 (LOWER(d.status) = 'maintenance' OR d.id IN ($2))
	mock.ExpectQuery(`(?is)SELECT count\(\*\) FROM devices AS d .* WHERE d\.is_active = \$1 AND \(+LOWER\(d\.status\) = 'maintenance' OR d\.id IN \(\$2\)\)+`).
		WithArgs(true, 7).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))

	rowCols := []string{
		"id", "name", "ip_address", "hostname", "detected_sys_name",
		"device_type", "vendor", "model", "group_id", "group_name",
		"status", "is_monitored", "cpu_usage", "memory_usage", "temperature",
		"uptime", "response_time", "last_seen", "icmp_status", "snmp_status",
		"cli_protocol", "last_error_code", "consecutive_failures", "backoff_until", "last_success_at",
		"last_duration_ms",
	}
	mock.ExpectQuery(`(?is)SELECT\s+d\.id, d\.name, d\.ip_address.*WHERE d\.is_active = \$1 AND \(+LOWER\(d\.status\) = 'maintenance' OR d\.id IN \(\$2\)\)+`).
		WithArgs(true, 7, 20).
		WillReturnRows(sqlmock.NewRows(rowCols).AddRow(
			7, "core-sw", "10.0.0.1", "core-sw", "SW-CORE-07",
			"switch", "huawei", "S5700", nil, "",
			"online", true, nil, nil, nil,
			nil, nil, nil, "online", "success",
			"", "", 0, nil, nil,
			0,
		))

	mock.ExpectQuery(`SELECT \* FROM "monitor_maintenances" WHERE enabled = \$1`).
		WithArgs(true).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))
	mock.ExpectQuery(`SELECT device_id, name, alias, is_up FROM "device_interfaces"`).
		WithArgs(7, true).
		WillReturnRows(sqlmock.NewRows([]string{"device_id", "name", "alias", "is_up"}))
	mock.ExpectQuery(`SELECT device_id, metric_value FROM "device_latest_metrics"`).
		WithArgs(7).
		WillReturnRows(sqlmock.NewRows([]string{"device_id", "metric_value"}))
	mock.ExpectQuery(`FROM device_metrics`).
		WithArgs(7, 12).
		WillReturnRows(sqlmock.NewRows([]string{"device_id", "collected_at", "metric_value"}))

	res, err := writer.QueryHostsMatrix(context.Background(), monitoring.HostsMatrixFilter{
		Status:   "maintenance",
		Page:     1,
		PageSize: 20,
	})
	if err != nil {
		t.Fatalf("QueryHostsMatrix(status=maintenance) error = %v", err)
	}
	if res.Total != 1 || len(res.Items) != 1 || res.Items[0].ID != 7 {
		t.Fatalf("unexpected result: %+v", res)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}
