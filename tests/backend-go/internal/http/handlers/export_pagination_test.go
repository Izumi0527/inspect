package handlers_test

import (
	"bytes"
	"encoding/csv"
	"testing"
	"time"

	"github.com/your-org/inspect-system/backend-go/internal/alerts"
	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
)

func TestCollectAllAlertsForExport_ShouldPaginateUntilTotal(t *testing.T) {
	baseFilter := alerts.ListAlertsFilter{
		Statuses:   []string{"active"},
		Severities: []string{"warning"},
	}

	callCount := 0
	fetch := func(filter alerts.ListAlertsFilter) ([]alerts.AlertWithDevice, int64, error) {
		callCount++
		switch filter.Page {
		case 1:
			rows := make([]alerts.AlertWithDevice, 200)
			return rows, 450, nil
		case 2:
			rows := make([]alerts.AlertWithDevice, 200)
			return rows, 450, nil
		case 3:
			rows := make([]alerts.AlertWithDevice, 50)
			return rows, 450, nil
		default:
			return []alerts.AlertWithDevice{}, 450, nil
		}
	}

	rows, err := handlers.CollectAllAlertsForExport(baseFilter, fetch, 200)
	if err != nil {
		t.Fatalf("CollectAllAlertsForExport() error = %v", err)
	}
	if len(rows) != 450 {
		t.Fatalf("CollectAllAlertsForExport() len = %d, want 450", len(rows))
	}
	if callCount != 3 {
		t.Fatalf("CollectAllAlertsForExport() calls = %d, want 3", callCount)
	}
}

func TestCollectAllAlertsForExport_ShouldNotDependOnRequestedPageSize(t *testing.T) {
	baseFilter := alerts.ListAlertsFilter{
		Statuses:   []string{"active"},
		Severities: []string{"warning"},
	}

	callCount := 0
	fetch := func(filter alerts.ListAlertsFilter) ([]alerts.AlertWithDevice, int64, error) {
		callCount++
		switch filter.Page {
		case 1:
			return make([]alerts.AlertWithDevice, 200), 450, nil
		case 2:
			return make([]alerts.AlertWithDevice, 200), 450, nil
		case 3:
			return make([]alerts.AlertWithDevice, 50), 450, nil
		default:
			return []alerts.AlertWithDevice{}, 450, nil
		}
	}

	rows, err := handlers.CollectAllAlertsForExport(baseFilter, fetch, 1000)
	if err != nil {
		t.Fatalf("CollectAllAlertsForExport() error = %v", err)
	}
	if len(rows) != 450 {
		t.Fatalf("CollectAllAlertsForExport() len = %d, want 450", len(rows))
	}
	if callCount != 3 {
		t.Fatalf("CollectAllAlertsForExport() calls = %d, want 3", callCount)
	}
}

func TestBuildAlertsCSV_ShouldEscapeSpecialChars(t *testing.T) {
	deviceName := "核心,交换机"
	createdAt := time.Date(2026, 2, 24, 10, 0, 0, 0, time.UTC)

	rows := []alerts.AlertWithDevice{
		{
			Alert: alerts.Alert{
				ID:        1,
				Title:     "标题,含\"引号\"",
				Message:   "第一行\n第二行",
				Category:  "security",
				Severity:  "warning",
				Status:    "open",
				CreatedAt: &createdAt,
			},
			DeviceName: &deviceName,
		},
	}

	data, err := handlers.BuildAlertsCSV(rows)
	if err != nil {
		t.Fatalf("BuildAlertsCSV() error = %v", err)
	}

	reader := csv.NewReader(bytes.NewReader(data))
	records, err := reader.ReadAll()
	if err != nil {
		t.Fatalf("csv read error = %v", err)
	}
	if len(records) != 2 {
		t.Fatalf("records len = %d, want 2", len(records))
	}
	if len(records[1]) != 8 {
		t.Fatalf("record column len = %d, want 8", len(records[1]))
	}
	if records[1][1] != "标题,含\"引号\"" {
		t.Fatalf("title = %q, want original", records[1][1])
	}
	if records[1][2] != deviceName {
		t.Fatalf("device = %q, want %q", records[1][2], deviceName)
	}
	if records[1][4] != "active" {
		t.Fatalf("status = %q, want active", records[1][4])
	}
	if records[1][7] != "第一行\n第二行" {
		t.Fatalf("message = %q, want keep newline", records[1][7])
	}
}
