package reports_test

import (
	"testing"
	"time"

	"github.com/your-org/inspect-system/backend-go/internal/reports"
)

func TestBuildInspectionReportFileName(t *testing.T) {
	at := time.Date(2026, 9, 11, 12, 6, 8, 0, time.Local)
	cases := []struct {
		name, execName, format, want string
	}{
		{"常规", "手动巡检", "pdf", "巡检报告_手动巡检_20260911_120608.pdf"},
		{"空名称回退", "  ", "pdf", "巡检报告_20260911_120608.pdf"},
		{"非法字符替换", `核心/交换机:A*B 组`, "pdf", "巡检报告_核心_交换机_A_B_组_20260911_120608.pdf"},
		{"excel 扩展名", "手动巡检", "excel", "巡检报告_手动巡检_20260911_120608.xlsx"},
		{"未知格式回退 pdf", "手动巡检", "", "巡检报告_手动巡检_20260911_120608.pdf"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := reports.BuildInspectionReportFileName(tc.execName, at, tc.format); got != tc.want {
				t.Fatalf("got %q, want %q", got, tc.want)
			}
		})
	}
}
