package reports

// InspectionCategoryStat 表示单个巡检运维域的检查统计。
type InspectionCategoryStat struct {
	Category string
	Total    int
	Passed   int
	Warning  int
	Failed   int
	Skipped  int
	PassRate float64
}

// StackMemberReport 堆叠成员条目。
type StackMemberReport struct {
	ID       string `json:"id"`
	Role     string `json:"role"`
	Priority *int   `json:"priority"`
	MAC      string `json:"mac"`
	Verdict  string `json:"verdict"`
}

// StackPortReport 堆叠端口条目。
type StackPortReport struct {
	Name    string `json:"name"`
	Status  string `json:"status"`
	Verdict string `json:"verdict"`
}

// StackStatusReport 对应 details 中 kind=stack_status 的载荷。
type StackStatusReport struct {
	Kind          string              `json:"kind"`
	Enabled       bool                `json:"enabled"`
	Standalone    bool                `json:"standalone"`
	Topology      string              `json:"topology"`
	MemberCount   int                 `json:"member_count"`
	PortUpCount   int                 `json:"port_up_count"`
	PortDownCount int                 `json:"port_down_count"`
	Members       []StackMemberReport `json:"members"`
	Ports         []StackPortReport   `json:"ports"`
}

// InterfaceStatusEntryReport 对应接口状态一致性 / 半双工明细行。
type InterfaceStatusEntryReport struct {
	Name        string `json:"name"`
	Alias       string `json:"alias"`
	SpeedMbps   *int64 `json:"speed_mbps"`
	StatusLabel string `json:"status_label"`
	DuplexLabel string `json:"duplex_label"`
	Verdict     string `json:"verdict"`
	Reason      string `json:"reason"`
}

// InterfaceStatusDetailReport 对应 details 中 kind=interface_status_detail 的载荷。
type InterfaceStatusDetailReport struct {
	Kind           string                       `json:"kind"`
	SubKind        string                       `json:"sub_kind"`
	TotalEvaluated int                          `json:"total_evaluated"`
	AbnormalCount  int                          `json:"abnormal_count"`
	AdminDownCount *int                         `json:"admin_down_count"`
	IdleCount      *int                         `json:"idle_count"`
	Entries        []InterfaceStatusEntryReport `json:"entries"`
}

// FlashPartitionReport Flash 存储单个分区条目。
type FlashPartitionReport struct {
	Name       string  `json:"name"`
	TotalBytes int64   `json:"total_bytes"`
	UsedBytes  int64   `json:"used_bytes"`
	FreeBytes  int64   `json:"free_bytes"`
	Percent    float64 `json:"percent"`
	Verdict    string  `json:"verdict"`
}

// FlashUsageReport 对应 details 中 kind=flash_usage 的载荷。
type FlashUsageReport struct {
	Kind              string                              `json:"kind"`
	Total             int                                 `json:"total"`
	Evaluated         int                                 `json:"evaluated"`
	OverWarning       int                                 `json:"over_warning"`
	OverCritical      int                                 `json:"over_critical"`
	WarningThreshold  float64                             `json:"warning_threshold"`
	CriticalThreshold float64                             `json:"critical_threshold"`
	Partitions        []FlashPartitionReport              `json:"partitions"`
	Skipped           []InterfaceUtilizationSkippedReport `json:"skipped"`
}

func parseStackStatusDetails(raw *string) *StackStatusReport {
	return parseTypedDetails[StackStatusReport](raw, "stack_status")
}

func parseInterfaceStatusDetailDetails(raw *string) *InterfaceStatusDetailReport {
	return parseTypedDetails[InterfaceStatusDetailReport](raw, "interface_status_detail")
}

func parseFlashUsageDetails(raw *string) *FlashUsageReport {
	return parseTypedDetails[FlashUsageReport](raw, "flash_usage")
}

// checkDomainOf 提取单条检查结果的所属中文运维域。
func checkDomainOf(item InspectionCheckResult) string {
	metric := ""
	if item.Threshold != nil {
		metric = item.Threshold.Metric
	}
	return resolveCheckDomain(item.Category, item.CheckItemName, item.CheckItemType, metric)
}

// computeInspectionCategoryStats 按四大运维域聚合检查统计与分类通过率。
// 通过率分母与全局口径一致：剔除跳过与不适用项。
func computeInspectionCategoryStats(devices []InspectionDeviceData) []InspectionCategoryStat {
	buckets := make(map[string]*InspectionCategoryStat, len(inspectionCategoryOrder))
	for _, device := range devices {
		for _, item := range device.CheckResults {
			domain := checkDomainOf(item)
			stat, ok := buckets[domain]
			if !ok {
				stat = &InspectionCategoryStat{Category: domain}
				buckets[domain] = stat
			}
			accumulateCategoryStat(stat, item.Status)
		}
	}

	stats := make([]InspectionCategoryStat, 0, len(buckets))
	for _, domain := range inspectionCategoryOrder {
		stat, ok := buckets[domain]
		if !ok || stat.Total == 0 {
			continue
		}
		if evaluated := stat.Total - stat.Skipped; evaluated > 0 {
			stat.PassRate = float64(stat.Passed) / float64(evaluated) * 100
		}
		stats = append(stats, *stat)
	}
	return stats
}

func accumulateCategoryStat(stat *InspectionCategoryStat, status string) {
	stat.Total++
	switch normalizeCheckStatus(status) {
	case checkStatusPass:
		stat.Passed++
	case checkStatusWarning:
		stat.Warning++
	case checkStatusSkipped, checkStatusNotApplicable:
		stat.Skipped++
	default:
		stat.Failed++
	}
}
