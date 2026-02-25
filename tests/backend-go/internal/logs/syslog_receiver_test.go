package logs_test

import (
	"context"
	"fmt"
	"net"
	"sync"
	"testing"
	"time"

	"github.com/your-org/inspect-system/backend-go/internal/logs"
	"go.uber.org/zap"
)

type fakeResolver struct {
	mapping map[string]int
}

func (r fakeResolver) ResolveDeviceIDByIP(_ context.Context, ip string) (int, error) {
	if r.mapping == nil {
		return 0, logs.ErrSyslogDeviceNotFound
	}
	id, ok := r.mapping[ip]
	if !ok || id <= 0 {
		return 0, logs.ErrSyslogDeviceNotFound
	}
	return id, nil
}

type fakeWriter struct {
	mu      sync.Mutex
	entries []logs.SyslogStoreEntry
}

func (w *fakeWriter) WriteSyslogEntries(_ context.Context, entries []logs.SyslogStoreEntry) (int, error) {
	w.mu.Lock()
	defer w.mu.Unlock()
	w.entries = append(w.entries, entries...)
	return len(entries), nil
}

func (w *fakeWriter) Count() int {
	w.mu.Lock()
	defer w.mu.Unlock()
	return len(w.entries)
}

func TestSyslogReceiver_TCP_NewlineDelimited_ShouldStoreLog(t *testing.T) {
	writer := &fakeWriter{}
	resolver := fakeResolver{mapping: map[string]int{"127.0.0.1": 1}}

	receiver := logs.NewSyslogReceiverWithDeps(resolver, writer, zap.NewNop())
	defer func() { _ = receiver.Stop(context.Background()) }()

	status, err := receiver.Apply(context.Background(), logs.SyslogConfig{
		Enabled:         true,
		Protocol:        "tcp",
		Host:            "127.0.0.1",
		Port:            0, // 期望自动分配端口，避免测试端口冲突
		MaxMessageBytes: 8192,
		AlertsEnabled:   false,
	})
	if err != nil {
		t.Fatalf("Apply: %v", err)
	}
	if !status.Running {
		t.Fatalf("Running=false, want true")
	}
	if status.Config.Port == 0 || status.Config.Port == 5514 {
		t.Fatalf("Port=%d, want auto-assigned port (non-0 and non-5514)", status.Config.Port)
	}

	conn, err := net.Dial("tcp", fmt.Sprintf("127.0.0.1:%d", status.Config.Port))
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	_ = conn.SetWriteDeadline(time.Now().Add(2 * time.Second))
	_, _ = conn.Write([]byte("<34>Oct 11 22:14:15 mymachine sshd[123]: Failed password for root\n"))
	_ = conn.Close()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if writer.Count() == 1 {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if writer.Count() != 1 {
		t.Fatalf("stored=%d, want 1", writer.Count())
	}
}

func TestSyslogReceiver_TCP_NewlineDelimited_WithoutTrailingNewline_ShouldStoreLog(t *testing.T) {
	writer := &fakeWriter{}
	resolver := fakeResolver{mapping: map[string]int{"127.0.0.1": 1}}

	receiver := logs.NewSyslogReceiverWithDeps(resolver, writer, zap.NewNop())
	defer func() { _ = receiver.Stop(context.Background()) }()

	status, err := receiver.Apply(context.Background(), logs.SyslogConfig{
		Enabled:         true,
		Protocol:        "tcp",
		Host:            "127.0.0.1",
		Port:            0,
		MaxMessageBytes: 8192,
		AlertsEnabled:   false,
	})
	if err != nil {
		t.Fatalf("Apply: %v", err)
	}
	if !status.Running {
		t.Fatalf("Running=false, want true")
	}

	conn, err := net.Dial("tcp", fmt.Sprintf("127.0.0.1:%d", status.Config.Port))
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	_ = conn.SetWriteDeadline(time.Now().Add(2 * time.Second))
	_, _ = conn.Write([]byte("<34>Oct 11 22:14:15 mymachine sshd[123]: no-newline"))
	_ = conn.Close()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if writer.Count() == 1 {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if writer.Count() != 1 {
		t.Fatalf("stored=%d, want 1", writer.Count())
	}
}

func TestSyslogReceiver_TCP_OctetCounting_ShouldStoreLog(t *testing.T) {
	writer := &fakeWriter{}
	resolver := fakeResolver{mapping: map[string]int{"127.0.0.1": 2}}

	receiver := logs.NewSyslogReceiverWithDeps(resolver, writer, zap.NewNop())
	defer func() { _ = receiver.Stop(context.Background()) }()

	status, err := receiver.Apply(context.Background(), logs.SyslogConfig{
		Enabled:         true,
		Protocol:        "tcp",
		Host:            "127.0.0.1",
		Port:            0,
		MaxMessageBytes: 8192,
		AlertsEnabled:   false,
	})
	if err != nil {
		t.Fatalf("Apply: %v", err)
	}
	if status.Config.Port == 0 || status.Config.Port == 5514 {
		t.Fatalf("Port=%d, want auto-assigned port (non-0 and non-5514)", status.Config.Port)
	}

	conn, err := net.Dial("tcp", fmt.Sprintf("127.0.0.1:%d", status.Config.Port))
	if err != nil {
		t.Fatalf("dial: %v", err)
	}
	defer conn.Close()

	msg := "<34>1 2026-02-25T10:11:12Z host app 123 456 - hello"
	frame := fmt.Sprintf("%d %s", len(msg), msg)
	_ = conn.SetWriteDeadline(time.Now().Add(2 * time.Second))
	_, _ = conn.Write([]byte(frame))
	_ = conn.Close()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if writer.Count() == 1 {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if writer.Count() != 1 {
		t.Fatalf("stored=%d, want 1", writer.Count())
	}
}

func TestSyslogReceiver_UnmatchedDeviceIP_ShouldDropAndCount(t *testing.T) {
	writer := &fakeWriter{}
	resolver := fakeResolver{mapping: map[string]int{}}

	receiver := logs.NewSyslogReceiverWithDeps(resolver, writer, zap.NewNop())
	defer func() { _ = receiver.Stop(context.Background()) }()

	status, err := receiver.Apply(context.Background(), logs.SyslogConfig{
		Enabled:         true,
		Protocol:        "udp",
		Host:            "127.0.0.1",
		Port:            0,
		MaxMessageBytes: 8192,
		AlertsEnabled:   false,
	})
	if err != nil {
		t.Fatalf("Apply: %v", err)
	}
	if status.Config.Port == 0 || status.Config.Port == 5514 {
		t.Fatalf("Port=%d, want auto-assigned port (non-0 and non-5514)", status.Config.Port)
	}

	addr, err := net.ResolveUDPAddr("udp", fmt.Sprintf("127.0.0.1:%d", status.Config.Port))
	if err != nil {
		t.Fatalf("resolve: %v", err)
	}
	conn, err := net.DialUDP("udp", nil, addr)
	if err != nil {
		t.Fatalf("dial udp: %v", err)
	}
	defer conn.Close()
	_, _ = conn.Write([]byte("<34>Oct 11 22:14:15 mymachine sshd[123]: test\n"))

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		if receiver.Status().DroppedUnmatched >= 1 {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	if receiver.Status().DroppedUnmatched < 1 {
		t.Fatalf("DroppedUnmatched=%d, want >= 1", receiver.Status().DroppedUnmatched)
	}
	if writer.Count() != 0 {
		t.Fatalf("stored=%d, want 0", writer.Count())
	}
}
