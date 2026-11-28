package monitoring_test

import (
	"context"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"go.uber.org/zap"

	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
)

func TestBuildDashboardV2Enrichment_ActiveProblemsIncludesOpenAndSuppressMetadata(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()

	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())
	now := time.Date(2026, 11, 24, 7, 0, 0, 0, time.UTC)
	snoozeUntil := now.Add(8 * time.Hour)
	metricCPU := "cpu_usage"
	curVal := 95.2
	threshVal := 90.0

	mock.ExpectQuery(`(?is)SELECT metric_name, severity, threshold_value FROM "alert_rules"`).
		WillReturnRows(sqlmock.NewRows([]string{"metric_name", "severity", "threshold_value"}))
	mock.ExpectQuery(`(?is)SELECT id, status, cpu_usage, memory_usage FROM "devices" WHERE is_active = \$1`).
		WithArgs(true).
		WillReturnRows(sqlmock.NewRows([]string{"id", "status", "cpu_usage", "memory_usage"}))
	mock.ExpectQuery(`(?is)SELECT \* FROM "monitor_maintenances" WHERE enabled = \$1`).
		WithArgs(true).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))
	mock.ExpectQuery(`(?is)SELECT .* FROM devices AS d LEFT JOIN device_groups AS dg ON dg\.id = d\.group_id WHERE d\.is_active = \$1`).
		WithArgs(true).
		WillReturnRows(sqlmock.NewRows([]string{"group_id", "group_name", "total_devices", "online_devices", "offline_devices", "warning_devices", "max_cpu", "max_memory"}))
	mock.ExpectQuery(`(?is)SELECT key, value FROM "system_settings"`).
		WillReturnRows(sqlmock.NewRows([]string{"key", "value"}))
	mock.ExpectQuery(`(?is)SELECT a\.title, a\.severity, a\.device_id, d\.name AS device_name, COALESCE\(a\.first_occurred, a\.created_at\) AS occurred_at FROM alerts AS a JOIN devices AS d ON d\.id = a\.device_id`).
		WillReturnRows(sqlmock.NewRows([]string{"title", "severity", "device_id", "device_name", "occurred_at"}))
	mock.ExpectQuery(`(?is)SELECT \* FROM "monitor_maintenances" WHERE enabled = \$1 AND schedule_type = \$2`).
		WithArgs(true, monitoring.MaintenanceScheduleOnce, sqlmock.AnyArg(), sqlmock.AnyArg(), 20).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))

	mock.ExpectQuery(`(?is)SELECT .* FROM alerts AS a JOIN devices AS d ON d\.id = a\.device_id WHERE d\.is_active = \$1 AND a\.status IN \('open', 'active', 'acknowledged'\) ORDER BY CASE WHEN LOWER\(a\.severity\) IN \('critical', 'fatal'\) THEN 1 WHEN LOWER\(a\.severity\) = 'high' THEN 2 WHEN LOWER\(a\.severity\) IN \('warning', 'medium'\) THEN 3 ELSE 4 END ASC, a\.last_occurred DESC, a\.id DESC LIMIT \$2`).
		WithArgs(true, 20).
		WillReturnRows(sqlmock.NewRows([]string{
			"alert_id", "device_id", "device_name", "title", "severity", "status",
			"metric_name", "current_value", "threshold_value", "last_occurred",
			"suppressed_by", "snoozed_until", "snooze_reason",
		}).
			AddRow(101, 10, "core-sw-01", "CPU 过高", "critical", "open", metricCPU, curVal, threshVal, now, "maintenance", snoozeUntil, "割接窗口").
			AddRow(102, 11, "agg-sw-02", "端口告警", "warning", "acknowledged", nil, nil, nil, now.Add(-5*time.Minute), "", nil, "夜间观察"))

	enrichment := writer.BuildDashboardV2Enrichment(
		context.Background(),
		now.Add(-time.Hour),
		now,
		nil,
		5*time.Minute,
		nil,
		false,
		true,
	)

	if len(enrichment.ActiveProblems) != 2 {
		t.Fatalf("len(ActiveProblems) = %d, want 2", len(enrichment.ActiveProblems))
	}
	first := enrichment.ActiveProblems[0]
	if first.AlertID != 101 || first.Status != "open" || first.SuppressedBy != "maintenance" || first.SnoozeReason != "割接窗口" {
		t.Fatalf("unexpected first active problem: %+v", first)
	}
	if first.SnoozedUntil == nil || !first.SnoozedUntil.Equal(snoozeUntil) {
		t.Fatalf("first.SnoozedUntil = %v, want %v", first.SnoozedUntil, snoozeUntil)
	}
	second := enrichment.ActiveProblems[1]
	if second.AlertID != 102 || second.Status != "acknowledged" || second.SnoozeReason != "夜间观察" {
		t.Fatalf("unexpected second active problem: %+v", second)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestBuildDashboardV2Enrichment_EmptyDeviceSliceSkipsGlobalActiveProblemsQuery(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()

	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())
	now := time.Date(2026, 11, 24, 7, 0, 0, 0, time.UTC)

	// ResolveGroupDeviceIDs 0 匹配应返回非 nil 空切片 []int{}
	mock.ExpectQuery(`(?is)SELECT id, parent_id FROM "device_groups"`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "parent_id"}).AddRow(99, nil))
	mock.ExpectQuery(`(?is)SELECT "id" FROM "devices" WHERE is_active = \$1 AND group_id IN \(\$2\)`).
		WithArgs(true, 99).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))

	resolved, err := writer.ResolveGroupDeviceIDs(context.Background(), 99, nil)
	if err != nil {
		t.Fatalf("ResolveGroupDeviceIDs() error = %v", err)
	}
	if resolved == nil || len(resolved) != 0 {
		t.Fatalf("ResolveGroupDeviceIDs() = %#v, want non-nil empty slice []int{}", resolved)
	}

	mock.ExpectQuery(`(?is)SELECT metric_name, severity, threshold_value FROM "alert_rules"`).
		WillReturnRows(sqlmock.NewRows([]string{"metric_name", "severity", "threshold_value"}))
	mock.ExpectQuery(`(?is)SELECT key, value FROM "system_settings"`).
		WillReturnRows(sqlmock.NewRows([]string{"key", "value"}))

	// 注意：此处刻意不设置 devices / monitor_maintenances / device_groups / alerts / ActiveProblems 的全库查询预期，
	// 由 sqlmock 严格守卫空分组短路不会触发任何全库业务查询。
	enrichment := writer.BuildDashboardV2Enrichment(
		context.Background(),
		now.Add(-time.Hour),
		now,
		resolved,
		5*time.Minute,
		nil,
		false,
		true,
	)

	if enrichment.ActiveProblems == nil || len(enrichment.ActiveProblems) != 0 {
		t.Fatalf("ActiveProblems = %#v, want empty slice", enrichment.ActiveProblems)
	}
	if len(enrichment.GroupSummaries) != 0 {
		t.Fatalf("GroupSummaries = %#v, want empty", enrichment.GroupSummaries)
	}
	if len(enrichment.Annotations) != 0 {
		t.Fatalf("Annotations = %#v, want empty", enrichment.Annotations)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestHostsAlerts_IncludeOpenStatusInDetailAndMatrix(t *testing.T) {
	t.Run("GetHostDetail 包含 open 状态告警", func(t *testing.T) {
		db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
		defer cleanup()

		writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())
		deviceID := 42
		now := time.Date(2026, 11, 24, 7, 0, 0, 0, time.UTC)

		rows := sqlmock.NewRows(hostDetailMockColumns()).AddRow(
			deviceID, "test-sw", "192.168.20.1", "test-sw", "SW-CORE-01",
			"switch", nil, "huawei", "S5700", "SN-1", "V200R001", nil,
			nil, "access", nil, "", "online",
			true, nil, nil, nil, nil,
			nil, nil, "online", "success", "",
			"", 0, nil, nil, 0,
		)
		mock.ExpectQuery(`SELECT\s+d\.id, d\.name, d\.ip_address, d\.hostname, d\.detected_sys_name`).
			WithArgs(deviceID, 1).
			WillReturnRows(rows)
		expectGetHostDetailSupportingQueries(mock, deviceID)

		mock.ExpectQuery(`(?is)SELECT id, title, severity, status, metric_name, current_value, threshold_value, first_occurred, last_occurred, snoozed_until FROM "alerts" WHERE device_id = \$1 AND status IN \('open', 'active', 'acknowledged'\) ORDER BY last_occurred DESC, id DESC`).
			WithArgs(deviceID).
			WillReturnRows(sqlmock.NewRows([]string{
				"id", "title", "severity", "status", "metric_name", "current_value", "threshold_value", "first_occurred", "last_occurred", "snoozed_until",
			}).AddRow(501, "设备温度告警", "warning", "open", "temperature", 78.5, 75.0, now, now, nil))

		detail, err := writer.GetHostDetail(context.Background(), deviceID, "", true, false, false)
		if err != nil {
			t.Fatalf("GetHostDetail() error = %v", err)
		}
		if len(detail.ActiveAlerts) != 1 || detail.ActiveAlerts[0].ID != 501 || detail.ActiveAlerts[0].Status != "open" {
			t.Fatalf("unexpected ActiveAlerts: %+v", detail.ActiveAlerts)
		}
		if detail.Device.ActiveAlertCount == nil || *detail.Device.ActiveAlertCount != 1 {
			t.Fatalf("ActiveAlertCount = %v, want 1", detail.Device.ActiveAlertCount)
		}
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Fatalf("sqlmock expectations not met: %v", err)
		}
	})

	t.Run("QueryHostsMatrix 统计与筛选包含 open 状态告警", func(t *testing.T) {
		db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
		defer cleanup()

		writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())

		mock.ExpectQuery(`(?is)SELECT count\(\*\) FROM devices AS d .* a\.status IN \('open', 'active', 'acknowledged'\)`).
			WithArgs(true).
			WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))

		rowCols := []string{
			"id", "name", "ip_address", "hostname", "detected_sys_name",
			"device_type", "vendor", "model", "group_id", "group_name",
			"status", "is_monitored", "cpu_usage", "memory_usage", "temperature",
			"uptime", "response_time", "last_seen", "icmp_status", "snmp_status",
			"cli_protocol", "last_error_code", "consecutive_failures", "backoff_until", "last_success_at",
			"last_duration_ms",
		}
		mock.ExpectQuery(`(?is)SELECT\s+d\.id, d\.name, d\.ip_address, d\.hostname, d\.detected_sys_name.*a\.status IN \('open', 'active', 'acknowledged'\).*a\.status IN \('open', 'active', 'acknowledged'\)`).
			WithArgs(true, 20).
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
		mock.ExpectQuery(`(?is)SELECT device_id,\s*COUNT\(\*\) AS total_cnt,.*FROM "alerts" WHERE device_id IN \(\$1\) AND status IN \('open', 'active', 'acknowledged'\) GROUP BY "device_id"`).
			WithArgs(7).
			WillReturnRows(sqlmock.NewRows([]string{"device_id", "total_cnt", "crit_cnt", "warn_cnt"}).AddRow(7, 3, 1, 2))

		res, err := writer.QueryHostsMatrix(context.Background(), monitoring.HostsMatrixFilter{
			ProblemOnly:   true,
			CanReadAlerts: true,
			Page:          1,
			PageSize:      20,
		})
		if err != nil {
			t.Fatalf("QueryHostsMatrix() error = %v", err)
		}
		if len(res.Items) != 1 {
			t.Fatalf("len(Items) = %d, want 1", len(res.Items))
		}
		item := res.Items[0]
		if item.ActiveAlertCount == nil || *item.ActiveAlertCount != 3 ||
			item.CriticalAlertCount == nil || *item.CriticalAlertCount != 1 ||
			item.WarningAlertCount == nil || *item.WarningAlertCount != 2 {
			t.Fatalf("unexpected alert counts on host matrix item: %+v", item)
		}
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Fatalf("sqlmock expectations not met: %v", err)
		}
	})
}
