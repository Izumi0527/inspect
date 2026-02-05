package monitoring

const (
	bpsToKbpsDivisor = 1_000.0
	bpsToMbpsDivisor = 1_000_000.0
	bpsToGbpsDivisor = 1_000_000_000.0
	bpsToByteDivisor = 8.0 // 1 byte = 8 bits
)

// bpsToMbps 将 bps 转换为 Mbps
func bpsToMbps(value float64) float64 {
	return value / bpsToMbpsDivisor
}

// bpsToBytes 将 bps (bits per second) 转换为 bytes per second
func bpsToBytes(value float64) float64 {
	return value / bpsToByteDivisor
}

func networkMetricToMbps(value float64, metricName string) float64 {
	_ = metricName
	return bpsToMbps(value)
}

func isNetworkMetric(metricName string) bool {
	switch NormalizeMetricName(metricName) {
	case "bandwidth_in", "bandwidth_out", "network_bytes_in", "network_bytes_out", "network_traffic":
		return true
	default:
		return false
	}
}
