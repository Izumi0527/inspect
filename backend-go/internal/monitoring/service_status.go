package monitoring

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"math"
	"strconv"
	"strings"
	"time"

	"gorm.io/gorm"
)

const (
	monitoringServiceEnabledKey  = "monitoring_service_enabled"
	monitoringServiceIntervalKey = "monitoring_service_interval"
	defaultMonitoringInterval    = 60
	defaultMonitoringEnabled     = true
)

type MonitoringServiceStatsResponse struct {
	IsRunning         bool    `json:"is_running"`
	MonitorInterval   int     `json:"monitor_interval"`
	TotalDevices      int     `json:"total_devices"`
	ActiveDevices     int     `json:"active_devices"`
	MonitoringTasks   int     `json:"monitoring_tasks"`
	MetricsStoreConnected bool `json:"influxdb_connected"`
	LastCheck         *string `json:"last_check,omitempty"`
	Error             *string `json:"error,omitempty"`
}

func (w *MetricsWriter) GetMonitoringServiceStats(ctx context.Context) (MonitoringServiceStatsResponse, error) {
	stats := MonitoringServiceStatsResponse{
		IsRunning:         defaultMonitoringEnabled,
		MonitorInterval:   defaultMonitoringInterval,
		TotalDevices:      0,
		ActiveDevices:     0,
		MonitoringTasks:   0,
		MetricsStoreConnected: false,
	}
	if w == nil || w.db == nil {
		return stats, fmt.Errorf("database not initialized")
	}

	lastCheck := time.Now().UTC().Format(time.RFC3339Nano)
	stats.LastCheck = &lastCheck

	isRunning, err := w.loadMonitoringServiceEnabled(ctx)
	if err != nil {
		return stats, err
	}
	stats.IsRunning = isRunning

	interval, err := w.loadMonitoringServiceInterval(ctx)
	if err != nil {
		return stats, err
	}
	stats.MonitorInterval = interval

	total, active, tasks, err := w.queryMonitoringServiceCounts(ctx)
	if err != nil {
		return stats, err
	}
	stats.TotalDevices = total
	stats.ActiveDevices = active
	stats.MonitoringTasks = tasks

	connected, err := w.checkMetricsStorageConnection(ctx)
	if err != nil {
		return stats, err
	}
	// 兼容字段：表示时序指标存储连通性
	stats.MetricsStoreConnected = connected

	return stats, nil
}

func (w *MetricsWriter) SetMonitoringServiceRunning(ctx context.Context, enabled bool) error {
	if w == nil || w.db == nil {
		return fmt.Errorf("database not initialized")
	}

	value := "false"
	if enabled {
		value = "true"
	}

	return w.upsertSystemSetting(
		ctx,
		monitoringServiceEnabledKey,
		value,
		"boolean",
		"监控服务开关",
	)
}

func (w *MetricsWriter) loadMonitoringServiceEnabled(ctx context.Context) (bool, error) {
	value, err := w.getSystemSettingValue(ctx, monitoringServiceEnabledKey)
	if err != nil {
		return defaultMonitoringEnabled, err
	}
	if value == nil {
		return defaultMonitoringEnabled, nil
	}
	return parseBoolSetting(*value, defaultMonitoringEnabled), nil
}

func (w *MetricsWriter) loadMonitoringServiceInterval(ctx context.Context) (int, error) {
	value, err := w.getSystemSettingValue(ctx, monitoringServiceIntervalKey)
	if err != nil {
		return defaultMonitoringInterval, err
	}
	if value != nil {
		return parseIntSetting(*value, defaultMonitoringInterval), nil
	}

	avgInterval, err := w.avgDeviceMonitorInterval(ctx)
	if err != nil {
		return defaultMonitoringInterval, err
	}
	if avgInterval > 0 {
		return int(math.Round(avgInterval)), nil
	}

	return defaultMonitoringInterval, nil
}

func (w *MetricsWriter) avgDeviceMonitorInterval(ctx context.Context) (float64, error) {
	var avg sql.NullFloat64
	if err := w.db.WithContext(ctx).
		Table("devices").
		Select("AVG(monitor_interval) AS avg_value").
		Where("is_active = ?", true).
		Scan(&avg).Error; err != nil {
		return 0, err
	}
	if avg.Valid {
		return avg.Float64, nil
	}
	return 0, nil
}

func (w *MetricsWriter) queryMonitoringServiceCounts(ctx context.Context) (int, int, int, error) {
	var total int64
	if err := w.db.WithContext(ctx).
		Table("devices").
		Count(&total).Error; err != nil {
		return 0, 0, 0, err
	}

	var active int64
	if err := w.db.WithContext(ctx).
		Table("devices").
		Where("is_active = ?", true).
		Count(&active).Error; err != nil {
		return 0, 0, 0, err
	}

	var tasks int64
	if err := w.db.WithContext(ctx).
		Table("devices").
		Where("is_active = ? AND is_monitored = ?", true, true).
		Count(&tasks).Error; err != nil {
		return 0, 0, 0, err
	}

	return int(total), int(active), int(tasks), nil
}

func (w *MetricsWriter) checkMetricsStorageConnection(ctx context.Context) (bool, error) {
	if w.db == nil {
		return false, fmt.Errorf("database not initialized")
	}

	if err := w.db.WithContext(ctx).Raw("SELECT 1").Error; err != nil {
		return false, err
	}
	return true, nil
}

func (w *MetricsWriter) getSystemSettingValue(ctx context.Context, key string) (*string, error) {
	if w.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	type row struct {
		Value *string `gorm:"column:value"`
	}

	var item row
	err := w.db.WithContext(ctx).
		Table("system_settings").
		Select("value").
		Where("key = ?", key).
		Take(&item).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return item.Value, nil
}

func (w *MetricsWriter) upsertSystemSetting(
	ctx context.Context,
	key string,
	value string,
	dataType string,
	description string,
) error {
	query := `
        INSERT INTO system_settings (key, value, category, data_type, description, updated_at)
        VALUES (?, ?, 'system', ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value,
            data_type = EXCLUDED.data_type,
            description = EXCLUDED.description,
            updated_at = CURRENT_TIMESTAMP`

	return w.db.WithContext(ctx).Exec(query, key, value, dataType, description).Error
}

func parseBoolSetting(raw string, fallback bool) bool {
	value := strings.TrimSpace(strings.ToLower(raw))
	switch value {
	case "true", "1", "yes", "y", "on":
		return true
	case "false", "0", "no", "n", "off":
		return false
	default:
		return fallback
	}
}

func parseIntSetting(raw string, fallback int) int {
	value := strings.TrimSpace(raw)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}
