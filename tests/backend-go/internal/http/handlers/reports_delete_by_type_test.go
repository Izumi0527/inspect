package handlers_test

import (
	"encoding/json"
	"errors"
	"net/http"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/labstack/echo/v4"
	"go.uber.org/zap"

	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	"github.com/your-org/inspect-system/backend-go/internal/reports"
)

func newDeleteByTypeHandler(t *testing.T) (handlers.ReportsHandler, sqlmock.Sqlmock, string, func()) {
	t.Helper()
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	authService, token := newAuthServiceWithPermissions(t, []string{"reports:delete"})
	h := handlers.ReportsHandler{
		Service: reports.NewService(gormDB, zap.NewNop()),
		Auth:    authService,
	}
	return h, mock, token, cleanup
}

func TestReportsHandler_DeleteReportsByType_DeletesOnlyRequestedType(t *testing.T) {
	// 场景：巡检报告页「全部删除」只应清掉 report_type='inspection' 的行，
	// 返回体回报实际删除条数，供前端 toast 展示。
	h, mock, token, cleanup := newDeleteByTypeHandler(t)
	defer cleanup()

	ctx, rec := newEchoContextWithBody(http.MethodDelete, "/api/v1/reports?type=inspection", token, nil)

	mock.ExpectQuery(`SELECT .*id.*file_paths.* FROM .*reports.* WHERE report_type = \$1`).
		WithArgs("inspection").
		WillReturnRows(sqlmock.NewRows([]string{"id", "file_paths"}))
	mock.ExpectExec(`DELETE FROM .*reports.* WHERE report_type = \$1`).
		WithArgs("inspection").
		WillReturnResult(sqlmock.NewResult(0, 3))

	if err := h.DeleteReportsByType(ctx); err != nil {
		t.Fatalf("DeleteReportsByType() error = %v, body=%s", err, rec.Body.String())
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var payload struct {
		Success bool `json:"success"`
		Data    struct {
			Deleted int64 `json:"deleted"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("invalid json: %v, body=%s", err, rec.Body.String())
	}
	if !payload.Success {
		t.Fatalf("success = false, body=%s", rec.Body.String())
	}
	if payload.Data.Deleted != 3 {
		t.Fatalf("data.deleted = %d, want 3", payload.Data.Deleted)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestReportsHandler_DeleteReportsByType_RejectsMissingType(t *testing.T) {
	// 场景：不带 type 直接 DELETE /reports 必须 400，绝不能退化为「删光所有报表」。
	h, mock, token, cleanup := newDeleteByTypeHandler(t)
	defer cleanup()

	ctx, rec := newEchoContextWithBody(http.MethodDelete, "/api/v1/reports", token, nil)

	err := h.DeleteReportsByType(ctx)
	var httpErr *echo.HTTPError
	if !errors.As(err, &httpErr) {
		t.Fatalf("expected *echo.HTTPError, got %T (%v), body=%s", err, err, rec.Body.String())
	}
	if httpErr.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", httpErr.Code, http.StatusBadRequest)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("no SQL should run on missing type: %v", err)
	}
}

func TestReportsHandler_DeleteReportsByType_RejectsUnknownType(t *testing.T) {
	// 场景：normalizeReportType 会把未知值兜底成 "custom"，
	// 若不拦截，`type=garbage` 会静默删掉全部 custom 报表。
	h, mock, token, cleanup := newDeleteByTypeHandler(t)
	defer cleanup()

	ctx, rec := newEchoContextWithBody(http.MethodDelete, "/api/v1/reports?type=garbage", token, nil)

	err := h.DeleteReportsByType(ctx)
	var httpErr *echo.HTTPError
	if !errors.As(err, &httpErr) {
		t.Fatalf("expected *echo.HTTPError, got %T (%v), body=%s", err, err, rec.Body.String())
	}
	if httpErr.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d", httpErr.Code, http.StatusBadRequest)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("no SQL should run on unknown type: %v", err)
	}
}
