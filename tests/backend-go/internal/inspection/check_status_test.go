package inspection_test

import (
	"testing"
	_ "unsafe"

	_ "github.com/your-org/inspect-system/backend-go/internal/inspection"
)

// normalizeCheckResultStatus 是检查结果状态的归一化入口，也是落库前的最后一道关。
//
//go:linkname normalizeCheckResultStatus github.com/your-org/inspect-system/backend-go/internal/inspection.normalizeCheckResultStatus
func normalizeCheckResultStatus(raw string) string

// TestNormalizeCheckResultStatus_AcceptsNotApplicable 守护「不适用」状态。
//
// 检查项声明适用设备类型后，交换机上的 BGP 检查、路由器上的 PoE 检查都属于
// 「这台设备没有这个特性」，既不是通过也不是失败。若该状态未登记进本函数，
// 会被 default 分支静默转成 fail——设备完全健康却报一堆失败，且没有任何报错
// 提示转换发生过。这是本轮改动里最隐蔽的失败模式。
func TestNormalizeCheckResultStatus_AcceptsNotApplicable(t *testing.T) {
	if got := normalizeCheckResultStatus("not_applicable"); got != "not_applicable" {
		t.Errorf("normalizeCheckResultStatus(not_applicable) = %q，want not_applicable（当前被 default 转成 fail）", got)
	}
}

// TestNormalizeCheckResultStatus_KeepsExistingSemantics 新增枚举不得改动既有语义：
// error 仍归并为 fail，未知值仍兜底为 fail。
func TestNormalizeCheckResultStatus_KeepsExistingSemantics(t *testing.T) {
	cases := map[string]string{
		"pass":    "pass",
		"fail":    "fail",
		"warning": "warning",
		"skip":    "skip",
		"error":   "fail",
		"":        "fail",
		"garbage": "fail",
		"PASS":    "pass",
		" skip ":  "skip",
	}
	for raw, want := range cases {
		if got := normalizeCheckResultStatus(raw); got != want {
			t.Errorf("normalizeCheckResultStatus(%q) = %q，want %q", raw, got, want)
		}
	}
}
