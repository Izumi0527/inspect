package handlers_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/labstack/echo/v4"
	"go.uber.org/zap"

	"github.com/your-org/inspect-system/backend-go/internal/auth"
	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
)

func TestMonitoringHandler_ReadEndpointPermission(t *testing.T) {
	readDeniedAuth, deniedToken := newAuthServiceWithPermissions(t, []string{"monitoring:control"})
	readAllowedAuth, allowedToken := newAuthServiceWithPermissions(t, []string{"monitoring:read"})

	h := handlers.MonitoringHandler{Auth: readDeniedAuth}
	ctx := newEchoContext(http.MethodGet, "/api/v1/monitoring/stats", deniedToken)
	err := h.GetMonitoringStats(ctx)
	assertHTTPErrorCode(t, err, http.StatusForbidden)

	h = handlers.MonitoringHandler{Auth: readAllowedAuth}
	ctx = newEchoContext(http.MethodGet, "/api/v1/monitoring/stats", allowedToken)
	err = h.GetMonitoringStats(ctx)
	assertHTTPErrorCode(t, err, http.StatusServiceUnavailable)
}

func TestMonitoringHandler_ControlEndpointPermission(t *testing.T) {
	readOnlyAuth, readOnlyToken := newAuthServiceWithPermissions(t, []string{"monitoring:read"})
	controlAuth, controlToken := newAuthServiceWithPermissions(t, []string{"monitoring:control"})

	h := handlers.MonitoringHandler{Auth: readOnlyAuth}
	ctx := newEchoContext(http.MethodPost, "/api/v1/monitoring/devices/5/stop", readOnlyToken)
	ctx.SetParamNames("device_id")
	ctx.SetParamValues("5")
	err := h.StopDeviceMonitoring(ctx)
	assertHTTPErrorCode(t, err, http.StatusForbidden)

	h = handlers.MonitoringHandler{Auth: controlAuth}
	ctx = newEchoContext(http.MethodPost, "/api/v1/monitoring/devices/5/stop", controlToken)
	ctx.SetParamNames("device_id")
	ctx.SetParamValues("5")
	err = h.StopDeviceMonitoring(ctx)
	assertHTTPErrorCode(t, err, http.StatusServiceUnavailable)
}

// 监控服务启停端点是 Python 版后台循环的遗留外壳：Go 版采集由调度任务驱动，stop 之后采集照跑。
// 端点已删除，避免调用方误以为能停掉监控。
func TestMonitoringHandler_ServiceStartStopRoutesRemoved(t *testing.T) {
	e := echo.New()
	handlers.MonitoringHandler{}.Register(e.Group("/api/v1"))

	for _, route := range e.Routes() {
		if route.Method != http.MethodPost {
			continue
		}
		if route.Path == "/api/v1/monitoring/start" || route.Path == "/api/v1/monitoring/stop" {
			t.Fatalf("路由 %s %s 仍被注册，应已删除", route.Method, route.Path)
		}
	}
}

// 设备启停端点的真实效果是「告警静默」：只写 is_monitored（告警评估器据此跳过该设备），
// 采集照常；请求体里的 interval 不再生效也不再回显（monitor_interval 从未驱动任何调度）。
func TestStopDeviceMonitoring_OnlyTogglesAlertMute(t *testing.T) {
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()
	authService, token := newAuthServiceWithPermissions(t, []string{"monitoring:control"})
	h := handlers.MonitoringHandler{Auth: authService, Writer: monitoring.NewMetricsWriter(gormDB, nil, zap.NewNop())}

	mock.ExpectExec(`(?is)^UPDATE "devices" SET "is_monitored"=\$1 WHERE id = \$2$`).
		WithArgs(false, 5).
		WillReturnResult(sqlmock.NewResult(0, 1))

	ctx, rec := newEchoContextWithBody(http.MethodPost, "/api/v1/monitoring/devices/5/stop", token, []byte(`{"interval":60}`))
	ctx.SetParamNames("device_id")
	ctx.SetParamValues("5")
	if err := h.StopDeviceMonitoring(ctx); err != nil {
		t.Fatalf("StopDeviceMonitoring() error = %v", err)
	}

	var body map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("响应不是 JSON: %v", err)
	}
	if _, ok := body["interval"]; ok {
		t.Fatalf("响应仍包含 interval: %v", body)
	}
	if body["enabled"] != false || body["device_id"] != float64(5) {
		t.Fatalf("响应 = %v，want enabled=false device_id=5", body)
	}
	message, _ := body["message"].(string)
	if !strings.Contains(message, "告警") {
		t.Fatalf("message = %q，应说明这是告警开关（采集不受影响）", message)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

// 监控设备列表不再回显 monitor_interval（该字段从未驱动调度）。
func TestListMonitoringDevices_ContractHasNoMonitorInterval(t *testing.T) {
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()
	authService, token := newAuthServiceWithPermissions(t, []string{"monitoring:read"})
	h := handlers.MonitoringHandler{Auth: authService, Writer: monitoring.NewMetricsWriter(gormDB, nil, zap.NewNop())}

	mock.ExpectQuery(`(?is)^SELECT id, name, ip_address, status, is_monitored, last_seen FROM "devices" WHERE is_active = \$1 ORDER BY id ASC$`).
		WithArgs(true).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "ip_address", "status", "is_monitored", "last_seen"}).
			AddRow(5, "CORE-A", "10.0.0.5", "online", false, nil))

	ctx, rec := newEchoContextWithBody(http.MethodGet, "/api/v1/monitoring/devices", token, nil)
	if err := h.ListMonitoringDevices(ctx); err != nil {
		t.Fatalf("ListMonitoringDevices() error = %v", err)
	}

	var items []map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &items); err != nil {
		t.Fatalf("响应不是 JSON 数组: %v (%s)", err, rec.Body.String())
	}
	if len(items) != 1 {
		t.Fatalf("items = %v，want 1 条", items)
	}
	if _, ok := items[0]["monitor_interval"]; ok {
		t.Fatalf("响应仍包含 monitor_interval: %v", items[0])
	}
	if items[0]["is_monitored"] != false {
		t.Fatalf("is_monitored = %v，want false", items[0]["is_monitored"])
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestMonitoringHandler_ExportEndpointPermission(t *testing.T) {
	readOnlyAuth, readOnlyToken := newAuthServiceWithPermissions(t, []string{"monitoring:read"})
	exportAuth, exportToken := newAuthServiceWithPermissions(t, []string{"monitoring:export"})

	h := handlers.MonitoringHandler{Auth: readOnlyAuth}
	ctx := newEchoContext(http.MethodPost, "/api/v1/monitoring/reports/export", readOnlyToken)
	err := h.ExportMonitoringReport(ctx)
	assertHTTPErrorCode(t, err, http.StatusForbidden)

	h = handlers.MonitoringHandler{Auth: exportAuth}
	ctx = newEchoContext(http.MethodPost, "/api/v1/monitoring/reports/export", exportToken)
	err = h.ExportMonitoringReport(ctx)
	assertHTTPErrorCode(t, err, http.StatusServiceUnavailable)

	ctx = newEchoContext(http.MethodGet, "/api/v1/monitoring/reports/download/demo.csv", exportToken)
	ctx.SetParamNames("filename")
	ctx.SetParamValues("demo.csv")
	err = h.DownloadMonitoringReport(ctx)
	assertHTTPErrorCode(t, err, http.StatusServiceUnavailable)
}

func newEchoContext(method string, path string, token string) echo.Context {
	e := echo.New()
	req := httptest.NewRequest(method, path, nil)
	if token != "" {
		req.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	return e.NewContext(req, rec)
}

func assertHTTPErrorCode(t *testing.T, err error, want int) {
	t.Helper()
	if err == nil {
		t.Fatalf("expected http error %d, got nil", want)
	}
	httpErr, ok := err.(*echo.HTTPError)
	if !ok {
		t.Fatalf("expected *echo.HTTPError, got %T", err)
	}
	if httpErr.Code != want {
		t.Fatalf("status = %d, want %d", httpErr.Code, want)
	}
}

type fakePermissionService struct {
	permissions []string
}

func (s fakePermissionService) GetActiveUserFromToken(_ context.Context, _ string) (*auth.UserRecord, error) {
	return &auth.UserRecord{
		Username: "tester",
		Role:     "viewer",
	}, nil
}

func (s fakePermissionService) GetPermissionsByRole(_ context.Context, _ string) ([]string, error) {
	return append([]string{}, s.permissions...), nil
}

func newAuthServiceWithPermissions(t *testing.T, permissions []string) (handlers.PermissionService, string) {
	t.Helper()
	return fakePermissionService{permissions: permissions}, "test-token"
}
