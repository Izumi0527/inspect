package devices_test

import (
	"strings"
	"testing"
	_ "unsafe"

	"github.com/gosnmp/gosnmp"
	"github.com/your-org/inspect-system/backend-go/internal/devices"
	"github.com/your-org/inspect-system/backend-go/internal/snmpmib"
)

//go:linkname parseDeviceIdentityFromSysDescr github.com/your-org/inspect-system/backend-go/internal/devices.parseDeviceIdentityFromSysDescr
func parseDeviceIdentityFromSysDescr(sysDescr string) (string, string)

//go:linkname sanitizeIdentityValue github.com/your-org/inspect-system/backend-go/internal/devices.sanitizeIdentityValue
func sanitizeIdentityValue(value string) string

//go:linkname sanitizeSerialNumber github.com/your-org/inspect-system/backend-go/internal/devices.sanitizeSerialNumber
func sanitizeSerialNumber(value string) string

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

func TestSanitizeSerialNumber(t *testing.T) {
	tests := []struct {
		name  string
		input string
		want  string
	}{
		{"正常序列号", "210235A1B2C3D4000001", "210235A1B2C3D4000001"},
		{"首尾 NUL 填充应清洗通过", "210235A1B2C3\x00\x00", "210235A1B2C3"},
		{"首尾 NUL 与空白联合填充应清洗通过", "\x00 210235A1B2C3 \t\x00\x00", "210235A1B2C3"},
		{"中间 NUL 应被控制字符检查拒绝", "SN\x00123", ""},
		{"允许合法分隔符与空格", "SN-2026_01.A", "SN-2026_01.A"},
		{"占位符 none 忽略大小写", "None", ""},
		{"占位符 null", "NULL", ""},
		{"占位符 n/a", "N/A", ""},
		{"占位符 na", "na", ""},
		{"占位符 nil", "nil", ""},
		{"占位符 unknown", "Unknown", ""},
		{"占位符 default", "Default", ""},
		{"占位符 not applicable", "Not Applicable", ""},
		{"占位符 oem", "To be filled by O.E.M.", ""},
		{"占位符 empty", "EMPTY", ""},
		{"占位符 uninitialized", "uninitialized", ""},
		{"占位符 中文无", "无", ""},
		{"全 0 伪值", "00000000", ""},
		{"全横线伪值", "---", ""},
		{"全分隔符 IP 伪值", "0.0.0.0", ""},
		{"全下划线空格伪值", " _ _ ", ""},
		{"过短拒绝 (<3)", "AB", ""},
		{"最小合法长度 (3)", "ABC", "ABC"},
		{"最大合法长度 (128)", strings.Repeat("A", 128), strings.Repeat("A", 128)},
		{"超长拒绝 (>128)", strings.Repeat("A", 129), ""},
		{"控制字符拒绝", "SN\x07123", ""},
		{"换行符拒绝", "SN\n123", ""},
		{"非 ASCII 字符拒绝", "序列号123", ""},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := sanitizeSerialNumber(tt.input); got != tt.want {
				t.Errorf("sanitizeSerialNumber(%q) = %q, want %q", tt.input, got, tt.want)
			}
		})
	}
}

func TestCollectDeviceIdentityWithContext_SerialNumber(t *testing.T) {
	registry, err := snmpmib.DefaultRegistry()
	if err != nil {
		t.Fatalf("DefaultRegistry() error = %v", err)
	}
	collector := devices.NewSNMPCollectorWithRegistry(nil, registry)
	serialOID := registry.Common.System.EntPhysicalSerialNum.OID
	classOID := registry.Common.System.EntPhysicalClass.OID

	strPDU := func(base string, idx string, val string) gosnmp.SnmpPDU {
		return gosnmp.SnmpPDU{Name: "." + base + "." + idx, Type: gosnmp.OctetString, Value: []byte(val)}
	}
	intPDU := func(base string, idx string, val int) gosnmp.SnmpPDU {
		return gosnmp.SnmpPDU{Name: "." + base + "." + idx, Type: gosnmp.Integer, Value: val}
	}

	t.Run("chassis(3) 优先于 port/fan/powerSupply/module，即便索引更大", func(t *testing.T) {
		metrics := &devices.SNMPMetrics{}
		client := &fakeCollectorSNMPClient{
			bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
				serialOID: {
					strPDU(serialOID, "2", "SFP-PORT-01"),
					strPDU(serialOID, "3", "FAN-SN-01"),
					strPDU(serialOID, "4", "PSU-SN-01"),
					strPDU(serialOID, "5", "MOD-SN-01"),
					strPDU(serialOID, "9", "CHASSIS-SN-99"),
				},
				classOID: {
					intPDU(classOID, "2", 10),
					intPDU(classOID, "3", 7),
					intPDU(classOID, "4", 6),
					intPDU(classOID, "5", 9),
					intPDU(classOID, "9", 3),
				},
			},
		}
		collectDeviceIdentityWithContext(collector, client, metrics, registry, "sys", true, "", true)
		if metrics.SerialNumber == nil || *metrics.SerialNumber != "CHASSIS-SN-99" {
			t.Fatalf("SerialNumber = %v, want CHASSIS-SN-99", metrics.SerialNumber)
		}
	})

	t.Run("chassis 为空时按 stack(11) -> module(9) -> backplane(4) 优先级回退", func(t *testing.T) {
		cases := []struct {
			name    string
			serials []gosnmp.SnmpPDU
			classes []gosnmp.SnmpPDU
			want    string
		}{
			{
				name: "stack(11) 优先于 module(9)",
				serials: []gosnmp.SnmpPDU{
					strPDU(serialOID, "1", "MOD-SN-1"),
					strPDU(serialOID, "2", "STACK-SN-2"),
				},
				classes: []gosnmp.SnmpPDU{
					intPDU(classOID, "1", 9),
					intPDU(classOID, "2", 11),
				},
				want: "STACK-SN-2",
			},
			{
				name: "module(9) 优先于 backplane(4)",
				serials: []gosnmp.SnmpPDU{
					strPDU(serialOID, "1", "BP-SN-1"),
					strPDU(serialOID, "3", "MOD-SN-3"),
				},
				classes: []gosnmp.SnmpPDU{
					intPDU(classOID, "1", 4),
					intPDU(classOID, "3", 9),
				},
				want: "MOD-SN-3",
			},
			{
				name: "backplane(4) 优先于 other(1)",
				serials: []gosnmp.SnmpPDU{
					strPDU(serialOID, "1", "OTHER-SN-1"),
					strPDU(serialOID, "2", "BP-SN-2"),
				},
				classes: []gosnmp.SnmpPDU{
					intPDU(classOID, "1", 1),
					intPDU(classOID, "2", 4),
				},
				want: "BP-SN-2",
			},
		}
		for _, tc := range cases {
			t.Run(tc.name, func(t *testing.T) {
				metrics := &devices.SNMPMetrics{}
				client := &fakeCollectorSNMPClient{
					bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
						serialOID: tc.serials,
						classOID:  tc.classes,
					},
				}
				collectDeviceIdentityWithContext(collector, client, metrics, registry, "sys", true, "", true)
				if metrics.SerialNumber == nil || *metrics.SerialNumber != tc.want {
					t.Fatalf("SerialNumber = %v, want %s", metrics.SerialNumber, tc.want)
				}
			})
		}
	})

	t.Run("仅外设(port/fan/psu/cpu)有序列号时不误取", func(t *testing.T) {
		metrics := &devices.SNMPMetrics{}
		client := &fakeCollectorSNMPClient{
			bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
				serialOID: {
					strPDU(serialOID, "1", "PORT-SN-1"),
					strPDU(serialOID, "2", "FAN-SN-2"),
					strPDU(serialOID, "3", "PSU-SN-3"),
					strPDU(serialOID, "4", "CPU-SN-4"),
				},
				classOID: {
					intPDU(classOID, "1", 10),
					intPDU(classOID, "2", 7),
					intPDU(classOID, "3", 6),
					intPDU(classOID, "4", 12),
				},
			},
		}
		collectDeviceIdentityWithContext(collector, client, metrics, registry, "sys", true, "", true)
		if metrics.SerialNumber != nil {
			t.Fatalf("SerialNumber = %q, want nil when only peripheral serials exist", *metrics.SerialNumber)
		}
	})

	t.Run("entPhysicalClass 不可读时按最小索引兜底", func(t *testing.T) {
		metrics := &devices.SNMPMetrics{}
		client := &fakeCollectorSNMPClient{
			bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
				serialOID: {
					strPDU(serialOID, "10", "SN-INDEX-10"),
					strPDU(serialOID, "2", "SN-INDEX-02"),
					strPDU(serialOID, "5", "SN-INDEX-05"),
				},
			},
		}
		collectDeviceIdentityWithContext(collector, client, metrics, registry, "sys", true, "", true)
		if metrics.SerialNumber == nil || *metrics.SerialNumber != "SN-INDEX-02" {
			t.Fatalf("SerialNumber = %v, want SN-INDEX-02", metrics.SerialNumber)
		}
	})

	t.Run("多 chassis 堆叠按最小索引确定性选择", func(t *testing.T) {
		metrics := &devices.SNMPMetrics{}
		client := &fakeCollectorSNMPClient{
			bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
				serialOID: {
					strPDU(serialOID, "12", "CHASSIS-SLOT-2"),
					strPDU(serialOID, "4", "CHASSIS-SLOT-1"),
				},
				classOID: {
					intPDU(classOID, "12", 3),
					intPDU(classOID, "4", 3),
				},
			},
		}
		collectDeviceIdentityWithContext(collector, client, metrics, registry, "sys", true, "", true)
		if metrics.SerialNumber == nil || *metrics.SerialNumber != "CHASSIS-SLOT-1" {
			t.Fatalf("SerialNumber = %v, want CHASSIS-SLOT-1", metrics.SerialNumber)
		}
	})

	t.Run("entPhysicalSerialNum 为空或不合法时不触发 entPhysicalClass walk", func(t *testing.T) {
		metrics := &devices.SNMPMetrics{}
		client := &fakeCollectorSNMPClient{
			bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
				serialOID: {
					strPDU(serialOID, "1", "N/A"),
					strPDU(serialOID, "2", "000000"),
				},
			},
		}
		collectDeviceIdentityWithContext(collector, client, metrics, registry, "sys", true, "", true)
		if metrics.SerialNumber != nil {
			t.Fatalf("SerialNumber = %q, want nil", *metrics.SerialNumber)
		}
		for _, calledOID := range client.bulkWalkCalls {
			if calledOID == classOID {
				t.Fatalf("unexpected BulkWalkAll(%s) when no valid serial candidates exist", classOID)
			}
		}
	})

	t.Run("真实 OctetString []byte 路径直接拦截控制字符与非 ASCII，保留首尾 NUL 合法串", func(t *testing.T) {
		dirtyCases := []struct {
			name string
			raw  []byte
		}{
			{"BEL 控制字符", []byte("SN\x07123")},
			{"换行控制字符", []byte("SN\n123")},
			{"中间 NUL 字节", []byte("SN\x00123")},
			{"非 ASCII 中文", []byte("序列号123")},
			{"首尾二进制脏字节", []byte{0x01, 'A', 'B', 'C', 0xff}},
		}
		for _, tc := range dirtyCases {
			t.Run(tc.name, func(t *testing.T) {
				metrics := &devices.SNMPMetrics{}
				client := &fakeCollectorSNMPClient{
					bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
						serialOID: {
							{Name: "." + serialOID + ".1", Type: gosnmp.OctetString, Value: tc.raw},
						},
					},
				}
				collectDeviceIdentityWithContext(collector, client, metrics, registry, "sys", true, "", true)
				if metrics.SerialNumber != nil {
					t.Fatalf("SerialNumber = %q, want nil for dirty []byte %v", *metrics.SerialNumber, tc.raw)
				}
				for _, calledOID := range client.bulkWalkCalls {
					if calledOID == classOID {
						t.Fatalf("unexpected BulkWalkAll(%s) when dirty []byte candidate rejected", classOID)
					}
				}
			})
		}

		metrics := &devices.SNMPMetrics{}
		client := &fakeCollectorSNMPClient{
			bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
				serialOID: {
					{Name: "." + serialOID + ".1", Type: gosnmp.OctetString, Value: []byte("210235A1B2C3\x00\x00")},
				},
				classOID: {
					intPDU(classOID, "1", 3),
				},
			},
		}
		collectDeviceIdentityWithContext(collector, client, metrics, registry, "sys", true, "", true)
		if metrics.SerialNumber == nil || *metrics.SerialNumber != "210235A1B2C3" {
			t.Fatalf("SerialNumber = %v, want 210235A1B2C3", metrics.SerialNumber)
		}
	})
}

func TestCollectDeviceIdentityWithContext_HuaweiELabel3ModelFallback(t *testing.T) {
	registry, err := snmpmib.DefaultRegistry()
	if err != nil {
		t.Fatalf("DefaultRegistry() error = %v", err)
	}
	collector := devices.NewSNMPCollectorWithRegistry(nil, registry)
	modelOID := registry.Common.System.EntPhysicalModelName.OID
	boardTypeOID := "1.3.6.1.4.1.2011.5.25.31.1.1.2.1.11"
	hwModelOID := "1.3.6.1.4.1.2011.5.25.31.1.1.2.1.13"
	boardNameOID := "1.3.6.1.4.1.2011.5.25.31.1.1.1.1.43"

	strPDU := func(base, idx, val string) gosnmp.SnmpPDU {
		return gosnmp.SnmpPDU{Name: "." + base + "." + idx, Type: gosnmp.OctetString, Value: []byte(val)}
	}

	t.Run("entPhysicalModelName 为通用占位词时回退 hwEntityBoardType", func(t *testing.T) {
		metrics := &devices.SNMPMetrics{}
		client := &fakeCollectorSNMPClient{
			bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
				modelOID:     {strPDU(modelOID, "1", "Switch")},
				boardTypeOID: {strPDU(boardTypeOID, "1", "Chassis"), strPDU(boardTypeOID, "2", "S5736-S48U4XC")},
				hwModelOID:   {strPDU(hwModelOID, "2", "S5736-Fallback")},
			},
		}
		collectDeviceIdentityWithContext(collector, client, metrics, registry, "Huawei Versatile Routing Platform Software", true, ".1.3.6.1.4.1.2011.2.23.982", true)
		if metrics.Model == nil || *metrics.Model != "S5736-S48U4XC" {
			t.Fatalf("Model = %v, want S5736-S48U4XC", metrics.Model)
		}
	})

	t.Run("hwEntityBoardType 为空时回退 hwEntityModel 与 hwEntityBoardName", func(t *testing.T) {
		metrics := &devices.SNMPMetrics{}
		client := &fakeCollectorSNMPClient{
			bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
				hwModelOID: {strPDU(hwModelOID, "1", "S5736-S24T4XC")},
			},
		}
		collectDeviceIdentityWithContext(collector, client, metrics, registry, "", true, ".1.3.6.1.4.1.2011.2.23.816", true)
		if metrics.Model == nil || *metrics.Model != "S5736-S24T4XC" {
			t.Fatalf("Model = %v, want S5736-S24T4XC", metrics.Model)
		}

		metricsBoardName := &devices.SNMPMetrics{}
		clientBoardName := &fakeCollectorSNMPClient{
			bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
				boardNameOID: {strPDU(boardNameOID, "1", "S5736-S24UM4XC")},
			},
		}
		collectDeviceIdentityWithContext(collector, clientBoardName, metricsBoardName, registry, "", true, ".1.3.6.1.4.1.2011.2.23.816", true)
		if metricsBoardName.Model == nil || *metricsBoardName.Model != "S5736-S24UM4XC" {
			t.Fatalf("Model = %v, want S5736-S24UM4XC", metricsBoardName.Model)
		}
	})

	classOID := registry.Common.System.EntPhysicalClass.OID
	intPDU := func(base, idx string, val int) gosnmp.SnmpPDU {
		return gosnmp.SnmpPDU{Name: "." + base + "." + idx, Type: gosnmp.Integer, Value: val}
	}

	t.Run("按 entPhysicalClass 过滤风扇电源光模块且优先 chassis", func(t *testing.T) {
		metrics := &devices.SNMPMetrics{}
		client := &fakeCollectorSNMPClient{
			bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
				boardTypeOID: {
					strPDU(boardTypeOID, "1", "FAN-40EA-B"),
					strPDU(boardTypeOID, "2", "PAC150S12-R"),
					strPDU(boardTypeOID, "3", "SFP-GE-LX"),
					strPDU(boardTypeOID, "9", "S5736-S24UM4XC"),
				},
				classOID: {
					intPDU(classOID, "1", 7),
					intPDU(classOID, "2", 6),
					intPDU(classOID, "3", 10),
					intPDU(classOID, "9", 3),
				},
			},
		}
		collectDeviceIdentityWithContext(collector, client, metrics, registry, "", true, ".1.3.6.1.4.1.2011.2.23.982", true)
		if metrics.Model == nil || *metrics.Model != "S5736-S24UM4XC" {
			t.Fatalf("Model = %v, want S5736-S24UM4XC", metrics.Model)
		}
	})

	t.Run("缺少 entPhysicalClass 时拦截非整机前缀并选出 S5736-S48U4XC", func(t *testing.T) {
		metrics := &devices.SNMPMetrics{}
		client := &fakeCollectorSNMPClient{
			bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
				boardTypeOID: {
					strPDU(boardTypeOID, "1", "FAN-40EA-B"),
					strPDU(boardTypeOID, "2", "PAC150S12-R"),
					strPDU(boardTypeOID, "3", "S5736-S48U4XC"),
				},
			},
		}
		collectDeviceIdentityWithContext(collector, client, metrics, registry, "", true, ".1.3.6.1.4.1.2011.2.23.982", true)
		if metrics.Model == nil || *metrics.Model != "S5736-S48U4XC" {
			t.Fatalf("Model = %v, want S5736-S48U4XC", metrics.Model)
		}
	})

	t.Run("sysDescr 已解析型号时 hwEntityBoardName 不得抢占", func(t *testing.T) {
		metrics := &devices.SNMPMetrics{}
		client := &fakeCollectorSNMPClient{
			bulkWalkPackets: map[string][]gosnmp.SnmpPDU{
				boardNameOID: {strPDU(boardNameOID, "1", "MPU-Board")},
			},
		}
		collectDeviceIdentityWithContext(
			collector,
			client,
			metrics,
			registry,
			"CloudEngine S5736-S24T4XC\r\nHuawei Versatile Routing Platform Software\r\nVRP (R) software, Version 8.220 (S5736-S24T4XC V600R022C00)",
			true,
			".1.3.6.1.4.1.2011.2.23.982",
			true,
		)
		if metrics.Model == nil || *metrics.Model != "S5736-S24T4XC" {
			t.Fatalf("Model = %v, want S5736-S24T4XC", metrics.Model)
		}
	})
}
