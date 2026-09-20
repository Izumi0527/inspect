package dashboard

import (
	"strings"
	"time"
)

type StatCard struct {
	Title     string  `json:"title"`
	Value     string  `json:"value"`
	Change    string  `json:"change"`
	IconName  string  `json:"iconName"`
	IconColor string  `json:"iconColor"`
	Color     string  `json:"color"`
	Unit      *string `json:"unit,omitempty"` // 需要格式化的值的单位（例如，带宽使用 "bps"）
}

type RecentAlert struct {
	ID       int     `json:"id"`
	Device   string  `json:"device"`
	Message  string  `json:"message"`
	Severity string  `json:"severity"`
	Status   string  `json:"status"` // active | acknowledged | resolved（alerts.NormalizeStatus 归一后）
	Time     string  `json:"time"`
	Category *string `json:"category,omitempty"`
}

type NetworkOverviewItem struct {
	Name    string `json:"name"`
	Devices int    `json:"devices"`
	Status  string `json:"status"`
}

// TopologyNode 是拓扑图上的一台台账设备。
// DeviceType 是用户填写的档案类型，DetectedType 是 SNMP 识别结果（可能为空）；
// 两者并列下发，由前端决定展示优先级并在不一致时同时标注。
type TopologyNode struct {
	ID              int    `json:"id"`
	Name            string `json:"name"`
	IP              string `json:"ip"`
	DeviceType      string `json:"device_type"`
	DetectedType    string `json:"detected_type,omitempty"`
	Vendor          string `json:"vendor,omitempty"`
	Model           string `json:"model,omitempty"`
	FirmwareVersion string `json:"firmware_version,omitempty"`
	Status          string `json:"status"`
	// UnmanagedNeighbors 是该设备 LLDP 看到但台账里没有的邻居数（终端、未纳管设备）
	UnmanagedNeighbors int `json:"unmanaged_neighbors"`
	// LLDPStatus 是采集端对该设备 LLDP 可用性的判定：ok / mib_unreachable（SNMP 视图未放行 1.0.8802）/
	// disabled（设备未全局启用）；空表示尚未采集出结论。前端据此把「没有链路」解释成可操作的原因。
	LLDPStatus string `json:"lldp_status,omitempty"`
}

// TopologyLink 是两台台账设备之间的一条 LLDP 链路。
// Bidirectional=false 表示只有 Source 一侧看见了对端（对端未开 LLDP 或未采集）。
type TopologyLink struct {
	ID            string `json:"id"`
	Source        int    `json:"source"`
	Target        int    `json:"target"`
	SourcePort    string `json:"source_port,omitempty"`
	TargetPort    string `json:"target_port,omitempty"`
	Bidirectional bool   `json:"bidirectional"`
}

type NetworkTopology struct {
	Nodes []TopologyNode `json:"nodes"`
	Links []TopologyLink `json:"links"`
	// Layout 是用户保存的画布布局；没保存过为 nil，前端自动分层布局
	Layout      *TopologyLayout `json:"layout,omitempty"`
	GeneratedAt time.Time       `json:"generated_at"`
}

type dashboardSectionStatus struct {
	Ok                  bool    `json:"ok"`
	Message             *string `json:"message,omitempty"`
	LimitedByPermission bool    `json:"limitedByPermission,omitempty"`
	RequiredPermission  string  `json:"requiredPermission,omitempty"`
}

type OverviewPermissions struct {
	Devices     bool `json:"devices"`
	Alerts      bool `json:"alerts"`
	Monitoring  bool `json:"monitoring"`
	Inspections bool `json:"inspections"`
}

type OverviewResponse struct {
	Stats        []StatCard    `json:"stats"`
	ActiveAlerts []RecentAlert `json:"active_alerts"`
	// ActiveAlertsTotal 是活跃告警总数；ActiveAlerts 只是按预览上限截断的前若干条
	ActiveAlertsTotal int                               `json:"active_alerts_total"`
	NetworkOverview   []NetworkOverviewItem             `json:"network_overview"`
	NetworkTopology   *NetworkTopology                  `json:"network_topology,omitempty"`
	Sections          map[string]dashboardSectionStatus `json:"sections"`
	Permissions       OverviewPermissions               `json:"permissions"`
	LastUpdated       time.Time                         `json:"last_updated"`
}

type OverviewAccess struct {
	CanReadDevices     bool
	CanReadAlerts      bool
	CanReadMonitoring  bool
	CanReadInspections bool
}

type overviewAccess = OverviewAccess

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
	ID          string    `json:"id"`
	Type        string    `json:"type"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	Timestamp   time.Time `json:"timestamp"`
	RelatedID   *int      `json:"related_id,omitempty"`
	Severity    *string   `json:"severity,omitempty"`
}

type SystemStatus struct {
	MonitoringService     bool      `json:"monitoring_service"`
	AlertEngine           bool      `json:"alert_engine"`
	SchedulerService      bool      `json:"scheduler_service"`
	MetricsStoreConnected bool      `json:"influxdb_connected"`
	RedisConnected        bool      `json:"redis_connected"`
	DatabaseConnected     bool      `json:"database_connected"`
	UptimeSeconds         int64     `json:"uptime_seconds"`
	LastCheck             time.Time `json:"last_check"`
}

// BandwidthStats 表示带宽统计信息及其单位
type BandwidthStats struct {
	InboundRate  float64 `json:"inbound_rate"`  // 入站速率，单位：bps（比特每秒）
	OutboundRate float64 `json:"outbound_rate"` // 出站速率，单位：bps（比特每秒）
	Unit         string  `json:"unit"`          // 单位标识："bps"
}

// Notification 用于仪表板通知中心的数据结构（告警 + 系统消息聚合）
type Notification struct {
	ID        string    `json:"id"`
	Type      string    `json:"type"` // alert | system
	Title     string    `json:"title"`
	Content   string    `json:"content"`
	Timestamp time.Time `json:"timestamp"`
	Read      bool      `json:"read"`               // 由前端本地已读集合覆盖，此处默认 false
	Severity  *string   `json:"severity,omitempty"` // critical | warning | info | success
	Status    *string   `json:"status,omitempty"`   // 仅告警：active | acknowledged | resolved；与 severity 是独立维度
	Link      *string   `json:"link,omitempty"`
	Device    *string   `json:"device,omitempty"`
}

type NotificationsResponse struct {
	Notifications []Notification `json:"notifications"`
	UnreadCount   int            `json:"unread_count"`
	LastUpdated   time.Time      `json:"last_updated"`
}

type NotificationAccess struct {
	CanReadAlerts      bool
	CanReadInspections bool
	CanReadReports     bool
	CanReadDevices     bool
}

// 通知中心标签页对应的类型作用域；空串表示不限类型。
const (
	NotificationTypeAlert  = "alert"
	NotificationTypeSystem = "system"
)

// ParseNotificationTypeFilter 校验前端传入的 type：空串表示全部，其余只接受 alert / system。
func ParseNotificationTypeFilter(raw string) (string, bool) {
	value := strings.ToLower(strings.TrimSpace(raw))
	switch value {
	case "", NotificationTypeAlert, NotificationTypeSystem:
		return value, true
	default:
		return "", false
	}
}

// ScopedToType 把权限视图收窄到某个标签页：告警页只保留告警源，消息页去掉告警源。
// 候选收集、全部已读、清空都以 NotificationAccess 决定要查哪些源，因此收窄权限即收窄作用域。
func (a NotificationAccess) ScopedToType(notificationType string) NotificationAccess {
	switch notificationType {
	case NotificationTypeAlert:
		return NotificationAccess{CanReadAlerts: a.CanReadAlerts}
	case NotificationTypeSystem:
		a.CanReadAlerts = false
		return a
	default:
		return a
	}
}

type notificationAccess = NotificationAccess
