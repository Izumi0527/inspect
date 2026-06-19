package logs_test

import (
	"testing"
	"time"
	_ "unsafe"

	"github.com/your-org/inspect-system/backend-go/internal/logs"
)

// filterNewLogRecords 是 logs 包的未导出纯函数（日志采集去重核心），
// 按本仓库约定通过 go:linkname 桥接做白盒测试。
//
//go:linkname filterNewLogRecords github.com/your-org/inspect-system/backend-go/internal/logs.filterNewLogRecords
func filterNewLogRecords(records []logs.DeviceLog, existing []logs.DeviceLog) []logs.DeviceLog

func mkLog(deviceID int, ts time.Time, level, message string) logs.DeviceLog {
	return logs.DeviceLog{
		DeviceID:     deviceID,
		Level:        level,
		Facility:     "local0",
		Source:       "device",
		Message:      message,
		LogTimestamp: ts,
		CollectedAt:  time.Now().UTC(), // collected_at 不参与去重，刻意每次不同
	}
}

func TestFilterNewLogRecords(t *testing.T) {
	base := time.Date(2026, 6, 20, 1, 50, 0, 0, time.UTC)

	t.Run("无已存且无批内重复时全部保留", func(t *testing.T) {
		records := []logs.DeviceLog{
			mkLog(1, base, "info", "link up"),
			mkLog(1, base.Add(time.Second), "warning", "link down"),
		}
		got := filterNewLogRecords(records, nil)
		if len(got) != 2 {
			t.Fatalf("期望保留 2 条，实际 %d", len(got))
		}
	})

	t.Run("内容相同但采集时间不同的已存记录视为重复被过滤", func(t *testing.T) {
		existing := []logs.DeviceLog{mkLog(1, base, "info", "link up")}
		records := []logs.DeviceLog{
			mkLog(1, base, "info", "link up"),                 // 与 existing 内容相同 → 重复
			mkLog(1, base.Add(time.Second), "info", "link up"), // 时间不同 → 新
		}
		got := filterNewLogRecords(records, existing)
		if len(got) != 1 {
			t.Fatalf("期望仅保留 1 条新日志，实际 %d", len(got))
		}
		if got[0].LogTimestamp.Equal(base) {
			t.Fatalf("被保留的应是时间不同的新日志，却保留了重复项")
		}
	})

	t.Run("批内重复折叠为一条", func(t *testing.T) {
		records := []logs.DeviceLog{
			mkLog(1, base, "info", "dup"),
			mkLog(1, base, "info", "dup"),
			mkLog(1, base, "info", "dup"),
		}
		got := filterNewLogRecords(records, nil)
		if len(got) != 1 {
			t.Fatalf("批内 3 条相同应折叠为 1 条，实际 %d", len(got))
		}
	})

	t.Run("不同字段不会被误判为重复", func(t *testing.T) {
		existing := []logs.DeviceLog{mkLog(1, base, "info", "msg")}
		records := []logs.DeviceLog{
			mkLog(2, base, "info", "msg"),                  // 设备不同
			mkLog(1, base, "error", "msg"),                 // 级别不同
			mkLog(1, base.Add(time.Second), "info", "msg"), // 时间不同
			mkLog(1, base, "info", "other"),                // 消息不同
		}
		got := filterNewLogRecords(records, existing)
		if len(got) != 4 {
			t.Fatalf("4 条均与已存不同应全部保留，实际 %d", len(got))
		}
	})

	t.Run("亚微秒差异按微秒对齐视为同一时刻", func(t *testing.T) {
		existing := []logs.DeviceLog{mkLog(1, base.Add(300*time.Nanosecond), "info", "x")}
		records := []logs.DeviceLog{mkLog(1, base.Add(700*time.Nanosecond), "info", "x")}
		got := filterNewLogRecords(records, existing)
		if len(got) != 0 {
			t.Fatalf("纳秒级差异截断到微秒后应判为重复，实际保留 %d", len(got))
		}
	})
}

// mkUnparsedLog 模拟“无可解析设备时间戳”的日志：log_timestamp 回退为 collected_at（两者相等）。
func mkUnparsedLog(deviceID int, collectedAt time.Time, message string) logs.DeviceLog {
	return logs.DeviceLog{
		DeviceID:     deviceID,
		Level:        "info",
		Facility:     "local0",
		Source:       "ssh",
		Message:      message,
		LogTimestamp: collectedAt,
		CollectedAt:  collectedAt,
	}
}

// TestFilterNewLogRecords_NoRealTimestamp 复现并守护本次修复：
// 对没有真实设备时间戳的日志（log_timestamp == collected_at），两次采集时间不同也应判为重复，
// 否则同一行会随每次采集被反复入库（截图所示问题）。
func TestFilterNewLogRecords_NoRealTimestamp(t *testing.T) {
	t1 := time.Date(2026, 6, 20, 2, 30, 46, 0, time.UTC)
	t2 := time.Date(2026, 6, 20, 3, 57, 20, 0, time.UTC) // 第二次采集，时间不同

	t.Run("不同采集时间的相同内容应判为重复", func(t *testing.T) {
		existing := []logs.DeviceLog{
			mkUnparsedLog(1, t1, "of current VTY users on line is 1."),
			mkUnparsedLog(1, t1, "Info: Slave board is not ready."),
		}
		records := []logs.DeviceLog{
			mkUnparsedLog(1, t2, "of current VTY users on line is 1."), // 与已存内容相同 → 重复
			mkUnparsedLog(1, t2, "Info: Slave board is not ready."),     // 重复
			mkUnparsedLog(1, t2, "The current login time is 2026-06-20 03:57:18."), // 内容不同 → 新
		}
		got := filterNewLogRecords(records, existing)
		if len(got) != 1 {
			t.Fatalf("应仅保留 1 条内容不同的新日志，实际 %d", len(got))
		}
		if got[0].Message != "The current login time is 2026-06-20 03:57:18." {
			t.Fatalf("保留的应是内容不同的新日志，实际 %q", got[0].Message)
		}
	})
}
