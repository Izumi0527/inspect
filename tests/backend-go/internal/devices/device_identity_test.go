package devices_test

import (
	"testing"
	_ "unsafe"

	_ "github.com/your-org/inspect-system/backend-go/internal/devices"
)

//go:linkname parseDeviceIdentityFromSysDescr github.com/your-org/inspect-system/backend-go/internal/devices.parseDeviceIdentityFromSysDescr
func parseDeviceIdentityFromSysDescr(sysDescr string) (string, string)

//go:linkname sanitizeIdentityValue github.com/your-org/inspect-system/backend-go/internal/devices.sanitizeIdentityValue
func sanitizeIdentityValue(value string) string

// sysDescr 是厂商自由文本，解析必须"宁可留空不可猜错"——
// 设备档案里一个猜错的型号比空值更有害。
func TestParseDeviceIdentityFromSysDescr(t *testing.T) {
	tests := []struct {
		name        string
		sysDescr    string
		wantModel   string
		wantVersion string
	}{
		{
			name:        "华为 S5700-28C-HI 真机：首行完整型号优先于括号内系列简称",
			sysDescr:    "S5700-28C-HI \r\nHuawei Versatile Routing Platform Software \r\n VRP (R) software,Version 3.30 (S5700 V200R001C00) \r\n Copyright (C) 2007 Huawei Technologies Co., Ltd.",
			wantModel:   "S5700-28C-HI",
			wantVersion: "V200R001C00",
		},
		{
			// 生产路径上 sysDescr 会先过 formatSNMPValue，换行被压成空格，
			// 解析必须对这种"单行化"形态同样成立——最初漏了这一层导致线上仍取到简称。
			name:        "华为真机经 formatSNMPValue 单行化后仍取完整型号",
			sysDescr:    "S5700-28C-HI   Huawei Versatile Routing Platform Software    VRP (R) software,Version 3.30 (S5700 V200R001C00)   Copyright (C) 2007 Huawei Technologies Co., Ltd.",
			wantModel:   "S5700-28C-HI",
			wantVersion: "V200R001C00",
		},
		{
			name:        "华为 VRP：括号内型号与版本成对出现",
			sysDescr:    "Huawei Versatile Routing Platform Software VRP (R) software, Version 5.170 (S5700-28P-LI-AC V200R019C00SPC500) Copyright (C) 2007 Huawei Technologies Co., Ltd.",
			wantModel:   "S5700-28P-LI-AC",
			wantVersion: "V200R019C00SPC500",
		},
		{
			name:        "首行是无板型后缀的普通单词时不当型号",
			sysDescr:    "Huawei\r\nVersatile Routing Platform Software V200R010C00SPC300",
			wantModel:   "",
			wantVersion: "V200R010C00SPC300",
		},
		{
			name:        "华为 VRP：无括号配对时只回填 VRP 版本号",
			sysDescr:    "Huawei Versatile Routing Platform Software VRP (R) software V200R010C00SPC300 running on AR2220",
			wantModel:   "",
			wantVersion: "V200R010C00SPC300",
		},
		{
			name:        "Cisco IOS：无 VRP 版本，回退通用 Version 字段",
			sysDescr:    "Cisco IOS Software, C2960 Software (C2960-LANBASEK9-M), Version 12.2, RELEASE SOFTWARE (fc1)",
			wantModel:   "",
			wantVersion: "12.2",
		},
		{
			name:        "无可信信息时全部留空",
			sysDescr:    "Linux gateway 5.15.0 x86_64",
			wantModel:   "",
			wantVersion: "",
		},
		{
			name:        "空串返回空",
			sysDescr:    "   ",
			wantModel:   "",
			wantVersion: "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			model, version := parseDeviceIdentityFromSysDescr(tt.sysDescr)
			if model != tt.wantModel {
				t.Errorf("model = %q, 期望 %q", model, tt.wantModel)
			}
			if version != tt.wantVersion {
				t.Errorf("version = %q, 期望 %q", version, tt.wantVersion)
			}
		})
	}
}

// entPhysicalSoftwareRev 等字段常带描述性前缀，展示前需剥离但不得丢信息。
func TestSanitizeIdentityValue(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{"剥离 Version 前缀（华为 S5700 实测值）", "Version 3.30 V200R001C00", "3.30 V200R001C00"},
		{"剥离 Software Version 前缀", "Software Version: V300R019", "V300R019"},
		{"剥离 Ver 前缀", "Ver 1.2.3", "1.2.3"},
		{"无前缀时原样返回", "V200R019C00SPC500", "V200R019C00SPC500"},
		{"仅有前缀词时保留原值，不抹成空", "Version", "Version"},
		{"两侧空白被裁剪", "  S5700-28P  ", "S5700-28P"},
		{"空串返回空", "   ", ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := sanitizeIdentityValue(tt.input); got != tt.want {
				t.Errorf("sanitizeIdentityValue(%q) = %q, 期望 %q", tt.input, got, tt.want)
			}
		})
	}
}
