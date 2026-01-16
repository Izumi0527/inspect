package monitoring

import "strings"

func NormalizeMetricName(raw string) string {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return ""
	}

	normalized := strings.ToLower(trimmed)
	normalized = strings.ReplaceAll(normalized, "-", "_")
	normalized = strings.ReplaceAll(normalized, " ", "_")
	switch normalized {
	case "cpu", "cpu_percent", "cpu_usage_percent":
		return "cpu_usage"
	case "memory_percent", "memory_usage_percent", "mem_usage", "mem_percent":
		return "memory_usage"
	case "disk_percent":
		return "disk_usage"
	case "system_uptime", "uptime_seconds":
		return "uptime"
	case "response_time_ms", "latency_ms":
		return "response_time"
	case "throughput_in":
		return "bandwidth_in"
	case "throughput_out":
		return "bandwidth_out"
	case "rx_bytes", "bytes_in", "in_bytes", "network_in":
		return "network_bytes_in"
	case "tx_bytes", "bytes_out", "out_bytes", "network_out":
		return "network_bytes_out"
	default:
		return trimmed
	}
}

func normalizeMetricMap(metrics map[string]MetricValue) map[string]MetricValue {
	if len(metrics) == 0 {
		return metrics
	}

	result := make(map[string]MetricValue, len(metrics))
	for name, metric := range metrics {
		canonical := NormalizeMetricName(name)
		if canonical == "" {
			continue
		}
		metric = normalizeMetricValue(canonical, metric)
		if existing, ok := result[canonical]; ok {
			result[canonical] = mergeMetricValue(existing, metric)
			continue
		}
		result[canonical] = metric
	}

	return result
}

func normalizeMetricValue(name string, metric MetricValue) MetricValue {
	if isEmptyUnit(metric.Unit) {
		if unit := defaultMetricUnit(name); unit != "" {
			metric.Unit = &unit
		}
	}
	return metric
}

func mergeMetricValue(existing MetricValue, candidate MetricValue) MetricValue {
	if existing.Value == nil && candidate.Value != nil {
		existing.Value = candidate.Value
		if candidate.Timestamp != nil && !candidate.Timestamp.IsZero() {
			existing.Timestamp = candidate.Timestamp
		}
	} else if existing.Value != nil && candidate.Value != nil {
		if candidate.Timestamp != nil && (existing.Timestamp == nil || existing.Timestamp.IsZero() || candidate.Timestamp.After(existing.Timestamp.Time)) {
			existing.Value = candidate.Value
			existing.Timestamp = candidate.Timestamp
		}
	} else if existing.Timestamp == nil && candidate.Timestamp != nil {
		existing.Timestamp = candidate.Timestamp
	}

	if isEmptyUnit(existing.Unit) && !isEmptyUnit(candidate.Unit) {
		existing.Unit = candidate.Unit
	}

	if existing.Text == nil && candidate.Text != nil {
		existing.Text = candidate.Text
	}

	return existing
}

func isEmptyUnit(unit *string) bool {
	if unit == nil {
		return true
	}
	return strings.TrimSpace(*unit) == ""
}

func defaultMetricUnit(name string) string {
	switch name {
	case "cpu_usage", "memory_usage", "disk_usage", "bandwidth_utilization", "packet_loss":
		return "%"
	case "response_time":
		return "ms"
	case "temperature":
		return "C"
	case "uptime":
		return "s"
	case "bandwidth_in", "bandwidth_out", "network_bytes_in", "network_bytes_out":
		return "Mbps"
	default:
		return ""
	}
}
