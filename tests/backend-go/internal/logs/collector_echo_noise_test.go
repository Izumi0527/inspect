package logs_test

import (
	"strings"
	"testing"
	"time"
	_ "unsafe"

	_ "github.com/your-org/inspect-system/backend-go/internal/logs"
)

// logEntry 与 internal/logs 的同名未导出结构体保持字段一致，
// 供 go:linkname 绑定 parseLogOutput 的返回值使用。
type logEntry struct {
	DeviceID      int
	Level         string
	Facility      string
	Source        string
	Message       string
	RawMessage    string
	SourceIP      *string
	SourceProcess *string
	LogTimestamp  time.Time
	CollectedAt   time.Time
}

//go:linkname isDeviceEchoNoise github.com/your-org/inspect-system/backend-go/internal/logs.isDeviceEchoNoise
func isDeviceEchoNoise(line string) bool

//go:linkname parseLogOutput github.com/your-org/inspect-system/backend-go/internal/logs.parseLogOutput
func parseLogOutput(output string, deviceID int, vendor string, collectedAt time.Time, maxEntries int) []logEntry

// SSH 采集是「登录设备 → 执行命令 → 抓取回显」，设备在命令输出之外还会回显
// 登录横幅与分页提示。它们不是设备日志，历史上曾占入库量的四分之一以上，
// 既污染统计卡数字，又让日志列表充斥无意义条目。
func TestIsDeviceEchoNoise_ShouldRejectInteractiveEcho(t *testing.T) {
	cases := []struct {
		name string
		line string
	}{
		{"登录时间横幅", "The current login time is 2026-08-10 23:39:16."},
		{"分页提示带光标控制序列", "---- More ----\x1b[42D                                          \x1b[42D"},
		{"纯光标控制序列", "\x1b[42D\x1b[42D"},
		{"命令提示符回显", "<SW>display alarm active"},
		{"命令提示符回显碎片", "<SW>cho"},
		{"VTY 用户数横幅", "Info: The max number of VTY users is 5, and the number"},
		{"VTY 用户数横幅续行", "of current VTY users on line is 4."},
		{"告警表图例", "E=ID, F=Name, G=Level, H=State"},
		{"告警表图例字母序列", "A/B/C/D/E/F/G/H/I/J"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if !isDeviceEchoNoise(tc.line) {
				t.Fatalf("isDeviceEchoNoise(%q) = false, want true", tc.line)
			}
		})
	}
}

// 过滤规则必须足够收敛：真实日志一旦被误判为噪声就会静默丢失，
// 比放过噪声更难发现，因此反向用例与正向用例同等重要。
func TestIsDeviceEchoNoise_ShouldKeepRealLogLines(t *testing.T) {
	cases := []struct {
		name string
		line string
	}{
		{
			"用户登录日志",
			"LINE/5/VTYUSERLOGIN: OID 1.3.6.1.4.1.2011.5.25.207.2.2 A user login. (UserIndex=34, UserName=admin, UserIP=192.168.20.2, UserChannel=VTY0)",
		},
		{
			"接口下线日志",
			"IFNET/1/IF_PVCDOWN: OID 1.3.6.1.6.3.1.1.5.3 Interface 11 turned into DOWN state.(AdminStatus 1,OperStatus 2,InterfaceName GigabitEthernet0/0/6)",
		},
		{
			"正文含 more 字样",
			"MAC address table has more than 100 entries.",
		},
		{
			"正文含 login time 但非横幅",
			"AAA/5/LOGIN: The login time limit of user admin is reached.",
		},
		{
			"以 Info 开头的真实日志",
			"Info: The device is rebooting for software upgrade.",
		},
		{
			"syslog 优先级前缀不应被当作命令提示符",
			"<34>1 2026-02-25T12:00:00Z router1 app 123 - - hello world",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if isDeviceEchoNoise(tc.line) {
				t.Fatalf("isDeviceEchoNoise(%q) = true, want false", tc.line)
			}
		})
	}
}

// 过滤必须发生在 parseLogOutput 层：parseLogLine 对任意非空行都会兜底生成一条日志，
// 只实现判定函数而不接入过滤链，噪声照样逐条入库。
func TestParseLogOutput_ShouldDropDeviceEchoNoise(t *testing.T) {
	output := strings.Join([]string{
		"The current login time is 2026-08-10 23:39:16.",
		"---- More ----\x1b[42D                                          \x1b[42D",
		"LINE/5/VTYUSERLOGIN: OID 1.3.6.1.4.1.2011.5.25.207.2.2 A user login. (UserIndex=34, UserName=admin, UserIP=192.168.20.2, UserChannel=VTY0)",
		"IFNET/1/IF_PVCDOWN: OID 1.3.6.1.6.3.1.1.5.3 Interface 11 turned into DOWN state.(AdminStatus 1,OperStatus 2,InterfaceName GigabitEthernet0/0/6)",
	}, "\n")

	entries := parseLogOutput(output, 1, "huawei", time.Now(), 100)

	if len(entries) != 2 {
		t.Fatalf("len(entries) = %d, want 2（两条噪声应被丢弃）", len(entries))
	}
	for _, entry := range entries {
		if strings.Contains(entry.Message, "current login time") || strings.Contains(entry.Message, "More ----") {
			t.Fatalf("噪声未被过滤: %q", entry.Message)
		}
	}
}
