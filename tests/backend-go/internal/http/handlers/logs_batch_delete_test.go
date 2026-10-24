package handlers_test

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	"github.com/your-org/inspect-system/backend-go/internal/logs"
	"go.uber.org/zap"
)

func logColumns() []string {
	return []string{
		"id", "device_id", "level", "facility", "source", "message",
		"raw_message", "source_ip", "source_process", "log_timestamp",
		"collected_at", "created_at", "self_generated", "device_name", "device_ip",
	}
}

func TestBatchDeleteLogs_ExplicitIDs_Success(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"system:logs:manage"})
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	svc := logs.NewService(gormDB, zap.NewNop())
	h := handlers.LogsHandler{
		Service: svc,
		Auth:    authSvc,
	}

	mock.ExpectExec(`DELETE FROM "device_logs" WHERE id IN \(\$1,\$2\)`).
		WithArgs(10, 20).
		WillReturnResult(sqlmock.NewResult(0, 2))

	payload := map[string]interface{}{
		"log_ids": []int{10, 20},
	}
	body, _ := json.Marshal(payload)
	ctx, rec := newEchoContextWithBody(http.MethodPost, "/api/v1/logs/batch-delete", token, body)

	if err := h.BatchDeleteLogs(ctx); err != nil {
		t.Fatalf("BatchDeleteLogs failed: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body=%s", rec.Code, rec.Body.String())
	}

	var resp struct {
		DeletedCount int64 `json:"deleted_count"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal error: %v", err)
	}
	if resp.DeletedCount != 2 {
		t.Fatalf("expected deleted_count=2, got %d", resp.DeletedCount)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations: %v", err)
	}
}

func TestBatchDeleteLogs_ExplicitIDs_Empty(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"system:logs:manage"})
	gormDB, _, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	svc := logs.NewService(gormDB, zap.NewNop())
	h := handlers.LogsHandler{
		Service: svc,
		Auth:    authSvc,
	}

	payload := map[string]interface{}{
		"log_ids": []int{},
	}
	body, _ := json.Marshal(payload)
	ctx, _ := newEchoContextWithBody(http.MethodPost, "/api/v1/logs/batch-delete", token, body)

	err := h.BatchDeleteLogs(ctx)
	assertHTTPErrorCode(t, err, http.StatusBadRequest)
}

func TestBatchDeleteLogs_SelectAllFiltered_WithExcludes(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"system:logs:manage"})
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	svc := logs.NewService(gormDB, zap.NewNop())
	h := handlers.LogsHandler{
		Service: svc,
		Auth:    authSvc,
	}

	startTime := time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)
	now := time.Now().UTC()

	// 1. Mock Count for ListLogs
	mock.ExpectQuery(`SELECT count\(\*\) FROM device_logs AS l LEFT JOIN devices d ON d.id = l.device_id WHERE l.level = \$1 AND l.log_timestamp >= \$2 AND l.self_generated = \$3`).
		WithArgs("error", startTime, false).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(3))

	// 2. Mock Scan for ListLogs
	mock.ExpectQuery(`SELECT l\.\*, d\.name AS device_name, d\.ip_address AS device_ip FROM device_logs AS l LEFT JOIN devices d ON d\.id = l\.device_id WHERE l\.level = \$1 AND l\.log_timestamp >= \$2 AND l\.self_generated = \$3 ORDER BY l\.log_timestamp desc LIMIT \$4`).
		WithArgs("error", startTime, false, 1000).
		WillReturnRows(sqlmock.NewRows(logColumns()).
			AddRow(101, 1, "error", "daemon", "syslog", "msg1", nil, nil, nil, now, now, now, false, "dev1", "10.0.0.1").
			AddRow(102, 1, "error", "daemon", "syslog", "msg2", nil, nil, nil, now, now, now, false, "dev1", "10.0.0.1").
			AddRow(103, 1, "error", "daemon", "syslog", "msg3", nil, nil, nil, now, now, now, false, "dev1", "10.0.0.1"))

	// 3. Mock Delete where id IN (101, 103) because 102 is in exclude_ids
	mock.ExpectExec(`DELETE FROM "device_logs" WHERE id IN \(\$1,\$2\)`).
		WithArgs(101, 103).
		WillReturnResult(sqlmock.NewResult(0, 2))

	payload := map[string]interface{}{
		"select_all_filtered": true,
		"exclude_ids":         []int{102},
		"level":               "error",
		"start_time":          "2026-06-01T00:00:00Z",
	}
	body, _ := json.Marshal(payload)
	ctx, rec := newEchoContextWithBody(http.MethodPost, "/api/v1/logs/batch-delete", token, body)

	if err := h.BatchDeleteLogs(ctx); err != nil {
		t.Fatalf("BatchDeleteLogs failed: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body=%s", rec.Code, rec.Body.String())
	}

	var resp struct {
		DeletedCount int64 `json:"deleted_count"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal error: %v", err)
	}
	if resp.DeletedCount != 2 {
		t.Fatalf("expected deleted_count=2, got %d", resp.DeletedCount)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations: %v", err)
	}
}

func TestBatchDeleteLogs_SelectAllFiltered_EmptyMatch(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"system:logs:manage"})
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	svc := logs.NewService(gormDB, zap.NewNop())
	h := handlers.LogsHandler{
		Service: svc,
		Auth:    authSvc,
	}

	startTime := time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)

	// Mock Count for ListLogs returning 0
	mock.ExpectQuery(`SELECT count\(\*\) FROM device_logs AS l LEFT JOIN devices d ON d.id = l.device_id WHERE l.level = \$1 AND l.log_timestamp >= \$2 AND l.self_generated = \$3`).
		WithArgs("debug", startTime, false).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))

	// Mock Scan for ListLogs returning 0 rows
	mock.ExpectQuery(`SELECT l\.\*, d\.name AS device_name, d\.ip_address AS device_ip FROM device_logs AS l LEFT JOIN devices d ON d\.id = l\.device_id WHERE l\.level = \$1 AND l\.log_timestamp >= \$2 AND l\.self_generated = \$3 ORDER BY l\.log_timestamp desc LIMIT \$4`).
		WithArgs("debug", startTime, false, 1000).
		WillReturnRows(sqlmock.NewRows(logColumns()))

	payload := map[string]interface{}{
		"selectAllFiltered": true,
		"level":             "debug",
		"startTime":         "2026-06-01T00:00:00Z",
	}
	body, _ := json.Marshal(payload)
	ctx, rec := newEchoContextWithBody(http.MethodPost, "/api/v1/logs/batch-delete", token, body)

	if err := h.BatchDeleteLogs(ctx); err != nil {
		t.Fatalf("BatchDeleteLogs failed: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body=%s", rec.Code, rec.Body.String())
	}

	var resp struct {
		DeletedCount int64 `json:"deleted_count"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal error: %v", err)
	}
	if resp.DeletedCount != 0 {
		t.Fatalf("expected deleted_count=0, got %d", resp.DeletedCount)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations: %v", err)
	}
}
