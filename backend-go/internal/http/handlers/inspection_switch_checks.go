package handlers

import (
	"fmt"
	"sort"
	"strings"

	"github.com/your-org/inspect-system/backend-go/internal/devices"
	"github.com/your-org/inspect-system/backend-go/internal/inspection"
)

// checkStackStatusMetric 检查堆叠成员角色、拓扑完整性与物理堆叠端口状态。
func (h InspectionHandler) checkStackStatusMetric(result *inspection.Result, metrics *devices.SNMPMetrics) {
	result.ExpectedValue = stringPtr("堆叠成员角色完整、拓扑成环且物理堆叠端口 UP")
	if metrics == nil || (len(metrics.Stack.Members) == 0 && len(metrics.Stack.Ports) == 0 && metrics.Stack.Enabled == nil && metrics.Stack.IsStackDevice == nil) {
		result.Status, result.Message = "skip", stringPtr("设备未上报堆叠/集群数据（非堆叠设备或不支持对应 MIB）")
		return
	}
	enabled, standalone, topology := resolveStackModeAndTopo(metrics.Stack)
	members, hasStandby := evaluateStackMembers(metrics.Stack.Members)
	ports, upCount, downCount := evaluateStackPorts(metrics.Stack.Ports)
	result.Details = encodeDetailsPayload(map[string]interface{}{
		"kind": "stack_status", "enabled": enabled, "standalone": standalone, "topology": topology,
		"member_count": len(members), "port_up_count": upCount, "port_down_count": downCount,
		"members": members, "ports": ports,
	})
	if standalone {
		actual := "单机独立运行"
		result.ActualValue, result.Status = &actual, "pass"
		result.Message = stringPtr("设备以单机独立运行模式工作（未启用堆叠或仅单台成员）")
		return
	}
	actual := fmt.Sprintf("%d 台成员，拓扑 %s，堆叠口 UP %d / DOWN %d", len(members), topology, upCount, downCount)
	result.ActualValue = &actual
	if downCount > 0 {
		result.Status, result.Message = "fail", stringPtr(fmt.Sprintf("存在 %d 个堆叠物理端口处于 DOWN 状态，堆叠链路或冗余受损", downCount))
	} else if len(ports) == 0 || topology == "chain" || (len(members) >= 2 && !hasStandby) {
		result.Status, result.Message = "warning", stringPtr("堆叠冗余降级（缺少堆叠端口、拓扑退化为链形 chain 或多成员缺少 standby 角色）")
	} else {
		result.Status, result.Message = "pass", stringPtr(fmt.Sprintf("堆叠运行正常：%d 台成员，%s 拓扑，堆叠端口均 UP", len(members), topology))
	}
}

func resolveStackModeAndTopo(s devices.StackMetrics) (bool, bool, string) {
	if (s.Enabled != nil && !*s.Enabled) || (s.IsStackDevice != nil && !*s.IsStackDevice) {
		return false, true, "standalone"
	}
	if len(s.Members) == 1 && len(s.Ports) == 0 {
		return (s.Enabled != nil && *s.Enabled) || (s.IsStackDevice != nil && *s.IsStackDevice), true, "standalone"
	}
	topo := strings.ToLower(strings.TrimSpace(s.TopoTypeLabel))
	if s.TopoType != nil && *s.TopoType == 2 {
		topo = "ring"
	} else if s.TopoType != nil && *s.TopoType == 1 {
		topo = "chain"
	} else if topo == "" {
		topo = "unknown"
	}
	return true, false, topo
}

func evaluateStackMembers(raw []devices.StackMemberMetrics) ([]stackMemberEntry, bool) {
	entries, hasStandby := make([]stackMemberEntry, 0, len(raw)), false
	roleNames := map[int64]string{1: "master", 2: "standby", 3: "slave"}
	for _, m := range raw {
		id, role := strings.TrimSpace(m.Index), strings.ToLower(strings.TrimSpace(m.RoleLabel))
		if m.MemberID != nil {
			id = fmt.Sprintf("%d", *m.MemberID)
		}
		if role == "" && m.Role != nil {
			role = roleNames[*m.Role]
		}
		hasStandby = hasStandby || role == "standby"
		entries = append(entries, stackMemberEntry{ID: id, Role: role, Priority: m.Priority, MAC: strings.TrimSpace(m.MAC), Verdict: rowVerdictPass})
	}
	return entries, hasStandby
}

func evaluateStackPorts(raw []devices.StackPortMetrics) ([]stackPortEntry, int, int) {
	entries, upCount, downCount := make([]stackPortEntry, 0, len(raw)), 0, 0
	for _, p := range raw {
		name := firstNonEmpty(strings.TrimSpace(p.Name), p.Index)
		label := strings.ToLower(strings.TrimSpace(p.StatusLabel))
		isDown := label == "down" || (p.Status != nil && (*p.Status == 2 || *p.Status == 4) && label != "up")
		isUp := !isDown && (label == "up" || (p.Status != nil && (*p.Status == 1 || *p.Status == 3) && label == ""))
		verdict, statusText := rowVerdictSkip, label
		if isDown {
			downCount++
			verdict, statusText = rowVerdictFail, firstNonEmpty(statusText, "down")
		} else if isUp {
			upCount++
			verdict, statusText = rowVerdictPass, firstNonEmpty(statusText, "up")
		} else if statusText == "" && p.Status != nil {
			statusText = fmt.Sprintf("%d", *p.Status)
		}
		entries = append(entries, stackPortEntry{Name: name, Status: statusText, Verdict: verdict})
	}
	return entries, upCount, downCount
}

// checkConfigSaveStatusMetric 比对运行配置修改时间与保存时间，检测未保存变更。
func (h InspectionHandler) checkConfigSaveStatusMetric(result *inspection.Result, metrics *devices.SNMPMetrics) {
	result.ExpectedValue = stringPtr("运行配置变更已及时保存至启动配置")
	if metrics == nil || (metrics.ConfigSave.RunModifiedLast == nil && metrics.ConfigSave.RunSavedLast == nil) {
		result.Status, result.Message = "skip", stringPtr("设备未上报配置修改与保存时间戳（不支持对应配置管理 MIB）")
		return
	}
	cs := metrics.ConfigSave
	unsaved := isConfigUnsaved(cs)
	result.Details = encodeDetailsPayload(map[string]interface{}{
		"kind": "config_save_status", "unsaved": unsaved,
		"run_modified_last_sec": cs.RunModifiedLast, "run_saved_last_sec": cs.RunSavedLast, "start_modified_last_sec": cs.StartModifiedLast,
	})
	if unsaved {
		actual := "存在未保存配置变更"
		result.ActualValue, result.Status = &actual, "warning"
		result.Message = stringPtr("运行配置存在未保存变更，设备异常掉电或重启将导致配置丢失，请及时执行 save")
		return
	}
	actual := "运行配置已保存"
	result.ActualValue, result.Status = &actual, "pass"
	result.Message = stringPtr("运行配置与启动配置已保存一致")
}

func isConfigUnsaved(cs devices.ConfigSaveMetrics) bool {
	if cs.RunModifiedTicks != nil && cs.RunSavedTicks != nil {
		modT, savedT := *cs.RunModifiedTicks, *cs.RunSavedTicks
		if savedT == 0 && (cs.StartModifiedLast == nil || *cs.StartModifiedLast == 0) && modT > 0 {
			return true
		}
		// 32 位 TimeTicks 模差（容差 500 厘秒 = 5 秒）防跨 497.1 天回绕误报/漏报
		delta := uint32(modT) - uint32(savedT)
		return delta > 500 && delta < 0x80000000
	}
	if cs.RunModifiedLast == nil || cs.RunSavedLast == nil {
		return cs.IsSaved != nil && !*cs.IsSaved
	}
	mod, saved := *cs.RunModifiedLast, *cs.RunSavedLast
	if saved == 0 && (cs.StartModifiedLast == nil || *cs.StartModifiedLast == 0) && mod > 0 {
		return true
	}
	const timeTicksPeriodSec = 42949673
	if mod >= 0 && saved >= 0 {
		delta := ((mod-saved)%timeTicksPeriodSec + timeTicksPeriodSec) % timeTicksPeriodSec
		return delta > 5 && delta < timeTicksPeriodSec/2
	}
	return mod > saved+5
}

// checkVLANStatusMetric 检查 VLAN 容量使用率与二层转发表统计。
func (h InspectionHandler) checkVLANStatusMetric(result *inspection.Result, metrics *devices.SNMPMetrics, bounds thresholdBounds) {
	warning, critical := bounds.resolve(80, 95)
	result.ExpectedValue = stringPtr(fmt.Sprintf("VLAN 容量使用率 < %.0f%%（警告 ≥%.0f%%，故障 ≥%.0f%%）", warning, warning, critical))
	result.Details = buildThresholdDetails("vlan_status", warning, critical, "%")
	if metrics == nil || (metrics.VLAN.BridgeNumPorts == nil && metrics.VLAN.MaxVlanID == nil && metrics.VLAN.MaxSupportedVlans == nil && metrics.VLAN.NumVlans == nil && metrics.VLAN.GvrpStatus == nil && metrics.VLAN.FdbDynamicCount == nil) {
		result.Status, result.Message = "skip", stringPtr("设备未上报 VLAN 与转发表数据（不支持 Q-BRIDGE-MIB）")
		return
	}
	v := metrics.VLAN
	var usagePtr *float64
	if v.NumVlans != nil && *v.NumVlans >= 0 && v.MaxSupportedVlans != nil && *v.MaxSupportedVlans > 0 {
		pct := float64(*v.NumVlans) / float64(*v.MaxSupportedVlans) * 100
		usagePtr = &pct
	}
	var gvrp *bool
	if v.GvrpStatus != nil {
		enabled := *v.GvrpStatus == 1
		gvrp = &enabled
	}
	payload := map[string]interface{}{
		"kind": "vlan_status", "num_vlans": v.NumVlans, "max_supported_vlans": v.MaxSupportedVlans,
		"max_vlan_id": v.MaxVlanID, "bridge_ports": v.BridgeNumPorts, "dynamic_mac_count": v.FdbDynamicCount,
		"gvrp_enabled": gvrp, "usage_percent": usagePtr,
	}
	for k, val := range thresholdDetailsPayload("vlan_status", warning, critical, "%") {
		payload[k] = val
	}
	result.Details = encodeDetailsPayload(payload)
	if usagePtr == nil {
		actual := formatVLANCountSummary(v)
		result.ActualValue, result.Status = &actual, "pass"
		result.Message = stringPtr(fmt.Sprintf("VLAN 与转发表采集完成（%s，未上报最大支持 VLAN 数，仅作计数展示）", actual))
		return
	}
	usage := *usagePtr
	actual := fmt.Sprintf("VLAN %d/%d (%.1f%%)", *v.NumVlans, *v.MaxSupportedVlans, usage)
	result.ActualValue = &actual
	if usage >= critical {
		result.Status, result.Message = "fail", stringPtr(fmt.Sprintf("VLAN 使用率过高: %.1f%% (故障阈值: %.0f%%)", usage, critical))
	} else if usage >= warning {
		result.Status, result.Message = "warning", stringPtr(fmt.Sprintf("VLAN 使用率较高: %.1f%% (警告阈值: %.0f%%)", usage, warning))
	} else {
		result.Status, result.Message = "pass", stringPtr(fmt.Sprintf("VLAN 使用率正常: %d/%d (%.1f%%)", *v.NumVlans, *v.MaxSupportedVlans, usage))
	}
}

func formatVLANCountSummary(v devices.VLANMetrics) string {
	var parts []string
	if v.NumVlans != nil {
		parts = append(parts, fmt.Sprintf("活跃 VLAN %d 个", *v.NumVlans))
	}
	if v.FdbDynamicCount != nil {
		parts = append(parts, fmt.Sprintf("动态 MAC 表项 %d 条", *v.FdbDynamicCount))
	}
	return firstNonEmpty(strings.Join(parts, "，"), "已采集桥接端口信息")
}

// checkFlashUsageMetric 逐分区检查交换机 Flash 存储使用率。
func (h InspectionHandler) checkFlashUsageMetric(result *inspection.Result, metrics *devices.SNMPMetrics, bounds thresholdBounds) {
	warning, critical := bounds.resolve(80, 90)
	result.ExpectedValue = stringPtr(fmt.Sprintf("各 Flash 分区使用率 < %.0f%%（警告 ≥%.0f%%，故障 ≥%.0f%%）", warning, warning, critical))
	result.Details = buildThresholdDetails("flash_usage", warning, critical, "%")
	if metrics == nil || len(metrics.FlashPartitions) == 0 {
		result.Status, result.Message = "skip", stringPtr("设备未上报 Flash 存储分区数据（不支持对应 Flash MIB）")
		return
	}
	entries, skipped, overWarn, overCrit := evaluateFlashPartitions(metrics.FlashPartitions, warning, critical)
	payload := map[string]interface{}{
		"kind": "flash_usage", "total": len(metrics.FlashPartitions), "evaluated": len(entries),
		"over_warning": overWarn, "over_critical": overCrit, "warning_threshold": warning, "critical_threshold": critical,
		"partitions": entries, "skipped": skipped,
	}
	for k, val := range thresholdDetailsPayload("flash_usage", warning, critical, "%") {
		payload[k] = val
	}
	result.Details = encodeDetailsPayload(payload)
	if len(entries) == 0 {
		result.Status, result.Message = "skip", stringPtr(fmt.Sprintf("采集到 %d 个 Flash 分区，但容量无效或缺少空间数据", len(metrics.FlashPartitions)))
		return
	}
	peak := entries[0]
	actual := fmt.Sprintf("峰值 %.1f%%（%s）；%d/%d 分区超阈值", peak.Percent, peak.Name, overWarn, len(entries))
	result.ActualValue = &actual
	if overCrit > 0 {
		result.Status, result.Message = "fail", stringPtr(fmt.Sprintf("%d 个 Flash 分区使用率达到故障阈值 %.0f%%（峰值 %s %.1f%%）", overCrit, critical, peak.Name, peak.Percent))
	} else if overWarn > 0 {
		result.Status, result.Message = "warning", stringPtr(fmt.Sprintf("%d 个 Flash 分区使用率超过警告阈值 %.0f%%（峰值 %s %.1f%%）", overWarn, warning, peak.Name, peak.Percent))
	} else {
		result.Status, result.Message = "pass", stringPtr(fmt.Sprintf("Flash 存储正常：已评估 %d/%d 个分区，峰值 %s %.1f%%", len(entries), len(metrics.FlashPartitions), peak.Name, peak.Percent))
	}
}

func evaluateFlashPartitions(raw []devices.FlashPartitionMetrics, warning, critical float64) ([]flashPartitionEntry, []interfaceUtilizationSkipped, int, int) {
	entries, skipped := make([]flashPartitionEntry, 0, len(raw)), make([]interfaceUtilizationSkipped, 0)
	overWarn, overCrit := 0, 0
	for _, p := range raw {
		entry, reason := evalFlashPartition(p, warning, critical)
		if reason != "" {
			skipped = append(skipped, interfaceUtilizationSkipped{Name: entry.Name, Reason: reason})
			continue
		}
		if entry.Verdict == rowVerdictFail {
			overCrit++
			overWarn++
		} else if entry.Verdict == rowVerdictWarning {
			overWarn++
		}
		entries = append(entries, entry)
	}
	sort.SliceStable(entries, func(i, j int) bool {
		if rowVerdictRank(entries[i].Verdict) != rowVerdictRank(entries[j].Verdict) {
			return rowVerdictRank(entries[i].Verdict) < rowVerdictRank(entries[j].Verdict)
		}
		return entries[i].Percent > entries[j].Percent
	})
	return entries, skipped, overWarn, overCrit
}

func evalFlashPartition(p devices.FlashPartitionMetrics, warning, critical float64) (flashPartitionEntry, string) {
	name := firstNonEmpty(strings.TrimSpace(p.Name), strings.TrimSpace(p.Index))
	if p.TotalBytes == nil || *p.TotalBytes <= 0 {
		return flashPartitionEntry{Name: name}, "容量为 0 或无效，无法计算使用率"
	}
	total := *p.TotalBytes
	var used, free int64
	switch {
	case p.UsedBytes != nil && p.FreeBytes != nil:
		used, free = *p.UsedBytes, *p.FreeBytes
	case p.UsedBytes != nil:
		used, free = *p.UsedBytes, total-*p.UsedBytes
	case p.FreeBytes != nil:
		free, used = *p.FreeBytes, total-*p.FreeBytes
	case p.UsagePercent != nil:
		used = int64(float64(total) * (*p.UsagePercent) / 100.0)
		free = total - used
	default:
		return flashPartitionEntry{Name: name}, "缺少已用或剩余容量数据"
	}
	if used < 0 || free < 0 || free > total || used > total {
		return flashPartitionEntry{Name: name}, "分区已用或可用容量异常（超出总容量或为负），无法判定"
	}
	percent := float64(used) / float64(total) * 100
	verdict := rowVerdictPass
	if percent >= critical {
		verdict = rowVerdictFail
	} else if percent >= warning {
		verdict = rowVerdictWarning
	}
	return flashPartitionEntry{Name: name, TotalBytes: total, UsedBytes: used, FreeBytes: free, Percent: percent, Verdict: verdict}, ""
}
