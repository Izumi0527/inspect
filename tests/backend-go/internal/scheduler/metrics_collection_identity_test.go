package scheduler_test

import (
	"context"
	"errors"
	"strings"
	"testing"
	"time"
	_ "unsafe"

	"github.com/DATA-DOG/go-sqlmock"
	"go.uber.org/zap"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/devices"
	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
	"github.com/your-org/inspect-system/backend-go/internal/scheduler"
)

// 采集任务的历史 ID（Python→Go 迁移时把节奏写进 ID，且写成 5min，与当时实际的 3 分钟口径不符）
const legacyMetricsCollectionTaskIDForTest = "metrics_collection_5min"

//go:linkname migrateMetricsCollectionTaskID github.com/your-org/inspect-system/backend-go/internal/scheduler.migrateMetricsCollectionTaskID
func migrateMetricsCollectionTaskID(ctx context.Context, db *gorm.DB, logger *zap.Logger) (bool, error)

//go:linkname ensureDefaultTasks github.com/your-org/inspect-system/backend-go/internal/scheduler.(*Service).ensureDefaultTasks
func ensureDefaultTasks(s *scheduler.Service, ctx context.Context) error

// 页面采样间隔与采集节奏必须相等：页面按 5 分钟分桶、采集也每 5 分钟一轮，桶与样本一一对应。
// 单独改任何一侧都会让桶内样本数在 1~2 之间忽多忽少（原本就是这个组合漂移出问题）。
func TestMetricsCollectionCadence_MatchesDashboardSampleInterval(t *testing.T) {
	if scheduler.MetricsCollectionInterval != monitoring.DashboardSampleInterval {
		t.Fatalf("采集节奏 %v 与页面采样间隔 %v 不一致", scheduler.MetricsCollectionInterval, monitoring.DashboardSampleInterval)
	}
	if scheduler.MetricsCollectionInterval != 5*time.Minute {
		t.Fatalf("采集节奏 = %v，期望 5 分钟（任务名与 cron 都由该常量派生）", scheduler.MetricsCollectionInterval)
	}
}

// 速率窗口必须覆盖两个采集周期：至少要大于一个周期加抖动，正常相邻样本才算得出速率（3→5 分钟时就踩过这个坑）；
// 再多留一个周期，给慢轮后的补跑样本。
func TestRateSampleMaxGap_CoversTwoCollectionPeriods(t *testing.T) {
	if devices.RateSampleMaxGap < 2*scheduler.MetricsCollectionInterval {
		t.Fatalf("速率窗口 %v 小于两个采集周期 %v", devices.RateSampleMaxGap, 2*scheduler.MetricsCollectionInterval)
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

// 迁移失败、旧 ID 行还在：本次启动不得再建新 ID 的采集任务。旧行的名称是迁移前的「设备指标采集(3分钟)」，
// 节奏改成 5 分钟后 seed 名称不再命中它；若照常新建，下次启动迁移会因新旧 ID 并存而拒绝改名，变成永久双份采集。
func TestEnsureDefaultTasks_SkipsNewCollectionTaskWhileLegacyRowRemains(t *testing.T) {
	db, mock, cleanup := newSchedulerGormDBWithSQLMock(t)
	defer cleanup()

	// 迁移：旧 ID 在、新 ID 不在，改主键时事务失败并回滚
	mock.ExpectQuery(`(?is)SELECT count\(\*\) FROM "scheduled_tasks" WHERE id = \$1`).
		WithArgs(legacyMetricsCollectionTaskIDForTest).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))
	mock.ExpectQuery(`(?is)SELECT count\(\*\) FROM "scheduled_tasks" WHERE id = \$1`).
		WithArgs(scheduler.MetricsCollectionTaskID).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectBegin()
	mock.ExpectExec(`(?is)UPDATE scheduled_tasks SET id = \$1, updated_at = \$2 WHERE id = \$3`).
		WillReturnError(errors.New("lock timeout"))
	mock.ExpectRollback()

	// seed 匹配：其余四个默认任务都已存在；按新 ID、新名称都匹配不到旧采集任务（真实库也不会返回它）
	mock.ExpectQuery(`(?is)SELECT \* FROM "scheduled_tasks" WHERE id IN \(.+\) OR name IN \(.+\)`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name"}).
			AddRow("daily_device_inspection", "每日设备巡检").
			AddRow("hourly_network_scan", "每小时网络扫描").
			AddRow("weekly_system_health", "每周系统健康检查").
			AddRow("monthly_data_cleanup", "每月数据清理"))
	// 准备新建采集任务前确认旧 ID 是否还在：还在就跳过，不能 INSERT
	mock.ExpectQuery(`(?is)SELECT count\(\*\) FROM "scheduled_tasks" WHERE id = \$1`).
		WithArgs(legacyMetricsCollectionTaskIDForTest).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))
	// 网络扫描任务照常被强制停用
	mock.ExpectExec(`(?is)UPDATE "scheduled_tasks" SET .+ WHERE id = \$\d+ OR name = \$\d+`).
		WillReturnResult(sqlmock.NewResult(0, 1))

	svc := scheduler.NewService(db, zap.NewNop(), nil, nil, nil, nil, nil, nil, nil, nil, "", nil, nil, nil)
	if err := ensureDefaultTasks(svc, context.Background()); err != nil {
		t.Fatalf("ensureDefaultTasks() error = %v", err)
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
