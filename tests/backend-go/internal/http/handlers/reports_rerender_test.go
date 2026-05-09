package handlers_test

import (
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	"github.com/your-org/inspect-system/backend-go/internal/reports"
	"go.uber.org/zap"
)

func TestReportsHandler_RerenderReportPDF_ShouldCreateFreshPDFAndReturnPreviewURL(t *testing.T) {
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	outputDir := t.TempDir()
	authService, token := newAuthServiceWithPermissions(t, []string{"reports:update"})
	service := reports.NewService(gormDB, zap.NewNop())
	handler := handlers.ReportsHandler{
		Service:   service,
		Auth:      authService,
		OutputDir: outputDir,
	}

	now := time.Date(2026, 5, 8, 10, 0, 0, 0, time.UTC)
	reportRows := func(filePaths string) *sqlmock.Rows {
		return sqlmock.NewRows([]string{
			"id", "title", "report_type", "category", "start_date", "end_date",
			"device_filters", "status", "file_formats", "file_paths", "file_sizes",
			"created_at", "updated_at",
		}).AddRow(
			63,
			"巡检日报_2026-05-06",
			"alert",
			"daily",
			now,
			now.Add(24*time.Hour),
			[]byte(`{"report_data":{"summary":{"alerts":3},"notes":"旧报表重渲染验证"}}`),
			"completed",
			[]byte(`["pdf","html"]`),
			[]byte(filePaths),
			[]byte(`{"pdf":123,"html":456}`),
			now,
			now,
		)
	}

	mock.ExpectQuery(`(?is)SELECT .* FROM "reports" .*WHERE "reports"\."id" = .* LIMIT .*`).
		WithArgs(63, 1).
		WillReturnRows(reportRows(`{"pdf":"old-report.pdf","html":"old-report.html"}`))
	mock.ExpectExec(`(?is)UPDATE "reports" SET .*file_paths.*file_sizes.* WHERE id = .*`).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery(`(?is)SELECT .* FROM "reports" .*WHERE "reports"\."id" = .* LIMIT .*`).
		WithArgs(63, 1).
		WillReturnRows(reportRows(`{"pdf":"new-report.pdf","html":"old-report.html"}`))

	ctx, rec := newEchoContextWithBody(http.MethodPost, "/api/v1/reports/63/rerender/pdf", token, nil)
	ctx.SetParamNames("report_id")
	ctx.SetParamValues("63")

	if err := handler.RerenderReportPDF(ctx); err != nil {
		t.Fatalf("RerenderReportPDF() error = %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var payload struct {
		Success bool `json:"success"`
		Data    struct {
			Format      string `json:"format"`
			DownloadURL string `json:"download_url"`
			PreviewURL  string `json:"preview_url"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("响应 JSON 解析失败: %v", err)
	}
	if !payload.Success {
		t.Fatalf("期望 success=true，body=%s", rec.Body.String())
	}
	if payload.Data.Format != "pdf" {
		t.Fatalf("期望重渲染格式为 pdf，got=%q", payload.Data.Format)
	}
	if !strings.HasPrefix(payload.Data.DownloadURL, "/api/v1/reports/files/report-63-") ||
		!strings.HasSuffix(payload.Data.DownloadURL, ".pdf") {
		t.Fatalf("期望返回新 PDF 下载地址，got=%q", payload.Data.DownloadURL)
	}
	if payload.Data.PreviewURL != payload.Data.DownloadURL {
		t.Fatalf("期望 PDF 预览地址与下载地址一致，preview=%q download=%q", payload.Data.PreviewURL, payload.Data.DownloadURL)
	}

	matches, err := filepath.Glob(filepath.Join(outputDir, "report-63-*.pdf"))
	if err != nil {
		t.Fatalf("查找生成文件失败: %v", err)
	}
	if len(matches) != 1 {
		t.Fatalf("期望生成 1 个新 PDF 文件，实际=%d files=%v", len(matches), matches)
	}
	if info, err := os.Stat(matches[0]); err != nil || info.Size() == 0 {
		t.Fatalf("期望新 PDF 文件存在且非空，info=%v err=%v", info, err)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}
