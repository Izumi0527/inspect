package middleware_test

import (
	"bytes"
	"context"
	"database/sql/driver"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/labstack/echo/v4"
	"go.uber.org/zap"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/auth"
	"github.com/your-org/inspect-system/backend-go/internal/config"
	mw "github.com/your-org/inspect-system/backend-go/internal/http/middleware"
	"github.com/your-org/inspect-system/backend-go/internal/settings"
)

func newMonitoringAuditTestServer(sink *fakeAuditSink) *echo.Echo {
	e := echo.New()
	api := e.Group("/api/v1")
	api.Use(func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			c.Set(auth.ContextUserKey, &auth.UserRecord{ID: "u-admin", Username: "admin"})
			return next(c)
		}
	})
	api.Use(mw.AuditTrail(sink))

	ok := func(c echo.Context) error { return c.JSON(http.StatusOK, map[string]string{"ok": "1"}) }

	// Mutating monitoring / groups / alerts routes
	api.POST("/monitoring/devices/:device_id/stop", ok)
	api.POST("/monitoring/templates", ok)
	api.PUT("/monitoring/templates/:id", ok)
	api.PATCH("/monitoring/triggers/:id", ok)
	api.DELETE("/monitoring/maintenances/:id", ok)
	api.POST("/devices/groups", ok)
	api.PUT("/devices/groups/:group_id", ok)
	api.DELETE("/devices/groups/:group_id", ok)
	api.POST("/alerts/:alert_id/snooze", ok)

	// Custom injected details route
	api.PUT("/devices/:device_id", func(c echo.Context) error {
		mw.SetAuditDetails(c, map[string]interface{}{
			"name":           "core-sw-01",
			"snmp_version":   "2c",
			"snmp_port":      161,
			"snmp_community": "super-secret-community",
			"password":       "raw-cli-pass",
		})
		return c.JSON(http.StatusOK, map[string]string{"ok": "1"})
	})

	// Read-only POST routes under /monitoring (must NOT be audited)
	api.POST("/monitoring/dashboard/v2", ok)
	api.POST("/monitoring/devices/historical", ok)
	api.POST("/monitoring/devices/temperature", ok)
	api.POST("/monitoring/network/traffic/history", ok)
	api.POST("/monitoring/graphs/adhoc", ok)
	api.POST("/monitoring/templates/:id/lld-rules/preview", ok)
	api.POST("/monitoring/reports/export", ok)
	api.POST("/monitoring/reports/download", ok)
	api.POST("/monitoring/reports/download/check", ok)

	return e
}

func doJSONReq(e *echo.Echo, method, path string, payload interface{}) *httptest.ResponseRecorder {
	var body []byte
	if payload != nil {
		body, _ = json.Marshal(payload)
	}
	req := httptest.NewRequest(method, path, bytes.NewReader(body))
	if payload != nil {
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	}
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	return rec
}

func TestAuditTrail_MonitoringGroupsAndAlertsParamExtraction(t *testing.T) {
	sink := &fakeAuditSink{}
	e := newMonitoringAuditTestServer(sink)

	cases := []struct {
		method         string
		path           string
		wantAction     string
		wantResource   string
		wantResourceID string
	}{
		{http.MethodPost, "/api/v1/monitoring/devices/15/stop", "create", "monitoring", "15"},
		{http.MethodPost, "/api/v1/monitoring/templates", "create", "monitoring", ""},
		{http.MethodPut, "/api/v1/monitoring/templates/8", "update", "monitoring", "8"},
		{http.MethodPatch, "/api/v1/monitoring/triggers/22", "update", "monitoring", "22"},
		{http.MethodDelete, "/api/v1/monitoring/maintenances/4", "delete", "monitoring", "4"},
		{http.MethodPost, "/api/v1/devices/groups", "create", "device_group", ""},
		{http.MethodPut, "/api/v1/devices/groups/19", "update", "device_group", "19"},
		{http.MethodDelete, "/api/v1/devices/groups/19", "delete", "device_group", "19"},
		{http.MethodPost, "/api/v1/alerts/33/snooze", "create", "alert", "33"},
		{http.MethodPost, "/api/v1/monitoring/reports/export", "export", "monitoring", ""},
	}

	for _, tc := range cases {
		sink.entries = nil
		rec := doJSONReq(e, tc.method, tc.path, map[string]interface{}{"name": "sample"})
		if rec.Code != http.StatusOK {
			t.Fatalf("%s %s status=%d", tc.method, tc.path, rec.Code)
		}
		entries := sink.all()
		if len(entries) != 1 {
			t.Fatalf("%s %s expected 1 audit entry, got %d", tc.method, tc.path, len(entries))
		}
		got := entries[0]
		if got.Action != tc.wantAction || got.ResourceType != tc.wantResource || got.ResourceID != tc.wantResourceID {
			t.Fatalf("%s %s => action=%q type=%q id=%q, want %q/%q/%q",
				tc.method, tc.path, got.Action, got.ResourceType, got.ResourceID,
				tc.wantAction, tc.wantResource, tc.wantResourceID)
		}
	}
}

func TestAuditTrail_ReadOnlyMonitoringPostsAreExcluded(t *testing.T) {
	sink := &fakeAuditSink{}
	e := newMonitoringAuditTestServer(sink)

	readOnlyPosts := []string{
		"/api/v1/monitoring/dashboard/v2",
		"/api/v1/monitoring/devices/historical",
		"/api/v1/monitoring/devices/temperature",
		"/api/v1/monitoring/network/traffic/history",
		"/api/v1/monitoring/graphs/adhoc",
		"/api/v1/monitoring/templates/3/lld-rules/preview",
		"/api/v1/monitoring/reports/download",
		"/api/v1/monitoring/reports/download/check",
	}

	for _, path := range readOnlyPosts {
		rec := doJSONReq(e, http.MethodPost, path, map[string]interface{}{"time_range": "24h"})
		if rec.Code != http.StatusOK {
			t.Fatalf("POST %s status=%d", path, rec.Code)
		}
	}

	if entries := sink.all(); len(entries) != 0 {
		t.Fatalf("read-only monitoring POSTs must not be audited, got %d entries: %+v", len(entries), entries)
	}
}

func TestAuditTrail_SanitizesCredentialKeysInBodyAndContextDetails(t *testing.T) {
	sink := &fakeAuditSink{}
	e := newMonitoringAuditTestServer(sink)

	// 1. JSON body sanitization
	rec := doJSONReq(e, http.MethodPost, "/api/v1/monitoring/templates", map[string]interface{}{
		"name":           "Cisco Core",
		"snmp_version":   "3",
		"snmp_port":      161,
		"password":       "secret-pw-1",
		"secret":         "secret-val-2",
		"community":      "secret-comm-3",
		"token":          "secret-tok-4",
		"auth_pass":      "secret-auth-5",
		"priv_pass":      "secret-priv-6",
		"snmp_community": "secret-snmp-7",
		"snmp_auth_key":  "secret-snmp-8",
		"nested": map[string]interface{}{
			"priv_password": "secret-nested-9",
			"safe_field":    "keep-me",
		},
	})
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d", rec.Code)
	}

	entries := sink.all()
	if len(entries) != 1 {
		t.Fatalf("expected 1 entry, got %d", len(entries))
	}
	serialized, err := json.Marshal(entries[0].Details)
	if err != nil {
		t.Fatalf("marshal details: %v", err)
	}
	text := string(serialized)
	for _, secret := range []string{
		"secret-pw-1", "secret-val-2", "secret-comm-3", "secret-tok-4",
		"secret-auth-5", "secret-priv-6", "secret-snmp-7", "secret-snmp-8", "secret-nested-9",
	} {
		if strings.Contains(text, secret) {
			t.Fatalf("credential leaked into audit details: %s in %s", secret, text)
		}
	}
	if !strings.Contains(text, "Cisco Core") || !strings.Contains(text, "keep-me") || !strings.Contains(text, "snmp_version") {
		t.Fatalf("non-sensitive fields should be preserved, got %s", text)
	}

	// 2. Context-injected details sanitization
	sink.entries = nil
	rec = doJSONReq(e, http.MethodPut, "/api/v1/devices/44", map[string]interface{}{"name": "core-sw-01"})
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d", rec.Code)
	}
	entries = sink.all()
	if len(entries) != 1 || entries[0].ResourceID != "44" {
		t.Fatalf("unexpected entries: %+v", entries)
	}
	ctxSerialized, _ := json.Marshal(entries[0].Details)
	ctxText := string(ctxSerialized)
	if strings.Contains(ctxText, "super-secret-community") || strings.Contains(ctxText, "raw-cli-pass") {
		t.Fatalf("credential leaked from context details: %s", ctxText)
	}
	if !strings.Contains(ctxText, "core-sw-01") || !strings.Contains(ctxText, "snmp_version") {
		t.Fatalf("expected safe fields preserved, got %s", ctxText)
	}
}

type sanitizedDetailsMatcher struct {
	t          *testing.T
	mustHave   []string
	mustAbsent []string
}

func (m sanitizedDetailsMatcher) Match(v driver.Value) bool {
	var raw string
	switch typed := v.(type) {
	case string:
		raw = typed
	case []byte:
		raw = string(typed)
	default:
		m.t.Errorf("unexpected details sql arg type: %T", v)
		return false
	}
	for _, s := range m.mustHave {
		if !strings.Contains(raw, s) {
			m.t.Errorf("expected persisted details %q to contain %q", raw, s)
			return false
		}
	}
	for _, s := range m.mustAbsent {
		if strings.Contains(raw, s) {
			m.t.Errorf("persisted details %q leaked secret %q", raw, s)
			return false
		}
	}
	return true
}

func TestRecordAuditLog_SanitizesAndPersistsDetails(t *testing.T) {
	sqlDB, mock, err := sqlmock.New(sqlmock.QueryMatcherOption(sqlmock.QueryMatcherRegexp))
	if err != nil {
		t.Fatalf("sqlmock.New: %v", err)
	}
	defer func() { _ = sqlDB.Close() }()

	gormDB, err := gorm.Open(postgres.New(postgres.Config{
		Conn:                 sqlDB,
		PreferSimpleProtocol: true,
	}), &gorm.Config{
		SkipDefaultTransaction: true,
		DisableAutomaticPing:   true,
	})
	if err != nil {
		t.Fatalf("gorm.Open: %v", err)
	}

	service := settings.NewService(gormDB, nil, config.Config{}, zap.NewNop())

	detailsMatcher := sanitizedDetailsMatcher{
		t:          t,
		mustHave:   []string{"Huawei Switch", "snmp_version"},
		mustAbsent: []string{"secret-comm", "secret-auth", "secret-priv", "secret-token", "snmp_community", "auth_pass", "priv_pass"},
	}

	mock.ExpectExec(`INSERT INTO "audit_logs"`).
		WithArgs(
			sqlmock.AnyArg(), // id
			"u-1",            // user_id
			"update",         // action
			"monitoring",     // resource_type
			"12",             // resource_id
			"更新监控方案",         // description
			detailsMatcher,   // details (sanitized json)
			"127.0.0.1",      // ip_address
			"UA",             // user_agent
			"success",        // status
			nil,              // error_message
			sqlmock.AnyArg(), // created_at
		).
		WillReturnResult(sqlmock.NewResult(1, 1))

	service.RecordAuditLog(context.Background(), settings.AuditEntry{
		UserID:       "u-1",
		Action:       "update",
		ResourceType: "monitoring",
		ResourceID:   "12",
		Description:  "更新监控方案",
		Details: map[string]interface{}{
			"template_name":  "Huawei Switch",
			"snmp_version":   "3",
			"snmp_community": "secret-comm",
			"auth_pass":      "secret-auth",
			"priv_pass":      "secret-priv",
			"token":          "secret-token",
		},
		IPAddress: "127.0.0.1",
		UserAgent: "UA",
		Status:    "success",
	})

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestSanitizeAuditDetails_GuardsCircularReferencesAndMaxSize(t *testing.T) {
	circular := map[string]interface{}{
		"name":     "loop-group",
		"password": "hidden-password",
	}
	circular["self"] = circular

	sanitized, ok := settings.SanitizeAuditDetails(circular).(map[string]interface{})
	if !ok {
		t.Fatalf("expected sanitized map, got %T", settings.SanitizeAuditDetails(circular))
	}
	if sanitized["name"] != "loop-group" {
		t.Fatalf("name = %v, want loop-group", sanitized["name"])
	}
	if _, exists := sanitized["password"]; exists {
		t.Fatal("password should be filtered from circular map")
	}
	if sanitized["self"] != "[circular]" {
		t.Fatalf("self = %v, want \"[circular]\"", sanitized["self"])
	}

	oversized := map[string]interface{}{
		"blob": strings.Repeat("A", 70*1024),
	}
	rawJSON := settings.SanitizeAuditDetailsJSON(oversized)
	if len(rawJSON) == 0 {
		t.Fatal("expected truncated JSON metadata for oversized payload")
	}
	var meta map[string]interface{}
	if err := json.Unmarshal(rawJSON, &meta); err != nil {
		t.Fatalf("unmarshal truncated metadata: %v", err)
	}
	if truncated, _ := meta["truncated"].(bool); !truncated {
		t.Fatalf("expected truncated=true, got %v", meta)
	}
	if size, _ := meta["originalSize"].(float64); size <= 64*1024 {
		t.Fatalf("expected originalSize > 64KB, got %v", size)
	}
}
