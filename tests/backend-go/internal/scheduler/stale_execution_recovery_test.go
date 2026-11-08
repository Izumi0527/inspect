package scheduler_test

import (
	"context"
	"database/sql/driver"
	"testing"
	_ "unsafe"

	"github.com/DATA-DOG/go-sqlmock"
	"go.uber.org/zap"

	"github.com/your-org/inspect-system/backend-go/internal/scheduler"
)

//go:linkname recoverStaleRunningTasks github.com/your-org/inspect-system/backend-go/internal/scheduler.(*Service).recoverStaleRunningTasks
func recoverStaleRunningTasks(s *scheduler.Service, ctx context.Context) error

// 进程中断（崩溃、重启、停机时 ctx 已取消导致 finishTask 写库失败）时，正在执行的那一轮永远等不到收尾：
// 任务行会在启动时被重置为 pending，执行记录却一直停在 running，执行历史里永远挂着「执行中」。
// 启动恢复必须把这些执行记录一并收尾为失败，并写明原因。
func TestRecoverStaleRunningTasks_AlsoClosesInterruptedExecutions(t *testing.T) {
	db, mock, cleanup := newSchedulerGormDBWithSQLMock(t)
	defer cleanup()
	svc := scheduler.NewService(db, zap.NewNop(), nil, nil, nil, nil, nil, nil, nil, nil, "", nil, nil, nil)

	mock.ExpectExec(`(?is)^UPDATE "scheduled_tasks" SET "status"=\$1,"updated_at"=\$2 WHERE status = \$3$`).
		WithArgs("pending", sqlmock.AnyArg(), "running").
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(`(?is)^UPDATE "task_executions" SET "error_message"=\$1,"finished_at"=\$2,"status"=\$3 WHERE status = \$4$`).
		WithArgs(nonEmptyString{}, sqlmock.AnyArg(), "failed", "running").
		WillReturnResult(sqlmock.NewResult(0, 7))

	if err := recoverStaleRunningTasks(svc, context.Background()); err != nil {
		t.Fatalf("recoverStaleRunningTasks() error = %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("启动恢复应同时把遗留的 running 执行记录收尾为 failed：%v", err)
	}
}

// nonEmptyString 要求参数是非空字符串：收尾原因必须写进 error_message，否则用户只看到一条无故失败的记录。
type nonEmptyString struct{}

func (nonEmptyString) Match(value driver.Value) bool {
	text, ok := value.(string)
	return ok && text != ""
}
