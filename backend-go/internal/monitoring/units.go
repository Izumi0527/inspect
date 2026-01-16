package monitoring

const (
	bpsToMbpsDivisor = 1_000_000.0
)

// 网络指标统一换算为 Mbps 输出。
func bpsToMbps(value float64) float64 {
	return value / bpsToMbpsDivisor
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
