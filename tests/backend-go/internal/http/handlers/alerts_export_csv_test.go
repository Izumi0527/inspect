package handlers_test

import (
	"strings"
	"testing"
	"time"

	"github.com/your-org/inspect-system/backend-go/internal/alerts"
	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
)

func TestBuildAlertsCSV_SanitizesExcelFormulaInjection(t *testing.T) {
	now := time.Date(2026, 3, 15, 12, 0, 0, 0, time.UTC)
	deviceName := "=@设备A"

	data, err := handlers.BuildAlertsCSV([]alerts.AlertWithDevice{
		{
			Alert: alerts.Alert{
				ID:        1,
				DeviceID:  1,
				Title:     "=1+1",
				Message:   "+SUM(1,1)",
				Category:  "@security",
				Severity:  "critical",
				Status:    "open",
				CreatedAt: &now,
			},
			DeviceName: &deviceName,
		},
	})
	if err != nil {
		t.Fatalf("BuildAlertsCSV returned error: %v", err)
	}

	csvText := string(data)
	for _, want := range []string{"'=1+1", "'+SUM(1,1)", "'@security", "'=@设备A"} {
		if !strings.Contains(csvText, want) {
			t.Fatalf("expected csv to contain %q, got:\n%s", want, csvText)
		}
	}
}
