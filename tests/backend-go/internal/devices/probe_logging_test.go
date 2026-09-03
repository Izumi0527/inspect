package devices_test

import (
	"context"
	"errors"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"testing"
	_ "unsafe"

	"go.uber.org/zap"
	"go.uber.org/zap/zapcore"
	"go.uber.org/zap/zaptest/observer"

	"github.com/your-org/inspect-system/backend-go/internal/devices"
)

//go:linkname icmpErrorMessage github.com/your-org/inspect-system/backend-go/internal/devices.icmpErrorMessage
func icmpErrorMessage(err error, output string, goos string) string

//go:linkname pingExecFailurePrefix github.com/your-org/inspect-system/backend-go/internal/devices.pingExecFailurePrefix
var pingExecFailurePrefix string

const pingPermissionDenied = "ping: socket: Operation not permitted\nping: => missing cap_net_raw+p capability or setuid?"

func strPtr(s string) *string { return &s }

func newObservedProbeService(
	level zapcore.Level,
	icmp devices.ICMPProber,
	snmp devices.SNMPProber,
) (*devices.ProbeService, *observer.ObservedLogs) {
	core, logs := observer.New(level)
	return devices.NewProbeServiceWithProbers(zap.New(core), icmp, snmp), logs
}

func okSNMP(ctx context.Context, ip string, c *string, v *string, p *int, tags interface{}) (bool, *float64, *string, *string) {
	ms := 8.0
	info := "Huawei S5720"
	return true, &ms, &info, nil
}

func okICMP(ctx context.Context, ip string) (bool, *float64, *string) {
	ms := 1.5
	return true, &ms, nil
}

// exitError 构造一个真实的 *exec.ExitError：跑一条以指定码退出的命令，
// 不 mock 类型，保证 errors.As 路径与生产一致。
func exitError(t *testing.T, code int) error {
	t.Helper()
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command("cmd", "/c", "exit", strconv.Itoa(code))
	} else {
		cmd = exec.Command("sh", "-c", "exit "+strconv.Itoa(code))
	}
	err := cmd.Run()
	var exitErr *exec.ExitError
	if !errors.As(err, &exitErr) {
		t.Fatalf("expected *exec.ExitError, got %T (%v)", err, err)
	}
	if exitErr.ExitCode() != code {
		t.Fatalf("expected exit code %d, got %d", code, exitErr.ExitCode())
	}
	return err
}

// ---------- P1-2：ICMP 命令级失败与目标无响应必须可区分 ----------

func TestICMPErrorMessage_LinuxExitCode2IsExecFailure(t *testing.T) {
	// Linux iputils：退出码 2 = 命令自身无法执行（权限/参数），与设备是否在线无关
	msg := icmpErrorMessage(exitError(t, 2), pingPermissionDenied, "linux")

	if !strings.HasPrefix(msg, pingExecFailurePrefix) {
		t.Fatalf("linux exit code 2 should be prefixed with %q, got %q", pingExecFailurePrefix, msg)
	}
	if !strings.Contains(msg, "Operation not permitted") {
		t.Fatalf("original ping output must be preserved, got %q", msg)
	}
}

func TestICMPErrorMessage_DarwinExitCode2IsNoResponse(t *testing.T) {
	// BSD/macOS ping：退出码 2 表示「发出去了但没收到回复」，不能误判成执行失败
	msg := icmpErrorMessage(exitError(t, 2), "1 packets transmitted, 0 packets received, 100.0% packet loss", "darwin")

	if strings.HasPrefix(msg, pingExecFailurePrefix) {
		t.Fatalf("darwin exit code 2 is a genuine no-response, must not carry the exec-failure prefix, got %q", msg)
	}
}

func TestICMPErrorMessage_CommandNotFoundIsPrefixedOnAnyPlatform(t *testing.T) {
	notFound := &exec.Error{Name: "ping", Err: exec.ErrNotFound}

	for _, goos := range []string{"linux", "darwin", "windows"} {
		msg := icmpErrorMessage(notFound, "", goos)
		if !strings.HasPrefix(msg, pingExecFailurePrefix) {
			t.Fatalf("[%s] missing ping binary should be prefixed with %q, got %q", goos, pingExecFailurePrefix, msg)
		}
		if !strings.Contains(msg, "ping") {
			t.Fatalf("[%s] message should mention the missing binary, got %q", goos, msg)
		}
	}
}

func TestICMPErrorMessage_LinuxExitCode1KeepsPlainOutput(t *testing.T) {
	// Linux iputils：退出码 1 = 发出去了但没收到回复，是真实的「设备离线」
	output := "PING 10.0.0.9 (10.0.0.9) 56(84) bytes of data.\n\n--- 10.0.0.9 ping statistics ---\n1 packets transmitted, 0 received, 100% packet loss, time 0ms"

	msg := icmpErrorMessage(exitError(t, 1), output, "linux")

	if strings.HasPrefix(msg, pingExecFailurePrefix) {
		t.Fatalf("exit code 1 is a genuine no-response and must not carry the exec-failure prefix, got %q", msg)
	}
	if msg != strings.TrimSpace(output) {
		t.Fatalf("no-response message should be the trimmed ping output, got %q", msg)
	}
}

func TestICMPErrorMessage_EmptyOutputFallsBackToError(t *testing.T) {
	msg := icmpErrorMessage(exitError(t, 1), "   ", "linux")

	if !strings.Contains(msg, "exit status 1") {
		t.Fatalf("empty output should fall back to err.Error(), got %q", msg)
	}
}

// ---------- P1-1：探测过程必须可被日志追踪 ----------

func TestProbeDevice_LogsDebugSummaryWithBothLegs(t *testing.T) {
	failICMP := func(ctx context.Context, ip string) (bool, *float64, *string) {
		return false, nil, strPtr("1 packets transmitted, 0 received")
	}
	svc, logs := newObservedProbeService(zapcore.DebugLevel, failICMP, okSNMP)

	if _, err := svc.ProbeDevice(context.Background(), 42, "10.0.0.42", strPtr("public"), strPtr("2c"), nil, nil, false); err != nil {
		t.Fatalf("ProbeDevice error: %v", err)
	}

	entries := logs.FilterMessage("device probe completed").All()
	if len(entries) != 1 {
		t.Fatalf("expected exactly one 'device probe completed' entry, got %d (all: %v)", len(entries), messages(logs))
	}
	entry := entries[0]
	if entry.Level != zapcore.DebugLevel {
		t.Fatalf("probe summary should be Debug level, got %s", entry.Level)
	}
	fields := entry.ContextMap()
	assertField(t, fields, "device_id", int64(42))
	assertField(t, fields, "ip", "10.0.0.42")
	assertField(t, fields, "icmp_reachable", false)
	assertField(t, fields, "icmp_error", "1 packets transmitted, 0 received")
	assertField(t, fields, "snmp_reachable", true)
	if _, ok := fields["total_ms"]; !ok {
		t.Fatalf("probe summary should carry total_ms, fields=%v", fields)
	}
}

func TestProbeDevice_WarnsWhenPingCannotExecute(t *testing.T) {
	// 服务进程缺 CAP_NET_RAW 时 ping 根本跑不起来：这是运行环境问题而非设备离线，
	// 必须以 Warn 浮出，不能只藏在 Debug 里等人开调试级别才看见。
	brokenICMP := func(ctx context.Context, ip string) (bool, *float64, *string) {
		return false, nil, strPtr(pingExecFailurePrefix + pingPermissionDenied)
	}
	svc, logs := newObservedProbeService(zapcore.WarnLevel, brokenICMP, okSNMP)

	if _, err := svc.ProbeDevice(context.Background(), 7, "10.0.0.7", strPtr("public"), strPtr("2c"), nil, nil, false); err != nil {
		t.Fatalf("ProbeDevice error: %v", err)
	}

	warns := logs.FilterLevelExact(zapcore.WarnLevel).All()
	if len(warns) != 1 {
		t.Fatalf("expected exactly one Warn for ping exec failure, got %d (all: %v)", len(warns), messages(logs))
	}
	fields := warns[0].ContextMap()
	assertField(t, fields, "device_id", int64(7))
	assertField(t, fields, "ip", "10.0.0.7")
	if got, _ := fields["icmp_error"].(string); !strings.Contains(got, "Operation not permitted") {
		t.Fatalf("Warn should carry the ping output, got %q", got)
	}
}

func TestProbeDevice_GenuineOfflineDoesNotWarn(t *testing.T) {
	// 设备真离线是常态，不能刷 Warn；否则批量探测几百台离线设备会把日志淹没。
	offlineICMP := func(ctx context.Context, ip string) (bool, *float64, *string) {
		return false, nil, strPtr("1 packets transmitted, 0 received, 100% packet loss")
	}
	svc, logs := newObservedProbeService(zapcore.WarnLevel, offlineICMP, okSNMP)

	if _, err := svc.ProbeDevice(context.Background(), 8, "10.0.0.8", strPtr("public"), strPtr("2c"), nil, nil, false); err != nil {
		t.Fatalf("ProbeDevice error: %v", err)
	}

	if n := logs.FilterLevelExact(zapcore.WarnLevel).Len(); n != 0 {
		t.Fatalf("genuine offline must not produce Warn, got %d: %v", n, messages(logs))
	}
}

func TestProbeDevice_NilLoggerIsSafe(t *testing.T) {
	// NewProbeServiceWithProbers(nil, …) 是既有测试与特殊环境的用法，日志必须容忍 nil logger
	svc := devices.NewProbeServiceWithProbers(nil, okICMP, okSNMP)

	if _, err := svc.ProbeDevice(context.Background(), 1, "10.0.0.1", strPtr("public"), strPtr("2c"), nil, nil, false); err != nil {
		t.Fatalf("ProbeDevice with nil logger should not fail: %v", err)
	}
}

func TestBatchProbeDevices_LogsInfoSummary(t *testing.T) {
	calls := 0
	mixedICMP := func(ctx context.Context, ip string) (bool, *float64, *string) {
		calls++
		if strings.HasSuffix(ip, ".2") {
			return false, nil, strPtr("100% packet loss")
		}
		ms := 2.0
		return true, &ms, nil
	}
	svc, logs := newObservedProbeService(zapcore.InfoLevel, mixedICMP, okSNMP)

	targets := []devices.ProbeTarget{
		{ID: 1, IPAddress: "10.0.0.1", SnmpCommunity: strPtr("public"), SnmpVersion: strPtr("2c")},
		{ID: 2, IPAddress: "10.0.0.2", SnmpCommunity: strPtr("public"), SnmpVersion: strPtr("2c")},
		{ID: 3, IPAddress: "10.0.0.3", SnmpCommunity: strPtr("public"), SnmpVersion: strPtr("2c")},
	}
	results := svc.BatchProbeDevices(context.Background(), targets, 2)
	if len(results) != 3 {
		t.Fatalf("expected 3 results, got %d", len(results))
	}

	entries := logs.FilterMessage("batch probe completed").All()
	if len(entries) != 1 {
		t.Fatalf("expected one 'batch probe completed' Info entry, got %d (all: %v)", len(entries), messages(logs))
	}
	if entries[0].Level != zapcore.InfoLevel {
		t.Fatalf("batch summary should be Info level, got %s", entries[0].Level)
	}
	fields := entries[0].ContextMap()
	assertField(t, fields, "total", int64(3))
	assertField(t, fields, "icmp_reachable", int64(2))
	assertField(t, fields, "snmp_reachable", int64(3))
	if _, ok := fields["total_ms"]; !ok {
		t.Fatalf("batch summary should carry total_ms, fields=%v", fields)
	}
}

func assertField(t *testing.T, fields map[string]interface{}, key string, want interface{}) {
	t.Helper()
	got, ok := fields[key]
	if !ok {
		t.Fatalf("missing log field %q, fields=%v", key, fields)
	}
	if got != want {
		t.Fatalf("log field %q = %v (%T), want %v (%T)", key, got, got, want, want)
	}
}

func messages(logs *observer.ObservedLogs) []string {
	all := logs.All()
	out := make([]string, 0, len(all))
	for _, e := range all {
		out = append(out, e.Level.String()+":"+e.Message)
	}
	return out
}
