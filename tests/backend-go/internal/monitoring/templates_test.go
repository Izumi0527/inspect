package monitoring_test

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/labstack/echo/v4"
	"go.uber.org/zap"
	"gorm.io/gorm/schema"

	"github.com/your-org/inspect-system/backend-go/internal/auth"
	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
)

type stubTemplatePermService struct {
	perms []string
}

func (s stubTemplatePermService) GetActiveUserFromToken(ctx context.Context, tokenStr string) (*auth.UserRecord, error) {
	active := true
	return &auth.UserRecord{ID: "user-1", Username: "tester", Role: "viewer", IsActive: &active}, nil
}

func (s stubTemplatePermService) GetPermissionsByRole(ctx context.Context, role string) ([]string, error) {
	return s.perms, nil
}

func TestTemplates_SchemaModels(t *testing.T) {
	cacheStore := &sync.Map{}
	namer := schema.NamingStrategy{}

	models := []struct {
		model interface{}
		table string
	}{
		{&monitoring.MonitorTemplate{}, "monitor_templates"},
		{&monitoring.MonitorItem{}, "monitor_items"},
		{&monitoring.MonitorLLDRule{}, "monitor_lld_rules"},
		{&monitoring.TemplateGroupBinding{}, "template_group_bindings"},
		{&monitoring.DeviceTemplateBinding{}, "device_template_bindings"},
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

func TestTemplates_EnsureBuiltinSeedIdempotent(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()

	// 验证重复调用两次幂等（事务内按 code 查询并创建/更新）
	for round := 0; round < 2; round++ {
		mock.ExpectBegin()
		for i := 0; i < 4; i++ {
			mock.ExpectQuery(`(?is)SELECT \* FROM "monitor_templates" WHERE code = .*`).
				WillReturnRows(sqlmock.NewRows([]string{"id", "code"}).AddRow(int64(i+1), "builtin_code"))
			mock.ExpectExec(`(?is)UPDATE "monitor_templates" SET .*`).
				WillReturnResult(sqlmock.NewResult(0, 1))

			// 每个内置方案 2~4 个采集项
			itemCount := 4
			if i == 2 {
				itemCount = 2
			} else if i == 3 {
				itemCount = 3
			}
			for j := 0; j < itemCount; j++ {
				mock.ExpectQuery(`(?is)INSERT INTO "monitor_items".*ON CONFLICT.*DO NOTHING.*`).
					WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(int64(j + 1)))
			}

			ruleCount := 1
			if i == 3 {
				ruleCount = 2
			}
			for k := 0; k < ruleCount; k++ {
				mock.ExpectQuery(`(?is)INSERT INTO "monitor_lld_rules".*ON CONFLICT.*DO NOTHING.*`).
					WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(int64(k + 1)))
			}
		}
		mock.ExpectCommit()
	}

	if err := monitoring.EnsureBuiltinMonitorTemplates(context.Background(), db, zap.NewNop()); err != nil {
		t.Fatalf("first EnsureBuiltinMonitorTemplates failed: %v", err)
	}
	if err := monitoring.EnsureBuiltinMonitorTemplates(context.Background(), db, zap.NewNop()); err != nil {
		t.Fatalf("second EnsureBuiltinMonitorTemplates failed: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

func TestTemplates_AutoBindLegacyDevices_DoesNotOverwriteManual(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()

	mock.ExpectQuery(`(?is)SELECT \* FROM "monitor_templates" WHERE is_builtin = \$1`).
		WithArgs(true).
		WillReturnRows(sqlmock.NewRows([]string{"id", "code", "is_builtin"}).
			AddRow(int64(1), monitoring.BuiltinTemplateHuaweiCampusSwitch, true).
			AddRow(int64(2), monitoring.BuiltinTemplateCiscoH3CCoreNet, true).
			AddRow(int64(3), monitoring.BuiltinTemplateBasicConnectivity, true).
			AddRow(int64(4), monitoring.BuiltinTemplateOpticalBorder, true))

	mock.ExpectQuery(`(?is)SELECT id, vendor, device_type, detected_device_type, group_id FROM "devices"`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "vendor", "device_type", "detected_device_type", "group_id"}).
			AddRow(101, "huawei", "switch", nil, nil).
			AddRow(102, "cisco", "router", nil, nil))

	// 设备 102 已有手工绑定，绝不能覆盖；仅设备 101 应自动绑定
	mock.ExpectQuery(`(?is)SELECT DISTINCT "device_id" FROM "device_template_bindings"`).
		WillReturnRows(sqlmock.NewRows([]string{"device_id"}).AddRow(102))
	mock.ExpectQuery(`(?is)SELECT DISTINCT "group_id" FROM "template_group_bindings".*`).
		WillReturnRows(sqlmock.NewRows([]string{"group_id"}))

	mock.ExpectQuery(`(?is)INSERT INTO "device_template_bindings".*ON CONFLICT.*DO NOTHING.*`).
		WithArgs(101, int64(1), true, sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(int64(1)))

	if err := monitoring.AutoBindLegacyDevices(context.Background(), db, zap.NewNop()); err != nil {
		t.Fatalf("AutoBindLegacyDevices failed: %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("unmet expectations: %v", err)
	}
}

func TestTemplates_BuiltinImmutableAndCloneAllowed(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()
	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())

	// Update 内置方案应被拒绝
	mock.ExpectQuery(`(?is)SELECT \* FROM "monitor_templates" WHERE id = \$1`).
		WithArgs(int64(1), 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "code", "name", "is_builtin"}).AddRow(int64(1), "builtin_hw", "华为方案", true))

	_, err := writer.UpdateMonitorTemplate(context.Background(), 1, monitoring.CreateTemplateInput{Name: "改名"})
	if !errors.Is(err, monitoring.ErrBuiltinTemplateImmutable) {
		t.Fatalf("expected ErrBuiltinTemplateImmutable on update, got: %v", err)
	}

	// Delete 内置方案应被拒绝
	mock.ExpectBegin()
	mock.ExpectQuery(`(?is)SELECT \* FROM "monitor_templates" WHERE id = \$1`).
		WithArgs(int64(1), 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "code", "name", "is_builtin"}).AddRow(int64(1), "builtin_hw", "华为方案", true))
	mock.ExpectRollback()

	err = writer.DeleteMonitorTemplate(context.Background(), 1)
	if !errors.Is(err, monitoring.ErrBuiltinTemplateImmutable) {
		t.Fatalf("expected ErrBuiltinTemplateImmutable on delete, got: %v", err)
	}

	// Clone 内置方案应允许
	mock.ExpectBegin()
	mock.ExpectQuery(`(?is)SELECT \* FROM "monitor_templates" WHERE id = \$1`).
		WithArgs(int64(1), 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "code", "name", "is_builtin", "default_interval_sec", "macros_json"}).
			AddRow(int64(1), "builtin_hw", "华为方案", true, 300, "[]"))
	mock.ExpectQuery(`(?is)INSERT INTO "monitor_templates".*`).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(int64(10)))
	mock.ExpectQuery(`(?is)SELECT \* FROM "monitor_items" WHERE template_id = \$1`).
		WithArgs(int64(1)).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))
	mock.ExpectQuery(`(?is)SELECT \* FROM "monitor_lld_rules" WHERE template_id = \$1`).
		WithArgs(int64(1)).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))
	mock.ExpectCommit()

	// GetMonitorTemplate 查询克隆结果
	mock.ExpectQuery(`(?is)SELECT \* FROM "monitor_templates" WHERE id = \$1`).
		WithArgs(int64(10), 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "code", "name", "is_builtin", "default_interval_sec", "macros_json"}).
			AddRow(int64(10), "clone_builtin_hw", "我的华为自定义方案", false, 300, "[]"))
	mock.ExpectQuery(`(?is)SELECT \* FROM "monitor_items" WHERE template_id = \$1`).
		WithArgs(int64(10)).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))
	mock.ExpectQuery(`(?is)SELECT \* FROM "monitor_lld_rules" WHERE template_id = \$1`).
		WithArgs(int64(10)).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))
	mock.ExpectQuery(`(?is)SELECT \* FROM "template_group_bindings".*`).
		WithArgs(int64(10), true).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))
	mock.ExpectQuery(`(?is)SELECT \* FROM "device_template_bindings".*`).
		WithArgs(int64(10), true).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))

	cloned, err := writer.CloneMonitorTemplate(context.Background(), 1, "我的华为自定义方案")
	if err != nil {
		t.Fatalf("CloneMonitorTemplate failed: %v", err)
	}
	if cloned.IsBuiltin || cloned.Name != "我的华为自定义方案" {
		t.Fatalf("unexpected cloned template: %+v", cloned)
	}
}

func TestTemplates_ResolveEffectiveConfig_GroupInheritanceAndDeviceOverride(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()
	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())

	parentGroupID := 10
	childGroupID := 20

	// 设备属于子分组 20，父分组为 10
	mock.ExpectQuery(`(?is)SELECT id, group_id FROM "devices" WHERE id = \$1`).
		WithArgs(5, 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "group_id"}).AddRow(5, childGroupID))
	mock.ExpectQuery(`(?is)SELECT "parent_id" FROM "device_groups" WHERE id = \$1`).
		WithArgs(childGroupID, 1).
		WillReturnRows(sqlmock.NewRows([]string{"parent_id"}).AddRow(parentGroupID))
	mock.ExpectQuery(`(?is)SELECT "parent_id" FROM "device_groups" WHERE id = \$1`).
		WithArgs(parentGroupID, 1).
		WillReturnRows(sqlmock.NewRows([]string{"parent_id"}).AddRow(nil))

	// 直接绑定模板 1（带单机微调 cpu_warn_pct = 92）
	mock.ExpectQuery(`(?is)SELECT \* FROM "device_template_bindings" WHERE device_id = \$1 AND enabled = \$2`).
		WithArgs(5, true).
		WillReturnRows(sqlmock.NewRows([]string{"id", "device_id", "template_id", "override_macros_json", "enabled"}).
			AddRow(int64(1), 5, int64(1), `{"cpu_warn_pct":"92"}`, true))

	// 子组 20 绑定模板 2；父组 10 绑定模板 3
	mock.ExpectQuery(`(?is)SELECT \* FROM "template_group_bindings" WHERE group_id IN \(\$1,\$2\) AND enabled = \$3`).
		WithArgs(childGroupID, parentGroupID, true).
		WillReturnRows(sqlmock.NewRows([]string{"id", "template_id", "group_id", "enabled"}).
			AddRow(int64(1), int64(2), childGroupID, true).
			AddRow(int64(2), int64(3), parentGroupID, true))

	mock.ExpectQuery(`(?is)SELECT \* FROM "monitor_templates" WHERE id IN \(\$1,\$2,\$3\)`).
		WithArgs(int64(1), int64(2), int64(3)).
		WillReturnRows(sqlmock.NewRows([]string{"id", "code", "name", "macros_json"}).
			AddRow(int64(1), "t1", "T1", `[{"key":"cpu_warn_pct","default_value":"80"}]`).
			AddRow(int64(2), "t2", "T2", `[{"key":"cpu_warn_pct","default_value":"75"},{"key":"mem_warn_pct","default_value":"82"}]`).
			AddRow(int64(3), "t3", "T3", `[{"key":"mem_warn_pct","default_value":"70"},{"key":"temp_warn_c","default_value":"65"}]`))

	// 同名项 icmp.rtt 在模板 1 为 300s，在模板 2 为 60s -> 应取最短合法周期 60s
	mock.ExpectQuery(`(?is)SELECT \* FROM "monitor_items" WHERE template_id IN \(\$1,\$2,\$3\) AND enabled = \$4`).
		WithArgs(int64(1), int64(2), int64(3), true).
		WillReturnRows(sqlmock.NewRows([]string{"id", "template_id", "item_key", "name", "protocol", "interval_sec", "enabled"}).
			AddRow(int64(1), int64(1), "icmp.rtt", "Ping", "icmp", 300, true).
			AddRow(int64(2), int64(2), "icmp.rtt", "Ping", "icmp", 60, true))

	mock.ExpectQuery(`(?is)SELECT \* FROM "monitor_lld_rules" WHERE template_id IN \(\$1,\$2,\$3\) AND enabled = \$4`).
		WithArgs(int64(1), int64(2), int64(3), true).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))

	cfg, err := writer.ResolveEffectiveTemplateConfig(context.Background(), 5)
	if err != nil {
		t.Fatalf("ResolveEffectiveTemplateConfig failed: %v", err)
	}
	if cfg.Macros["cpu_warn_pct"] != "92" {
		t.Fatalf("expected direct override cpu_warn_pct=92, got %q", cfg.Macros["cpu_warn_pct"])
	}
	if cfg.Macros["mem_warn_pct"] != "82" {
		t.Fatalf("expected child group mem_warn_pct=82 over parent 70, got %q", cfg.Macros["mem_warn_pct"])
	}
	if cfg.Macros["temp_warn_c"] != "65" {
		t.Fatalf("expected parent group temp_warn_c=65, got %q", cfg.Macros["temp_warn_c"])
	}
	if len(cfg.Items) != 1 || cfg.Items[0].IntervalSec != 60 {
		t.Fatalf("expected shortest valid interval 60s, got %+v", cfg.Items)
	}
}

func TestTemplates_ValidationRules(t *testing.T) {
	db, mock, cleanup := newMonitoringGormDBWithSQLMock(t)
	defer cleanup()
	writer := monitoring.NewMetricsWriter(db, nil, zap.NewNop())

	// 1. 非法 OID
	if _, err := writer.CreateTemplateItem(context.Background(), 1, monitoring.MonitorItemInput{
		ItemKey: "k1", Name: "n1", Protocol: "snmp_oid", TargetExpr: "1.3.6.abc", IntervalSec: 60,
	}); !errors.Is(err, monitoring.ErrTemplateValidation) {
		t.Fatalf("expected invalid OID error, got: %v", err)
	}

	// 2. 非法 HTTP path (无前导 / / 含 @ / 含 // / 含控制字符)
	for _, badPath := range []string{"status", "/a@b", "/a//b", "http://10.0.0.1/", "/health\x00", "/a\x7fb"} {
		if _, err := writer.CreateTemplateItem(context.Background(), 1, monitoring.MonitorItemInput{
			ItemKey: "k2", Name: "n2", Protocol: "http", HTTPScheme: "http", HTTPPort: 80, HTTPPath: badPath, IntervalSec: 60,
		}); !errors.Is(err, monitoring.ErrTemplateValidation) {
			t.Fatalf("expected invalid http_path %q error, got: %v", badPath, err)
		}
	}

	// 2b. UpdateMonitorTemplate 传负数 DefaultIntervalSec 返回校验错误
	mock.ExpectQuery(`(?is)SELECT \* FROM "monitor_templates" WHERE id = \$1`).
		WithArgs(int64(2), 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "code", "name", "is_builtin", "default_interval_sec"}).AddRow(int64(2), "custom_2", "自定义", false, 300))
	if _, err := writer.UpdateMonitorTemplate(context.Background(), 2, monitoring.CreateTemplateInput{
		Name:               "自定义",
		DefaultIntervalSec: -10,
	}); !errors.Is(err, monitoring.ErrTemplateValidation) {
		t.Fatalf("expected ErrTemplateValidation on negative DefaultIntervalSec, got: %v", err)
	}

	// 3. 采集间隔 < 60s
	if _, err := writer.CreateTemplateItem(context.Background(), 1, monitoring.MonitorItemInput{
		ItemKey: "k3", Name: "n3", Protocol: "icmp", IntervalSec: 30,
	}); !errors.Is(err, monitoring.ErrTemplateValidation) {
		t.Fatalf("expected interval < 60 error, got: %v", err)
	}

	// 4. LLD 正则长度 > 256
	longRegex := strings.Repeat("a", 257)
	if _, err := writer.CreateTemplateLLDRule(context.Background(), 1, monitoring.MonitorLLDRuleInput{
		RuleKey: "r1", Name: "r1", EntityType: "interface", ExcludeRegex: longRegex,
	}); !errors.Is(err, monitoring.ErrTemplateValidation) {
		t.Fatalf("expected regex > 256 error, got: %v", err)
	}

	// 5. 每模板上限 50 项
	mock.ExpectBegin()
	mock.ExpectQuery(`(?is)SELECT \* FROM "monitor_templates" WHERE id = \$1`).
		WithArgs(int64(2), 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "is_builtin"}).AddRow(int64(2), false))
	mock.ExpectQuery(`(?is)SELECT count\(\*\) FROM "monitor_items" WHERE template_id = \$1`).
		WithArgs(int64(2)).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(50))
	mock.ExpectRollback()

	if _, err := writer.CreateTemplateItem(context.Background(), 2, monitoring.MonitorItemInput{
		ItemKey: "k51", Name: "n51", Protocol: "icmp", IntervalSec: 60,
	}); !errors.Is(err, monitoring.ErrTemplateValidation) {
		t.Fatalf("expected 50-item limit error, got: %v", err)
	}
}

func TestTemplates_HandlerRBAC_ForbiddenWithoutControlPermission(t *testing.T) {
	h := handlers.MonitoringHandler{
		Writer: monitoring.NewMetricsWriter(nil, nil, zap.NewNop()),
		Auth:   stubTemplatePermService{perms: []string{"monitoring:read"}},
	}

	e := echo.New()
	body, _ := json.Marshal(monitoring.CreateTemplateInput{Name: "test"})
	req := httptest.NewRequest(http.MethodPost, "/api/v1/monitoring/templates", strings.NewReader(string(body)))
	req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	req.Header.Set(echo.HeaderAuthorization, "Bearer token")
	rec := httptest.NewRecorder()
	c := e.NewContext(req, rec)

	if err := h.CreateMonitoringTemplate(c); err != nil {
		e.HTTPErrorHandler(err, c)
	}
	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, want 403, body=%s", rec.Code, rec.Body.String())
	}

	req2 := httptest.NewRequest(http.MethodPut, "/api/v1/monitoring/templates/1/bindings", strings.NewReader(`{"group_ids":[1]}`))
	req2.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	req2.Header.Set(echo.HeaderAuthorization, "Bearer token")
	rec2 := httptest.NewRecorder()
	c2 := e.NewContext(req2, rec2)
	c2.SetParamNames("id")
	c2.SetParamValues("1")

	if err := h.UpdateMonitoringTemplateBindings(c2); err != nil {
		e.HTTPErrorHandler(err, c2)
	}
	if rec2.Code != http.StatusForbidden {
		t.Fatalf("bindings status = %d, want 403", rec2.Code)
	}
}

var _ = time.Now
