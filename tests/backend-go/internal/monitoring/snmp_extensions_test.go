package monitoring_test

import (
	"context"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
	"go.uber.org/zap"
)

func TestGetLatestSNMPExtensions_ShouldReturnEmptyArraysWhenNoTaggedMetrics(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()

	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())

	mock.ExpectQuery(`(?is)SELECT collected_at,\s*tags FROM device_metrics WHERE device_id = \$1 AND tags IS NOT NULL AND tags->'snmp_extensions' IS NOT NULL ORDER BY collected_at DESC LIMIT 1`).
		WillReturnRows(sqlmock.NewRows([]string{"collected_at", "tags"}))

	resp, err := writer.GetLatestSNMPExtensions(context.Background(), 7)
	if err != nil {
		t.Fatalf("GetLatestSNMPExtensions() error = %v", err)
	}
	if resp.DeviceID != 7 {
		t.Fatalf("device_id = %d, want 7", resp.DeviceID)
	}
	if resp.Timestamp != nil {
		t.Fatalf("timestamp = %v, want nil", resp.Timestamp)
	}
	if len(resp.BGPPeers) != 0 {
		t.Fatalf("bgp_peers len = %d, want 0", len(resp.BGPPeers))
	}
	if len(resp.OpticalTransceivers) != 0 {
		t.Fatalf("optical_transceivers len = %d, want 0", len(resp.OpticalTransceivers))
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestGetLatestSNMPExtensions_ShouldDecodeBGPAndOpticalFromTags(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()

	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())

	collectedAt := time.Date(2026, 4, 29, 8, 30, 0, 0, time.UTC)
	tags := `{"snmp_extensions":{"bgp_peers":[{"index":"1","state":6,"state_label":"established","established_time_seconds":3600}],"optical_transceivers":[{"index":"10","bias_current":12.5,"bias_current_unit":"uA","rx_power":2.3,"rx_power_unit":"uW"}]}}`

	mock.ExpectQuery(`(?is)SELECT collected_at,\s*tags FROM device_metrics WHERE device_id = \$1 AND tags IS NOT NULL AND tags->'snmp_extensions' IS NOT NULL ORDER BY collected_at DESC LIMIT 1`).
		WillReturnRows(sqlmock.NewRows([]string{"collected_at", "tags"}).AddRow(collectedAt, []byte(tags)))

	resp, err := writer.GetLatestSNMPExtensions(context.Background(), 7)
	if err != nil {
		t.Fatalf("GetLatestSNMPExtensions() error = %v", err)
	}
	if resp.Timestamp == nil || !resp.Timestamp.Equal(collectedAt) {
		t.Fatalf("timestamp = %v, want %v", resp.Timestamp, collectedAt)
	}
	if len(resp.BGPPeers) != 1 {
		t.Fatalf("bgp_peers len = %d, want 1", len(resp.BGPPeers))
	}
	if resp.BGPPeers[0].StateLabel != "established" {
		t.Fatalf("bgp peer state_label = %q, want established", resp.BGPPeers[0].StateLabel)
	}
	if resp.BGPPeers[0].EstablishedTime == nil || *resp.BGPPeers[0].EstablishedTime != 3600 {
		t.Fatalf("bgp peer established_time = %v, want 3600", resp.BGPPeers[0].EstablishedTime)
	}
	if len(resp.OpticalTransceivers) != 1 {
		t.Fatalf("optical_transceivers len = %d, want 1", len(resp.OpticalTransceivers))
	}
	if resp.OpticalTransceivers[0].BiasCurrent == nil || *resp.OpticalTransceivers[0].BiasCurrent != 12.5 {
		t.Fatalf("optical bias_current = %v, want 12.5", resp.OpticalTransceivers[0].BiasCurrent)
	}
	if resp.OpticalTransceivers[0].RxPower == nil || *resp.OpticalTransceivers[0].RxPower != 2.3 {
		t.Fatalf("optical rx_power = %v, want 2.3", resp.OpticalTransceivers[0].RxPower)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}
