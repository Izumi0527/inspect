package monitoring

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"go.uber.org/zap"
	"gorm.io/datatypes"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/ws"
)

var ErrNoMetrics = errors.New("no metrics to write")

type WriteResult struct {
	DeviceMetrics    int
	InterfaceMetrics int
	SystemMetrics    int
}

type MetricsWriter struct {
	db        *gorm.DB
	wsManager *ws.Manager
	logger    *zap.Logger
	cache     *MetricsCache
}

func NewMetricsWriter(db *gorm.DB, wsManager *ws.Manager, logger *zap.Logger) *MetricsWriter {
	return &MetricsWriter{
		db:        db,
		wsManager: wsManager,
		logger:    logger,
		cache:     nil, // 缓存需要单独设置
	}
}

// SetCache 设置缓存服务
func (w *MetricsWriter) SetCache(cache *MetricsCache) {
	w.cache = cache
}

func (w *MetricsWriter) WriteDeviceMetrics(ctx context.Context, req DeviceMetricsRequest) (WriteResult, error) {
	if w.db == nil {
		return WriteResult{}, fmt.Errorf("database not initialized")
	}
	if req.DeviceID <= 0 {
		return WriteResult{}, fmt.Errorf("invalid device_id")
	}

	req.Metrics = normalizeMetricMap(req.Metrics)

	collectedAt := resolveCollectedAt(req.CollectedAt)
	tags := normalizeTags(req.Tags)

	deviceMetrics, deviceUpdates := buildDeviceMetricRecords(req.DeviceID, req.Metrics, tags, collectedAt)
	interfaceMetrics := buildInterfaceMetricRecords(req.DeviceID, req.Interfaces, tags, collectedAt)
	interfaceSpeedUpdates := extractInterfaceSpeedUpdates(req.DeviceID, req.Interfaces, collectedAt)

	if len(deviceMetrics) == 0 && len(interfaceMetrics) == 0 && len(interfaceSpeedUpdates) == 0 {
		return WriteResult{}, ErrNoMetrics
	}

	err := w.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if len(deviceMetrics) > 0 {
			// Use raw SQL to let database sequence generate IDs for TimescaleDB hypertable
			if err := insertDeviceMetricsRaw(tx, deviceMetrics); err != nil {
				return err
			}
		}
		if len(interfaceMetrics) > 0 {
			// Use raw SQL to let database sequence generate IDs for TimescaleDB hypertable
			if err := insertInterfaceMetricsRaw(tx, interfaceMetrics); err != nil {
				return err
			}
		}
		if len(interfaceSpeedUpdates) > 0 {
			if err := applyInterfaceSpeedUpdates(tx, interfaceSpeedUpdates); err != nil {
				return err
			}
		}
		if len(deviceUpdates) > 0 {
			if err := tx.Table("devices").Where("id = ?", req.DeviceID).Updates(deviceUpdates).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		if w.logger != nil {
			w.logger.Error("write_device_metrics_failed", zap.Int("device_id", req.DeviceID), zap.Error(err))
		}
		return WriteResult{}, err
	}

	w.broadcastDeviceMetrics(req)

	return WriteResult{
		DeviceMetrics:    len(deviceMetrics),
		InterfaceMetrics: len(interfaceMetrics),
	}, nil
}

func (w *MetricsWriter) WriteSystemMetrics(ctx context.Context, req SystemMetricsRequest) (WriteResult, error) {
	if w.db == nil {
		return WriteResult{}, fmt.Errorf("database not initialized")
	}

	host := strings.TrimSpace(req.Host)
	if host == "" {
		return WriteResult{}, fmt.Errorf("host is required")
	}

	req.Metrics = normalizeMetricMap(req.Metrics)

	collectedAt := resolveCollectedAt(req.CollectedAt)
	tags := normalizeTags(req.Tags)

	records := make([]SystemMetric, 0, len(req.Metrics))
	for name, metric := range req.Metrics {
		value, ok := metric.Numeric()
		if !ok {
			continue
		}
		metricTime := collectedAt
		if metric.Timestamp != nil && !metric.Timestamp.IsZero() {
			metricTime = metric.Timestamp.Time.UTC()
		}

		unit := metric.Unit
		hostValue := host
		records = append(records, SystemMetric{
			Host:        &hostValue,
			MetricName:  name,
			MetricValue: &value,
			MetricUnit:  unit,
			Tags:        tags,
			CollectedAt: metricTime,
		})
	}

	if len(records) == 0 {
		return WriteResult{}, ErrNoMetrics
	}

	if err := w.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		return InsertSystemMetricsRaw(tx, records)
	}); err != nil {
		if w.logger != nil {
			w.logger.Error("write_system_metrics_failed", zap.String("host", host), zap.Error(err))
		}
		return WriteResult{}, err
	}

	return WriteResult{SystemMetrics: len(records)}, nil
}

// InsertSystemMetricsRaw inserts system metrics using raw SQL to work with TimescaleDB hypertables.
func InsertSystemMetricsRaw(tx *gorm.DB, metrics []SystemMetric) error {
	if len(metrics) == 0 {
		return nil
	}

	// Ensure sequence exists for environments that haven't run migration yet.
	_ = tx.Exec(`CREATE SEQUENCE IF NOT EXISTS system_metrics_id_seq;`).Error

	sql, values := buildSystemMetricsInsertSQL(metrics, time.Now().UTC())
	return tx.Exec(sql, values...).Error
}

func buildSystemMetricsInsertSQL(metrics []SystemMetric, createdAt time.Time) (string, []interface{}) {
	if len(metrics) == 0 {
		return "", nil
	}

	sql := `INSERT INTO system_metrics (id, host, metric_name, metric_value, metric_unit, tags, collected_at, created_at) VALUES `
	values := make([]interface{}, 0, len(metrics)*7)
	placeholders := make([]string, 0, len(metrics))

	for i, m := range metrics {
		base := i * 7
		placeholders = append(placeholders, fmt.Sprintf("(nextval('system_metrics_id_seq'), $%d, $%d, $%d, $%d, $%d, $%d, $%d)",
			base+1, base+2, base+3, base+4, base+5, base+6, base+7))

		values = append(values,
			m.Host,
			m.MetricName,
			m.MetricValue,
			m.MetricUnit,
			m.Tags,
			m.CollectedAt,
			createdAt,
		)
	}

	sql += strings.Join(placeholders, ", ")
	return sql, values
}

func (w *MetricsWriter) DeviceExists(ctx context.Context, deviceID int) (bool, error) {
	if w.db == nil {
		return false, fmt.Errorf("database not initialized")
	}

	var id int
	err := w.db.WithContext(ctx).Table("devices").Select("id").Where("id = ?", deviceID).Take(&id).Error
	if err == nil {
		return true, nil
	}
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return false, nil
	}
	return false, err
}

func (w *MetricsWriter) GetDeviceMetrics(ctx context.Context, deviceID int) (DeviceMetricsResponse, error) {
	if w.db == nil {
		return DeviceMetricsResponse{}, fmt.Errorf("database not initialized")
	}

	type metricRow struct {
		MetricName  string
		MetricValue *float64
		MetricUnit  *string
		CollectedAt time.Time
	}

	rows := make([]metricRow, 0)
	query := `
        SELECT DISTINCT ON (metric_name)
            metric_name,
            metric_value,
            metric_unit,
            collected_at
        FROM device_metrics
        WHERE device_id = ?
        ORDER BY metric_name, collected_at DESC`

	if err := w.db.WithContext(ctx).Raw(query, deviceID).Scan(&rows).Error; err != nil {
		return DeviceMetricsResponse{}, err
	}

	resp := DeviceMetricsResponse{
		DeviceID:  deviceID,
		Timestamp: time.Now().UTC(),
	}

	var latest time.Time
	for _, row := range rows {
		if row.CollectedAt.After(latest) {
			latest = row.CollectedAt
		}
		if row.MetricValue == nil {
			continue
		}
		assignMetricValue(&resp, row.MetricName, *row.MetricValue)
	}

	if !latest.IsZero() {
		resp.Timestamp = latest.UTC()
	}

	if len(rows) == 0 {
		w.fillFromDeviceSnapshot(ctx, deviceID, &resp)
	}

	return resp, nil
}

func (w *MetricsWriter) GetDeviceMetricsHistory(
	ctx context.Context,
	deviceID int,
	start time.Time,
	end time.Time,
	metricNames []string,
) ([]HistoryPoint, error) {
	return w.GetBulkMetricsHistory(ctx, []int{deviceID}, start, end, metricNames)
}

func (w *MetricsWriter) broadcastDeviceMetrics(req DeviceMetricsRequest) {
	if w.wsManager == nil {
		return
	}

	payload := map[string]interface{}{
		"device_id": req.DeviceID,
		"metrics":   req.Metrics,
	}
	if len(req.Interfaces) > 0 {
		payload["interfaces"] = req.Interfaces
	}
	if req.CollectedAt != nil && !req.CollectedAt.IsZero() {
		payload["collected_at"] = req.CollectedAt.Time.UTC().Format(time.RFC3339Nano)
	}

	w.wsManager.SendToRoom("device_metrics", ws.Message{
		Type: ws.MessageDeviceMetrics,
		Data: payload,
	})
}

func resolveCollectedAt(raw *FlexibleTime) time.Time {
	if raw == nil || raw.IsZero() {
		return time.Now().UTC()
	}
	return raw.Time.UTC()
}

func (w *MetricsWriter) fillFromDeviceSnapshot(ctx context.Context, deviceID int, resp *DeviceMetricsResponse) {
	type deviceSnapshot struct {
		CPUUsage    *float64   `gorm:"column:cpu_usage"`
		MemoryUsage *float64   `gorm:"column:memory_usage"`
		DiskUsage   *float64   `gorm:"column:disk_usage"`
		Temperature *float64   `gorm:"column:temperature"`
		Uptime      *int64     `gorm:"column:uptime"`
		LastSeen    *time.Time `gorm:"column:last_seen"`
		UpdatedAt   *time.Time `gorm:"column:updated_at"`
	}

	var snapshot deviceSnapshot
	if err := w.db.WithContext(ctx).Table("devices").
		Select("cpu_usage, memory_usage, disk_usage, temperature, uptime, last_seen, updated_at").
		Where("id = ?", deviceID).
		Take(&snapshot).Error; err != nil {
		return
	}

	if resp.CPUUsage == nil {
		resp.CPUUsage = snapshot.CPUUsage
	}
	if resp.MemoryUsage == nil {
		resp.MemoryUsage = snapshot.MemoryUsage
	}
	if resp.DiskUsage == nil {
		resp.DiskUsage = snapshot.DiskUsage
	}
	if resp.Temperature == nil {
		resp.Temperature = snapshot.Temperature
	}
	if resp.Uptime == nil {
		resp.Uptime = snapshot.Uptime
	}

	if snapshot.LastSeen != nil {
		resp.Timestamp = snapshot.LastSeen.UTC()
	} else if snapshot.UpdatedAt != nil {
		resp.Timestamp = snapshot.UpdatedAt.UTC()
	}
}

func normalizeTags(raw map[string]interface{}) datatypes.JSONMap {
	if len(raw) == 0 {
		return nil
	}
	return datatypes.JSONMap(raw)
}

func buildDeviceMetricRecords(deviceID int, metrics map[string]MetricValue, tags datatypes.JSONMap, collectedAt time.Time) ([]DeviceMetric, map[string]interface{}) {
	records := make([]DeviceMetric, 0, len(metrics))
	updates := make(map[string]interface{})

	for name, metric := range metrics {
		value, ok := metric.Numeric()
		if !ok {
			continue
		}

		metricTime := collectedAt
		if metric.Timestamp != nil && !metric.Timestamp.IsZero() {
			metricTime = metric.Timestamp.Time.UTC()
		}

		unit := metric.Unit
		records = append(records, DeviceMetric{
			DeviceID:    deviceID,
			MetricName:  name,
			MetricValue: &value,
			MetricUnit:  unit,
			Tags:        tags,
			CollectedAt: metricTime,
		})

		switch name {
		case "cpu_usage":
			updates["cpu_usage"] = value
		case "memory_usage":
			updates["memory_usage"] = value
		case "disk_usage":
			updates["disk_usage"] = value
		case "temperature":
			updates["temperature"] = value
		case "response_time":
			updates["response_time"] = value
		case "uptime", "system_uptime":
			updates["uptime"] = int64(value)
		}
	}

	return records, updates
}

func buildInterfaceMetricRecords(deviceID int, interfaces []map[string]interface{}, tags datatypes.JSONMap, collectedAt time.Time) []InterfaceMetric {
	if len(interfaces) == 0 {
		return nil
	}

	records := make([]InterfaceMetric, 0)
	for _, item := range interfaces {
		if item == nil {
			continue
		}
		nameValue, _ := item["name"].(string)
		interfaceName := strings.TrimSpace(nameValue)
		if interfaceName == "" {
			continue
		}
		for key, rawValue := range item {
			if isInterfaceMetaKey(key) {
				continue
			}
			if isInterfaceSpeedKey(normalizeInterfaceKey(key)) {
				continue
			}
			value, ok := coerceFloat(rawValue)
			if !ok {
				continue
			}

			records = append(records, InterfaceMetric{
				DeviceID:      deviceID,
				InterfaceName: interfaceName,
				MetricName:    key,
				MetricValue:   &value,
				Tags:          tags,
				CollectedAt:   collectedAt,
			})
		}
	}

	return records
}

type InterfaceSpeedUpdate struct {
	DeviceID      int
	InterfaceName string
	SpeedMbps     int64
	UpdatedAt     time.Time
}

func extractInterfaceSpeedUpdates(deviceID int, interfaces []map[string]interface{}, collectedAt time.Time) []InterfaceSpeedUpdate {
	if len(interfaces) == 0 {
		return nil
	}

	type candidate struct {
		speed    int64
		priority int
	}

	candidates := make(map[string]candidate)
	for _, item := range interfaces {
		if item == nil {
			continue
		}
		nameValue, _ := item["name"].(string)
		interfaceName := strings.TrimSpace(nameValue)
		if interfaceName == "" {
			continue
		}
		speed, priority, ok := resolveInterfaceSpeed(item)
		if !ok || speed <= 0 {
			continue
		}
		existing, exists := candidates[interfaceName]
		if !exists || priority > existing.priority || (priority == existing.priority && speed > existing.speed) {
			candidates[interfaceName] = candidate{speed: speed, priority: priority}
		}
	}

	if len(candidates) == 0 {
		return nil
	}

	updates := make([]InterfaceSpeedUpdate, 0, len(candidates))
	for name, item := range candidates {
		updates = append(updates, InterfaceSpeedUpdate{
			DeviceID:      deviceID,
			InterfaceName: name,
			SpeedMbps:     item.speed,
			UpdatedAt:     collectedAt,
		})
	}

	return updates
}

func resolveInterfaceSpeed(item map[string]interface{}) (int64, int, bool) {
	var (
		bestSpeed    int64
		bestPriority int
		found        bool
	)

	for key, rawValue := range item {
		if isInterfaceMetaKey(key) {
			continue
		}
		normalized := normalizeInterfaceKey(key)
		priority, multiplier := interfaceSpeedPriority(normalized)
		if priority == 0 {
			continue
		}
		value, ok := coerceFloat(rawValue)
		if !ok {
			continue
		}
		speed := int64(value * multiplier)
		if speed <= 0 {
			continue
		}
		if !found || priority > bestPriority || (priority == bestPriority && speed > bestSpeed) {
			bestSpeed = speed
			bestPriority = priority
			found = true
		}
	}

	return bestSpeed, bestPriority, found
}

func interfaceSpeedPriority(normalized string) (int, float64) {
	switch normalized {
	case "ifhighspeed", "if_high_speed", "if_highspeed":
		return 3, 1
	case "ifspeed", "if_speed":
		return 2, 1.0 / 1_000_000
	case "speed_mbps", "link_speed_mbps":
		return 1, 1
	case "speed_bps", "link_speed_bps":
		return 1, 1.0 / 1_000_000
	case "speed", "linkspeed", "link_speed":
		return 1, 1
	default:
		return 0, 0
	}
}

func isInterfaceMetaKey(key string) bool {
	normalized := normalizeInterfaceKey(key)
	switch normalized {
	case "name", "timestamp", "collected_at":
		return true
	default:
		return false
	}
}

func isInterfaceSpeedKey(normalized string) bool {
	priority, _ := interfaceSpeedPriority(normalized)
	return priority > 0
}

func normalizeInterfaceKey(raw string) string {
	normalized := strings.ToLower(strings.TrimSpace(raw))
	normalized = strings.ReplaceAll(normalized, "-", "_")
	normalized = strings.ReplaceAll(normalized, " ", "_")
	return normalized
}

func applyInterfaceSpeedUpdates(tx *gorm.DB, updates []InterfaceSpeedUpdate) error {
	for _, update := range updates {
		if err := tx.Table("device_interfaces").
			Where("device_id = ? AND name = ?", update.DeviceID, update.InterfaceName).
			Updates(map[string]interface{}{
				"speed":        update.SpeedMbps,
				"last_updated": update.UpdatedAt,
				"updated_at":   update.UpdatedAt,
			}).Error; err != nil {
			return err
		}
	}
	return nil
}

func assignMetricValue(resp *DeviceMetricsResponse, name string, value float64) {
	switch name {
	case "cpu_usage":
		resp.CPUUsage = &value
	case "memory_usage":
		resp.MemoryUsage = &value
	case "disk_usage":
		resp.DiskUsage = &value
	case "temperature":
		resp.Temperature = &value
	case "uptime", "system_uptime":
		parsed := int64(value)
		resp.Uptime = &parsed
	case "bandwidth_in", "network_bytes_in", "throughput_in":
		converted := networkMetricToMbps(value, name)
		resp.BandwidthIn = &converted
	case "bandwidth_out", "network_bytes_out", "throughput_out":
		converted := networkMetricToMbps(value, name)
		resp.BandwidthOut = &converted
	case "packet_loss":
		resp.PacketLoss = &value
	default:
		if resp.CustomMetrics == nil {
			resp.CustomMetrics = make(map[string]interface{})
		}
		resp.CustomMetrics[name] = value
	}
}

func coerceFloat(raw interface{}) (float64, bool) {
	switch value := raw.(type) {
	case float64:
		return value, true
	case float32:
		return float64(value), true
	case int:
		return float64(value), true
	case int64:
		return float64(value), true
	case int32:
		return float64(value), true
	case uint:
		return float64(value), true
	case uint64:
		return float64(value), true
	case json.Number:
		parsed, err := value.Float64()
		return parsed, err == nil
	case string:
		parsed, err := strconv.ParseFloat(strings.TrimSpace(value), 64)
		return parsed, err == nil
	default:
		return 0, false
	}
}

// insertDeviceMetricsRaw inserts device metrics using raw SQL to work with TimescaleDB hypertables
func insertDeviceMetricsRaw(tx *gorm.DB, metrics []DeviceMetric) error {
	if len(metrics) == 0 {
		return nil
	}

	// Ensure sequence exists
	_ = tx.Exec(`CREATE SEQUENCE IF NOT EXISTS device_metrics_id_seq;`).Error

	// Build batch insert SQL with ID column using nextval for sequence
	sql := `INSERT INTO device_metrics (id, device_id, metric_name, metric_value, metric_unit, interface_name, tags, collected_at, created_at) VALUES `
	values := make([]interface{}, 0, len(metrics)*8)
	placeholders := make([]string, 0, len(metrics))

	for i, m := range metrics {
		base := i * 8
		placeholders = append(placeholders, fmt.Sprintf("(nextval('device_metrics_id_seq'), $%d, $%d, $%d, $%d, $%d, $%d, $%d, $%d)",
			base+1, base+2, base+3, base+4, base+5, base+6, base+7, base+8))

		values = append(values,
			m.DeviceID,
			m.MetricName,
			m.MetricValue,
			m.MetricUnit,
			m.InterfaceName,
			m.Tags,
			m.CollectedAt,
			time.Now().UTC(),
		)
	}

	sql += strings.Join(placeholders, ", ")
	return tx.Exec(sql, values...).Error
}

// insertInterfaceMetricsRaw inserts interface metrics using raw SQL to work with TimescaleDB hypertables
func insertInterfaceMetricsRaw(tx *gorm.DB, metrics []InterfaceMetric) error {
	if len(metrics) == 0 {
		return nil
	}

	// Ensure sequence exists
	_ = tx.Exec(`CREATE SEQUENCE IF NOT EXISTS interface_metrics_id_seq;`).Error

	// Build batch insert SQL with ID column using nextval for sequence
	sql := `INSERT INTO interface_metrics (id, device_id, interface_name, metric_name, metric_value, metric_unit, tags, collected_at, created_at) VALUES `
	values := make([]interface{}, 0, len(metrics)*8)
	placeholders := make([]string, 0, len(metrics))

	for i, m := range metrics {
		base := i * 8
		placeholders = append(placeholders, fmt.Sprintf("(nextval('interface_metrics_id_seq'), $%d, $%d, $%d, $%d, $%d, $%d, $%d, $%d)",
			base+1, base+2, base+3, base+4, base+5, base+6, base+7, base+8))

		values = append(values,
			m.DeviceID,
			m.InterfaceName,
			m.MetricName,
			m.MetricValue,
			m.MetricUnit,
			m.Tags,
			m.CollectedAt,
			time.Now().UTC(),
		)
	}

	sql += strings.Join(placeholders, ", ")
	return tx.Exec(sql, values...).Error
}
