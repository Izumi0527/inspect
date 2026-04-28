package handlers_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/labstack/echo/v4"
	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
	"go.uber.org/zap"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

type snmpExtensionsResponse struct {
	DeviceID            int             `json:"device_id"`
	Timestamp           *time.Time      `json:"timestamp,omitempty"`
	BGPPeers            []bgpPeerItem   `json:"bgp_peers"`
	OpticalTransceivers []opticalTxItem `json:"optical_transceivers"`
}

type bgpPeerItem struct {
	Index      string `json:"index"`
	StateLabel string `json:"state_label,omitempty"`
}

type opticalTxItem struct {
	Index           string   `json:"index"`
	BiasCurrent     *float64 `json:"bias_current,omitempty"`
	BiasCurrentUnit string   `json:"bias_current_unit,omitempty"`
}

func TestMonitoringHandler_GetDeviceSNMPExtensions_RequiresReadPermission(t *testing.T) {
	readDeniedAuth, deniedToken := newAuthServiceWithPermissions(t, []string{"monitoring:control"})

	h := handlers.MonitoringHandler{Auth: readDeniedAuth}
	ctx := newEchoContext(http.MethodGet, "/api/v1/monitoring/devices/7/snmp-extensions", deniedToken)
	ctx.SetParamNames("device_id")
	ctx.SetParamValues("7")

	err := h.GetDeviceSNMPExtensions(ctx)
	assertHTTPErrorCode(t, err, http.StatusForbidden)
}

func TestMonitoringHandler_GetDeviceSNMPExtensions_Returns404WhenDeviceMissing(t *testing.T) {
	db, mock, cleanup := newMonitoringHandlerGormDBWithSQLMock(t)
	defer cleanup()

	authService, token := newAuthServiceWithPermissions(t, []string{"monitoring:read"})
	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())
	h := handlers.MonitoringHandler{Writer: writer, Auth: authService}

	mock.ExpectQuery(`(?is)SELECT .* FROM "devices" WHERE id = \$1.*`).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))

	ctx := newEchoContext(http.MethodGet, "/api/v1/monitoring/devices/7/snmp-extensions", token)
	ctx.SetParamNames("device_id")
	ctx.SetParamValues("7")

	err := h.GetDeviceSNMPExtensions(ctx)
	assertHTTPErrorCode(t, err, http.StatusNotFound)
}

func TestMonitoringHandler_GetDeviceSNMPExtensions_ReturnsEmptyArraysWhenNoSummary(t *testing.T) {
	db, mock, cleanup := newMonitoringHandlerGormDBWithSQLMock(t)
	defer cleanup()

	authService, token := newAuthServiceWithPermissions(t, []string{"monitoring:read"})
	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())
	h := handlers.MonitoringHandler{Writer: writer, Auth: authService}

	mock.ExpectQuery(`(?is)SELECT .* FROM "devices" WHERE id = \$1.*`).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(7))
	mock.ExpectQuery(`(?is)SELECT collected_at,\s*tags FROM device_metrics WHERE device_id = \$1 AND tags IS NOT NULL AND tags->'snmp_extensions' IS NOT NULL ORDER BY collected_at DESC LIMIT 1`).
		WillReturnRows(sqlmock.NewRows([]string{"collected_at", "tags"}))

	req := httptest.NewRequest(http.MethodGet, "/api/v1/monitoring/devices/7/snmp-extensions", nil)
	req.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
	rec := httptest.NewRecorder()
	e := echo.New()
	ctx := e.NewContext(req, rec)
	ctx.SetParamNames("device_id")
	ctx.SetParamValues("7")

	if err := h.GetDeviceSNMPExtensions(ctx); err != nil {
		e.HTTPErrorHandler(err, ctx)
	}

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200, body=%s", rec.Code, rec.Body.String())
	}

	var resp snmpExtensionsResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("json.Unmarshal error = %v, body=%s", err, rec.Body.String())
	}
	if resp.DeviceID != 7 {
		t.Fatalf("device_id = %d, want 7", resp.DeviceID)
	}
	if resp.Timestamp != nil {
		t.Fatalf("timestamp = %v, want nil", resp.Timestamp)
	}
	if len(resp.BGPPeers) != 0 {
		t.Fatalf("bgp_peers len = %d, want 0", len(resp.BGPPeers))
	}
	if len(resp.OpticalTransceivers) != 0 {
		t.Fatalf("optical_transceivers len = %d, want 0", len(resp.OpticalTransceivers))
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestMonitoringHandler_GetDeviceSNMPExtensions_ReturnsSummaryPayload(t *testing.T) {
	db, mock, cleanup := newMonitoringHandlerGormDBWithSQLMock(t)
	defer cleanup()

	authService, token := newAuthServiceWithPermissions(t, []string{"monitoring:read"})
	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())
	h := handlers.MonitoringHandler{Writer: writer, Auth: authService}

	collectedAt := time.Date(2026, 4, 29, 8, 30, 0, 0, time.UTC)
	tags := `{"snmp_extensions":{"bgp_peers":[{"index":"1","state_label":"established"}],"optical_transceivers":[{"index":"10","bias_current":12.5,"bias_current_unit":"uA"}]}}`

	mock.ExpectQuery(`(?is)SELECT .* FROM "devices" WHERE id = \$1.*`).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(7))
	mock.ExpectQuery(`(?is)SELECT collected_at,\s*tags FROM device_metrics WHERE device_id = \$1 AND tags IS NOT NULL AND tags->'snmp_extensions' IS NOT NULL ORDER BY collected_at DESC LIMIT 1`).
		WillReturnRows(sqlmock.NewRows([]string{"collected_at", "tags"}).AddRow(collectedAt, []byte(tags)))

	req := httptest.NewRequest(http.MethodGet, "/api/v1/monitoring/devices/7/snmp-extensions", nil)
	req.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
	rec := httptest.NewRecorder()
	e := echo.New()
	ctx := e.NewContext(req, rec)
	ctx.SetParamNames("device_id")
	ctx.SetParamValues("7")

	if err := h.GetDeviceSNMPExtensions(ctx); err != nil {
		e.HTTPErrorHandler(err, ctx)
	}

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200, body=%s", rec.Code, rec.Body.String())
	}

	var resp snmpExtensionsResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("json.Unmarshal error = %v, body=%s", err, rec.Body.String())
	}
	if resp.Timestamp == nil || !resp.Timestamp.Equal(collectedAt) {
		t.Fatalf("timestamp = %v, want %v", resp.Timestamp, collectedAt)
	}
	if len(resp.BGPPeers) != 1 || resp.BGPPeers[0].StateLabel != "established" {
		t.Fatalf("bgp_peers = %#v", resp.BGPPeers)
	}
	if len(resp.OpticalTransceivers) != 1 {
		t.Fatalf("optical_transceivers len = %d, want 1", len(resp.OpticalTransceivers))
	}
	if resp.OpticalTransceivers[0].BiasCurrent == nil || *resp.OpticalTransceivers[0].BiasCurrent != 12.5 {
		t.Fatalf("optical_transceivers = %#v", resp.OpticalTransceivers)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func newMonitoringHandlerGormDBWithSQLMock(t *testing.T) (*gorm.DB, sqlmock.Sqlmock, func()) {
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
