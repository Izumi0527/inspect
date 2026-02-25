package logs

import "time"

// SyslogConfig 表示 Syslog 接收器的运行配置（由系统设置驱动）。
type SyslogConfig struct {
	Enabled               bool   `json:"enabled"`
	Protocol              string `json:"protocol"` // udp/tcp/both
	Host                  string `json:"host"`
	Port                  int    `json:"port"`
	MaxMessageBytes       int    `json:"max_message_bytes"`
	AlertsEnabled         bool   `json:"alerts_enabled"`
	AlertsMaxNewPerMinute int    `json:"alerts_max_new_per_minute"`
}

// SyslogStatus 表示 Syslog 接收器的当前状态与统计信息。
type SyslogStatus struct {
	Running bool        `json:"running"`
	Config  SyslogConfig `json:"config"`

	Received         uint64 `json:"received"`
	Stored           uint64 `json:"stored"`
	DroppedUnmatched uint64 `json:"dropped_unmatched"`
	DroppedParse     uint64 `json:"dropped_parse"`

	AlertsCreated      uint64 `json:"alerts_created"`
	AlertsUpdated      uint64 `json:"alerts_updated"`
	AlertsRateLimited  uint64 `json:"alerts_rate_limited"`

	LastError string    `json:"last_error,omitempty"`
	UpdatedAt time.Time `json:"updated_at"`
}

