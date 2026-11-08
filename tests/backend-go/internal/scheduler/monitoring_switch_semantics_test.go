package scheduler_test

import (
	"context"
	"errors"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"go.uber.org/zap"

	"github.com/your-org/inspect-system/backend-go/internal/devices"
	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
	"github.com/your-org/inspect-system/backend-go/internal/scheduler"
)

// 监控服务的「运行中」只有一个真实来源：采集任务是否启用。monitoring 包不能反向依赖 scheduler，
// 所以任务 ID 在两边各有一份常量，由本用例跨包钉住，改任何一侧都会在这里失败。
func TestMonitoringServiceStats_TaskIDMatchesScheduler(t *testing.T) {
	if monitoring.MetricsCollectionTaskID != scheduler.MetricsCollectionTaskID {
		t.Fatalf("monitoring.MetricsCollectionTaskID = %q, scheduler.MetricsCollectionTaskID = %q，两者必须一致",
			monitoring.MetricsCollectionTaskID, scheduler.MetricsCollectionTaskID)
	}
}

// is_running 取采集任务的启用状态、monitor_interval 取真实采集节奏（300 秒），
// 不再读取从未被调度器消费的系统设置 monitoring_service_enabled / monitoring_service_interval。
func TestMonitoringServiceStats_ReportsCollectionTaskState(t *testing.T) {
	db, mock, cleanup := newSchedulerGormDBWithSQLMock(t)
	defer cleanup()
	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())

	mock.ExpectQuery(`(?is)^SELECT "enabled" FROM "scheduled_tasks" WHERE id = \$1 LIMIT \$2$`).
		WithArgs(scheduler.MetricsCollectionTaskID, 1).
		WillReturnRows(sqlmock.NewRows([]string{"enabled"}).AddRow(false))
	mock.ExpectQuery(`(?is)^SELECT count\(\*\) FROM "devices"$`).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(3))
	mock.ExpectQuery(`(?is)^SELECT count\(\*\) FROM "devices" WHERE is_active = \$1$`).
		WithArgs(true).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(2))
	mock.ExpectQuery(`(?is)^SELECT count\(\*\) FROM "devices" WHERE is_active = \$1 AND is_monitored = \$2$`).
		WithArgs(true, true).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))
	// 存储连通性探活必须真的发出查询（GORM 的 Raw 只拼语句，不接 Scan 等结束方法就不会执行）
	mock.ExpectQuery(`(?is)^SELECT 1$`).
		WillReturnRows(sqlmock.NewRows([]string{"?column?"}).AddRow(1))

	stats, err := writer.GetMonitoringServiceStats(context.Background())
	if err != nil {
		t.Fatalf("GetMonitoringServiceStats() error = %v", err)
	}
	if stats.IsRunning {
		t.Fatalf("IsRunning = true，采集任务已停用时应为 false")
	}
	wantInterval := int(scheduler.MetricsCollectionInterval.Seconds())
	if stats.MonitorInterval != wantInterval {
		t.Fatalf("MonitorInterval = %d，want 真实采集节奏 %d 秒", stats.MonitorInterval, wantInterval)
	}
	if stats.TotalDevices != 3 || stats.ActiveDevices != 2 || stats.MonitoringTasks != 1 {
		t.Fatalf("counts = %d/%d/%d，want 3/2/1", stats.TotalDevices, stats.ActiveDevices, stats.MonitoringTasks)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

// 采集任务缺失（例如尚未 seed）时如实报告未运行，而不是兜底成「运行中」。
func TestMonitoringServiceStats_MissingCollectionTaskReportsNotRunning(t *testing.T) {
	db, mock, cleanup := newSchedulerGormDBWithSQLMock(t)
	defer cleanup()
	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())

	mock.ExpectQuery(`(?is)^SELECT "enabled" FROM "scheduled_tasks" WHERE id = \$1 LIMIT \$2$`).
		WithArgs(scheduler.MetricsCollectionTaskID, 1).
		WillReturnRows(sqlmock.NewRows([]string{"enabled"}))
	mock.ExpectQuery(`(?is)^SELECT count\(\*\) FROM "devices"`).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery(`(?is)^SELECT count\(\*\) FROM "devices"`).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery(`(?is)^SELECT count\(\*\) FROM "devices"`).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery(`(?is)^SELECT 1$`).
		WillReturnRows(sqlmock.NewRows([]string{"?column?"}).AddRow(1))

	stats, err := writer.GetMonitoringServiceStats(context.Background())
	if err != nil {
		t.Fatalf("GetMonitoringServiceStats() error = %v", err)
	}
	if stats.IsRunning {
		t.Fatalf("IsRunning = true，采集任务不存在时应为 false")
	}
}

// is_monitored 的真实语义是「告警静默」：告警评估器按它过滤（见 alerts 包测试），
// 但采集任务的设备来源 ListActiveDevices 只看 is_active —— 静默的设备照常探测与采集。
func TestCollectionDeviceList_IgnoresAlertMuteFlag(t *testing.T) {
	db, mock, cleanup := newSchedulerGormDBWithSQLMock(t)
	defer cleanup()
	svc := devices.NewService(db, zap.NewNop())

	mock.ExpectQuery(`(?is)^SELECT \* FROM "devices" WHERE is_active = \$1$`).
		WithArgs(true).
		WillReturnRows(sqlmock.NewRows([]string{"id", "is_monitored"}).AddRow(9, false))

	rows, err := svc.ListActiveDevices(context.Background())
	if err != nil {
		t.Fatalf("ListActiveDevices() error = %v", err)
	}
	if len(rows) != 1 || rows[0].ID != 9 {
		t.Fatalf("rows = %+v，告警静默（is_monitored=false）的设备仍应进入采集列表", rows)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

// 存储探活失败时必须如实报告未连接（修复前探活从未执行，恒为已连接）。
func TestMonitoringServiceStats_StorageProbeFailureReportsDisconnected(t *testing.T) {
	db, mock, cleanup := newSchedulerGormDBWithSQLMock(t)
	defer cleanup()
	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())

	mock.ExpectQuery(`(?is)^SELECT "enabled" FROM "scheduled_tasks"`).
		WillReturnRows(sqlmock.NewRows([]string{"enabled"}).AddRow(true))
	for i := 0; i < 3; i++ {
		mock.ExpectQuery(`(?is)^SELECT count\(\*\) FROM "devices"`).
			WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	}
	mock.ExpectQuery(`(?is)^SELECT 1$`).
		WillReturnError(errors.New("connection reset by peer"))

	stats, err := writer.GetMonitoringServiceStats(context.Background())
	if err == nil {
		t.Fatalf("GetMonitoringServiceStats() error = nil，探活失败时应返回错误")
	}
	if stats.MetricsStoreConnected {
		t.Fatalf("MetricsStoreConnected = true，探活失败时应为 false")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}
