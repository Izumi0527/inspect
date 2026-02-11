package devices

import "time"

type DeviceCreateRequest struct {
	Name          string      `json:"name"`
	IPAddress     string      `json:"ip_address"`
	DeviceType    string      `json:"device_type"`
	Vendor        string      `json:"vendor"`
	Model         *string     `json:"model,omitempty"`
	Location      *string     `json:"location,omitempty"`
	GroupID       *int        `json:"group_id,omitempty"`
	SnmpCommunity *string     `json:"snmp_community,omitempty"`
	SnmpVersion   *string     `json:"snmp_version,omitempty"`
	SnmpPort      *int        `json:"snmp_port,omitempty"`
	CliProtocol    *string     `json:"cli_protocol,omitempty"`
	SshUsername    *string     `json:"ssh_username,omitempty"`
	SshPassword    *string     `json:"ssh_password,omitempty"`
	SshPort        *int        `json:"ssh_port,omitempty"`
	TelnetUsername *string     `json:"telnet_username,omitempty"`
	TelnetPassword *string     `json:"telnet_password,omitempty"`
	TelnetPort     *int        `json:"telnet_port,omitempty"`
	EnablePassword *string     `json:"enable_password,omitempty"`
	Description   *string     `json:"description,omitempty"`
	Tags          interface{} `json:"tags,omitempty"`
}

type DeviceResponse struct {
	ID            int         `json:"id"`
	Name          string      `json:"name"`
	IPAddress     string      `json:"ip_address"`
	DeviceType    string      `json:"device_type"`
	Vendor        string      `json:"vendor"`
	Model         *string     `json:"model,omitempty"`
	Location      *string     `json:"location,omitempty"`
	GroupID       *int        `json:"group_id,omitempty"`
	Status        string      `json:"status"`
	LastSeen      *time.Time  `json:"last_seen,omitempty"`
	IsActive      bool        `json:"is_active"`
	CreatedBy     *string     `json:"created_by,omitempty"`
	SnmpCommunity *string     `json:"snmp_community,omitempty"`
	SnmpVersion   *string     `json:"snmp_version,omitempty"`
	SnmpPort      *int        `json:"snmp_port,omitempty"`
	CliProtocol    *string     `json:"cli_protocol,omitempty"`
	SshUsername    *string     `json:"ssh_username,omitempty"`
	SshPort        *int        `json:"ssh_port,omitempty"`
	TelnetUsername *string     `json:"telnet_username,omitempty"`
	TelnetPort     *int        `json:"telnet_port,omitempty"`
	EnablePassword *string     `json:"enable_password,omitempty"`
	Tags          interface{} `json:"tags,omitempty"`
	Description   *string     `json:"description,omitempty"`
	IcmpStatus    *string     `json:"icmp_status,omitempty"`
	SnmpStatus    *string     `json:"snmp_status,omitempty"`
	ResponseTime  *float64    `json:"response_time,omitempty"`
	LastProbeTime *time.Time  `json:"last_probe_time,omitempty"`
	CPUUsage      *float64    `json:"cpu_usage,omitempty"`
	MemoryUsage   *float64    `json:"memory_usage,omitempty"`
	Temperature   *float64    `json:"temperature,omitempty"`
	Uptime        *int64      `json:"uptime,omitempty"`
	AlertCount    *int        `json:"alert_count,omitempty"`
	CreatedAt     *time.Time  `json:"created_at,omitempty"`
	UpdatedAt     *time.Time  `json:"updated_at,omitempty"`
}

type DeviceGroupResponse struct {
	ID          int       `json:"id"`
	Name        string    `json:"name"`
	Description *string   `json:"description,omitempty"`
	DeviceCount int       `json:"device_count"`
	CreatedAt   time.Time `json:"created_at"`
}

type NetworkScanRequest struct {
	TargetNetwork string `json:"target_network"`
	ScanType      string `json:"scan_type"`
	PortScan      bool   `json:"port_scan"`
	SnmpScan      bool   `json:"snmp_scan"`
	DeepScan      bool   `json:"deep_scan"`
}

type NetworkScanResponse struct {
	ScanID        string `json:"scan_id"`
	Message       string `json:"message"`
	TargetNetwork string `json:"target_network"`
	ScanType      string `json:"scan_type"`
	Status        string `json:"status"`
}

type ScanResultResponse struct {
	ScanID            string     `json:"scan_id"`
	TargetNetwork     string     `json:"target_network"`
	ScanType          string     `json:"scan_type"`
	Status            string     `json:"status"`
	StartedAt         time.Time  `json:"started_at"`
	CompletedAt       *time.Time `json:"completed_at,omitempty"`
	DevicesFound      int        `json:"devices_found"`
	TotalHostsScanned int        `json:"total_hosts_scanned"`
	ErrorMessage      *string    `json:"error_message,omitempty"`
}

type DiscoveredDeviceResponse struct {
	IPAddress      string                 `json:"ip_address"`
	Hostname       *string                `json:"hostname,omitempty"`
	MacAddress     *string                `json:"mac_address,omitempty"`
	Vendor         *string                `json:"vendor,omitempty"`
	DeviceType     *string                `json:"device_type,omitempty"`
	OpenPorts      []int                  `json:"open_ports"`
	Services       map[string]interface{} `json:"services"`
	ResponseTime   *float64               `json:"response_time,omitempty"`
	LastSeen       *time.Time             `json:"last_seen,omitempty"`
	OSInfo         *string                `json:"os_info,omitempty"`
	SnmpAvailable  bool                   `json:"snmp_available"`
}

type DeviceBatchImportRequest struct {
	Devices        []DeviceCreateRequest `json:"devices"`
	AutoDetect     bool                  `json:"auto_detect"`
	SkipDuplicates bool                  `json:"skip_duplicates"`
}

type DeviceBatchImportResponse struct {
	Message         string           `json:"message"`
	ImportedCount   int              `json:"imported_count"`
	SkippedCount    int              `json:"skipped_count"`
	ImportedDevices []DeviceResponse `json:"imported_devices"`
	SkippedDevices  []SkippedDevice  `json:"skipped_devices"`
}

type SkippedDevice struct {
	IPAddress string `json:"ip_address"`
	Reason    string `json:"reason"`
}

type DeviceStatistics struct {
	TotalDevices     int            `json:"total_devices"`
	OnlineDevices    int            `json:"online_devices"`
	OfflineDevices   int            `json:"offline_devices"`
	WarningDevices   int            `json:"warning_devices"`
	UnknownDevices   int            `json:"unknown_devices"`
	TotalAlerts      int            `json:"total_alerts"`
	TypeDistribution map[string]int `json:"type_distribution"`
}

type DeviceProbeResponse struct {
	DeviceID         int       `json:"device_id"`
	IPAddress        string    `json:"ip_address"`
	IcmpReachable    bool      `json:"icmp_reachable"`
	IcmpResponseTime *float64  `json:"icmp_response_time,omitempty"`
	IcmpError        *string   `json:"icmp_error,omitempty"`
	SnmpReachable    bool      `json:"snmp_reachable"`
	SnmpResponseTime *float64  `json:"snmp_response_time,omitempty"`
	SnmpError        *string   `json:"snmp_error,omitempty"`
	SnmpSystemInfo   *string   `json:"snmp_system_info,omitempty"`
	ProbedAt         time.Time `json:"probed_at"`
}

type DeviceBatchProbeRequest struct {
	DeviceIDs     []int `json:"device_ids"`
	MaxConcurrent int   `json:"max_concurrent"`
}

type DeviceBatchProbeResponse struct {
	Total   int                  `json:"total"`
	Probed  int                  `json:"probed"`
	Results []DeviceProbeResponse `json:"results"`
}
