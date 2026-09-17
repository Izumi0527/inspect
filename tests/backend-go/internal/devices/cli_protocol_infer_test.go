package devices_test

import (
	"testing"
	_ "unsafe"

	"github.com/your-org/inspect-system/backend-go/internal/devices"
)

// resolveCliProtocol 决定新建设备落库的 cli_protocol。
//
//go:linkname resolveCliProtocol github.com/your-org/inspect-system/backend-go/internal/devices.resolveCliProtocol
func resolveCliProtocol(req devices.DeviceCreateRequest) string

// 批量导入曾只传 ssh_username/ssh_password 而不带 cli_protocol，后端一律落成 none，
// 导致有 SSH 凭据的设备巡检时不走 CLI；再经编辑表单保存时（表单按 none 提交
// ssh_username=null）连用户名也被抹掉。此处锁定：未显式给协议时按凭据推断。
func TestResolveCliProtocol(t *testing.T) {
	cases := []struct {
		name string
		req  devices.DeviceCreateRequest
		want string
	}{
		{name: "显式 ssh 原样保留", req: devices.DeviceCreateRequest{CliProtocol: strPtr("SSH")}, want: "ssh"},
		{name: "显式 none 即使带凭据也尊重", req: devices.DeviceCreateRequest{CliProtocol: strPtr("none"), SshUsername: strPtr("admin")}, want: "none"},
		{name: "缺省且有 SSH 用户名推断 ssh", req: devices.DeviceCreateRequest{SshUsername: strPtr("admin")}, want: "ssh"},
		{name: "缺省且有 Telnet 用户名推断 telnet", req: devices.DeviceCreateRequest{TelnetUsername: strPtr("admin")}, want: "telnet"},
		{name: "SSH 与 Telnet 同时存在优先 ssh", req: devices.DeviceCreateRequest{SshUsername: strPtr("a"), TelnetUsername: strPtr("b")}, want: "ssh"},
		{name: "空白协议字符串视为缺省", req: devices.DeviceCreateRequest{CliProtocol: strPtr("  "), SshUsername: strPtr("admin")}, want: "ssh"},
		{name: "只有空白用户名不推断", req: devices.DeviceCreateRequest{SshUsername: strPtr("  ")}, want: "none"},
		{name: "全部缺省落 none", req: devices.DeviceCreateRequest{}, want: "none"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := resolveCliProtocol(tc.req); got != tc.want {
				t.Fatalf("resolveCliProtocol() = %q, want %q", got, tc.want)
			}
		})
	}
}
