package reports_test

import (
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"go.uber.org/zap"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/reports"
	"github.com/your-org/inspect-system/backend-go/internal/ws"
)

type recordingPublisher struct {
	messages []ws.Message
}

func (p *recordingPublisher) SendToRoom(_ string, message ws.Message) int {
	p.messages = append(p.messages, message)
	return 1
}

func newReportsGormDBWithSQLMock(t *testing.T) (*gorm.DB, sqlmock.Sqlmock, func()) {
	t.Helper()

	sqlDB, mock, err := sqlmock.New(sqlmock.QueryMatcherOption(sqlmock.QueryMatcherRegexp))
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	gormDB, err := gorm.Open(postgres.New(postgres.Config{Conn: sqlDB, PreferSimpleProtocol: true}), &gorm.Config{
		SkipDefaultTransaction: true,
		DisableAutomaticPing:   true,
	})
	if err != nil {
		_ = sqlDB.Close()
		t.Fatalf("gorm.Open: %v", err)
	}
	return gormDB, mock, func() { _ = sqlDB.Close() }
}

func expectReportRow(mock sqlmock.Sqlmock, id int, status string) {
	mock.ExpectQuery(`SELECT .* FROM "reports" WHERE "reports"\."id" = \$1`).
		WithArgs(id, 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "title", "status"}).AddRow(id, "巡检周报", status))
}

// 报表生成成功/失败落库后发布 notifications 房间事件；仅改标题等非状态字段不发布。
func TestUpdateReport_StatusCompleted_ShouldPublishNotificationChange(t *testing.T) {
	db, mock, cleanup := newReportsGormDBWithSQLMock(t)
	defer cleanup()

	publisher := &recordingPublisher{}
	svc := reports.NewService(db, zap.NewNop()).WithNotifier(publisher)

	mock.ExpectExec(`UPDATE "reports" SET .* WHERE id = \$\d+`).WillReturnResult(sqlmock.NewResult(0, 1))
	expectReportRow(mock, 88, "completed")

	if _, err := svc.UpdateReport(context.Background(), 88, map[string]interface{}{"status": "completed"}); err != nil {
		t.Fatalf("UpdateReport: %v", err)
	}

	if len(publisher.messages) != 1 {
		t.Fatalf("published messages = %d, want 1", len(publisher.messages))
	}
	change, ok := publisher.messages[0].Data.(ws.NotificationChange)
	if !ok {
		t.Fatalf("data type = %T, want ws.NotificationChange", publisher.messages[0].Data)
	}
	if change.Source != ws.NotificationSourceReport || change.ID != "88" || change.Status != "completed" {
		t.Fatalf("change = %+v", change)
	}
}

func TestUpdateReport_WithoutStatusChange_ShouldNotPublish(t *testing.T) {
	db, mock, cleanup := newReportsGormDBWithSQLMock(t)
	defer cleanup()

	publisher := &recordingPublisher{}
	svc := reports.NewService(db, zap.NewNop()).WithNotifier(publisher)

	mock.ExpectExec(`UPDATE "reports" SET .* WHERE id = \$\d+`).WillReturnResult(sqlmock.NewResult(0, 1))
	expectReportRow(mock, 88, "generating")

	if _, err := svc.UpdateReport(context.Background(), 88, map[string]interface{}{"title": "新标题"}); err != nil {
		t.Fatalf("UpdateReport: %v", err)
	}
	if len(publisher.messages) != 0 {
		t.Fatalf("非状态更新不应发布通知事件，got %d", len(publisher.messages))
	}
}
