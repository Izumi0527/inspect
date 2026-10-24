package handlers_test

import (
	"encoding/json"
	"net/http"
	"regexp"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/labstack/echo/v4"
	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	"github.com/your-org/inspect-system/backend-go/internal/inspection"
	"go.uber.org/zap"
)

// ============================================================================
// 巡检策略批量删除测试 (BatchDeleteStrategies)
// ============================================================================

func TestBatchDeleteStrategies_ExplicitIDs(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"inspections:delete"})
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	svc := inspection.NewService(gormDB, zap.NewNop())
	h := handlers.InspectionHandler{
		Service: svc,
		Auth:    authSvc,
		Logger:  zap.NewNop(),
	}

	mock.ExpectExec(regexp.QuoteMeta(`DELETE FROM "inspection_strategies" WHERE id IN ($1,$2)`)).
		WithArgs(10, 20).
		WillReturnResult(sqlmock.NewResult(0, 2))

	bodyBytes, _ := json.Marshal(map[string]interface{}{
		"selectAllFiltered": false,
		"ids":               []int{10, 20},
	})
	ctx, rec := newEchoContextWithBody(http.MethodPost, "/api/v1/inspection/strategies/batch-delete", token, bodyBytes)

	if err := h.BatchDeleteStrategies(ctx); err != nil {
		t.Fatalf("BatchDeleteStrategies error: %v", err)
	}

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body: %s", rec.Code, rec.Body.String())
	}

	var resp struct {
		Code    int    `json:"code"`
		Message string `json:"message"`
		Data    struct {
			DeletedCount int `json:"deletedCount"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal error: %v", err)
	}
	if resp.Data.DeletedCount != 2 {
		t.Fatalf("expected deletedCount 2, got %d", resp.Data.DeletedCount)
	}
}

func TestBatchDeleteStrategies_EmptyIDsReturns400(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"inspections:delete"})
	gormDB, _, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	svc := inspection.NewService(gormDB, zap.NewNop())
	h := handlers.InspectionHandler{
		Service: svc,
		Auth:    authSvc,
		Logger:  zap.NewNop(),
	}

	bodyBytes, _ := json.Marshal(map[string]interface{}{
		"selectAllFiltered": false,
		"ids":               []int{},
	})
	ctx, _ := newEchoContextWithBody(http.MethodPost, "/api/v1/inspection/strategies/batch-delete", token, bodyBytes)

	err := h.BatchDeleteStrategies(ctx)
	if err == nil {
		t.Fatalf("expected error for empty ids, got nil")
	}
	if httpErr, ok := err.(*echo.HTTPError); ok {
		if httpErr.Code != http.StatusBadRequest {
			t.Fatalf("expected status 400, got %d", httpErr.Code)
		}
	}
}

func TestBatchDeleteStrategies_SelectAllFiltered(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"inspections:delete"})
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	svc := inspection.NewService(gormDB, zap.NewNop())
	h := handlers.InspectionHandler{
		Service: svc,
		Auth:    authSvc,
		Logger:  zap.NewNop(),
	}

	// 查出匹配的 ID: 101, 102
	mock.ExpectQuery(regexp.QuoteMeta(`SELECT "id" FROM "inspection_strategies" WHERE type = $1 AND enabled = $2 AND id NOT IN ($3)`)).
		WithArgs("scheduled", true, 99).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(101).AddRow(102))

	mock.ExpectExec(regexp.QuoteMeta(`DELETE FROM "inspection_strategies" WHERE id IN ($1,$2)`)).
		WithArgs(101, 102).
		WillReturnResult(sqlmock.NewResult(0, 2))

	enabled := true
	bodyBytes, _ := json.Marshal(map[string]interface{}{
		"selectAllFiltered": true,
		"type":              "scheduled",
		"enabled":           &enabled,
		"excludeIds":        []int{99},
	})
	ctx, rec := newEchoContextWithBody(http.MethodPost, "/api/v1/inspection/strategies/batch-delete", token, bodyBytes)

	if err := h.BatchDeleteStrategies(ctx); err != nil {
		t.Fatalf("BatchDeleteStrategies error: %v", err)
	}

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body: %s", rec.Code, rec.Body.String())
	}

	var resp struct {
		Data struct {
			DeletedCount int `json:"deletedCount"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal error: %v", err)
	}
	if resp.Data.DeletedCount != 2 {
		t.Fatalf("expected deletedCount 2, got %d", resp.Data.DeletedCount)
	}
}

// ============================================================================
// 巡检模板批量删除测试 (BatchDeleteTemplates)
// ============================================================================

func TestBatchDeleteTemplates_ExplicitIDs_CustomTemplates(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"inspections:delete"})
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	svc := inspection.NewService(gormDB, zap.NewNop())
	h := handlers.InspectionHandler{
		Service: svc,
		Auth:    authSvc,
		Logger:  zap.NewNop(),
	}

	now := time.Now().UTC()
	// 查询出 2 个自定义模板 (is_default = false)
	mock.ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "inspection_templates" WHERE id IN ($1,$2)`)).
		WithArgs(10, 20).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "name", "description", "category", "device_types", "check_items", "is_default", "is_active", "created_at", "updated_at",
		}).AddRow(10, "自定义模板A", nil, "general", []byte(`["switch"]`), []byte(`[]`), false, true, now, now).
			AddRow(20, "自定义模板B", nil, "general", []byte(`["router"]`), []byte(`[]`), false, true, now, now))

	mock.ExpectExec(regexp.QuoteMeta(`DELETE FROM "inspection_templates" WHERE id IN ($1,$2) AND is_default = $3`)).
		WithArgs(10, 20, false).
		WillReturnResult(sqlmock.NewResult(0, 2))

	bodyBytes, _ := json.Marshal(map[string]interface{}{
		"selectAllFiltered": false,
		"ids":               []int{10, 20},
	})
	ctx, rec := newEchoContextWithBody(http.MethodPost, "/api/v1/inspection/templates/batch-delete", token, bodyBytes)

	if err := h.BatchDeleteTemplates(ctx); err != nil {
		t.Fatalf("BatchDeleteTemplates error: %v", err)
	}

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body: %s", rec.Code, rec.Body.String())
	}

	var resp struct {
		Data struct {
			DeletedCount int `json:"deletedCount"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal error: %v", err)
	}
	if resp.Data.DeletedCount != 2 {
		t.Fatalf("expected deletedCount 2, got %d", resp.Data.DeletedCount)
	}
}

func TestBatchDeleteTemplates_ExplicitIDs_ContainsBuiltInReturns403(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"inspections:delete"})
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	svc := inspection.NewService(gormDB, zap.NewNop())
	h := handlers.InspectionHandler{
		Service: svc,
		Auth:    authSvc,
		Logger:  zap.NewNop(),
	}

	now := time.Now().UTC()
	// 查询出 1 个自定义模板和 1 个内置模板 (is_default = true)
	mock.ExpectQuery(regexp.QuoteMeta(`SELECT * FROM "inspection_templates" WHERE id IN ($1,$2)`)).
		WithArgs(1, 2).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "name", "description", "category", "device_types", "check_items", "is_default", "is_active", "created_at", "updated_at",
		}).AddRow(1, "内置交换机巡检模板", nil, "general", []byte(`["switch"]`), []byte(`[]`), true, true, now, now).
			AddRow(2, "自定义模板", nil, "general", []byte(`["router"]`), []byte(`[]`), false, true, now, now))

	bodyBytes, _ := json.Marshal(map[string]interface{}{
		"selectAllFiltered": false,
		"ids":               []int{1, 2},
	})
	ctx, _ := newEchoContextWithBody(http.MethodPost, "/api/v1/inspection/templates/batch-delete", token, bodyBytes)

	err := h.BatchDeleteTemplates(ctx)
	if err == nil {
		t.Fatalf("expected 403 error for built-in template, got nil")
	}
	if httpErr, ok := err.(*echo.HTTPError); ok {
		if httpErr.Code != http.StatusForbidden {
			t.Fatalf("expected status 403, got %d", httpErr.Code)
		}
	} else {
		t.Fatalf("expected *echo.HTTPError, got %T: %v", err, err)
	}
}

func TestBatchDeleteTemplates_SelectAllFiltered_SkipsBuiltIn(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"inspections:delete"})
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	svc := inspection.NewService(gormDB, zap.NewNop())
	h := handlers.InspectionHandler{
		Service: svc,
		Auth:    authSvc,
		Logger:  zap.NewNop(),
	}

	// 全选筛选结果：强制携带 is_default = false，排除内置模板
	mock.ExpectQuery(regexp.QuoteMeta(`SELECT "id" FROM "inspection_templates" WHERE is_default = $1 AND category = $2 AND id NOT IN ($3)`)).
		WithArgs(false, "security", 30).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(11).AddRow(12))

	mock.ExpectExec(regexp.QuoteMeta(`DELETE FROM "inspection_templates" WHERE id IN ($1,$2) AND is_default = $3`)).
		WithArgs(11, 12, false).
		WillReturnResult(sqlmock.NewResult(0, 2))

	bodyBytes, _ := json.Marshal(map[string]interface{}{
		"selectAllFiltered": true,
		"category":          "security",
		"excludeIds":        []int{30},
	})
	ctx, rec := newEchoContextWithBody(http.MethodPost, "/api/v1/inspection/templates/batch-delete", token, bodyBytes)

	if err := h.BatchDeleteTemplates(ctx); err != nil {
		t.Fatalf("BatchDeleteTemplates error: %v", err)
	}

	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body: %s", rec.Code, rec.Body.String())
	}

	var resp struct {
		Data struct {
			DeletedCount int `json:"deletedCount"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal error: %v", err)
	}
	if resp.Data.DeletedCount != 2 {
		t.Fatalf("expected deletedCount 2, got %d", resp.Data.DeletedCount)
	}
}
