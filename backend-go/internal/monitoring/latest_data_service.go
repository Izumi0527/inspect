package monitoring

import (
	"context"
	"errors"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"
)

const (
	MaxLatestDataPageSize = 100
	MaxAdhocSeriesCount   = 6

	nonTrafficInterfaceExcludeClause = `(lm.interface_name = '' OR NOT (LOWER(BTRIM(COALESCE(NULLIF(BTRIM(di.alias), ''), lm.interface_name))) ~ '^(console|aux|inloopback|loopback|lo|null|meth|m-gigabitethernet|mgmt|management)($|[0-9/\-\s])'))`

	latestDataNaturalOrderClause = `CASE WHEN lm.interface_name = '' THEN 0 ELSE 1 END ASC,
lm.device_id ASC,
CASE
	WHEN lm.interface_name = '' THEN ''
	ELSE regexp_replace(
		regexp_replace(
			LOWER(COALESCE(NULLIF(BTRIM(di.alias), ''), lm.interface_name)),
			'([0-9]+)',
			'0000000000\1',
			'g'
		),
		'0+([0-9]{10})',
		'\1',
		'g'
	)
END ASC,
lm.metric_name ASC,
lm.collected_at DESC`
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
	DeviceID             int       `json:"device_id"`
	DeviceName           string    `json:"device_name"`
	IPAddress            string    `json:"ip_address"`
	MetricName           string    `json:"metric_name"`
	MetricLabel          string    `json:"metric_label"`
	InterfaceName        string    `json:"interface_name"`
	InterfaceDisplayName string    `json:"interface_display_name,omitempty"`
	ItemKey              string    `json:"item_key"`
	ApplicationTag       string    `json:"application_tag"`
	MetricValue          *float64  `json:"metric_value"`
	PrevValue            *float64  `json:"prev_value"`
	Delta                *float64  `json:"delta"`
	DeltaDisplay         string    `json:"delta_display,omitempty"`
	DisplayValue         string    `json:"display_value"`
	RawText              *string   `json:"raw_text,omitempty"`
	MetricUnit           *string   `json:"metric_unit,omitempty"`
	IsAbnormal           bool      `json:"is_abnormal"`
	CollectedAt          time.Time `json:"collected_at"`
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
		Joins("LEFT JOIN device_interfaces AS di ON di.device_id = lm.device_id AND di.name = lm.interface_name").
		Where("d.is_active = ?", true).
		Where(nonTrafficInterfaceExcludeClause)

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
			"(lm.metric_name ILIKE ? OR lm.item_key ILIKE ? OR lm.interface_name ILIKE ? OR COALESCE(di.alias, '') ILIKE ? OR d.name ILIKE ? OR d.ip_address ILIKE ?)",
			pattern, pattern, pattern, pattern, pattern, pattern,
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
		InterfaceAlias *string   `gorm:"column:interface_alias"`
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
		Select("lm.device_id, d.name AS device_name, d.ip_address, lm.metric_name, lm.interface_name, di.alias AS interface_alias, lm.item_key, lm.application_tag, lm.metric_value, lm.prev_value, lm.raw_text, lm.metric_unit, lm.collected_at").
		Order(latestDataNaturalOrderClause).
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
			if !math.IsNaN(d) && !math.IsInf(d, 0) {
				delta = &d
			}
		}
		interfaceDisplayName := ""
		if strings.TrimSpace(r.InterfaceName) != "" {
			interfaceDisplayName = resolveInterfaceDisplayName(r.InterfaceName, r.InterfaceAlias)
		}
		effectiveUnitPtr := resolveEffectiveMetricUnit(r.MetricName, r.MetricUnit)
		items = append(items, LatestDataItem{
			DeviceID:             r.DeviceID,
			DeviceName:           r.DeviceName,
			IPAddress:            r.IPAddress,
			MetricName:           r.MetricName,
			MetricLabel:          friendlyMetricLabel(r.MetricName),
			InterfaceName:        r.InterfaceName,
			InterfaceDisplayName: interfaceDisplayName,
			ItemKey:              r.ItemKey,
			ApplicationTag:       r.ApplicationTag,
			MetricValue:          r.MetricValue,
			PrevValue:            r.PrevValue,
			Delta:                delta,
			DeltaDisplay:         formatFriendlyMetricDelta(r.MetricName, r.MetricValue, r.PrevValue, delta, effectiveUnitPtr),
			DisplayValue:         formatFriendlyMetricValue(r.MetricName, r.MetricValue, r.RawText, effectiveUnitPtr),
			RawText:              r.RawText,
			MetricUnit:           effectiveUnitPtr,
			IsAbnormal:           isMetricAbnormal(r.MetricName, r.MetricValue),
			CollectedAt:          r.CollectedAt.UTC(),
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

var metricLabelMap = map[string]string{
	"cpu_usage":                 "CPU 使用率",
	"memory_usage":              "内存使用率",
	"temperature":               "设备温度",
	"disk_usage":                "磁盘使用率",
	"uptime":                    "运行时长",
	"ping_rtt_ms":               "ICMP 往返延迟",
	"response_time":             "ICMP 往返延迟",
	"icmp.rtt":                  "ICMP 探测延迟",
	"ping_loss_pct":             "ICMP 丢包率",
	"packet_loss":               "ICMP 丢包率",
	"snmp_reachable":            "SNMP 连通性",
	"bandwidth_in":              "下行速率",
	"bandwidth_out":             "上行速率",
	"ifHCInOctets":              "入站累计字节数",
	"if_hc_in_octets":           "入站累计字节数",
	"ifHCOutOctets":             "出站累计字节数",
	"if_hc_out_octets":          "出站累计字节数",
	"network_bytes_in":          "入站网络字节数",
	"network_bytes_out":         "出站网络字节数",
	"utilization_in":            "下行带宽利用率",
	"utilization_out":           "上行带宽利用率",
	"if_in_errors":              "接收错包数",
	"if_out_errors":             "发送错包数",
	"if_in_discards":            "接收丢包数",
	"if_out_discards":           "发送丢包数",
	"if_in_error_rate":          "接收错包率",
	"if_out_error_rate":         "发送错包率",
	"if_oper_status":            "端口运行状态",
	"if_flap_count_1h":          "1小时端口闪断次数",
	"hardware_fault_count":      "硬件故障数",
	"optical_transceiver_count": "在位光模块数",
	"stp_top_changes":           "STP 拓扑变更次数",
	"bgp_peer_count":            "BGP 邻居总数",
	"bgp_established_count":     "BGP 已建立邻居数",
	"poe_power_usage_pct":       "PoE 功率使用率",
}

func friendlyMetricLabel(metricName string) string {
	if label, ok := metricLabelMap[metricName]; ok {
		return label
	}
	return metricName
}

func resolveEffectiveMetricUnit(metricName string, rawUnit *string) *string {
	if rawUnit != nil {
		if trimmed := strings.TrimSpace(*rawUnit); trimmed != "" {
			return &trimmed
		}
	}
	if inferred := defaultInterfaceMetricUnit(metricName); inferred != "" {
		return &inferred
	}
	return nil
}

func extractUnitString(metricName string, unit *string) string {
	if unit != nil {
		if trimmed := strings.TrimSpace(*unit); trimmed != "" {
			return trimmed
		}
	}
	return defaultInterfaceMetricUnit(metricName)
}

func formatFriendlyMetricValue(metricName string, val *float64, rawText *string, unit *string) string {
	if val == nil {
		if rawText != nil && strings.TrimSpace(*rawText) != "" {
			return strings.TrimSpace(*rawText)
		}
		return "-"
	}
	v := *val
	if math.IsNaN(v) || math.IsInf(v, 0) {
		return "—"
	}
	switch metricName {
	case "snmp_reachable":
		if v >= 1 {
			return "可达"
		}
		return "不可达"
	case "if_oper_status":
		switch int(math.Round(v)) {
		case 1:
			return "正常 (UP)"
		case 2:
			return "断开 (DOWN)"
		default:
			return fmt.Sprintf("未知 (%d)", int(math.Round(v)))
		}
	case "uptime":
		return formatUptimeValue(int64(math.Round(v)))
	default:
		formatted, _ := formatScaledOrNumericValue(metricName, v, extractUnitString(metricName, unit))
		return formatted
	}
}

func formatFriendlyMetricDelta(metricName string, curr, prev, delta *float64, unit *string) string {
	if delta == nil || math.IsNaN(*delta) || math.IsInf(*delta, 0) {
		return "—"
	}
	if math.Abs(*delta) < 1e-9 {
		return "无变化"
	}
	if metricName == "snmp_reachable" || metricName == "if_oper_status" {
		if curr != nil && prev != nil {
			return fmt.Sprintf("%s → %s",
				formatFriendlyMetricValue(metricName, prev, nil, unit),
				formatFriendlyMetricValue(metricName, curr, nil, unit),
			)
		}
		return "—"
	}
	sign := "+"
	if *delta < 0 {
		sign = "-"
	}
	absDelta := math.Abs(*delta)
	if metricName == "uptime" {
		roundedSecs := int64(math.Round(absDelta))
		if roundedSecs == 0 {
			return "无变化"
		}
		return formatUptimeDelta(sign, roundedSecs)
	}
	formatted, isZero := formatScaledOrNumericValue(metricName, absDelta, extractUnitString(metricName, unit))
	if isZero {
		return "无变化"
	}
	return sign + formatted
}

func formatUptimeValue(secs int64) string {
	if secs < 0 {
		secs = 0
	}
	switch {
	case secs < 60:
		return fmt.Sprintf("%d 秒", secs)
	case secs < 3600:
		return fmt.Sprintf("%d 分钟", secs/60)
	case secs < 86400:
		return fmt.Sprintf("%d 小时 %d 分钟", secs/3600, (secs%3600)/60)
	default:
		return fmt.Sprintf("%d 天 %d 小时", secs/86400, (secs%86400)/3600)
	}
}

func formatUptimeDelta(sign string, secs int64) string {
	switch {
	case secs < 60:
		return fmt.Sprintf("%s%d 秒", sign, secs)
	case secs < 3600:
		mins, rem := secs/60, secs%60
		if rem == 0 {
			return fmt.Sprintf("%s%d 分钟", sign, mins)
		}
		return fmt.Sprintf("%s%d 分钟 %d 秒", sign, mins, rem)
	case secs < 86400:
		hrs, mins := secs/3600, (secs%3600)/60
		if mins == 0 {
			return fmt.Sprintf("%s%d 小时", sign, hrs)
		}
		return fmt.Sprintf("%s%d 小时 %d 分钟", sign, hrs, mins)
	default:
		days, hrs := secs/86400, (secs%86400)/3600
		if hrs == 0 {
			return fmt.Sprintf("%s%d 天", sign, days)
		}
		return fmt.Sprintf("%s%d 天 %d 小时", sign, days, hrs)
	}
}

func formatScaledOrNumericValue(metricName string, v float64, unitStr string) (string, bool) {
	switch {
	case isBandwidthMetric(metricName, unitStr):
		return formatScaledUnit(v, 1000, []string{"bps", "Kbps", "Mbps", "Gbps"}, 2)
	case isByteCounterMetric(metricName, unitStr):
		return formatScaledUnit(v, 1024, []string{"B", "KB", "MB", "GB", "TB"}, 2)
	case strings.EqualFold(unitStr, "count") || isCountMetric(metricName):
		unitWord := "个"
		if metricName == "stp_top_changes" || metricName == "if_flap_count_1h" {
			unitWord = "次"
		}
		rounded := int64(math.Round(v))
		return fmt.Sprintf("%d %s", rounded, unitWord), rounded == 0
	case unitStr == "%":
		num := formatCompactFloat(v, 2)
		return fmt.Sprintf("%s%%", num), num == "0"
	case isLatencyMetric(metricName, unitStr):
		num := formatCompactFloat(v, 1)
		return fmt.Sprintf("%s ms", num), num == "0"
	case isTemperatureMetric(metricName, unitStr):
		num := formatCompactFloat(v, 1)
		return fmt.Sprintf("%s°C", num), num == "0"
	default:
		num := formatCompactFloat(v, 2)
		if unitStr != "" {
			return fmt.Sprintf("%s %s", num, unitStr), num == "0"
		}
		return num, num == "0"
	}
}

func isBandwidthMetric(metricName, unitStr string) bool {
	if strings.EqualFold(unitStr, "bps") {
		return true
	}
	return unitStr == "" && (metricName == "bandwidth_in" || metricName == "bandwidth_out")
}

func isByteCounterMetric(metricName, unitStr string) bool {
	if strings.EqualFold(unitStr, "bytes") {
		return true
	}
	switch metricName {
	case "ifHCInOctets", "ifHCOutOctets", "if_hc_in_octets", "if_hc_out_octets", "network_bytes_in", "network_bytes_out":
		return true
	default:
		return false
	}
}

func isCountMetric(metricName string) bool {
	switch metricName {
	case "stp_top_changes", "if_flap_count_1h", "hardware_fault_count",
		"optical_transceiver_count", "bgp_peer_count", "bgp_established_count",
		"if_in_errors", "if_out_errors", "if_in_discards", "if_out_discards":
		return true
	default:
		return false
	}
}

func isLatencyMetric(metricName, unitStr string) bool {
	return strings.EqualFold(unitStr, "ms") ||
		metricName == "icmp.rtt" ||
		metricName == "ping_rtt_ms" ||
		metricName == "response_time"
}

func isTemperatureMetric(metricName, unitStr string) bool {
	return unitStr == "°C" || strings.EqualFold(unitStr, "C") || metricName == "temperature"
}

func formatScaledUnit(v, base float64, units []string, maxDecimals int) (string, bool) {
	idx := 0
	for idx < len(units)-1 && math.Abs(v) >= base {
		v /= base
		idx++
	}
	num := formatCompactFloat(v, maxDecimals)
	return fmt.Sprintf("%s %s", num, units[idx]), num == "0"
}

func formatCompactFloat(v float64, maxDecimals int) string {
	scale := math.Pow10(maxDecimals)
	rounded := math.Round(v*scale) / scale
	if rounded == 0 {
		rounded = 0
	}
	s := strconv.FormatFloat(rounded, 'f', maxDecimals, 64)
	if maxDecimals > 0 {
		s = strings.TrimRight(strings.TrimRight(s, "0"), ".")
	}
	return s
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
