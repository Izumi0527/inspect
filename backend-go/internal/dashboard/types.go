package dashboard

import "time"

type StatCard struct {
	Title     string `json:"title"`
	Value     string `json:"value"`
	Change    string `json:"change"`
	IconName  string `json:"iconName"`
	IconColor string `json:"iconColor"`
	Color     string `json:"color"`
}

type RecentAlert struct {
	ID       int     `json:"id"`
	Device   string  `json:"device"`
	Message  string  `json:"message"`
	Severity string  `json:"severity"`
	Time     string  `json:"time"`
	Category *string `json:"category,omitempty"`
}

type NetworkOverviewItem struct {
	Name    string `json:"name"`
	Devices int    `json:"devices"`
	Status  string `json:"status"`
}

type OverviewResponse struct {
	Stats           []StatCard           `json:"stats"`
	RecentAlerts    []RecentAlert        `json:"recent_alerts"`
	NetworkOverview []NetworkOverviewItem `json:"network_overview"`
	LastUpdated     time.Time            `json:"last_updated"`
}

type DeviceStatusSummary struct {
	Online  int `json:"online"`
	Offline int `json:"offline"`
	Warning int `json:"warning"`
	Unknown int `json:"unknown"`
	Total   int `json:"total"`
}

type AlertSummary struct {
	Critical       int `json:"critical"`
	Warning        int `json:"warning"`
	Info           int `json:"info"`
	Total          int `json:"total"`
	Unacknowledged int `json:"unacknowledged"`
}

type TopDevicesByAlerts struct {
	DeviceID      int    `json:"device_id"`
	DeviceName    string `json:"device_name"`
	IPAddress     string `json:"ip_address"`
	AlertCount    int    `json:"alert_count"`
	CriticalCount int    `json:"critical_count"`
}

type RecentActivity struct {
	ID          string     `json:"id"`
	Type        string     `json:"type"`
	Title       string     `json:"title"`
	Description string     `json:"description"`
	Timestamp   time.Time  `json:"timestamp"`
	RelatedID   *int       `json:"related_id,omitempty"`
	Severity    *string    `json:"severity,omitempty"`
}

type SystemStatus struct {
	MonitoringService bool      `json:"monitoring_service"`
	AlertEngine       bool      `json:"alert_engine"`
	SchedulerService  bool      `json:"scheduler_service"`
	MetricsStoreConnected bool   `json:"influxdb_connected"`
	RedisConnected    bool      `json:"redis_connected"`
	DatabaseConnected bool      `json:"database_connected"`
	UptimeSeconds     int64     `json:"uptime_seconds"`
	LastCheck         time.Time `json:"last_check"`
}
