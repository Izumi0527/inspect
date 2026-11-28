package handlers

import (
	"fmt"
	"strings"

	"github.com/your-org/inspect-system/backend-go/internal/devices"
	"gorm.io/datatypes"
)

type stackMemberEntry struct {
	ID       string `json:"id"`
	Role     string `json:"role"`
	Priority *int64 `json:"priority,omitempty"`
	MAC      string `json:"mac,omitempty"`
	Verdict  string `json:"verdict"`
}

type stackPortEntry struct {
	Name    string `json:"name"`
	Status  string `json:"status"`
	Verdict string `json:"verdict"`
}

type flashPartitionEntry struct {
	Name       string  `json:"name"`
	TotalBytes int64   `json:"total_bytes"`
	UsedBytes  int64   `json:"used_bytes"`
	FreeBytes  int64   `json:"free_bytes"`
	Percent    float64 `json:"percent"`
	Verdict    string  `json:"verdict"`
}

type opticalEvalThresholds struct {
	lowWarn, lowCrit   float64
	highWarn, highCrit float64
	tempWarn, tempCrit float64
}

type interfaceStatusDetailEntry struct {
	Name        string `json:"name"`
	Alias       string `json:"alias,omitempty"`
	SpeedMbps   *int64 `json:"speed_mbps,omitempty"`
	StatusLabel string `json:"status_label"`
	DuplexLabel string `json:"duplex_label,omitempty"`
	Verdict     string `json:"verdict"`
	Reason      string `json:"reason"`
}

type thresholdBounds struct {
	warning, critical       float64
	hasWarning, hasCritical bool
}

func parseThresholdBounds(config map[string]interface{}) thresholdBounds {
	threshold, _ := config["threshold"].(map[string]interface{})
	if threshold == nil {
		return thresholdBounds{}
	}
	var out thresholdBounds
	if w, ok := toFloatValue(threshold["warning"]); ok {
		out.warning, out.hasWarning = w, true
	}
	if c, ok := toFloatValue(threshold["critical"]); ok {
		out.critical, out.hasCritical = c, true
	}
	return out
}

func (b thresholdBounds) resolve(defaultWarn, defaultCrit float64) (float64, float64) {
	warn, crit := b.warning, b.critical
	if !b.hasWarning {
		warn = defaultWarn
	}
	if !b.hasCritical {
		crit = defaultCrit
	}
	return warn, crit
}

func trimmedPortDescription(iface devices.InterfaceMetrics) string {
	if iface.PortDescription == nil {
		return ""
	}
	return strings.TrimSpace(*iface.PortDescription)
}

func sumPacketCounters(ucast, nucast *uint64) *uint64 {
	if ucast == nil && nucast == nil {
		return nil
	}
	var total uint64
	if ucast != nil {
		total += *ucast
	}
	if nucast != nil {
		total += *nucast
	}
	return &total
}

func hasCustomComponentStateConfig(config map[string]interface{}) bool {
	for _, key := range []string{"normal_states", "abnormal_states"} {
		list, ok := config[key].([]interface{})
		if !ok {
			continue
		}
		for _, item := range list {
			if _, ok := toFloatValue(item); ok {
				return true
			}
		}
	}
	return false
}

func applyComponentStatusLevel(component devices.ComponentStatusMetrics, entry *componentStatusEntry, summary *componentStatusSummary) bool {
	label := strings.TrimSpace(component.Name)
	if label == "" {
		label = component.Index
	}
	switch strings.ToLower(strings.TrimSpace(component.StatusLevel)) {
	case "normal":
		summary.Normal++
		entry.Verdict = rowVerdictPass
	case "warning":
		summary.Warning++
		entry.Verdict = rowVerdictWarning
		summary.WarningIndexes = append(summary.WarningIndexes, label)
	case "critical":
		summary.Abnormal++
		entry.Verdict = rowVerdictFail
		summary.AbnormalIndexes = append(summary.AbnormalIndexes, label)
	case "unknown":
		summary.Unknown++
		entry.Verdict = rowVerdictSkip
		code := "未知"
		if component.State != nil {
			code = fmt.Sprintf("码 %d", *component.State)
		}
		summary.UnknownCodes = append(summary.UnknownCodes, fmt.Sprintf("%s(%s)", label, code))
	default:
		return false
	}
	return true
}

func resolveOpticalThresholds(config map[string]interface{}, warning, critical float64) opticalEvalThresholds {
	th := opticalEvalThresholds{lowWarn: warning, lowCrit: critical, highWarn: 2.0, highCrit: 5.0, tempWarn: 75.0, tempCrit: 85.0}
	readOpt := func(key string, dst *float64) {
		if v, ok := toFloatValue(config[key]); ok {
			*dst = v
			return
		}
		if sub, ok := config["threshold"].(map[string]interface{}); ok {
			if v, ok := toFloatValue(sub[key]); ok {
				*dst = v
			}
		}
	}
	readOpt("high_warning", &th.highWarn)
	readOpt("high_critical", &th.highCrit)
	readOpt("temp_warning", &th.tempWarn)
	readOpt("temp_critical", &th.tempCrit)
	return th
}

func evaluateOpticalModule(module devices.OpticalTransceiverMetrics, rx float64, th opticalEvalThresholds) (string, string) {
	verdict := rowVerdictPass
	reasons := make([]string, 0, 2)
	raise := func(next, reason string) {
		if rowVerdictRank(next) < rowVerdictRank(verdict) {
			verdict = next
		}
		reasons = append(reasons, reason)
	}
	if rx <= th.lowCrit {
		raise(rowVerdictFail, "收光功率过低")
	} else if rx <= th.lowWarn {
		raise(rowVerdictWarning, "收光功率偏低")
	}
	if rx >= th.highCrit {
		raise(rowVerdictFail, "收光功率过高(过载)")
	} else if rx >= th.highWarn {
		raise(rowVerdictWarning, "收光功率偏高")
	}
	if module.Temperature != nil {
		if *module.Temperature >= th.tempCrit {
			raise(rowVerdictFail, fmt.Sprintf("温度过高(%.1f°C)", *module.Temperature))
		} else if *module.Temperature >= th.tempWarn {
			raise(rowVerdictWarning, fmt.Sprintf("温度偏高(%.1f°C)", *module.Temperature))
		}
	}
	return verdict, strings.Join(reasons, "；")
}

func opticalDisplayName(module devices.OpticalTransceiverMetrics) string {
	if name := strings.TrimSpace(module.Name); name != "" {
		return name
	}
	return module.Index
}

func buildInterfaceStatusDetails(subKind string, evaluated, abnormal int, adminDown, idle *int, entries []interfaceStatusDetailEntry) datatypes.JSON {
	if entries == nil {
		entries = []interfaceStatusDetailEntry{}
	}
	payload := map[string]interface{}{
		"kind": "interface_status_detail", "sub_kind": subKind,
		"total_evaluated": evaluated, "abnormal_count": abnormal, "entries": entries,
	}
	if adminDown != nil {
		payload["admin_down_count"] = *adminDown
	}
	if idle != nil {
		payload["idle_count"] = *idle
	}
	return encodeDetailsPayload(payload)
}

func formatPoETopPortSuffix(ports []devices.PoEPortMetrics) string {
	var best *devices.PoEPortMetrics
	bestPower := 0.0
	for i := range ports {
		p := &ports[i]
		if p.ConsumingPower != nil && *p.ConsumingPower > 0 && (best == nil || *p.ConsumingPower > bestPower) {
			best, bestPower = p, *p.ConsumingPower
		}
	}
	if best == nil || strings.TrimSpace(best.Name) == "" {
		return ""
	}
	unit := best.Unit
	if unit == "" {
		unit = "W"
	}
	return fmt.Sprintf("（最高功耗端口 %s %.1f%s）", strings.TrimSpace(best.Name), bestPower, unit)
}

func formatSTPDuration(seconds int64) string {
	days, hours, minutes := seconds/86400, (seconds%86400)/3600, (seconds%3600)/60
	if days > 0 {
		return fmt.Sprintf("%d天%d小时%d分钟", days, hours, minutes)
	}
	if hours > 0 {
		return fmt.Sprintf("%d小时%d分钟", hours, minutes)
	}
	if minutes > 0 {
		return fmt.Sprintf("%d分钟", minutes)
	}
	return fmt.Sprintf("%d秒", seconds)
}

func buildSTPStatusDetails(stp devices.STPMetrics, warning, critical float64) datatypes.JSON {
	payload := map[string]interface{}{"kind": "stp_status"}
	for key, ptr := range map[string]*int64{
		"protocol_spec": stp.ProtocolSpec, "top_changes": stp.TopChanges,
		"priority": stp.Priority, "root_cost": stp.RootCost, "root_port": stp.RootPort, "bpdu_guard": stp.BpduGuard,
	} {
		if ptr != nil {
			payload[key] = *ptr
		}
	}
	if stp.TimeSinceTopologyChange != nil {
		payload["time_since_topology_change"] = *stp.TimeSinceTopologyChange
		payload["duration_formatted"] = formatSTPDuration(*stp.TimeSinceTopologyChange)
	}
	if root := strings.TrimSpace(stp.DesignatedRoot); root != "" {
		payload["designated_root"] = root
	}
	for k, v := range thresholdDetailsPayload("stp_status", warning, critical, "s") {
		payload[k] = v
	}
	return encodeDetailsPayload(payload)
}

func appendSTPMetadataSummary(stp devices.STPMetrics) string {
	parts := make([]string, 0, 3)
	if root := strings.TrimSpace(stp.DesignatedRoot); root != "" {
		parts = append(parts, fmt.Sprintf("根桥 %s", root))
	}
	if stp.RootCost != nil {
		parts = append(parts, fmt.Sprintf("根开销 %d", *stp.RootCost))
	}
	if stp.BpduGuard != nil {
		guard := "未开启"
		if *stp.BpduGuard == 1 {
			guard = "已开启"
		}
		parts = append(parts, fmt.Sprintf("BPDU Guard %s", guard))
	}
	if len(parts) == 0 {
		return ""
	}
	return "；" + strings.Join(parts, "，")
}
