package monitoring_test

import (
	"bytes"
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
	"go.uber.org/zap"
)

// TestExportMonitoringReportPDF_ShouldRenderStructuredTemplate validates
// that the monitoring PDF exporter produces a real, structurally valid
// gofpdf-generated PDF (with embedded fonts, hero, charts, soft tables) —
// not the legacy hand-rolled byte stream that could only render ASCII.
//
// We deliberately do NOT assert on the textual content of the PDF: the
// payload is now compressed UTF-8 routed through gofpdf's stream encoder,
// so substring matching against literal CJK strings would be brittle.
// Instead we assert on structural properties that prove the new pipeline
// ran end to end (font dictionary present, multi-KB output size, valid
// PDF header).
//
// On hosts without a CJK .ttf font installed (e.g. minimal CI images) the
// font registration step returns an error from pdfkit; the test recognises
// that and skips, mirroring the policy used by the reports-package PDF
// tests.
func TestExportMonitoringReportPDF_ShouldRenderStructuredTemplate(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()

	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())

	mock.ExpectQuery(`(?is)SELECT a\.id,.*FROM alerts a JOIN devices d ON d\.id = a\.device_id WHERE a\.created_at >= .*`).
		WillReturnRows(sqlmock.NewRows([]string{
			"id",
			"device_id",
			"device_name",
			"title",
			"severity",
			"status",
			"message",
			"created_at",
			"last_occurred",
		}))

	result, err := writer.ExportMonitoringReport(context.Background(), monitoring.MonitoringReportExportRequest{
		Format:    "pdf",
		TimeRange: "24h",
		Sections:  []string{"alerts"},
	}, t.TempDir())
	if err != nil {
		// pdfkit returns this exact prefix when no CJK .ttf is found.
		// Skip rather than fail so minimal CI images don't block the suite.
		if strings.Contains(err.Error(), "未找到可用的PDF中文字体") {
			t.Skipf("当前环境缺少 PDF 中文字体，跳过渲染结果断言: %v", err)
		}
		t.Fatalf("ExportMonitoringReport() error = %v", err)
	}

	if result.Format != "pdf" {
		t.Fatalf("ExportMonitoringReport() format = %q, want pdf", result.Format)
	}
	if filepath.Ext(result.FilePath) != ".pdf" {
		t.Fatalf("ExportMonitoringReport() ext = %q, want .pdf", filepath.Ext(result.FilePath))
	}

	raw, err := os.ReadFile(result.FilePath)
	if err != nil {
		t.Fatalf("ReadFile(%q) error = %v", result.FilePath, err)
	}

	if !bytes.HasPrefix(raw, []byte("%PDF-")) {
		prefixLen := len(raw)
		if prefixLen > 8 {
			prefixLen = 8
		}
		t.Fatalf("generated report is not a PDF, first bytes = %q", string(raw[:prefixLen]))
	}

	// Page object marker — gofpdf always emits at least one /Page.
	if !bytes.Contains(raw, []byte("/Type /Page")) {
		t.Fatalf("generated PDF is missing /Type /Page marker")
	}

	// Font dictionary marker — proves the embedded TrueType font was
	// registered, which the legacy hand-rolled writer never emitted.
	if !bytes.Contains(raw, []byte("/Font")) {
		t.Fatalf("generated PDF is missing /Font dictionary; embedded font registration likely failed")
	}

	// Size floor — the new template (hero + cards + table + footer + UTF-8
	// font subset) is ~30-80KB for an empty report, so 8KB is a safe lower
	// bound that the legacy 2KB hand-rolled writer would never reach.
	if len(raw) < 8*1024 {
		t.Fatalf("generated PDF size = %d, want at least 8KB (legacy writer would produce ~2KB)", len(raw))
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}
