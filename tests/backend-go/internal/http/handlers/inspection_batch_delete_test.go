package handlers_test

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/labstack/echo/v4"
	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	"github.com/your-org/inspect-system/backend-go/internal/inspection"
	"go.uber.org/zap"
)

func TestBatchDeleteExecutions_ExplicitIDs_Success(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"inspections:delete"})
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	svc := inspection.NewService(gormDB, zap.NewNop())
	h := handlers.InspectionHandler{
		Service: svc,
		Auth:    authSvc,
		Logger:  zap.NewNop(),
	}

	startTime := time.Date(2026, 6, 30, 9, 0, 0, 0, time.UTC)

	// Batch 1: batch-1 (ids: 10, 11)
	mock.ExpectQuery(`SELECT \* FROM "inspections" WHERE batch_id = \$1 ORDER BY id ASC`).
		WithArgs("batch-1").
		WillReturnRows(sqlmock.NewRows(batchedInspectionColumns()).
			AddRow(10, 101, nil, 1, "巡检", inspection.TriggerManual, inspection.StatusCompleted,
				nil, startTime, startTime.Add(time.Minute), 60, 5, 5, 0, 0, 0, nil, []byte(`{}`),
				nil, nil, nil, "tester", startTime, startTime, "batch-1").
			AddRow(11, 102, nil, 1, "巡检", inspection.TriggerManual, inspection.StatusCompleted,
				nil, startTime, startTime.Add(time.Minute), 60, 5, 5, 0, 0, 0, nil, []byte(`{}`),
				nil, nil, nil, "tester", startTime, startTime, "batch-1"))

	// Batch 2: batch-2 (id: 20)
	mock.ExpectQuery(`SELECT \* FROM "inspections" WHERE batch_id = \$1 ORDER BY id ASC`).
		WithArgs("batch-2").
		WillReturnRows(sqlmock.NewRows(batchedInspectionColumns()).
			AddRow(20, 103, nil, 1, "巡检", inspection.TriggerManual, inspection.StatusFailed,
				nil, startTime, startTime.Add(time.Minute), 60, 5, 3, 2, 0, 0, nil, []byte(`{}`),
				nil, nil, nil, "tester", startTime, startTime, "batch-2"))

	// Delete in transaction
	mock.ExpectBegin()
	mock.ExpectExec(`DELETE FROM "inspection_results" WHERE inspection_id IN \(\$1,\$2,\$3\)`).
		WithArgs(10, 11, 20).
		WillReturnResult(sqlmock.NewResult(0, 3))
	mock.ExpectExec(`DELETE FROM "inspections" WHERE id IN \(\$1,\$2,\$3\)`).
		WithArgs(10, 11, 20).
		WillReturnResult(sqlmock.NewResult(0, 3))
	mock.ExpectCommit()

	payload := map[string]interface{}{
		"ids":               []string{"batch-1", "batch-2"},
		"selectAllFiltered": false,
	}
	body, _ := json.Marshal(payload)
	ctx, rec := newEchoContextWithBody(http.MethodPost, "/api/v1/inspection/executions/batch-delete", token, body)

	if err := h.BatchDeleteExecutions(ctx); err != nil {
		t.Fatalf("BatchDeleteExecutions: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var resp struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
		Data    struct {
			DeletedCount int `json:"deletedCount"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	if resp.Data.DeletedCount != 2 {
		t.Errorf("expected deletedCount=2, got %d", resp.Data.DeletedCount)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations: %v", err)
	}
}

func TestBatchDeleteExecutions_ExplicitIDs_RunningInterception(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"inspections:delete"})
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	svc := inspection.NewService(gormDB, zap.NewNop())
	h := handlers.InspectionHandler{
		Service: svc,
		Auth:    authSvc,
		Logger:  zap.NewNop(),
	}

	startTime := time.Date(2026, 6, 30, 9, 0, 0, 0, time.UTC)

	// Batch containing running row
	mock.ExpectQuery(`SELECT \* FROM "inspections" WHERE batch_id = \$1 ORDER BY id ASC`).
		WithArgs("batch-running").
		WillReturnRows(sqlmock.NewRows(batchedInspectionColumns()).
			AddRow(30, 101, nil, 1, "巡检", inspection.TriggerManual, inspection.StatusRunning,
				nil, startTime, nil, 0, 0, 0, 0, 0, 0, nil, []byte(`{}`),
				nil, nil, nil, "tester", startTime, startTime, "batch-running"))

	payload := map[string]interface{}{
		"ids": []string{"batch-running"},
	}
	body, _ := json.Marshal(payload)
	ctx, _ := newEchoContextWithBody(http.MethodPost, "/api/v1/inspection/executions/batch-delete", token, body)

	err := h.BatchDeleteExecutions(ctx)
	if err == nil {
		t.Fatalf("expected error for running task, got nil")
	}
	he, ok := err.(*echo.HTTPError)
	if !ok || he.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request, got %v", err)
	}
	if he.Message != "无法删除正在执行的任务，请先停止任务" {
		t.Errorf("unexpected error message: %v", he.Message)
	}
}

func TestBatchDeleteExecutions_ExplicitIDs_Empty(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"inspections:delete"})
	gormDB, _, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	svc := inspection.NewService(gormDB, zap.NewNop())
	h := handlers.InspectionHandler{
		Service: svc,
		Auth:    authSvc,
		Logger:  zap.NewNop(),
	}

	payload := map[string]interface{}{
		"ids": []string{},
	}
	body, _ := json.Marshal(payload)
	ctx, _ := newEchoContextWithBody(http.MethodPost, "/api/v1/inspection/executions/batch-delete", token, body)

	err := h.BatchDeleteExecutions(ctx)
	if err == nil {
		t.Fatalf("expected error for empty ids, got nil")
	}
	he, ok := err.(*echo.HTTPError)
	if !ok || he.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request, got %v", err)
	}
}

func TestBatchDeleteExecutions_SelectAllFiltered_Success(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"inspections:delete"})
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	svc := inspection.NewService(gormDB, zap.NewNop())
	h := handlers.InspectionHandler{
		Service: svc,
		Auth:    authSvc,
		Logger:  zap.NewNop(),
	}

	startTime := time.Date(2026, 6, 30, 9, 0, 0, 0, time.UTC)

	// queryExecutionGroups:
	// 1. count
	mock.ExpectQuery(`SELECT count\(\*\) FROM \(SELECT CASE WHEN batch_id.*AS group_key FROM "inspections".*HAVING.*bool_or\(status IN \(\$1\)\)\) AS grouped_executions`).
		WithArgs(inspection.StatusCompleted).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(3))

	// 2. keys
	mock.ExpectQuery(`SELECT CASE WHEN batch_id.*AS group_key, MIN\(id\) AS min_id.*ORDER BY start_time DESC, min_id DESC`).
		WithArgs(inspection.StatusCompleted, 10000).
		WillReturnRows(sqlmock.NewRows([]string{"group_key", "min_id", "start_time"}).
			AddRow("g-ok", 1, startTime).
			AddRow("g-excluded", 2, startTime).
			AddRow("g-running", 3, startTime))

	// 3. fetch rows
	mock.ExpectQuery(`SELECT \*, CASE WHEN batch_id.*AS group_key FROM "inspections" WHERE CASE WHEN batch_id.*IN \(\$1,\$2,\$3\)`).
		WithArgs("g-ok", "g-excluded", "g-running").
		WillReturnRows(sqlmock.NewRows(append(batchedInspectionColumns(), "group_key")).
			AddRow(1, 101, nil, 1, "ok", inspection.TriggerManual, inspection.StatusCompleted,
				nil, startTime, startTime, 10, 1, 1, 0, 0, 0, nil, []byte(`{}`), nil, nil, nil, nil, startTime, startTime, "b-ok", "g-ok").
			AddRow(2, 102, nil, 1, "excluded", inspection.TriggerManual, inspection.StatusCompleted,
				nil, startTime, startTime, 10, 1, 1, 0, 0, 0, nil, []byte(`{}`), nil, nil, nil, nil, startTime, startTime, "b-excluded", "g-excluded").
			AddRow(3, 103, nil, 1, "running", inspection.TriggerManual, inspection.StatusRunning,
				nil, startTime, nil, 0, 0, 0, 0, 0, 0, nil, []byte(`{}`), nil, nil, nil, nil, startTime, startTime, "b-running", "g-running"))

	// Delete remaining valid batch (only ID 1 from b-ok)
	mock.ExpectBegin()
	mock.ExpectExec(`DELETE FROM "inspection_results" WHERE inspection_id IN \(\$1\)`).
		WithArgs(1).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(`DELETE FROM "inspections" WHERE id IN \(\$1\)`).
		WithArgs(1).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectCommit()

	payload := map[string]interface{}{
		"selectAllFiltered": true,
		"status":            "completed",
		"excludeIds":        []string{"b-excluded"},
	}
	body, _ := json.Marshal(payload)
	ctx, rec := newEchoContextWithBody(http.MethodPost, "/api/v1/inspection/executions/batch-delete", token, body)

	if err := h.BatchDeleteExecutions(ctx); err != nil {
		t.Fatalf("BatchDeleteExecutions: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}

	var resp struct {
		Code int `json:"code"`
		Data struct {
			DeletedCount int `json:"deletedCount"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("Unmarshal: %v", err)
	}
	if resp.Data.DeletedCount != 1 {
		t.Errorf("expected deletedCount=1, got %d", resp.Data.DeletedCount)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations: %v", err)
	}
}

func TestBatchDeleteExecutions_SelectAllFiltered_NoDeletable(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"inspections:delete"})
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	svc := inspection.NewService(gormDB, zap.NewNop())
	h := handlers.InspectionHandler{
		Service: svc,
		Auth:    authSvc,
		Logger:  zap.NewNop(),
	}

	startTime := time.Date(2026, 6, 30, 9, 0, 0, 0, time.UTC)

	// count = 1
	mock.ExpectQuery(`SELECT count\(\*\) FROM \(SELECT CASE WHEN batch_id.*AS group_key FROM "inspections" GROUP BY CASE WHEN batch_id.*\) AS grouped_executions`).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))

	// key
	mock.ExpectQuery(`SELECT CASE WHEN batch_id.*AS group_key, MIN\(id\) AS min_id.*ORDER BY start_time DESC, min_id DESC`).
		WithArgs(10000).
		WillReturnRows(sqlmock.NewRows([]string{"group_key", "min_id", "start_time"}).
			AddRow("g-running", 1, startTime))

	// row
	mock.ExpectQuery(`SELECT \*, CASE WHEN batch_id.*AS group_key FROM "inspections" WHERE CASE WHEN batch_id.*IN \(\$1\)`).
		WithArgs("g-running").
		WillReturnRows(sqlmock.NewRows(append(batchedInspectionColumns(), "group_key")).
			AddRow(1, 101, nil, 1, "running", inspection.TriggerManual, inspection.StatusRunning,
				nil, startTime, nil, 0, 0, 0, 0, 0, 0, nil, []byte(`{}`), nil, nil, nil, nil, startTime, startTime, "b-running", "g-running"))

	payload := map[string]interface{}{
		"selectAllFiltered": true,
	}
	body, _ := json.Marshal(payload)
	ctx, _ := newEchoContextWithBody(http.MethodPost, "/api/v1/inspection/executions/batch-delete", token, body)

	err := h.BatchDeleteExecutions(ctx)
	if err == nil {
		t.Fatalf("expected error when no deletable batches, got nil")
	}
	he, ok := err.(*echo.HTTPError)
	if !ok || he.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 Bad Request, got %v", err)
	}
	if he.Message != "没有可删除的执行记录" {
		t.Errorf("unexpected error message: %v", he.Message)
	}
}
