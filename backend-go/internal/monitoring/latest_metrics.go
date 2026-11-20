package monitoring

import (
	"context"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
)

// LatestMetricsUpsertBatchSize 限制单条 Bulk UPSERT SQL 的最大行数，避免写压与参数数量超限。
const LatestMetricsUpsertBatchSize = 500

// UpsertLatestMetrics 按批（每批 <= 500 行）将最新指标快照原子写入 device_latest_metrics。
// 写入前会按复合主键 (device_id, metric_name, interface_name) 去重，防止 PostgreSQL ON CONFLICT 报错。
func (w *MetricsWriter) UpsertLatestMetrics(ctx context.Context, points []DeviceLatestMetric) error {
	if w == nil || w.db == nil {
		return fmt.Errorf("database not initialized")
	}
	deduped := dedupeLatestMetrics(points)
	if len(deduped) == 0 {
		return nil
	}
	if len(deduped) <= LatestMetricsUpsertBatchSize {
		return upsertLatestMetricsBatch(w.db.WithContext(ctx), deduped)
	}
	return w.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		return upsertLatestMetricsWithDB(tx, deduped)
	})
}

// DeviceMetricsToLatestMetrics 将设备级时序记录转换为最新指标快照记录。
func DeviceMetricsToLatestMetrics(metrics []DeviceMetric) []DeviceLatestMetric {
	if len(metrics) == 0 {
		return nil
	}
	now := time.Now().UTC()
	out := make([]DeviceLatestMetric, 0, len(metrics))
	for _, m := range metrics {
		ifaceName := ""
		if m.InterfaceName != nil {
			ifaceName = strings.TrimSpace(*m.InterfaceName)
		}
		metricName := strings.TrimSpace(m.MetricName)
		if m.DeviceID <= 0 || metricName == "" {
			continue
		}
		collectedAt := m.CollectedAt
		if collectedAt.IsZero() {
			collectedAt = now
		}
		out = append(out, DeviceLatestMetric{
			DeviceID:       m.DeviceID,
			MetricName:     metricName,
			InterfaceName:  ifaceName,
			ItemKey:        metricName,
			ApplicationTag: inferApplicationTag(metricName, ifaceName),
			MetricValue:    m.MetricValue,
			MetricUnit:     m.MetricUnit,
			CollectedAt:    collectedAt.UTC(),
			UpdatedAt:      now,
		})
	}
	return out
}

// InterfaceMetricsToLatestMetrics 将接口级时序记录转换为最新指标快照记录。
// 当 monitoredInterfaces 非 nil 时，仅保留 monitoredInterfaces[interfaceName] == true 的纳管接口；
// 为 nil 时默认全部接口均视为 lld_monitored = true。
func InterfaceMetricsToLatestMetrics(metrics []InterfaceMetric, monitoredInterfaces map[string]bool) []DeviceLatestMetric {
	if len(metrics) == 0 {
		return nil
	}
	now := time.Now().UTC()
	out := make([]DeviceLatestMetric, 0, len(metrics))
	for _, m := range metrics {
		ifaceName := strings.TrimSpace(m.InterfaceName)
		metricName := strings.TrimSpace(m.MetricName)
		if m.DeviceID <= 0 || metricName == "" || ifaceName == "" {
			continue
		}
		if monitoredInterfaces != nil && !monitoredInterfaces[ifaceName] {
			continue
		}
		collectedAt := m.CollectedAt
		if collectedAt.IsZero() {
			collectedAt = now
		}
		unit := m.MetricUnit
		if unit == nil {
			if inferred := defaultInterfaceMetricUnit(metricName); inferred != "" {
				unit = &inferred
			}
		}
		out = append(out, DeviceLatestMetric{
			DeviceID:       m.DeviceID,
			MetricName:     metricName,
			InterfaceName:  ifaceName,
			ItemKey:        metricName,
			ApplicationTag: "interface",
			MetricValue:    m.MetricValue,
			MetricUnit:     unit,
			CollectedAt:    collectedAt.UTC(),
			UpdatedAt:      now,
		})
	}
	return out
}

func upsertLatestMetricsWithDB(db *gorm.DB, points []DeviceLatestMetric) error {
	deduped := dedupeLatestMetrics(points)
	if len(deduped) == 0 {
		return nil
	}
	for start := 0; start < len(deduped); start += LatestMetricsUpsertBatchSize {
		end := start + LatestMetricsUpsertBatchSize
		if end > len(deduped) {
			end = len(deduped)
		}
		if err := upsertLatestMetricsBatch(db, deduped[start:end]); err != nil {
			return err
		}
	}
	return nil
}

type latestMetricKey struct {
	deviceID      int
	metricName    string
	interfaceName string
}

// dedupeLatestMetrics 按复合主键去重（保留最新 CollectedAt，时间相同时后者覆盖前者），同时保持首次出现的顺序。
func dedupeLatestMetrics(points []DeviceLatestMetric) []DeviceLatestMetric {
	if len(points) == 0 {
		return nil
	}
	now := time.Now().UTC()
	result := make([]DeviceLatestMetric, 0, len(points))
	indexByKey := make(map[latestMetricKey]int, len(points))

	for _, p := range points {
		metricName := strings.TrimSpace(p.MetricName)
		if p.DeviceID <= 0 || metricName == "" {
			continue
		}
		ifaceName := strings.TrimSpace(p.InterfaceName)
		normalized := normalizeLatestMetricPoint(p, metricName, ifaceName, now)
		key := latestMetricKey{
			deviceID:      normalized.DeviceID,
			metricName:    normalized.MetricName,
			interfaceName: normalized.InterfaceName,
		}
		if idx, exists := indexByKey[key]; exists {
			if !normalized.CollectedAt.Before(result[idx].CollectedAt) {
				result[idx] = normalized
			}
			continue
		}
		indexByKey[key] = len(result)
		result = append(result, normalized)
	}
	return result
}

func normalizeLatestMetricPoint(p DeviceLatestMetric, metricName, ifaceName string, now time.Time) DeviceLatestMetric {
	p.MetricName = metricName
	p.InterfaceName = ifaceName
	p.ItemKey = strings.TrimSpace(p.ItemKey)
	if p.ItemKey == "" {
		p.ItemKey = metricName
	}
	p.ApplicationTag = strings.TrimSpace(p.ApplicationTag)
	if p.ApplicationTag == "" {
		p.ApplicationTag = inferApplicationTag(metricName, ifaceName)
	}
	if p.CollectedAt.IsZero() {
		p.CollectedAt = now
	} else {
		p.CollectedAt = p.CollectedAt.UTC()
	}
	if p.UpdatedAt.IsZero() {
		p.UpdatedAt = now
	} else {
		p.UpdatedAt = p.UpdatedAt.UTC()
	}
	return p
}

func upsertLatestMetricsBatch(db *gorm.DB, batch []DeviceLatestMetric) error {
	if len(batch) == 0 {
		return nil
	}
	var sqlBuilder strings.Builder
	sqlBuilder.WriteString(`INSERT INTO device_latest_metrics (`)
	sqlBuilder.WriteString(`device_id, metric_name, interface_name, item_key, application_tag, `)
	sqlBuilder.WriteString(`metric_value, prev_value, raw_text, metric_unit, collected_at, updated_at) VALUES `)

	values := make([]interface{}, 0, len(batch)*11)
	for i, p := range batch {
		if i > 0 {
			sqlBuilder.WriteString(", ")
		}
		sqlBuilder.WriteString("(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
		values = append(values,
			p.DeviceID,
			p.MetricName,
			p.InterfaceName,
			p.ItemKey,
			p.ApplicationTag,
			p.MetricValue,
			p.PrevValue,
			p.RawText,
			p.MetricUnit,
			p.CollectedAt,
			p.UpdatedAt,
		)
	}

	sqlBuilder.WriteString(` ON CONFLICT (device_id, metric_name, interface_name) DO UPDATE SET `)
	sqlBuilder.WriteString(`item_key = COALESCE(NULLIF(EXCLUDED.item_key, ''), device_latest_metrics.item_key), `)
	sqlBuilder.WriteString(`application_tag = COALESCE(NULLIF(EXCLUDED.application_tag, ''), device_latest_metrics.application_tag), `)
	sqlBuilder.WriteString(`prev_value = device_latest_metrics.metric_value, `)
	sqlBuilder.WriteString(`metric_value = EXCLUDED.metric_value, `)
	sqlBuilder.WriteString(`raw_text = EXCLUDED.raw_text, `)
	sqlBuilder.WriteString(`metric_unit = COALESCE(EXCLUDED.metric_unit, device_latest_metrics.metric_unit), `)
	sqlBuilder.WriteString(`collected_at = EXCLUDED.collected_at, `)
	sqlBuilder.WriteString(`updated_at = EXCLUDED.updated_at`)

	return db.Exec(sqlBuilder.String(), values...).Error
}

func inferApplicationTag(metricName, interfaceName string) string {
	if interfaceName != "" || strings.HasPrefix(metricName, "if_") {
		return "interface"
	}
	switch metricName {
	case "ping_rtt_ms", "ping_loss_pct", "snmp_reachable", "response_time", "packet_loss":
		return "availability"
	case "bandwidth_in", "bandwidth_out", "network_bytes_in", "network_bytes_out",
		"bgp_peer_count", "bgp_established_count", "stp_top_changes":
		return "network"
	case "temperature", "hardware_fault_count", "optical_transceiver_count", "poe_power_usage_pct":
		return "hardware"
	case "cpu_usage", "memory_usage", "disk_usage", "uptime":
		return "system"
	default:
		return "custom"
	}
}

func defaultInterfaceMetricUnit(metricName string) string {
	switch metricName {
	case "bandwidth_in", "bandwidth_out":
		return "bps"
	case "utilization_in", "utilization_out":
		return "%"
	case "if_in_errors", "if_out_errors", "if_in_discards", "if_out_discards", "if_flap_count_1h":
		return "count"
	case "if_in_error_rate", "if_out_error_rate":
		return "err/s"
	default:
		return ""
	}
}
