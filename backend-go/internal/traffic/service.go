package traffic

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"math"
	"sort"
	"strings"
	"time"

	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
)

const (
	defaultTrafficHours   = 24
	minSamplesForAnomaly  = 30
	spikeMultiplier       = 3.0
	dropThreshold         = 0.3
	highUtilization       = 90.0
	criticalUtilization   = 95.0
	errorThresholdHigh    = 100.0
	errorThresholdMedium  = 50.0
	errorThresholdLow     = 10.0
)

type Service struct {
	db         *gorm.DB
	monitoring *monitoring.MetricsWriter
	logger     *zap.Logger
}

type DeviceRow struct {
	ID        int     `gorm:"column:id"`
	Name      string  `gorm:"column:name"`
	IPAddress string  `gorm:"column:ip_address"`
}

func NewService(db *gorm.DB, monitoringWriter *monitoring.MetricsWriter, logger *zap.Logger) *Service {
	return &Service{
		db:         db,
		monitoring: monitoringWriter,
		logger:     logger,
	}
}

func (s *Service) GetNetworkTrafficSummary(ctx context.Context, timeRange string) (NetworkTrafficSummaryResponse, error) {
	if s == nil || s.db == nil {
		return NetworkTrafficSummaryResponse{}, fmt.Errorf("database not initialized")
	}

	start, end := resolveTimeRange(timeRange, time.Duration(defaultTrafficHours)*time.Hour)

	points, err := s.queryNetworkTrafficHistory(ctx, start, end)
	if err != nil {
		return NetworkTrafficSummaryResponse{}, err
	}

	inboundValues := make([]float64, 0, len(points))
	outboundValues := make([]float64, 0, len(points))
	peakValue := 0.0
	var peakTime *string
	for _, point := range points {
		inboundValues = append(inboundValues, point.Inbound)
		outboundValues = append(outboundValues, point.Outbound)
		total := point.Inbound + point.Outbound
		if total > peakValue {
			peakValue = total
			ts := point.Timestamp
			peakTime = &ts
		}
	}

	currentInbound := lastValue(inboundValues)
	currentOutbound := lastValue(outboundValues)
	peakInbound := maxValue(inboundValues)
	peakOutbound := maxValue(outboundValues)

	inboundMetric := buildTrafficMetric(currentInbound, peakInbound)
	outboundMetric := buildTrafficMetric(currentOutbound, peakOutbound)
	inboundMetric.Data = tailValues(inboundValues, 12)
	outboundMetric.Data = tailValues(outboundValues, 12)

	packetLoss := s.queryPacketLoss(ctx, start, end)

	response := NetworkTrafficSummaryResponse{
		Inbound:  inboundMetric,
		Outbound: outboundMetric,
		PeakTime: peakTime,
	}
	response.PacketLoss.Value = fmt.Sprintf("%.1f%%", packetLoss)
	response.PacketLoss.Percentage = packetLoss

	return response, nil
}

func (s *Service) CollectTrafficData(ctx context.Context, deviceIP string) (TrafficCollectionResponse, error) {
	if s == nil || s.db == nil {
		return TrafficCollectionResponse{}, fmt.Errorf("database not initialized")
	}

	device, err := s.getDeviceByIP(ctx, deviceIP)
	if err != nil {
		return TrafficCollectionResponse{}, err
	}

	rows, err := s.queryLatestInterfaceMetrics(ctx, device.ID)
	if err != nil {
		return TrafficCollectionResponse{}, err
	}

	metrics := buildMetricsFromRows(device.IPAddress, rows)

	collectedAt := time.Now().UTC().Format(time.RFC3339)
	if len(metrics) > 0 {
		collectedAt = metrics[0].Timestamp
	}

	return TrafficCollectionResponse{
		Success:     true,
		DeviceIP:    device.IPAddress,
		Metrics:     metrics,
		CollectedAt: collectedAt,
	}, nil
}

func (s *Service) GetTrafficTrends(ctx context.Context, deviceIP string, hours int) (TrafficTrendsResponse, error) {
	if s == nil || s.db == nil {
		return TrafficTrendsResponse{}, fmt.Errorf("database not initialized")
	}
	if hours <= 0 {
		hours = defaultTrafficHours
	}

	device, err := s.getDeviceByIP(ctx, deviceIP)
	if err != nil {
		return TrafficTrendsResponse{}, err
	}

	start := time.Now().Add(-time.Duration(hours) * time.Hour)
	series, err := s.queryInterfaceMetricSeries(ctx, device.ID, start)
	if err != nil {
		return TrafficTrendsResponse{}, err
	}

	trends, sampleCount := buildTrafficTrends(device.IPAddress, series)

	return TrafficTrendsResponse{
		Success:             true,
		DeviceIP:            device.IPAddress,
		AnalysisPeriodHours: hours,
		InterfaceTrends:     trends,
		TotalSamples:        sampleCount,
		AnalysisTimestamp:   time.Now().UTC().Format(time.RFC3339),
	}, nil
}

func (s *Service) GetTrafficAnomalies(ctx context.Context, deviceIP *string, severity *string, hours int) (TrafficAnomaliesResponse, error) {
	if s == nil || s.db == nil {
		return TrafficAnomaliesResponse{}, fmt.Errorf("database not initialized")
	}
	if hours <= 0 {
		hours = defaultTrafficHours
	}

	start := time.Now().Add(-time.Duration(hours) * time.Hour)
	deviceIDs := []int{}
	deviceMap := map[int]string{}

	if deviceIP != nil && strings.TrimSpace(*deviceIP) != "" {
		device, err := s.getDeviceByIP(ctx, *deviceIP)
		if err != nil {
			return TrafficAnomaliesResponse{}, err
		}
		deviceIDs = append(deviceIDs, device.ID)
		deviceMap[device.ID] = device.IPAddress
	} else {
		devices, err := s.listDevicesWithMetrics(ctx)
		if err != nil {
			return TrafficAnomaliesResponse{}, err
		}
		for _, d := range devices {
			deviceIDs = append(deviceIDs, d.ID)
			deviceMap[d.ID] = d.IPAddress
		}
	}

	anomalies := make([]TrafficAnomaly, 0)
	for _, id := range deviceIDs {
		series, err := s.queryInterfaceMetricSeries(ctx, id, start)
		if err != nil {
			return TrafficAnomaliesResponse{}, err
		}
		deviceIP := deviceMap[id]
		detected := detectAnomalies(deviceIP, series)
		anomalies = append(anomalies, detected...)
	}

	if severity != nil && strings.TrimSpace(*severity) != "" {
		filtered := make([]TrafficAnomaly, 0)
		target := strings.ToLower(strings.TrimSpace(*severity))
		for _, anomaly := range anomalies {
			if anomaly.Severity == target {
				filtered = append(filtered, anomaly)
			}
		}
		anomalies = filtered
	}

	response := TrafficAnomaliesResponse{
		Success:    true,
		Anomalies:  anomalies,
		TotalCount: len(anomalies),
		Timestamp:  time.Now().UTC().Format(time.RFC3339),
	}
	response.QueryParams.DeviceIP = deviceIP
	response.QueryParams.Severity = severity
	response.QueryParams.Hours = hours

	return response, nil
}

func (s *Service) GetTrafficSummary(ctx context.Context, deviceIPs []string, hours int) (TrafficSummary, error) {
	if s == nil || s.db == nil {
		return TrafficSummary{}, fmt.Errorf("database not initialized")
	}
	if hours <= 0 {
		hours = defaultTrafficHours
	}

	start := time.Now().Add(-time.Duration(hours) * time.Hour)
	devices, err := s.resolveDevices(ctx, deviceIPs)
	if err != nil {
		return TrafficSummary{}, err
	}

	summary := TrafficSummary{
		Devices: make(map[string]TrafficDeviceSummary),
	}

	for _, device := range devices {
		series, err := s.queryInterfaceMetricSeries(ctx, device.ID, start)
		if err != nil {
			return TrafficSummary{}, err
		}
		deviceSummary, interfaceCount, sampleCount, baselineCount := buildDeviceSummary(series)
		if interfaceCount == 0 {
			continue
		}
		deviceSummary.InterfaceCount = interfaceCount
		deviceSummary.SampleCount = sampleCount
		deviceSummary.LastUpdate = deviceSummary.LastUpdate
		summary.Devices[device.IPAddress] = deviceSummary
		summary.TotalInterfaces += interfaceCount
		summary.TotalDevices++
		summary.BaselinePatterns += baselineCount
		summary.ActiveAnomalies += len(detectAnomalies(device.IPAddress, series))
	}

	return summary, nil
}

func (s *Service) GetDeviceTraffic(ctx context.Context, deviceID int) (DeviceTrafficResponse, error) {
	if s == nil || s.db == nil {
		return DeviceTrafficResponse{}, fmt.Errorf("database not initialized")
	}
	if deviceID <= 0 {
		return DeviceTrafficResponse{}, gorm.ErrRecordNotFound
	}

	device, err := s.getDeviceByID(ctx, deviceID)
	if err != nil {
		return DeviceTrafficResponse{}, err
	}

	interfaceRows, err := s.queryDeviceInterfaces(ctx, &deviceID)
	if err != nil {
		return DeviceTrafficResponse{}, err
	}

	metricRows, err := s.queryLatestInterfaceMetricSnapshot(ctx, &deviceID, interfaceAllMetricNames())
	if err != nil {
		return DeviceTrafficResponse{}, err
	}

	metaByName := make(map[string]deviceInterfaceRow)
	for _, row := range interfaceRows {
		name := strings.TrimSpace(row.InterfaceName)
		if name == "" {
			continue
		}
		metaByName[name] = row
	}

	rateSnapshots := buildInterfaceRateSnapshots(metricRows)

	interfaceNames := make([]string, 0, len(metaByName)+len(rateSnapshots))
	seen := make(map[string]struct{})
	for name := range metaByName {
		interfaceNames = append(interfaceNames, name)
		seen[name] = struct{}{}
	}
	for key := range rateSnapshots {
		if key.DeviceID != deviceID {
			continue
		}
		if _, ok := seen[key.InterfaceName]; ok {
			continue
		}
		interfaceNames = append(interfaceNames, key.InterfaceName)
		seen[key.InterfaceName] = struct{}{}
	}

	sort.Strings(interfaceNames)

	totalIn := 0.0
	totalOut := 0.0
	interfaces := make([]InterfaceTrafficResponse, 0, len(interfaceNames))
	now := time.Now().UTC()

	for _, name := range interfaceNames {
		meta := metaByName[name]
		key := interfaceKey{DeviceID: deviceID, InterfaceName: name}
		snapshot := rateSnapshots[key]

		inRate := 0.0
		outRate := 0.0
		utilization := 0.0
		timestamp := time.Time{}
		if snapshot != nil {
			inRate = snapshot.InRate
			outRate = snapshot.OutRate
			if snapshot.HasUtil {
				utilization = snapshot.Utilization
			}
			if !snapshot.Timestamp.IsZero() {
				timestamp = snapshot.Timestamp
			}
		}
		if !snapshotHasUtil(snapshot) {
			speed := derefInt64(meta.Speed)
			if speed > 0 {
				utilization = clamp((inRate+outRate)/float64(speed)*100, 0, 100)
			}
		}

		if timestamp.IsZero() && meta.LastUpdated != nil {
			timestamp = meta.LastUpdated.UTC()
		}
		if timestamp.IsZero() {
			timestamp = now
		}

		totalIn += inRate
		totalOut += outRate

		interfaces = append(interfaces, InterfaceTrafficResponse{
			InterfaceIndex: name,
			InterfaceName:  name,
			InOctets:       derefInt64(meta.InOctets),
			OutOctets:      derefInt64(meta.OutOctets),
			InRate:         inRate,
			OutRate:        outRate,
			Utilization:    utilization,
			Timestamp:      timestamp.UTC().Format(time.RFC3339),
		})
	}

	return DeviceTrafficResponse{
		DeviceID:     device.ID,
		DeviceName:   device.Name,
		IPAddress:    device.IPAddress,
		TotalInRate:  totalIn,
		TotalOutRate: totalOut,
		Interfaces:   interfaces,
		Timestamp:    now.Format(time.RFC3339),
	}, nil
}

func (s *Service) GetTrafficTrend(
	ctx context.Context,
	deviceID int,
	interfaceIndex *string,
	start time.Time,
	end time.Time,
	interval string,
) (TrafficTrendResponse, error) {
	if s == nil || s.db == nil {
		return TrafficTrendResponse{}, fmt.Errorf("database not initialized")
	}
	if deviceID <= 0 {
		return TrafficTrendResponse{}, gorm.ErrRecordNotFound
	}

	if _, err := s.getDeviceByID(ctx, deviceID); err != nil {
		return TrafficTrendResponse{}, err
	}

	bucket, normalizedInterval := resolveTrendInterval(interval)
	start = start.UTC()
	end = end.UTC()

	inboundNames := interfaceInboundMetricNames()
	outboundNames := interfaceOutboundMetricNames()
	allNames := append(append([]string{}, inboundNames...), outboundNames...)

	type row struct {
		Bucket  time.Time `gorm:"column:bucket"`
		Inbound *float64  `gorm:"column:inbound"`
		Outbound *float64 `gorm:"column:outbound"`
	}

	query := fmt.Sprintf(
		`SELECT time_bucket('%s', collected_at) AS bucket,
            SUM(CASE WHEN metric_name IN (%s) THEN metric_value ELSE 0 END) AS inbound,
            SUM(CASE WHEN metric_name IN (%s) THEN metric_value ELSE 0 END) AS outbound
         FROM interface_metrics
         WHERE device_id = ? AND collected_at >= ? AND collected_at <= ? AND metric_name IN (%s)`,
		bucket,
		formatMetricList(inboundNames),
		formatMetricList(outboundNames),
		formatMetricList(allNames),
	)

	args := []interface{}{deviceID, start, end}
	if interfaceIndex != nil && strings.TrimSpace(*interfaceIndex) != "" {
		query += " AND interface_name = ?"
		args = append(args, strings.TrimSpace(*interfaceIndex))
	}

	query += " GROUP BY bucket ORDER BY bucket ASC"

	rows := make([]row, 0)
	if err := s.db.WithContext(ctx).Raw(query, args...).Scan(&rows).Error; err != nil {
		return TrafficTrendResponse{}, err
	}

	points := make([]TrafficTrendDataPoint, 0, len(rows))
	for _, item := range rows {
		inRate := 0.0
		if item.Inbound != nil {
			inRate = rateToMbps(*item.Inbound)
		}
		outRate := 0.0
		if item.Outbound != nil {
			outRate = rateToMbps(*item.Outbound)
		}
		points = append(points, TrafficTrendDataPoint{
			Timestamp: item.Bucket.UTC().Format(time.RFC3339),
			InRate:    inRate,
			OutRate:   outRate,
		})
	}

	return TrafficTrendResponse{
		DeviceID:       deviceID,
		InterfaceIndex: interfaceIndex,
		StartTime:      start.Format(time.RFC3339),
		EndTime:        end.Format(time.RFC3339),
		Interval:       normalizedInterval,
		DataPoints:     points,
	}, nil
}

func (s *Service) GetTopTalkers(ctx context.Context, limit int, sortBy string) ([]TopTalkersResponse, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}
	if limit <= 0 {
		limit = 10
	}
	if limit > 50 {
		limit = 50
	}

	metricRows, err := s.queryLatestInterfaceMetricSnapshot(ctx, nil, interfaceRateMetricNames())
	if err != nil {
		return nil, err
	}

	rateSnapshots := buildInterfaceRateSnapshots(metricRows)

	devices, err := s.loadDeviceMap(ctx)
	if err != nil {
		return nil, err
	}

	results := make([]TopTalkersResponse, 0, len(rateSnapshots))
	for key, snapshot := range rateSnapshots {
		if snapshot == nil {
			continue
		}
		device := devices[key.DeviceID]
		deviceName := device.Name
		if strings.TrimSpace(deviceName) == "" {
			deviceName = fmt.Sprintf("device_%d", key.DeviceID)
		}
		ip := device.IPAddress

		name := strings.TrimSpace(key.InterfaceName)
		var iface *string
		if name != "" {
			iface = &name
		}

		total := snapshot.InRate + snapshot.OutRate
		results = append(results, TopTalkersResponse{
			DeviceID:      key.DeviceID,
			DeviceName:    deviceName,
			IPAddress:     ip,
			InterfaceName: iface,
			InRate:        snapshot.InRate,
			OutRate:       snapshot.OutRate,
			TotalRate:     total,
		})
	}

	sortBy = strings.ToLower(strings.TrimSpace(sortBy))
	switch sortBy {
	case "in":
		sort.Slice(results, func(i, j int) bool { return results[i].InRate > results[j].InRate })
	case "out":
		sort.Slice(results, func(i, j int) bool { return results[i].OutRate > results[j].OutRate })
	default:
		sort.Slice(results, func(i, j int) bool { return results[i].TotalRate > results[j].TotalRate })
	}

	if len(results) > limit {
		results = results[:limit]
	}
	return results, nil
}

func (s *Service) GetBandwidthUtilization(ctx context.Context, deviceID *int, threshold float64, limit int) ([]BandwidthUtilizationResponse, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	if threshold < 0 {
		threshold = 0
	}
	if threshold > 100 {
		threshold = 100
	}

	interfaceRows, err := s.queryDeviceInterfaces(ctx, deviceID)
	if err != nil {
		return nil, err
	}

	if len(interfaceRows) == 0 {
		return []BandwidthUtilizationResponse{}, nil
	}

	metricRows, err := s.queryLatestInterfaceMetricSnapshot(ctx, deviceID, interfaceAllMetricNames())
	if err != nil {
		return nil, err
	}
	rateSnapshots := buildInterfaceRateSnapshots(metricRows)

	peakRows, err := s.queryInterfaceRatePeaks(ctx, deviceID, time.Now().Add(-time.Duration(defaultTrafficHours)*time.Hour))
	if err != nil {
		return nil, err
	}

	type resultItem struct {
		Item   BandwidthUtilizationResponse
		MaxUtil float64
	}

	items := make([]resultItem, 0, len(interfaceRows))
	for _, row := range interfaceRows {
		key := interfaceKey{DeviceID: row.DeviceID, InterfaceName: row.InterfaceName}
		snapshot := rateSnapshots[key]
		peaks := peakRows[key]

		inRate := 0.0
		outRate := 0.0
		util := 0.0
		hasUtil := false
		if snapshot != nil {
			inRate = snapshot.InRate
			outRate = snapshot.OutRate
			util = snapshot.Utilization
			hasUtil = snapshot.HasUtil
		}

		speed := derefInt64(row.Speed)
		inUtil := 0.0
		outUtil := 0.0
		peakInUtil := 0.0
		peakOutUtil := 0.0

		if speed > 0 {
			inUtil = clamp(inRate/float64(speed)*100, 0, 100)
			outUtil = clamp(outRate/float64(speed)*100, 0, 100)
			peakInUtil = clamp(peaks.InRate/float64(speed)*100, 0, 100)
			peakOutUtil = clamp(peaks.OutRate/float64(speed)*100, 0, 100)
		} else if hasUtil {
			inUtil = clamp(util, 0, 100)
			outUtil = clamp(util, 0, 100)
			peakInUtil = clamp(util, 0, 100)
			peakOutUtil = clamp(util, 0, 100)
		}

		maxUtil := math.Max(inUtil, outUtil)
		if maxUtil < threshold {
			continue
		}

		item := BandwidthUtilizationResponse{
			DeviceID:           row.DeviceID,
			DeviceName:         row.DeviceName,
			InterfaceIndex:     row.InterfaceName,
			InterfaceName:      row.InterfaceName,
			Speed:              speed,
			InUtilization:      inUtil,
			OutUtilization:     outUtil,
			PeakInUtilization:  peakInUtil,
			PeakOutUtilization: peakOutUtil,
		}

		items = append(items, resultItem{Item: item, MaxUtil: maxUtil})
	}

	sort.Slice(items, func(i, j int) bool {
		if limit > 0 {
			if items[i].MaxUtil == items[j].MaxUtil {
				if items[i].Item.DeviceName == items[j].Item.DeviceName {
					return items[i].Item.InterfaceName < items[j].Item.InterfaceName
				}
				return items[i].Item.DeviceName < items[j].Item.DeviceName
			}
			return items[i].MaxUtil > items[j].MaxUtil
		}
		if items[i].Item.DeviceName == items[j].Item.DeviceName {
			return items[i].Item.InterfaceName < items[j].Item.InterfaceName
		}
		return items[i].Item.DeviceName < items[j].Item.DeviceName
	})

	if limit > 0 && len(items) > limit {
		items = items[:limit]
	}

	results := make([]BandwidthUtilizationResponse, 0, len(items))
	for _, item := range items {
		results = append(results, item.Item)
	}
	return results, nil
}

func (s *Service) SaveMonitoringConfig(ctx context.Context, deviceIPs []string, hours int, enableAnomaly bool) (TrafficMonitoringConfig, error) {
	if s == nil || s.db == nil {
		return TrafficMonitoringConfig{}, fmt.Errorf("database not initialized")
	}
	if hours <= 0 {
		hours = defaultTrafficHours
	}

	config := TrafficMonitoringConfig{
		DeviceIPs:            deviceIPs,
		AnalysisPeriodHours:  hours,
		EnableAnomalyDetection: enableAnomaly,
		StartedAt:            time.Now().UTC().Format(time.RFC3339),
	}

	raw, err := json.Marshal(config)
	if err != nil {
		return TrafficMonitoringConfig{}, err
	}

	if err := s.upsertSystemSetting(ctx, "traffic_monitoring_config", string(raw), "json", "流量监控配置"); err != nil {
		return TrafficMonitoringConfig{}, err
	}

	return config, nil
}

func (s *Service) CalculateBaseline(ctx context.Context, deviceIP string, iface string, hours int) (TrafficBaseline, error) {
	if s == nil || s.db == nil {
		return TrafficBaseline{}, fmt.Errorf("database not initialized")
	}

	if hours <= 0 {
		hours = defaultTrafficHours
	}

	device, err := s.getDeviceByIP(ctx, deviceIP)
	if err != nil {
		return TrafficBaseline{}, err
	}

	iface = strings.TrimSpace(iface)
	if iface == "" {
		return TrafficBaseline{}, fmt.Errorf("interface is required")
	}

	start := time.Now().Add(-time.Duration(hours) * time.Hour)
	names := metricNameList()
	query := fmt.Sprintf(
		`SELECT interface_name, metric_name, metric_value, collected_at
         FROM interface_metrics
         WHERE device_id = ? AND interface_name = ? AND metric_name IN (%s) AND collected_at >= ?
         ORDER BY collected_at ASC`,
		formatMetricList(names),
	)

	rows := make([]interfaceMetricRow, 0)
	if err := s.db.WithContext(ctx).Raw(query, device.ID, iface, start).Scan(&rows).Error; err != nil {
		return TrafficBaseline{}, err
	}

	var (
		inSum   float64
		outSum  float64
		utilSum float64
		inCount int
		outCount int
		utilCount int
		sampleCount int
		lastSeen time.Time
	)

	for _, row := range rows {
		if row.MetricValue == nil {
			continue
		}
		sampleCount++
		if row.CollectedAt.After(lastSeen) {
			lastSeen = row.CollectedAt
		}
		switch normalizeInterfaceMetric(row.MetricName) {
		case "bytes_in":
			inSum += *row.MetricValue
			inCount++
		case "bytes_out":
			outSum += *row.MetricValue
			outCount++
		case "bandwidth_utilization":
			utilSum += *row.MetricValue
			utilCount++
		}
	}

	avgIn := 0.0
	if inCount > 0 {
		avgIn = inSum / float64(inCount)
	}
	avgOut := 0.0
	if outCount > 0 {
		avgOut = outSum / float64(outCount)
	}
	avgUtil := 0.0
	if utilCount > 0 {
		avgUtil = utilSum / float64(utilCount)
	}

	var lastSeenStr *string
	if !lastSeen.IsZero() {
		value := lastSeen.UTC().Format(time.RFC3339)
		lastSeenStr = &value
	}

	return TrafficBaseline{
		DeviceIP:       device.IPAddress,
		Interface:      iface,
		Hours:          hours,
		SampleCount:    sampleCount,
		AvgIn:          avgIn,
		AvgOut:         avgOut,
		AvgUtilization: avgUtil,
		LastSeen:       lastSeenStr,
	}, nil
}

func (s *Service) CleanupData(ctx context.Context, olderThanHours int) (int64, error) {
	if s == nil || s.db == nil {
		return 0, fmt.Errorf("database not initialized")
	}
	if olderThanHours <= 0 {
		olderThanHours = 168
	}

	threshold := time.Now().Add(-time.Duration(olderThanHours) * time.Hour)
	result := s.db.WithContext(ctx).Table("interface_metrics").Where("collected_at < ?", threshold).Delete(nil)
	if result.Error != nil {
		return 0, result.Error
	}
	return result.RowsAffected, nil
}

func (s *Service) queryPacketLoss(ctx context.Context, start time.Time, end time.Time) float64 {
	type avgRow struct {
		AvgValue sql.NullFloat64 `gorm:"column:avg_value"`
	}
	var avg avgRow
	err := s.db.WithContext(ctx).
		Table("device_metrics").
		Select("AVG(metric_value) AS avg_value").
		Where("metric_name = ?", "packet_loss").
		Where("collected_at >= ? AND collected_at <= ?", start, end).
		Scan(&avg).Error
	if err != nil || !avg.AvgValue.Valid {
		return 0
	}
	return avg.AvgValue.Float64
}

type trafficPoint struct {
	Timestamp string  `gorm:"column:timestamp"`
	Inbound   float64 `gorm:"column:inbound"`
	Outbound  float64 `gorm:"column:outbound"`
}

func (s *Service) queryNetworkTrafficHistory(ctx context.Context, start time.Time, end time.Time) ([]trafficPoint, error) {
	if s.monitoring != nil {
		points, err := s.monitoring.GetNetworkTrafficHistory(ctx, start, end)
		if err == nil {
			result := make([]trafficPoint, 0, len(points))
			for _, point := range points {
				result = append(result, trafficPoint{
					Timestamp: point.Timestamp,
					Inbound:   point.Inbound,
					Outbound:  point.Outbound,
				})
			}
			return result, nil
		}
	}

	inboundNames := []string{"bandwidth_in", "network_bytes_in", "throughput_in"}
	outboundNames := []string{"bandwidth_out", "network_bytes_out", "throughput_out"}
	allNames := append(append([]string{}, inboundNames...), outboundNames...)
	interval := bucketIntervalString(start, end)

	query := fmt.Sprintf(
		`SELECT time_bucket('%s', collected_at) AS timestamp,
            SUM(CASE WHEN metric_name IN (%s) THEN metric_value ELSE 0 END) AS inbound,
            SUM(CASE WHEN metric_name IN (%s) THEN metric_value ELSE 0 END) AS outbound
         FROM device_metrics
         WHERE collected_at >= ? AND collected_at <= ? AND metric_name IN (%s)
         GROUP BY timestamp
         ORDER BY timestamp ASC`,
		interval,
		formatMetricList(inboundNames),
		formatMetricList(outboundNames),
		formatMetricList(allNames),
	)

	rows := make([]trafficPoint, 0)
	if err := s.db.WithContext(ctx).Raw(query, start, end).Scan(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

func (s *Service) queryLatestInterfaceMetrics(ctx context.Context, deviceID int) ([]interfaceMetricRow, error) {
	names := metricNameList()
	query := fmt.Sprintf(
		`SELECT DISTINCT ON (interface_name, metric_name)
            interface_name, metric_name, metric_value, collected_at
         FROM interface_metrics
         WHERE device_id = ? AND metric_name IN (%s)
         ORDER BY interface_name, metric_name, collected_at DESC`,
		formatMetricList(names),
	)

	rows := make([]interfaceMetricRow, 0)
	if err := s.db.WithContext(ctx).Raw(query, deviceID).Scan(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

type interfaceMetricRow struct {
	InterfaceName string    `gorm:"column:interface_name"`
	MetricName    string    `gorm:"column:metric_name"`
	MetricValue   *float64  `gorm:"column:metric_value"`
	CollectedAt   time.Time `gorm:"column:collected_at"`
}

type interfaceMetricSnapshotRow struct {
	DeviceID      int       `gorm:"column:device_id"`
	InterfaceName string    `gorm:"column:interface_name"`
	MetricName    string    `gorm:"column:metric_name"`
	MetricValue   *float64  `gorm:"column:metric_value"`
	CollectedAt   time.Time `gorm:"column:collected_at"`
}

type interfaceKey struct {
	DeviceID      int
	InterfaceName string
}

type interfaceRateSnapshot struct {
	InRate      float64
	OutRate     float64
	Utilization float64
	Timestamp   time.Time
	HasUtil     bool
}

type interfaceRatePeak struct {
	InRate  float64
	OutRate float64
}

type deviceInterfaceRow struct {
	DeviceID      int        `gorm:"column:device_id"`
	DeviceName    string     `gorm:"column:device_name"`
	IPAddress     string     `gorm:"column:ip_address"`
	InterfaceName string     `gorm:"column:interface_name"`
	Alias         *string    `gorm:"column:alias"`
	Speed         *int64     `gorm:"column:speed"`
	InOctets      *int64     `gorm:"column:in_octets"`
	OutOctets     *int64     `gorm:"column:out_octets"`
	LastUpdated   *time.Time `gorm:"column:last_updated"`
}

func (s *Service) queryInterfaceMetricSeries(ctx context.Context, deviceID int, start time.Time) ([]interfaceMetricRow, error) {
	names := metricNameList()
	query := fmt.Sprintf(
		`SELECT interface_name, metric_name, metric_value, collected_at
         FROM interface_metrics
         WHERE device_id = ? AND metric_name IN (%s) AND collected_at >= ?
         ORDER BY interface_name ASC, metric_name ASC, collected_at ASC`,
		formatMetricList(names),
	)

	rows := make([]interfaceMetricRow, 0)
	if err := s.db.WithContext(ctx).Raw(query, deviceID, start).Scan(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

func (s *Service) queryLatestInterfaceMetricSnapshot(ctx context.Context, deviceID *int, metrics []string) ([]interfaceMetricSnapshotRow, error) {
	if len(metrics) == 0 {
		return []interfaceMetricSnapshotRow{}, nil
	}

	query := fmt.Sprintf(
		`SELECT DISTINCT ON (device_id, interface_name, metric_name)
            device_id, interface_name, metric_name, metric_value, collected_at
         FROM interface_metrics
         WHERE metric_name IN (%s)`,
		formatMetricList(metrics),
	)

	args := make([]interface{}, 0, 2)
	if deviceID != nil {
		query += " AND device_id = ?"
		args = append(args, *deviceID)
	}

	query += " ORDER BY device_id, interface_name, metric_name, collected_at DESC"

	rows := make([]interfaceMetricSnapshotRow, 0)
	if err := s.db.WithContext(ctx).Raw(query, args...).Scan(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

func (s *Service) queryInterfaceRatePeaks(ctx context.Context, deviceID *int, since time.Time) (map[interfaceKey]interfaceRatePeak, error) {
	metricNames := interfaceRateMetricNames()
	if len(metricNames) == 0 {
		return map[interfaceKey]interfaceRatePeak{}, nil
	}

	query := fmt.Sprintf(
		`SELECT device_id, interface_name, metric_name, MAX(metric_value) AS peak_value
         FROM interface_metrics
         WHERE metric_name IN (%s) AND collected_at >= ?`,
		formatMetricList(metricNames),
	)
	args := make([]interface{}, 0, 2)
	args = append(args, since)
	if deviceID != nil {
		query += " AND device_id = ?"
		args = append(args, *deviceID)
	}
	query += " GROUP BY device_id, interface_name, metric_name"

	type peakRow struct {
		DeviceID      int      `gorm:"column:device_id"`
		InterfaceName string   `gorm:"column:interface_name"`
		MetricName    string   `gorm:"column:metric_name"`
		PeakValue     *float64 `gorm:"column:peak_value"`
	}

	rows := make([]peakRow, 0)
	if err := s.db.WithContext(ctx).Raw(query, args...).Scan(&rows).Error; err != nil {
		return nil, err
	}

	peaks := make(map[interfaceKey]interfaceRatePeak)
	for _, row := range rows {
		if row.PeakValue == nil {
			continue
		}
		iface := strings.TrimSpace(row.InterfaceName)
		if iface == "" {
			continue
		}
		key := interfaceKey{DeviceID: row.DeviceID, InterfaceName: iface}
		peak := peaks[key]
		switch normalizeInterfaceMetric(row.MetricName) {
		case "bytes_in":
			peak.InRate = rateToMbps(*row.PeakValue)
		case "bytes_out":
			peak.OutRate = rateToMbps(*row.PeakValue)
		}
		peaks[key] = peak
	}

	return peaks, nil
}

func (s *Service) getDeviceByIP(ctx context.Context, deviceIP string) (DeviceRow, error) {
	ip := strings.TrimSpace(deviceIP)
	if ip == "" {
		return DeviceRow{}, gorm.ErrRecordNotFound
	}

	var device DeviceRow
	err := s.db.WithContext(ctx).
		Table("devices").
		Select("id, name, ip_address").
		Where("ip_address = ?", ip).
		Take(&device).Error
	if err != nil {
		return DeviceRow{}, err
	}
	return device, nil
}

func (s *Service) getDeviceByID(ctx context.Context, deviceID int) (DeviceRow, error) {
	if deviceID <= 0 {
		return DeviceRow{}, gorm.ErrRecordNotFound
	}

	var device DeviceRow
	err := s.db.WithContext(ctx).
		Table("devices").
		Select("id, name, ip_address").
		Where("id = ?", deviceID).
		Take(&device).Error
	if err != nil {
		return DeviceRow{}, err
	}
	return device, nil
}

func (s *Service) resolveDevices(ctx context.Context, deviceIPs []string) ([]DeviceRow, error) {
	trimmed := make([]string, 0, len(deviceIPs))
	for _, ip := range deviceIPs {
		value := strings.TrimSpace(ip)
		if value != "" {
			trimmed = append(trimmed, value)
		}
	}

	query := s.db.WithContext(ctx).Table("devices").Select("id, name, ip_address")
	if len(trimmed) > 0 {
		query = query.Where("ip_address IN ?", trimmed)
	}

	rows := make([]DeviceRow, 0)
	if err := query.Scan(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

func (s *Service) listDevicesWithMetrics(ctx context.Context) ([]DeviceRow, error) {
	rows := make([]DeviceRow, 0)
	query := `SELECT DISTINCT d.id, d.name, d.ip_address
        FROM devices d
        JOIN interface_metrics m ON m.device_id = d.id`
	if err := s.db.WithContext(ctx).Raw(query).Scan(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

func (s *Service) queryDeviceInterfaces(ctx context.Context, deviceID *int) ([]deviceInterfaceRow, error) {
	rows := make([]deviceInterfaceRow, 0)
	query := s.db.WithContext(ctx).
		Table("device_interfaces AS di").
		Select(`di.device_id,
            d.name AS device_name,
            d.ip_address AS ip_address,
            di.name AS interface_name,
            di.alias AS alias,
            di.speed AS speed,
            di.in_octets AS in_octets,
            di.out_octets AS out_octets,
            di.last_updated AS last_updated`).
		Joins("JOIN devices d ON d.id = di.device_id")

	if deviceID != nil {
		query = query.Where("di.device_id = ?", *deviceID)
	}

	if err := query.Scan(&rows).Error; err != nil {
		return nil, err
	}
	return rows, nil
}

func (s *Service) loadDeviceMap(ctx context.Context) (map[int]DeviceRow, error) {
	rows := make([]DeviceRow, 0)
	if err := s.db.WithContext(ctx).
		Table("devices").
		Select("id, name, ip_address").
		Scan(&rows).Error; err != nil {
		return nil, err
	}

	result := make(map[int]DeviceRow, len(rows))
	for _, row := range rows {
		result[row.ID] = row
	}
	return result, nil
}

func (s *Service) upsertSystemSetting(ctx context.Context, key string, value string, dataType string, description string) error {
	query := `
        INSERT INTO system_settings (key, value, category, data_type, description, updated_at)
        VALUES (?, ?, 'system', ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value,
            data_type = EXCLUDED.data_type,
            description = EXCLUDED.description,
            updated_at = CURRENT_TIMESTAMP`

	return s.db.WithContext(ctx).Exec(query, key, value, dataType, description).Error
}

func interfaceInboundMetricNames() []string {
	return []string{
		"bytes_in", "in_bytes", "rx_bytes", "in_octets", "ifinoctets",
	}
}

func interfaceOutboundMetricNames() []string {
	return []string{
		"bytes_out", "out_bytes", "tx_bytes", "out_octets", "ifoutoctets",
	}
}

func interfaceRateMetricNames() []string {
	return append(append([]string{}, interfaceInboundMetricNames()...), interfaceOutboundMetricNames()...)
}

func interfaceUtilizationMetricNames() []string {
	return []string{"bandwidth_utilization", "utilization", "bw_utilization", "bandwidth_util"}
}

func interfaceAllMetricNames() []string {
	names := append(interfaceRateMetricNames(), interfaceUtilizationMetricNames()...)
	seen := make(map[string]struct{}, len(names))
	result := make([]string, 0, len(names))
	for _, name := range names {
		key := strings.TrimSpace(name)
		if key == "" {
			continue
		}
		if _, ok := seen[key]; ok {
			continue
		}
		seen[key] = struct{}{}
		result = append(result, key)
	}
	return result
}

func buildInterfaceRateSnapshots(rows []interfaceMetricSnapshotRow) map[interfaceKey]*interfaceRateSnapshot {
	snapshots := make(map[interfaceKey]*interfaceRateSnapshot)
	for _, row := range rows {
		if row.MetricValue == nil {
			continue
		}
		iface := strings.TrimSpace(row.InterfaceName)
		if iface == "" {
			continue
		}
		key := interfaceKey{DeviceID: row.DeviceID, InterfaceName: iface}
		snapshot := snapshots[key]
		if snapshot == nil {
			snapshot = &interfaceRateSnapshot{}
			snapshots[key] = snapshot
		}
		switch normalizeInterfaceMetric(row.MetricName) {
		case "bytes_in":
			snapshot.InRate = rateToMbps(*row.MetricValue)
		case "bytes_out":
			snapshot.OutRate = rateToMbps(*row.MetricValue)
		case "bandwidth_utilization":
			snapshot.Utilization = *row.MetricValue
			snapshot.HasUtil = true
		}
		if row.CollectedAt.After(snapshot.Timestamp) {
			snapshot.Timestamp = row.CollectedAt
		}
	}
	return snapshots
}

func rateToMbps(value float64) float64 {
	if value < 0 {
		return 0
	}
	return value / 1_000_000.0
}

func derefInt64(value *int64) int64 {
	if value == nil {
		return 0
	}
	return *value
}

func snapshotHasUtil(snapshot *interfaceRateSnapshot) bool {
	return snapshot != nil && snapshot.HasUtil
}

func resolveTrendInterval(raw string) (string, string) {
	normalized := strings.ToLower(strings.TrimSpace(raw))
	switch normalized {
	case "1m", "1min", "1minute":
		return "1 minute", "1m"
	case "5m", "5min", "5minute":
		return "5 minutes", "5m"
	case "15m", "15min", "15minute":
		return "15 minutes", "15m"
	case "30m", "30min", "30minute":
		return "30 minutes", "30m"
	case "1h", "1hour":
		return "1 hour", "1h"
	case "6h", "6hour":
		return "6 hours", "6h"
	case "12h", "12hour":
		return "12 hours", "12h"
	case "1d", "24h":
		return "1 day", "1d"
	default:
		return "5 minutes", "5m"
	}
}

func resolveTimeRange(raw string, fallback time.Duration) (time.Time, time.Time) {
	end := time.Now().UTC()
	raw = strings.TrimSpace(strings.ToLower(raw))
	if raw == "" {
		return end.Add(-fallback), end
	}

	if strings.HasSuffix(raw, "d") {
		value := strings.TrimSuffix(raw, "d")
		if parsed, err := time.ParseDuration(value + "h"); err == nil {
			return end.Add(-parsed*24), end
		}
	}

	if parsed, err := time.ParseDuration(raw); err == nil {
		return end.Add(-parsed), end
	}

	return end.Add(-fallback), end
}

func bucketIntervalString(start time.Time, end time.Time) string {
	diff := end.Sub(start)
	switch {
	case diff <= 6*time.Hour:
		return "5 minutes"
	case diff <= 24*time.Hour:
		return "15 minutes"
	case diff <= 72*time.Hour:
		return "1 hour"
	default:
		return "6 hours"
	}
}

func formatMetricList(metrics []string) string {
	quoted := make([]string, 0, len(metrics))
	for _, name := range metrics {
		quoted = append(quoted, fmt.Sprintf("'%s'", name))
	}
	return strings.Join(quoted, ", ")
}

func metricNameList() []string {
	return []string{
		"bytes_in", "in_bytes", "rx_bytes", "in_octets", "ifinoctets",
		"bytes_out", "out_bytes", "tx_bytes", "out_octets", "ifoutoctets",
		"packets_in", "in_packets", "rx_packets", "ifinucastpkts",
		"packets_out", "out_packets", "tx_packets", "ifoutucastpkts",
		"bandwidth_utilization", "utilization", "bw_utilization", "bandwidth_util",
		"errors", "in_errors", "out_errors", "ifinerrors", "ifouterrors",
		"discards", "in_discards", "out_discards", "ifindiscards", "ifoutdiscards",
	}
}

func normalizeInterfaceMetric(raw string) string {
	normalized := strings.ToLower(strings.TrimSpace(raw))
	normalized = strings.ReplaceAll(normalized, "-", "_")
	normalized = strings.ReplaceAll(normalized, " ", "_")

	switch normalized {
	case "bytes_in", "in_bytes", "rx_bytes", "in_octets", "ifinoctets":
		return "bytes_in"
	case "bytes_out", "out_bytes", "tx_bytes", "out_octets", "ifoutoctets":
		return "bytes_out"
	case "packets_in", "in_packets", "rx_packets", "ifinucastpkts":
		return "packets_in"
	case "packets_out", "out_packets", "tx_packets", "ifoutucastpkts":
		return "packets_out"
	case "bandwidth_utilization", "utilization", "bw_utilization", "bandwidth_util":
		return "bandwidth_utilization"
	case "errors", "in_errors", "out_errors", "ifinerrors", "ifouterrors":
		return "errors"
	case "discards", "in_discards", "out_discards", "ifindiscards", "ifoutdiscards":
		return "discards"
	default:
		return normalized
	}
}

func buildMetricsFromRows(deviceIP string, rows []interfaceMetricRow) []TrafficMetric {
	type metricBucket struct {
		Metric    TrafficMetric
		Timestamp time.Time
	}
	buckets := make(map[string]*metricBucket)

	for _, row := range rows {
		if row.MetricValue == nil {
			continue
		}
		iface := strings.TrimSpace(row.InterfaceName)
		if iface == "" {
			continue
		}
		bucket := buckets[iface]
		if bucket == nil {
			bucket = &metricBucket{
				Metric: TrafficMetric{
					DeviceIP:  deviceIP,
					Interface: iface,
				},
				Timestamp: row.CollectedAt,
			}
			buckets[iface] = bucket
		}

		if row.CollectedAt.After(bucket.Timestamp) {
			bucket.Timestamp = row.CollectedAt
		}

		switch normalizeInterfaceMetric(row.MetricName) {
		case "bytes_in":
			bucket.Metric.BytesIn = *row.MetricValue
		case "bytes_out":
			bucket.Metric.BytesOut = *row.MetricValue
		case "packets_in":
			bucket.Metric.PacketsIn = *row.MetricValue
		case "packets_out":
			bucket.Metric.PacketsOut = *row.MetricValue
		case "bandwidth_utilization":
			bucket.Metric.BandwidthUtilization = *row.MetricValue
		case "errors":
			bucket.Metric.Errors += *row.MetricValue
		case "discards":
			bucket.Metric.Discards += *row.MetricValue
		}
	}

	result := make([]TrafficMetric, 0, len(buckets))
	for _, bucket := range buckets {
		bucket.Metric.Timestamp = bucket.Timestamp.UTC().Format(time.RFC3339)
		result = append(result, bucket.Metric)
	}

	sort.Slice(result, func(i, j int) bool {
		return result[i].Interface < result[j].Interface
	})

	return result
}

type metricSeries struct {
	Points []metricPoint
}

func buildTrafficTrends(deviceIP string, rows []interfaceMetricRow) ([]TrafficTrend, int) {
	type seriesKey struct {
		iface  string
		metric string
	}

	seriesMap := make(map[seriesKey]*metricSeries)
	for _, row := range rows {
		if row.MetricValue == nil {
			continue
		}
		iface := strings.TrimSpace(row.InterfaceName)
		if iface == "" {
			continue
		}
		metric := normalizeInterfaceMetric(row.MetricName)
		if metric == "" {
			continue
		}

		key := seriesKey{iface: iface, metric: metric}
		if seriesMap[key] == nil {
			seriesMap[key] = &metricSeries{}
		}
		seriesMap[key].Points = append(seriesMap[key].Points, metricPoint{
			Timestamp: row.CollectedAt.UTC().Format(time.RFC3339),
			Value:     *row.MetricValue,
		})
	}

	trends := make([]TrafficTrend, 0)
	sampleCount := 0

	for key, series := range seriesMap {
		sort.Slice(series.Points, func(i, j int) bool {
			return series.Points[i].Timestamp < series.Points[j].Timestamp
		})
		sampleCount += len(series.Points)

		current, prev := lastTwoValues(series.Points)
		avg := averageValues(series.Points)
		peak := maxPointValue(series.Points)

		_ = prev
		_ = current

		trend := findTrend(trends, key.iface, deviceIP)
		if trend == nil {
			trends = append(trends, TrafficTrend{
				DeviceIP:  deviceIP,
				Interface: key.iface,
			})
			trend = &trends[len(trends)-1]
		}

		switch key.metric {
		case "bytes_in":
			trend.CurrentIn = current
			trend.TrendIn = current - prev
			trend.AvgIn = avg
			trend.PeakIn = peak
		case "bytes_out":
			trend.CurrentOut = current
			trend.TrendOut = current - prev
			trend.AvgOut = avg
			trend.PeakOut = peak
		case "bandwidth_utilization":
			trend.CurrentUtilization = current
			trend.TrendUtilization = current - prev
			trend.AvgUtilization = avg
			trend.PeakUtilization = peak
		}
	}

	return trends, sampleCount
}

func buildDeviceSummary(rows []interfaceMetricRow) (TrafficDeviceSummary, int, int, int) {
	type ifaceAgg struct {
		LastSeen       time.Time
		UtilizationSum float64
		UtilizationCnt int
		BytesSum       float64
		SampleCount    int
	}

	interfaces := make(map[string]*ifaceAgg)
	for _, row := range rows {
		if row.MetricValue == nil {
			continue
		}
		iface := strings.TrimSpace(row.InterfaceName)
		if iface == "" {
			continue
		}
		agg := interfaces[iface]
		if agg == nil {
			agg = &ifaceAgg{}
			interfaces[iface] = agg
		}
		if row.CollectedAt.After(agg.LastSeen) {
			agg.LastSeen = row.CollectedAt
		}
		switch normalizeInterfaceMetric(row.MetricName) {
		case "bandwidth_utilization":
			agg.UtilizationSum += *row.MetricValue
			agg.UtilizationCnt++
		case "bytes_in", "bytes_out":
			agg.BytesSum += *row.MetricValue
		}
		agg.SampleCount++
	}

	deviceSummary := TrafficDeviceSummary{
		Interfaces: make(map[string]TrafficInterfaceSummary),
	}
	interfaceCount := 0
	sampleCount := 0
	baselineCount := 0
	var lastUpdate time.Time

	for iface, agg := range interfaces {
		interfaceCount++
		sampleCount += agg.SampleCount
		if agg.SampleCount >= minSamplesForAnomaly {
			baselineCount++
		}
		if agg.LastSeen.After(lastUpdate) {
			lastUpdate = agg.LastSeen
		}
		avgUtil := 0.0
		if agg.UtilizationCnt > 0 {
			avgUtil = agg.UtilizationSum / float64(agg.UtilizationCnt)
		}
		deviceSummary.Interfaces[iface] = TrafficInterfaceSummary{
			LastSeen:       agg.LastSeen.UTC().Format(time.RFC3339),
			AvgUtilization: avgUtil,
			TotalBytes:     agg.BytesSum,
		}
	}

	if !lastUpdate.IsZero() {
		deviceSummary.LastUpdate = lastUpdate.UTC().Format(time.RFC3339)
	}

	return deviceSummary, interfaceCount, sampleCount, baselineCount
}

func detectAnomalies(deviceIP string, rows []interfaceMetricRow) []TrafficAnomaly {
	type ifaceSeries struct {
		values []float64
		util   []float64
		errors []float64
		times  []time.Time
	}

	seriesMap := make(map[string]*ifaceSeries)
	for _, row := range rows {
		if row.MetricValue == nil {
			continue
		}
		iface := strings.TrimSpace(row.InterfaceName)
		if iface == "" {
			continue
		}
		metric := normalizeInterfaceMetric(row.MetricName)
		if metric == "" {
			continue
		}
		series := seriesMap[iface]
		if series == nil {
			series = &ifaceSeries{}
			seriesMap[iface] = series
		}

		switch metric {
		case "bytes_in", "bytes_out":
			series.values = append(series.values, *row.MetricValue)
		case "bandwidth_utilization":
			series.util = append(series.util, *row.MetricValue)
			series.times = append(series.times, row.CollectedAt)
		case "errors":
			series.errors = append(series.errors, *row.MetricValue)
		}
	}

	anomalies := make([]TrafficAnomaly, 0)
	for iface, series := range seriesMap {
		if len(series.values) >= minSamplesForAnomaly {
			current := series.values[len(series.values)-1]
			mean, std := meanStd(series.values)
			if mean > 0 && current > mean*spikeMultiplier {
				anomalies = append(anomalies, TrafficAnomaly{
					Timestamp:     time.Now().UTC().Format(time.RFC3339),
					DeviceIP:      deviceIP,
					Interface:     iface,
					AnomalyType:   "traffic_spike",
					Severity:      severityByRatio(current / mean),
					Description:   fmt.Sprintf("流量激增至基线的%.1f倍", current/mean),
					BaselineValue: mean,
					CurrentValue:  current,
					Confidence:    clamp(1.0-std/mean, 0.3, 0.95),
					Metadata: map[string]interface{}{
						"spike_ratio": current / mean,
					},
				})
			} else if mean > 0 && current < mean*dropThreshold {
				anomalies = append(anomalies, TrafficAnomaly{
					Timestamp:     time.Now().UTC().Format(time.RFC3339),
					DeviceIP:      deviceIP,
					Interface:     iface,
					AnomalyType:   "traffic_drop",
					Severity:      severityByRatio(mean / math.Max(current, 1)),
					Description:   fmt.Sprintf("流量骤降至基线的%.1f%%", current/mean*100),
					BaselineValue: mean,
					CurrentValue:  current,
					Confidence:    clamp(1.0-std/mean, 0.3, 0.95),
					Metadata: map[string]interface{}{
						"drop_ratio": current / mean,
					},
				})
			}
		}

		if len(series.util) > 0 {
			util := series.util[len(series.util)-1]
			if util >= highUtilization {
				severity := "medium"
				if util >= criticalUtilization {
					severity = "high"
				}
				anomalies = append(anomalies, TrafficAnomaly{
					Timestamp:     time.Now().UTC().Format(time.RFC3339),
					DeviceIP:      deviceIP,
					Interface:     iface,
					AnomalyType:   "high_utilization",
					Severity:      severity,
					Description:   fmt.Sprintf("带宽利用率过高: %.1f%%", util),
					BaselineValue: 0,
					CurrentValue:  util,
					Confidence:    0.9,
					Metadata: map[string]interface{}{
						"utilization": util,
					},
				})
			}
		}

		if len(series.errors) > 0 {
			errValue := series.errors[len(series.errors)-1]
			if errValue >= errorThresholdLow {
				anomalies = append(anomalies, TrafficAnomaly{
					Timestamp:     time.Now().UTC().Format(time.RFC3339),
					DeviceIP:      deviceIP,
					Interface:     iface,
					AnomalyType:   "high_errors",
					Severity:      severityByErrors(errValue),
					Description:   fmt.Sprintf("接口错误包数量异常: %.0f", errValue),
					BaselineValue: 0,
					CurrentValue:  errValue,
					Confidence:    0.95,
					Metadata: map[string]interface{}{
						"errors": errValue,
					},
				})
			}
		}
	}

	return anomalies
}

func buildTrafficMetric(current float64, peak float64) NetworkTrafficMetric {
	percentage := 0.0
	if peak > 0 {
		percentage = current / peak * 100
	}
	return NetworkTrafficMetric{
		Value:      fmt.Sprintf("%.1f Mbps", current),
		Percentage: percentage,
		Current:    current,
		Peak:       peak,
	}
}

func tailValues(values []float64, size int) []float64 {
	if len(values) <= size {
		return values
	}
	return values[len(values)-size:]
}

func lastValue(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	return values[len(values)-1]
}

func maxValue(values []float64) float64 {
	if len(values) == 0 {
		return 0
	}
	max := values[0]
	for _, value := range values[1:] {
		if value > max {
			max = value
		}
	}
	return max
}

type metricPoint struct {
	Timestamp string
	Value     float64
}

func lastTwoValues(points []metricPoint) (float64, float64) {
	if len(points) == 0 {
		return 0, 0
	}
	if len(points) == 1 {
		return points[0].Value, points[0].Value
	}
	last := points[len(points)-1].Value
	prev := points[len(points)-2].Value
	return last, prev
}

func averageValues(points []metricPoint) float64 {
	if len(points) == 0 {
		return 0
	}
	sum := 0.0
	for _, point := range points {
		sum += point.Value
	}
	return sum / float64(len(points))
}

func maxPointValue(points []metricPoint) float64 {
	max := 0.0
	for _, point := range points {
		if point.Value > max {
			max = point.Value
		}
	}
	return max
}

func findTrend(trends []TrafficTrend, iface string, deviceIP string) *TrafficTrend {
	for idx := range trends {
		if trends[idx].Interface == iface && trends[idx].DeviceIP == deviceIP {
			return &trends[idx]
		}
	}
	return nil
}

func meanStd(values []float64) (float64, float64) {
	if len(values) == 0 {
		return 0, 0
	}
	mean := 0.0
	for _, value := range values {
		mean += value
	}
	mean /= float64(len(values))
	variance := 0.0
	for _, value := range values {
		diff := value - mean
		variance += diff * diff
	}
	variance /= float64(len(values))
	return mean, math.Sqrt(variance)
}

func severityByRatio(ratio float64) string {
	switch {
	case ratio >= 10:
		return "critical"
	case ratio >= 5:
		return "high"
	case ratio >= 3:
		return "medium"
	default:
		return "low"
	}
}

func severityByErrors(value float64) string {
	switch {
	case value >= errorThresholdHigh:
		return "critical"
	case value >= errorThresholdMedium:
		return "high"
	default:
		return "medium"
	}
}

func clamp(value float64, min float64, max float64) float64 {
	if value < min {
		return min
	}
	if value > max {
		return max
	}
	return value
}
