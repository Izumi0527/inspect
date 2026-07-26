package monitoring_test

import (
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
)

// 统一峰值查询契约：一条 SQL 同时产出分向峰值与合并峰值，
// 总览（上/下行卡）与监控中心（峰值流量卡）共用此口径。
func TestPeakNetworkMetrics24h_ShouldParseDirectionalAndCombinedPeaks(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()

	mock.ExpectQuery(`(?is)WITH time_buckets AS.*MAX\(inbound\) AS peak_inbound.*MAX\(outbound\) AS peak_outbound.*MAX\(inbound \+ outbound\) AS peak_combined.*`).
		WillReturnRows(sqlmock.NewRows([]string{"peak_inbound", "peak_outbound", "peak_combined", "sample_count"}).
			AddRow(2818.0, 12266.0, 15084.0, 24))

	snapshot, err := monitoring.PeakNetworkMetrics24h(context.Background(), db, nil)
	if err != nil {
		t.Fatalf("PeakNetworkMetrics24h() error = %v", err)
	}
	if !snapshot.HasData {
		t.Fatalf("HasData = false, want true")
	}
	if snapshot.Inbound != 2818.0 {
		t.Fatalf("Inbound = %v, want 2818", snapshot.Inbound)
	}
	if snapshot.Outbound != 12266.0 {
		t.Fatalf("Outbound = %v, want 12266", snapshot.Outbound)
	}
	if snapshot.Combined != 15084.0 {
		t.Fatalf("Combined = %v, want 15084", snapshot.Combined)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestPeakNetworkMetrics24h_ShouldReportNoDataWhenWindowEmpty(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()

	mock.ExpectQuery(`(?is)WITH time_buckets AS.*FROM device_metrics.*`).
		WillReturnRows(sqlmock.NewRows([]string{"peak_inbound", "peak_outbound", "peak_combined", "sample_count"}).
			AddRow(nil, nil, nil, 0))

	snapshot, err := monitoring.PeakNetworkMetrics24h(context.Background(), db, nil)
	if err != nil {
		t.Fatalf("PeakNetworkMetrics24h() error = %v", err)
	}
	if snapshot.HasData {
		t.Fatalf("HasData = true, want false")
	}
	if snapshot.Inbound != 0 || snapshot.Outbound != 0 || snapshot.Combined != 0 {
		t.Fatalf("empty window should return zero values, got %+v", snapshot)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}
