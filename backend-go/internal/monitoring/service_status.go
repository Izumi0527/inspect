package monitoring

import (
	"context"
	"errors"
	"fmt"
	"time"

	"gorm.io/gorm"
)

// MetricsCollectionTaskID 是采集任务在 scheduled_tasks 中的 ID，必须与 scheduler.MetricsCollectionTaskID 一致
// （scheduler 依赖本包，不能反向引用，由 tests/backend-go/internal/scheduler 下的跨包用例钉住）。
const MetricsCollectionTaskID = "metrics_collection"

type MonitoringServiceStatsResponse struct {
	IsRunning             bool    `json:"is_running"`
	MonitorInterval       int     `json:"monitor_interval"`
	TotalDevices          int     `json:"total_devices"`
	ActiveDevices         int     `json:"active_devices"`
	MonitoringTasks       int     `json:"monitoring_tasks"`
	MetricsStoreConnected bool    `json:"influxdb_connected"`
	LastCheck             *string `json:"last_check,omitempty"`
	Error                 *string `json:"error,omitempty"`
}

// GetMonitoringServiceStats 汇报监控服务状态。Go 版没有独立的监控后台循环，监控就是采集任务本身：
// is_running = 采集任务是否启用，monitor_interval = 真实采集节奏（与页面采样间隔相等，由跨包用例保证）。
func (w *MetricsWriter) GetMonitoringServiceStats(ctx context.Context) (MonitoringServiceStatsResponse, error) {
	stats := MonitoringServiceStatsResponse{
		MonitorInterval: int(DashboardSampleInterval / time.Second),
	}
	if w == nil || w.db == nil {
		return stats, fmt.Errorf("database not initialized")
	}

	lastCheck := time.Now().UTC().Format(time.RFC3339Nano)
	stats.LastCheck = &lastCheck

	isRunning, err := w.loadCollectionTaskEnabled(ctx)
	if err != nil {
		return stats, err
	}
	stats.IsRunning = isRunning

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

// loadCollectionTaskEnabled 读取采集任务的启用状态；任务不存在（尚未 seed）时如实报告未运行。
func (w *MetricsWriter) loadCollectionTaskEnabled(ctx context.Context) (bool, error) {
	var row struct {
		Enabled bool `gorm:"column:enabled"`
	}
	err := w.db.WithContext(ctx).
		Table("scheduled_tasks").
		Select("enabled").
		Where("id = ?", MetricsCollectionTaskID).
		Take(&row).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return row.Enabled, nil
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

	var marker int
	if err := w.db.WithContext(ctx).Raw("SELECT 1").Scan(&marker).Error; err != nil {
		return false, err
	}
	return true, nil
}
