package logs_test

import (
	"context"
	"errors"
	"testing"

	"github.com/your-org/inspect-system/backend-go/internal/logs"
)

// 采集路径决策契约（任务：告警/日志中心改为 SNMP 优先、SSH 兜底）：
//   - trap/alarm 且设备有 SNMP 凭据 → 先 SNMP；SNMP 出错或无数据 → 有 SSH 凭据则回退 SSH；
//   - logbuffer 类（system/interface/security/recent）没有 SNMP 等价物 → 只走 SSH；
//   - 两种凭据都没有 → ErrSSHNotConfigured。
// 路径标签 snmp / ssh / ssh_fallback 会写进结构化日志，供运维核对实际走了哪种方式。

func ok(n int) func() (int, error) { return func() (int, error) { return n, nil } }
func fail() func() (int, error)    { return func() (int, error) { return 0, errors.New("boom") } }
func mustNotRun(t *testing.T) func() (int, error) {
	return func() (int, error) { t.Fatal("不该走到这条路径"); return 0, nil }
}

func TestCollectPath_TrapShouldPreferSNMP(t *testing.T) {
	n, path, err := logs.CollectPathForTest(context.Background(), "trap", true, true, ok(3), mustNotRun(t))
	if err != nil || n != 3 || path != "snmp" {
		t.Fatalf("got (%d,%q,%v), want (3,snmp,nil)", n, path, err)
	}
}

func TestCollectPath_SNMPErrorShouldFallbackToSSH(t *testing.T) {
	n, path, err := logs.CollectPathForTest(context.Background(), "alarm", true, true, fail(), ok(2))
	if err != nil || n != 2 || path != "ssh_fallback" {
		t.Fatalf("got (%d,%q,%v), want (2,ssh_fallback,nil)", n, path, err)
	}
}

func TestCollectPath_SNMPEmptyShouldFallbackToSSH(t *testing.T) {
	// hwAlarmActiveTable 对非 Trap 主机读到空表、nlmLogTable 未开启都表现为「无错误但无数据」，
	// 与设备真的没有告警无法区分，保守起见回退 SSH（与改造前行为一致，不会更差）。
	n, path, err := logs.CollectPathForTest(context.Background(), "trap", true, true, ok(0), ok(5))
	if err != nil || n != 5 || path != "ssh_fallback" {
		t.Fatalf("got (%d,%q,%v), want (5,ssh_fallback,nil)", n, path, err)
	}
}

func TestCollectPath_SNMPOnlyDeviceShouldNotFallback(t *testing.T) {
	// 只有 SNMP 凭据（此前调度器会整台跳过）：SNMP 空就是空，不报错
	n, path, err := logs.CollectPathForTest(context.Background(), "trap", true, false, ok(0), mustNotRun(t))
	if err != nil || n != 0 || path != "snmp" {
		t.Fatalf("got (%d,%q,%v), want (0,snmp,nil)", n, path, err)
	}
	// SNMP 出错且无 SSH 可退：把 SNMP 错误原样上报
	_, _, err = logs.CollectPathForTest(context.Background(), "alarm", true, false, fail(), mustNotRun(t))
	if err == nil {
		t.Fatal("无兜底路径时应返回 SNMP 错误")
	}
}

func TestCollectPath_LogbufferTypesShouldStaySSH(t *testing.T) {
	for _, logType := range []string{"system", "interface", "security", "recent", ""} {
		n, path, err := logs.CollectPathForTest(context.Background(), logType, true, true, mustNotRun(t), ok(7))
		if err != nil || n != 7 || path != "ssh" {
			t.Fatalf("logType=%q got (%d,%q,%v), want (7,ssh,nil)", logType, n, path, err)
		}
	}
}

func TestCollectPath_NoCredentialsShouldReturnSSHNotConfigured(t *testing.T) {
	_, _, err := logs.CollectPathForTest(context.Background(), "trap", false, false, mustNotRun(t), mustNotRun(t))
	if !errors.Is(err, logs.ErrSSHNotConfigured) {
		t.Fatalf("err=%v, want ErrSSHNotConfigured", err)
	}
	_, _, err = logs.CollectPathForTest(context.Background(), "system", true, false, mustNotRun(t), mustNotRun(t))
	if !errors.Is(err, logs.ErrSSHNotConfigured) {
		t.Fatalf("logbuffer 类无 SSH 凭据时 err=%v, want ErrSSHNotConfigured", err)
	}
}
