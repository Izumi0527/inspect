package handlers_test

import (
	"encoding/json"
	"net/http"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/your-org/inspect-system/backend-go/internal/devices"
	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
	"go.uber.org/zap"
)

func TestDeviceCollectCooldown_TryAcquireRespectsInFlight(t *testing.T) {
	cd := handlers.NewDeviceCollectCooldown(10 * time.Second)
	t0 := time.Date(2026, 11, 22, 12, 0, 0, 0, time.UTC)

	ok, retryAfter, finish := cd.TryStart(42, t0)
	if !ok || retryAfter != 0 || finish == nil {
		t.Fatalf("TryStart = (%v, %d, %v), want (true, 0, non-nil)", ok, retryAfter, finish != nil)
	}

	// 即使超过 10s 冷却时间，只要 inFlight 未释放，TryAcquire 也必须感知并拒绝
	okAcq, remAcq := cd.TryAcquire(42, t0.Add(30*time.Second))
	if okAcq || remAcq < 1 {
		t.Fatalf("inFlight TryAcquire = (%v, %d), want (false, >=1)", okAcq, remAcq)
	}

	// 释放后在冷却期内 TryAcquire 仍返回剩余冷却秒数
	finish()
	okCooldown, remCooldown := cd.TryAcquire(42, t0.Add(3*time.Second))
	if okCooldown || remCooldown != 7 {
		t.Fatalf("cooldown TryAcquire = (%v, %d), want (false, 7)", okCooldown, remCooldown)
	}

	// 冷却期结束后 TryAcquire 允许获取
	okAfter, remAfter := cd.TryAcquire(42, t0.Add(11*time.Second))
	if !okAfter || remAfter != 0 {
		t.Fatalf("post-cooldown TryAcquire = (%v, %d), want (true, 0)", okAfter, remAfter)
	}
}

func TestBatchCollectMetrics_UsesTryStartAndReleasesInFlight(t *testing.T) {
	authService, token := newAuthServiceWithPermissions(t, []string{"devices:update"})
	db, mock, cleanup := newGormDBWithSqlmock(t)
	defer cleanup()

	cooldown := handlers.NewDeviceCollectCooldown(10 * time.Second)
	h := handlers.DevicesHandler{
		Service:         devices.NewService(db, zap.NewNop()),
		SNMPCollector:   devices.NewSNMPCollector(zap.NewNop()),
		Metrics:         monitoring.NewMetricsWriter(db, nil, zap.NewNop()),
		Auth:            authService,
		CollectCooldown: cooldown,
	}

	// 设备 7 处于在途采集状态（哪怕时间戳已超冷却期）-> BatchCollectMetrics 必须跳过设备 7
	ok, _, release7 := cooldown.TryStart(7, time.Now().Add(-30*time.Second))
	if !ok {
		t.Fatal("expected TryStart(7) to succeed")
	}
	defer release7()

	mock.ExpectQuery(`(?i)SELECT .* FROM .*devices.* WHERE .*id.* IN \(\$1,\$2\)`).
		WithArgs(7, 8).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "ip_address", "vendor"}).
			AddRow(7, "SW-7", "10.10.10.7", "huawei").
			AddRow(8, "SW-8", "10.10.10.8", "huawei"))

	ctx, rec := newEchoContextWithBody(http.MethodPost, "/api/v1/devices/batch-collect-metrics", token, []byte(`{"device_ids":[7,8]}`))
	if err := h.BatchCollectMetrics(ctx); err != nil {
		t.Fatalf("BatchCollectMetrics error = %v", err)
	}
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}

	var payload struct {
		SkippedCooldownDeviceIDs []int `json:"skippedCooldownDeviceIDs"`
		Results                  []struct {
			DeviceID int  `json:"device_id"`
			Success  bool `json:"success"`
		} `json:"results"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &payload); err != nil {
		t.Fatalf("unmarshal response: %v", err)
	}
	if len(payload.SkippedCooldownDeviceIDs) != 1 || payload.SkippedCooldownDeviceIDs[0] != 7 {
		t.Fatalf("skippedCooldownDeviceIDs = %v, want [7]", payload.SkippedCooldownDeviceIDs)
	}
	if len(payload.Results) != 1 || payload.Results[0].DeviceID != 8 {
		t.Fatalf("results = %+v, want only device 8", payload.Results)
	}

	// 设备 8 在批量采集失败退出后，inFlight 必须已释放（冷却期外可立即再次 TryStart）
	ok8, retryAfter8, finish8 := cooldown.TryStart(8, time.Now().Add(15*time.Second))
	if !ok8 || retryAfter8 != 0 || finish8 == nil {
		t.Fatalf("after BatchCollectMetrics error, TryStart(8, +15s) = (%v, %d, %v), want (true, 0, non-nil)", ok8, retryAfter8, finish8 != nil)
	}
	finish8()

	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}
