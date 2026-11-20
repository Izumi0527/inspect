package monitoring

import (
	"context"
	"math"
	"sort"
	"strings"
	"time"
)

// ThresholdPair 表示预警与严重双级阈值。
type ThresholdPair struct {
	Warn float64 `json:"warn"`
	Crit float64 `json:"crit"`
}

// ThresholdSummary 表示动态读取的监控中心阈值配置。
type ThresholdSummary struct {
	CPU         ThresholdPair `json:"cpu"`
	Memory      ThresholdPair `json:"memory"`
	Temperature ThresholdPair `json:"temperature"`
}

// HealthDistributionBuckets 表示全网 5 档健康与负载分布桶。
type HealthDistributionBuckets struct {
	Normal      int `json:"normal"`
	Elevated    int `json:"elevated"`
	Overloaded  int `json:"overloaded"`
	Offline     int `json:"offline"`
	Maintenance int `json:"maintenance"`
}

// GroupSummaryItem 表示按设备分组的健康汇总卡片。
type GroupSummaryItem struct {
	GroupID        int     `json:"group_id"`
	GroupName      string  `json:"group_name"`
	TotalDevices   int     `json:"total_devices"`
	OnlineDevices  int     `json:"online_devices"`
	OfflineDevices int     `json:"offline_devices"`
	WarningDevices int     `json:"warning_devices"`
	MaxCPU         float64 `json:"max_cpu"`
	MaxMemory      float64 `json:"max_memory"`
}

// AggregateTrendPoint 表示全网聚合态势包络带单时刻数据点（Mean / P95 / Max + 峰值设备）。
type AggregateTrendPoint struct {
	Timestamp      string  `json:"timestamp"`
	MeanCPU        float64 `json:"mean_cpu"`
	P95CPU         float64 `json:"p95_cpu"`
	MaxCPU         float64 `json:"max_cpu"`
	MeanMemory     float64 `json:"mean_memory"`
	P95Memory      float64 `json:"p95_memory"`
	MaxMemory      float64 `json:"max_memory"`
	PeakDeviceID   int     `json:"peak_device_id,omitempty"`
	PeakDeviceName string  `json:"peak_device_name,omitempty"`
}

// DashboardAnnotation 表示监控趋势图上的事件标注点（alert 类严格受 alerts:read 门控）。
type DashboardAnnotation struct {
	Timestamp  string `json:"timestamp"`
	Type       string `json:"type"` // alert | reboot | maintenance
	Title      string `json:"title"`
	Severity   string `json:"severity,omitempty"`
	DeviceID   int    `json:"device_id,omitempty"`
	DeviceName string `json:"device_name,omitempty"`
}

// NotificationChannelReadiness 表示脱敏后的通知渠道就绪态（严禁泄露邮箱或 URL）。
type NotificationChannelReadiness struct {
	Channel    string `json:"channel"`
	Enabled    bool   `json:"enabled"`
	Configured bool   `json:"configured"`
}

// ActiveProblemItem 表示总览大屏活跃问题流单项（受 alerts:read 门控）。
type ActiveProblemItem struct {
	AlertID        int        `json:"alert_id"`
	DeviceID       int        `json:"device_id"`
	DeviceName     string     `json:"device_name"`
	Title          string     `json:"title"`
	Severity       string     `json:"severity"`
	Status         string     `json:"status"`
	MetricName     *string    `json:"metric_name,omitempty"`
	CurrentValue   *float64   `json:"current_value,omitempty"`
	ThresholdValue *float64   `json:"threshold_value,omitempty"`
	LastOccurred   *time.Time `json:"last_occurred,omitempty"`
}

// DashboardV2Enrichment 承载 dashboard/v2 的增量扩展字段。
type DashboardV2Enrichment struct {
	Thresholds                 ThresholdSummary
	HealthDistribution         HealthDistributionBuckets
	GroupSummaries             []GroupSummaryItem
	AggregateTrends            []AggregateTrendPoint
	YesterdayBaseline          []DevicePerformancePoint
	Annotations                []DashboardAnnotation
	NotificationChannelSummary []NotificationChannelReadiness
	ActiveProblems             []ActiveProblemItem
}

func defaultThresholdSummary() ThresholdSummary {
	return ThresholdSummary{
		CPU:         ThresholdPair{Warn: 80, Crit: 90},
		Memory:      ThresholdPair{Warn: 80, Crit: 90},
		Temperature: ThresholdPair{Warn: 70, Crit: 85},
	}
}

// ResolveGroupDeviceIDs 解析分组（含子孙分组）下的全部活跃设备 ID；若提供 baseDeviceIDs 则取交集。
func (w *MetricsWriter) ResolveGroupDeviceIDs(ctx context.Context, groupID int, baseDeviceIDs []int) ([]int, error) {
	if w == nil || w.db == nil || groupID <= 0 {
		return baseDeviceIDs, nil
	}
	groupIDs, err := w.resolveDescendantGroupIDs(ctx, groupID)
	if err != nil {
		return nil, err
	}
	if len(groupIDs) == 0 {
		return []int{}, nil
	}

	var matched []int
	q := w.db.WithContext(ctx).Table("devices").Where("is_active = ? AND group_id IN ?", true, groupIDs)
	if len(baseDeviceIDs) > 0 {
		q = q.Where("id IN ?", baseDeviceIDs)
	}
	if err := q.Pluck("id", &matched).Error; err != nil {
		return nil, err
	}
	return matched, nil
}

// BuildDashboardV2Enrichment 为 dashboard/v2 构造增量扩展字段（阈值/健康分布/分组汇总/聚合带/昨日基线/标注/脱敏通知/活跃问题）。
func (w *MetricsWriter) BuildDashboardV2Enrichment(
	ctx context.Context,
	startTime time.Time,
	endTime time.Time,
	deviceIDs []int,
	sampleInterval time.Duration,
	perfPoints []DevicePerformancePoint,
	compareYesterday bool,
	canReadAlerts bool,
) DashboardV2Enrichment {
	out := DashboardV2Enrichment{
		Thresholds:                 defaultThresholdSummary(),
		GroupSummaries:             []GroupSummaryItem{},
		AggregateTrends:            []AggregateTrendPoint{},
		YesterdayBaseline:          []DevicePerformancePoint{},
		Annotations:                []DashboardAnnotation{},
		NotificationChannelSummary: []NotificationChannelReadiness{},
		ActiveProblems:             []ActiveProblemItem{},
	}

	out.AggregateTrends = computeAggregateTrends(perfPoints)
	if w == nil || w.db == nil {
		return out
	}

	out.Thresholds = w.loadEffectiveThresholds(ctx)
	out.HealthDistribution = w.queryHealthDistribution(ctx, deviceIDs)
	out.GroupSummaries = w.queryGroupSummaries(ctx, deviceIDs)
	out.NotificationChannelSummary = w.queryMaskedNotificationChannels(ctx)
	out.Annotations = w.queryDashboardAnnotations(ctx, startTime, endTime, deviceIDs, canReadAlerts)

	if canReadAlerts {
		out.ActiveProblems = w.queryActiveProblems(ctx, deviceIDs, 20)
	}

	if compareYesterday {
		yStart := startTime.Add(-24 * time.Hour)
		yEnd := endTime.Add(-24 * time.Hour)
		if yPoints, err := w.GetDevicePerformanceHistory(ctx, yStart, yEnd, deviceIDs, sampleInterval); err == nil {
			out.YesterdayBaseline = shiftPerformancePointsBy24h(yPoints)
		}
	}

	return out
}

func (w *MetricsWriter) loadEffectiveThresholds(ctx context.Context) ThresholdSummary {
	res := defaultThresholdSummary()
	if w == nil || w.db == nil {
		return res
	}
	type ruleRow struct {
		MetricName     string  `gorm:"column:metric_name"`
		Severity       string  `gorm:"column:severity"`
		ThresholdValue float64 `gorm:"column:threshold_value"`
	}
	var rows []ruleRow
	if err := w.db.WithContext(ctx).
		Table("alert_rules").
		Select("metric_name, severity, threshold_value").
		Where("COALESCE(is_active, true) = true AND metric_name IN ('cpu_usage', 'memory_usage', 'temperature')").
		Scan(&rows).Error; err != nil {
		return res
	}

	for _, r := range rows {
		sev := strings.ToLower(strings.TrimSpace(r.Severity))
		switch r.MetricName {
		case "cpu_usage":
			if sev == "critical" {
				res.CPU.Crit = r.ThresholdValue
			} else if sev == "warning" {
				res.CPU.Warn = r.ThresholdValue
			}
		case "memory_usage":
			if sev == "critical" {
				res.Memory.Crit = r.ThresholdValue
			} else if sev == "warning" {
				res.Memory.Warn = r.ThresholdValue
			}
		case "temperature":
			if sev == "critical" {
				res.Temperature.Crit = r.ThresholdValue
			} else if sev == "warning" {
				res.Temperature.Warn = r.ThresholdValue
			}
		}
	}
	return res
}

func (w *MetricsWriter) queryHealthDistribution(ctx context.Context, deviceIDs []int) HealthDistributionBuckets {
	var buckets HealthDistributionBuckets
	type row struct {
		Status      string   `gorm:"column:status"`
		CPUUsage    *float64 `gorm:"column:cpu_usage"`
		MemoryUsage *float64 `gorm:"column:memory_usage"`
	}
	var rows []row
	q := w.db.WithContext(ctx).Table("devices").Select("status, cpu_usage, memory_usage").Where("is_active = ?", true)
	if len(deviceIDs) > 0 {
		q = q.Where("id IN ?", deviceIDs)
	}
	if err := q.Scan(&rows).Error; err != nil {
		return buckets
	}

	for _, r := range rows {
		st := strings.ToLower(strings.TrimSpace(r.Status))
		switch st {
		case "offline":
			buckets.Offline++
		case "maintenance":
			buckets.Maintenance++
		default:
			maxLoad := 0.0
			if r.CPUUsage != nil && *r.CPUUsage > maxLoad {
				maxLoad = *r.CPUUsage
			}
			if r.MemoryUsage != nil && *r.MemoryUsage > maxLoad {
				maxLoad = *r.MemoryUsage
			}
			switch {
			case maxLoad >= 80 || st == "critical":
				buckets.Overloaded++
			case maxLoad >= 60 || st == "warning":
				buckets.Elevated++
			default:
				buckets.Normal++
			}
		}
	}
	return buckets
}

func (w *MetricsWriter) queryGroupSummaries(ctx context.Context, deviceIDs []int) []GroupSummaryItem {
	type row struct {
		GroupID        int     `gorm:"column:group_id"`
		GroupName      string  `gorm:"column:group_name"`
		TotalDevices   int     `gorm:"column:total_devices"`
		OnlineDevices  int     `gorm:"column:online_devices"`
		OfflineDevices int     `gorm:"column:offline_devices"`
		WarningDevices int     `gorm:"column:warning_devices"`
		MaxCPU         float64 `gorm:"column:max_cpu"`
		MaxMemory      float64 `gorm:"column:max_memory"`
	}
	var rows []row
	q := w.db.WithContext(ctx).
		Table("devices AS d").
		Select(`COALESCE(d.group_id, 0) AS group_id,
			COALESCE(dg.name, '未分组') AS group_name,
			COUNT(*) AS total_devices,
			SUM(CASE WHEN LOWER(d.status) = 'online' THEN 1 ELSE 0 END) AS online_devices,
			SUM(CASE WHEN LOWER(d.status) = 'offline' THEN 1 ELSE 0 END) AS offline_devices,
			SUM(CASE WHEN LOWER(d.status) IN ('warning', 'critical') THEN 1 ELSE 0 END) AS warning_devices,
			COALESCE(MAX(d.cpu_usage), 0) AS max_cpu,
			COALESCE(MAX(d.memory_usage), 0) AS max_memory`).
		Joins("LEFT JOIN device_groups AS dg ON dg.id = d.group_id").
		Where("d.is_active = ?", true)
	if len(deviceIDs) > 0 {
		q = q.Where("d.id IN ?", deviceIDs)
	}
	if err := q.Group("COALESCE(d.group_id, 0), COALESCE(dg.name, '未分组')").
		Order("total_devices DESC, group_id ASC").
		Scan(&rows).Error; err != nil || rows == nil {
		return []GroupSummaryItem{}
	}

	out := make([]GroupSummaryItem, 0, len(rows))
	for _, r := range rows {
		out = append(out, GroupSummaryItem{
			GroupID:        r.GroupID,
			GroupName:      r.GroupName,
			TotalDevices:   r.TotalDevices,
			OnlineDevices:  r.OnlineDevices,
			OfflineDevices: r.OfflineDevices,
			WarningDevices: r.WarningDevices,
			MaxCPU:         math.Round(r.MaxCPU*10) / 10,
			MaxMemory:      math.Round(r.MaxMemory*10) / 10,
		})
	}
	return out
}

func (w *MetricsWriter) queryMaskedNotificationChannels(ctx context.Context) []NotificationChannelReadiness {
	type settingRow struct {
		Key   string `gorm:"column:key"`
		Value string `gorm:"column:value"`
	}
	var rows []settingRow
	_ = w.db.WithContext(ctx).
		Table("system_settings").
		Select("key, value").
		Where("key IN ?", []string{
			"notification.email.enabled",
			"notification.email_enabled",
			"notification.email.smtp_host",
			"notification.webhook.enabled",
			"notification.webhook.url",
		}).
		Scan(&rows).Error

	kv := make(map[string]string, len(rows))
	for _, r := range rows {
		kv[r.Key] = strings.TrimSpace(r.Value)
	}

	emailEnabled := strings.EqualFold(kv["notification.email.enabled"], "true") || strings.EqualFold(kv["notification.email_enabled"], "true")
	emailConfigured := kv["notification.email.smtp_host"] != ""
	webhookEnabled := strings.EqualFold(kv["notification.webhook.enabled"], "true")
	webhookConfigured := kv["notification.webhook.url"] != ""

	return []NotificationChannelReadiness{
		{Channel: "email", Enabled: emailEnabled, Configured: emailConfigured},
		{Channel: "webhook", Enabled: webhookEnabled, Configured: webhookConfigured},
	}
}

func (w *MetricsWriter) queryDashboardAnnotations(ctx context.Context, startTime, endTime time.Time, deviceIDs []int, canReadAlerts bool) []DashboardAnnotation {
	if !canReadAlerts {
		return []DashboardAnnotation{}
	}
	type alertRow struct {
		Title      string    `gorm:"column:title"`
		Severity   string    `gorm:"column:severity"`
		DeviceID   int       `gorm:"column:device_id"`
		DeviceName string    `gorm:"column:device_name"`
		OccurredAt time.Time `gorm:"column:occurred_at"`
	}
	var rows []alertRow
	q := w.db.WithContext(ctx).
		Table("alerts AS a").
		Select("a.title, a.severity, a.device_id, d.name AS device_name, COALESCE(a.first_occurred, a.created_at) AS occurred_at").
		Joins("JOIN devices AS d ON d.id = a.device_id").
		Where("COALESCE(a.first_occurred, a.created_at) >= ? AND COALESCE(a.first_occurred, a.created_at) <= ?", startTime, endTime)
	if len(deviceIDs) > 0 {
		q = q.Where("a.device_id IN ?", deviceIDs)
	}
	if err := q.Order("occurred_at DESC").Limit(20).Scan(&rows).Error; err != nil {
		return []DashboardAnnotation{}
	}

	out := make([]DashboardAnnotation, 0, len(rows))
	for _, r := range rows {
		out = append(out, DashboardAnnotation{
			Timestamp:  r.OccurredAt.UTC().Format(time.RFC3339),
			Type:       "alert",
			Title:      r.Title,
			Severity:   r.Severity,
			DeviceID:   r.DeviceID,
			DeviceName: r.DeviceName,
		})
	}
	return out
}

func (w *MetricsWriter) queryActiveProblems(ctx context.Context, deviceIDs []int, limit int) []ActiveProblemItem {
	var rows []ActiveProblemItem
	q := w.db.WithContext(ctx).
		Table("alerts AS a").
		Select("a.id AS alert_id, a.device_id, d.name AS device_name, a.title, a.severity, a.status, a.metric_name, a.current_value, a.threshold_value, a.last_occurred").
		Joins("JOIN devices AS d ON d.id = a.device_id").
		Where("a.status IN ('active', 'acknowledged')")
	if len(deviceIDs) > 0 {
		q = q.Where("a.device_id IN ?", deviceIDs)
	}
	if err := q.Order("CASE WHEN LOWER(a.severity)='critical' THEN 1 WHEN LOWER(a.severity)='warning' THEN 2 ELSE 3 END ASC, a.last_occurred DESC").
		Limit(limit).
		Scan(&rows).Error; err != nil || rows == nil {
		return []ActiveProblemItem{}
	}
	return rows
}

func computeAggregateTrends(perfPoints []DevicePerformancePoint) []AggregateTrendPoint {
	if len(perfPoints) == 0 {
		return []AggregateTrendPoint{}
	}
	out := make([]AggregateTrendPoint, 0, len(perfPoints))
	for _, pt := range perfPoints {
		if len(pt.Devices) == 0 {
			continue
		}
		cpus := make([]float64, 0, len(pt.Devices))
		mems := make([]float64, 0, len(pt.Devices))
		peakName := ""
		peakCPU := -1.0
		for name, val := range pt.Devices {
			cpus = append(cpus, val.CPU)
			mems = append(mems, val.Memory)
			if val.CPU > peakCPU {
				peakCPU = val.CPU
				peakName = name
			}
		}
		sort.Float64s(cpus)
		sort.Float64s(mems)
		out = append(out, AggregateTrendPoint{
			Timestamp:      pt.Timestamp,
			MeanCPU:        round2(meanFloat64(cpus)),
			P95CPU:         round2(percentile95(cpus)),
			MaxCPU:         round2(cpus[len(cpus)-1]),
			MeanMemory:     round2(meanFloat64(mems)),
			P95Memory:      round2(percentile95(mems)),
			MaxMemory:      round2(mems[len(mems)-1]),
			PeakDeviceName: peakName,
		})
	}
	return out
}

func shiftPerformancePointsBy24h(points []DevicePerformancePoint) []DevicePerformancePoint {
	if len(points) == 0 {
		return []DevicePerformancePoint{}
	}
	out := make([]DevicePerformancePoint, 0, len(points))
	for _, pt := range points {
		if t, err := time.Parse(time.RFC3339Nano, pt.Timestamp); err == nil {
			pt.Timestamp = t.Add(24 * time.Hour).UTC().Format(time.RFC3339)
		} else if t, err := time.Parse(time.RFC3339, pt.Timestamp); err == nil {
			pt.Timestamp = t.Add(24 * time.Hour).UTC().Format(time.RFC3339)
		}
		out = append(out, pt)
	}
	return out
}

func meanFloat64(vals []float64) float64 {
	if len(vals) == 0 {
		return 0
	}
	sum := 0.0
	for _, v := range vals {
		sum += v
	}
	return sum / float64(len(vals))
}

func percentile95(sortedVals []float64) float64 {
	if len(sortedVals) == 0 {
		return 0
	}
	idx := int(math.Ceil(0.95*float64(len(sortedVals)))) - 1
	if idx < 0 {
		idx = 0
	}
	if idx >= len(sortedVals) {
		idx = len(sortedVals) - 1
	}
	return sortedVals[idx]
}

func round2(v float64) float64 {
	return math.Round(v*100) / 100
}
