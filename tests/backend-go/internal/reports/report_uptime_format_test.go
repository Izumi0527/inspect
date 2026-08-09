package reports_test

import (
	"testing"
	_ "unsafe"

	_ "github.com/your-org/inspect-system/backend-go/internal/reports"
)

//go:linkname formatUptimeSeconds github.com/your-org/inspect-system/backend-go/internal/reports.formatUptimeSeconds
func formatUptimeSeconds(value *int) string

func intPtr(v int) *int { return &v }

// 报告里的运行时长必须精确到分钟：只显示"12 天"无法判断设备是否刚重启过，
// 运维核对重启时间点时需要分钟粒度。
func TestFormatUptimeSeconds(t *testing.T) {
	tests := []struct {
		name  string
		input *int
		want  string
	}{
		{"天级：保留小时与分钟", intPtr(12*86400 + 5*3600 + 37*60 + 12), "12 天 5 小时 37 分钟"},
		{"天级：零头小时与分钟仍显式输出", intPtr(3 * 86400), "3 天 0 小时 0 分钟"},
		{"小时级：保留分钟", intPtr(5*3600 + 8*60), "5 小时 8 分钟"},
		{"分钟级", intPtr(42 * 60), "42 分钟"},
		{"不足一分钟仍按秒显示，不写成 0 分钟", intPtr(45), "45 秒"},
		{"零值返回空串", intPtr(0), ""},
		{"负值返回空串", intPtr(-1), ""},
		{"nil 返回空串", nil, ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := formatUptimeSeconds(tt.input); got != tt.want {
				t.Errorf("formatUptimeSeconds() = %q, 期望 %q", got, tt.want)
			}
		})
	}
}
