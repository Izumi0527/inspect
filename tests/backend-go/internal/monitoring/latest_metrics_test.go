package monitoring_test

import (
	"context"
	"database/sql/driver"
	"errors"
	"fmt"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"go.uber.org/zap"
	"gorm.io/gorm/schema"

	"github.com/your-org/inspect-system/backend-go/internal/config"
	appdb "github.com/your-org/inspect-system/backend-go/internal/db"
	"github.com/your-org/inspect-system/backend-go/internal/devices"
	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
)

func TestLatestMetrics_SchemaModelsAndConstraints(t *testing.T) {
	cacheStore := &sync.Map{}
	namer := schema.NamingStrategy{}

	latestSchema, err := schema.Parse(&monitoring.DeviceLatestMetric{}, cacheStore, namer)
	if err != nil {
		t.Fatalf("parse DeviceLatestMetric schema: %v", err)
	}
	if latestSchema.Table != "device_latest_metrics" {
		t.Fatalf("table = %q, want device_latest_metrics", latestSchema.Table)
	}
	if len(latestSchema.PrimaryFields) != 3 {
		t.Fatalf("DeviceLatestMetric PK fields = %d, want 3 (device_id, metric_name, interface_name)", len(latestSchema.PrimaryFields))
	}
	if len(latestSchema.ParseIndexes()) < 2 {
		t.Fatalf("expected at least 2 indexes on DeviceLatestMetric, got %d", len(latestSchema.ParseIndexes()))
	}

	stateSchema, err := schema.Parse(&monitoring.DeviceCollectionState{}, cacheStore, namer)
	if err != nil {
		t.Fatalf("parse DeviceCollectionState schema: %v", err)
	}
	if stateSchema.Table != "device_collection_states" {
		t.Fatalf("table = %q, want device_collection_states", stateSchema.Table)
	}
	if len(stateSchema.PrimaryFields) != 1 || stateSchema.PrimaryFields[0].DBName != "device_id" {
		t.Fatalf("DeviceCollectionState PK = %+v, want [device_id]", stateSchema.PrimaryFields)
	}

	pinnedSchema, err := schema.Parse(&monitoring.UserPinnedDevice{}, cacheStore, namer)
	if err != nil {
		t.Fatalf("parse UserPinnedDevice schema: %v", err)
	}
	if pinnedSchema.Table != "user_pinned_devices" {
		t.Fatalf("table = %q, want user_pinned_devices", pinnedSchema.Table)
	}
	if len(pinnedSchema.PrimaryFields) != 2 {
		t.Fatalf("UserPinnedDevice PK count = %d, want 2", len(pinnedSchema.PrimaryFields))
	}
	userIDField := pinnedSchema.LookUpField("user_id")
	if userIDField == nil || !strings.Contains(strings.ToLower(string(userIDField.DataType)), "varchar(36)") {
		t.Fatalf("user_pinned_devices.user_id type = %v, want varchar(36)", userIDField)
	}

	ifaceSchema, err := schema.Parse(&devices.DeviceInterface{}, cacheStore, namer)
	if err != nil {
		t.Fatalf("parse DeviceInterface schema: %v", err)
	}
	requiredIfaceCols := []string{
		"admin_up", "duplex_status", "in_errors", "out_errors", "in_discards", "out_discards",
		"in_error_rate", "out_error_rate", "utilization_in", "utilization_out", "speed_unknown",
		"flap_count_1h", "last_status_change_at", "lld_monitored", "lld_lost_since",
	}
	for _, col := range requiredIfaceCols {
		if ifaceSchema.LookUpField(col) == nil {
			t.Fatalf("device_interfaces missing column %q", col)
		}
	}

	devSchema, err := schema.Parse(&devices.Device{}, cacheStore, namer)
	if err != nil {
		t.Fatalf("parse Device schema: %v", err)
	}
	roleField := devSchema.LookUpField("topology_role")
	if roleField == nil || roleField.DefaultValue != "access" {
		t.Fatalf("devices.topology_role missing or default != access: %+v", roleField)
	}
}

func TestLatestMetrics_UpsertLatestMetrics_PrevValueAndRepeatWrite(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()
	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())

	v1 := 42.0
	v2 := 58.5
	unit := "%"
	t1 := time.Date(2026, 11, 20, 10, 0, 0, 0, time.UTC)
	t2 := t1.Add(5 * time.Minute)

	// 两次单独写入同一主键，验证 SQL 包含 ON CONFLICT 与 prev_value = device_latest_metrics.metric_value
	for _, tc := range []struct {
		val float64
		ts  time.Time
	}{
		{v1, t1},
		{v2, t2},
	} {
		mock.ExpectExec(`(?is)INSERT INTO device_latest_metrics .* ON CONFLICT \(device_id, metric_name, interface_name\) DO UPDATE SET .* prev_value = device_latest_metrics\.metric_value, metric_value = EXCLUDED\.metric_value`).
			WithArgs(1, "cpu_usage", "", "cpu_usage", "system", tc.val, nil, nil, unit, tc.ts, sqlmock.AnyArg()).
			WillReturnResult(sqlmock.NewResult(0, 1))

		val := tc.val
		err := writer.UpsertLatestMetrics(context.Background(), []monitoring.DeviceLatestMetric{{
			DeviceID:      1,
			MetricName:    "cpu_usage",
			InterfaceName: "",
			MetricValue:   &val,
			MetricUnit:    &unit,
			CollectedAt:   tc.ts,
		}})
		if err != nil {
			t.Fatalf("UpsertLatestMetrics(%v) error = %v", tc.val, err)
		}
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestLatestMetrics_UpsertLatestMetrics_Splits1200RowsAndDeduplicates(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()
	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())

	now := time.Date(2026, 11, 20, 12, 0, 0, 0, time.UTC)
	points := make([]monitoring.DeviceLatestMetric, 0, 1205)
	for i := 0; i < 1200; i++ {
		val := float64(i)
		points = append(points, monitoring.DeviceLatestMetric{
			DeviceID:      1,
			MetricName:    fmt.Sprintf("custom_metric_%04d", i),
			InterfaceName: "",
			MetricValue:   &val,
			CollectedAt:   now,
		})
	}
	// 同批追加 5 条重复主键（时间更新），必须去重保留最新值，最终仍为 1200 行 -> 3 批 (500/500/200)
	for i := 0; i < 5; i++ {
		val := float64(9000 + i)
		points = append(points, monitoring.DeviceLatestMetric{
			DeviceID:      1,
			MetricName:    fmt.Sprintf("custom_metric_%04d", i),
			InterfaceName: "",
			MetricValue:   &val,
			CollectedAt:   now.Add(time.Minute),
		})
	}

	batchSizes := []int{}
	mock.ExpectBegin()
	for _, wantRows := range []int{500, 500, 200} {
		wantArgs := wantRows * 11
		args := make([]driver.Value, wantArgs)
		for i := range args {
			args[i] = sqlmock.AnyArg()
		}
		batchSizes = append(batchSizes, wantRows)
		mock.ExpectExec(`(?is)INSERT INTO device_latest_metrics .* ON CONFLICT \(device_id, metric_name, interface_name\) DO UPDATE SET`).
			WithArgs(args...).
			WillReturnResult(sqlmock.NewResult(0, int64(wantRows)))
	}
	mock.ExpectCommit()

	if err := writer.UpsertLatestMetrics(context.Background(), points); err != nil {
		t.Fatalf("UpsertLatestMetrics(1205) error = %v", err)
	}
	if len(batchSizes) != 3 || batchSizes[0] != 500 || batchSizes[1] != 500 || batchSizes[2] != 200 {
		t.Fatalf("batchSizes = %v, want [500 500 200]", batchSizes)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestLatestMetrics_WriteDeviceMetrics_SkipsUnmonitoredLLDInterfaces(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()
	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())

	now := time.Date(2026, 11, 20, 12, 5, 0, 0, time.UTC)
	cpu := 22.5
	collectedAt := monitoring.FlexibleTime{Time: now}

	mock.ExpectQuery(`SELECT id FROM "devices" WHERE id = \$1 LIMIT \$2`).
		WithArgs(5, 1).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(5))

	mock.ExpectBegin()
	mock.ExpectExec(`CREATE SEQUENCE IF NOT EXISTS device_metrics_id_seq`).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectExec(`INSERT INTO device_metrics`).WillReturnResult(sqlmock.NewResult(0, 1))
	// 设备级快照 1 行
	mock.ExpectExec(`INSERT INTO device_latest_metrics`).
		WithArgs(5, "cpu_usage", "", "cpu_usage", "system", cpu, nil, nil, "%", now, sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(`UPDATE "devices" SET "cpu_usage"`).WillReturnResult(sqlmock.NewResult(0, 1))

	// 接口 SAVEPOINT：if1 为纳管（lld_monitored=true），if2 为未纳管（lld_monitored=false）
	mock.ExpectExec(`SAVEPOINT`).WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectQuery(`(?is)SELECT name, speed, is_up, admin_up, duplex_status, in_errors, out_errors, flap_count_1h, last_status_change_at, last_updated, lld_monitored FROM "device_interfaces" WHERE device_id = \$1`).
		WithArgs(5).
		WillReturnRows(sqlmock.NewRows([]string{
			"name", "speed", "is_up", "admin_up", "duplex_status", "in_errors", "out_errors",
			"flap_count_1h", "last_status_change_at", "last_updated", "lld_monitored",
		}).
			AddRow("if1", int64(1000), true, true, "full_duplex", int64(0), int64(0), 0, nil, now.Add(-5*time.Minute), true).
			AddRow("if2", int64(1000), true, true, "unknown", int64(0), int64(0), 0, nil, now.Add(-5*time.Minute), false))

	mock.ExpectExec(`INSERT INTO device_interfaces`).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(`INSERT INTO device_interfaces`).WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(`CREATE SEQUENCE IF NOT EXISTS interface_metrics_id_seq`).WillReturnResult(sqlmock.NewResult(0, 0))
	// interface_metrics 写入两个接口（各 2 条指标：if_in_errors + if_flap_count_1h = 4 条）
	mock.ExpectExec(`INSERT INTO interface_metrics`).WillReturnResult(sqlmock.NewResult(0, 4))
	// device_latest_metrics 仅写入 lld_monitored=true 的 if1（2 条指标 * 11 参数 = 22 参数），绝不写 if2！
	onlyIf1Args := make([]driver.Value, 2*11)
	for i := range onlyIf1Args {
		onlyIf1Args[i] = sqlmock.AnyArg()
	}
	mock.ExpectExec(`(?is)INSERT INTO device_latest_metrics .* ON CONFLICT \(device_id, metric_name, interface_name\) DO UPDATE SET`).
		WithArgs(onlyIf1Args...).
		WillReturnResult(sqlmock.NewResult(0, 2))
	mock.ExpectCommit()

	res, err := writer.WriteDeviceMetrics(context.Background(), monitoring.DeviceMetricsRequest{
		DeviceID:    5,
		CollectedAt: &collectedAt,
		Metrics:     map[string]monitoring.MetricValue{"cpu_usage": {Value: &cpu}},
		Interfaces: []map[string]interface{}{
			{"name": "if1", "is_up": true, "if_in_errors": 12},
			{"name": "if2", "is_up": true, "if_in_errors": 99},
		},
	})
	if err != nil {
		t.Fatalf("WriteDeviceMetrics() error = %v", err)
	}
	if res.InterfaceMetrics != 4 {
		t.Fatalf("InterfaceMetrics = %d, want 4", res.InterfaceMetrics)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestLatestMetrics_EnsureTimescaleCompressionAndRetention(t *testing.T) {
	t.Run("disabled flag skips cleanly", func(t *testing.T) {
		db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
		defer cleanup()

		err := appdb.EnsureTimescaleCompressionAndRetention(db, config.Config{TimescaleEnabled: false})
		if err != nil {
			t.Fatalf("unexpected error: %v", err)
		}
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Fatal(err)
		}
	})

	t.Run("plain postgres without timescaledb extension skips gracefully", func(t *testing.T) {
		db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
		defer cleanup()

		for _, tbl := range []string{"device_metrics", "interface_metrics"} {
			mock.ExpectQuery(`SELECT COUNT\(\*\) FROM timescaledb_information\.hypertables`).
				WithArgs(tbl).
				WillReturnError(errors.New(`ERROR: schema "timescaledb_information" does not exist`))
		}

		err := appdb.EnsureTimescaleCompressionAndRetention(db, config.Config{TimescaleEnabled: true})
		if err != nil {
			t.Fatalf("expected graceful skip on plain postgres, got: %v", err)
		}
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Fatal(err)
		}
	})

	t.Run("non-hypertable skips gracefully", func(t *testing.T) {
		db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
		defer cleanup()

		for _, tbl := range []string{"device_metrics", "interface_metrics"} {
			mock.ExpectQuery(`SELECT COUNT\(\*\) FROM timescaledb_information\.hypertables`).
				WithArgs(tbl).
				WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
		}

		err := appdb.EnsureTimescaleCompressionAndRetention(db, config.Config{TimescaleEnabled: true})
		if err != nil {
			t.Fatalf("expected graceful skip for non-hypertable, got: %v", err)
		}
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Fatal(err)
		}
	})

	t.Run("hypertables apply 7d compression and 90d retention idempotently", func(t *testing.T) {
		db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
		defer cleanup()

		for _, tbl := range []string{"device_metrics", "interface_metrics"} {
			mock.ExpectQuery(`SELECT COUNT\(\*\) FROM timescaledb_information\.hypertables`).
				WithArgs(tbl).
				WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))
			mock.ExpectExec(fmt.Sprintf(`(?is)ALTER TABLE %s SET \(timescaledb\.compress`, tbl)).
				WillReturnResult(sqlmock.NewResult(0, 0))
			mock.ExpectExec(fmt.Sprintf(`(?is)SELECT add_compression_policy\('%s', INTERVAL '7 days', if_not_exists => TRUE\)`, tbl)).
				WillReturnResult(sqlmock.NewResult(0, 0))
			mock.ExpectExec(fmt.Sprintf(`(?is)SELECT add_retention_policy\('%s', INTERVAL '90 days', if_not_exists => TRUE\)`, tbl)).
				WillReturnResult(sqlmock.NewResult(0, 0))
		}

		err := appdb.EnsureTimescaleCompressionAndRetention(db, config.Config{TimescaleEnabled: true})
		if err != nil {
			t.Fatalf("EnsureTimescaleCompressionAndRetention() error = %v", err)
		}
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Fatal(err)
		}
	})
}
