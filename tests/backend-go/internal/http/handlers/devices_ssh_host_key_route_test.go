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
	"github.com/your-org/inspect-system/backend-go/internal/sshutil"
	"go.uber.org/zap"
)

// 设备详情页的「SSH 主机密钥指纹」区块：
// GET 查询当前记录列表（按算法各一条，尚未记录时为空数组）；
// DELETE 重置（幂等），仅在确认设备密钥合法变更后使用，删除后下一次 SSH 连接重新走 TOFU。
// 审计由 /devices 前缀规则自动覆盖（DELETE 落 delete/device）。

func newDevicesHandlerWithHostKeys(t *testing.T, permissions []string) (*echo.Echo, sqlmock.Sqlmock, string, func()) {
	t.Helper()
	gormDB, mock, cleanup := newGormDBWithSqlmock(t)
	authService, token := newAuthServiceWithPermissions(t, permissions)
	e := echo.New()
	handlers.DevicesHandler{
		Service:  devices.NewService(gormDB, zap.NewNop()),
		HostKeys: sshutil.NewSSHHostKeyStore(gormDB, zap.NewNop()),
		Auth:     authService,
	}.Register(e.Group("/api/v1"))
	return e, mock, token, cleanup
}

func expectDeviceExists(mock sqlmock.Sqlmock, deviceID int) {
	mock.ExpectQuery(`SELECT \* FROM "devices" WHERE id = \$1`).
		WithArgs(deviceID, 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name"}).AddRow(deviceID, "测试"))
}

func TestGetDeviceSSHHostKey_ReturnsRecords(t *testing.T) {
	e, mock, token, cleanup := newDevicesHandlerWithHostKeys(t, []string{"devices:read"})
	defer cleanup()

	expectDeviceExists(mock, 21)
	mock.ExpectQuery(`FROM "device_ssh_host_keys" WHERE device_id = \$1`).
		WithArgs(21).
		WillReturnRows(sqlmock.NewRows([]string{"id", "device_id", "fingerprint", "algorithm"}).
			AddRow(4, 21, "SHA256:g8e2/vJVyjdqBhOfml+UbRnCIz6MXWnehBIpdQv4hSg", "ssh-rsa"))

	req := httptest.NewRequest(http.MethodGet, "/api/v1/devices/21/ssh-host-key", nil)
	req.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var body struct {
		DeviceID int `json:"device_id"`
		Records  []struct {
			Fingerprint string `json:"fingerprint"`
			Algorithm   string `json:"algorithm"`
		} `json:"records"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if body.DeviceID != 21 || len(body.Records) != 1 {
		t.Fatalf("body = %s", rec.Body.String())
	}
	if body.Records[0].Fingerprint != "SHA256:g8e2/vJVyjdqBhOfml+UbRnCIz6MXWnehBIpdQv4hSg" || body.Records[0].Algorithm != "ssh-rsa" {
		t.Fatalf("records[0] = %+v", body.Records[0])
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

// 尚未记录（设备刚添加、还没走过任何 SSH 连接）时返回 200 + 空数组，
// 而不是 404：设备存在与"有无指纹记录"是两回事。
func TestGetDeviceSSHHostKey_NoRecordReturnsEmptyArray(t *testing.T) {
	e, mock, token, cleanup := newDevicesHandlerWithHostKeys(t, []string{"devices:read"})
	defer cleanup()

	expectDeviceExists(mock, 21)
	mock.ExpectQuery(`FROM "device_ssh_host_keys" WHERE device_id = \$1`).
		WithArgs(21).
		WillReturnRows(sqlmock.NewRows([]string{"id", "device_id", "fingerprint", "algorithm"}))

	req := httptest.NewRequest(http.MethodGet, "/api/v1/devices/21/ssh-host-key", nil)
	req.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var body struct {
		DeviceID int              `json:"device_id"`
		Records  []map[string]any `json:"records"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if body.DeviceID != 21 || len(body.Records) != 0 {
		t.Fatalf("body = %s, want empty records", rec.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestGetDeviceSSHHostKey_DeviceNotFound(t *testing.T) {
	e, mock, token, cleanup := newDevicesHandlerWithHostKeys(t, []string{"devices:read"})
	defer cleanup()

	mock.ExpectQuery(`SELECT \* FROM "devices" WHERE id = \$1`).
		WithArgs(999, 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name"}))

	req := httptest.NewRequest(http.MethodGet, "/api/v1/devices/999/ssh-host-key", nil)
	req.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestResetDeviceSSHHostKey_DeletesRecord(t *testing.T) {
	e, mock, token, cleanup := newDevicesHandlerWithHostKeys(t, []string{"devices:update"})
	defer cleanup()

	expectDeviceExists(mock, 21)
	mock.ExpectExec(`DELETE FROM "device_ssh_host_keys" WHERE device_id = \$1`).
		WithArgs(21).
		WillReturnResult(sqlmock.NewResult(0, 1))

	req := httptest.NewRequest(http.MethodDelete, "/api/v1/devices/21/ssh-host-key", nil)
	req.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var body struct {
		DeviceID int  `json:"device_id"`
		Deleted  bool `json:"deleted"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if body.DeviceID != 21 || !body.Deleted {
		t.Fatalf("body = %s, want {device_id:21, deleted:true}", rec.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

// 重置是幂等的：没有记录时也返回 200，deleted=false（重复点击不报错）。
func TestResetDeviceSSHHostKey_IdempotentWhenNoRecord(t *testing.T) {
	e, mock, token, cleanup := newDevicesHandlerWithHostKeys(t, []string{"devices:update"})
	defer cleanup()

	expectDeviceExists(mock, 21)
	mock.ExpectExec(`DELETE FROM "device_ssh_host_keys" WHERE device_id = \$1`).
		WithArgs(21).
		WillReturnResult(sqlmock.NewResult(0, 0))

	req := httptest.NewRequest(http.MethodDelete, "/api/v1/devices/21/ssh-host-key", nil)
	req.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	var body struct {
		Deleted bool `json:"deleted"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if body.Deleted {
		t.Fatalf("body = %s, want deleted:false", rec.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

// 重置指纹是写操作（信任新密钥），只读权限必须被拒绝；且拒绝发生在任何数据库查询之前。
func TestResetDeviceSSHHostKey_RequiresUpdatePermission(t *testing.T) {
	e, mock, token, cleanup := newDevicesHandlerWithHostKeys(t, []string{"devices:read"})
	defer cleanup()

	req := httptest.NewRequest(http.MethodDelete, "/api/v1/devices/21/ssh-host-key", nil)
	req.Header.Set(echo.HeaderAuthorization, "Bearer "+token)
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Fatalf("status = %d, body = %s", rec.Code, rec.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
