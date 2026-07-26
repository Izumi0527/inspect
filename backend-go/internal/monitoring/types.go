package monitoring

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"gorm.io/datatypes"
)

type FlexibleTime struct {
	time.Time
}

func (t *FlexibleTime) UnmarshalJSON(b []byte) error {
	if len(b) == 0 || string(b) == "null" {
		return nil
	}

	var raw string
	if err := json.Unmarshal(b, &raw); err == nil {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			return nil
		}
		parsed, err := parseTimeString(raw)
		if err != nil {
			return err
		}
		t.Time = parsed
		return nil
	}

	var numeric float64
	if err := json.Unmarshal(b, &numeric); err == nil {
		if numeric > 1e12 {
			t.Time = time.UnixMilli(int64(numeric))
		} else {
			t.Time = time.Unix(int64(numeric), 0)
		}
		return nil
	}

	return fmt.Errorf("invalid time format")
}

func parseTimeString(raw string) (time.Time, error) {
	layouts := []string{time.RFC3339Nano, time.RFC3339}
	for _, layout := range layouts {
		if parsed, err := time.Parse(layout, raw); err == nil {
			return parsed, nil
		}
	}
	return time.Time{}, fmt.Errorf("invalid time value: %s", raw)
}

type MetricValue struct {
	Value     *float64     `json:"value,omitempty"`
	Unit      *string      `json:"unit,omitempty"`
	Timestamp *FlexibleTime `json:"timestamp,omitempty"`
	Text      *string      `json:"text,omitempty"`
}

func (m *MetricValue) UnmarshalJSON(b []byte) error {
	if len(b) == 0 || string(b) == "null" {
		return nil
	}

	var numeric float64
	if err := json.Unmarshal(b, &numeric); err == nil {
		m.Value = &numeric
		return nil
	}

	var raw string
	if err := json.Unmarshal(b, &raw); err == nil {
		if parsed, ok := parseNumericString(raw); ok {
			m.Value = &parsed
		} else {
			m.Text = &raw
		}
		return nil
	}

	var payload struct {
		Value     json.RawMessage `json:"value"`
		Unit      *string         `json:"unit"`
		Timestamp json.RawMessage `json:"timestamp"`
	}
	if err := json.Unmarshal(b, &payload); err != nil {
		return err
	}

	if len(payload.Value) > 0 {
		m.applyRawValue(payload.Value)
	}
	if payload.Unit != nil {
		m.Unit = payload.Unit
	}
	if len(payload.Timestamp) > 0 && string(payload.Timestamp) != "null" {
		var ts FlexibleTime
		if err := ts.UnmarshalJSON(payload.Timestamp); err != nil {
			return err
		}
		if !ts.IsZero() {
			m.Timestamp = &ts
		}
	}

	return nil
}

func (m *MetricValue) applyRawValue(raw json.RawMessage) {
	var numeric float64
	if err := json.Unmarshal(raw, &numeric); err == nil {
		m.Value = &numeric
		return
	}

	var text string
	if err := json.Unmarshal(raw, &text); err == nil {
		if parsed, ok := parseNumericString(text); ok {
			m.Value = &parsed
		} else {
			m.Text = &text
		}
	}
}

func parseNumericString(raw string) (float64, bool) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return 0, false
	}
	parsed, err := strconv.ParseFloat(trimmed, 64)
	if err != nil {
		return 0, false
	}
	return parsed, true
}

func (m MetricValue) Numeric() (float64, bool) {
	if m.Value == nil {
		return 0, false
	}
	return *m.Value, true
}

type DeviceMetricsRequest struct {
	DeviceID    int                      `json:"device_id"`
	CollectedAt *FlexibleTime            `json:"collected_at,omitempty"`
	Metrics     map[string]MetricValue   `json:"metrics"`
	Interfaces  []map[string]interface{} `json:"interfaces,omitempty"`
	Tags        map[string]interface{}   `json:"tags,omitempty"`
}

type SystemMetricsRequest struct {
	Host        string                   `json:"host"`
	CollectedAt *FlexibleTime            `json:"collected_at,omitempty"`
	Metrics     map[string]MetricValue   `json:"metrics"`
	Tags        map[string]interface{}   `json:"tags,omitempty"`
}

type DeviceMetricsResponse struct {
	DeviceID      int                    `json:"device_id"`
	Timestamp     time.Time              `json:"timestamp"`
	CPUUsage      *float64               `json:"cpu_usage"`
	MemoryUsage   *float64               `json:"memory_usage"`
	DiskUsage     *float64               `json:"disk_usage"`
	Temperature   *float64               `json:"temperature"`
	Uptime        *int64                 `json:"uptime"`
	BandwidthIn   *float64               `json:"bandwidth_in"`
	BandwidthOut  *float64               `json:"bandwidth_out"`
	PacketLoss    *float64               `json:"packet_loss"`
	CustomMetrics map[string]interface{} `json:"custom_metrics"`
}

type MetricsHistoryResponse struct {
	DeviceID    int           `json:"device_id"`
	StartTime   time.Time     `json:"start_time"`
	EndTime     time.Time     `json:"end_time"`
	DataPoints  []HistoryPoint `json:"data_points"`
	MetricNames []string      `json:"metric_names"`
}

type HistoryPoint struct {
	Timestamp     string            `json:"timestamp"`
	MetricType    string            `json:"metric_type"`
	MetricName    string            `json:"metric_name"`
	Value         *float64          `json:"value"`
	DeviceID      int               `json:"device_id"`
	MetricUnit    *string           `json:"metric_unit,omitempty"`
	Unit          *string           `json:"unit,omitempty"`
	InterfaceName *string           `json:"interface_name,omitempty"`
	Tags          datatypes.JSONMap `json:"tags,omitempty"`
}

type MonitoringStats struct {
	TotalDevices int     `json:"total_devices"`
	Availability float64 `json:"availability"`
	ActiveAlerts int     `json:"active_alerts"`
	AvgCPU       float64 `json:"avg_cpu"`
	AvgMemory    float64 `json:"avg_memory"`
	AvgNetwork   float64 `json:"avg_network"`
}

type DeviceStatusSummary struct {
	DeviceID     int        `json:"device_id"`
	Name         string     `json:"name"`
	DeviceName   string     `json:"device_name"`
	IPAddress    string     `json:"ip_address"`
	Status       string     `json:"status"`
	DeviceStatus string     `json:"device_status,omitempty"`
	CPUUsage     *float64   `json:"cpu_usage,omitempty"`
	MemoryUsage  *float64   `json:"memory_usage,omitempty"`
	Uptime       *string    `json:"uptime,omitempty"`
	LastSeen     *time.Time `json:"last_seen,omitempty"`
	LastCheck    *time.Time `json:"last_check,omitempty"`
	AlertCount   *int       `json:"alert_count,omitempty"`
	ResponseTime *float64   `json:"response_time,omitempty"`
	ErrorMessage *string    `json:"error_message,omitempty"`
}

type DeviceStatusDistribution struct {
	Healthy  int `json:"healthy"`
	Warning  int `json:"warning"`
	Critical int `json:"critical"`
	Offline  int `json:"offline"`
}

type AvailabilitySnapshot struct {
	Current    float64 `json:"current"`
	Target     float64 `json:"target"`
	Trend      string  `json:"trend"`
	LastUpdate string  `json:"last_update,omitempty"`
}

type SystemPerformancePoint struct {
	Timestamp      string  `json:"timestamp"`
	CPUUsage       float64 `json:"cpu_usage"`
	MemoryUsage    float64 `json:"memory_usage"`
	NetworkTraffic float64 `json:"network_traffic"`
}

type TemperatureHistoryPoint struct {
	Timestamp string             `json:"timestamp"`
	Devices   map[string]float64 `json:"devices"`
}

type NetworkTrafficPoint struct {
	Timestamp string  `json:"timestamp"`
	Inbound   float64 `json:"inbound"`
	Outbound  float64 `json:"outbound"`
}

type MonitoringOverview struct {
	LastUpdated     string  `json:"last_updated"`
	TotalDevices    int     `json:"total_devices"`
	OnlineDevices   int     `json:"online_devices"`
	TotalAlerts     int     `json:"total_alerts"`
	AvgResponseTime float64 `json:"avg_response_time"`
}

type MonitoringDevice struct {
	ID              int        `json:"id"`
	Name            string     `json:"name"`
	IPAddress       string     `json:"ip_address"`
	Status          string     `json:"status"`
	IsMonitored     bool       `json:"is_monitored"`
	MonitorInterval int        `json:"monitor_interval"`
	LastSeen        *time.Time `json:"last_seen,omitempty"`
}

type SystemStatusSnapshot struct {
	Timestamp      time.Time `json:"timestamp"`
	CPUUsage       *float64  `json:"cpu_usage,omitempty"`
	MemoryUsage    *float64  `json:"memory_usage,omitempty"`
	DiskUsage      *float64  `json:"disk_usage,omitempty"`
	NetworkTraffic *float64  `json:"network_traffic,omitempty"`
}

type BulkMetricsRequest struct {
	DeviceIDs []int         `json:"device_ids"`
	StartTime *FlexibleTime `json:"start_time"`
	EndTime   *FlexibleTime `json:"end_time"`
	Metrics   []string      `json:"metrics"`
}

type TimeRangeRequest struct {
	StartTime *FlexibleTime `json:"start_time"`
	EndTime   *FlexibleTime `json:"end_time"`
	Metrics   []string      `json:"metrics"`
	// DeviceIDs 非空时仅查询所选设备（监控中心设备筛选）
	DeviceIDs []int `json:"device_ids"`
}

type MonitoringToggleRequest struct {
	DeviceID int  `json:"device_id"`
	Interval int  `json:"interval"`
	Enabled  bool `json:"enabled"`
}
