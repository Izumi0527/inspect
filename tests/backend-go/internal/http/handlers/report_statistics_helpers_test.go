package handlers_test

import (
	"errors"
	"net/http"
	"testing"

	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	"github.com/your-org/inspect-system/backend-go/internal/reports"

	"go.uber.org/zap"
)

func TestReportsHandler_GetStatisticsData_兼容CamelCaseDeviceGroups过滤(t *testing.T) {
	// 目的：确保统计接口能识别 camelCase 的 deviceGroups，并正确应用到 devices 查询过滤。
	// 策略：让 devices SELECT 直接返回 error，从而让 handler 在后续复杂查询前短路；
	//      通过 sqlmock 断言查询包含 group_id IN (...) 且参数为解析后的整型列表。

	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	authService, token := newAuthServiceWithPermissions(t, []string{"reports:read"})
	service := reports.NewService(gormDB, zap.NewNop())

	h := handlers.ReportsHandler{
		Service: service,
		Auth:    authService,
	}

	ctx, _ := newEchoContextWithBody(http.MethodPost, "/api/v1/reports/statistics/data", token, []byte(`{"deviceGroups":[1,"2"]}`))

	mock.ExpectQuery(`(?i)SELECT .* FROM .*devices.* WHERE .*group_id.* IN .*\(\$1\s*,\s*\$2\)`).
		WithArgs(1, 2).
		WillReturnError(errors.New("db error"))

	err := h.GetStatisticsData(ctx)
	assertHTTPErrorCode(t, err, http.StatusInternalServerError)

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}

func TestReportsHandler_GetStatisticsData_兼容SnakeCaseDeviceGroups过滤(t *testing.T) {
	// 目的：确保历史 snake_case 的 device_groups 仍能正常过滤（向后兼容）。

	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	authService, token := newAuthServiceWithPermissions(t, []string{"reports:read"})
	service := reports.NewService(gormDB, zap.NewNop())

	h := handlers.ReportsHandler{
		Service: service,
		Auth:    authService,
	}

	ctx, _ := newEchoContextWithBody(http.MethodPost, "/api/v1/reports/statistics/data", token, []byte(`{"device_groups":[3]}`))

	mock.ExpectQuery(`(?i)SELECT .* FROM .*devices.* WHERE .*group_id.* IN .*\(\$1\)`).
		WithArgs(3).
		WillReturnError(errors.New("db error"))

	err := h.GetStatisticsData(ctx)
	assertHTTPErrorCode(t, err, http.StatusInternalServerError)

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}
