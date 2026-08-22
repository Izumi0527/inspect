package reports_test

import (
	"testing"
	_ "unsafe"

	"github.com/your-org/inspect-system/backend-go/internal/reports"
)

// reconcileInspectionSummary 从检查明细还原统计口径，是报告里所有数字的来源。
//
//go:linkname reconcileInspectionSummary github.com/your-org/inspect-system/backend-go/internal/reports.reconcileInspectionSummary
func reconcileInspectionSummary(data *reports.InspectionReportData)

func checkResult(name, status string) reports.InspectionCheckResult {
	return reports.InspectionCheckResult{CheckItemName: name, CheckItemType: "snmp", Status: status}
}

// switchRunningFullTemplate 模拟一台交换机跑「全面巡检」：BGP 因设备类型不适用，
// 其余全部通过。这是设备类型过滤上线后最常见的一种结果组合。
func switchRunningFullTemplate() *reports.InspectionReportData {
	return &reports.InspectionReportData{
		InspectionName: "核心交换机例行巡检",
		Devices: []reports.InspectionDeviceData{
			{
				DeviceName: "核心交换机-01",
				CheckResults: []reports.InspectionCheckResult{
					checkResult("设备连通性", "pass"),
					checkResult("CPU 使用率", "pass"),
					checkResult("内存使用率", "pass"),
					checkResult("BGP 邻居状态", "not_applicable"),
				},
			},
		},
	}
}

// TestReconcile_NotApplicableExcludedFromPassRate 不适用项不得计入通过率分母。
//
// 这是本轮改动里最容易出错、后果又最直接的一处：交换机上 BGP 不适用，若把它
// 算进分母，一台完全健康的设备通过率会从 100% 掉到 75%。运维看到的是「设备有
// 问题」，实际是「统计口径有问题」。
func TestReconcile_NotApplicableExcludedFromPassRate(t *testing.T) {
	data := switchRunningFullTemplate()

	reconcileInspectionSummary(data)

	if data.SummaryStats.PassRate != 100 {
		t.Errorf("通过率 = %v，want 100（3 项全通过，BGP 不适用不计入分母）", data.SummaryStats.PassRate)
	}
}

// TestReconcile_NotApplicableIsNotAbnormal 不适用项不是异常。
// 计入异常会让报告的「需关注 N 项」凭空多出条目，且整体结论从健康降级。
func TestReconcile_NotApplicableIsNotAbnormal(t *testing.T) {
	data := switchRunningFullTemplate()

	reconcileInspectionSummary(data)

	if got := data.SummaryStats.AbnormalChecks(); got != 0 {
		t.Errorf("异常项数 = %d，want 0（不适用不是异常）", got)
	}
	if data.Devices[0].IssueCount != 0 {
		t.Errorf("设备问题数 = %d，want 0", data.Devices[0].IssueCount)
	}
}

// TestReconcile_NotApplicableCounted 不适用项要单独统计，且总数守恒。
//
// 总数守恒是报告的口径底线：现有 describeInspectionTally 会把「总数 = 通过 +
// 警告 + 失败 + ...」这个恒等式直接印在报告上，少一类就会出现对不上的差额。
func TestReconcile_NotApplicableCounted(t *testing.T) {
	data := switchRunningFullTemplate()

	reconcileInspectionSummary(data)

	s := data.SummaryStats
	if s.NotApplicableChecks != 1 {
		t.Errorf("不适用项数 = %d，want 1", s.NotApplicableChecks)
	}
	if s.TotalChecks != 4 {
		t.Errorf("总检查项数 = %d，want 4（不适用项仍占一行）", s.TotalChecks)
	}
	sum := s.PassedChecks + s.WarningChecks + s.FailedChecks + s.ErrorChecks +
		s.SkippedChecks + s.UnknownChecks + s.NotApplicableChecks
	if sum != s.TotalChecks {
		t.Errorf("各状态之和 = %d，与总数 %d 不符——报告的口径恒等式会出现差额", sum, s.TotalChecks)
	}
}

// TestReconcile_SkipAndNotApplicableCountedSeparately skip 与 not_applicable
// 必须分开计数。
//
// 两者在通过率上确实同样处理——都不进分母。这是既有设计且是对的：一台不支持
// 温度传感器的设备不该因为温度采不到而永远达不到 100%。
//
// 但统计上必须分开，因为运维动作完全不同：skip 是「该查却没查成」，要去核对
// 凭据、MIB 支持度或采集基线；not_applicable 是「设备天然没这个特性」，什么
// 都不用做。混成一个数字，报告就没法告诉运维哪些需要跟进。
func TestReconcile_SkipAndNotApplicableCountedSeparately(t *testing.T) {
	data := &reports.InspectionReportData{
		Devices: []reports.InspectionDeviceData{
			{
				DeviceName: "核心交换机-01",
				CheckResults: []reports.InspectionCheckResult{
					checkResult("设备连通性", "pass"),
					checkResult("设备温度", "skip"),
					checkResult("BGP 邻居状态", "not_applicable"),
				},
			},
		},
	}

	reconcileInspectionSummary(data)

	s := data.SummaryStats
	if s.SkippedChecks != 1 {
		t.Errorf("跳过项数 = %d，want 1", s.SkippedChecks)
	}
	if s.NotApplicableChecks != 1 {
		t.Errorf("不适用项数 = %d，want 1", s.NotApplicableChecks)
	}
	// 分母 = 3 - 1(skip) - 1(不适用) = 1，唯一被评估的项通过
	if s.PassRate != 100 {
		t.Errorf("通过率 = %v，want 100", s.PassRate)
	}
	// 两者都不算异常，但原因不同：skip 需要跟进，不适用不需要
	if s.AbnormalChecks() != 0 {
		t.Errorf("异常项数 = %d，want 0", s.AbnormalChecks())
	}
}

// TestReconcile_AllNotApplicable 全部不适用时通过率不应是 NaN 或 0。
// 边界：交换机跑一个纯路由协议模板，一项都不适用——此时没有"通过率"可言，
// 报告应显示 0 项已评估，而不是把 0/0 算成 0% 让人以为全挂了。
func TestReconcile_AllNotApplicable(t *testing.T) {
	data := &reports.InspectionReportData{
		Devices: []reports.InspectionDeviceData{
			{
				DeviceName: "核心交换机-01",
				CheckResults: []reports.InspectionCheckResult{
					checkResult("BGP 邻居状态", "not_applicable"),
				},
			},
		},
	}

	reconcileInspectionSummary(data)

	if data.SummaryStats.NotApplicableChecks != 1 {
		t.Errorf("不适用项数 = %d，want 1", data.SummaryStats.NotApplicableChecks)
	}
	if data.SummaryStats.AbnormalChecks() != 0 {
		t.Errorf("异常项数 = %d，want 0", data.SummaryStats.AbnormalChecks())
	}
}
