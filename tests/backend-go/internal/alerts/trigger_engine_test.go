package alerts_test

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/labstack/echo/v4"
	"go.uber.org/zap"
	"gorm.io/gorm"
	"gorm.io/gorm/schema"

	"github.com/your-org/inspect-system/backend-go/internal/alerts"
	"github.com/your-org/inspect-system/backend-go/internal/auth"
	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
)

type stubTriggerPermService struct {
	perms []string
}

func (s stubTriggerPermService) GetActiveUserFromToken(_ context.Context, _ string) (*auth.UserRecord, error) {
	active := true
	return &auth.UserRecord{ID: "00000000-0000-0000-0000-000000000001", Username: "admin", Role: "admin", IsActive: &active}, nil
}

func (s stubTriggerPermService) GetPermissionsByRole(_ context.Context, _ string) ([]string, error) {
	return s.perms, nil
}

type stubMaintChecker struct {
	windows map[int]alerts.MaintenanceWindowInfo
}

func (s stubMaintChecker) GetActiveMaintenanceMapForDevices(_ context.Context, _ time.Time) (map[int]alerts.MaintenanceWindowInfo, error) {
	return s.windows, nil
}

func TestTriggerEngine_SchemaModels(t *testing.T) {
	cacheStore := &sync.Map{}
	namer := schema.NamingStrategy{}

	parsed, err := schema.Parse(&alerts.TriggerEvalState{}, cacheStore, namer)
	if err != nil {
		t.Fatalf("parse TriggerEvalState schema failed: %v", err)
	}
	if parsed.Table != "trigger_eval_states" {
		t.Fatalf("table = %q, want trigger_eval_states", parsed.Table)
	}
}

func TestTriggerEngine_DurationWindowAndRestartRecovery(t *testing.T) {
	db, mock, cleanup := newAlertsGormDBWithSQLMock(t)
	defer cleanup()

	t0 := time.Date(2026, 11, 20, 10, 0, 0, 0, time.UTC)
	t1 := t0.Add(15 * time.Minute)

	// Round 1 (t0): CPU = 88 > 80, duration = 900s (15m) -> 仅写 trigger_eval_states，不创建告警
	eval1 := alerts.NewEvaluator(db, nil, nil, zap.NewNop())
	eval1.SetNowFunc(func() time.Time { return t0 })

	mock.ExpectQuery(`(?is)SELECT \* FROM "alert_rules" WHERE is_active = \$1`).
		WithArgs(true).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "category", "metric_name", "operator", "threshold_value", "duration", "severity", "is_active", "expression_mode"}).
			AddRow(1, "CPU持续过高", "performance", "cpu_usage", ">", 80.0, 900, "warning", true, "threshold"))

	mock.ExpectQuery(`(?is)SELECT id, name, device_type, ip_address, COALESCE\(topology_role, 'access'\) AS topology_role, status FROM "devices"`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "device_type", "ip_address", "topology_role", "status"}).
			AddRow(10, "sw-1", "switch", "10.0.0.10", "access", "online"))

	mock.ExpectQuery(`(?is)FROM device_metrics`).
		WillReturnRows(sqlmock.NewRows([]string{"device_id", "metric_name", "metric_value"}).
			AddRow(10, "cpu_usage", 88.0))
	mock.ExpectQuery(`(?is)SELECT device_id, metric_name, metric_value FROM "device_latest_metrics"`).
		WillReturnRows(sqlmock.NewRows([]string{"device_id", "metric_name", "metric_value"}))
	mock.ExpectQuery(`(?is)SELECT id, cpu_usage, memory_usage, temperature FROM "devices"`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "cpu_usage", "memory_usage", "temperature"}))

	// evaluateDeviceConnectivity
	mock.ExpectQuery(`(?is)SELECT id, name, ip_address, status FROM "devices"`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "ip_address", "status"}).AddRow(10, "sw-1", "10.0.0.10", "online"))
	mock.ExpectQuery(`(?is)SELECT \* FROM "alerts" WHERE device_id = \$1 AND category = \$2 AND status = \$3`).
		WillReturnError(gorm.ErrRecordNotFound)

	// trigger_eval_states lookup -> not found -> upsert
	mock.ExpectQuery(`(?is)SELECT \* FROM "trigger_eval_states"`).
		WillReturnError(gorm.ErrRecordNotFound)
	mock.ExpectExec(`(?is)INSERT INTO "trigger_eval_states"`).
		WillReturnResult(sqlmock.NewResult(1, 1))

	created1, resolved1, err := eval1.EvaluateAll(context.Background())
	if err != nil {
		t.Fatalf("Round 1 EvaluateAll failed: %v", err)
	}
	if created1 != 0 || resolved1 != 0 {
		t.Fatalf("Round 1 expected 0/0, got %d/%d", created1, resolved1)
	}

	// Round 2 (t1 = t0 + 15m): 新建 Evaluator 实例（模拟服务重启）从 trigger_eval_states 恢复 breach_since，满窗触发告警
	eval2 := alerts.NewEvaluator(db, nil, nil, zap.NewNop())
	eval2.SetNowFunc(func() time.Time { return t1 })

	mock.ExpectQuery(`(?is)SELECT \* FROM "alert_rules" WHERE is_active = \$1`).
		WithArgs(true).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "category", "metric_name", "operator", "threshold_value", "duration", "severity", "is_active", "expression_mode"}).
			AddRow(1, "CPU持续过高", "performance", "cpu_usage", ">", 80.0, 900, "warning", true, "threshold"))
	mock.ExpectQuery(`(?is)SELECT id, name, device_type, ip_address, COALESCE\(topology_role, 'access'\) AS topology_role, status FROM "devices"`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "device_type", "ip_address", "topology_role", "status"}).
			AddRow(10, "sw-1", "switch", "10.0.0.10", "access", "online"))
	mock.ExpectQuery(`(?is)FROM device_metrics`).
		WillReturnRows(sqlmock.NewRows([]string{"device_id", "metric_name", "metric_value"}).
			AddRow(10, "cpu_usage", 89.0))
	mock.ExpectQuery(`(?is)SELECT device_id, metric_name, metric_value FROM "device_latest_metrics"`).
		WillReturnRows(sqlmock.NewRows([]string{"device_id", "metric_name", "metric_value"}))
	mock.ExpectQuery(`(?is)SELECT id, cpu_usage, memory_usage, temperature FROM "devices"`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "cpu_usage", "memory_usage", "temperature"}))

	mock.ExpectQuery(`(?is)SELECT id, name, ip_address, status FROM "devices"`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "ip_address", "status"}).AddRow(10, "sw-1", "10.0.0.10", "online"))
	mock.ExpectQuery(`(?is)SELECT \* FROM "alerts" WHERE device_id = \$1 AND category = \$2 AND status = \$3`).
		WillReturnError(gorm.ErrRecordNotFound)

	// 恢复 breach_since = t0
	mock.ExpectQuery(`(?is)SELECT \* FROM "trigger_eval_states"`).
		WillReturnRows(sqlmock.NewRows([]string{"rule_id", "device_id", "entity_key", "breach_since", "consecutive_hits", "is_firing", "last_value", "last_eval_at"}).
			AddRow(1, 10, "", t0, 1, false, 88.0, t0))
	mock.ExpectExec(`(?is)INSERT INTO "trigger_eval_states"`).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectQuery(`(?is)SELECT \* FROM "alerts" WHERE rule_id = \$1 AND device_id = \$2`).
		WillReturnError(gorm.ErrRecordNotFound)
	mock.ExpectQuery(`(?is)SELECT \* FROM "alerts" WHERE rule_id = \$1 AND device_id = \$2`).
		WillReturnError(gorm.ErrRecordNotFound)
	mock.ExpectQuery(`(?is)INSERT INTO "alerts"`).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(101))

	created2, _, err := eval2.EvaluateAll(context.Background())
	if err != nil {
		t.Fatalf("Round 2 EvaluateAll failed: %v", err)
	}
	if created2 != 1 {
		t.Fatalf("Round 2 expected created=1 after duration window, got %d", created2)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestTriggerEngine_HysteresisDeadbandAndRecovery(t *testing.T) {
	db, mock, cleanup := newAlertsGormDBWithSQLMock(t)
	defer cleanup()

	now := time.Date(2026, 11, 20, 10, 0, 0, 0, time.UTC)
	eval := alerts.NewEvaluator(db, nil, nil, zap.NewNop())
	eval.SetNowFunc(func() time.Time { return now })

	recThresh := 75.0
	autoResolve := true

	// 读数 80 处于 (75, 85] 缓冲带，必须保持告警不抖动也不恢复
	mock.ExpectQuery(`(?is)SELECT \* FROM "alert_rules"`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "category", "metric_name", "operator", "threshold_value", "duration", "severity", "auto_resolve", "is_active", "expression_mode", "recovery_operator", "recovery_threshold"}).
			AddRow(2, "温度滞后规则", "hardware", "temperature", ">", 85.0, 0, "critical", autoResolve, true, "hysteresis", "<", recThresh))
	mock.ExpectQuery(`(?is)SELECT id, name, device_type, ip_address, COALESCE\(topology_role, 'access'\) AS topology_role, status FROM "devices"`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "device_type", "ip_address", "topology_role", "status"}).
			AddRow(10, "sw-1", "switch", "10.0.0.10", "access", "online"))
	mock.ExpectQuery(`(?is)FROM device_metrics`).
		WillReturnRows(sqlmock.NewRows([]string{"device_id", "metric_name", "metric_value"}).
			AddRow(10, "temperature", 80.0))
	mock.ExpectQuery(`(?is)SELECT device_id, metric_name, metric_value FROM "device_latest_metrics"`).
		WillReturnRows(sqlmock.NewRows([]string{"device_id", "metric_name", "metric_value"}))
	mock.ExpectQuery(`(?is)SELECT id, cpu_usage, memory_usage, temperature FROM "devices"`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "cpu_usage", "memory_usage", "temperature"}))
	mock.ExpectQuery(`(?is)SELECT id, name, ip_address, status FROM "devices"`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "ip_address", "status"}).AddRow(10, "sw-1", "10.0.0.10", "online"))
	mock.ExpectQuery(`(?is)SELECT \* FROM "alerts" WHERE device_id = \$1 AND category = \$2 AND status = \$3`).
		WillReturnError(gorm.ErrRecordNotFound)
	mock.ExpectQuery(`(?is)SELECT \* FROM "trigger_eval_states"`).
		WillReturnRows(sqlmock.NewRows([]string{"rule_id", "device_id", "entity_key", "breach_since", "consecutive_hits", "is_firing", "last_value", "last_eval_at"}).
			AddRow(2, 10, "", now.Add(-5*time.Minute), 2, true, 87.0, now.Add(-time.Minute)))
	mock.ExpectExec(`(?is)INSERT INTO "trigger_eval_states"`).
		WillReturnResult(sqlmock.NewResult(1, 1))

	_, resolved1, err := eval.EvaluateAll(context.Background())
	if err != nil {
		t.Fatalf("Hysteresis deadband EvaluateAll failed: %v", err)
	}
	if resolved1 != 0 {
		t.Fatalf("expected 0 resolved in deadband, got %d", resolved1)
	}

	// 读数降至 72 (< 75) 自动恢复
	mock.ExpectQuery(`(?is)SELECT \* FROM "alert_rules"`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "category", "metric_name", "operator", "threshold_value", "duration", "severity", "auto_resolve", "is_active", "expression_mode", "recovery_operator", "recovery_threshold"}).
			AddRow(2, "温度滞后规则", "hardware", "temperature", ">", 85.0, 0, "critical", autoResolve, true, "hysteresis", "<", recThresh))
	mock.ExpectQuery(`(?is)SELECT id, name, device_type, ip_address, COALESCE\(topology_role, 'access'\) AS topology_role, status FROM "devices"`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "device_type", "ip_address", "topology_role", "status"}).
			AddRow(10, "sw-1", "switch", "10.0.0.10", "access", "online"))
	mock.ExpectQuery(`(?is)FROM device_metrics`).
		WillReturnRows(sqlmock.NewRows([]string{"device_id", "metric_name", "metric_value"}).
			AddRow(10, "temperature", 72.0))
	mock.ExpectQuery(`(?is)SELECT device_id, metric_name, metric_value FROM "device_latest_metrics"`).
		WillReturnRows(sqlmock.NewRows([]string{"device_id", "metric_name", "metric_value"}))
	mock.ExpectQuery(`(?is)SELECT id, cpu_usage, memory_usage, temperature FROM "devices"`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "cpu_usage", "memory_usage", "temperature"}))
	mock.ExpectQuery(`(?is)SELECT id, name, ip_address, status FROM "devices"`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "ip_address", "status"}).AddRow(10, "sw-1", "10.0.0.10", "online"))
	mock.ExpectQuery(`(?is)SELECT \* FROM "alerts" WHERE device_id = \$1 AND category = \$2 AND status = \$3`).
		WillReturnError(gorm.ErrRecordNotFound)
	mock.ExpectQuery(`(?is)SELECT \* FROM "trigger_eval_states"`).
		WillReturnRows(sqlmock.NewRows([]string{"rule_id", "device_id", "entity_key", "breach_since", "consecutive_hits", "is_firing", "last_value", "last_eval_at"}).
			AddRow(2, 10, "", now.Add(-5*time.Minute), 2, true, 80.0, now))
	mock.ExpectExec(`(?is)INSERT INTO "trigger_eval_states"`).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectQuery(`(?is)SELECT \* FROM "alerts" WHERE rule_id = \$1 AND device_id = \$2 AND COALESCE\(entity_key, ''\) = \$3 AND status = \$4`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "device_id", "status"}).AddRow(201, 10, "open"))
	mock.ExpectExec(`(?is)UPDATE "alerts" SET`).
		WillReturnResult(sqlmock.NewResult(0, 1))

	_, resolved2, err := eval.EvaluateAll(context.Background())
	if err != nil {
		t.Fatalf("Hysteresis recovery EvaluateAll failed: %v", err)
	}
	if resolved2 != 1 {
		t.Fatalf("expected 1 resolved below recovery threshold, got %d", resolved2)
	}
}

func TestTriggerEngine_NoDataUptimeDropIfFlapAndMaintenanceSilence(t *testing.T) {
	db, mock, cleanup := newAlertsGormDBWithSQLMock(t)
	defer cleanup()

	now := time.Date(2026, 11, 20, 12, 0, 0, 0, time.UTC)
	eval := alerts.NewEvaluator(db, nil, nil, zap.NewNop())
	eval.SetNowFunc(func() time.Time { return now })
	eval.SetMaintenanceChecker(stubMaintChecker{
		windows: map[int]alerts.MaintenanceWindowInfo{
			10: {MaintenanceID: 88, Name: "割接静默", Mode: "collect_silence"},
		},
	})

	// 同时测试 nodata + uptime_drop + if_flap 三种模式，且设备 10 命中维护期标 suppressed_by='maintenance'
	mock.ExpectQuery(`(?is)SELECT \* FROM "alert_rules"`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "category", "metric_name", "operator", "threshold_value", "duration", "severity", "is_active", "expression_mode", "nodata_seconds"}).
			AddRow(10, "采集断流", "availability", "cpu_usage", ">", 0.0, 0, "warning", true, "nodata", 300).
			AddRow(11, "设备异常重启", "system", "uptime", "<", 60.0, 0, "critical", true, "uptime_drop", 0).
			AddRow(12, "端口频繁闪断", "interface", "flap_count_1h", ">=", 4.0, 0, "warning", true, "if_flap", 0))

	mock.ExpectQuery(`(?is)SELECT id, name, device_type, ip_address, COALESCE\(topology_role, 'access'\) AS topology_role, status FROM "devices"`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "device_type", "ip_address", "topology_role", "status"}).
			AddRow(10, "core-1", "switch", "10.0.0.1", "core", "online"))
	mock.ExpectQuery(`(?is)FROM device_metrics`).
		WillReturnRows(sqlmock.NewRows([]string{"device_id", "metric_name", "metric_value"}))
	mock.ExpectQuery(`(?is)SELECT device_id, metric_name, metric_value FROM "device_latest_metrics"`).
		WillReturnRows(sqlmock.NewRows([]string{"device_id", "metric_name", "metric_value"}))
	mock.ExpectQuery(`(?is)SELECT id, cpu_usage, memory_usage, temperature FROM "devices"`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "cpu_usage", "memory_usage", "temperature"}))
	mock.ExpectQuery(`(?is)SELECT id, name, ip_address, status FROM "devices"`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "ip_address", "status"}).AddRow(10, "core-1", "10.0.0.1", "online"))
	mock.ExpectQuery(`(?is)SELECT \* FROM "alerts" WHERE device_id = \$1 AND category = \$2 AND status = \$3`).
		WillReturnError(gorm.ErrRecordNotFound)

	// Rule 10 (nodata): 10分钟前采集 -> > 300s 触发
	mock.ExpectQuery(`(?is)SELECT MAX\(collected_at\) AS collected_at FROM "device_latest_metrics"`).
		WillReturnRows(sqlmock.NewRows([]string{"collected_at"}).AddRow(now.Add(-10 * time.Minute)))
	mock.ExpectQuery(`(?is)SELECT \* FROM "trigger_eval_states"`).WillReturnError(gorm.ErrRecordNotFound)
	mock.ExpectExec(`(?is)INSERT INTO "trigger_eval_states"`).WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectQuery(`(?is)SELECT \* FROM "alerts" WHERE rule_id = \$1 AND device_id = \$2`).WillReturnError(gorm.ErrRecordNotFound)
	mock.ExpectQuery(`(?is)SELECT \* FROM "alerts" WHERE rule_id = \$1 AND device_id = \$2`).WillReturnError(gorm.ErrRecordNotFound)
	mock.ExpectQuery(`(?is)INSERT INTO "alerts"`).WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(301))

	// Rule 11 (uptime_drop): prev=3600, current=120 -> 骤降触发
	mock.ExpectQuery(`(?is)SELECT metric_value, prev_value FROM "device_latest_metrics"`).
		WillReturnRows(sqlmock.NewRows([]string{"metric_value", "prev_value"}).AddRow(120.0, 3600.0))
	mock.ExpectQuery(`(?is)SELECT \* FROM "trigger_eval_states"`).WillReturnError(gorm.ErrRecordNotFound)
	mock.ExpectExec(`(?is)INSERT INTO "trigger_eval_states"`).WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectQuery(`(?is)SELECT \* FROM "alerts" WHERE rule_id = \$1 AND device_id = \$2`).WillReturnError(gorm.ErrRecordNotFound)
	mock.ExpectQuery(`(?is)SELECT \* FROM "alerts" WHERE rule_id = \$1 AND device_id = \$2`).WillReturnError(gorm.ErrRecordNotFound)
	mock.ExpectQuery(`(?is)INSERT INTO "alerts"`).WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(302))

	// Rule 12 (if_flap): GE0/0/1 flap_count_1h=5 -> >= 4 触发
	mock.ExpectQuery(`(?is)SELECT name, COALESCE\(flap_count_1h, 0\) AS flap_count_1h FROM "device_interfaces"`).
		WillReturnRows(sqlmock.NewRows([]string{"name", "flap_count_1h"}).AddRow("GE0/0/1", 5))
	mock.ExpectQuery(`(?is)SELECT \* FROM "trigger_eval_states"`).WillReturnError(gorm.ErrRecordNotFound)
	mock.ExpectExec(`(?is)INSERT INTO "trigger_eval_states"`).WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectQuery(`(?is)SELECT \* FROM "alerts" WHERE rule_id = \$1 AND device_id = \$2`).WillReturnError(gorm.ErrRecordNotFound)
	mock.ExpectQuery(`(?is)SELECT \* FROM "alerts" WHERE rule_id = \$1 AND device_id = \$2`).WillReturnError(gorm.ErrRecordNotFound)
	mock.ExpectQuery(`(?is)INSERT INTO "alerts"`).WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(303))

	created, _, err := eval.EvaluateAll(context.Background())
	if err != nil {
		t.Fatalf("EvaluateAll failed: %v", err)
	}
	if created != 3 {
		t.Fatalf("expected 3 created alerts (nodata + uptime_drop + if_flap), got %d", created)
	}
}

func TestDependencySuppressor_LLDPRankAndDAGCycle(t *testing.T) {
	db, mock, cleanup := newAlertsGormDBWithSQLMock(t)
	defer cleanup()

	offline := map[int]bool{1: true, 2: true} // device 1=CoreA(offline), device 2=CoreB(offline)
	rule := alerts.AlertRule{DependencyMode: alerts.DependencyModeLLDPUpstream}

	// 1. access(2) 设备 3 直连 CoreA(4, offline) -> 必须被抑制
	mock.ExpectQuery(`(?is)SELECT remote_mgmt_ip, remote_chassis_id, remote_sys_name FROM "device_neighbors" WHERE device_id = \$1`).
		WithArgs(3).
		WillReturnRows(sqlmock.NewRows([]string{"remote_mgmt_ip", "remote_chassis_id", "remote_sys_name"}).
			AddRow("10.0.0.1", "aa:bb:cc", "CoreA"))
	mock.ExpectQuery(`(?is)SELECT id, COALESCE\(topology_role, 'access'\) AS topology_role FROM "devices"`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "topology_role"}).AddRow(1, "core"))

	sup, refID := alerts.IsSuppressedByUpstream(context.Background(), db, rule, 3, "access", offline)
	if !sup || refID != 1 {
		t.Fatalf("expected access device 3 to be suppressed by core device 1, got sup=%v refID=%d", sup, refID)
	}

	// 2. 同级互连 CoreA(4) <-> CoreB(4)：绝不互相抑制！
	mock.ExpectQuery(`(?is)SELECT remote_mgmt_ip, remote_chassis_id, remote_sys_name FROM "device_neighbors" WHERE device_id = \$1`).
		WithArgs(1).
		WillReturnRows(sqlmock.NewRows([]string{"remote_mgmt_ip", "remote_chassis_id", "remote_sys_name"}).
			AddRow("10.0.0.2", "dd:ee:ff", "CoreB"))
	mock.ExpectQuery(`(?is)SELECT id, COALESCE\(topology_role, 'access'\) AS topology_role FROM "devices"`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "topology_role"}).AddRow(2, "core"))

	supPeer, _ := alerts.IsSuppressedByUpstream(context.Background(), db, rule, 1, "core", offline)
	if supPeer {
		t.Fatal("same-rank peers CoreA <-> CoreB must NOT suppress each other")
	}

	// 3. manual_device DFS DAG 环路检测：自环 A->A 与间接环 A->B->A
	if err := alerts.ValidateDependencyDAG(context.Background(), nil, 0, []int{10}, 10); !errors.Is(err, alerts.ErrDependencyCycle) {
		t.Fatalf("expected ErrDependencyCycle on self-loop, got %v", err)
	}

	mock.ExpectQuery(`(?is)SELECT id, specific_devices, depends_on_device_id FROM "alert_rules"`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "specific_devices", "depends_on_device_id"}).
			AddRow(5, `[20]`, 10)) // 已有规则：20 -> 10
	if err := alerts.ValidateDependencyDAG(context.Background(), db, 0, []int{10}, 20); !errors.Is(err, alerts.ErrDependencyCycle) {
		t.Fatalf("expected ErrDependencyCycle on indirect cycle 10->20->10, got %v", err)
	}
}

func TestTriggersAPI_DAGCycleReturns400AndSnoozeWhitelistAndIsolation(t *testing.T) {
	db, mock, cleanup := newAlertsGormDBWithSQLMock(t)
	defer cleanup()

	e := echo.New()
	alertSvc := alerts.NewService(db, zap.NewNop())

	// 1. Triggers API: manual_device 自环返 400
	mh := handlers.MonitoringHandler{
		Alerts: alertSvc,
		Auth:   stubTriggerPermService{perms: []string{"alerts:create", "alerts:read", "alerts:update", "alerts:delete"}},
	}
	cycleBody, _ := json.Marshal(map[string]interface{}{
		"name":                 "self-cycle",
		"metric_name":          "cpu_usage",
		"operator":             ">",
		"threshold_value":      90,
		"specific_devices":     []int{10},
		"dependency_mode":      "manual_device",
		"depends_on_device_id": 10,
	})
	reqCycle := httptest.NewRequest(http.MethodPost, "/api/v1/monitoring/triggers", bytes.NewReader(cycleBody))
	reqCycle.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	reqCycle.Header.Set(echo.HeaderAuthorization, "Bearer test")
	recCycle := httptest.NewRecorder()
	errCycle := mh.CreateMonitoringTrigger(e.NewContext(reqCycle, recCycle))
	httpErr, ok := errCycle.(*echo.HTTPError)
	if !ok || httpErr.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 on dependency cycle, got %v", errCycle)
	}

	// 2. Snooze API: 缺 alerts:update 返 403
	ahForbidden := handlers.AlertsHandler{
		Service: alertSvc,
		Auth:    stubTriggerPermService{perms: []string{"alerts:read"}},
	}
	snoozeBody, _ := json.Marshal(map[string]interface{}{"duration_hours": 8, "reason": "割接观察"})
	req403 := httptest.NewRequest(http.MethodPost, "/api/v1/alerts/1/snooze", bytes.NewReader(snoozeBody))
	req403.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	req403.Header.Set(echo.HeaderAuthorization, "Bearer test")
	c403 := e.NewContext(req403, httptest.NewRecorder())
	c403.SetParamNames("alert_id")
	c403.SetParamValues("1")
	err403 := ahForbidden.SnoozeAlert(c403)
	if he, ok := err403.(*echo.HTTPError); !ok || he.Code != http.StatusForbidden {
		t.Fatalf("expected 403 without alerts:update, got %v", err403)
	}

	// 3. Snooze API: 非法时长 (0 / 99) 返 400
	ahAllowed := handlers.AlertsHandler{
		Service: alertSvc,
		Auth:    stubTriggerPermService{perms: []string{"alerts:update"}},
	}
	for _, badHours := range []int{0, 99} {
		badBody, _ := json.Marshal(map[string]interface{}{"duration_hours": badHours, "reason": "test"})
		reqBad := httptest.NewRequest(http.MethodPost, "/api/v1/alerts/1/snooze", bytes.NewReader(badBody))
		reqBad.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
		reqBad.Header.Set(echo.HeaderAuthorization, "Bearer test")
		cBad := e.NewContext(reqBad, httptest.NewRecorder())
		cBad.SetParamNames("alert_id")
		cBad.SetParamValues("1")
		errBad := ahAllowed.SnoozeAlert(cBad)
		if he, ok := errBad.(*echo.HTTPError); !ok || he.Code != http.StatusBadRequest {
			t.Fatalf("duration_hours=%d expected 400, got %v", badHours, errBad)
		}
	}

	// 4. Snooze API: 合法时长 8h，仅更新该单条告警 + 写 alert_operation_history
	mock.ExpectBegin()
	mock.ExpectQuery(`(?is)SELECT \* FROM "alerts" WHERE id = \$1`).
		WithArgs(101, 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "device_id", "status"}).AddRow(101, 10, "open"))
	mock.ExpectExec(`(?is)UPDATE "alerts" SET .*snoozed_until.*WHERE id = \$5`).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectQuery(`(?is)INSERT INTO "alert_operation_history"`).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(1))
	mock.ExpectQuery(`(?is)SELECT \* FROM "alerts" WHERE id = \$1`).
		WithArgs(101, 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "device_id", "status", "snoozed_by", "snooze_reason"}).AddRow(101, 10, "open", "00000000-0000-0000-0000-000000000001", "割接观察"))
	mock.ExpectCommit()

	reqOK := httptest.NewRequest(http.MethodPost, "/api/v1/alerts/101/snooze", bytes.NewReader(snoozeBody))
	reqOK.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	reqOK.Header.Set(echo.HeaderAuthorization, "Bearer test")
	recOK := httptest.NewRecorder()
	cOK := e.NewContext(reqOK, recOK)
	cOK.SetParamNames("alert_id")
	cOK.SetParamValues("101")
	if err := ahAllowed.SnoozeAlert(cOK); err != nil {
		t.Fatalf("SnoozeAlert failed: %v", err)
	}
	if recOK.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d body=%s", recOK.Code, recOK.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}
