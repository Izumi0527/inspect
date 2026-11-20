package monitoring

import (
	"context"
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"
)

const (
	MaxLatestDataPageSize = 100
	MaxAdhocSeriesCount   = 6
)

var (
	ErrTooManyAdhocSeries  = errors.New("最多支持同时对比 6 条指标序列")
	ErrInvalidAdhocRequest = errors.New("invalid adhoc graph request")
)

// LatestDataFilter 定义实时指标明细分页检索条件。
type LatestDataFilter struct {
	DeviceIDs      []int
	GroupID        *int
	ApplicationTag string
	Search         string
	ChangedOnly    bool
	AbnormalOnly   bool
	Page           int
	PageSize       int
}

// LatestDataItem 表示一条实时指标快照及友好译文。
type LatestDataItem struct {
	DeviceID       int       `json:"device_id"`
	DeviceName     string    `json:"device_name"`
	IPAddress      string    `json:"ip_address"`
	MetricName     string    `json:"metric_name"`
	MetricLabel    string    `json:"metric_label"`
	InterfaceName  string    `json:"interface_name"`
	ItemKey        string    `json:"item_key"`
	ApplicationTag string    `json:"application_tag"`
	MetricValue    *float64  `json:"metric_value"`
	PrevValue      *float64  `json:"prev_value"`
	Delta          *float64  `json:"delta"`
	DisplayValue   string    `json:"display_value"`
	RawText        *string   `json:"raw_text,omitempty"`
	MetricUnit     *string   `json:"metric_unit,omitempty"`
	IsAbnormal     bool      `json:"is_abnormal"`
	CollectedAt    time.Time `json:"collected_at"`
}

// LatestDataPageResponse 表示实时指标明细分页结果。
type LatestDataPageResponse struct {
	Items      []LatestDataItem `json:"items"`
	Total      int64            `json:"total"`
	Page       int              `json:"page"`
	PageSize   int              `json:"page_size"`
	TotalPages int              `json:"total_pages"`
}

// AdhocSeriesSpec 定义多指标同图对比的单条序列。
type AdhocSeriesSpec struct {
	DeviceID      int    `json:"device_id"`
	MetricName    string `json:"metric_name"`
	InterfaceName string `json:"interface_name,omitempty"`
}

// AdhocGraphRequest 定义多指标同图对比请求。
type AdhocGraphRequest struct {
	Series    []AdhocSeriesSpec `json:"series"`
	TimeRange string            `json:"time_range"`
	StartTime *FlexibleTime     `json:"start_time,omitempty"`
	EndTime   *FlexibleTime     `json:"end_time,omitempty"`
}

// AdhocSeriesData 表示单条对齐时序序列。
type AdhocSeriesData struct {
	Key           string     `json:"key"`
	DeviceID      int        `json:"device_id"`
	DeviceName    string     `json:"device_name"`
	MetricName    string     `json:"metric_name"`
	MetricLabel   string     `json:"metric_label"`
	InterfaceName string     `json:"interface_name,omitempty"`
	Unit          string     `json:"unit,omitempty"`
	Values        []*float64 `json:"values"`
}

// AdhocGraphResponse 表示多指标同图对比响应。
type AdhocGraphResponse struct {
	Timestamps []string          `json:"timestamps"`
	StartTime  time.Time         `json:"start_time"`
	EndTime    time.Time         `json:"end_time"`
	Series     []AdhocSeriesData `json:"series"`
}

// QueryLatestData 基于 device_latest_metrics 索引分页检索实时指标明细。
func (w *MetricsWriter) QueryLatestData(ctx context.Context, filter LatestDataFilter) (LatestDataPageResponse, error) {
	page := filter.Page
	if page < 1 {
		page = 1
	}
	pageSize := filter.PageSize
	if pageSize <= 0 {
		pageSize = 50
	}
	if pageSize > MaxLatestDataPageSize {
		pageSize = MaxLatestDataPageSize
	}

	resp := LatestDataPageResponse{
		Items:    []LatestDataItem{},
		Page:     page,
		PageSize: pageSize,
	}
	if w == nil || w.db == nil {
		return resp, fmt.Errorf("database not initialized")
	}

	query := w.db.WithContext(ctx).
		Table("device_latest_metrics AS lm").
		Joins("JOIN devices AS d ON d.id = lm.device_id").
		Where("d.is_active = ?", true)

	if len(filter.DeviceIDs) > 0 {
		query = query.Where("lm.device_id IN ?", filter.DeviceIDs)
	}
	if filter.GroupID != nil && *filter.GroupID > 0 {
		groupIDs, err := w.resolveDescendantGroupIDs(ctx, *filter.GroupID)
		if err != nil {
			return resp, err
		}
		if len(groupIDs) == 0 {
			return resp, nil
		}
		query = query.Where("d.group_id IN ?", groupIDs)
	}
	if tag := strings.TrimSpace(filter.ApplicationTag); tag != "" {
		query = query.Where("lm.application_tag = ?", tag)
	}
	if search := strings.TrimSpace(filter.Search); search != "" {
		pattern := "%" + search + "%"
		query = query.Where(
			"(lm.metric_name ILIKE ? OR lm.item_key ILIKE ? OR lm.interface_name ILIKE ? OR d.name ILIKE ? OR d.ip_address ILIKE ?)",
			pattern, pattern, pattern, pattern, pattern,
		)
	}
	if filter.ChangedOnly {
		query = query.Where("lm.prev_value IS NOT NULL AND lm.metric_value IS NOT NULL AND lm.metric_value <> lm.prev_value")
	}
	if filter.AbnormalOnly {
		query = query.Where(`(
			(lm.metric_name = 'cpu_usage' AND lm.metric_value >= 80) OR
			(lm.metric_name = 'memory_usage' AND lm.metric_value >= 80) OR
			(lm.metric_name = 'temperature' AND lm.metric_value >= 75) OR
			(lm.metric_name IN ('ping_loss_pct', 'packet_loss') AND lm.metric_value > 0) OR
			(lm.metric_name = 'hardware_fault_count' AND lm.metric_value > 0) OR
			(lm.metric_name IN ('if_in_errors', 'if_out_errors', 'if_flap_count_1h') AND lm.metric_value > 0) OR
			(lm.metric_name IN ('utilization_in', 'utilization_out') AND lm.metric_value >= 80) OR
			(lm.metric_name = 'snmp_reachable' AND lm.metric_value = 0)
		)`)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return resp, err
	}
	resp.Total = total
	if total > 0 {
		resp.TotalPages = int((total + int64(pageSize) - 1) / int64(pageSize))
	}
	if total == 0 {
		return resp, nil
	}

	type rowRecord struct {
		DeviceID       int       `gorm:"column:device_id"`
		DeviceName     string    `gorm:"column:device_name"`
		IPAddress      string    `gorm:"column:ip_address"`
		MetricName     string    `gorm:"column:metric_name"`
		InterfaceName  string    `gorm:"column:interface_name"`
		ItemKey        string    `gorm:"column:item_key"`
		ApplicationTag string    `gorm:"column:application_tag"`
		MetricValue    *float64  `gorm:"column:metric_value"`
		PrevValue      *float64  `gorm:"column:prev_value"`
		RawText        *string   `gorm:"column:raw_text"`
		MetricUnit     *string   `gorm:"column:metric_unit"`
		CollectedAt    time.Time `gorm:"column:collected_at"`
	}

	rows := make([]rowRecord, 0, pageSize)
	offset := (page - 1) * pageSize
	if err := query.
		Select("lm.device_id, d.name AS device_name, d.ip_address, lm.metric_name, lm.interface_name, lm.item_key, lm.application_tag, lm.metric_value, lm.prev_value, lm.raw_text, lm.metric_unit, lm.collected_at").
		Order("lm.collected_at DESC, lm.device_id ASC, lm.metric_name ASC, lm.interface_name ASC").
		Limit(pageSize).
		Offset(offset).
		Scan(&rows).Error; err != nil {
		return resp, err
	}

	items := make([]LatestDataItem, 0, len(rows))
	for _, r := range rows {
		var delta *float64
		if r.MetricValue != nil && r.PrevValue != nil {
			d := math.Round((*r.MetricValue-*r.PrevValue)*1000) / 1000
			delta = &d
		}
		items = append(items, LatestDataItem{
			DeviceID:       r.DeviceID,
			DeviceName:     r.DeviceName,
			IPAddress:      r.IPAddress,
			MetricName:     r.MetricName,
			MetricLabel:    friendlyMetricLabel(r.MetricName),
			InterfaceName:  r.InterfaceName,
			ItemKey:        r.ItemKey,
			ApplicationTag: r.ApplicationTag,
			MetricValue:    r.MetricValue,
			PrevValue:      r.PrevValue,
			Delta:          delta,
			DisplayValue:   formatFriendlyMetricValue(r.MetricName, r.MetricValue, r.RawText, r.MetricUnit),
			RawText:        r.RawText,
			MetricUnit:     r.MetricUnit,
			IsAbnormal:     isMetricAbnormal(r.MetricName, r.MetricValue),
			CollectedAt:    r.CollectedAt.UTC(),
		})
	}
	resp.Items = items
	return resp, nil
}

// QueryAdhocGraphs 查询最多 6 条指标序列并对齐时间桶。
func (w *MetricsWriter) QueryAdhocGraphs(
	ctx context.Context,
	series []AdhocSeriesSpec,
	startTime time.Time,
	endTime time.Time,
) (AdhocGraphResponse, error) {
	resp := AdhocGraphResponse{
		Timestamps: []string{},
		StartTime:  startTime.UTC(),
		EndTime:    endTime.UTC(),
		Series:     []AdhocSeriesData{},
	}
	if len(series) == 0 {
		return resp, ErrInvalidAdhocRequest
	}
	if len(series) > MaxAdhocSeriesCount {
		return resp, ErrTooManyAdhocSeries
	}
	if w == nil || w.db == nil {
		return resp, fmt.Errorf("database not initialized")
	}

	deviceIDSet := make(map[int]struct{}, len(series))
	deviceIDs := make([]int, 0, len(series))
	for _, s := range series {
		if s.DeviceID <= 0 || strings.TrimSpace(s.MetricName) == "" {
			return resp, ErrInvalidAdhocRequest
		}
		if _, ok := deviceIDSet[s.DeviceID]; !ok {
			deviceIDSet[s.DeviceID] = struct{}{}
			deviceIDs = append(deviceIDs, s.DeviceID)
		}
	}

	// 查询设备名称映射
	type devNameRow struct {
		ID   int    `gorm:"column:id"`
		Name string `gorm:"column:name"`
	}
	var devRows []devNameRow
	if err := w.db.WithContext(ctx).Table("devices").Select("id, name").Where("id IN ?", deviceIDs).Scan(&devRows).Error; err != nil {
		return resp, err
	}
	deviceNames := make(map[int]string, len(devRows))
	for _, d := range devRows {
		deviceNames[d.ID] = d.Name
	}

	bucketDuration := resolveAdhocBucketDuration(endTime.Sub(startTime))
	bucketExpr := buildBucketSQL(bucketDuration)

	type bucketPoint struct {
		Bucket time.Time `gorm:"column:bucket"`
		Value  *float64  `gorm:"column:val"`
		Unit   *string   `gorm:"column:unit"`
	}

	timestampSet := make(map[time.Time]struct{})
	seriesPoints := make([]map[time.Time]*float64, len(series))
	seriesUnits := make([]string, len(series))

	for idx, spec := range series {
		metricName := NormalizeMetricName(strings.TrimSpace(spec.MetricName))
		ifaceName := strings.TrimSpace(spec.InterfaceName)

		var rows []bucketPoint
		var err error
		if ifaceName != "" {
			query := fmt.Sprintf(`
				SELECT %s AS bucket, AVG(metric_value) AS val, MAX(metric_unit) AS unit
				FROM interface_metrics
				WHERE device_id = ? AND interface_name = ? AND metric_name = ?
				  AND collected_at >= ? AND collected_at <= ?
				GROUP BY bucket
				ORDER BY bucket ASC
			`, bucketExpr)
			err = w.db.WithContext(ctx).Raw(query, spec.DeviceID, ifaceName, metricName, startTime, endTime).Scan(&rows).Error
		} else {
			query := fmt.Sprintf(`
				SELECT %s AS bucket, AVG(metric_value) AS val, MAX(metric_unit) AS unit
				FROM device_metrics
				WHERE device_id = ? AND metric_name = ?
				  AND collected_at >= ? AND collected_at <= ?
				GROUP BY bucket
				ORDER BY bucket ASC
			`, bucketExpr)
			err = w.db.WithContext(ctx).Raw(query, spec.DeviceID, metricName, startTime, endTime).Scan(&rows).Error
		}
		if err != nil {
			return resp, err
		}

		ptMap := make(map[time.Time]*float64, len(rows))
		for _, r := range rows {
			ts := r.Bucket.UTC()
			timestampSet[ts] = struct{}{}
			if r.Value != nil {
				v := math.Round(*r.Value*100) / 100
				ptMap[ts] = &v
			}
			if seriesUnits[idx] == "" && r.Unit != nil && strings.TrimSpace(*r.Unit) != "" {
				seriesUnits[idx] = strings.TrimSpace(*r.Unit)
			}
		}
		seriesPoints[idx] = ptMap
	}

	sortedTimes := make([]time.Time, 0, len(timestampSet))
	for ts := range timestampSet {
		sortedTimes = append(sortedTimes, ts)
	}
	sort.Slice(sortedTimes, func(i, j int) bool {
		return sortedTimes[i].Before(sortedTimes[j])
	})

	resp.Timestamps = make([]string, len(sortedTimes))
	for i, ts := range sortedTimes {
		resp.Timestamps[i] = ts.Format(time.RFC3339)
	}

	resp.Series = make([]AdhocSeriesData, 0, len(series))
	for idx, spec := range series {
		metricName := NormalizeMetricName(strings.TrimSpace(spec.MetricName))
		ifaceName := strings.TrimSpace(spec.InterfaceName)
		devName := deviceNames[spec.DeviceID]
		if devName == "" {
			devName = fmt.Sprintf("device-%d", spec.DeviceID)
		}
		key := fmt.Sprintf("%d:%s:%s", spec.DeviceID, metricName, ifaceName)
		values := make([]*float64, len(sortedTimes))
		ptMap := seriesPoints[idx]
		for ti, ts := range sortedTimes {
			if v, ok := ptMap[ts]; ok {
				values[ti] = v
			}
		}
		unit := seriesUnits[idx]
		if unit == "" {
			unit = defaultInterfaceMetricUnit(metricName)
		}
		resp.Series = append(resp.Series, AdhocSeriesData{
			Key:           key,
			DeviceID:      spec.DeviceID,
			DeviceName:    devName,
			MetricName:    metricName,
			MetricLabel:   friendlyMetricLabel(metricName),
			InterfaceName: ifaceName,
			Unit:          unit,
			Values:        values,
		})
	}

	return resp, nil
}

func resolveAdhocBucketDuration(span time.Duration) time.Duration {
	switch {
	case span <= 6*time.Hour:
		return 5 * time.Minute
	case span <= 48*time.Hour:
		return 15 * time.Minute
	case span <= 7*24*time.Hour:
		return time.Hour
	default:
		return 6 * time.Hour
	}
}

func buildBucketSQL(d time.Duration) string {
	secs := int64(d.Seconds())
	if secs <= 0 {
		secs = 300
	}
	return fmt.Sprintf("to_timestamp(floor(extract(epoch from collected_at) / %d) * %d)", secs, secs)
}

func friendlyMetricLabel(metricName string) string {
	switch metricName {
	case "cpu_usage":
		return "CPU 使用率"
	case "memory_usage":
		return "内存使用率"
	case "temperature":
		return "设备温度"
	case "disk_usage":
		return "磁盘使用率"
	case "uptime":
		return "运行时长"
	case "ping_rtt_ms", "response_time":
		return "ICMP 往返延迟"
	case "ping_loss_pct", "packet_loss":
		return "ICMP 丢包率"
	case "snmp_reachable":
		return "SNMP 连通性"
	case "bandwidth_in":
		return "下行速率"
	case "bandwidth_out":
		return "上行速率"
	case "utilization_in":
		return "下行带宽利用率"
	case "utilization_out":
		return "上行带宽利用率"
	case "if_in_errors":
		return "接收错包数"
	case "if_out_errors":
		return "发送错包数"
	case "if_in_discards":
		return "接收丢包数"
	case "if_out_discards":
		return "发送丢包数"
	case "if_flap_count_1h":
		return "1小时端口闪断次数"
	case "hardware_fault_count":
		return "硬件故障数"
	case "bgp_established_count":
		return "BGP 已建立邻居数"
	default:
		return metricName
	}
}

func formatFriendlyMetricValue(metricName string, val *float64, rawText *string, unit *string) string {
	if val == nil {
		if rawText != nil && strings.TrimSpace(*rawText) != "" {
			return strings.TrimSpace(*rawText)
		}
		return "-"
	}
	v := *val
	switch metricName {
	case "snmp_reachable":
		if v >= 1 {
			return "可达"
		}
		return "不可达"
	case "if_oper_status":
		switch int(v) {
		case 1:
			return "正常 (UP)"
		case 2:
			return "断开 (DOWN)"
		default:
			return fmt.Sprintf("未知 (%d)", int(v))
		}
	case "uptime":
		secs := int64(v)
		days := secs / 86400
		hours := (secs % 86400) / 3600
		mins := (secs % 3600) / 60
		if days > 0 {
			return fmt.Sprintf("%d 天 %d 小时", days, hours)
		}
		if hours > 0 {
			return fmt.Sprintf("%d 小时 %d 分钟", hours, mins)
		}
		return fmt.Sprintf("%d 分钟", mins)
	default:
		u := ""
		if unit != nil {
			u = strings.TrimSpace(*unit)
		}
		if u == "" {
			u = defaultInterfaceMetricUnit(metricName)
		}
		if u != "" {
			return fmt.Sprintf("%.2f %s", v, u)
		}
		return fmt.Sprintf("%.2f", v)
	}
}

func isMetricAbnormal(metricName string, val *float64) bool {
	if val == nil {
		return false
	}
	v := *val
	switch metricName {
	case "cpu_usage", "memory_usage", "utilization_in", "utilization_out":
		return v >= 80
	case "temperature":
		return v >= 75
	case "ping_loss_pct", "packet_loss", "hardware_fault_count", "if_in_errors", "if_out_errors", "if_flap_count_1h":
		return v > 0
	case "snmp_reachable":
		return v == 0
	default:
		return false
	}
}
