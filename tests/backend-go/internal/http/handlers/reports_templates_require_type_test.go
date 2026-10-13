package handlers_test

import (
	"errors"
	"net/http"
	"testing"

	"github.com/labstack/echo/v4"
	"go.uber.org/zap"

	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	"github.com/your-org/inspect-system/backend-go/internal/reports"
)

// POST /reports/templates 的 report_type 必填：
// 模板库查询排除 report_type='custom'（已下线自定义报表页的遗留类型），
// 若继续默认 custom，不带类型创建出来的模板会静默从模板库消失。

func newCreateTemplateHandler(t *testing.T) (handlers.ReportsHandler, func(), string) {
	t.Helper()
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	authService, token := newAuthServiceWithPermissions(t, []string{"reports:create"})
	h := handlers.ReportsHandler{
		Service: reports.NewService(gormDB, zap.NewNop()),
		Auth:    authService,
	}
	t.Cleanup(func() {
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Errorf("no SQL should run on rejected template payload: %v", err)
		}
	})
	return h, func() {
		cleanup()
	}, token
}

func assertBadRequest(t *testing.T, err error) {
	t.Helper()
	var httpErr *echo.HTTPError
	if !errors.As(err, &httpErr) {
		t.Fatalf("expected *echo.HTTPError, got %T (%v)", err, err)
	}
	if httpErr.Code != http.StatusBadRequest {
		t.Fatalf("status = %d, want %d (%v)", httpErr.Code, http.StatusBadRequest, httpErr.Message)
	}
}

func TestReportsHandler_CreateTemplate_RequiresReportType(t *testing.T) {
	h, cleanup, token := newCreateTemplateHandler(t)
	defer cleanup()

	ctx, _ := newEchoContextWithBody(http.MethodPost, "/api/v1/reports/templates", token, []byte(`{"name":"季度模板","type":"standard"}`))

	assertBadRequest(t, h.CreateTemplate(ctx))
}

func TestReportsHandler_CreateTemplate_RejectsUnknownReportType(t *testing.T) {
	h, cleanup, token := newCreateTemplateHandler(t)
	defer cleanup()

	ctx, _ := newEchoContextWithBody(http.MethodPost, "/api/v1/reports/templates", token, []byte(`{"name":"季度模板","report_type":"garbage"}`))

	assertBadRequest(t, h.CreateTemplate(ctx))
}
