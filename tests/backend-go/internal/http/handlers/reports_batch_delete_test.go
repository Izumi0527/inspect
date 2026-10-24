package handlers_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/labstack/echo/v4"
)

func TestBatchDeleteReports_ExplicitIDs_Success(t *testing.T) {
	h, mock, token, cleanup := newDeleteByTypeHandler(t)
	defer cleanup()

	outputDir := t.TempDir()
	h.OutputDir = outputDir
	inside := writeTempReportFile(t, outputDir, "inspection-1.pdf")
	outside := writeTempReportFile(t, t.TempDir(), "unrelated.pdf")

	payload := map[string]interface{}{
		"ids": []string{"1", "2"},
	}
	body, _ := json.Marshal(payload)
	ctx, rec := newEchoContextWithBody(http.MethodPost, "/api/v1/reports/batch-delete", token, body)

	mock.ExpectQuery(`SELECT \* FROM "reports" WHERE id IN \(\$1,\$2\)`).
		WithArgs(1, 2).
		WillReturnRows(sqlmock.NewRows([]string{"id", "title", "report_type", "file_paths"}).
			AddRow(1, "Report 1", "inspection", filePathsJSON(t, inside)).
			AddRow(2, "Report 2", "inspection", filePathsJSON(t, outside)))

	mock.ExpectExec(`DELETE FROM "reports" WHERE id IN \(\$1,\$2\)`).
		WithArgs(1, 2).
		WillReturnResult(sqlmock.NewResult(0, 2))

	if err := h.BatchDeleteReports(ctx); err != nil {
		t.Fatalf("BatchDeleteReports failed: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body = %s", rec.Code, http.StatusOK, rec.Body.String())
	}

	assertRemoved(t, inside)
	assertKept(t, outside)

	var resp struct {
		Success bool `json:"success"`
		Data    struct {
			Deleted      int64 `json:"deleted"`
			DeletedCount int64 `json:"deletedCount"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}
	if !resp.Success || resp.Data.DeletedCount != 2 {
		t.Fatalf("expected deletedCount=2, got %d, body=%s", resp.Data.DeletedCount, rec.Body.String())
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("mock expectations not met: %v", err)
	}
}

func TestBatchDeleteReports_EmptyIDs_BadRequest(t *testing.T) {
	h, _, token, cleanup := newDeleteByTypeHandler(t)
	defer cleanup()

	payload := map[string]interface{}{
		"ids": []string{},
	}
	body, _ := json.Marshal(payload)
	ctx, _ := newEchoContextWithBody(http.MethodPost, "/api/v1/reports/batch-delete", token, body)

	err := h.BatchDeleteReports(ctx)
	if err == nil {
		t.Fatalf("expected error for empty ids, got nil")
	}
	he, ok := err.(*echo.HTTPError)
	if !ok || he.Code != http.StatusBadRequest {
		t.Fatalf("expected HTTP 400, got %v", err)
	}
}

func TestBatchDeleteReports_SelectAllFiltered_Success(t *testing.T) {
	h, mock, token, cleanup := newDeleteByTypeHandler(t)
	defer cleanup()

	outputDir := t.TempDir()
	h.OutputDir = outputDir
	file1 := writeTempReportFile(t, outputDir, "filtered-1.pdf")

	payload := map[string]interface{}{
		"selectAllFiltered": true,
		"type":              "inspection",
		"status":            "completed",
		"excludeIds":        []string{"3"},
		"format":            "pdf",
		"search":            "每日巡检",
	}
	body, _ := json.Marshal(payload)
	ctx, rec := newEchoContextWithBody(http.MethodPost, "/api/v1/reports/batch-delete", token, body)

	formatsPDF, _ := json.Marshal([]string{"pdf"})
	formatsExcel, _ := json.Marshal([]string{"excel"})

	mock.ExpectQuery(`SELECT \* FROM "reports" WHERE report_type = \$1 AND status = \$2 AND id NOT IN \(\$3\)`).
		WithArgs("inspection", "completed", 3).
		WillReturnRows(sqlmock.NewRows([]string{"id", "title", "description", "report_type", "status", "file_formats", "file_paths"}).
			AddRow(1, "每日巡检报告 A", "巡检记录", "inspection", "completed", formatsPDF, filePathsJSON(t, file1)).
			AddRow(2, "每日巡检报告 B", "巡检记录", "inspection", "completed", formatsExcel, []byte(`{}`)).
			AddRow(4, "月度趋势", "趋势", "inspection", "completed", formatsPDF, []byte(`{}`)))

	mock.ExpectExec(`DELETE FROM "reports" WHERE id IN \(\$1\)`).
		WithArgs(1).
		WillReturnResult(sqlmock.NewResult(0, 1))

	if err := h.BatchDeleteReports(ctx); err != nil {
		t.Fatalf("BatchDeleteReports failed: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body = %s", rec.Code, http.StatusOK, rec.Body.String())
	}

	assertRemoved(t, file1)

	var resp struct {
		Success bool `json:"success"`
		Data    struct {
			Deleted      int64 `json:"deleted"`
			DeletedCount int64 `json:"deletedCount"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}
	if resp.Data.DeletedCount != 1 {
		t.Fatalf("expected deletedCount=1, got %d, body=%s", resp.Data.DeletedCount, rec.Body.String())
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("mock expectations not met: %v", err)
	}
}

func TestBatchDeleteReports_SelectAllFiltered_NoneMatched(t *testing.T) {
	h, mock, token, cleanup := newDeleteByTypeHandler(t)
	defer cleanup()

	payload := map[string]interface{}{
		"selectAllFiltered": true,
		"type":              "inspection",
		"search":            "不存在的关键词",
	}
	body, _ := json.Marshal(payload)
	ctx, rec := newEchoContextWithBody(http.MethodPost, "/api/v1/reports/batch-delete", token, body)

	mock.ExpectQuery(`SELECT \* FROM "reports" WHERE report_type = \$1`).
		WithArgs("inspection").
		WillReturnRows(sqlmock.NewRows([]string{"id", "title", "description", "report_type"}))

	if err := h.BatchDeleteReports(ctx); err != nil {
		t.Fatalf("BatchDeleteReports failed: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body = %s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var resp struct {
		Success bool `json:"success"`
		Data    struct {
			DeletedCount int64 `json:"deletedCount"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("failed to parse response: %v", err)
	}
	if resp.Data.DeletedCount != 0 {
		t.Fatalf("expected deletedCount=0, got %d", resp.Data.DeletedCount)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("mock expectations not met: %v", err)
	}
}
