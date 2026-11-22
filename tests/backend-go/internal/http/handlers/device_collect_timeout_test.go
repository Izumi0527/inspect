package handlers_test

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
	_ "unsafe"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/your-org/inspect-system/backend-go/internal/devices"
	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
	"go.uber.org/zap"
)

//go:linkname newManualCollectContext github.com/your-org/inspect-system/backend-go/internal/http/handlers.newManualCollectContext
func newManualCollectContext(parent context.Context, timeout time.Duration) (context.Context, context.CancelFunc)

func TestManualCollectContext_DetachesParentCancel(t *testing.T) {
	parent, cancelParent := context.WithCancel(context.Background())
	collectCtx, cancelCollect := newManualCollectContext(parent, 2*time.Second)
	defer cancelCollect()

	cancelParent()
	if err := collectCtx.Err(); err != nil {
		t.Fatalf("collectCtx.Err() = %v, want nil after parent cancel", err)
	}
	if _, ok := collectCtx.Deadline(); !ok {
		t.Fatal("collectCtx should have deadline")
	}

	// nil parent 也应安全降级为带超时的 Background context
	nilCtx, cancelNil := newManualCollectContext(nil, 0)
	defer cancelNil()
	if nilCtx.Err() != nil {
		t.Fatalf("nilCtx.Err() = %v, want nil", nilCtx.Err())
	}
	if _, ok := nilCtx.Deadline(); !ok {
		t.Fatal("nilCtx should have default deadline")
	}
}

func TestDeviceCollectCooldown_TryStartInFlightAndIdempotentFinish(t *testing.T) {
	cd := handlers.NewDeviceCollectCooldown(10 * time.Second)
	t0 := time.Date(2026, 11, 22, 10, 0, 0, 0, time.UTC)

	ok, retryAfter, finish := cd.TryStart(42, t0)
	if !ok || retryAfter != 0 || finish == nil {
		t.Fatalf("first TryStart = (%v, %d, %v)", ok, retryAfter, finish != nil)
	}

	// 即使超过 10s 冷却时间，只要仍在执行（未 finish），同设备重入必须被拒绝
	ok2, retryAfter2, _ := cd.TryStart(42, t0.Add(30*time.Second))
	if ok2 || retryAfter2 < 1 {
		t.Fatalf("inFlight TryStart = (%v, %d), want (false, >=1)", ok2, retryAfter2)
	}

	// 幂等释放两次
	finish()
	finish()

	// 释放后仍在 10s 冷却期内应拒绝
	ok3, retryAfter3, _ := cd.TryStart(42, t0.Add(3*time.Second))
	if ok3 || retryAfter3 != 7 {
		t.Fatalf("cooldown TryStart = (%v, %d), want (false, 7)", ok3, retryAfter3)
	}

	// 冷却期过后允许再次启动
	ok4, _, finish4 := cd.TryStart(42, t0.Add(11*time.Second))
	if !ok4 || finish4 == nil {
		t.Fatalf("post-cooldown TryStart = (%v, %v)", ok4, finish4 != nil)
	}
	finish4()

	// 保留原 TryAcquire 签名兼容
	ok5, _ := cd.TryAcquire(99, t0)
	if !ok5 {
		t.Fatal("TryAcquire(99) should succeed")
	}
}

func TestCollectDeviceMetrics_InFlightReturns429AndDeferReleases(t *testing.T) {
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

	// 1. 模拟设备 7 正在采集中 -> 并发请求必须直接返回 429
	ok, _, release := cooldown.TryStart(7, time.Now())
	if !ok {
		t.Fatal("expected initial TryStart to succeed")
	}
	ctx1, rec1 := newEchoContextWithBody(http.MethodPost, "/api/v1/devices/7/collect-metrics", token, nil)
	ctx1.SetParamNames("device_id")
	ctx1.SetParamValues("7")
	if err := h.CollectDeviceMetrics(ctx1); err != nil {
		t.Fatalf("CollectDeviceMetrics(429) returned error = %v", err)
	}
	if rec1.Code != http.StatusTooManyRequests {
		t.Fatalf("status = %d, want 429", rec1.Code)
	}
	release()

	// 2. 模拟设备 8 获取执行资格后因缺少 SNMP community 报错退出 -> defer finish() 必须释放 inFlight
	mock.ExpectQuery(`(?i)SELECT .* FROM .*devices.* WHERE .*id.* = \$1`).
		WithArgs(8, 1).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name", "ip_address", "vendor"}).
			AddRow(8, "FM-S5736", "10.10.10.2", "huawei"))

	ctx2, rec2 := newEchoContextWithBody(http.MethodPost, "/api/v1/devices/8/collect-metrics", token, nil)
	ctx2.SetParamNames("device_id")
	ctx2.SetParamValues("8")
	req2 := httptest.NewRequest(http.MethodPost, "/api/v1/devices/8/collect-metrics", nil)
	ctx2.SetRequest(req2)
	// 补回 auth header（newEchoContextWithBody 已设置在原 request 上，这里改为从原 request 复制 header）
	ctx2, rec2 = newEchoContextWithBody(http.MethodPost, "/api/v1/devices/8/collect-metrics", token, nil)
	ctx2.SetParamNames("device_id")
	ctx2.SetParamValues("8")

	err := h.CollectDeviceMetrics(ctx2)
	assertHTTPErrorCode(t, err, http.StatusInternalServerError)
	_ = rec2

	// 即使报错退出，inFlight 必须已释放（在冷却期外可重新启动，在冷却期内返回冷却剩余秒数）
	okRetry, retryAfter, _ := cooldown.TryStart(8, time.Now().Add(15*time.Second))
	if !okRetry || retryAfter != 0 {
		t.Fatalf("after handler error, TryStart(+15s) = (%v, %d), want (true, 0)", okRetry, retryAfter)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("sqlmock expectations not met: %v", err)
	}
}
