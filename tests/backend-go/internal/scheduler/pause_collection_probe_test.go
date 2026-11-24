package scheduler_test

import (
	"context"
	"sync/atomic"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"go.uber.org/zap"
	"gorm.io/datatypes"

	"github.com/your-org/inspect-system/backend-go/internal/devices"
	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
	"github.com/your-org/inspect-system/backend-go/internal/scheduler"
)

// 处于 pause_collection 维护窗口的设备，必须在 Step 1 BatchProbeDevices 前被剔除，
// 既不发 ICMP/SNMP 探活请求，也计入 metrics_skipped。
func TestDeviceInspection_SkipsProbeInStep1DuringPauseCollectionMaintenance(t *testing.T) {
	db, mock, cleanup := newSchedulerGormDBWithSQLMock(t)
	defer cleanup()

	now := time.Now().UTC()

	// 设备 7 活跃
	mock.ExpectQuery(`(?is)^SELECT \* FROM "devices" WHERE is_active = \$1$`).
		WithArgs(true).
		WillReturnRows(blackholeDeviceRows(161))

	// partitionDevicesByBackoff 加载 device_collection_states
	mock.ExpectQuery(`(?is)FROM "device_collection_states"`).
		WillReturnRows(sqlmock.NewRows([]string{"device_id"}))

	// Step 1 前 filterPauseCollectionDevices 命中 pause_collection 维护窗口
	mock.ExpectQuery(`(?is)SELECT \* FROM "monitor_maintenances" WHERE enabled = \$1`).
		WithArgs(true).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "mode", "schedule_type", "start_time", "end_time", "timezone", "enabled"}).
			AddRow(int64(1), "暂停采集割接", "pause_collection", "once", now.Add(-time.Hour), now.Add(time.Hour), "Asia/Shanghai", true))
	mock.ExpectQuery(`(?is)SELECT \* FROM "monitor_maintenance_targets" WHERE maintenance_id IN \(\$1\)`).
		WithArgs(int64(1)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "maintenance_id", "target_type", "target_id"}).
			AddRow(int64(1), int64(1), "device", int64(7)))
	mock.ExpectQuery(`(?is)SELECT id, group_id FROM "devices" WHERE is_active = \$1`).
		WithArgs(true).
		WillReturnRows(sqlmock.NewRows([]string{"id", "group_id"}).AddRow(7, nil))
	mock.ExpectQuery(`(?is)SELECT id, parent_id FROM "device_groups"`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "parent_id"}))

	var probedCalls atomic.Int64
	probeSvc := devices.NewProbeServiceWithProbers(
		zap.NewNop(),
		func(ctx context.Context, ip string) (bool, *float64, *string) {
			probedCalls.Add(1)
			return true, nil, nil
		},
		func(ctx context.Context, ip string, community *string, version *string, port *int, tags interface{}) (bool, *float64, *string, *string) {
			probedCalls.Add(1)
			return true, nil, nil, nil
		},
	)

	svc := scheduler.NewService(
		db,
		zap.NewNop(),
		devices.NewService(db, zap.NewNop()),
		probeSvc,
		nil,
		devices.NewSNMPCollector(zap.NewNop()),
		monitoring.NewMetricsWriter(db, nil, zap.NewNop()),
		nil, nil, nil, "", nil, nil, nil,
	)

	task := scheduler.ScheduledTask{
		ID:       "metrics_collection",
		TaskType: "device_inspection",
		Enabled:  true,
		Config:   datatypes.JSON(`{"check_connectivity":true,"collect_metrics":true}`),
	}
	res, err := executeDeviceInspection(svc, context.Background(), task)
	if err != nil {
		t.Fatalf("executeDeviceInspection() error = %v", err)
	}
	if got := probedCalls.Load(); got != 0 {
		t.Fatalf("pause_collection 维护期设备在 Step 1 仍触发了 %d 次探活请求，期望 0 次", got)
	}
	if skipped, _ := res["metrics_skipped"].(int); skipped != 1 {
		t.Fatalf("metrics_skipped = %v, want 1", res["metrics_skipped"])
	}
	if inspected, _ := res["inspected_count"].(int); inspected != 0 {
		t.Fatalf("inspected_count = %v, want 0", res["inspected_count"])
	}
}
