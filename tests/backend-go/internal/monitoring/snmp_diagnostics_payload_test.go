package monitoring_test

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/your-org/inspect-system/backend-go/internal/devices"
	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
	"go.uber.org/zap"
)

func TestBuildAndDecodeSNMPExtensionDiagnostics(t *testing.T) {
	cands := make([]devices.SNMPCandidateDiagnostic, 0, 15)
	for i := 0; i < 15; i++ {
		cands = append(cands, devices.SNMPCandidateDiagnostic{
			Category:    "optical",
			CandidateID: "opt",
			Method:      "bulkwalk",
			OID:         "1.3.6.1.4.1.56813.5.25.31.1.1.3.1.8",
			Status:      "empty",
			ElapsedMs:   15,
		})
	}
	cands[14].Category = "memory"
	cands[14].Status = "error"
	cands[14].ErrorClass = "timeout"

	collectedAt := time.Date(2026, 11, 22, 12, 0, 0, 0, time.UTC)
	req := monitoring.BuildSNMPDeviceMetricsRequest(15, &devices.SNMPMetrics{
		CollectedAt: collectedAt,
		Diagnostics: &devices.SNMPCollectionDiagnostics{
			InputVendor:      "other",
			EffectiveVendor:  "huawei",
			SysObjectID:      "1.3.6.1.4.1.56813.2.23.811",
			CanonicalPrefix:  "1.3.6.1.4.1.2011",
			ActivePrefix:     "1.3.6.1.4.1.56813",
			EnterpriseMapped: true,
			TotalElapsedMs:   420,
			Candidates:       cands,
		},
	})

	ext, ok := req.Tags["snmp_extensions"].(map[string]interface{})
	if !ok {
		t.Fatalf("snmp_extensions missing: %#v", req.Tags)
	}
	if _, exists := ext["diagnostics"]; !exists {
		t.Fatalf("diagnostics missing in snmp_extensions: %#v", ext)
	}

	rawTags, err := json.Marshal(req.Tags)
	if err != nil {
		t.Fatalf("marshal tags: %v", err)
	}

	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()
	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())
	mock.ExpectQuery(`(?is)SELECT collected_at,\s*tags FROM device_metrics`).
		WithArgs(15).
		WillReturnRows(sqlmock.NewRows([]string{"collected_at", "tags"}).AddRow(collectedAt, rawTags))

	snap, err := writer.GetLatestSNMPExtensions(context.Background(), 15)
	if err != nil {
		t.Fatalf("GetLatestSNMPExtensions() error = %v", err)
	}
	if snap.Diagnostics == nil {
		t.Fatal("snap.Diagnostics = nil, want non-nil")
	}
	if !snap.Diagnostics.EnterpriseMapped || snap.Diagnostics.ActivePrefix != "1.3.6.1.4.1.56813" {
		t.Fatalf("unexpected diagnostics: %+v", snap.Diagnostics)
	}
	if len(snap.Diagnostics.Candidates) != 12 {
		t.Fatalf("len(Candidates) = %d, want compacted 12", len(snap.Diagnostics.Candidates))
	}
}
