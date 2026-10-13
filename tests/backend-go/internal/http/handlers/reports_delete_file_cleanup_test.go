package handlers_test

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/labstack/echo/v4"
)

// 报表删除（单条 / 按类型批量）在删行之后要回收落盘文件：
//   - 只回收 OutputDir 之内的文件，与下载接口共用同一目录边界；
//   - 文件回收失败不影响删除请求本身。

func writeTempReportFile(t *testing.T, dir string, name string) string {
	t.Helper()
	path := filepath.Join(dir, name)
	if err := os.WriteFile(path, []byte("pdf"), 0o644); err != nil {
		t.Fatalf("write temp file: %v", err)
	}
	return path
}

func filePathsJSON(t *testing.T, path string) []byte {
	t.Helper()
	raw, err := json.Marshal(map[string]string{"pdf": path})
	if err != nil {
		t.Fatalf("marshal file_paths: %v", err)
	}
	return raw
}

func assertRemoved(t *testing.T, path string) {
	t.Helper()
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("expected %s to be removed, stat err = %v", path, err)
	}
}

func assertKept(t *testing.T, path string) {
	t.Helper()
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("expected %s to be kept, stat err = %v", path, err)
	}
}

func TestReportsHandler_DeleteReportsByType_RemovesFilesInsideOutputDirOnly(t *testing.T) {
	h, mock, token, cleanup := newDeleteByTypeHandler(t)
	defer cleanup()

	outputDir := t.TempDir()
	h.OutputDir = outputDir
	inside := writeTempReportFile(t, outputDir, "inspection-1.pdf")
	// 脏数据：file_paths 指到输出目录之外，绝不能跟着删
	outside := writeTempReportFile(t, t.TempDir(), "unrelated.pdf")

	ctx, rec := newEchoContextWithBody(http.MethodDelete, "/api/v1/reports?type=inspection", token, nil)

	mock.ExpectQuery(`SELECT .*id.*file_paths.* FROM .*reports.* WHERE report_type = \$1`).
		WithArgs("inspection").
		WillReturnRows(sqlmock.NewRows([]string{"id", "file_paths"}).
			AddRow(1, filePathsJSON(t, inside)).
			AddRow(2, filePathsJSON(t, outside)))
	mock.ExpectExec(`DELETE FROM .*reports.* WHERE report_type = \$1`).
		WithArgs("inspection").
		WillReturnResult(sqlmock.NewResult(0, 2))

	if err := h.DeleteReportsByType(ctx); err != nil {
		t.Fatalf("DeleteReportsByType() error = %v, body=%s", err, rec.Body.String())
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}

	assertRemoved(t, inside)
	assertKept(t, outside)
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestReportsHandler_DeleteReport_RemovesGeneratedFile(t *testing.T) {
	h, mock, token, cleanup := newDeleteByTypeHandler(t)
	defer cleanup()

	outputDir := t.TempDir()
	h.OutputDir = outputDir
	generated := writeTempReportFile(t, outputDir, "inspection-42.pdf")

	ctx, rec := newEchoContextWithBody(http.MethodDelete, "/api/v1/reports/42", token, nil)
	ctx.SetParamNames("report_id")
	ctx.SetParamValues("42")

	mock.ExpectQuery(`SELECT .* FROM .*reports.* WHERE .*id.* = \$1`).
		WithArgs(42, sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{"id", "report_type", "file_paths"}).
			AddRow(42, "inspection", filePathsJSON(t, generated)))
	mock.ExpectExec(`DELETE FROM .*reports.* WHERE .*id.* = \$1`).
		WithArgs(42).
		WillReturnResult(sqlmock.NewResult(0, 1))

	if err := h.DeleteReport(ctx); err != nil {
		t.Fatalf("DeleteReport() error = %v, body=%s", err, rec.Body.String())
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}

	assertRemoved(t, generated)
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestReportsHandler_DeleteReport_ReturnsNotFoundForMissingReport(t *testing.T) {
	h, mock, token, cleanup := newDeleteByTypeHandler(t)
	defer cleanup()

	ctx, rec := newEchoContextWithBody(http.MethodDelete, "/api/v1/reports/404", token, nil)
	ctx.SetParamNames("report_id")
	ctx.SetParamValues("404")

	mock.ExpectQuery(`SELECT .* FROM .*reports.* WHERE .*id.* = \$1`).
		WithArgs(404, sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{"id", "report_type", "file_paths"}))

	err := h.DeleteReport(ctx)
	var httpErr *echo.HTTPError
	if !errors.As(err, &httpErr) {
		t.Fatalf("expected *echo.HTTPError, got %T (%v), body=%s", err, err, rec.Body.String())
	}
	if httpErr.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want %d", httpErr.Code, http.StatusNotFound)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("no DELETE should run for a missing report: %v", err)
	}
}
