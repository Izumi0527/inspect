package handlers_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/labstack/echo/v4"
	"github.com/your-org/inspect-system/backend-go/internal/devices"
	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	"go.uber.org/zap"
)

// 删除确认框按 /devices/inspection-count 查巡检记录数。它与 /devices/:device_id 同层，
// 必须命中静态路由——若被参数路由截走，会把 "inspection-count" 当设备 ID 解析失败。
// 权限只需 devices:read：能删设备的用户一定能看到这条提示。
func TestDeviceInspectionCountRoute_CountsSelectedDevices(t *testing.T) {
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()
	authService, token := newAuthServiceWithPermissions(t, []string{"devices:read"})

	e := echo.New()
	handlers.DevicesHandler{
		Service: devices.NewService(gormDB, zap.NewNop()),
		Auth:    authService,
	}.Register(e.Group("/api/v1"))

	mock.ExpectQuery(`SELECT count\(\*\) FROM "inspections" WHERE device_id IN \(\$1,\$2\)`).
		WithArgs(6, 17).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(29))

	req := httptest.NewRequest(http.MethodGet, "/api/v1/devices/inspection-count?ids=6,17", nil)
	req.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var body struct {
		Count int64 `json:"count"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil || body.Count != 29 {
		t.Fatalf("body = %s, want {\"count\":29}", rec.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
