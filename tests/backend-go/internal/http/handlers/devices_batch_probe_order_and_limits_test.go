package handlers_test

import (
	"encoding/json"
	"net/http"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"

	"github.com/your-org/inspect-system/backend-go/internal/devices"
	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
)

func TestDevicesHandler_BatchProbeDevices_ShouldRejectMaxConcurrentTooLarge(t *testing.T) {
	authService, token := newAuthServiceWithPermissions(t, []string{"devices:read"})
	h := handlers.DevicesHandler{
		Service: &devices.Service{},
		Probe:   newFastProbeService(),
		Auth:    authService,
	}

	ctx, _ := newEchoContextWithBody(
		http.MethodPost,
		"/api/v1/devices/batch-probe",
		token,
		[]byte(`{"device_ids":[1],"max_concurrent":99999}`),
	)
	err := h.BatchProbeDevices(ctx)
	assertHTTPErrorCode(t, err, http.StatusBadRequest)
}

func TestDevicesHandler_BatchProbeDevices_ShouldReturnResultsInRequestOrder(t *testing.T) {
	authService, token := newAuthServiceWithPermissions(t, []string{"devices:read"})
	db, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	// 说明：BatchProbeDevices 会对 device_ids 去重并保留输入顺序，我们用 [2,1] 验证返回 results 的排序稳定。
	mock.ExpectQuery(`(?i)SELECT .* FROM .*devices.* WHERE .*id.* IN \(\$1,\s*\$2\)`).
		WithArgs(2, 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "ip_address"}).
			AddRow(1, "dev-1", "127.0.0.1").
			AddRow(2, "dev-2", "127.0.0.1"))

	h := handlers.DevicesHandler{
		Service: devices.NewService(db, nil),
		Probe:   newFastProbeService(),
		Auth:    authService,
	}

	ctx, rec := newEchoContextWithBody(
		http.MethodPost,
		"/api/v1/devices/batch-probe",
		token,
		[]byte(`{"device_ids":[2,1],"max_concurrent":2}`),
	)

	if err := h.BatchProbeDevices(ctx); err != nil {
		t.Fatalf("handler returned error: %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d, want %d", rec.Code, http.StatusOK)
	}

	var payload struct {
		Results []struct {
			DeviceID int `json:"device_id"`
		} `json:"results"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("invalid json response: %v", err)
	}
	if len(payload.Results) < 2 {
		t.Fatalf("results size=%d, want >=2", len(payload.Results))
	}
	if payload.Results[0].DeviceID != 2 || payload.Results[1].DeviceID != 1 {
		t.Fatalf("results order=%v, want [2 1]", []int{payload.Results[0].DeviceID, payload.Results[1].DeviceID})
	}

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sql expectations not met: %v", err)
	}
}
