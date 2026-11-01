package handlers_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/labstack/echo/v4"
	"go.uber.org/zap"

	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	"github.com/your-org/inspect-system/backend-go/internal/logs"
)

func TestBuildLogFilter_ShouldIncludeSource(t *testing.T) {
	e := echo.New()
	req := httptest.NewRequest("GET", "/api/v1/logs?source=syslog&level=info", nil)
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	filter := handlers.BuildLogFilter(c, 0, 100)
	if filter.Source == nil {
		t.Fatalf("filter.Source is nil, want syslog")
	}
	if *filter.Source != "syslog" {
		t.Fatalf("filter.Source=%q, want syslog", *filter.Source)
	}
}

func TestBuildLogFilter_ShouldParseIncludeSelf(t *testing.T) {
	e := echo.New()

	req := httptest.NewRequest("GET", "/api/v1/logs?include_self=true", nil)
	filter := handlers.BuildLogFilter(e.NewContext(req, httptest.NewRecorder()), 0, 100)
	if !filter.IncludeSelf {
		t.Fatal("include_self=true 时 filter.IncludeSelf 应为 true")
	}

	req = httptest.NewRequest("GET", "/api/v1/logs", nil)
	filter = handlers.BuildLogFilter(e.NewContext(req, httptest.NewRecorder()), 0, 100)
	if filter.IncludeSelf {
		t.Fatal("未传 include_self 时应默认排除本系统自身活动")
	}
}

func TestBuildLogFilter_ExcludeSearch_Binding(t *testing.T) {
	e := echo.New()

	t.Run("exclude_search 绑定成功", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/v1/logs?exclude_search=NTP,LLDP", nil)
		filter := handlers.BuildLogFilter(e.NewContext(req, httptest.NewRecorder()), 0, 100)
		if filter.ExcludeSearch == nil || *filter.ExcludeSearch != "NTP,LLDP" {
			t.Fatalf("filter.ExcludeSearch = %v, want NTP,LLDP", filter.ExcludeSearch)
		}
	})

	t.Run("exclude_keyword 兼容回退", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/v1/logs?exclude_keyword=BGP", nil)
		filter := handlers.BuildLogFilter(e.NewContext(req, httptest.NewRecorder()), 0, 100)
		if filter.ExcludeSearch == nil || *filter.ExcludeSearch != "BGP" {
			t.Fatalf("filter.ExcludeSearch = %v, want BGP", filter.ExcludeSearch)
		}
	})

	t.Run("exclude_search 优先级高于 exclude_keyword", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/v1/logs?exclude_search=Pri&exclude_keyword=Sec", nil)
		filter := handlers.BuildLogFilter(e.NewContext(req, httptest.NewRecorder()), 0, 100)
		if filter.ExcludeSearch == nil || *filter.ExcludeSearch != "Pri" {
			t.Fatalf("filter.ExcludeSearch = %v, want Pri", filter.ExcludeSearch)
		}
	})

	t.Run("未传时不设置 ExcludeSearch", func(t *testing.T) {
		req := httptest.NewRequest("GET", "/api/v1/logs", nil)
		filter := handlers.BuildLogFilter(e.NewContext(req, httptest.NewRecorder()), 0, 100)
		if filter.ExcludeSearch != nil {
			t.Fatalf("filter.ExcludeSearch should be nil, got %v", *filter.ExcludeSearch)
		}
	})
}

func TestBatchDeleteLogs_SelectAllFiltered_WithExcludeSearch(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"system:logs:manage"})
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	svc := logs.NewService(gormDB, zap.NewNop())
	h := handlers.LogsHandler{
		Service: svc,
		Auth:    authSvc,
	}

	startTime := time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)
	now := time.Now().UTC()

	mock.ExpectQuery(`SELECT count\(\*\) FROM device_logs AS l LEFT JOIN devices d ON d.id = l.device_id WHERE l.level = \$1 AND l.log_timestamp >= \$2 AND \({1,2}COALESCE\(l\.message, ''\) NOT ILIKE \$3 AND COALESCE\(l\.raw_message, ''\) NOT ILIKE \$4\){1,2} AND l.self_generated = \$5`).
		WithArgs("error", startTime, "%noise%", "%noise%", false).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))

	mock.ExpectQuery(`SELECT l\.\*, d\.name AS device_name, d\.ip_address AS device_ip FROM device_logs AS l LEFT JOIN devices d ON d\.id = l\.device_id WHERE l\.level = \$1 AND l\.log_timestamp >= \$2 AND \({1,2}COALESCE\(l\.message, ''\) NOT ILIKE \$3 AND COALESCE\(l\.raw_message, ''\) NOT ILIKE \$4\){1,2} AND l\.self_generated = \$5 ORDER BY l\.log_timestamp desc LIMIT \$6`).
		WithArgs("error", startTime, "%noise%", "%noise%", false, 1000).
		WillReturnRows(sqlmock.NewRows(logColumns()).
			AddRow(201, 1, "error", "daemon", "syslog", "msg1", nil, nil, nil, now, now, now, false, "dev1", "10.0.0.1"))

	mock.ExpectExec(`DELETE FROM "device_logs" WHERE id IN \(\$1\)`).
		WithArgs(201).
		WillReturnResult(sqlmock.NewResult(0, 1))

	payload := map[string]interface{}{
		"select_all_filtered": true,
		"level":               "error",
		"start_time":          "2026-06-01T00:00:00Z",
		"exclude_search":      "noise",
	}
	body, _ := json.Marshal(payload)
	ctx, rec := newEchoContextWithBody(http.MethodPost, "/api/v1/logs/batch-delete", token, body)

	if err := h.BatchDeleteLogs(ctx); err != nil {
		t.Fatalf("BatchDeleteLogs failed: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body=%s", rec.Code, rec.Body.String())
	}

	var resp struct {
		DeletedCount int64 `json:"deleted_count"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal error: %v", err)
	}
	if resp.DeletedCount != 1 {
		t.Fatalf("expected deleted_count=1, got %d", resp.DeletedCount)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations: %v", err)
	}
}

func TestBatchDeleteLogs_SelectAllFiltered_WithCamelCaseExcludeSearch(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"system:logs:manage"})
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	svc := logs.NewService(gormDB, zap.NewNop())
	h := handlers.LogsHandler{
		Service: svc,
		Auth:    authSvc,
	}

	startTime := time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)

	mock.ExpectQuery(`SELECT count\(\*\) FROM device_logs AS l LEFT JOIN devices d ON d.id = l.device_id WHERE l.level = \$1 AND l.log_timestamp >= \$2 AND \({1,2}COALESCE\(l\.message, ''\) NOT ILIKE \$3 AND COALESCE\(l\.raw_message, ''\) NOT ILIKE \$4\){1,2} AND l.self_generated = \$5`).
		WithArgs("warning", startTime, `%keep\_away%`, `%keep\_away%`, false).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))

	mock.ExpectQuery(`SELECT l\.\*, d\.name AS device_name, d\.ip_address AS device_ip FROM device_logs AS l LEFT JOIN devices d ON d\.id = l\.device_id WHERE l\.level = \$1 AND l\.log_timestamp >= \$2 AND \({1,2}COALESCE\(l\.message, ''\) NOT ILIKE \$3 AND COALESCE\(l\.raw_message, ''\) NOT ILIKE \$4\){1,2} AND l\.self_generated = \$5 ORDER BY l\.log_timestamp desc LIMIT \$6`).
		WithArgs("warning", startTime, `%keep\_away%`, `%keep\_away%`, false, 1000).
		WillReturnRows(sqlmock.NewRows(logColumns()))

	payload := map[string]interface{}{
		"selectAllFiltered": true,
		"level":             "warning",
		"startTime":         "2026-06-01T00:00:00Z",
		"excludeSearch":     "keep_away",
	}
	body, _ := json.Marshal(payload)
	ctx, rec := newEchoContextWithBody(http.MethodPost, "/api/v1/logs/batch-delete", token, body)

	if err := h.BatchDeleteLogs(ctx); err != nil {
		t.Fatalf("BatchDeleteLogs failed: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d, body=%s", rec.Code, rec.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations: %v", err)
	}
}
