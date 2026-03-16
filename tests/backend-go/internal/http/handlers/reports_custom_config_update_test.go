package handlers_test

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"

	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	"github.com/your-org/inspect-system/backend-go/internal/reports"

	"go.uber.org/zap"
)

func TestReportsHandler_UpdateCustomConfig_ShouldNotOverwriteConfigWhenConfigFieldsMissing(t *testing.T) {
	// 场景：仅更新 name/description 时，不应把 config 覆盖成全量 null（历史缺陷会导致配置被清空）。
	// 断言：UPDATE 语句只更新 name（以及可能的 updated_at），不包含 config；并能正常返回配置结构。

	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	authService, token := newAuthServiceWithPermissions(t, []string{"reports:update"})
	service := reports.NewService(gormDB, zap.NewNop())

	h := handlers.ReportsHandler{
		Service: service,
		Auth:    authService,
	}

	ctx, rec := newEchoContextWithBody(http.MethodPut, "/api/v1/reports/custom/configs/123", token, []byte(`{"name":"新的配置名"}`))
	ctx.SetParamNames("config_id")
	ctx.SetParamValues("123")

	// UPDATE：只更新 name（以及可能自动更新 updated_at），不应出现额外的 config 参数。
	mock.ExpectExec(`UPDATE .*report_templates.*`).
		WithArgs(sqlmock.AnyArg(), sqlmock.AnyArg(), sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(0, 1))

	now := time.Date(2026, 3, 16, 12, 0, 0, 0, time.UTC)
	configJSON := []byte(`{"template":{"name":"T"},"parameters":{},"charts":[],"tables":[],"filters":[],"layout":{}}`)
	mock.ExpectQuery(`SELECT .*FROM .*report_templates.*`).
		WithArgs(123, sqlmock.AnyArg()).
		WillReturnRows(sqlmock.NewRows([]string{
			"id",
			"name",
			"description",
			"report_type",
			"config",
			"chart_configs",
			"table_configs",
			"theme",
			"logo_url",
			"header_text",
			"footer_text",
			"is_default",
			"is_active",
			"created_by",
			"created_at",
			"updated_at",
		}).AddRow(
			123,
			"新的配置名",
			nil,
			"custom",
			configJSON,
			[]byte(`{}`),
			[]byte(`{}`),
			nil,
			nil,
			nil,
			nil,
			false,
			true,
			nil,
			now,
			now,
		))

	if err := h.UpdateCustomConfig(ctx); err != nil {
		t.Fatalf("UpdateCustomConfig() error = %v, body=%s", err, rec.Body.String())
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d, body=%s", rec.Code, http.StatusOK, rec.Body.String())
	}

	var payload map[string]interface{}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("invalid json: %v, body=%s", err, rec.Body.String())
	}
	if payload["success"] != true {
		t.Fatalf("success = %v, want true, body=%s", payload["success"], rec.Body.String())
	}
	data, ok := payload["data"].(map[string]interface{})
	if !ok {
		t.Fatalf("data should be object, got %T, body=%s", payload["data"], rec.Body.String())
	}
	template, ok := data["template"].(map[string]interface{})
	if !ok {
		t.Fatalf("data.template should be object, got %T, body=%s", data["template"], rec.Body.String())
	}
	if template["name"] != "T" {
		t.Fatalf("data.template.name = %v, want T, body=%s", template["name"], rec.Body.String())
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}
