package devices_test

import (
	"testing"
	_ "unsafe"

	"github.com/your-org/inspect-system/backend-go/internal/devices"
	"github.com/your-org/inspect-system/backend-go/internal/snmpmib"
)

//go:linkname parseDeviceIdentityFromSysDescr github.com/your-org/inspect-system/backend-go/internal/devices.parseDeviceIdentityFromSysDescr
func parseDeviceIdentityFromSysDescr(sysDescr string) (string, string)

//go:linkname sanitizeIdentityValue github.com/your-org/inspect-system/backend-go/internal/devices.sanitizeIdentityValue
func sanitizeIdentityValue(value string) string

//go:linkname collectDeviceIdentityWithContext github.com/your-org/inspect-system/backend-go/internal/devices.(*SNMPCollector).collectDeviceIdentityWithContext
func collectDeviceIdentityWithContext(
	collector *devices.SNMPCollector,
	target collectorSNMPClient,
	metrics *devices.SNMPMetrics,
	registry *snmpmib.Registry,
	cachedSysDescr string,
	sysDescrCached bool,
	cachedSysObjectID string,
	sysObjectIDCached bool,
)

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
			name:        "华为 V600：括号内含 CloudEngine 前缀",
			sysDescr:    "Huawei Versatile Routing Platform Software\r\nVRP (R) software, Version 8.230 (CloudEngine S5755-H48T4XC V600R023C00SPC500)",
			wantModel:   "S5755-H48T4XC",
			wantVersion: "V600R023C00SPC500",
		},
		{
			name:        "华为 S5736-S：首行带 CloudEngine 前缀 + V200",
			sysDescr:    "CloudEngine S5736-S24S4XC\r\nHuawei Versatile Routing Platform Software\r\nVRP (R) software, Version 5.170 (S5736-S V200R021C00SPC100)",
			wantModel:   "S5736-S24S4XC",
			wantVersion: "V200R021C00SPC100",
		},
		{
			name:        "华为 S5736-S：单行化后仍正确剥离 CloudEngine 前缀",
			sysDescr:    "CloudEngine S5736-S24UM4XC   Huawei Versatile Routing Platform Software   VRP (R) software, Version 8.220 (CloudEngine S5736-S24UM4XC V600R022C00SPC500)",
			wantModel:   "S5736-S24UM4XC",
			wantVersion: "V600R022C00SPC500",
		},
		{
			name:        "华为 S16700-8 框式核心：首行带 CloudEngine 前缀 + V600",
			sysDescr:    "CloudEngine S16700-8\r\nVRP (R) software, Version 8.240 (S16700-8 V600R024C00SPC500)",
			wantModel:   "S16700-8",
			wantVersion: "V600R024C00SPC500",
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

func TestExtractPatchVersion(t *testing.T) {
	tests := []struct {
		name            string
		sysDescr        string
		firmwareVersion string
		wantPatch       string
	}{
		{
			name:            "显式声明补丁版本优先",
			sysDescr:        "Huawei Versatile Routing Platform Software\r\nPatch Version: V200R019SPH020",
			firmwareVersion: "V200R019C00SPC500",
			wantPatch:       "V200R019SPH020",
		},
		{
			name:            "显式声明中文补丁",
			sysDescr:        "补丁版本：HP001",
			firmwareVersion: "",
			wantPatch:       "HP001",
		},
		{
			name:            "华为 VRP 固件版本内嵌补丁号 SPC500",
			sysDescr:        "",
			firmwareVersion: "V200R019C00SPC500",
			wantPatch:       "SPC500",
		},
		{
			name:            "H3C Release 内嵌补丁号 P08",
			sysDescr:        "H3C Comware Software, Version 7.1.070, Release 2612P08",
			firmwareVersion: "Release 2612P08",
			wantPatch:       "P08",
		},
		{
			name:            "锐捷 RGOS 内嵌补丁号 P2",
			sysDescr:        "Ruijie Networks RGOS 11.4(1)B42P2",
			firmwareVersion: "11.4(1)B42P2",
			wantPatch:       "P2",
		},
		{
			name:            "独立热补丁 token",
			sysDescr:        "Huawei VRP Software SPH020",
			firmwareVersion: "",
			wantPatch:       "SPH020",
		},
		{
			name:            "无补丁固件版本返回空串",
			sysDescr:        "Huawei Versatile Routing Platform Software V200R001C00",
			firmwareVersion: "V200R001C00",
			wantPatch:       "",
		},
		{
			name:            "显式为 none 返回空串",
			sysDescr:        "Patch version: None",
			firmwareVersion: "V200R001C00",
			wantPatch:       "",
		},
		{
			name:            "显式为“无”返回空串",
			sysDescr:        "补丁: 无",
			firmwareVersion: "",
			wantPatch:       "",
		},
		{
			name:            "华为 V600 sysDescr 内嵌补丁号 SPC500",
			sysDescr:        "Huawei Versatile Routing Platform Software\r\nVRP (R) software, Version 8.230 (CloudEngine S5755-H48T4XC V600R023C00SPC500)",
			firmwareVersion: "V600R023C00SPC500",
			wantPatch:       "SPC500",
		},
		{
			name:            "空输入返回空串",
			sysDescr:        "",
			firmwareVersion: "",
			wantPatch:       "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := devices.ExtractPatchVersion(tt.sysDescr, tt.firmwareVersion)
			if got != tt.wantPatch {
				t.Errorf("ExtractPatchVersion(%q, %q) = %q, 期望 %q", tt.sysDescr, tt.firmwareVersion, got, tt.wantPatch)
			}
		})
	}
}

func TestDetectHuaweiPlatform(t *testing.T) {
	tests := []struct {
		name     string
		version  string
		sysDescr string
		want     string
	}{
		{
			name:     "V600 版本串优先识别",
			version:  "V600R023C00SPC500",
			sysDescr: "",
			want:     "V600",
		},
		{
			name:     "V200 版本串识别",
			version:  "V200R021C00SPC100",
			sysDescr: "",
			want:     "V200",
		},
		{
			name:     "仅 sysDescr 含 V600",
			version:  "",
			sysDescr: "Huawei Versatile Routing Platform Software\r\nVRP (R) software, Version 8.230 (CloudEngine S5755-H48T4XC V600R023C00SPC500)",
			want:     "V600",
		},
		{
			name:     "仅 sysDescr 含 V200",
			version:  "",
			sysDescr: "CloudEngine S5736-S24S4XC\r\nHuawei Versatile Routing Platform Software\r\nVRP (R) software, Version 5.170 (S5736-S V200R021C00SPC100)",
			want:     "V200",
		},
		{
			name:     "非华为设备返回空串",
			version:  "12.2(55)SE",
			sysDescr: "Cisco IOS Software, C2960 Software (C2960-LANBASEK9-M), Version 12.2",
			want:     "",
		},
		{
			name:     "空输入返回空串",
			version:  "",
			sysDescr: "",
			want:     "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := devices.DetectHuaweiPlatform(tt.version, tt.sysDescr); got != tt.want {
				t.Errorf("DetectHuaweiPlatform(%q, %q) = %q, want %q", tt.version, tt.sysDescr, got, tt.want)
			}
		})
	}
}

func TestCollectDeviceIdentityWithContext_SysObjectIDFallback(t *testing.T) {
	registry, err := snmpmib.DefaultRegistry()
	if err != nil {
		t.Fatalf("DefaultRegistry() error = %v", err)
	}
	collector := devices.NewSNMPCollectorWithRegistry(nil, registry)

	t.Run("ENTITY-MIB 与 sysDescr 缺失型号时通过 sysObjectID 兜底", func(t *testing.T) {
		metrics := &devices.SNMPMetrics{}
		client := &fakeCollectorSNMPClient{}
		collectDeviceIdentityWithContext(
			collector,
			client,
			metrics,
			registry,
			"Huawei Versatile Routing Platform Software V200R022C00",
			true,
			".1.3.6.1.4.1.2011.2.23.781",
			true,
		)
		if metrics.Model == nil || *metrics.Model != "S6730" {
			t.Fatalf("Model = %v, want S6730", metrics.Model)
		}
		if metrics.FirmwareVersion == nil || *metrics.FirmwareVersion != "V200R022C00" {
			t.Fatalf("FirmwareVersion = %v, want V200R022C00", metrics.FirmwareVersion)
		}
	})

	t.Run("通用根分支 .2011.2.23 不得盲目猜型号", func(t *testing.T) {
		metrics := &devices.SNMPMetrics{}
		client := &fakeCollectorSNMPClient{}
		collectDeviceIdentityWithContext(
			collector,
			client,
			metrics,
			registry,
			"Huawei Versatile Routing Platform Software V200R022C00",
			true,
			"1.3.6.1.4.1.2011.2.23",
			true,
		)
		if metrics.Model != nil {
			t.Fatalf("Model = %q, want nil for generic root OID", *metrics.Model)
		}
	})
}
