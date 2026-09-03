package devices_test

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"go.uber.org/zap/zapcore"

	"github.com/your-org/inspect-system/backend-go/internal/devices"
)

// ---------- P2-2：前端断开后 ProbeDevice 必须立即返回，不能陪慢腿跑完 ----------

// blockingSNMP 模拟 gosnmp 那种不接收 context、只会跑满自身超时的探测；
// 用 release 通道控制它何时结束，避免测试真的等 15s。calls 记录被调用次数。
func blockingSNMP(release <-chan struct{}, calls *int32) devices.SNMPProber {
	return func(ctx context.Context, ip string, c *string, v *string, p *int, tags interface{}) (bool, *float64, *string, *string) {
		atomic.AddInt32(calls, 1)
		<-release
		msg := "request timeout (after 2 retries)"
		return false, nil, nil, &msg
	}
}

// releaser 保证 release 通道只关闭一次：测试中途 Fatal 时由 Cleanup 兜底放行被遗弃的 goroutine。
type releaser struct {
	ch   chan struct{}
	once sync.Once
}

func newReleaser(t *testing.T) *releaser {
	r := &releaser{ch: make(chan struct{})}
	t.Cleanup(r.release)
	return r
}

func (r *releaser) release() { r.once.Do(func() { close(r.ch) }) }

type probeOutcome struct {
	result devices.ProbeResult
	err    error
}

// probeCancelledAfter 发起探测，在 ICMP 腿完成后取消 ctx，并要求 ProbeDevice 在 2s 内返回。
// 当前实现若仍在等慢腿，这里以 Fatal 失败而非挂死。
func probeCancelledAfter(t *testing.T, svc *devices.ProbeService, deviceID int, ip string) devices.ProbeResult {
	t.Helper()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	done := make(chan probeOutcome, 1)
	go func() {
		r, err := svc.ProbeDevice(ctx, deviceID, ip, strPtr("public"), strPtr("2c"), nil, nil, false)
		done <- probeOutcome{r, err}
	}()

	time.Sleep(50 * time.Millisecond)
	cancel()

	select {
	case out := <-done:
		if out.err != nil {
			t.Fatalf("cancelled probe should still return the partial result, got error: %v", out.err)
		}
		return out.result
	case <-time.After(2 * time.Second):
		t.Fatal("ProbeDevice did not return within 2s after context cancel — it is waiting for the slow leg")
		return devices.ProbeResult{}
	}
}

func TestProbeDevice_ReturnsPromptlyWhenContextCancelled(t *testing.T) {
	rel := newReleaser(t)
	var calls int32
	svc, logs := newObservedProbeService(zapcore.DebugLevel, okICMP, blockingSNMP(rel.ch, &calls))

	result := probeCancelledAfter(t, svc, 5, "10.0.0.5")

	if !result.IcmpReachable {
		t.Fatalf("ICMP leg had finished before cancel; its result must be kept, got %+v", result)
	}
	if result.SnmpReachable {
		t.Fatalf("SNMP leg never finished; it must not be reported reachable")
	}
	if result.SnmpError == nil || *result.SnmpError == "" {
		t.Fatalf("SNMP leg abandoned on cancel should carry an explanatory error, got %+v", result)
	}
	if n := logs.FilterMessage("device probe abandoned: context cancelled").Len(); n != 1 {
		t.Fatalf("expected one Debug entry for abandoned probe, got %d: %v", n, messages(logs))
	}
	if n := logs.FilterMessage("device probe completed").Len(); n != 0 {
		t.Fatalf("abandoned probe must not also log 'completed', got %d: %v", n, messages(logs))
	}
}

func TestProbeDevice_CancelledResultIsNotCached(t *testing.T) {
	// 半截结果写进缓存会让 30s 内的下一次带缓存探测拿到假的「SNMP 失败」
	rel := newReleaser(t)
	var calls int32
	svc, _ := newObservedProbeService(zapcore.DebugLevel, okICMP, blockingSNMP(rel.ch, &calls))

	probeCancelledAfter(t, svc, 6, "10.0.0.6")
	// 放行被遗弃的慢腿，也让下一次探测不再阻塞
	rel.release()

	if _, err := svc.ProbeDevice(context.Background(), 6, "10.0.0.6", strPtr("public"), strPtr("2c"), nil, nil, true); err != nil {
		t.Fatalf("second ProbeDevice error: %v", err)
	}

	// 未缓存 → 第二次会真正调用 SNMP 探测器（计数 2）；被缓存 → 直接返回半截结果（计数停在 1）
	if got := atomic.LoadInt32(&calls); got != 2 {
		t.Fatalf("useCache=true probe must not be served from the cancelled partial result: snmp prober calls=%d, want 2", got)
	}
}
