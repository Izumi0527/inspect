package authz_test

import (
	"testing"

	"github.com/your-org/inspect-system/backend-go/internal/authz"
)

func TestNormalizePermissionKey(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want string
	}{
		{name: "空值", in: "", want: ""},
		{name: "空白", in: "   ", want: ""},
		{name: "已经规范化", in: "devices:read", want: "devices:read"},
		{name: "大小写与空白", in: "  DEVICE:READ  ", want: "devices:read"},
		{name: "单数设备映射为复数", in: "device:read", want: "devices:read"},
		{name: "单数告警映射为复数", in: "alert:update", want: "alerts:update"},
		{name: "单数报表映射为复数", in: "report:delete", want: "reports:delete"},
		{name: "监控保持不变", in: "monitoring:export", want: "monitoring:export"},
		{name: "系统权限保持不变", in: "system:logs", want: "system:logs"},
		{name: "无冒号则仅做规范化", in: "Device", want: "device"},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := authz.NormalizePermissionKey(tc.in)
			if got != tc.want {
				t.Fatalf("NormalizePermissionKey(%q)=%q, want=%q", tc.in, got, tc.want)
			}
		})
	}
}

func TestNormalizePermissionKeys_DeduplicateAndSort(t *testing.T) {
	in := []string{
		"devices:read",
		"device:read",
		"alert:read",
		"alerts:read",
		"  ",
		"reports:read",
		"report:read",
	}

	got := authz.NormalizePermissionKeys(in)
	want := []string{"alerts:read", "devices:read", "reports:read"}

	if len(got) != len(want) {
		t.Fatalf("NormalizePermissionKeys len=%d, want=%d, got=%v", len(got), len(want), got)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("NormalizePermissionKeys[%d]=%q, want=%q, got=%v", i, got[i], want[i], got)
		}
	}
}

