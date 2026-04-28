package monitoring

import (
	"github.com/your-org/inspect-system/backend-go/internal/devices"
)

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
}

func buildSNMPExtensionTags(metrics *devices.SNMPMetrics) map[string]interface{} {
	extensions := make(map[string]interface{})
	if len(metrics.BGPPeers) > 0 {
		extensions["bgp_peers"] = metrics.BGPPeers
	}
	if len(metrics.OpticalTransceivers) > 0 {
		extensions["optical_transceivers"] = metrics.OpticalTransceivers
	}
	if len(extensions) == 0 {
		return nil
	}
	return map[string]interface{}{
		"snmp_extensions": extensions,
	}
}

func buildSNMPInterfaces(items []devices.InterfaceMetrics) []map[string]interface{} {
	if len(items) == 0 {
		return nil
	}

	interfaces := make([]map[string]interface{}, 0, len(items))
	for _, iface := range items {
		ifaceMap := map[string]interface{}{
			"name": iface.Name,
		}
		if iface.Description != "" {
			ifaceMap["description"] = iface.Description
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
		interfaces = append(interfaces, ifaceMap)
	}

	return interfaces
}

func stringPtr(value string) *string {
	return &value
}
