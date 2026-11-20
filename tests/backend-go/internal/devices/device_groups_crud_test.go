package devices_test

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/labstack/echo/v4"
	"go.uber.org/zap"

	"github.com/your-org/inspect-system/backend-go/internal/auth"
	"github.com/your-org/inspect-system/backend-go/internal/devices"
	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
)

type fakeGroupPermissionService struct {
	permissions []string
}

func (s fakeGroupPermissionService) GetActiveUserFromToken(_ context.Context, _ string) (*auth.UserRecord, error) {
	return &auth.UserRecord{
		ID:       "user-1",
		Username: "tester",
		Role:     "admin",
	}, nil
}

func (s fakeGroupPermissionService) GetPermissionsByRole(_ context.Context, _ string) ([]string, error) {
	return append([]string{}, s.permissions...), nil
}

func newDeviceGroupsTestEcho(service *devices.Service, perms []string) *echo.Echo {
	e := echo.New()
	handlers.DevicesHandler{
		Service: service,
		Auth:    fakeGroupPermissionService{permissions: perms},
	}.Register(e.Group("/api/v1"))
	return e
}

func doGroupRequest(e *echo.Echo, method, target string, body interface{}) *httptest.ResponseRecorder {
	var reader *bytes.Reader
	if body != nil {
		raw, _ := json.Marshal(body)
		reader = bytes.NewReader(raw)
	} else {
		reader = bytes.NewReader(nil)
	}
	req := httptest.NewRequest(method, target, reader)
	req.Header.Set(echo.HeaderAuthorization, "Bearer test-token")
	if body != nil {
		req.Header.Set(echo.HeaderContentType, echo.MIMEApplicationJSON)
	}
	rec := httptest.NewRecorder()
	e.ServeHTTP(rec, req)
	return rec
}

func TestGetDeviceGroups_AlertCountGatedByAlertsReadPermission(t *testing.T) {
	now := time.Now().UTC()

	t.Run("missing alerts:read returns alert_count=0 and alerts_limited_by_permission=true", func(t *testing.T) {
		db, mock, cleanup := newDevicesGormDBWithSQLMock(t)
		defer cleanup()
		e := newDeviceGroupsTestEcho(devices.NewService(db, zap.NewNop()), []string{"devices:read"})

		parentID := 1
		mock.ExpectQuery(`(?is)SELECT g\.id, g\.name, g\.description, g\.parent_id.*FROM device_groups g`).
			WillReturnRows(sqlmock.NewRows([]string{
				"id", "name", "description", "parent_id", "is_active", "created_at", "updated_at", "device_count", "online_count",
			}).
				AddRow(1, "Core", "core net", nil, true, now, now, 3, 2).
				AddRow(2, "Access", nil, parentID, true, now, now, 5, 4))

		rec := doGroupRequest(e, http.MethodGet, "/api/v1/devices/groups", nil)
		if rec.Code != http.StatusOK {
			t.Fatalf("status=%d, body=%s", rec.Code, rec.Body.String())
		}

		var got []devices.DeviceGroupResponse
		if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if len(got) != 2 {
			t.Fatalf("len=%d, want 2", len(got))
		}
		for _, g := range got {
			if g.AlertCount != 0 {
				t.Fatalf("group %d AlertCount=%d, want 0 without alerts:read", g.ID, g.AlertCount)
			}
			if !g.AlertsLimitedByPermission {
				t.Fatalf("group %d AlertsLimitedByPermission=false, want true", g.ID)
			}
		}
		if got[0].OnlineCount != 2 || got[0].DeviceCount != 3 || !got[0].IsActive {
			t.Fatalf("unexpected group[0] stats: %+v", got[0])
		}
		if got[1].ParentID == nil || *got[1].ParentID != 1 {
			t.Fatalf("group[1].ParentID=%v, want 1", got[1].ParentID)
		}
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Fatal(err)
		}
	})

	t.Run("with alerts:read returns real alert_count and alerts_limited_by_permission=false", func(t *testing.T) {
		db, mock, cleanup := newDevicesGormDBWithSQLMock(t)
		defer cleanup()
		e := newDeviceGroupsTestEcho(devices.NewService(db, zap.NewNop()), []string{"devices:read", "alerts:read"})

		mock.ExpectQuery(`(?is)SELECT g\.id, g\.name, g\.description, g\.parent_id.*FROM device_groups g`).
			WillReturnRows(sqlmock.NewRows([]string{
				"id", "name", "description", "parent_id", "is_active", "created_at", "updated_at", "device_count", "online_count",
			}).AddRow(1, "Core", nil, nil, true, now, now, 3, 2))

		mock.ExpectQuery(`(?is)SELECT d\.group_id, COUNT\(a\.id\) AS alert_count FROM alerts a JOIN devices d ON d\.id = a\.device_id`).
			WillReturnRows(sqlmock.NewRows([]string{"group_id", "alert_count"}).AddRow(1, 4))

		rec := doGroupRequest(e, http.MethodGet, "/api/v1/devices/groups", nil)
		if rec.Code != http.StatusOK {
			t.Fatalf("status=%d, body=%s", rec.Code, rec.Body.String())
		}

		var got []devices.DeviceGroupResponse
		if err := json.Unmarshal(rec.Body.Bytes(), &got); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if len(got) != 1 || got[0].AlertCount != 4 || got[0].AlertsLimitedByPermission {
			t.Fatalf("unexpected group response: %+v", got)
		}
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Fatal(err)
		}
	})
}

func TestDeviceGroupsCRUD_PermissionsAndValidation(t *testing.T) {
	t.Run("missing write permissions return 403", func(t *testing.T) {
		db, _, cleanup := newDevicesGormDBWithSQLMock(t)
		defer cleanup()
		e := newDeviceGroupsTestEcho(devices.NewService(db, zap.NewNop()), []string{"devices:read"})

		if rec := doGroupRequest(e, http.MethodPost, "/api/v1/devices/groups", map[string]interface{}{"name": "G1"}); rec.Code != http.StatusForbidden {
			t.Fatalf("POST without devices:create status=%d, want 403", rec.Code)
		}
		if rec := doGroupRequest(e, http.MethodPut, "/api/v1/devices/groups/1", map[string]interface{}{"name": "G2"}); rec.Code != http.StatusForbidden {
			t.Fatalf("PUT without devices:update status=%d, want 403", rec.Code)
		}
		if rec := doGroupRequest(e, http.MethodDelete, "/api/v1/devices/groups/1", nil); rec.Code != http.StatusForbidden {
			t.Fatalf("DELETE without devices:delete status=%d, want 403", rec.Code)
		}
	})

	t.Run("create with device_ids requires devices:update", func(t *testing.T) {
		db, _, cleanup := newDevicesGormDBWithSQLMock(t)
		defer cleanup()
		e := newDeviceGroupsTestEcho(devices.NewService(db, zap.NewNop()), []string{"devices:create"})

		rec := doGroupRequest(e, http.MethodPost, "/api/v1/devices/groups", map[string]interface{}{
			"name":       "HQ",
			"device_ids": []int{10, 11},
		})
		if rec.Code != http.StatusForbidden {
			t.Fatalf("POST with device_ids without devices:update status=%d, want 403", rec.Code)
		}
	})

	t.Run("create duplicate name returns 409", func(t *testing.T) {
		db, mock, cleanup := newDevicesGormDBWithSQLMock(t)
		defer cleanup()
		e := newDeviceGroupsTestEcho(devices.NewService(db, zap.NewNop()), []string{"devices:create"})

		mock.ExpectBegin()
		mock.ExpectExec(`SELECT pg_advisory_xact_lock\(\$1\)`).WithArgs(7842101).WillReturnResult(sqlmock.NewResult(0, 0))
		mock.ExpectQuery(`SELECT count\(\*\) FROM "device_groups" WHERE name = \$1`).
			WithArgs("HQ").
			WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))
		mock.ExpectRollback()

		rec := doGroupRequest(e, http.MethodPost, "/api/v1/devices/groups", map[string]interface{}{"name": "HQ"})
		if rec.Code != http.StatusConflict {
			t.Fatalf("duplicate name status=%d, want 409, body=%s", rec.Code, rec.Body.String())
		}
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Fatal(err)
		}
	})

	t.Run("create exceeding depth 3 returns 400", func(t *testing.T) {
		db, mock, cleanup := newDevicesGormDBWithSQLMock(t)
		defer cleanup()
		e := newDeviceGroupsTestEcho(devices.NewService(db, zap.NewNop()), []string{"devices:create"})

		mock.ExpectBegin()
		mock.ExpectExec(`SELECT pg_advisory_xact_lock\(\$1\)`).WithArgs(7842101).WillReturnResult(sqlmock.NewResult(0, 0))
		mock.ExpectQuery(`SELECT count\(\*\) FROM "device_groups" WHERE name = \$1`).
			WithArgs("Level4").
			WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
		// Hierarchy: 1(root) -> 2(child) -> 3(grandchild); trying to create under 3 -> depth 4 (>3)
		mock.ExpectQuery(`SELECT id, parent_id FROM "device_groups"`).
			WillReturnRows(sqlmock.NewRows([]string{"id", "parent_id"}).
				AddRow(1, nil).
				AddRow(2, 1).
				AddRow(3, 2))
		mock.ExpectRollback()

		rec := doGroupRequest(e, http.MethodPost, "/api/v1/devices/groups", map[string]interface{}{
			"name":      "Level4",
			"parent_id": 3,
		})
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("depth>3 status=%d, want 400, body=%s", rec.Code, rec.Body.String())
		}
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Fatal(err)
		}
	})

	t.Run("create valid group with device_ids assigns devices in transaction", func(t *testing.T) {
		db, mock, cleanup := newDevicesGormDBWithSQLMock(t)
		defer cleanup()
		e := newDeviceGroupsTestEcho(devices.NewService(db, zap.NewNop()), []string{"devices:create", "devices:update"})

		mock.ExpectBegin()
		mock.ExpectExec(`SELECT pg_advisory_xact_lock\(\$1\)`).WithArgs(7842101).WillReturnResult(sqlmock.NewResult(0, 0))
		mock.ExpectQuery(`SELECT count\(\*\) FROM "device_groups" WHERE name = \$1`).
			WithArgs("Edge").
			WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
		mock.ExpectQuery(`SELECT id, parent_id FROM "device_groups"`).
			WillReturnRows(sqlmock.NewRows([]string{"id", "parent_id"}).AddRow(1, nil))
		mock.ExpectQuery(`SELECT count\(\*\) FROM "devices" WHERE id IN \(\$1,\$2\)`).
			WithArgs(10, 11).
			WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(2))
		mock.ExpectQuery(`INSERT INTO "device_groups"`).
			WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(5))
		mock.ExpectExec(`UPDATE "devices" SET "group_id"=\$1,"updated_at"=\$2 WHERE id IN \(\$3,\$4\)`).
			WithArgs(5, sqlmock.AnyArg(), 10, 11).
			WillReturnResult(sqlmock.NewResult(0, 2))
		mock.ExpectCommit()

		// Post-commit stat fetch
		now := time.Now().UTC()
		mock.ExpectQuery(`(?is)SELECT g\.id, g\.name, g\.description, g\.parent_id.*FROM device_groups g.*WHERE g\.id = \$1`).
			WithArgs(5).
			WillReturnRows(sqlmock.NewRows([]string{
				"id", "name", "description", "parent_id", "is_active", "created_at", "updated_at", "device_count", "online_count",
			}).AddRow(5, "Edge", nil, 1, true, now, now, 2, 1))

		rec := doGroupRequest(e, http.MethodPost, "/api/v1/devices/groups", map[string]interface{}{
			"name":       "Edge",
			"parent_id":  1,
			"device_ids": []int{10, 11},
		})
		if rec.Code != http.StatusCreated {
			t.Fatalf("status=%d, want 201, body=%s", rec.Code, rec.Body.String())
		}
		var resp devices.DeviceGroupResponse
		if err := json.Unmarshal(rec.Body.Bytes(), &resp); err != nil {
			t.Fatalf("unmarshal: %v", err)
		}
		if resp.ID != 5 || resp.DeviceCount != 2 || resp.OnlineCount != 1 || !resp.AlertsLimitedByPermission {
			t.Fatalf("unexpected resp: %+v", resp)
		}
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Fatal(err)
		}
	})

	t.Run("create group with 80 Chinese characters succeeds by rune count", func(t *testing.T) {
		db, mock, cleanup := newDevicesGormDBWithSQLMock(t)
		defer cleanup()
		e := newDeviceGroupsTestEcho(devices.NewService(db, zap.NewNop()), []string{"devices:create"})

		longCJKName := strings.Repeat("核", 80) // 80 runes, 240 UTF-8 bytes
		now := time.Now().UTC()

		mock.ExpectBegin()
		mock.ExpectExec(`SELECT pg_advisory_xact_lock\(\$1\)`).WithArgs(7842101).WillReturnResult(sqlmock.NewResult(0, 0))
		mock.ExpectQuery(`SELECT count\(\*\) FROM "device_groups" WHERE name = \$1`).
			WithArgs(longCJKName).
			WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
		mock.ExpectQuery(`INSERT INTO "device_groups"`).
			WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(8))
		mock.ExpectCommit()

		mock.ExpectQuery(`(?is)SELECT g\.id, g\.name, g\.description, g\.parent_id.*FROM device_groups g.*WHERE g\.id = \$1`).
			WithArgs(8).
			WillReturnRows(sqlmock.NewRows([]string{
				"id", "name", "description", "parent_id", "is_active", "created_at", "updated_at", "device_count", "online_count",
			}).AddRow(8, longCJKName, nil, nil, true, now, now, 0, 0))

		rec := doGroupRequest(e, http.MethodPost, "/api/v1/devices/groups", map[string]interface{}{
			"name": longCJKName,
		})
		if rec.Code != http.StatusCreated {
			t.Fatalf("80-rune CJK group name status=%d, want 201, body=%s", rec.Code, rec.Body.String())
		}
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Fatal(err)
		}
	})
}

func TestUpdateDeviceGroup_CycleAndSubtreeHeightGuards(t *testing.T) {
	t.Run("self cycle returns 400", func(t *testing.T) {
		db, mock, cleanup := newDevicesGormDBWithSQLMock(t)
		defer cleanup()
		e := newDeviceGroupsTestEcho(devices.NewService(db, zap.NewNop()), []string{"devices:update"})

		mock.ExpectBegin()
		mock.ExpectExec(`SELECT pg_advisory_xact_lock\(\$1\)`).WithArgs(7842101).WillReturnResult(sqlmock.NewResult(0, 0))
		mock.ExpectQuery(`SELECT \* FROM "device_groups" WHERE id = \$1`).
			WithArgs(2, 1).
			WillReturnRows(sqlmock.NewRows([]string{"id", "name", "parent_id"}).AddRow(2, "Child", 1))
		mock.ExpectRollback()

		rec := doGroupRequest(e, http.MethodPut, "/api/v1/devices/groups/2", map[string]interface{}{
			"parent_id": 2,
		})
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("self-loop status=%d, want 400, body=%s", rec.Code, rec.Body.String())
		}
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Fatal(err)
		}
	})

	t.Run("moving parent under own descendant returns 400", func(t *testing.T) {
		db, mock, cleanup := newDevicesGormDBWithSQLMock(t)
		defer cleanup()
		e := newDeviceGroupsTestEcho(devices.NewService(db, zap.NewNop()), []string{"devices:update"})

		mock.ExpectBegin()
		mock.ExpectExec(`SELECT pg_advisory_xact_lock\(\$1\)`).WithArgs(7842101).WillReturnResult(sqlmock.NewResult(0, 0))
		mock.ExpectQuery(`SELECT \* FROM "device_groups" WHERE id = \$1`).
			WithArgs(1, 1).
			WillReturnRows(sqlmock.NewRows([]string{"id", "name", "parent_id"}).AddRow(1, "Root", nil))
		mock.ExpectQuery(`SELECT id, parent_id FROM "device_groups"`).
			WillReturnRows(sqlmock.NewRows([]string{"id", "parent_id"}).
				AddRow(1, nil).
				AddRow(2, 1).
				AddRow(3, 2))
		mock.ExpectRollback()

		rec := doGroupRequest(e, http.MethodPut, "/api/v1/devices/groups/1", map[string]interface{}{
			"parent_id": 3,
		})
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("descendant cycle status=%d, want 400, body=%s", rec.Code, rec.Body.String())
		}
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Fatal(err)
		}
	})

	t.Run("moving subtree that causes total depth > 3 returns 400", func(t *testing.T) {
		db, mock, cleanup := newDevicesGormDBWithSQLMock(t)
		defer cleanup()
		e := newDeviceGroupsTestEcho(devices.NewService(db, zap.NewNop()), []string{"devices:update"})

		// Tree: 1 -> 2 (depth 2), and 10 -> 11 (subtreeHeight(10)=2).
		// Moving 10 under 2 => newParentDepth(2) + subtreeHeight(2) = 4 > 3 => 400!
		mock.ExpectBegin()
		mock.ExpectExec(`SELECT pg_advisory_xact_lock\(\$1\)`).WithArgs(7842101).WillReturnResult(sqlmock.NewResult(0, 0))
		mock.ExpectQuery(`SELECT \* FROM "device_groups" WHERE id = \$1`).
			WithArgs(10, 1).
			WillReturnRows(sqlmock.NewRows([]string{"id", "name", "parent_id"}).AddRow(10, "SubRoot", nil))
		mock.ExpectQuery(`SELECT id, parent_id FROM "device_groups"`).
			WillReturnRows(sqlmock.NewRows([]string{"id", "parent_id"}).
				AddRow(1, nil).
				AddRow(2, 1).
				AddRow(10, nil).
				AddRow(11, 10))
		mock.ExpectRollback()

		rec := doGroupRequest(e, http.MethodPut, "/api/v1/devices/groups/10", map[string]interface{}{
			"parent_id": 2,
		})
		if rec.Code != http.StatusBadRequest {
			t.Fatalf("subtree depth>3 status=%d, want 400, body=%s", rec.Code, rec.Body.String())
		}
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Fatal(err)
		}
	})

	t.Run("duplicate name on update returns 409", func(t *testing.T) {
		db, mock, cleanup := newDevicesGormDBWithSQLMock(t)
		defer cleanup()
		e := newDeviceGroupsTestEcho(devices.NewService(db, zap.NewNop()), []string{"devices:update"})

		mock.ExpectBegin()
		mock.ExpectExec(`SELECT pg_advisory_xact_lock\(\$1\)`).WithArgs(7842101).WillReturnResult(sqlmock.NewResult(0, 0))
		mock.ExpectQuery(`SELECT \* FROM "device_groups" WHERE id = \$1`).
			WithArgs(2, 1).
			WillReturnRows(sqlmock.NewRows([]string{"id", "name", "parent_id"}).AddRow(2, "OldName", nil))
		mock.ExpectQuery(`SELECT count\(\*\) FROM "device_groups" WHERE name = \$1 AND id != \$2`).
			WithArgs("Taken", 2).
			WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))
		mock.ExpectRollback()

		rec := doGroupRequest(e, http.MethodPut, "/api/v1/devices/groups/2", map[string]interface{}{
			"name": "Taken",
		})
		if rec.Code != http.StatusConflict {
			t.Fatalf("duplicate name status=%d, want 409, body=%s", rec.Code, rec.Body.String())
		}
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Fatal(err)
		}
	})
}

func TestDeleteDeviceGroup_RejectAndUnassignPolicies(t *testing.T) {
	t.Run("non-empty group with default reject returns 409", func(t *testing.T) {
		db, mock, cleanup := newDevicesGormDBWithSQLMock(t)
		defer cleanup()
		e := newDeviceGroupsTestEcho(devices.NewService(db, zap.NewNop()), []string{"devices:delete"})

		mock.ExpectBegin()
		mock.ExpectExec(`SELECT pg_advisory_xact_lock\(\$1\)`).WithArgs(7842101).WillReturnResult(sqlmock.NewResult(0, 0))
		mock.ExpectQuery(`SELECT \* FROM "device_groups" WHERE id = \$1`).
			WithArgs(2, 1).
			WillReturnRows(sqlmock.NewRows([]string{"id", "name", "parent_id"}).AddRow(2, "Branch", 1))
		mock.ExpectQuery(`SELECT count\(\*\) FROM "devices" WHERE group_id = \$1`).
			WithArgs(2).
			WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(3))
		mock.ExpectQuery(`SELECT count\(\*\) FROM "device_groups" WHERE parent_id = \$1`).
			WithArgs(2).
			WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
		mock.ExpectRollback()

		rec := doGroupRequest(e, http.MethodDelete, "/api/v1/devices/groups/2", nil)
		if rec.Code != http.StatusConflict {
			t.Fatalf("reject non-empty status=%d, want 409, body=%s", rec.Code, rec.Body.String())
		}
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Fatal(err)
		}
	})

	t.Run("unassign unassigns devices, promotes child groups, and cleans up existing bindings & alert_rules", func(t *testing.T) {
		db, mock, cleanup := newDevicesGormDBWithSQLMock(t)
		defer cleanup()
		e := newDeviceGroupsTestEcho(devices.NewService(db, zap.NewNop()), []string{"devices:delete"})

		mock.ExpectBegin()
		mock.ExpectExec(`SELECT pg_advisory_xact_lock\(\$1\)`).WithArgs(7842101).WillReturnResult(sqlmock.NewResult(0, 0))
		mock.ExpectQuery(`SELECT \* FROM "device_groups" WHERE id = \$1`).
			WithArgs(2, 1).
			WillReturnRows(sqlmock.NewRows([]string{"id", "name", "parent_id"}).AddRow(2, "Region", 1))
		mock.ExpectQuery(`SELECT count\(\*\) FROM "devices" WHERE group_id = \$1`).
			WithArgs(2).
			WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(2))
		mock.ExpectQuery(`SELECT count\(\*\) FROM "device_groups" WHERE parent_id = \$1`).
			WithArgs(2).
			WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(1))

		mock.ExpectExec(`UPDATE "devices" SET "group_id"=\$1,"updated_at"=\$2 WHERE group_id = \$3`).
			WithArgs(nil, sqlmock.AnyArg(), 2).
			WillReturnResult(sqlmock.NewResult(0, 2))
		mock.ExpectExec(`UPDATE "device_groups" SET "parent_id"=\$1,"updated_at"=\$2 WHERE parent_id = \$3`).
			WithArgs(1, sqlmock.AnyArg(), 2).
			WillReturnResult(sqlmock.NewResult(0, 1))

		mock.ExpectQuery(regexp.QuoteMeta(`SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name IN ($1,$2,$3)`)).
			WithArgs("template_group_bindings", "monitor_maintenance_targets", "alert_rules").
			WillReturnRows(sqlmock.NewRows([]string{"table_name"}).
				AddRow("template_group_bindings").
				AddRow("monitor_maintenance_targets").
				AddRow("alert_rules"))

		mock.ExpectExec(`DELETE FROM template_group_bindings WHERE group_id = \$1`).
			WithArgs(2).
			WillReturnResult(sqlmock.NewResult(0, 1))
		mock.ExpectExec(`DELETE FROM monitor_maintenance_targets WHERE target_type = \$1 AND target_id = \$2`).
			WithArgs("device_group", 2).
			WillReturnResult(sqlmock.NewResult(0, 1))
		mock.ExpectExec(`UPDATE alert_rules AS r SET device_groups`).
			WithArgs("2", "2").
			WillReturnResult(sqlmock.NewResult(0, 1))

		mock.ExpectExec(`DELETE FROM "device_groups" WHERE id = \$1`).
			WithArgs(2).
			WillReturnResult(sqlmock.NewResult(0, 1))
		mock.ExpectCommit()

		rec := doGroupRequest(e, http.MethodDelete, "/api/v1/devices/groups/2?on_non_empty=unassign", nil)
		if rec.Code != http.StatusOK {
			t.Fatalf("unassign delete status=%d, want 200, body=%s", rec.Code, rec.Body.String())
		}
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Fatal(err)
		}
	})

	t.Run("unassign skips missing Phase 2/3 tables safely without error", func(t *testing.T) {
		db, mock, cleanup := newDevicesGormDBWithSQLMock(t)
		defer cleanup()
		e := newDeviceGroupsTestEcho(devices.NewService(db, zap.NewNop()), []string{"devices:delete"})

		mock.ExpectBegin()
		mock.ExpectExec(`SELECT pg_advisory_xact_lock\(\$1\)`).WithArgs(7842101).WillReturnResult(sqlmock.NewResult(0, 0))
		mock.ExpectQuery(`SELECT \* FROM "device_groups" WHERE id = \$1`).
			WithArgs(4, 1).
			WillReturnRows(sqlmock.NewRows([]string{"id", "name", "parent_id"}).AddRow(4, "EmptyGroup", nil))
		mock.ExpectQuery(`SELECT count\(\*\) FROM "devices" WHERE group_id = \$1`).
			WithArgs(4).
			WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
		mock.ExpectQuery(`SELECT count\(\*\) FROM "device_groups" WHERE parent_id = \$1`).
			WithArgs(4).
			WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))

		mock.ExpectQuery(regexp.QuoteMeta(`SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name IN ($1,$2,$3)`)).
			WithArgs("template_group_bindings", "monitor_maintenance_targets", "alert_rules").
			WillReturnRows(sqlmock.NewRows([]string{"table_name"}).AddRow("alert_rules"))

		mock.ExpectExec(`UPDATE alert_rules AS r SET device_groups`).
			WithArgs("4", "4").
			WillReturnResult(sqlmock.NewResult(0, 0))
		mock.ExpectExec(`DELETE FROM "device_groups" WHERE id = \$1`).
			WithArgs(4).
			WillReturnResult(sqlmock.NewResult(0, 1))
		mock.ExpectCommit()

		rec := doGroupRequest(e, http.MethodDelete, "/api/v1/devices/groups/4", nil)
		if rec.Code != http.StatusOK {
			t.Fatalf("empty group delete status=%d, want 200, body=%s", rec.Code, rec.Body.String())
		}
		if err := mock.ExpectationsWereMet(); err != nil {
			t.Fatal(err)
		}
	})
}
