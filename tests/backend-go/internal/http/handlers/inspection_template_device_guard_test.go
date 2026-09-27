package handlers_test

import (
	"encoding/json"
	"net/http"
	"strings"
	"testing"
	_ "unsafe"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/labstack/echo/v4"
	"go.uber.org/zap"

	"github.com/your-org/inspect-system/backend-go/internal/devices"
	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	"github.com/your-org/inspect-system/backend-go/internal/inspection"
)

// templateDeviceMismatchMessage 是执行入口的兜底守卫：设备类型与模板不符时返回原因。
//
//go:linkname templateDeviceMismatchMessage github.com/your-org/inspect-system/backend-go/internal/http/handlers.templateDeviceMismatchMessage
func templateDeviceMismatchMessage(templateTypes []string, deviceType string) (string, bool)

//go:linkname buildNotApplicableResult github.com/your-org/inspect-system/backend-go/internal/http/handlers.buildNotApplicableResult
func buildNotApplicableResult(inspectionID int, item map[string]interface{}, deviceType string) inspection.Result

func TestTemplateDeviceGuard_MatchingTypeRuns(t *testing.T) {
	if msg, mismatch := templateDeviceMismatchMessage([]string{"switch"}, "Switch"); mismatch {
		t.Fatalf("类型一致不应拦截，got %q", msg)
	}
	// 存量模板未声明类型时不限制
	if msg, mismatch := templateDeviceMismatchMessage(nil, "router"); mismatch {
		t.Fatalf("未声明类型的存量模板不应拦截，got %q", msg)
	}
}

// 设备档案被改了类型、或绕过前端直接调接口时，执行入口必须兜底拦截，
// 而且原因要让人一眼看懂：用中文类型名，并指明该怎么处理。
func TestTemplateDeviceGuard_MismatchExplainsInChinese(t *testing.T) {
	msg, mismatch := templateDeviceMismatchMessage([]string{"switch"}, "router")
	if !mismatch {
		t.Fatal("路由器不应被交换机模板巡检")
	}
	for _, want := range []string{"路由器", "交换机"} {
		if !strings.Contains(msg, want) {
			t.Errorf("原因 %q 缺少 %q", msg, want)
		}
	}
	if strings.Contains(msg, "router") || strings.Contains(msg, "switch") {
		t.Errorf("原因不应出现英文类型: %q", msg)
	}

	msg, mismatch = templateDeviceMismatchMessage([]string{"server"}, "")
	if !mismatch || !strings.Contains(msg, "未分类") {
		t.Fatalf("未分类设备应被拦截并说明，got %v %q", mismatch, msg)
	}
}

// 不适用提示直接显示在执行详情与 PDF 里，必须用中文类型名。
func TestBuildNotApplicableResult_UsesChineseLabels(t *testing.T) {
	item := map[string]interface{}{
		"name": "BGP 邻居状态", "type": "snmp", "metric": "bgp_peers",
		"device_types": []interface{}{"router", "firewall"},
	}

	result := buildNotApplicableResult(1, item, "switch")

	if result.Message == nil || !strings.Contains(*result.Message, "路由器、防火墙") || !strings.Contains(*result.Message, "交换机") {
		t.Fatalf("message = %v, want 中文类型名", result.Message)
	}
	if result.ExpectedValue == nil || *result.ExpectedValue != "适用于 路由器、防火墙" {
		t.Fatalf("expected = %v, want 适用于 路由器、防火墙", result.ExpectedValue)
	}
}

func expectTemplateAndDevices(mock sqlmock.Sqlmock, templateTypes string, deviceID int, deviceName, deviceType string) {
	mock.ExpectQuery(`SELECT \* FROM "inspection_templates" WHERE id = \$1 LIMIT \$2`).
		WithArgs(5, 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "device_types", "check_items", "is_default", "is_active"}).
			AddRow(5, "交换机巡检", []byte(templateTypes), []byte(`[]`), true, true))
	mock.ExpectQuery(`SELECT id, name, device_type FROM "devices" WHERE id IN \(.+\)`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "device_type"}).AddRow(deviceID, deviceName, deviceType))
}

// 直接调任务接口也要校验：前端之外还有脚本与第三方集成在用这个接口。
func TestCreateTask_RejectsDevicesNotMatchingTemplateType(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"inspections:create"})
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()
	h := handlers.InspectionHandler{Service: inspection.NewService(gormDB, zap.NewNop()), Auth: authSvc, Logger: zap.NewNop()}

	expectTemplateAndDevices(mock, `["switch"]`, 2, "核心路由器", "router")

	body := []byte(`{"name":"临时巡检","template_id":5,"device_ids":[2]}`)
	ctx, _ := newEchoContextWithBody(http.MethodPost, "/api/v1/inspection/tasks", token, body)

	err := h.CreateTask(ctx)
	httpErr, ok := err.(*echo.HTTPError)
	if !ok || httpErr.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %v", err)
	}
	if msg, _ := httpErr.Message.(string); !strings.Contains(msg, "核心路由器（路由器）") {
		t.Fatalf("报错应点名不符的设备，got %v", httpErr.Message)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("不应创建巡检记录，sqlmock: %v", err)
	}
}

func TestDevicesBulkStartInspection_RejectsDevicesNotMatchingTemplateType(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"devices:read", "inspections:execute"})
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()
	h := handlers.DevicesHandler{
		Service:    &devices.Service{},
		Auth:       authSvc,
		Inspection: inspection.NewService(gormDB, zap.NewNop()),
	}

	expectTemplateAndDevices(mock, `["switch"]`, 2, "核心路由器", "router")

	body := []byte(`{"action":"start_inspection","device_ids":[2],"template_id":5}`)
	ctx, rec := newEchoContextWithBody(http.MethodPost, "/api/v1/devices/bulk-action", token, body)

	if err := h.BulkAction(ctx); err != nil {
		t.Fatalf("BulkAction: %v", err)
	}
	var resp struct {
		Success bool `json:"success"`
		Data    struct {
			Success bool   `json:"success"`
			Message string `json:"message"`
		} `json:"data"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
		t.Fatalf("响应解析失败: %v (%s)", err, rec.Body.String())
	}
	if resp.Success || resp.Data.Success || !strings.Contains(resp.Data.Message, "核心路由器（路由器）") {
		t.Fatalf("批量巡检应因类型不符失败并点名设备，got %s", rec.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("不应创建巡检记录，sqlmock: %v", err)
	}
}

// 复制旧版多类型模板会被「只能适用一种设备类型」的规则拒绝，这属于用户可修正的
// 校验失败：必须回 400 并说明原因，而不是 500 加一串内部错误。
func TestCopyTemplate_LegacyMultiTypeTemplateIsBadRequest(t *testing.T) {
	authSvc, token := newAuthServiceWithPermissions(t, []string{"inspections:create"})
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()
	h := handlers.InspectionHandler{Service: inspection.NewService(gormDB, zap.NewNop()), Auth: authSvc, Logger: zap.NewNop()}

	mock.ExpectQuery(`SELECT \* FROM "inspection_templates" WHERE id = \$1`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "device_types", "check_items", "is_default", "is_active"}).
			AddRow(30, "旧全面巡检（副本）", []byte(`["switch","router"]`),
				[]byte(`[{"id":"c","name":"设备连通性","type":"ping","config":{},"enabled":true}]`), false, true))

	ctx, _ := newEchoContextWithBody(http.MethodPost, "/api/v1/inspection/templates/30/copy", token, []byte(`{}`))
	ctx.SetParamNames("id")
	ctx.SetParamValues("30")

	err := h.CopyTemplate(ctx)
	httpErr, ok := err.(*echo.HTTPError)
	if !ok || httpErr.Code != http.StatusBadRequest {
		t.Fatalf("want 400, got %v", err)
	}
	if msg, _ := httpErr.Message.(string); !strings.Contains(msg, "每个模板只能适用一种设备类型") {
		t.Fatalf("应说明被拒原因，got %v", httpErr.Message)
	}
}
