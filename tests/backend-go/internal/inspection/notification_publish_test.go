package inspection_test

import (
	"context"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"go.uber.org/zap"

	"github.com/your-org/inspect-system/backend-go/internal/inspection"
	"github.com/your-org/inspect-system/backend-go/internal/ws"
)

type recordingPublisher struct {
	messages []ws.Message
}

func (p *recordingPublisher) SendToRoom(_ string, message ws.Message) int {
	p.messages = append(p.messages, message)
	return 1
}

func expectInspectionRow(mock sqlmock.Sqlmock, id int, status string) {
	started := time.Date(2026, 9, 18, 8, 0, 0, 0, time.UTC)
	mock.ExpectQuery(`SELECT .* FROM "inspections" WHERE id = \$1`).
		WithArgs(id, 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "status", "started_at", "created_at", "updated_at"}).
			AddRow(id, status, started, started, started))
}

// 巡检写入终态后发布 notifications 房间事件，让顶栏通知中心不必等 60s 轮询。
func TestUpdateInspectionStatus_TerminalStatus_ShouldPublishNotificationChange(t *testing.T) {
	db, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	publisher := &recordingPublisher{}
	svc := inspection.NewService(db, zap.NewNop()).WithNotifier(publisher)

	expectInspectionRow(mock, 41, "running")
	mock.ExpectExec(`UPDATE "inspections" SET .* WHERE id = \$\d+`).
		WillReturnResult(sqlmock.NewResult(0, 1))
	expectInspectionRow(mock, 41, "completed")

	if _, err := svc.UpdateInspectionStatus(context.Background(), 41, inspection.StatusCompleted, nil); err != nil {
		t.Fatalf("UpdateInspectionStatus: %v", err)
	}

	if len(publisher.messages) != 1 {
		t.Fatalf("published messages = %d, want 1", len(publisher.messages))
	}
	change, ok := publisher.messages[0].Data.(ws.NotificationChange)
	if !ok {
		t.Fatalf("data type = %T, want ws.NotificationChange", publisher.messages[0].Data)
	}
	if change.Source != ws.NotificationSourceInspection || change.ID != "41" || change.Status != "completed" {
		t.Fatalf("change = %+v", change)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestUpdateInspectionStatus_NonTerminalStatus_ShouldNotPublish(t *testing.T) {
	db, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	publisher := &recordingPublisher{}
	svc := inspection.NewService(db, zap.NewNop()).WithNotifier(publisher)

	expectInspectionRow(mock, 41, "pending")
	mock.ExpectExec(`UPDATE "inspections" SET .* WHERE id = \$\d+`).
		WillReturnResult(sqlmock.NewResult(0, 1))
	expectInspectionRow(mock, 41, "running")

	if _, err := svc.UpdateInspectionStatus(context.Background(), 41, inspection.StatusRunning, nil); err != nil {
		t.Fatalf("UpdateInspectionStatus: %v", err)
	}
	if len(publisher.messages) != 0 {
		t.Fatalf("running 不是终态，不应发布通知事件，got %d", len(publisher.messages))
	}
}

func TestUpdateInspectionStatus_WithoutNotifier_ShouldStillWork(t *testing.T) {
	db, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	svc := inspection.NewService(db, zap.NewNop())

	expectInspectionRow(mock, 41, "running")
	mock.ExpectExec(`UPDATE "inspections" SET .* WHERE id = \$\d+`).
		WillReturnResult(sqlmock.NewResult(0, 1))
	expectInspectionRow(mock, 41, "failed")

	if _, err := svc.UpdateInspectionStatus(context.Background(), 41, inspection.StatusFailed, nil); err != nil {
		t.Fatalf("UpdateInspectionStatus without notifier: %v", err)
	}
}
