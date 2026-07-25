package handlers_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/labstack/echo/v4"
	"go.uber.org/zap"

	"github.com/your-org/inspect-system/backend-go/internal/config"
	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	"github.com/your-org/inspect-system/backend-go/internal/settings"
)

func newDisplayPreferencesTestServer(t *testing.T, permissions []string) (*echo.Echo, sqlmock.Sqlmock, string, func()) {
	t.Helper()

	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	authService, token := newAuthServiceWithPermissions(t, permissions)

	service := settings.NewService(gormDB, nil, config.Config{}, zap.NewNop())
	handler := handlers.SettingsHandler{
		Service: service,
		Auth:    authService,
	}

	e := echo.New()
	handler.Register(e.Group("/api/v1"))
	return e, mock, token, cleanup
}

func expectSettingQuery(mock sqlmock.Sqlmock, key string, value string) {
	rows := sqlmock.NewRows([]string{"id", "key", "value", "category", "data_type"})
	if value != "" {
		rows.AddRow(1, key, value, "system", "string")
	}
	mock.ExpectQuery(`SELECT \* FROM "system_settings" WHERE key = \$1`).
		WithArgs(key, sqlmock.AnyArg()).
		WillReturnRows(rows)
}

// 时间显示偏好必须对所有登录用户可读：/settings/general 要求 system:config，
// 普通用户 403，导致时区/时间制偏好无法在前端全员生效。
func TestGetDisplayPreferences_LoginOnlyWithoutSystemConfigPermission(t *testing.T) {
	e, mock, token, cleanup := newDisplayPreferencesTestServer(t, []string{"dashboard:read"})
	defer cleanup()

	expectSettingQuery(mock, "system.timezone", "America/New_York")
	expectSettingQuery(mock, "user_preference.time_format", "12h")
	expectSettingQuery(mock, "system.application_name", "自定义巡检平台")

	req := httptest.NewRequest(http.MethodGet, "/api/v1/settings/display-preferences", nil)
	req.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("普通登录用户应可读显示偏好，status=%d body=%s", rec.Code, rec.Body.String())
	}

	var body map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("响应应为 JSON 对象: %v", err)
	}
	if body["timezone"] != "America/New_York" {
		t.Fatalf("timezone=%q, want America/New_York", body["timezone"])
	}
	if body["time_format"] != "12h" {
		t.Fatalf("time_format=%q, want 12h", body["time_format"])
	}
	if body["application_name"] != "自定义巡检平台" {
		t.Fatalf("application_name=%q, want 自定义巡检平台", body["application_name"])
	}
}

func TestGetDisplayPreferences_DefaultsWhenSettingsMissing(t *testing.T) {
	e, mock, token, cleanup := newDisplayPreferencesTestServer(t, []string{"dashboard:read"})
	defer cleanup()

	expectSettingQuery(mock, "system.timezone", "")
	expectSettingQuery(mock, "user_preference.time_format", "")
	expectSettingQuery(mock, "system.application_name", "")

	req := httptest.NewRequest(http.MethodGet, "/api/v1/settings/display-preferences", nil)
	req.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d body=%s", rec.Code, rec.Body.String())
	}

	var body map[string]string
	_ = json.Unmarshal(rec.Body.Bytes(), &body)
	if body["timezone"] != "Asia/Shanghai" {
		t.Fatalf("缺省 timezone=%q, want Asia/Shanghai", body["timezone"])
	}
	if body["time_format"] != "24h" {
		t.Fatalf("缺省 time_format=%q, want 24h", body["time_format"])
	}
	if body["application_name"] != "网络设备巡检系统" {
		t.Fatalf("缺省 application_name=%q, want 网络设备巡检系统", body["application_name"])
	}
}

func TestGetDisplayPreferences_RequiresLogin(t *testing.T) {
	e, _, _, cleanup := newDisplayPreferencesTestServer(t, []string{"dashboard:read"})
	defer cleanup()

	req := httptest.NewRequest(http.MethodGet, "/api/v1/settings/display-preferences", nil)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("未登录应 401，实际 %d", rec.Code)
	}
}
