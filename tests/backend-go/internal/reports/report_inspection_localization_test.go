package reports_test

import (
	"archive/zip"
	"io"
	"os"
	"path/filepath"
	"strings"
	"testing"
	_ "unsafe"

	"github.com/your-org/inspect-system/backend-go/internal/reports"
)

//go:linkname writeInspectionReport github.com/your-org/inspect-system/backend-go/internal/reports.writeInspectionReport
func writeInspectionReport(path string, format string, data reports.InspectionReportData) (string, error)

//go:linkname resolveInspectionTaskName github.com/your-org/inspect-system/backend-go/internal/reports.resolveInspectionTaskName
func resolveInspectionTaskName(reportTitle string, inspectionRowName *string) string

func TestResolveInspectionTaskName_PrefersRealTaskNameOverDefaultTitle(t *testing.T) {
	strPtr := func(s string) *string { return &s }

	cases := []struct {
		name              string
		reportTitle       string
		inspectionRowName *string
		want              string
	}{
		{
			name:              "默认巡检报告标题优先采用底层巡检任务名",
			reportTitle:       "巡检报告",
			inspectionRowName: strPtr("核心交换机例行巡检"),
			want:              "核心交换机例行巡检",
		},
		{
			name:              "默认报表标题优先采用底层巡检任务名",
			reportTitle:       "报表",
			inspectionRowName: strPtr("接入层策略巡检"),
			want:              "接入层策略巡检",
		},
		{
			name:              "空报告标题采用底层巡检任务名",
			reportTitle:       "   ",
			inspectionRowName: strPtr("手动巡检"),
			want:              "手动巡检",
		},
		{
			name:              "自定义报告标题保留用户显式命名",
			reportTitle:       "2026年10月核心网专项巡检报告",
			inspectionRowName: strPtr("手动巡检"),
			want:              "2026年10月核心网专项巡检报告",
		},
		{
			name:              "两者皆空时兜底返回巡检报告",
			reportTitle:       "",
			inspectionRowName: nil,
			want:              "巡检报告",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := resolveInspectionTaskName(tc.reportTitle, tc.inspectionRowName); got != tc.want {
				t.Errorf("resolveInspectionTaskName(%q, %v) = %q, want %q", tc.reportTitle, tc.inspectionRowName, got, tc.want)
			}
		})
	}
}

func TestInspectionReport_LocalizationAndTaskName(t *testing.T) {
	tempDir := t.TempDir()

	testData := reports.InspectionReportData{
		InspectionName:    "核心机房例行巡检",
		InspectionID:      "INSP-74",
		InspectionTime:    "2026-10-25 15:01:00",
		Status:            "completed",
		ExecutionDuration: 1,
		SummaryStats: reports.InspectionSummaryStats{
			TotalChecks:   20,
			PassedChecks:  11,
			FailedChecks:  3,
			WarningChecks: 1,
			ErrorChecks:   0,
			PassRate:      73.3,
		},
		Devices: []reports.InspectionDeviceData{
			{
				DeviceName:       "test-switch",
				IPAddress:        "192.168.20.1",
				DeviceType:       "switch",
				InspectionStatus: "completed",
				PassRate:         73.3,
				IssueCount:       4,
				CheckResults: []reports.InspectionCheckResult{
					{
						CheckItemName: "SNMP可达性",
						CheckItemType: "snmp",
						Status:        "passed",
						ExpectedValue: "可达",
						ActualValue:   "可达",
						ExecutionTime: 12,
					},
				},
			},
		},
	}

	readArchiveText := func(path string, targets ...string) string {
		reader, err := zip.OpenReader(path)
		if err != nil {
			t.Fatalf("打开压缩文件失败 %s: %v", path, err)
		}
		defer reader.Close()

		var builder strings.Builder
		for _, f := range reader.File {
			match := false
			for _, target := range targets {
				if f.Name == target {
					match = true
					break
				}
			}
			if !match {
				continue
			}
			rc, err := f.Open()
			if err != nil {
				t.Fatalf("读取文件部件失败 %s: %v", f.Name, err)
			}
			b, _ := io.ReadAll(rc)
			rc.Close()
			builder.Write(b)
		}
		return builder.String()
	}

	// 1. 验证 Excel 导出
	excelPath := filepath.Join(tempDir, "test_inspection.xlsx")
	if _, err := writeInspectionReport(excelPath, "excel", testData); err != nil {
		t.Fatalf("writeInspectionReport excel 失败: %v", err)
	}
	excelContent := readArchiveText(excelPath, "xl/sharedStrings.xml", "xl/worksheets/sheet1.xml", "xl/worksheets/sheet3.xml")
	if strings.Contains(excelContent, "巡检ID") {
		t.Errorf("Excel 导出中不应再出现 '巡检ID'")
	}
	if !strings.Contains(excelContent, "巡检任务名称") {
		t.Errorf("Excel 导出中应包含 '巡检任务名称'")
	}
	if !strings.Contains(excelContent, "核心机房例行巡检") {
		t.Errorf("Excel 导出中应包含巡检任务名称的值")
	}
	if !strings.Contains(excelContent, "交换机") {
		t.Errorf("Excel 导出中设备类型 'switch' 应转换为中文 '交换机'")
	}
	if !strings.Contains(excelContent, "已完成") {
		t.Errorf("Excel 导出中巡检状态 'completed' 应转换为中文 '已完成'")
	}
	if !strings.Contains(excelContent, ">SNMP<") {
		t.Errorf("Excel 检查结果详情中的协议类型 'snmp' 应规范化为大写 'SNMP'")
	}

	// 2. 验证 Word 导出
	wordPath := filepath.Join(tempDir, "test_inspection.docx")
	if _, err := writeInspectionReport(wordPath, "word", testData); err != nil {
		t.Fatalf("writeInspectionReport word 失败: %v", err)
	}
	wordContent := readArchiveText(wordPath, "word/document.xml")
	if strings.Contains(wordContent, "巡检ID") {
		t.Errorf("Word 导出中不应再出现 '巡检ID'")
	}
	if !strings.Contains(wordContent, "巡检任务名称") {
		t.Errorf("Word 导出中应包含 '巡检任务名称'")
	}
	if !strings.Contains(wordContent, "核心机房例行巡检") {
		t.Errorf("Word 导出中应包含巡检任务名称的值")
	}
	if !strings.Contains(wordContent, "交换机") {
		t.Errorf("Word 导出中设备类型 'switch' 应转换为中文 '交换机'")
	}
	if !strings.Contains(wordContent, "已完成") {
		t.Errorf("Word 导出中巡检状态 'completed' 应转换为中文 '已完成'")
	}

	// 3. 验证 HTML 导出
	htmlPath := filepath.Join(tempDir, "test_inspection.html")
	if _, err := writeInspectionReport(htmlPath, "html", testData); err != nil {
		t.Fatalf("writeInspectionReport html 失败: %v", err)
	}
	htmlBytes, err := os.ReadFile(htmlPath)
	if err != nil {
		t.Fatalf("读取 HTML 报告失败: %v", err)
	}
	htmlContent := string(htmlBytes)
	if strings.Contains(htmlContent, "巡检ID") {
		t.Errorf("HTML 导出中不应再出现 '巡检ID'")
	}
	if !strings.Contains(htmlContent, "巡检任务名称") {
		t.Errorf("HTML 导出中应包含 '巡检任务名称'")
	}
	if !strings.Contains(htmlContent, "交换机") {
		t.Errorf("HTML 导出中设备类型 'switch' 应转换为中文 '交换机'")
	}
	if !strings.Contains(htmlContent, "已完成") {
		t.Errorf("HTML 导出中巡检状态 'completed' 应转换为中文 '已完成'")
	}

	// 4. 验证 PDF 导出
	pdfPath := filepath.Join(tempDir, "test_inspection.pdf")
	if _, err := writeInspectionReport(pdfPath, "pdf", testData); err != nil {
		t.Fatalf("writeInspectionReport pdf 失败: %v", err)
	}
	pdfBytes, err := os.ReadFile(pdfPath)
	if err != nil {
		t.Fatalf("读取 PDF 报告失败: %v", err)
	}
	if len(pdfBytes) == 0 {
		t.Errorf("生成的 PDF 文件为空")
	}
}
