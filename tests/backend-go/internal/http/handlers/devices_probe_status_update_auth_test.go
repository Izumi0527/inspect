package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/labstack/echo/v4"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/devices"
	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
)

func newFastProbeService() *devices.ProbeService {
	icmpProber := func(ctx context.Context, ipAddress string) (bool, *float64, *string) {
		// 单测中不依赖系统 ping，直接返回“可达”即可。
		rt := 1.0
		return true, &rt, nil
	}
	snmpProber := func(
		ctx context.Context,
		ipAddress string,
		snmpCommunity *string,
		snmpVersion *string,
		snmpPort *int,
		tags interface{},
	) (bool, *float64, *string, *string) {
		// 单测中不做真实 SNMP 访问，返回“未配置”即可。
		msg := "SNMP not configured"
		return false, nil, nil, &msg
	}
	return devices.NewProbeServiceWithProbers(nil, icmpProber, snmpProber)
}

func TestDevicesHandler_HealthCheckDevice_ShouldDowngradeUpdateStatusWithoutDevicesUpdatePermission(t *testing.T) {
	authService, token := newAuthServiceWithPermissions(t, []string{"devices:read"})
	db, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	mock.ExpectQuery(`(?i)SELECT .* FROM .*devices.* WHERE .*id.* = \$1.*LIMIT \$2`).
		WithArgs(1, 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "ip_address"}).AddRow(1, "dev-1", "127.0.0.1"))

	h := handlers.DevicesHandler{
		Service: devices.NewService(db, nil),
		Probe:   newFastProbeService(),
		Auth:    authService,
	}

	ctx, rec := newEchoContextWithBody(http.MethodPost, "/api/v1/devices/1/health-check", token, nil)
	ctx.SetParamNames("device_id")
	ctx.SetParamValues("1")
	// 说明：探测会调用系统 ping；此处使用 127.0.0.1 且 SNMP 未配置，通常会很快返回。
	ctx.SetRequest(ctx.Request().WithContext(context.Background()))

	if err := h.HealthCheckDevice(ctx); err != nil {
		t.Fatalf("handler returned error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusOK)
	}

	var payload map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("invalid json response: %v", err)
	}
	if got, _ := payload["status_updated"].(bool); got {
		t.Fatalf("status_updated=%v, want false", got)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sql expectations not met: %v", err)
	}
}

func TestDevicesHandler_HealthCheckDevice_ShouldWriteStatusWithDevicesUpdatePermission(t *testing.T) {
	authService, token := newAuthServiceWithPermissions(t, []string{"devices:read", "devices:update"})
	db, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	mock.ExpectQuery(`(?i)SELECT .* FROM .*devices.* WHERE .*id.* = \$1.*LIMIT \$2`).
		WithArgs(1, 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "ip_address"}).AddRow(1, "dev-1", "127.0.0.1"))

	mock.ExpectExec(`(?i)UPDATE .*devices.* SET .* WHERE .*id.* = \$[0-9]+`).
		WillReturnResult(sqlmock.NewResult(0, 1))

	h := handlers.DevicesHandler{
		Service: devices.NewService(db, nil),
		Probe:   newFastProbeService(),
		Auth:    authService,
	}

	ctx, rec := newEchoContextWithBody(http.MethodPost, "/api/v1/devices/1/health-check", token, nil)
	ctx.SetParamNames("device_id")
	ctx.SetParamValues("1")
	ctx.SetRequest(ctx.Request().WithContext(context.Background()))

	if err := h.HealthCheckDevice(ctx); err != nil {
		t.Fatalf("handler returned error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusOK)
	}

	var payload map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("invalid json response: %v", err)
	}
	if got, _ := payload["status_updated"].(bool); !got {
		t.Fatalf("status_updated=%v, want true", got)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sql expectations not met: %v", err)
	}
}

func TestDevicesHandler_ProbeDevice_ResponseShouldIncludeStatusUpdated(t *testing.T) {
	authService, token := newAuthServiceWithPermissions(t, []string{"devices:read"})
	db, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	mock.ExpectQuery(`(?i)SELECT .* FROM .*devices.* WHERE .*id.* = \$1.*LIMIT \$2`).
		WithArgs(1, 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "ip_address"}).AddRow(1, "dev-1", "127.0.0.1"))

	h := handlers.DevicesHandler{
		Service: devices.NewService(db, nil),
		Probe:   newFastProbeService(),
		Auth:    authService,
	}

	ctx, rec := newEchoContextWithBody(http.MethodPost, "/api/v1/devices/1/probe", token, nil)
	ctx.SetParamNames("device_id")
	ctx.SetParamValues("1")
	ctx.SetRequest(ctx.Request().WithContext(context.Background()))

	if err := h.ProbeDevice(ctx); err != nil {
		t.Fatalf("handler returned error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusOK)
	}

	var payload map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("invalid json response: %v", err)
	}
	if _, ok := payload["status_updated"]; !ok {
		t.Fatalf("status_updated missing in response")
	}
	if got, _ := payload["status_updated"].(bool); got {
		t.Fatalf("status_updated=%v, want false", got)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sql expectations not met: %v", err)
	}
}

func TestDevicesHandler_BatchProbeDevices_ShouldDowngradeUpdateStatusWithoutDevicesUpdatePermission(t *testing.T) {
	authService, token := newAuthServiceWithPermissions(t, []string{"devices:read"})
	db, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	mock.ExpectQuery(`(?i)SELECT .* FROM .*devices.* WHERE .*id.* IN \(\$1\)`).
		WithArgs(1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "ip_address"}).AddRow(1, "dev-1", "127.0.0.1"))

	h := handlers.DevicesHandler{
		Service: devices.NewService(db, nil),
		Probe:   newFastProbeService(),
		Auth:    authService,
	}

	reqBody := []byte(`{"device_ids":[1]}`)
	ctx, rec := newEchoContextWithBody(http.MethodPost, "/api/v1/devices/batch-probe", token, reqBody)

	if err := h.BatchProbeDevices(ctx); err != nil {
		t.Fatalf("handler returned error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusOK)
	}

	var payload map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("invalid json response: %v", err)
	}
	if got, _ := payload["status_updated"].(bool); got {
		t.Fatalf("status_updated=%v, want false", got)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sql expectations not met: %v", err)
	}
}

func TestDevicesHandler_BatchProbeDevices_ShouldWriteStatusWithDevicesUpdatePermission(t *testing.T) {
	authService, token := newAuthServiceWithPermissions(t, []string{"devices:read", "devices:update"})
	db, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	mock.ExpectQuery(`(?i)SELECT .* FROM .*devices.* WHERE .*id.* IN \(\$1\)`).
		WithArgs(1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "ip_address"}).AddRow(1, "dev-1", "127.0.0.1"))

	mock.ExpectExec(`(?i)UPDATE .*devices.* SET .* WHERE .*id.* = \$[0-9]+`).
		WillReturnResult(sqlmock.NewResult(0, 1))

	h := handlers.DevicesHandler{
		Service: devices.NewService(db, nil),
		Probe:   newFastProbeService(),
		Auth:    authService,
	}

	reqBody := []byte(`{"device_ids":[1]}`)
	ctx, rec := newEchoContextWithBody(http.MethodPost, "/api/v1/devices/batch-probe", token, reqBody)

	if err := h.BatchProbeDevices(ctx); err != nil {
		t.Fatalf("handler returned error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusOK)
	}

	var payload map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("invalid json response: %v", err)
	}
	if got, _ := payload["status_updated"].(bool); !got {
		t.Fatalf("status_updated=%v, want true", got)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sql expectations not met: %v", err)
	}
}

func TestDevicesHandler_BatchProbeDevices_ShouldValidateAndDedupeDeviceIDs(t *testing.T) {
	authService, token := newAuthServiceWithPermissions(t, []string{"devices:read"})
	h := handlers.DevicesHandler{
		Service: &devices.Service{},
		Probe:   newFastProbeService(),
		Auth:    authService,
	}

	// dedupePositiveInts 会剔除非正数，最终为空时应返回 400，而不是进入后续 DB 查询。
	ctx, _ := newEchoContextWithBody(http.MethodPost, "/api/v1/devices/batch-probe", token, []byte(`{"device_ids":[0,-1,0]}`))
	err := h.BatchProbeDevices(ctx)
	assertHTTPErrorCode(t, err, http.StatusBadRequest)

	// 数量上限 maxBatchDeviceIDs(1000)
	tooLarge := buildDeviceIDsPayloadJSON(1001)
	ctx, _ = newEchoContextWithBody(http.MethodPost, "/api/v1/devices/batch-probe", token, tooLarge)
	err = h.BatchProbeDevices(ctx)
	assertHTTPErrorCode(t, err, http.StatusBadRequest)
}

func TestDevicesHandler_CollectDeviceMetrics_ShouldRequireDevicesUpdatePermission(t *testing.T) {
	readOnlyAuth, token := newAuthServiceWithPermissions(t, []string{"devices:read"})

	h := handlers.DevicesHandler{
		Service:       &devices.Service{},
		SNMPCollector: &devices.SNMPCollector{},
		Metrics:       &monitoring.MetricsWriter{},
		Auth:          readOnlyAuth,
	}

	ctx, _ := newEchoContextWithBody(http.MethodPost, "/api/v1/devices/1/collect-metrics", token, nil)
	ctx.SetParamNames("device_id")
	ctx.SetParamValues("1")
	err := h.CollectDeviceMetrics(ctx)
	assertHTTPErrorCode(t, err, http.StatusForbidden)
}

func TestDevicesHandler_BatchCollectMetrics_ShouldValidateDeviceIDsAndRequireUpdatePermission(t *testing.T) {
	readOnlyAuth, token := newAuthServiceWithPermissions(t, []string{"devices:read"})
	updateAuth, updateToken := newAuthServiceWithPermissions(t, []string{"devices:update"})

	h := handlers.DevicesHandler{
		Service:       &devices.Service{},
		SNMPCollector: &devices.SNMPCollector{},
		Metrics:       &monitoring.MetricsWriter{},
		Auth:          readOnlyAuth,
	}

	// 只读权限应直接 403
	ctx, _ := newEchoContextWithBody(http.MethodPost, "/api/v1/devices/batch-collect-metrics", token, []byte(`{"device_ids":[1]}`))
	err := h.BatchCollectMetrics(ctx)
	assertHTTPErrorCode(t, err, http.StatusForbidden)

	// 有更新权限时：dedupePositiveInts 剔除非正数，最终为空应返回 400
	h.Auth = updateAuth
	ctx, _ = newEchoContextWithBody(http.MethodPost, "/api/v1/devices/batch-collect-metrics", updateToken, []byte(`{"device_ids":[0,-1,0]}`))
	err = h.BatchCollectMetrics(ctx)
	assertHTTPErrorCode(t, err, http.StatusBadRequest)

	// 数量上限 maxBatchDeviceIDs(1000)
	tooLarge := buildDeviceIDsPayloadJSON(1001)
	ctx, _ = newEchoContextWithBody(http.MethodPost, "/api/v1/devices/batch-collect-metrics", updateToken, tooLarge)
	err = h.BatchCollectMetrics(ctx)
	assertHTTPErrorCode(t, err, http.StatusBadRequest)
}

func newGormDBWithSqlmock(t *testing.T) (*gorm.DB, sqlmock.Sqlmock, func()) {
	t.Helper()

	sqlDB, mock, err := sqlmock.New(sqlmock.QueryMatcherOption(sqlmock.QueryMatcherRegexp))
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}

	gormDB, err := gorm.Open(postgres.New(postgres.Config{
		Conn:                 sqlDB,
		PreferSimpleProtocol: true,
	}), &gorm.Config{
		SkipDefaultTransaction: true,
		DisableAutomaticPing:   true,
	})
	if err != nil {
		_ = sqlDB.Close()
		t.Fatalf("gorm.Open: %v", err)
	}

	cleanup := func() {
		_ = sqlDB.Close()
	}
	return gormDB, mock, cleanup
}

func newEchoContextWithBody(method string, path string, token string, body []byte) (echo.Context, *httptest.ResponseRecorder) {
	e := echo.New()
	var reader *bytes.Reader
	if body == nil {
		reader = bytes.NewReader([]byte{})
	} else {
		reader = bytes.NewReader(body)
	}
	req := httptest.NewRequest(method, path, reader)
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	if token != "" {
		req.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	return e.NewContext(req, rec), rec
}

func buildDeviceIDsPayloadJSON(n int) []byte {
	if n <= 0 {
		return []byte(`{"device_ids":[]}`)
	}
	parts := make([]string, 0, n)
	for i := 1; i <= n; i++ {
		parts = append(parts, fmt.Sprintf("%d", i))
	}
	return []byte(`{"device_ids":[` + strings.Join(parts, ",") + `]}`)
}
