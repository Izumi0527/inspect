package devices

import (
	"time"

	"gorm.io/datatypes"
)

type Device struct {
	ID              int            `gorm:"column:id;primaryKey"`
	Name            string         `gorm:"column:name"`
	IPAddress       string         `gorm:"column:ip_address;unique"`
	Hostname        *string        `gorm:"column:hostname"`
	MacAddress      *string        `gorm:"column:mac_address"`
	DeviceType      string         `gorm:"column:device_type"`
	Vendor          string         `gorm:"column:vendor"`
	Model           *string        `gorm:"column:model"`
	SerialNumber    *string        `gorm:"column:serial_number"`
	FirmwareVersion *string        `gorm:"column:firmware_version"`
	Location        *string        `gorm:"column:location"`
	GroupID         *int           `gorm:"column:group_id"`
	Status          string         `gorm:"column:status"`
	IsActive        bool           `gorm:"column:is_active"`
	IsMonitored     bool           `gorm:"column:is_monitored"`
	MonitorInterval int            `gorm:"column:monitor_interval"`
	SnmpVersion     *string        `gorm:"column:snmp_version"`
	SnmpCommunity   *string        `gorm:"column:snmp_community"`
	SnmpPort        *int           `gorm:"column:snmp_port"`
	CliProtocol     *string        `gorm:"column:cli_protocol"`
	SshUsername     *string        `gorm:"column:ssh_username"`
	SshPassword     *string        `gorm:"column:ssh_password"`
	SshPort         *int           `gorm:"column:ssh_port"`
	TelnetUsername  *string        `gorm:"column:telnet_username"`
	TelnetPassword  *string        `gorm:"column:telnet_password"`
	TelnetPort      *int           `gorm:"column:telnet_port"`
	EnablePassword  *string        `gorm:"column:enable_password"`
	IcmpStatus      *string        `gorm:"column:icmp_status"`
	SnmpStatus      *string        `gorm:"column:snmp_status"`
	LastProbeTime   *time.Time     `gorm:"column:last_probe_time"`
	CPUUsage        *float64       `gorm:"column:cpu_usage"`
	MemoryUsage     *float64       `gorm:"column:memory_usage"`
	Temperature     *float64       `gorm:"column:temperature"`
	Uptime          *int64         `gorm:"column:uptime"`
	ResponseTime    *float64       `gorm:"column:response_time"`
	LastSeen        *time.Time     `gorm:"column:last_seen"`
	AlertCount      *int           `gorm:"column:alert_count"`
	Description     *string        `gorm:"column:description"`
	Tags            datatypes.JSON `gorm:"column:tags;type:jsonb"`
	CreatedBy       *string        `gorm:"column:created_by"`
	CreatedAt       *time.Time     `gorm:"column:created_at"`
	UpdatedAt       *time.Time     `gorm:"column:updated_at"`
}

func (Device) TableName() string {
	return "devices"
}

type DeviceGroup struct {
	ID          int        `gorm:"column:id;primaryKey"`
	Name        string     `gorm:"column:name;unique"`
	Description *string    `gorm:"column:description"`
	ParentID    *int       `gorm:"column:parent_id"`
	DeviceCount *int       `gorm:"column:device_count"`
	IsActive    *bool      `gorm:"column:is_active"`
	CreatedAt   *time.Time `gorm:"column:created_at"`
	UpdatedAt   *time.Time `gorm:"column:updated_at"`
}

func (DeviceGroup) TableName() string {
	return "device_groups"
}

// DeviceInterface 设备接口当前状态表。此前缺失 model 与建表，
// 导致 WriteDeviceMetrics 写接口速率时报 42P01 并回滚整笔指标写入（含 cpu/mem 快照）。
type DeviceInterface struct {
	ID          int        `gorm:"column:id;primaryKey"`
	DeviceID    int        `gorm:"column:device_id;uniqueIndex:uq_device_iface"`
	Name        string     `gorm:"column:name;uniqueIndex:uq_device_iface"`
	Alias       *string    `gorm:"column:alias"`
	Speed       *int64     `gorm:"column:speed"`
	InOctets    *int64     `gorm:"column:in_octets"`
	OutOctets   *int64     `gorm:"column:out_octets"`
	IsUp        *bool      `gorm:"column:is_up"`
	LastUpdated *time.Time `gorm:"column:last_updated"`
	CreatedAt   *time.Time `gorm:"column:created_at"`
	UpdatedAt   *time.Time `gorm:"column:updated_at"`
}

func (DeviceInterface) TableName() string {
	return "device_interfaces"
}

type NetworkScan struct {
	ID              string         `gorm:"column:id;primaryKey"`
	Name            string         `gorm:"column:name"`
	TargetNetwork   string         `gorm:"column:target_network"`
	ScanType        string         `gorm:"column:scan_type"`
	Status          string         `gorm:"column:status"`
	Progress        int            `gorm:"column:progress"`
	TotalHosts      int            `gorm:"column:total_hosts"`
	ScannedHosts    int            `gorm:"column:scanned_hosts"`
	AliveHosts      int            `gorm:"column:alive_hosts"`
	DevicesFound    int            `gorm:"column:devices_found"`
	ScanPorts       datatypes.JSON `gorm:"column:scan_ports;type:jsonb"`
	SnmpCommunities datatypes.JSON `gorm:"column:snmp_communities;type:jsonb"`
	Timeout         *int           `gorm:"column:timeout"`
	MaxThreads      *int           `gorm:"column:max_threads"`
	PingCount       *int           `gorm:"column:ping_count"`
	StartedAt       *time.Time     `gorm:"column:started_at"`
	CompletedAt     *time.Time     `gorm:"column:completed_at"`
	Duration        *int           `gorm:"column:duration"`
	ResultSummary   datatypes.JSON `gorm:"column:result_summary;type:jsonb"`
	ErrorMessage    *string        `gorm:"column:error_message"`
	LogData         *string        `gorm:"column:log_data"`
	CreatedBy       *string        `gorm:"column:created_by"`
	CreatedAt       *time.Time     `gorm:"column:created_at"`
	UpdatedAt       *time.Time     `gorm:"column:updated_at"`
}

func (NetworkScan) TableName() string {
	return "network_scans"
}

type DiscoveredDevice struct {
	ID               int            `gorm:"column:id;primaryKey"`
	ScanID           string         `gorm:"column:scan_id;uniqueIndex:uni_discovered_devices_scan_id_ip_address;priority:1"`
	IPAddress        string         `gorm:"column:ip_address;uniqueIndex:uni_discovered_devices_scan_id_ip_address;priority:2"`
	Hostname         *string        `gorm:"column:hostname"`
	MacAddress       *string        `gorm:"column:mac_address"`
	Vendor           *string        `gorm:"column:vendor"`
	DeviceType       *string        `gorm:"column:device_type"`
	OSInfo           *string        `gorm:"column:os_info"`
	OpenPorts        datatypes.JSON `gorm:"column:open_ports;type:jsonb"`
	Services         datatypes.JSON `gorm:"column:services;type:jsonb"`
	SnmpInfo         datatypes.JSON `gorm:"column:snmp_info;type:jsonb"`
	ResponseTime     *float64       `gorm:"column:response_time"`
	Confidence       *float64       `gorm:"column:confidence"`
	IsImported       bool           `gorm:"column:is_imported"`
	ImportedDeviceID *int           `gorm:"column:imported_device_id"`
	DiscoveredAt     *time.Time     `gorm:"column:discovered_at"`
}

func (DiscoveredDevice) TableName() string {
	return "discovered_devices"
}
