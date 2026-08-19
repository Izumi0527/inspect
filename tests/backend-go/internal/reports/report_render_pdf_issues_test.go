package reports_test

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"

	"github.com/your-org/inspect-system/backend-go/internal/reports"
	"gorm.io/datatypes"
)

// inspectionPayloadWithIssues 构造一份含 1 警告 + 1 失败的巡检数据，
// 复现导出 PDF 时「有异常但报告不突出」的场景。
func inspectionPayloadWithIssues() datatypes.JSON {
	return datatypes.JSON([]byte(`{
		"inspection_data": {
			"inspection_name": "核心区例行巡检",
			"inspection_id": "INSP-33",
			"inspection_time": "2026-08-19 14:13:12",
			"execution_duration": 42,
			"summary_stats": {
				"total_checks": 9,
				"passed_checks": 7,
				"warning_checks": 1,
				"failed_checks": 1,
				"error_checks": 0,
				"pass_rate": 77.8
			},
			"devices": [
				{
					"device_name": "核心交换机-01",
					"ip_address": "192.168.20.1",
					"device_type": "switch",
					"vendor": "huawei",
					"model": "S5700-28C-HI",
					"inspection_status": "completed",
					"check_results": [
						{"check_item_name": "设备连通性", "check_item_type": "icmp", "status": "pass",
						 "expected_value": "可达", "actual_value": "15.00ms"},
						{"check_item_name": "CPU使用率", "check_item_type": "snmp", "status": "warning",
						 "expected_value": "< 70%", "actual_value": "72.2%"},
						{"check_item_name": "设备温度", "check_item_type": "snmp", "status": "failed",
						 "expected_value": "< 60C", "actual_value": "75C"}
					]
				}
			]
		}
	}`))
}

// inspectionPayloadWithHiddenCheck 复现「统计摘要 9 = 7 + 1 + 0 少一项，
// 却显示 2 个问题点」的口径矛盾：汇总列声明 9 项，明细里第 9 项状态是
// 汇总列无法承载的 error。
func inspectionPayloadWithHiddenCheck() datatypes.JSON {
	return datatypes.JSON([]byte(`{
		"inspection_data": {
			"inspection_name": "核心区例行巡检",
			"inspection_id": "INSP-35",
			"summary_stats": {
				"total_checks": 9,
				"passed_checks": 7,
				"warning_checks": 1,
				"failed_checks": 0,
				"error_checks": 0,
				"pass_rate": 77.8
			},
			"devices": [
				{
					"device_name": "核心交换机-01",
					"ip_address": "192.168.20.1",
					"device_type": "switch",
					"inspection_status": "completed",
					"check_results": [
						{"check_item_name": "检查1", "check_item_type": "snmp", "status": "pass"},
						{"check_item_name": "检查2", "check_item_type": "snmp", "status": "pass"},
						{"check_item_name": "CPU使用率", "check_item_type": "snmp", "status": "warning",
						 "expected_value": "< 70%", "actual_value": "72.2%"},
						{"check_item_name": "SNMP采集", "check_item_type": "snmp", "status": "error",
						 "expected_value": "采集成功", "actual_value": "超时无响应"}
					]
				}
			]
		}
	}`))
}

func renderInspectionPDF(t *testing.T, filters datatypes.JSON) string {
	t.Helper()
	generatedBy := "admin"
	generatedAt := time.Date(2026, 8, 19, 14, 13, 12, 0, time.UTC)
	report := reports.Report{
		ID:            33,
		Title:         "网络设备巡检报告",
		ReportType:    "inspection",
		StartDate:     generatedAt,
		EndDate:       generatedAt,
		GeneratedBy:   &generatedBy,
		GeneratedAt:   &generatedAt,
		DeviceFilters: filters,
	}

	path, err := reports.GenerateReportFile(context.Background(), nil, t.TempDir(), report, "pdf")
	if err != nil {
		if strings.Contains(err.Error(), "未找到可用的PDF中文字体") {
			t.Skipf("当前环境缺少 PDF 中文字体，跳过渲染断言: %v", err)
		}
		t.Fatalf("GenerateReportFile() error = %v", err)
	}
	if filepath.Ext(path) != ".pdf" {
		t.Fatalf("GenerateReportFile() ext = %q, want .pdf", filepath.Ext(path))
	}
	return path
}

// TestInspectionPDF_ShouldRenderIssueSection 断言含异常的巡检报告能完整
// 渲染出「异常与告警」章节（含逐行染色），且文件非空。中文字形以子集
// 嵌入，pdftotext 抽不出字符，因此这里断言渲染成功 + 结构完整性，具体
// 文案由 TestCollectInspectionIssues 系列覆盖。
func TestInspectionPDF_ShouldRenderIssueSection(t *testing.T) {
	path := renderInspectionPDF(t, inspectionPayloadWithIssues())

	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("Stat(%q) error = %v", path, err)
	}
	if info.Size() < 10*1024 {
		t.Fatalf("PDF 体积 = %d 字节，疑似渲染中断", info.Size())
	}

	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile(%q) error = %v", path, err)
	}
	if !strings.HasPrefix(string(raw[:5]), "%PDF-") {
		t.Fatalf("输出不是合法 PDF，头部 = %q", string(raw[:5]))
	}

	// 有异常时报告必须多于 1 页（首页新增异常清单会把设备明细顶到次页）。
	if pages := countPDFPages(t, path); pages < 2 {
		t.Fatalf("页数 = %d，异常清单章节疑似未渲染", pages)
	}
}

// TestInspectionPDF_ShouldRenderWithoutIssues 全部通过时走「无异常」横幅
// 分支，确保不会因为空清单 panic 或产生空表。
func TestInspectionPDF_ShouldRenderWithoutIssues(t *testing.T) {
	clean := datatypes.JSON([]byte(`{
		"inspection_data": {
			"inspection_name": "核心区例行巡检",
			"inspection_id": "INSP-34",
			"summary_stats": {"total_checks": 2, "passed_checks": 2, "pass_rate": 100},
			"devices": [
				{
					"device_name": "核心交换机-01",
					"ip_address": "192.168.20.1",
					"device_type": "switch",
					"inspection_status": "completed",
					"check_results": [
						{"check_item_name": "设备连通性", "check_item_type": "icmp", "status": "pass",
						 "expected_value": "可达", "actual_value": "15.00ms"},
						{"check_item_name": "CPU使用率", "check_item_type": "snmp", "status": "pass",
						 "expected_value": "< 70%", "actual_value": "12.0%"}
					]
				}
			]
		}
	}`))

	path := renderInspectionPDF(t, clean)
	info, err := os.Stat(path)
	if err != nil {
		t.Fatalf("Stat(%q) error = %v", path, err)
	}
	if info.Size() < 10*1024 {
		t.Fatalf("PDF 体积 = %d 字节，疑似渲染中断", info.Size())
	}
}

// countPDFPages 用 pdfinfo 读页数；缺工具时跳过该项断言。
func countPDFPages(t *testing.T, path string) int {
	t.Helper()
	bin, err := exec.LookPath("pdfinfo")
	if err != nil {
		t.Logf("未找到 pdfinfo，跳过页数断言")
		return 2
	}
	out, err := exec.Command(bin, path).Output()
	if err != nil {
		t.Logf("pdfinfo 执行失败，跳过页数断言: %v", err)
		return 2
	}
	for _, line := range strings.Split(string(out), "\n") {
		if !strings.HasPrefix(line, "Pages:") {
			continue
		}
		if pages, err := strconv.Atoi(strings.TrimSpace(strings.TrimPrefix(line, "Pages:"))); err == nil {
			return pages
		}
	}
	return 2
}

// TestInspectionSummary_ShouldReconcileHiddenCheck 锁定「统计摘要对不上」
// 的回归：汇总列声明 9 项但只交代 8 项，第 9 项（error）在旧口径下既不
// 出现在任何一张卡里、又被设备问题数算作问题，于是「1 个告警 / 2 个问题
// 点」。修复后统计以明细为唯一事实来源，恒等式必须成立。
//
// 走 HTML 导出断言：它把 SummaryStats 与 IssueCount 原样渲染成文本，是
// 跨包观测这些未导出计算结果的最短路径。
func TestInspectionSummary_ShouldReconcileHiddenCheck(t *testing.T) {
	generatedAt := time.Date(2026, 8, 19, 14, 56, 37, 0, time.UTC)
	report := reports.Report{
		ID:            35,
		Title:         "核心区例行巡检",
		ReportType:    "inspection",
		StartDate:     generatedAt,
		EndDate:       generatedAt,
		GeneratedAt:   &generatedAt,
		DeviceFilters: inspectionPayloadWithHiddenCheck(),
	}

	path, err := reports.GenerateReportFile(context.Background(), nil, t.TempDir(), report, "html")
	if err != nil {
		t.Fatalf("GenerateReportFile() error = %v", err)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile(%q) error = %v", path, err)
	}
	html := string(raw)

	// 明细共 4 项：2 通过 + 1 警告 + 1 错误。旧逻辑会沿用汇总列的 9/7/1/0。
	for _, want := range []struct {
		label string
		block string
	}{
		{"总检查项", `<div class="label">总检查项</div>`},
		{"通过", `<div class="label">通过</div>`},
	} {
		if !strings.Contains(html, want.block) {
			t.Fatalf("HTML 缺少 %s 统计块", want.label)
		}
	}
	if strings.Contains(html, `<div class="value">9</div>`) {
		t.Fatalf("统计摘要仍沿用 inspections 汇总列的 9 项，明细只有 4 项，口径未收敛")
	}
	if !strings.Contains(html, `<div class="value">4</div>`) {
		t.Fatalf("总检查项未按明细重算为 4 项")
	}

	// 设备问题数必须等于「警告 + 失败 + 错误 + 未知」= 2，且与摘要同源。
	if !strings.Contains(html, "<td>2</td>") {
		t.Fatalf("设备问题数未按统一口径重算为 2")
	}
}

// TestInspectionSummary_ShouldExcludeSkippedFromPassRate 跳过项不计入
// 通过率分母：未执行的检查既不算通过，也不该拉低通过率。
func TestInspectionSummary_ShouldExcludeSkippedFromPassRate(t *testing.T) {
	generatedAt := time.Date(2026, 8, 19, 15, 0, 0, 0, time.UTC)
	report := reports.Report{
		ID:          36,
		Title:       "跳过项巡检",
		ReportType:  "inspection",
		StartDate:   generatedAt,
		EndDate:     generatedAt,
		GeneratedAt: &generatedAt,
		DeviceFilters: datatypes.JSON([]byte(`{
			"inspection_data": {
				"inspection_name": "跳过项巡检",
				"devices": [{
					"device_name": "SW-01", "ip_address": "10.0.0.1", "device_type": "switch",
					"check_results": [
						{"check_item_name": "检查1", "status": "pass"},
						{"check_item_name": "检查2", "status": "pass"},
						{"check_item_name": "检查3", "status": "skipped"}
					]
				}]
			}
		}`)),
	}

	path, err := reports.GenerateReportFile(context.Background(), nil, t.TempDir(), report, "html")
	if err != nil {
		t.Fatalf("GenerateReportFile() error = %v", err)
	}
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("ReadFile(%q) error = %v", path, err)
	}
	// 2 通过 / 3 总项，其中 1 项跳过 → 分母 2，通过率 100.0%
	if !strings.Contains(string(raw), "通过率: 100.0%") {
		t.Fatalf("跳过项被计入通过率分母，未得到 100.0%%")
	}
}
