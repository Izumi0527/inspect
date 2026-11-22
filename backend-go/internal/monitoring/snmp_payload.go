package monitoring

import (
	"math"
	"strings"
	"time"

	"github.com/your-org/inspect-system/backend-go/internal/devices"
)

const abnormalComponentStateCode int64 = 2

// BuildSNMPDeviceMetricsRequest 将 SNMP 采集结果转换为监控写入请求。
func BuildSNMPDeviceMetricsRequest(deviceID int, metrics *devices.SNMPMetrics) DeviceMetricsRequest {
	req := DeviceMetricsRequest{
		DeviceID: deviceID,
		Metrics:  make(map[string]MetricValue),
	}
	if metrics == nil {
		return req
	}

	if metrics.CPUUsage != nil {
		req.Metrics["cpu_usage"] = MetricValue{Value: metrics.CPUUsage, Unit: stringPtr("%")}
	}
	if metrics.MemoryUsage != nil {
		req.Metrics["memory_usage"] = MetricValue{Value: metrics.MemoryUsage, Unit: stringPtr("%")}
	}
	if metrics.Temperature != nil {
		req.Metrics["temperature"] = MetricValue{Value: metrics.Temperature, Unit: stringPtr("°C")}
	}
	if metrics.Uptime != nil {
		uptimeFloat := float64(*metrics.Uptime)
		req.Metrics["uptime"] = MetricValue{Value: &uptimeFloat, Unit: stringPtr("seconds")}
	}
	if metrics.BandwidthIn != nil {
		bwIn := *metrics.BandwidthIn
		req.Metrics["bandwidth_in"] = MetricValue{Value: &bwIn, Unit: stringPtr("bps")}
	}
	if metrics.BandwidthOut != nil {
		bwOut := *metrics.BandwidthOut
		req.Metrics["bandwidth_out"] = MetricValue{Value: &bwOut, Unit: stringPtr("bps")}
	}
	appendSNMPExtensionMetrics(req.Metrics, metrics)

	req.Interfaces = buildSNMPInterfaces(metrics.Interfaces)

	// 型号/版本/识别类型是静态属性，不进时序指标表，单独走设备档案回填
	identity := DeviceIdentity{}
	if metrics.Model != nil {
		identity.Model = *metrics.Model
	}
	if metrics.FirmwareVersion != nil {
		identity.FirmwareVersion = *metrics.FirmwareVersion
	}
	if metrics.SerialNumber != nil {
		identity.SerialNumber = *metrics.SerialNumber
	}
	if metrics.DetectedType != nil {
		identity.DetectedDeviceType = *metrics.DetectedType
	}
	if metrics.SysName != nil {
		identity.SysName = *metrics.SysName
	}
	if metrics.ChassisID != nil {
		identity.ChassisID = *metrics.ChassisID
	}
	identity.LLDPStatus = string(metrics.LLDPStatus)
	if identity != (DeviceIdentity{}) {
		req.Identity = &identity
	}

	// LLDP 表可读才下发邻居快照（哪怕为空）；不可读时保持 nil，写入端保留旧邻居
	if metrics.LLDPAvailable {
		req.Neighbors = &NeighborsPayload{Items: buildNeighborPayloads(metrics.Neighbors)}
	}

	if tags := buildSNMPExtensionTags(metrics); len(tags) > 0 {
		req.Tags = tags
	}

	collectedAt := FlexibleTime{Time: metrics.CollectedAt}
	req.CollectedAt = &collectedAt

	return req
}

func appendSNMPExtensionMetrics(metricsMap map[string]MetricValue, metrics *devices.SNMPMetrics) {
	if len(metrics.BGPPeers) > 0 {
		peerCount := float64(len(metrics.BGPPeers))
		metricsMap["bgp_peer_count"] = MetricValue{Value: &peerCount, Unit: stringPtr("count")}

		establishedCount := 0.0
		for _, peer := range metrics.BGPPeers {
			if peer.StateLabel == "established" {
				establishedCount++
			}
		}
		metricsMap["bgp_established_count"] = MetricValue{
			Value: &establishedCount,
			Unit:  stringPtr("count"),
		}
	}

	if len(metrics.OpticalTransceivers) > 0 {
		count := float64(len(metrics.OpticalTransceivers))
		metricsMap["optical_transceiver_count"] = MetricValue{Value: &count, Unit: stringPtr("count")}
	}

	if len(metrics.Components) > 0 {
		faultCount := float64(CountHardwareFaults(metrics.Components))
		metricsMap["hardware_fault_count"] = MetricValue{Value: &faultCount, Unit: stringPtr("count")}
	}

	if pct, ok := calculatePoEPowerUsagePct(metrics.PoE); ok {
		metricsMap["poe_power_usage_pct"] = MetricValue{Value: &pct, Unit: stringPtr("%")}
	}

	if metrics.STP.TopChanges != nil {
		topChanges := float64(*metrics.STP.TopChanges)
		metricsMap["stp_top_changes"] = MetricValue{Value: &topChanges, Unit: stringPtr("count")}
	}
}

// CountHardwareFaults 统计处于异常状态的硬件组件数量；优先依据语义等级 status_level 判定，
// 缺失时回退兼容历史原始状态码（state == 2）。
func CountHardwareFaults(components []devices.ComponentStatusMetrics) int {
	faults := 0
	for _, comp := range components {
		if comp.StatusLevel != "" {
			if comp.StatusLevel == "critical" {
				faults++
			}
			continue
		}
		if comp.State != nil && *comp.State == abnormalComponentStateCode {
			faults++
		}
	}
	return faults
}

func calculatePoEPowerUsagePct(poe devices.PoEMetrics) (float64, bool) {
	if poe.RemainingPower == nil || *poe.RemainingPower < 0 {
		return 0, false
	}
	totalConsuming := 0.0
	for _, port := range poe.Ports {
		if port.ConsumingPower != nil && *port.ConsumingPower > 0 {
			totalConsuming += *port.ConsumingPower
		}
	}
	totalBudget := totalConsuming + *poe.RemainingPower
	if totalBudget <= 0 {
		return 0, false
	}
	pct := (totalConsuming / totalBudget) * 100.0
	if pct > 100 {
		pct = 100
	}
	return pct, true
}

func buildSNMPExtensionTags(metrics *devices.SNMPMetrics) map[string]interface{} {
	extensions := make(map[string]interface{})
	if len(metrics.BGPPeers) > 0 {
		extensions["bgp_peers"] = metrics.BGPPeers
	}
	if len(metrics.OpticalTransceivers) > 0 {
		extensions["optical_transceivers"] = metrics.OpticalTransceivers
	}
	if len(metrics.Components) > 0 {
		extensions["components"] = metrics.Components
	}
	if len(metrics.PoE.Ports) > 0 || metrics.PoE.RemainingPower != nil {
		extensions["poe"] = metrics.PoE
	}
	if metrics.STP.ProtocolSpec != nil || metrics.STP.TimeSinceTopologyChange != nil || metrics.STP.TopChanges != nil {
		extensions["stp"] = metrics.STP
	}
	if len(metrics.Disks) > 0 {
		extensions["disks"] = metrics.Disks
	}
	if compacted := devices.CompactSNMPDiagnostics(metrics.Diagnostics); compacted != nil {
		extensions["diagnostics"] = compacted
	}
	if len(extensions) == 0 {
		return nil
	}
	return map[string]interface{}{
		"snmp_extensions": extensions,
	}
}

// CalculateInterfaceUtilization 计算接口带宽利用率百分比，严格防除零与溢出。
// 当 speed <= 0 或换算后超出 MaxReasonableBandwidthBps 时，利用率恒置 0 且 speedUnknown = true。
func CalculateInterfaceUtilization(rateBps *float64, speedMbps *int64) (utilization float64, speedUnknown bool) {
	if speedMbps == nil || *speedMbps <= 0 {
		return 0, true
	}
	if *speedMbps > devices.MaxReasonableBandwidthBps {
		return 0, true
	}
	speedBps := float64(*speedMbps) * 1_000_000.0
	if math.IsNaN(speedBps) || math.IsInf(speedBps, 0) || speedBps <= 0 || speedBps > float64(devices.MaxReasonableBandwidthBps) {
		return 0, true
	}
	if rateBps == nil || math.IsNaN(*rateBps) || math.IsInf(*rateBps, 0) || *rateBps <= 0 {
		return 0, false
	}
	if *rateBps > float64(devices.MaxReasonableBandwidthBps) {
		return 0, false
	}
	pct := (*rateBps / speedBps) * 100.0
	if pct < 0 || math.IsNaN(pct) || math.IsInf(pct, 0) {
		return 0, false
	}
	if pct > 100 {
		pct = 100
	}
	return pct, false
}

// CalculateCounterRate 按采样间隔计算累计计数器每秒速率（遵守 devices.RateSampleMaxGap）。
// 若间隔非法、超过 RateSampleMaxGap 或发生计数器回绕/归零，返回 0。
func CalculateCounterRate(prevVal, currVal int64, prevAt, currAt time.Time) float64 {
	if prevAt.IsZero() || currAt.IsZero() {
		return 0
	}
	gap := currAt.Sub(prevAt)
	if gap <= 0 || gap >= devices.RateSampleMaxGap {
		return 0
	}
	if currVal < prevVal {
		return 0
	}
	return float64(currVal-prevVal) / gap.Seconds()
}

// NextInterfaceFlapState 维护端口 1 小时内 UP<->DOWN 闪断次数与最近变更时间。
// 距上次状态变更超过 1 小时未发生新变更时重置为 0；状态发生翻转时累加并更新变更时刻。
func NextInterfaceFlapState(prevUp *bool, prevFlapCount int, prevChangeAt *time.Time, currUp *bool, now time.Time) (int, *time.Time) {
	count := prevFlapCount
	if count < 0 {
		count = 0
	}
	var lastChange *time.Time
	if prevChangeAt != nil && !prevChangeAt.IsZero() {
		ts := prevChangeAt.UTC()
		if now.Sub(ts) > time.Hour {
			count = 0
		} else {
			lastChange = &ts
		}
	}
	if prevUp != nil && currUp != nil && *prevUp != *currUp {
		count++
		ts := now.UTC()
		lastChange = &ts
	}
	return count, lastChange
}

func formatDuplexStatus(code *int) string {
	if code == nil {
		return "unknown"
	}
	switch *code {
	case 2:
		return "half_duplex"
	case 3:
		return "full_duplex"
	default:
		return "unknown"
	}
}

func normalizeDuplexStatus(raw string) string {
	normalized := strings.ToLower(strings.TrimSpace(raw))
	switch normalized {
	case "2", "half", "half_duplex", "halfduplex":
		return "half_duplex"
	case "3", "full", "full_duplex", "fullduplex":
		return "full_duplex"
	default:
		return "unknown"
	}
}

func buildSNMPInterfaces(items []devices.InterfaceMetrics) []map[string]interface{} {
	if len(items) == 0 {
		return nil
	}

	interfaces := make([]map[string]interface{}, 0, len(items))
	for _, iface := range items {
		utilIn, speedUnknownIn := CalculateInterfaceUtilization(iface.InRate, iface.Speed)
		utilOut, speedUnknownOut := CalculateInterfaceUtilization(iface.OutRate, iface.Speed)
		speedUnknown := speedUnknownIn || speedUnknownOut

		ifaceMap := map[string]interface{}{
			"name":            iface.Name,
			"utilization_in":  utilIn,
			"utilization_out": utilOut,
			"speed_unknown":   speedUnknown,
		}
		if iface.Description != "" {
			ifaceMap["description"] = iface.Description
		}
		if iface.PortDescription != nil {
			ifaceMap["port_description"] = *iface.PortDescription
		}
		if iface.Speed != nil {
			ifaceMap["ifHighSpeed"] = *iface.Speed
		}
		if iface.InOctets != nil {
			ifaceMap["ifHCInOctets"] = *iface.InOctets
		}
		if iface.OutOctets != nil {
			ifaceMap["ifHCOutOctets"] = *iface.OutOctets
		}
		if iface.InRate != nil {
			ifaceMap["bandwidth_in"] = *iface.InRate
		}
		if iface.OutRate != nil {
			ifaceMap["bandwidth_out"] = *iface.OutRate
		}
		if iface.IsUp != nil {
			ifaceMap["is_up"] = *iface.IsUp
		}
		if iface.AdminUp != nil {
			ifaceMap["admin_up"] = *iface.AdminUp
		}
		if iface.DuplexStatus != nil {
			ifaceMap["duplex_status"] = formatDuplexStatus(iface.DuplexStatus)
		}
		if iface.InErrors != nil {
			ifaceMap["if_in_errors"] = *iface.InErrors
		}
		if iface.OutErrors != nil {
			ifaceMap["if_out_errors"] = *iface.OutErrors
		}
		if iface.InDiscards != nil {
			ifaceMap["if_in_discards"] = *iface.InDiscards
		}
		if iface.OutDiscards != nil {
			ifaceMap["if_out_discards"] = *iface.OutDiscards
		}
		interfaces = append(interfaces, ifaceMap)
	}

	return interfaces
}

func buildNeighborPayloads(items []devices.NeighborMetrics) []NeighborPayload {
	payloads := make([]NeighborPayload, 0, len(items))
	for _, n := range items {
		payloads = append(payloads, NeighborPayload{
			LocalPortNum:     n.LocalPortNum,
			LocalPortID:      n.LocalPortID,
			LocalPortDesc:    n.LocalPortDesc,
			RemoteChassisID:  n.RemoteChassisID,
			RemotePortID:     n.RemotePortID,
			RemotePortDesc:   n.RemotePortDesc,
			RemoteSysName:    n.RemoteSysName,
			RemoteSysDesc:    n.RemoteSysDesc,
			RemoteMgmtIP:     n.RemoteMgmtIP,
			RemoteCapEnabled: n.RemoteCapEnabled,
		})
	}
	return payloads
}

func stringPtr(value string) *string {
	return &value
}
