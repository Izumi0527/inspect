package handlers_test

import (
	"encoding/json"
	"strings"
	"testing"
	_ "unsafe"

	"github.com/your-org/inspect-system/backend-go/internal/devices"
	"github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	"github.com/your-org/inspect-system/backend-go/internal/inspection"
)

//go:linkname checkDiskUsageMetric github.com/your-org/inspect-system/backend-go/internal/http/handlers.InspectionHandler.checkDiskUsageMetric
func checkDiskUsageMetric(h handlers.InspectionHandler, result *inspection.Result, metrics *devices.SNMPMetrics, warningThreshold, criticalThreshold float64)

// diskUsageDetails 断言落库的 JSON 契约：前端执行详情与 PDF 明细表消费的正是这份载荷。
type diskUsageDetails struct {
	Kind              string  `json:"kind"`
	Metric            string  `json:"metric"`
	Total             int     `json:"total"`
	Evaluated         int     `json:"evaluated"`
	OverWarning       int     `json:"over_warning"`
	OverCritical      int     `json:"over_critical"`
	WarningThreshold  float64 `json:"warning_threshold"`
	CriticalThreshold float64 `json:"critical_threshold"`
	Disks             []struct {
		Name       string  `json:"name"`
		TotalBytes int64   `json:"total_bytes"`
		UsedBytes  int64   `json:"used_bytes"`
		Percent    float64 `json:"percent"`
		Verdict    string  `json:"verdict"`
	} `json:"disks"`
	Skipped []struct {
		Name   string `json:"name"`
		Reason string `json:"reason"`
	} `json:"skipped"`
}

func decodeDiskUsageDetails(t *testing.T, result inspection.Result) diskUsageDetails {
	t.Helper()
	if len(result.Details) == 0 {
		t.Fatal("details 为空：磁盘使用率检查项必须写入逐分区明细")
	}
	var decoded diskUsageDetails
	if err := json.Unmarshal(result.Details, &decoded); err != nil {
		t.Fatalf("details 不是合法 JSON: %v", err)
	}
	if decoded.Kind != "disk_usage" || decoded.Metric != "disk_usage" {
		t.Fatalf("details.kind/metric = %q/%q, want disk_usage", decoded.Kind, decoded.Metric)
	}
	return decoded
}

const gib = int64(1 << 30)

func disk(mount string, totalGiB int64, usedPercent float64) devices.DiskMetrics {
	total := totalGiB * gib
	return devices.DiskMetrics{Mount: mount, TotalBytes: total, UsedBytes: int64(float64(total) * usedPercent / 100)}
}

// 最坏的分区排在最前（报告表格截断时留下的必须是要处理的那几行）；
// snap 只读镜像恒为 100%、tmpfs 等伪文件系统、容器 overlay 挂载与容量为 0 的分区
// 都不参与判定，但要列进 skipped，否则「8 个分区只看到 4 行」会让人以为采集坏了。
// 独立挂载的 /var/lib/docker 本身是真实数据盘，必须参与判定。
func TestDiskUsage_WorstFirstAndPseudoMountsSkipped(t *testing.T) {
	metrics := &devices.SNMPMetrics{Disks: []devices.DiskMetrics{
		disk("/", 50, 45),
		disk("/data", 500, 95),
		disk("/var", 100, 85),
		disk("/snap/core/16928", 1, 100),
		disk("/run", 2, 10),
		{Mount: "/boot", TotalBytes: 0, UsedBytes: 0},
		disk("/var/lib/docker/overlay2/3f2a/merged", 50, 99),
		disk("/var/lib/docker", 200, 50),
	}}
	var result inspection.Result

	checkDiskUsageMetric(handlers.InspectionHandler{}, &result, metrics, 80, 90)

	if result.Status != "fail" {
		t.Fatalf("status = %q, want fail（/data 95%% 超故障阈值）", result.Status)
	}
	details := decodeDiskUsageDetails(t, result)
	if details.Total != 8 || details.Evaluated != 4 || details.OverWarning != 2 || details.OverCritical != 1 {
		t.Fatalf("计数 total/evaluated/over_warning/over_critical = %d/%d/%d/%d, want 8/4/2/1",
			details.Total, details.Evaluated, details.OverWarning, details.OverCritical)
	}
	gotOrder := make([]string, 0, len(details.Disks))
	for _, d := range details.Disks {
		gotOrder = append(gotOrder, d.Name+":"+d.Verdict)
	}
	wantOrder := "/data:fail,/var:warning,/var/lib/docker:pass,/:pass"
	if strings.Join(gotOrder, ",") != wantOrder {
		t.Fatalf("disks 顺序 = %v, want %s", gotOrder, wantOrder)
	}
	skipped := map[string]bool{}
	for _, s := range details.Skipped {
		if strings.TrimSpace(s.Reason) == "" {
			t.Errorf("skipped %q 缺少原因", s.Name)
		}
		skipped[s.Name] = true
	}
	for _, name := range []string{"/snap/core/16928", "/run", "/boot", "/var/lib/docker/overlay2/3f2a/merged"} {
		if !skipped[name] {
			t.Errorf("%q 应列入 skipped，实际 %v", name, details.Skipped)
		}
	}
	if result.ActualValue == nil || !strings.Contains(*result.ActualValue, "/data") {
		t.Fatalf("实际值应点名峰值分区 /data，got %v", result.ActualValue)
	}
	if result.Message == nil || !strings.Contains(*result.Message, "/data") {
		t.Fatalf("消息应点名超阈值分区，got %v", result.Message)
	}
}

func TestDiskUsage_AllNormalPasses(t *testing.T) {
	metrics := &devices.SNMPMetrics{Disks: []devices.DiskMetrics{disk("/", 50, 40), disk(`C:\`, 200, 60)}}
	var result inspection.Result

	checkDiskUsageMetric(handlers.InspectionHandler{}, &result, metrics, 80, 90)

	if result.Status != "pass" {
		t.Fatalf("status = %q, want pass", result.Status)
	}
	if result.Message == nil || !strings.Contains(*result.Message, "已评估 2/2") {
		t.Fatalf("message = %v, want 含「已评估 2/2」", result.Message)
	}
}

// WSL 运行时会挂入 Docker Desktop 的只读 ISO 镜像（恒为 100%）与 WSLg 等运行时目录，
// net-snmp 分不出文件系统类型，都报成固定磁盘；它们不是数据盘，不能据此判故障。
func TestDiskUsage_WSLRuntimeMountsSkipped(t *testing.T) {
	metrics := &devices.SNMPMetrics{Disks: []devices.DiskMetrics{
		disk("/", 1000, 1),
		disk("/mnt/wsl/docker-desktop/cli-tools", 1, 100),
		disk("/mnt/wsl", 8, 1),
		disk("/mnt/wslg/distro", 1000, 1),
		disk("/usr/lib/wsl/lib", 8, 1),
	}}
	var result inspection.Result

	checkDiskUsageMetric(handlers.InspectionHandler{}, &result, metrics, 80, 90)

	if result.Status != "pass" {
		t.Fatalf("status = %q, want pass（WSL 只读镜像不应判故障）", result.Status)
	}
	details := decodeDiskUsageDetails(t, result)
	if details.Evaluated != 1 || len(details.Skipped) != 4 {
		t.Fatalf("evaluated/skipped = %d/%d, want 1/4", details.Evaluated, len(details.Skipped))
	}
}

// 没有可评估的分区时判 skip 而非 pass：假通过会掩盖真的写满。
func TestDiskUsage_NothingEvaluatedIsSkip(t *testing.T) {
	cases := map[string]*devices.SNMPMetrics{
		"未采集到指标":  nil,
		"设备未上报分区": {},
		"只有伪文件系统": {Disks: []devices.DiskMetrics{disk("/run", 2, 10), disk("/snap/lxd/1", 1, 100)}},
	}
	for name, metrics := range cases {
		t.Run(name, func(t *testing.T) {
			var result inspection.Result
			checkDiskUsageMetric(handlers.InspectionHandler{}, &result, metrics, 80, 90)
			if result.Status != "skip" {
				t.Fatalf("status = %q, want skip", result.Status)
			}
			if result.Message == nil || strings.TrimSpace(*result.Message) == "" {
				t.Fatal("skip 也要说明原因")
			}
		})
	}
}

// 参考标准用生效阈值生成：模板未配置阈值时先补默认 80/90 再写。
func TestDiskUsage_ExpectedValueUsesEffectiveThreshold(t *testing.T) {
	var result inspection.Result
	checkDiskUsageMetric(handlers.InspectionHandler{}, &result, nil, 0, 0)
	if result.ExpectedValue == nil || !strings.Contains(*result.ExpectedValue, "80%") || !strings.Contains(*result.ExpectedValue, "90%") {
		t.Fatalf("expected = %v, want 默认阈值 80%%/90%%", result.ExpectedValue)
	}

	result = inspection.Result{}
	checkDiskUsageMetric(handlers.InspectionHandler{}, &result, &devices.SNMPMetrics{Disks: []devices.DiskMetrics{disk("/", 10, 75)}}, 70, 85)
	if result.Status != "warning" {
		t.Fatalf("status = %q, want warning（75%% ≥ 自定义警告阈值 70%%）", result.Status)
	}
	if result.ExpectedValue == nil || !strings.Contains(*result.ExpectedValue, "70%") {
		t.Fatalf("expected = %v, want 自定义阈值 70%%", result.ExpectedValue)
	}
}
