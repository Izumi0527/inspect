package reports_test

// 本文件生成「多设备巡检报告」压力样本 PDF：22 台设备、超长设备/接口名、
// 六类明细载荷（接口利用率/错包/光模块/磁盘/BGP/部件）与长检查输出，走真实
// 渲染链路 writeInspectionPDF，用于 PDF 布局回归（出格检测）与人工目检。
// 输出固定在 build/pdf-audit/（不入版本控制）。生成后可用 pdftotext 检查
// 文本流、或渲染截图检查版面。
//
// 复用同包已声明的 go:linkname：
//   - writeInspectionPDF        （report_check_details_test.go）
//   - parseCheckResultDetails   （report_disk_usage_details_test.go）
//   - reconcileInspectionSummary（report_not_applicable_test.go）

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/your-org/inspect-system/backend-go/internal/reports"
)

const zzAuditPDFOutPath = `C:/Coder/Inspect/build/pdf-audit/sample-inspection.pdf`

// zzAuditCheck 构造一条检查结果。details 非空时走真实解析管线，与
// buildInspectionReportDataFromDB 对 inspection_results.details 的处理一致。
func zzAuditCheck(name, typ, status, expected, actual, details string) reports.InspectionCheckResult {
	result := reports.InspectionCheckResult{
		CheckItemName: name,
		CheckItemType: typ,
		Status:        status,
		ExpectedValue: expected,
		ActualValue:   actual,
	}
	if strings.TrimSpace(details) != "" {
		raw := details
		parseCheckResultDetails(&raw, &result)
	}
	return result
}

func zzAuditDevice(name, ip, typ, vendor, model, version, uptime string, checks ...reports.InspectionCheckResult) reports.InspectionDeviceData {
	return reports.InspectionDeviceData{
		DeviceName:         name,
		IPAddress:          ip,
		DeviceType:         typ,
		Vendor:             vendor,
		Model:              model,
		SoftwareVersion:    version,
		Uptime:             uptime,
		LastInspectionTime: "2026-10-18 02:15:30",
		InspectionStatus:   "completed",
		CheckResults:       checks,
	}
}

// ---------------------------------------------------------------------------
// 阈值载荷（多个设备共用同一口径，让「判定口径」声明在结论段出现）
// ---------------------------------------------------------------------------

const zzAuditCPUThreshold = `{"kind":"threshold","metric":"cpu","threshold":{"warning":70,"critical":85,"unit":"%"}}`
const zzAuditMemThreshold = `{"kind":"threshold","metric":"memory","threshold":{"warning":80,"critical":90,"unit":"%"}}`
const zzAuditTempThreshold = `{"kind":"threshold","metric":"temperature","threshold":{"warning":60,"critical":70,"unit":"C"}}`

// 长检查输出（原样采集文本，含换行 / 超长单词 / 长中文句）。
const zzAuditSysDescrOut = `Huawei Versatile Routing Platform Software VRP (R) software, Version 5.170 (S5735 V200R019C10SPC500) Copyright (C) 2012-2021 Huawei Technologies Co., Ltd. All Rights Reserved.`
const zzAuditMultiLineOut = "line1: device health summary\nline2: interface total 52, up 48, down 4\nline3: fan status normal, power redundant OK"
const zzAuditLongCJKOut = `设备运行状态汇总：主控板 1 正常、备用主控板 2 正常、交换网板 3 与交换网板 4 正常、风扇模块全部在线、电源模块双路冗余输入正常；AAA 认证失败计数 0，SNMP 团体名最近变更时间 2026-08-01，NTP 偏移 -0.003 秒，最近一次配置保存时间 2026-09-28 03:00:12。`

// 接口利用率明细：含超长接口名 HundredGigE0/0/0/24 与长 Vlanif 名称。
const zzAuditUtilPayload = `{
	"kind": "interface_utilization",
	"total": 29, "evaluated": 28, "over_warning": 2, "over_critical": 1,
	"warning_threshold": 70, "critical_threshold": 90,
	"interfaces": [
		{"name": "HundredGigE0/0/0/24", "direction": "出", "percent": 92.35, "speed_mbps": 100000, "in_rate_bps": 81000000000, "out_rate_bps": 92350000000},
		{"name": "HundredGigE0/0/0/23", "direction": "入", "percent": 74.2, "speed_mbps": 100000, "in_rate_bps": 74200000000, "out_rate_bps": 31800000000},
		{"name": "Ten-GigabitEthernet0/0/2-Uplink-To-DCIM-Core-Spine-01", "direction": "出", "percent": 61.5, "speed_mbps": 10000, "in_rate_bps": 2140000000, "out_rate_bps": 6150000000},
		{"name": "XGigabitEthernet0/0/1", "direction": "入", "percent": 45.8, "speed_mbps": 10000, "in_rate_bps": 4580000000, "out_rate_bps": 1900000000},
		{"name": "GigabitEthernet0/0/12", "direction": "出", "percent": 33.2, "speed_mbps": 1000, "in_rate_bps": 128000000, "out_rate_bps": 332000000},
		{"name": "MEth0/0/1", "direction": "入", "percent": 0.05, "speed_mbps": 1000, "in_rate_bps": 500000, "out_rate_bps": 320000}
	],
	"skipped": [
		{"name": "Vlanif4094-Management-SVI-For-OOB-Backup-Path", "reason": "设备未上报该接口速率采样"},
		{"name": "NULL0", "reason": "空接口，不参与利用率判定"}
	],
	"metric": "interface_utilization",
	"threshold": {"warning": 70, "critical": 90, "unit": "%"}
}`

// 第二份接口利用率（长检查项名 + 长接口名的组合压力）。
const zzAuditUtilPayload2 = `{
	"kind": "interface_utilization",
	"total": 52, "evaluated": 50, "over_warning": 1, "over_critical": 0,
	"warning_threshold": 70, "critical_threshold": 90,
	"interfaces": [
		{"name": "HundredGigE0/0/0/24", "direction": "入", "percent": 71.6, "speed_mbps": 100000, "in_rate_bps": 71600000000, "out_rate_bps": 20400000000},
		{"name": "Eth-Trunk1", "direction": "出", "percent": 42.1, "speed_mbps": 40000, "in_rate_bps": 8100000000, "out_rate_bps": 16840000000},
		{"name": "GigabitEthernet0/0/1", "direction": "入", "percent": 12.3, "speed_mbps": 1000, "in_rate_bps": 123000000, "out_rate_bps": 54000000}
	],
	"skipped": [{"name": "Vlanif4094", "reason": "设备未上报该接口速率采样"}],
	"metric": "interface_utilization",
	"threshold": {"warning": 70, "critical": 90, "unit": "%"}
}`

// 接口错包率明细（长接口名）。
const zzAuditErrorsPayload = `{
	"kind": "interface_errors",
	"total": 29, "evaluated": 28, "over_warning": 2, "over_critical": 1,
	"warning_threshold": 0.01, "critical_threshold": 0.1,
	"interfaces": [
		{"name": "Ten-GigabitEthernet0/0/2-Uplink-To-DCIM-Core-Spine-01", "direction": "入", "percent": 1.2, "count": 12654, "packets": 1054500000},
		{"name": "HundredGigE0/0/0/24", "direction": "入", "percent": 0.15, "count": 45210, "packets": 30140000000},
		{"name": "GigabitEthernet0/0/12", "direction": "出", "percent": 0.0, "count": 0, "packets": 88450000}
	],
	"skipped": [{"name": "NULL0", "reason": "设备未上报该计数器"}],
	"metric": "interface_errors",
	"threshold": {"warning": 0.01, "critical": 0.1, "unit": "%"}
}`

// 光模块明细（部分模块缺诊断量）。
const zzAuditOpticalPayload = `{
	"kind": "optical_power",
	"total": 8, "evaluated": 7, "over_warning": 1, "over_critical": 1,
	"warning_threshold": -25, "critical_threshold": -30,
	"modules": [
		{"index": "HundredGigE0/0/0/24", "verdict": "fail", "rx_power": -31.2, "rx_power_unit": "dBm", "tx_power": -2.8, "tx_power_unit": "dBm", "voltage": 3.29, "voltage_unit": "V", "bias_current": 32.4, "bias_current_unit": "mA"},
		{"index": "HundredGigE0/0/0/23", "verdict": "warning", "rx_power": -26.4, "rx_power_unit": "dBm", "tx_power": -3.1, "tx_power_unit": "dBm", "voltage": 3.31, "voltage_unit": "V", "bias_current": 21.5, "bias_current_unit": "mA"},
		{"index": "Ten-GigabitEthernet0/0/2", "verdict": "pass", "rx_power": -8.4, "rx_power_unit": "dBm", "tx_power": -2.2, "tx_power_unit": "dBm", "voltage": 3.28, "voltage_unit": "V", "bias_current": 18.9, "bias_current_unit": "mA"},
		{"index": "XGigabitEthernet0/0/1", "verdict": "pass", "rx_power": -7.9, "rx_power_unit": "dBm", "tx_power": -2.4, "tx_power_unit": "dBm"}
	],
	"skipped": [{"name": "GigabitEthernet0/0/7", "reason": "设备未上报收光功率（非光口）"}],
	"metric": "optical_power",
	"threshold": {"warning": -25, "critical": -30, "unit": "dBm"}
}`

// 磁盘明细（长挂载点 + 伪文件系统跳过项）。
const zzAuditDiskPayload = `{
	"kind": "disk_usage",
	"total": 6, "evaluated": 5, "over_warning": 2, "over_critical": 1,
	"warning_threshold": 80, "critical_threshold": 90,
	"disks": [
		{"name": "/data/docker/overlay2/backup-snapshots", "total_bytes": 2199023255552, "used_bytes": 2111062325329, "percent": 96.0, "verdict": "fail"},
		{"name": "/opt/application/deploy/releases/current/shared", "total_bytes": 536870912000, "used_bytes": 461708984320, "percent": 86.0, "verdict": "warning"},
		{"name": "/var/log", "total_bytes": 107374182400, "used_bytes": 91268055040, "percent": 85.0, "verdict": "warning"},
		{"name": "/", "total_bytes": 53687091200, "used_bytes": 24159191040, "percent": 45.0, "verdict": "pass"}
	],
	"skipped": [
		{"name": "/snap/core/16928", "reason": "伪文件系统或只读镜像，不参与判定"},
		{"name": "/run/user/1000/gvfs", "reason": "FUSE 挂载不可读"}
	],
	"metric": "disk_usage",
	"threshold": {"warning": 80, "critical": 90, "unit": "%"}
}`

// 第二份磁盘明细（备份服务器）。
const zzAuditDiskPayload2 = `{
	"kind": "disk_usage",
	"total": 5, "evaluated": 4, "over_warning": 1, "over_critical": 1,
	"warning_threshold": 80, "critical_threshold": 90,
	"disks": [
		{"name": "/backup/nightly/full-2026Q3", "total_bytes": 8796093022208, "used_bytes": 8356288371097, "percent": 95.0, "verdict": "fail"},
		{"name": "/", "total_bytes": 107374182400, "used_bytes": 32212254720, "percent": 30.0, "verdict": "pass"}
	],
	"skipped": [{"name": "/boot/efi", "reason": "容量过小（小于 1GB），阈值意义有限"}],
	"metric": "disk_usage",
	"threshold": {"warning": 80, "critical": 90, "unit": "%"}
}`

// BGP 邻居明细（长 last_error）。
const zzAuditBGPPayload = `{
	"kind": "bgp_peers",
	"total": 6, "established": 5, "down": 1, "flapping": 1,
	"flapping_threshold_seconds": 3600,
	"peers": [
		{"index": "10.0.0.3", "verdict": "fail", "state": 2, "state_label": "connect", "last_error": "hold timer expired (Ceased establishment after 3 retries within 180 seconds)"},
		{"index": "10.0.0.2", "verdict": "warning", "state": 6, "state_label": "established", "established_seconds": 120},
		{"index": "10.0.0.1", "verdict": "pass", "state": 6, "state_label": "established", "established_seconds": 864000}
	]
}`

// 风扇部件明细（长部件编号）。
const zzAuditFanPayload = `{
	"kind": "component_status",
	"component_kind": "fan", "label": "风扇",
	"total": 6, "normal": 5, "abnormal": 1, "unknown": 0,
	"normal_states": [1], "abnormal_states": [2],
	"components": [
		{"index": "Fan-Tray-2/Slot-3", "kind": "fan", "verdict": "fail", "state": 2},
		{"index": "1", "kind": "fan", "verdict": "pass", "state": 1},
		{"index": "2", "kind": "fan", "verdict": "pass", "state": 1},
		{"index": "3", "kind": "fan", "verdict": "pass", "state": 1},
		{"index": "4", "kind": "fan", "verdict": "pass", "state": 1},
		{"index": "5", "kind": "fan", "verdict": "pass", "state": 1}
	]
}`

// zzAuditStressData 组装压力样本：22 台设备（含 3 个 40+ 字符名与 1 个超长
// 中文名）、四类明细表、长检查输出、跳过 / 不适用 / 已删除占位。
func zzAuditStressData() reports.InspectionReportData {
	devices := []reports.InspectionDeviceData{
		zzAuditDevice("核心交换机-01", "10.20.0.1", "switch", "huawei", "S12700E-8", "V200R021C10SPC600",
			"356 天 4 小时 12 分钟",
			// 13 条检查结果：触发「仅展示前 12 条」截断行。
			zzAuditCheck("设备连通性", "icmp", "pass", "可达", "5.20ms", ""),
			zzAuditCheck("CPU使用率", "snmp", "warning", "< 70%", "72.2%（5 分钟平均值）", zzAuditCPUThreshold),
			zzAuditCheck("内存使用率", "snmp", "pass", "< 80%", "63.4%", zzAuditMemThreshold),
			zzAuditCheck("设备温度", "snmp", "failed", "< 60C", "整机进风温度 58C，主控板温度 75C", zzAuditTempThreshold),
			zzAuditCheck("运行时长", "snmp", "pass", "> 7 天", "356 天 4 小时 12 分钟", ""),
			zzAuditCheck("接口状态", "snmp", "pass", "全部 UP", "52 个接口中 48 UP / 4 DOWN（均为预留口）", ""),
			zzAuditCheck("接口利用率", "snmp", "warning", "峰值利用率 < 70%", "29 个接口中 2 个超过 70%，峰值 92.35%（HundredGigE0/0/0/24）", zzAuditUtilPayload),
			zzAuditCheck("接口错包率", "snmp", "failed", "错包率 < 0.01%", "3 个接口超过阈值，峰值 1.20%", zzAuditErrorsPayload),
			zzAuditCheck("接口丢弃率", "snmp", "pass", "丢弃率 < 0.01%", "全部接口低于阈值", ""),
			zzAuditCheck("光模块光功率", "snmp", "failed", "收光功率 > -25dBm", "8 个模块中 1 个收光异常：-31.2dBm", zzAuditOpticalPayload),
			zzAuditCheck("风扇状态", "snmp", "pass", "全部正常", "6 个风扇全部正常", zzAuditFanPayload),
			zzAuditCheck("配置自动备份", "ssh", "skipped", "备份成功", "跳过：设备未配置 SSH 凭据", ""),
			zzAuditCheck("固件版本", "snmp", "pass", "匹配推荐版本", zzAuditSysDescrOut, ""),
		),
		// 40+ 字符设备名（混合中英文）。
		zzAuditDevice("Huawei-CloudEngine-S16700-核心生产网A区-主用核心交换机-机柜A-01-U12", "10.20.0.2", "switch", "huawei", "S16700-8", "V200R021C10SPC600",
			"121 天 8 小时 5 分钟",
			zzAuditCheck("设备连通性", "icmp", "pass", "可达", "2.10ms", ""),
			zzAuditCheck("BGP邻居状态", "snmp", "failed", "全部邻居 Established", "共 6 个，已建立 5，未建立 1，近期重建 1", zzAuditBGPPayload),
			zzAuditCheck("风扇状态", "snmp", "warning", "全部风扇正常运行", "共 6 个，正常 5，异常 1", zzAuditFanPayload),
			zzAuditCheck("固件版本", "cli", "pass", "匹配基线版本", zzAuditLongCJKOut, ""),
			zzAuditCheck("设备连通性（IPv6 管理面）", "icmp", "pass", "可达", "3.10ms", ""),
			zzAuditCheck("NTP 同步状态", "snmp", "pass", "同步正常", zzAuditMultiLineOut, ""),
		),
		// 超长中文设备名（明显超过 40 字符宽度）。
		zzAuditDevice("数据中心东区三楼网络核心机房门禁上联汇聚交换机-S5735-L48T4X-A1-主用-编号DJQ-CORE-AGG-SW-07", "10.20.1.7", "switch", "huawei", "S5735-L48T4X-A1", "V200R019C10SPC500",
			"98 天 22 小时 41 分钟",
			zzAuditCheck("设备连通性", "icmp", "pass", "可达", "1.80ms", ""),
			zzAuditCheck("接口利用率（5 分钟峰值，含上行 Eth-Trunk 聚合口与 100GE 单口）", "snmp", "warning", "峰值利用率 < 70%", "50 个已评估接口中 1 个超过 70%，峰值 71.6%", zzAuditUtilPayload2),
			zzAuditCheck("CPU使用率", "snmp", "pass", "< 70%", "31.5%", zzAuditCPUThreshold),
		),
		// 40+ 字符纯英文设备名。
		zzAuditDevice("Edge-Router-BJ-IDC-AS64512-RTR-01-100GE-Uplink-To-Core-DCI-Border-Leaf", "10.30.0.1", "router", "cisco", "NCS-5501-SE", "IOS-XR 7.5.2",
			"432 天 18 小时 3 分钟",
			zzAuditCheck("设备连通性", "icmp", "pass", "可达", "8.40ms", ""),
			zzAuditCheck("接口利用率", "snmp", "warning", "峰值利用率 < 70%", "30 个接口中 1 个超过 70%", zzAuditUtilPayload),
			zzAuditCheck("BGP邻居状态", "snmp", "pass", "全部邻居 Established", "共 4 个，全部建立", zzAuditBGPPayload),
			zzAuditCheck("设备温度", "snmp", "pass", "< 60C", "44C", zzAuditTempThreshold),
		),
		zzAuditDevice("应用服务器-01", "172.16.8.11", "server", "dell", "PowerEdge R750", "RHEL 9.4",
			"66 天 11 小时 27 分钟",
			zzAuditCheck("CPU使用率", "snmp", "pass", "< 70%", "22.8%", zzAuditCPUThreshold),
			zzAuditCheck("内存使用率", "snmp", "warning", "< 80%", "87.4%（14.0GB / 16.0GB）", zzAuditMemThreshold),
			zzAuditCheck("磁盘使用率", "snmp", "failed", "使用率 < 80%", "6 个分区中 1 个超过 90%：/data/docker/overlay2/backup-snapshots 96.0%", zzAuditDiskPayload),
			zzAuditCheck("磁盘只读检查", "ssh", "pass", "可写", "全部挂载点可写", ""),
		),
		zzAuditDevice("备份服务器-BAK-02", "172.16.8.12", "server", "huawei", "2288H V5", "openEuler 22.03 LTS",
			"210 天 2 小时 15 分钟",
			zzAuditCheck("磁盘使用率", "snmp", "failed", "使用率 < 80%", "5 个分区中 1 个超过 90%：/backup/nightly/full-2026Q3 95.0%", zzAuditDiskPayload2),
			zzAuditCheck("运行时长", "snmp", "pass", "> 7 天", "210 天 2 小时 15 分钟", ""),
			zzAuditCheck("CPU使用率", "snmp", "pass", "< 70%", "18.3%", zzAuditCPUThreshold),
		),
	}

	// 7-22 号设备：常规模板填充，制造足量异常以触发异常清单 30 行截断。
	fillerNames := []string{
		"接入交换机-03F-01", "接入交换机-03F-02", "接入交换机-03F-03", "接入交换机-03F-04",
		"接入交换机-05F-01", "接入交换机-05F-02", "汇聚交换机-02F-01", "路由器-WAN-01",
		"服务器-DB-01", "服务器-DB-02", "防火墙-DMZ-01", "防火墙-OFFICE-01",
		"无线AC-01", "无线AP-6F-01", "无线AP-6F-02", "堡垒机-01",
	}
	fillerTypes := []string{
		"switch", "switch", "switch", "switch",
		"switch", "switch", "switch", "router",
		"server", "server", "firewall", "firewall",
		"wireless_ap", "ap", "ap", "server",
	}
	for i, name := range fillerNames {
		idx := i + 7
		ip := fmt.Sprintf("10.20.%d.%d", i/8+2, i%8+10)
		typ := fillerTypes[i]
		checks := []reports.InspectionCheckResult{
			zzAuditCheck("设备连通性", "icmp", "pass", "可达", fmt.Sprintf("%.2fms", 1.5+float64(i)*0.37), ""),
		}
		switch {
		case i%3 == 0:
			checks = append(checks,
				zzAuditCheck("CPU使用率", "snmp", "warning", "< 70%", fmt.Sprintf("%.1f%%", 71.0+float64(i)), zzAuditCPUThreshold),
				zzAuditCheck("设备温度", "snmp", "warning", "< 60C", fmt.Sprintf("%dC", 61+i%3), zzAuditTempThreshold),
			)
		case i%3 == 1:
			checks = append(checks,
				zzAuditCheck("内存使用率", "snmp", "failed", "< 80%", fmt.Sprintf("%.1f%%（接近容量上限）", 91.0+float64(i)/10), zzAuditMemThreshold),
			)
		default:
			checks = append(checks,
				zzAuditCheck("运行时长", "snmp", "warning", "> 7 天", fmt.Sprintf("%d 天 %d 小时（上周有非计划重启）", 2+i%3, i), ""),
			)
		}
		if typ == "server" {
			checks = append(checks, zzAuditCheck("PoE 供电", "snmp", "not_applicable", "不适用", "服务器设备不支持 PoE", ""))
		}
		if i%4 == 0 {
			checks = append(checks, zzAuditCheck("配置自动备份", "ssh", "skipped", "备份成功", "跳过：备份凭据未配置", ""))
		}
		checks = append(checks, zzAuditCheck("设备型号识别", "snmp", "pass", "可识别", zzAuditSysDescrOut, ""))
		devices = append(devices, zzAuditDevice(name, ip, typ, "huawei", fmt.Sprintf("S5735-L48T4X-A%d", i%4+1), "V200R019C10SPC500",
			fmt.Sprintf("%d 天 %d 小时 %d 分钟", 30+i*9, i*3%24, i*7%60), checks...))
		_ = idx
	}

	return reports.InspectionReportData{
		InspectionName:    "2026 年第三季度核心生产网及容灾机房全区设备例行巡检专项报告（含链路冗余核查）",
		InspectionID:      "INSP-2026Q3-0087",
		InspectionTime:    "2026-10-18 02:15:30",
		Status:            "completed",
		ExecutionDuration: 1874,
		// 覆盖范围声明（渲染层原样展示，不校验内部一致性）。
		TemplateName:     "核心网络设备全量巡检模板（v4 修订）",
		CoveredMetrics:   []string{"连通性", "SNMP 可达", "CPU", "内存", "磁盘使用率", "风扇状态", "电源状态", "温度", "运行时长", "接口状态", "接口利用率", "接口错包率", "接口丢弃率", "光模块光功率"},
		UncoveredMetrics: []string{"带宽吞吐量", "PoE 供电", "BGP 邻居", "固件版本", "接口双工模式", "接口管理状态"},
		Devices:          devices,
	}
}

// TestZZAuditGenerateStressSamplePDF 生成压力样本 PDF 并打印口径统计，
// 同时对渲染链路做冒烟断言（渲染成功 + 明细载荷全部解析）。
func TestZZAuditGenerateStressSamplePDF(t *testing.T) {
	data := zzAuditStressData()
	if len(data.Devices) < 20 {
		t.Fatalf("压力样本设备数 = %d，要求不少于 20 台", len(data.Devices))
	}

	// 统计口径与生产路径一致：以检查明细重算摘要与问题数。
	reconcileInspectionSummary(&data)

	utilCount, diskCount, opticalCount, ratioCount, bgpCount, fanCount := 0, 0, 0, 0, 0, 0
	for _, device := range data.Devices {
		for _, check := range device.CheckResults {
			if check.InterfaceUtilization != nil {
				utilCount++
			}
			if check.DiskUsage != nil {
				diskCount++
			}
			if check.OpticalPower != nil {
				opticalCount++
			}
			if check.InterfaceRatio != nil {
				ratioCount++
			}
			if check.BGPPeers != nil {
				bgpCount++
			}
			if check.ComponentStatus != nil {
				fanCount++
			}
		}
	}
	t.Logf("设备=%d 检查项=%d 通过=%d 警告=%d 失败=%d 错误=%d 跳过=%d 不适用=%d 未知=%d 通过率=%.1f%%",
		len(data.Devices), data.SummaryStats.TotalChecks, data.SummaryStats.PassedChecks,
		data.SummaryStats.WarningChecks, data.SummaryStats.FailedChecks, data.SummaryStats.ErrorChecks,
		data.SummaryStats.SkippedChecks, data.SummaryStats.NotApplicableChecks, data.SummaryStats.UnknownChecks,
		data.SummaryStats.PassRate)
	t.Logf("明细载荷：接口利用率=%d 磁盘=%d 光模块=%d 接口错包=%d BGP=%d 部件=%d",
		utilCount, diskCount, opticalCount, ratioCount, bgpCount, fanCount)

	if utilCount == 0 || diskCount == 0 || opticalCount == 0 {
		t.Fatalf("明细载荷解析失败：util=%d disk=%d optical=%d，样本将缺失关键压力面", utilCount, diskCount, opticalCount)
	}

	if err := os.MkdirAll(filepath.Dir(zzAuditPDFOutPath), 0o755); err != nil {
		t.Fatalf("MkdirAll(%q) error = %v", filepath.Dir(zzAuditPDFOutPath), err)
	}
	if err := writeInspectionPDF(zzAuditPDFOutPath, data); err != nil {
		if strings.Contains(err.Error(), "未找到可用的PDF中文字体") {
			t.Skipf("当前环境缺少 PDF 中文字体，跳过样本生成: %v", err)
		}
		t.Fatalf("writeInspectionPDF(%q) error = %v", zzAuditPDFOutPath, err)
	}
	info, err := os.Stat(zzAuditPDFOutPath)
	if err != nil {
		t.Fatalf("Stat(%q) error = %v", zzAuditPDFOutPath, err)
	}
	t.Logf("PDF 已生成: %s（%d 字节）", zzAuditPDFOutPath, info.Size())
}
