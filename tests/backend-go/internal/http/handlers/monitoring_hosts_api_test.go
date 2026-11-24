package handlers_test

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/labstack/echo/v4"
	"go.uber.org/zap"

	"github.com/your-org/inspect-system/backend-go/internal/devices"
	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
)

func TestMonitoringHosts_EngineHealthReturnsWhitelistSnapshot(t *testing.T) {
	writer := monitoring.NewMetricsWriter(nil, nil, zap.NewNop())
	until := time.Now().UTC().Add(5 * time.Minute)
	writer.EngineHealthTracker().RecordRoundFinish(
		time.Now().UTC(),
		420,
		10,
		9,
		1,
		[]monitoring.BackoffDeviceSummary{
			{
				DeviceID:            7,
				DeviceName:          "sw-core-01",
				LastErrorCode:       monitoring.CollectionErrorAuthFailed,
				LastErrorMessage:    "raw secret leaked",
				ConsecutiveFailures: 3,
				BackoffUntil:        &until,
			},
		},
	)

	authService, token := newAuthServiceWithPermissions(t, []string{"monitoring:read"})
	h := handlers.MonitoringHandler{Writer: writer, Auth: authService}

	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/monitoring/engine-health", nil)
	req.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	if err := h.GetEngineHealth(c); err != nil {
		e.HTTPErrorHandler(err, c)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200, body=%s", rec.Code, rec.Body.String())
	}

	var snap monitoring.EngineHealthSnapshot
	if err := json.Unmarshal(rec.Body.Bytes(), &snap); err != nil {
		t.Fatalf("unmarshal err=%v", err)
	}
	if snap.DurationMS != 420 || snap.BackoffDevices != 1 || len(snap.BackoffDeviceList) != 1 {
		t.Fatalf("unexpected snapshot: %+v", snap)
	}
	if strings.Contains(snap.BackoffDeviceList[0].LastErrorMessage, "secret") {
		t.Fatalf("expected whitelisted error message, got %q", snap.BackoffDeviceList[0].LastErrorMessage)
	}
	if snap.BackoffDeviceList[0].LastErrorMessage != monitoring.SafeCollectionErrorMessage(monitoring.CollectionErrorAuthFailed) {
		t.Fatalf("unexpected error message: %q", snap.BackoffDeviceList[0].LastErrorMessage)
	}
}

func TestMonitoringHosts_ListHosts_SortWhitelistAndPageOnlySparklineAndRBAC(t *testing.T) {
	db, mock, cleanup := newMonitoringHandlerGormDBWithSQLMock(t)
	defer cleanup()

	authService, token := newAuthServiceWithPermissions(t, []string{"monitoring:read"})
	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())
	h := handlers.MonitoringHandler{Writer: writer, Auth: authService}

	mock.ExpectQuery(`(?is)SELECT count\(\*\) FROM devices AS d.*`).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))

	// 验证 sort_by SQL 注入字符串被白名单拦截，不会出现在 ORDER BY 中
	mock.ExpectQuery(`(?is)SELECT .* FROM devices AS d .* ORDER BY CASE .* LIMIT \$2`).
		WithArgs(true, 20).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "name", "ip_address", "hostname", "device_type", "vendor", "model",
			"group_id", "group_name", "status", "is_monitored",
			"cpu_usage", "memory_usage", "temperature", "uptime", "response_time", "last_seen",
			"icmp_status", "snmp_status", "cli_protocol",
			"last_error_code", "consecutive_failures", "backoff_until", "last_success_at", "last_duration_ms",
		}).AddRow(
			11, "core-sw-11", "10.0.0.11", nil, "switch", "huawei", nil,
			nil, "", "online", true,
			35.5, 40.2, nil, nil, nil, nil,
			"online", "success", nil,
			"", 0, nil, nil, 0,
		))

	mock.ExpectQuery(`(?is)SELECT .* FROM "user_pinned_devices".*`).
		WillReturnRows(sqlmock.NewRows([]string{"device_id"}))
	mock.ExpectQuery(`(?is)SELECT device_id, name, alias, is_up FROM "device_interfaces".*`).
		WillReturnRows(sqlmock.NewRows([]string{"device_id", "name", "alias", "is_up"}).
			AddRow(11, "if1", "GigabitEthernet0/0/1", true).
			AddRow(11, "if2", "GigabitEthernet0/0/2", true).
			AddRow(11, "if3", "InLoopBack0", true))
	mock.ExpectQuery(`(?is)SELECT .* FROM "device_latest_metrics".*`).
		WillReturnRows(sqlmock.NewRows([]string{"device_id", "metric_value"}).AddRow(11, 0.0))
	// 仅对当前页设备 ID=11 查 12 点 Sparkline
	mock.ExpectQuery(`(?is)SELECT device_id, collected_at, metric_value FROM .* WHERE device_id IN \(\$1\) AND metric_name = 'cpu_usage'.*`).
		WithArgs(11, 12).
		WillReturnRows(sqlmock.NewRows([]string{"device_id", "collected_at", "metric_value"}).AddRow(11, time.Now().UTC(), 35.5))

	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/monitoring/hosts?sort_by=cpu_usage;DROP%20TABLE%20devices--&page=1&page_size=20", nil)
	req.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	if err := h.ListMonitoringHosts(c); err != nil {
		e.HTTPErrorHandler(err, c)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200, body=%s", rec.Code, rec.Body.String())
	}

	var resp monitoring.HostsMatrixResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal err=%v", err)
	}
	if !resp.LimitedByPermission || resp.Permissions.Alerts.Allowed || resp.Permissions.Inspections.Allowed || resp.Permissions.Logs.Allowed {
		t.Fatalf("expected cross-module permissions limited, got %+v", resp.Permissions)
	}
	if len(resp.Items) != 1 || resp.Items[0].ActiveAlertCount != nil || resp.Items[0].LatestInspectionScore != nil || resp.Items[0].ErrorLogCount24h != nil {
		t.Fatalf("expected gated fields to be nil, got %+v", resp.Items)
	}
	if resp.Items[0].InterfacesUp != 2 || resp.Items[0].InterfacesTotal != 2 || resp.Items[0].HardwareStatus != monitoring.HardwareStatusHealthy || resp.Items[0].HardwareFaultCount != 0 {
		t.Fatalf("unexpected port/hardware summary: %+v", resp.Items[0])
	}
	if len(resp.Items[0].Sparkline) != 1 {
		t.Fatalf("expected 1 sparkline point for page device, got %d", len(resp.Items[0].Sparkline))
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestMonitoringHosts_PinsExceed50Returns400(t *testing.T) {
	db, mock, cleanup := newMonitoringHandlerGormDBWithSQLMock(t)
	defer cleanup()

	authService, token := newAuthServiceWithPermissions(t, []string{"monitoring:read"})
	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())
	h := handlers.MonitoringHandler{Writer: writer, Auth: authService}

	mock.ExpectBegin()
	mock.ExpectQuery(`(?is)SELECT id FROM "devices" WHERE id = \$1.*`).
		WithArgs(99, 1).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(99))
	mock.ExpectQuery(`(?is)SELECT count\(\*\) FROM "user_pinned_devices" WHERE user_id = \$1 AND device_id = \$2`).
		WithArgs("00000000-0000-0000-0000-000000000001", 99).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery(`(?is)SELECT count\(\*\) FROM "user_pinned_devices" WHERE user_id = \$1`).
		WithArgs("00000000-0000-0000-0000-000000000001").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(50))
	mock.ExpectRollback()

	e := echo.New()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/monitoring/pins/99", strings.NewReader(`{"user_id":"attacker-id"}`))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	req.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	c.SetParamNames("device_id")
	c.SetParamValues("99")

	err := h.PinMonitoringDevice(c)
	assertHTTPErrorCode(t, err, http.StatusBadRequest)
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestMonitoringHosts_TopNAndAdhocValidation(t *testing.T) {
	authService, token := newAuthServiceWithPermissions(t, []string{"monitoring:read"})
	writer := monitoring.NewMetricsWriter(nil, nil, zap.NewNop())
	h := handlers.MonitoringHandler{Writer: writer, Auth: authService}

	// TopN 非法指标返回 400
	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/monitoring/topn?metric=drop_table", nil)
	req.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	assertHTTPErrorCode(t, h.GetMonitoringTopN(c), http.StatusBadRequest)

	// TopN 非法 device_ids 返回 400
	for _, query := range []string{"device_ids=abc", "device_ids=1,0", "device_ids=1,-2", "device_ids=1,,2"} {
		badReq := httptest.NewRequest(http.MethodGet, "/api/v1/monitoring/topn?metric=cpu&"+query, nil)
		badReq.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
		badRec := httptest.NewRecorder()
		badCtx := e.NewContext(badReq, badRec)
		assertHTTPErrorCode(t, h.GetMonitoringTopN(badCtx), http.StatusBadRequest)
	}

	// TopN device_ids 超过上限返回 400
	overLimitParts := make([]string, monitoring.MaxTopNDeviceIDs+1)
	for i := range overLimitParts {
		overLimitParts[i] = fmt.Sprintf("%d", i+1)
	}
	overReq := httptest.NewRequest(http.MethodGet, "/api/v1/monitoring/topn?metric=cpu&device_ids="+strings.Join(overLimitParts, ","), nil)
	overReq.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
	overRec := httptest.NewRecorder()
	overCtx := e.NewContext(overReq, overRec)
	assertHTTPErrorCode(t, h.GetMonitoringTopN(overCtx), http.StatusBadRequest)

	// Adhoc 超过 6 条序列返回 400
	body := `{"series":[
		{"device_id":1,"metric_name":"cpu_usage"},
		{"device_id":2,"metric_name":"cpu_usage"},
		{"device_id":3,"metric_name":"cpu_usage"},
		{"device_id":4,"metric_name":"cpu_usage"},
		{"device_id":5,"metric_name":"cpu_usage"},
		{"device_id":6,"metric_name":"cpu_usage"},
		{"device_id":7,"metric_name":"cpu_usage"}
	],"time_range":"24h"}`
	req2 := httptest.NewRequest(http.MethodPost, "/api/v1/monitoring/graphs/adhoc", strings.NewReader(body))
	req2.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	req2.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
	rec2 := httptest.NewRecorder()
	c2 := e.NewContext(req2, rec2)
	assertHTTPErrorCode(t, h.GetMonitoringAdhocGraphs(c2), http.StatusBadRequest)
}

func TestMonitoringHosts_TopNWithDeviceIDsSuccess(t *testing.T) {
	db, mock, cleanup := newMonitoringHandlerGormDBWithSQLMock(t)
	defer cleanup()

	authService, token := newAuthServiceWithPermissions(t, []string{"monitoring:read"})
	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())
	h := handlers.MonitoringHandler{Writer: writer, Auth: authService}

	mock.ExpectQuery(`(?is)SELECT d\.id AS device_id, d\.name AS device_name, d\.ip_address, d\.status, di\.name AS interface_name, di\.alias AS interface_alias, GREATEST\(COALESCE\(di\.utilization_in, 0\), COALESCE\(di\.utilization_out, 0\)\) AS val FROM device_interfaces AS di JOIN devices AS d ON d\.id = di\.device_id WHERE .* AND d\.id IN \(\$3,\$4\) ORDER BY val DESC NULLS LAST, d\.id ASC, di\.id ASC LIMIT \$5`).
		WithArgs(true, true, 10, 20, 5).
		WillReturnRows(sqlmock.NewRows([]string{"device_id", "device_name", "ip_address", "status", "interface_name", "interface_alias", "val"}).
			AddRow(10, "sw-10", "10.0.0.10", "online", "if6", "GigabitEthernet0/0/1", 0.000196))

	e := echo.New()
	req := httptest.NewRequest(http.MethodGet, "/api/v1/monitoring/topn?metric=if_util&limit=5&device_ids=10,20,10", nil)
	req.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	if err := h.GetMonitoringTopN(c); err != nil {
		e.HTTPErrorHandler(err, c)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200, body=%s", rec.Code, rec.Body.String())
	}

	var resp monitoring.TopNResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal err=%v", err)
	}
	if resp.Metric != "if_util" || len(resp.Items) != 1 ||
		resp.Items[0].InterfaceDisplayName != "GigabitEthernet0/0/1" ||
		resp.Items[0].Value != 0.0002 ||
		resp.Items[0].DisplayValue != "< 0.01%" {
		t.Fatalf("unexpected topn response: %+v", resp)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestMonitoringHosts_DashboardV2_MasksNotificationsAndGatesAlertAnnotations(t *testing.T) {
	db, mock, cleanup := newMonitoringHandlerGormDBWithSQLMock(t)
	defer cleanup()

	authService, token := newAuthServiceWithPermissions(t, []string{"monitoring:read"})
	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())
	h := handlers.MonitoringHandler{
		Writer: writer,
		DashboardWriter: stubDashboardWriter{
			stats: monitoring.MonitoringStats{TotalDevices: 2, ActiveAlerts: 5, AvgCPU: 45, AvgMemory: 55},
			devicePerf: []monitoring.DevicePerformancePoint{
				{
					Timestamp: "2026-11-20T12:00:00Z",
					Devices: map[string]monitoring.DevicePerformanceValue{
						"sw-1": {CPU: 30, Memory: 40},
						"sw-2": {CPU: 70, Memory: 60},
					},
				},
			},
			temperature:    []monitoring.TemperatureHistoryPoint{},
			networkTraffic: []monitoring.NetworkTrafficPoint{},
		},
		Auth: authService,
	}

	mock.ExpectQuery(`(?is)SELECT .* FROM "alert_rules".*`).
		WillReturnRows(sqlmock.NewRows([]string{"metric_name", "severity", "threshold_value"}))
	mock.ExpectQuery(`(?is)SELECT .* FROM "devices".*`).
		WillReturnRows(sqlmock.NewRows([]string{"status", "cpu_usage", "memory_usage"}).AddRow("online", 30.0, 40.0))
	mock.ExpectQuery(`(?is)SELECT .* FROM devices AS d.*`).
		WillReturnRows(sqlmock.NewRows([]string{"group_id", "group_name", "total_devices", "online_devices", "offline_devices", "warning_devices", "max_cpu", "max_memory"}))
	mock.ExpectQuery(`(?is)SELECT .* FROM "system_settings".*`).
		WillReturnRows(sqlmock.NewRows([]string{"key", "value"}).
			AddRow("notification.email.enabled", "true").
			AddRow("notification.email.smtp_host", "smtp.secret.internal").
			AddRow("notification.webhook.enabled", "true").
			AddRow("notification.webhook.url", "https://hooks.secret.internal/abc"))

	e := echo.New()
	req := httptest.NewRequest(http.MethodPost, "/api/v1/monitoring/dashboard/v2", strings.NewReader(`{}`))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	req.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	if err := h.GetMonitoringDashboardV2(c); err != nil {
		e.HTTPErrorHandler(err, c)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200, body=%s", rec.Code, rec.Body.String())
	}

	rawBody := rec.Body.String()
	if strings.Contains(rawBody, "smtp.secret.internal") || strings.Contains(rawBody, "https://hooks.secret.internal") {
		t.Fatalf("notification channel summary leaked sensitive host/url: %s", rawBody)
	}

	var parsed struct {
		Data struct {
			AggregateTrends            []monitoring.AggregateTrendPoint          `json:"aggregateTrends"`
			Annotations                []monitoring.DashboardAnnotation          `json:"annotations"`
			NotificationChannelSummary []monitoring.NotificationChannelReadiness `json:"notificationChannelSummary"`
			ActiveProblems             []monitoring.ActiveProblemItem            `json:"activeProblems"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &parsed); err != nil {
		t.Fatalf("unmarshal err=%v", err)
	}
	if len(parsed.Data.AggregateTrends) != 1 || parsed.Data.AggregateTrends[0].MaxCPU != 70 {
		t.Fatalf("unexpected aggregateTrends: %+v", parsed.Data.AggregateTrends)
	}
	if len(parsed.Data.Annotations) != 0 || len(parsed.Data.ActiveProblems) != 0 {
		t.Fatalf("expected alert annotations & activeProblems empty without alerts:read")
	}
	if len(parsed.Data.NotificationChannelSummary) != 2 || !parsed.Data.NotificationChannelSummary[0].Configured {
		t.Fatalf("unexpected notificationChannelSummary: %+v", parsed.Data.NotificationChannelSummary)
	}
}

func TestDeviceProbe_CollectMetrics_MonitoringControlAndCooldown429(t *testing.T) {
	db, mock, cleanup := newMonitoringHandlerGormDBWithSQLMock(t)
	defer cleanup()

	authService, token := newAuthServiceWithPermissions(t, []string{"monitoring:control"})
	deviceService := devices.NewService(db, zap.NewNop())
	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())
	h := handlers.DevicesHandler{
		Service:         deviceService,
		SNMPCollector:   devices.NewSNMPCollector(zap.NewNop()),
		Metrics:         writer,
		Auth:            authService,
		CollectCooldown: handlers.NewDeviceCollectCooldown(10 * time.Second),
	}

	// 第一次调用：设备不存在（404），但已经消耗冷却锁并验证 monitoring:control 权限放行
	mock.ExpectQuery(`(?is)SELECT .* FROM "devices" WHERE id = \$1.*`).
		WithArgs(101, 1).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))

	e := echo.New()
	req1 := httptest.NewRequest(http.MethodPost, "/api/v1/devices/101/collect-metrics", nil)
	req1.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
	rec1 := httptest.NewRecorder()
	c1 := e.NewContext(req1, rec1)
	c1.SetParamNames("device_id")
	c1.SetParamValues("101")
	err1 := h.CollectDeviceMetrics(c1)
	assertHTTPErrorCode(t, err1, http.StatusNotFound)

	// 第二次调用（10s 冷却期内）：直接返回 429 Too Many Requests
	req2 := httptest.NewRequest(http.MethodPost, "/api/v1/devices/101/collect-metrics", nil)
	req2.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
	rec2 := httptest.NewRecorder()
	c2 := e.NewContext(req2, rec2)
	c2.SetParamNames("device_id")
	c2.SetParamValues("101")
	if err := h.CollectDeviceMetrics(c2); err != nil {
		e.HTTPErrorHandler(err, c2)
	}
	if rec2.Code != http.StatusTooManyRequests {
		t.Fatalf("status = %d, want 429, body=%s", rec2.Code, rec2.Body.String())
	}
	if !strings.Contains(rec2.Body.String(), "retry_after_seconds") {
		t.Fatalf("expected retry_after_seconds in 429 response, got %s", rec2.Body.String())
	}
}
