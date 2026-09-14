package devices_test

import (
	"testing"
	_ "unsafe"
)

// classifyDeviceType 根据 SNMP 信号推断设备类型。
//
//go:linkname classifyDeviceType github.com/your-org/inspect-system/backend-go/internal/devices.classifyDeviceType
func classifyDeviceType(sysDescr string, model string, sysServices int, lldpCaps []byte) string

// TestClassifyDeviceType 按信号优先级表驱动验证分类规则。
//
// 优先级：防火墙产品线关键字 > LLDP 本地能力位 > 路由/交换/AP 产品线关键字 > sysServices 位图。
// 防火墙没有标准能力位，只能靠产品线，且必须排在能力位前面——防火墙对外
// 也常宣告 bridge/router 能力，先看能力位会把它归成交换机。
func TestClassifyDeviceType(t *testing.T) {
	cases := []struct {
		name        string
		sysDescr    string
		model       string
		sysServices int
		lldpCaps    []byte
		want        string
	}{
		{
			name:     "华为 USG 防火墙：关键字优先于 bridge 能力位",
			sysDescr: "Huawei Versatile Security Gateway USG6300",
			model:    "USG6300",
			lldpCaps: []byte{0x20},
			want:     "firewall",
		},
		{
			name:     "H3C SecPath 防火墙",
			sysDescr: "H3C SecPath F1000-AI-55",
			model:    "SecPath F1000-AI-55",
			want:     "firewall",
		},
		{
			name:     "LLDP bridge+router 归交换机（三层交换机）",
			lldpCaps: []byte{0x28},
			want:     "switch",
		},
		{
			name:     "LLDP 仅 router 归路由器",
			lldpCaps: []byte{0x08},
			want:     "router",
		},
		{
			name:     "LLDP wlanAccessPoint 归 AP",
			lldpCaps: []byte{0x10},
			want:     "ap",
		},
		{
			name:  "华为 AR 路由器按型号首 token 识别",
			model: "AR2220",
			want:  "router",
		},
		{
			name:     "华为交换机 sysDescr 含 Routing Platform 不能被带偏",
			sysDescr: "S5700-28C-HI Huawei Versatile Routing Platform Software VRP (R) software",
			want:     "switch",
		},
		{
			name:     "sysDescr 首 token 是厂商名时看 model",
			sysDescr: "Cisco IOS Software, C2960 Software",
			model:    "WS-C2960-24TT-L",
			want:     "switch",
		},
		{
			name:        "sysServices 含 L2 归交换机",
			sysServices: 6,
			want:        "switch",
		},
		{
			name:        "sysServices 仅 L3 归路由器",
			sysServices: 4,
			want:        "router",
		},
		{
			name:        "sysServices 仅 L7（主机）不识别",
			sysServices: 72,
			want:        "",
		},
		{
			name: "全部信号为空返回空串",
			want: "",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := classifyDeviceType(tc.sysDescr, tc.model, tc.sysServices, tc.lldpCaps)
			if got != tc.want {
				t.Fatalf("classifyDeviceType() = %q, want %q", got, tc.want)
			}
		})
	}
}
