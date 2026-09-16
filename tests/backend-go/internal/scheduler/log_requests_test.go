package scheduler_test

import (
	"testing"
	_ "unsafe"

	"github.com/your-org/inspect-system/backend-go/internal/logs"
	_ "github.com/your-org/inspect-system/backend-go/internal/scheduler"
)

// 推送证据裁剪（任务 A）：设备近期已通过 Trap 推送时，本轮不再请求 trap 类型
// （trapbuffer 的内容已由推送送达，再登录设备读一遍只会制造登录噪声）；
// alarm 是活动告警的状态快照，推送不能替代，照常采集。

//go:linkname alarmLogRequests github.com/your-org/inspect-system/backend-go/internal/scheduler.alarmLogRequests
func alarmLogRequests(trapsPushed bool) []logs.LogRequest

func TestAlarmLogRequests_ShouldDropTrapWhenDevicePushesTraps(t *testing.T) {
	full := alarmLogRequests(false)
	if len(full) != 2 || full[0].LogType != "trap" || full[0].MaxEntries != 200 || full[1].LogType != "alarm" || full[1].MaxEntries != 100 {
		t.Fatalf("无推送证据时应请求 trap(200)+alarm(100)，got %+v", full)
	}

	trimmed := alarmLogRequests(true)
	if len(trimmed) != 1 || trimmed[0].LogType != "alarm" || trimmed[0].MaxEntries != 100 {
		t.Fatalf("有推送证据时应只请求 alarm(100)，got %+v", trimmed)
	}
}
