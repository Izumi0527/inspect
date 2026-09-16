package logs_test

import (
	"context"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"

	"github.com/your-org/inspect-system/backend-go/internal/logs"
)

// 推送证据（任务 A）：设备已把 Trap 推到本系统时，定时任务不必再为 trapbuffer 登录设备。
// 以"近期收到过该设备的 snmp_trap 记录"为据，而不是看监听器是否启用——
// 监听器开着但设备没配 target-host 时，按配置判断会造成盲区。

func TestHasPushedTrapsSince_ShouldReportByRecentSnmpTrapRows(t *testing.T) {
	db, mock, cleanup := newLogsGormDBWithSQLMock(t, sqlmock.QueryMatcherRegexp)
	defer cleanup()
	service := logs.NewService(db, nil)
	since := time.Date(2026, 9, 15, 8, 0, 0, 0, time.UTC)

	mock.ExpectQuery(`FROM "device_logs" WHERE device_id = \$1 AND source = \$2 AND log_timestamp >= \$3`).
		WithArgs(10, "snmp_trap", since).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(3))
	pushed, err := service.HasPushedTrapsSince(context.Background(), 10, since)
	if err != nil || !pushed {
		t.Fatalf("有 snmp_trap 记录时应返回 true，got (%v, %v)", pushed, err)
	}

	mock.ExpectQuery(`FROM "device_logs" WHERE device_id = \$1 AND source = \$2 AND log_timestamp >= \$3`).
		WithArgs(10, "snmp_trap", since).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	pushed, err = service.HasPushedTrapsSince(context.Background(), 10, since)
	if err != nil || pushed {
		t.Fatalf("无 snmp_trap 记录时应返回 false，got (%v, %v)", pushed, err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
