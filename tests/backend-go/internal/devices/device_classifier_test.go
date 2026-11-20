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
			name:     "CloudEngine S5755 V600 sysDescr 自动识别为 switch",
			sysDescr: "Huawei Versatile Routing Platform Software\r\nVRP (R) software, Version 8.230 (CloudEngine S5755-H48T4XC V600R023C00SPC500)",
			want:     "switch",
		},
		{
			name:     "CloudEngine S5736-S 首行 sysDescr 识别为 switch",
			sysDescr: "CloudEngine S5736-S24S4XC\r\nHuawei Versatile Routing Platform Software\r\nVRP (R) software, Version 5.170 (S5736-S V200R021C00SPC100)",
			want:     "switch",
		},
		{
			name:     "CloudEngine S16700-8 框式核心识别为 switch",
			sysDescr: "CloudEngine S16700-8\r\nVRP (R) software, Version 8.240 (S16700-8 V600R024C00SPC500)",
			want:     "switch",
		},
		{
			name:  "CloudEngine S5755 model 带品牌前缀识别为 switch",
			model: "CloudEngine S5755-H48T4XC",
			want:  "switch",
		},
		{
			name:  "S5736-S24UM4XC 识别为 switch",
			model: "S5736-S24UM4XC",
			want:  "switch",
		},
		{
			name:  "S300-24T4S 识别为 switch",
			model: "S300-24T4S",
			want:  "switch",
		},
		{
			name:  "S310-24T4X 识别为 switch",
			model: "S310-24T4X",
			want:  "switch",
		},
		{
			name:  "S500-48T4X 识别为 switch",
			model: "S500-48T4X",
			want:  "switch",
		},
		{
			name:  "S530-48T4XE 识别为 switch",
			model: "S530-48T4XE",
			want:  "switch",
		},
		{
			name:  "S620-24T16X8Y 识别为 switch",
			model: "S620-24T16X8Y",
			want:  "switch",
		},
		{
			name:  "S1730S-S24T4S-A 识别为 switch",
			model: "S1730S-S24T4S-A",
			want:  "switch",
		},
		{
			name:  "S2730S-S24FT4S-A 识别为 switch",
			model: "S2730S-S24FT4S-A",
			want:  "switch",
		},
		{
			name:  "S5731-H24T4XC 识别为 switch",
			model: "S5731-H24T4XC",
			want:  "switch",
		},
		{
			name:  "S5732-H24UM2CC 识别为 switch",
			model: "S5732-H24UM2CC",
			want:  "switch",
		},
		{
			name:  "S5735-S24T4XE-V2 识别为 switch",
			model: "S5735-S24T4XE-V2",
			want:  "switch",
		},
		{
			name:  "S6730-H24X6C-V2 识别为 switch",
			model: "S6730-H24X6C-V2",
			want:  "switch",
		},
		{
			name:  "S6735-S48X6C 识别为 switch",
			model: "S6735-S48X6C",
			want:  "switch",
		},
		{
			name:  "S6750-H24X8C 识别为 switch",
			model: "S6750-H24X8C",
			want:  "switch",
		},
		{
			name:  "S7706 识别为 switch",
			model: "S7706",
			want:  "switch",
		},
		{
			name:  "S8700-6 识别为 switch",
			model: "S8700-6",
			want:  "switch",
		},
		{
			name:  "S12700E-8 识别为 switch",
			model: "S12700E-8",
			want:  "switch",
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
