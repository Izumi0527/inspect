package scheduler_test

import (
	"context"
	"testing"
	"time"
	_ "unsafe"

	"github.com/DATA-DOG/go-sqlmock"
	"go.uber.org/zap"

	"github.com/your-org/inspect-system/backend-go/internal/scheduler"
)

//go:linkname cleanupMetricsTables github.com/your-org/inspect-system/backend-go/internal/scheduler.(*Service).cleanupMetricsTables
func cleanupMetricsTables(s *scheduler.Service, ctx context.Context, before time.Time) (map[string]int64, error)

// 数据清理任务必须按保留期清掉过期的接口时序 interface_metrics：它是采集写入量最大的表之一，
// 此前只由流量分析模块的 CleanupData 顺带清理，模块删除后要并入通用的指标表清理，否则会无限增长。
func TestCleanupMetricsTables_PrunesInterfaceMetrics(t *testing.T) {
	db, mock, cleanup := newSchedulerGormDBWithSQLMock(t)
	defer cleanup()
	svc := scheduler.NewService(db, zap.NewNop(), nil, nil, nil, nil, nil, nil, nil, nil, "", nil, nil, nil)
	before := time.Date(2026, 10, 9, 0, 0, 0, 0, time.UTC)

	for _, table := range []string{"device_metrics", "system_metrics", "device_status_history"} {
		mock.ExpectQuery(`(?is)SELECT EXISTS .*information_schema\.tables`).
			WithArgs(table).
			WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(false))
	}
	mock.ExpectQuery(`(?is)SELECT EXISTS .*information_schema\.tables`).
		WithArgs("interface_metrics").
		WillReturnRows(sqlmock.NewRows([]string{"exists"}).AddRow(true))
	mock.ExpectExec(`(?is)^DELETE FROM "interface_metrics" WHERE collected_at < \$1$`).
		WithArgs(before).
		WillReturnResult(sqlmock.NewResult(0, 42))

	results, err := cleanupMetricsTables(svc, context.Background(), before)
	if err != nil {
		t.Fatalf("cleanupMetricsTables() error = %v", err)
	}
	if results["interface_metrics_deleted"] != 42 {
		t.Fatalf("interface_metrics_deleted = %d，want 42（结果键沿用原流量清理的命名）", results["interface_metrics_deleted"])
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("清理应覆盖 interface_metrics：%v", err)
	}
}
