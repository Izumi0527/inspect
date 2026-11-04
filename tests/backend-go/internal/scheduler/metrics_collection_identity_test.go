package scheduler_test

import (
	"context"
	"strings"
	"testing"
	"time"
	_ "unsafe"

	"github.com/DATA-DOG/go-sqlmock"
	"go.uber.org/zap"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
	"github.com/your-org/inspect-system/backend-go/internal/scheduler"
)

// 采集任务的历史 ID（Python→Go 迁移时把节奏写进 ID，且写成 5min，与实际的 3 分钟口径不符）
const legacyMetricsCollectionTaskIDForTest = "metrics_collection_5min"

//go:linkname migrateMetricsCollectionTaskID github.com/your-org/inspect-system/backend-go/internal/scheduler.migrateMetricsCollectionTaskID
func migrateMetricsCollectionTaskID(ctx context.Context, db *gorm.DB, logger *zap.Logger) (bool, error)

// 页面采样间隔与采集节奏必须相等：页面按 3 分钟分桶、采集也每 3 分钟一轮，桶与样本一一对应。
// 单独改任何一侧都会让桶内样本数在 1~2 之间忽多忽少（原本就是这个组合漂移出问题）。
func TestMetricsCollectionCadence_MatchesDashboardSampleInterval(t *testing.T) {
	if scheduler.MetricsCollectionInterval != monitoring.DashboardSampleInterval {
		t.Fatalf("采集节奏 %v 与页面采样间隔 %v 不一致", scheduler.MetricsCollectionInterval, monitoring.DashboardSampleInterval)
	}
	if scheduler.MetricsCollectionInterval != 3*time.Minute {
		t.Fatalf("采集节奏 = %v，期望 3 分钟（任务名与 cron 都由该常量派生）", scheduler.MetricsCollectionInterval)
	}
}

// 采集任务 ID 必须与采集节奏解耦：ID 是主键、又被 task_executions.task_id 软引用，
// 一旦含节奏数字，改节奏就得迁移主键；这正是本次要修掉的历史问题。
func TestMetricsCollectionTaskID_KeepsCadenceOutOfStableID(t *testing.T) {
	if strings.ContainsAny(scheduler.MetricsCollectionTaskID, "0123456789") {
		t.Fatalf("采集任务 ID %q 含数字节奏片段，改节奏会逼着迁移主键", scheduler.MetricsCollectionTaskID)
	}
}

// 旧 ID 存在、新 ID 不存在：改主键并同步 task_executions.task_id，否则历史执行记录成孤儿。
func TestMigrateMetricsCollectionTaskID_RenamesLegacyRowAndSyncsExecutions(t *testing.T) {
	db, mock, cleanup := newSchedulerGormDBWithSQLMock(t)
	defer cleanup()

	mock.ExpectQuery(`(?is)SELECT count\(\*\) FROM "scheduled_tasks" WHERE id = \$1`).
		WithArgs(legacyMetricsCollectionTaskIDForTest).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))
	mock.ExpectQuery(`(?is)SELECT count\(\*\) FROM "scheduled_tasks" WHERE id = \$1`).
		WithArgs(scheduler.MetricsCollectionTaskID).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectBegin()
	mock.ExpectExec(`(?is)UPDATE scheduled_tasks SET id = \$1, updated_at = \$2 WHERE id = \$3`).
		WithArgs(scheduler.MetricsCollectionTaskID, sqlmock.AnyArg(), legacyMetricsCollectionTaskIDForTest).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(`(?is)UPDATE task_executions SET task_id = \$1 WHERE task_id = \$2`).
		WithArgs(scheduler.MetricsCollectionTaskID, legacyMetricsCollectionTaskIDForTest).
		WillReturnResult(sqlmock.NewResult(0, 3))
	mock.ExpectCommit()

	migrated, err := migrateMetricsCollectionTaskID(context.Background(), db, zap.NewNop())
	if err != nil {
		t.Fatalf("migrateMetricsCollectionTaskID() error = %v", err)
	}
	if !migrated {
		t.Fatalf("旧 ID 存在时应发生迁移")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

// 已迁移过的库：只允许一次探测查询，不得再写任何行（启动流程每次都跑这段）。
func TestMigrateMetricsCollectionTaskID_NoopWhenLegacyIDAbsent(t *testing.T) {
	db, mock, cleanup := newSchedulerGormDBWithSQLMock(t)
	defer cleanup()

	mock.ExpectQuery(`(?is)SELECT count\(\*\) FROM "scheduled_tasks" WHERE id = \$1`).
		WithArgs(legacyMetricsCollectionTaskIDForTest).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))

	migrated, err := migrateMetricsCollectionTaskID(context.Background(), db, zap.NewNop())
	if err != nil {
		t.Fatalf("migrateMetricsCollectionTaskID() error = %v", err)
	}
	if migrated {
		t.Fatalf("旧 ID 不存在时不应发生迁移")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

// 新旧 ID 同时存在（历史上有过异常改动）：改名会撞主键，必须保留现场并告警，不静默改动采集节奏。
func TestMigrateMetricsCollectionTaskID_KeepsBothRowsWhenNewIDExists(t *testing.T) {
	db, mock, cleanup := newSchedulerGormDBWithSQLMock(t)
	defer cleanup()

	mock.ExpectQuery(`(?is)SELECT count\(\*\) FROM "scheduled_tasks" WHERE id = \$1`).
		WithArgs(legacyMetricsCollectionTaskIDForTest).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))
	mock.ExpectQuery(`(?is)SELECT count\(\*\) FROM "scheduled_tasks" WHERE id = \$1`).
		WithArgs(scheduler.MetricsCollectionTaskID).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))

	migrated, err := migrateMetricsCollectionTaskID(context.Background(), db, zap.NewNop())
	if err != nil {
		t.Fatalf("migrateMetricsCollectionTaskID() error = %v", err)
	}
	if migrated {
		t.Fatalf("新旧 ID 同时存在时不应改名")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func newSchedulerGormDBWithSQLMock(t *testing.T) (*gorm.DB, sqlmock.Sqlmock, func()) {
	t.Helper()

	sqlDB, mock, err := sqlmock.New(sqlmock.QueryMatcherOption(sqlmock.QueryMatcherRegexp))
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}

	gormDB, err := gorm.Open(postgres.New(postgres.Config{
		Conn:                 sqlDB,
		PreferSimpleProtocol: true,
	}), &gorm.Config{
		SkipDefaultTransaction: true,
		DisableAutomaticPing:   true,
	})
	if err != nil {
		_ = sqlDB.Close()
		t.Fatalf("gorm.Open: %v", err)
	}

	return gormDB, mock, func() { _ = sqlDB.Close() }
}
