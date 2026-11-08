package monitoring_test

import (
	"context"
	"fmt"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"go.uber.org/zap"

	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
)

// 告警表按 created_at 倒序取数：查询必须多取一行才能知道是否超出 500 条上限。
// 此前 LIMIT 500 与「超过 500 条才提示」并存，提示永远不会出现，超出部分被静默丢弃。
func TestExportMonitoringReportCSV_AlertsBeyondLimitAreFlaggedAndNewestKept(t *testing.T) {
	content, mock := exportAlertsCSV(t, 501)
	if !strings.Contains(content, "仅保留最新500条") {
		t.Fatalf("超出上限时 CSV 缺少「仅保留最新500条」提示，尾部：\n%s", tail(content, 300))
	}
	if !strings.Contains(content, alertRowMarker(501)) {
		t.Fatal("CSV 缺少最新一条告警 alert-501")
	}
	if strings.Contains(content, alertRowMarker(1)) {
		t.Fatal("CSV 仍包含最旧一条告警 alert-1，应只保留最新 500 条")
	}
	if got := strings.Count(content, ",0,,alert-"); got != 500 {
		t.Fatalf("CSV 告警行数 = %d，want 500", got)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

// 恰好 500 条时没有被截断，不能误报。
func TestExportMonitoringReportCSV_AlertsAtLimitAreNotFlagged(t *testing.T) {
	content, mock := exportAlertsCSV(t, 500)
	if strings.Contains(content, "已截断") {
		t.Fatalf("恰好 500 条告警不应出现截断提示，尾部：\n%s", tail(content, 300))
	}
	if got := strings.Count(content, ",0,,alert-"); got != 500 {
		t.Fatalf("CSV 告警行数 = %d，want 500", got)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

// exportAlertsCSV 导出只含告警分区的 CSV；库里返回 total 条告警，按 created_at 倒序（编号越大越新）。
// device_id 为 0、设备名为空，CSV 行形如 "<id>,0,,alert-<编号>,…"。
func exportAlertsCSV(t *testing.T, total int) (string, sqlmock.Sqlmock) {
	t.Helper()
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	t.Cleanup(cleanup)
	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())

	base := time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC)
	rows := sqlmock.NewRows([]string{"id", "device_id", "device_name", "title", "severity", "status", "message", "created_at", "last_occurred"})
	for n := total; n >= 1; n-- {
		rows.AddRow(n, 0, nil, fmt.Sprintf("alert-%d", n), "warning", "active", "", base.Add(time.Duration(n)*time.Minute), nil)
	}
	mock.ExpectQuery(`(?is)FROM alerts a\s+JOIN devices d ON d\.id = a\.device_id.*ORDER BY a\.created_at DESC\s+LIMIT \$3`).
		WithArgs(sqlmock.AnyArg(), sqlmock.AnyArg(), 501).
		WillReturnRows(rows)

	result, err := writer.ExportMonitoringReport(context.Background(), monitoring.MonitoringReportExportRequest{
		Format:    "csv",
		TimeRange: "24h",
		Sections:  []string{"alerts"},
	}, t.TempDir())
	if err != nil {
		t.Fatalf("ExportMonitoringReport() error = %v", err)
	}
	raw, err := os.ReadFile(result.FilePath)
	if err != nil {
		t.Fatalf("ReadFile(%q) error = %v", result.FilePath, err)
	}
	return string(raw), mock
}

func alertRowMarker(n int) string {
	return fmt.Sprintf(",0,,alert-%d,", n)
}

func tail(text string, n int) string {
	if len(text) <= n {
		return text
	}
	return text[len(text)-n:]
}
