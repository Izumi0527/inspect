package reports_test

import (
	"testing"
	_ "unsafe"

	"github.com/your-org/inspect-system/backend-go/internal/reports"
)

// 服务器磁盘使用率明细的 PDF 解析与渲染。载荷由执行端 buildDiskUsageDetails 写入，
// 与接口错包率同构：逐分区行 + 未评估清单 + 阈值信封。

//go:linkname parseDiskUsageDetails github.com/your-org/inspect-system/backend-go/internal/reports.parseDiskUsageDetails
func parseDiskUsageDetails(raw *string) *reports.DiskUsageReport

//go:linkname parseCheckResultDetails github.com/your-org/inspect-system/backend-go/internal/reports.parseCheckResultDetails
func parseCheckResultDetails(raw *string, result *reports.InspectionCheckResult)

const diskUsagePayload = `{
	"kind": "disk_usage",
	"total": 4, "evaluated": 3, "over_warning": 2, "over_critical": 1,
	"warning_threshold": 80, "critical_threshold": 90,
	"disks": [
		{"name": "/data", "total_bytes": 536870912000, "used_bytes": 510027366400, "percent": 95.0, "verdict": "fail"},
		{"name": "/var", "total_bytes": 107374182400, "used_bytes": 91268055040, "percent": 85.0, "verdict": "warning"},
		{"name": "/", "total_bytes": 53687091200, "used_bytes": 24159191040, "percent": 45.0, "verdict": "pass"}
	],
	"skipped": [{"name": "/snap/core/16928", "reason": "伪文件系统或只读镜像，不参与判定"}],
	"metric": "disk_usage",
	"threshold": {"warning": 80, "critical": 90, "unit": "%"}
}`

// 逐分区行要带容量与已用字节数：只给「95%」看不出是 10 GB 的系统盘还是 10 TB 的数据盘，
// 两者的处置紧迫程度完全不同。
func TestParseDiskUsage_ReadsDisksAndThresholds(t *testing.T) {
	report := parseDiskUsageDetails(rawJSON(diskUsagePayload))
	if report == nil {
		t.Fatal("合法的 disk_usage 载荷应解析成功，实际返回 nil")
	}
	if report.Total != 4 || report.Evaluated != 3 || report.OverWarning != 2 || report.OverCritical != 1 {
		t.Errorf("计数 = %d/%d/%d/%d，want 4/3/2/1", report.Total, report.Evaluated, report.OverWarning, report.OverCritical)
	}
	if report.WarningThreshold != 80 || report.CriticalThreshold != 90 {
		t.Errorf("阈值 = %v/%v，want 80/90", report.WarningThreshold, report.CriticalThreshold)
	}
	if len(report.Disks) != 3 {
		t.Fatalf("分区行数 = %d，want 3", len(report.Disks))
	}
	first := report.Disks[0]
	if first.Name != "/data" || first.Verdict != "fail" || first.TotalBytes != 536870912000 || first.UsedBytes != 510027366400 {
		t.Errorf("首行 = %+v，want /data fail 且带容量与已用", first)
	}
	if len(report.Skipped) != 1 || report.Skipped[0].Name != "/snap/core/16928" {
		t.Errorf("skipped = %+v，want /snap/core/16928", report.Skipped)
	}
}

// 分派入口要认得新 kind，并且照常带出阈值（阈值与明细正交）。
func TestParseCheckResultDetails_DispatchesDiskUsage(t *testing.T) {
	var result reports.InspectionCheckResult
	parseCheckResultDetails(rawJSON(diskUsagePayload), &result)

	if result.DiskUsage == nil {
		t.Fatal("disk_usage 载荷应分派到 DiskUsage")
	}
	if result.InterfaceRatio != nil || result.ComponentStatus != nil {
		t.Error("明细字段互斥，disk_usage 不应命中其他类型")
	}
	if result.Threshold == nil || result.Threshold.Warning != 80 {
		t.Errorf("阈值应照常带出，got %+v", result.Threshold)
	}
}

func TestParseDiskUsage_TolerantToBadInput(t *testing.T) {
	for _, raw := range []*string{nil, rawJSON(""), rawJSON("检查通过"), rawJSON(`{"kind":"interface_errors"}`)} {
		if got := parseDiskUsageDetails(raw); got != nil {
			t.Errorf("parseDiskUsageDetails(%v) 应返回 nil，实际 %+v", raw, got)
		}
	}
}

// 明细表必须实际渲染进 PDF（CJK 子集嵌入抽不出文本，以体积差证明表格画出去了）。
func TestInspectionPDF_RendersDiskUsageTable(t *testing.T) {
	build := func(withDetails bool) reports.InspectionReportData {
		result := reports.InspectionCheckResult{CheckItemName: "磁盘使用率", CheckItemType: "snmp", Status: "fail"}
		if withDetails {
			result.DiskUsage = parseDiskUsageDetails(rawJSON(diskUsagePayload))
		}
		return reports.InspectionReportData{
			InspectionName: "服务器例行巡检",
			InspectionID:   "INSP-91",
			Devices: []reports.InspectionDeviceData{{
				DeviceName: "应用服务器-01", IPAddress: "192.168.30.10", DeviceType: "server",
				CheckResults: []reports.InspectionCheckResult{result},
			}},
		}
	}

	fullSize := renderInspectionPDFSize(t, build(true), "disk-with-details.pdf")
	bareSize := renderInspectionPDFSize(t, build(false), "disk-bare.pdf")

	if fullSize <= bareSize {
		t.Fatalf("带明细 PDF = %d 字节，不带明细 = %d 字节；磁盘明细表未被渲染", fullSize, bareSize)
	}
}
