package logs_test

import (
	"context"
	"errors"
	"testing"

	"github.com/your-org/inspect-system/backend-go/internal/logs"
)

// 会话合并契约（任务 D1）：调度器一轮对同一设备采 trap + alarm 两类，此前各开一次 SSH 会话，
// 每次登录都在设备上留下一条登录日志再被下一轮采回。改为：逐类型先试 SNMP，
// 需要 SSH 的类型汇总后只开一次会话；每个类型的路径标签与单类型采集完全一致。

func snmpBy(counts map[string]int) func(string) (int, error) {
	return func(logType string) (int, error) { return counts[logType], nil }
}

func sshBy(counts map[string]int) func(string) (int, error) {
	return func(logType string) (int, error) { return counts[logType], nil }
}

func TestCollectGroup_BothFallbackShouldShareOneSSHSession(t *testing.T) {
	outcomes, sessions := logs.CollectGroupPathForTest(context.Background(),
		[]string{"trap", "alarm"}, true, true,
		snmpBy(map[string]int{}), sshBy(map[string]int{"trap": 4, "alarm": 2}))

	if sessions != 1 {
		t.Fatalf("ssh sessions = %d, want 1", sessions)
	}
	if got := outcomes["trap"]; got.Err != nil || got.Count != 4 || got.Path != "ssh_fallback" {
		t.Fatalf("trap = %+v, want (4, ssh_fallback, nil)", got)
	}
	if got := outcomes["alarm"]; got.Err != nil || got.Count != 2 || got.Path != "ssh_fallback" {
		t.Fatalf("alarm = %+v, want (2, ssh_fallback, nil)", got)
	}
}

func TestCollectGroup_SNMPHitShouldNotJoinSSHSession(t *testing.T) {
	sshCalls := map[string]int{}
	ssh := func(logType string) (int, error) { sshCalls[logType]++; return 5, nil }

	outcomes, sessions := logs.CollectGroupPathForTest(context.Background(),
		[]string{"trap", "alarm"}, true, true,
		snmpBy(map[string]int{"trap": 3}), ssh)

	if sessions != 1 {
		t.Fatalf("ssh sessions = %d, want 1（只有 alarm 需要回退）", sessions)
	}
	if got := outcomes["trap"]; got.Path != "snmp" || got.Count != 3 {
		t.Fatalf("trap = %+v, want (3, snmp)", got)
	}
	if got := outcomes["alarm"]; got.Path != "ssh_fallback" || got.Count != 5 {
		t.Fatalf("alarm = %+v, want (5, ssh_fallback)", got)
	}
	if sshCalls["trap"] != 0 {
		t.Fatalf("trap 已由 SNMP 命中，不应再进入 SSH 会话")
	}
}

func TestCollectGroup_AllSNMPHitShouldOpenNoSSHSession(t *testing.T) {
	outcomes, sessions := logs.CollectGroupPathForTest(context.Background(),
		[]string{"trap", "alarm"}, true, true,
		snmpBy(map[string]int{"trap": 1, "alarm": 1}), mustNotRunByType(t))

	if sessions != 0 {
		t.Fatalf("ssh sessions = %d, want 0", sessions)
	}
	for _, logType := range []string{"trap", "alarm"} {
		if got := outcomes[logType]; got.Path != "snmp" || got.Count != 1 || got.Err != nil {
			t.Fatalf("%s = %+v, want (1, snmp, nil)", logType, got)
		}
	}
}

func TestCollectGroup_LogbufferTypesShouldShareOneSSHSession(t *testing.T) {
	outcomes, sessions := logs.CollectGroupPathForTest(context.Background(),
		[]string{"system", "security"}, true, true,
		mustNotRunByType(t), sshBy(map[string]int{"system": 7, "security": 1}))

	if sessions != 1 {
		t.Fatalf("ssh sessions = %d, want 1", sessions)
	}
	if got := outcomes["system"]; got.Path != "ssh" || got.Count != 7 {
		t.Fatalf("system = %+v, want (7, ssh)", got)
	}
	if got := outcomes["security"]; got.Path != "ssh" || got.Count != 1 {
		t.Fatalf("security = %+v, want (1, ssh)", got)
	}
}

func TestCollectGroup_NoCredentialsShouldFailEveryTypeWithoutSession(t *testing.T) {
	outcomes, sessions := logs.CollectGroupPathForTest(context.Background(),
		[]string{"trap", "system"}, false, false,
		mustNotRunByType(t), mustNotRunByType(t))

	if sessions != 0 {
		t.Fatalf("ssh sessions = %d, want 0", sessions)
	}
	for _, logType := range []string{"trap", "system"} {
		if !errors.Is(outcomes[logType].Err, logs.ErrSSHNotConfigured) {
			t.Fatalf("%s err = %v, want ErrSSHNotConfigured", logType, outcomes[logType].Err)
		}
	}
}

func mustNotRunByType(t *testing.T) func(string) (int, error) {
	return func(logType string) (int, error) {
		t.Fatalf("类型 %s 不该走到这条路径", logType)
		return 0, nil
	}
}
