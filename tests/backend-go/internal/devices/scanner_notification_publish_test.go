package devices_test

import (
	"context"
	"testing"
	"time"
	_ "unsafe"

	"github.com/DATA-DOG/go-sqlmock"
	"go.uber.org/zap"

	"github.com/your-org/inspect-system/backend-go/internal/devices"
	"github.com/your-org/inspect-system/backend-go/internal/ws"
)

//go:linkname finalizeScan github.com/your-org/inspect-system/backend-go/internal/devices.(*Scanner).finalizeScan
func finalizeScan(s *devices.Scanner, ctx context.Context, scanID string, startedAt time.Time, totalHosts int, scanned *int64, alive *int64, found *int64, cause error)

type recordingPublisher struct {
	messages []ws.Message
}

func (p *recordingPublisher) SendToRoom(_ string, message ws.Message) int {
	p.messages = append(p.messages, message)
	return 1
}

// 网络扫描落终态后发布 notifications 房间事件（通知中心的“扫描完成”系统消息来源）。
func TestScannerFinalizeScan_ShouldPublishNotificationChange(t *testing.T) {
	db, mock, cleanup := newDevicesGormDBWithSQLMock(t)
	defer cleanup()

	publisher := &recordingPublisher{}
	scanner := devices.NewScanner(db, zap.NewNop(), nil).WithNotifier(publisher)

	mock.ExpectExec(`UPDATE "network_scans" SET .* WHERE id = \$\d+`).WillReturnResult(sqlmock.NewResult(0, 1))

	var scanned, alive, found int64 = 10, 3, 2
	finalizeScan(scanner, context.Background(), "scan-9", time.Now().Add(-time.Minute), 10, &scanned, &alive, &found, nil)

	if len(publisher.messages) != 1 {
		t.Fatalf("published messages = %d, want 1", len(publisher.messages))
	}
	change, ok := publisher.messages[0].Data.(ws.NotificationChange)
	if !ok {
		t.Fatalf("data type = %T, want ws.NotificationChange", publisher.messages[0].Data)
	}
	if change.Source != ws.NotificationSourceScan || change.ID != "scan-9" || change.Status != "completed" {
		t.Fatalf("change = %+v", change)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}
