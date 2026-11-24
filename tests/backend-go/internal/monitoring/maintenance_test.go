package monitoring_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/labstack/echo/v4"
	"go.uber.org/zap"
	"gorm.io/datatypes"
	"gorm.io/gorm/schema"

	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
)

func TestMaintenance_SchemaModels(t *testing.T) {
	cacheStore := &sync.Map{}
	namer := schema.NamingStrategy{}

	models := []struct {
		model interface{}
		table string
	}{
		{&monitoring.MonitorMaintenance{}, "monitor_maintenances"},
		{&monitoring.MonitorMaintenanceTarget{}, "monitor_maintenance_targets"},
	}

	for _, m := range models {
		parsed, err := schema.Parse(m.model, cacheStore, namer)
		if err != nil {
			t.Fatalf("parse %s schema failed: %v", m.table, err)
		}
		if parsed.Table != m.table {
			t.Fatalf("table = %q, want %q", parsed.Table, m.table)
		}
	}
}

func TestIsMaintenanceActiveAt_OnceWeeklyMonthlyAndCrossMidnight(t *testing.T) {
	shLoc, err := time.LoadLocation("Asia/Shanghai")
	if err != nil {
		t.Fatalf("LoadLocation: %v", err)
	}

	// 1. 一次性窗口：生效 / 过期 / 禁用 / 非法时区
	start := time.Date(2026, 11, 20, 14, 0, 0, 0, time.UTC)
	end := time.Date(2026, 11, 20, 16, 0, 0, 0, time.UTC)
	once := monitoring.MonitorMaintenance{
		Mode:         monitoring.MaintenanceModeCollectSilence,
		ScheduleType: monitoring.MaintenanceScheduleOnce,
		StartTime:    start,
		EndTime:      end,
		Timezone:     "Asia/Shanghai",
		Enabled:      true,
	}
	if !monitoring.IsMaintenanceActiveAt(once, start.Add(30*time.Minute)) {
		t.Fatal("expected once maintenance to be active inside window")
	}
	if monitoring.IsMaintenanceActiveAt(once, end) {
		t.Fatal("expected once maintenance to be inactive at exact end_time")
	}
	onceDisabled := once
	onceDisabled.Enabled = false
	if monitoring.IsMaintenanceActiveAt(onceDisabled, start.Add(30*time.Minute)) {
		t.Fatal("expected disabled maintenance to be inactive")
	}
	onceBadTZ := once
	onceBadTZ.Timezone = "Invalid/Timezone"
	if monitoring.IsMaintenanceActiveAt(onceBadTZ, start.Add(30*time.Minute)) {
		t.Fatal("expected invalid timezone maintenance to be inactive")
	}

	// 2. 每周跨零点窗口：每周五 23:00 - 次日 02:00 (Asia/Shanghai)
	weekly := monitoring.MonitorMaintenance{
		Mode:           monitoring.MaintenanceModePauseCollection,
		ScheduleType:   monitoring.MaintenanceScheduleWeekly,
		RecurrenceJSON: datatypes.JSON(`{"weekdays":[5],"start_hm":"23:00","end_hm":"02:00"}`),
		Timezone:       "Asia/Shanghai",
		Enabled:        true,
	}
	// 2026-11-20 is Friday
	fri2259 := time.Date(2026, 11, 20, 22, 59, 0, 0, shLoc)
	fri2330 := time.Date(2026, 11, 20, 23, 30, 0, 0, shLoc)
	sat0130 := time.Date(2026, 11, 21, 1, 30, 0, 0, shLoc)
	sat0200 := time.Date(2026, 11, 21, 2, 0, 0, 0, shLoc)

	if monitoring.IsMaintenanceActiveAt(weekly, fri2259) {
		t.Fatal("expected Friday 22:59 to be inactive")
	}
	if !monitoring.IsMaintenanceActiveAt(weekly, fri2330) {
		t.Fatal("expected Friday 23:30 to be active")
	}
	if !monitoring.IsMaintenanceActiveAt(weekly, sat0130) {
		t.Fatal("expected Saturday 01:30 (cross-midnight) to be active")
	}
	if monitoring.IsMaintenanceActiveAt(weekly, sat0200) {
		t.Fatal("expected Saturday 02:00 to be inactive")
	}

	// 3. 每月跨零点窗口（含跨月边界：1月31日 23:00 -> 2月1日 01:30）
	monthly := monitoring.MonitorMaintenance{
		Mode:           monitoring.MaintenanceModeCollectSilence,
		ScheduleType:   monitoring.MaintenanceScheduleMonthly,
		RecurrenceJSON: datatypes.JSON(`{"days_of_month":[31],"start_hm":"23:00","end_hm":"02:00"}`),
		Timezone:       "Asia/Shanghai",
		Enabled:        true,
	}
	jan31_2330 := time.Date(2026, 1, 31, 23, 30, 0, 0, shLoc)
	feb01_0130 := time.Date(2026, 2, 1, 1, 30, 0, 0, shLoc)
	feb01_0200 := time.Date(2026, 2, 1, 2, 0, 0, 0, shLoc)

	if !monitoring.IsMaintenanceActiveAt(monthly, jan31_2330) {
		t.Fatal("expected Jan 31 23:30 to be active")
	}
	if !monitoring.IsMaintenanceActiveAt(monthly, feb01_0130) {
		t.Fatal("expected Feb 1 01:30 (month boundary spillover) to be active")
	}
	if monitoring.IsMaintenanceActiveAt(monthly, feb01_0200) {
		t.Fatal("expected Feb 1 02:00 to be inactive")
	}
}

func TestGetActiveWindowForDevice_GroupAndAncestorInheritance(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()

	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())
	now := time.Date(2026, 11, 20, 15, 0, 0, 0, time.UTC)

	mock.ExpectQuery(`(?is)SELECT \* FROM "monitor_maintenances" WHERE enabled = \$1`).
		WithArgs(true).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "mode", "schedule_type", "start_time", "end_time", "recurrence_json", "timezone", "enabled"}).
			AddRow(int64(10), "核心骨干网割接", "pause_collection", "once", now.Add(-time.Hour), now.Add(time.Hour), "{}", "Asia/Shanghai", true))

	// device_groups: 3 -> parent 2 -> parent 1 (维护期挂在祖先分组 1 上)
	mock.ExpectQuery(`(?is)SELECT id, parent_id FROM "device_groups"`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "parent_id"}).
			AddRow(1, nil).
			AddRow(2, 1).
			AddRow(3, 2))

	mock.ExpectQuery(`(?is)SELECT \* FROM "monitor_maintenance_targets" WHERE maintenance_id IN \(\$1\) AND \(\(target_type = \$2 AND target_id = \$3\) OR \(target_type = \$4 AND target_id IN \(\$5,\$6,\$7\)\)\)`).
		WithArgs(int64(10), "device", 99, "device_group", 3, 2, 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "maintenance_id", "target_type", "target_id"}).
			AddRow(int64(100), int64(10), "device_group", int64(1)))

	gid := 3
	active, err := writer.GetActiveWindowForDevice(context.Background(), 99, &gid, now)
	if err != nil {
		t.Fatalf("GetActiveWindowForDevice failed: %v", err)
	}
	if active == nil {
		t.Fatal("expected active maintenance via ancestor group inheritance")
	}
	if active.MaintenanceID != 10 || active.Mode != monitoring.MaintenanceModePauseCollection {
		t.Fatalf("unexpected active maintenance: %+v", active)
	}
	if active.MatchedTargetType != "device_group" || active.MatchedTargetID != 1 {
		t.Fatalf("unexpected matched target: %+v", active)
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestMaintenanceAPI_ValidationAndRBAC(t *testing.T) {
	e := echo.New()
	writer := monitoring.NewMetricsWriter(nil, nil, zap.NewNop())

	// 1. 缺 monitoring:control 返回 403
	hForbidden := handlers.MonitoringHandler{
		Writer: writer,
		Auth:   stubTemplatePermService{perms: []string{"monitoring:read"}},
	}
	body, _ := json.Marshal(map[string]interface{}{
		"name":          "test",
		"mode":          "collect_silence",
		"schedule_type": "once",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/monitoring/maintenances", bytes.NewReader(body))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	req.Header.Set(echo.HeaderAuthorization, "Bearer test")
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)
	err := hForbidden.CreateMonitoringMaintenance(c)
	if err == nil {
		t.Fatal("expected 403 when lacking monitoring:control")
	}
	httpErr, ok := err.(*echo.HTTPError)
	if !ok || httpErr.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %v", err)
	}

	// 2. 非法时区返回 400
	db, _, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()
	hAllowed := handlers.MonitoringHandler{
		Writer: monitoring.NewMetricsWriter(db, nil, zap.NewNop()),
		Auth:   stubTemplatePermService{perms: []string{"monitoring:read", "monitoring:control"}},
	}
	badTZBody, _ := json.Marshal(map[string]interface{}{
		"name":          "bad-tz",
		"mode":          "collect_silence",
		"schedule_type": "once",
		"timezone":      "Mars/Olympus",
		"start_time":    time.Now().UTC().Format(time.RFC3339),
		"end_time":      time.Now().UTC().Add(time.Hour).Format(time.RFC3339),
	})
	req2 := httptest.NewRequest(http.MethodPost, "/api/v1/monitoring/maintenances", bytes.NewReader(badTZBody))
	req2.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	req2.Header.Set(echo.HeaderAuthorization, "Bearer test")
	rec2 := httptest.NewRecorder()
	c2 := e.NewContext(req2, rec2)
	err2 := hAllowed.CreateMonitoringMaintenance(c2)
	if err2 == nil {
		t.Fatal("expected 400 for invalid timezone")
	}
	httpErr2, ok := err2.(*echo.HTTPError)
	if !ok || httpErr2.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %v", err2)
	}

	// 3. 描述超过 256 字符返回 400
	longDesc := strings.Repeat("维", 257)
	longDescBody, _ := json.Marshal(map[string]interface{}{
		"name":          "long-desc",
		"description":   longDesc,
		"mode":          "collect_silence",
		"schedule_type": "once",
		"timezone":      "Asia/Shanghai",
		"start_time":    time.Now().UTC().Format(time.RFC3339),
		"end_time":      time.Now().UTC().Add(time.Hour).Format(time.RFC3339),
		"device_ids":    []int64{1},
	})
	req3 := httptest.NewRequest(http.MethodPost, "/api/v1/monitoring/maintenances", bytes.NewReader(longDescBody))
	req3.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	req3.Header.Set(echo.HeaderAuthorization, "Bearer test")
	err3 := hAllowed.CreateMonitoringMaintenance(e.NewContext(req3, httptest.NewRecorder()))
	httpErr3, ok := err3.(*echo.HTTPError)
	if !ok || httpErr3.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for description > 256 runes, got %v", err3)
	}

	// 4. 空目标列表返回 400
	emptyTargetsBody, _ := json.Marshal(map[string]interface{}{
		"name":          "no-targets",
		"description":   "ok",
		"mode":          "collect_silence",
		"schedule_type": "once",
		"timezone":      "Asia/Shanghai",
		"start_time":    time.Now().UTC().Format(time.RFC3339),
		"end_time":      time.Now().UTC().Add(time.Hour).Format(time.RFC3339),
	})
	req4 := httptest.NewRequest(http.MethodPost, "/api/v1/monitoring/maintenances", bytes.NewReader(emptyTargetsBody))
	req4.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	req4.Header.Set(echo.HeaderAuthorization, "Bearer test")
	err4 := hAllowed.CreateMonitoringMaintenance(e.NewContext(req4, httptest.NewRecorder()))
	httpErr4, ok := err4.(*echo.HTTPError)
	if !ok || httpErr4.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for empty targets, got %v", err4)
	}
}
