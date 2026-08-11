package logs

import "time"

type DeviceLog struct {
	ID           int        `gorm:"primaryKey;autoIncrement"`
	DeviceID     int        `gorm:"column:device_id;not null;index:idx_device_logs_device_ts,priority:1"`
	Level        string     `gorm:"column:level;size:20;not null"`
	Facility     string     `gorm:"column:facility;size:50;not null"`
	Source       string     `gorm:"column:source;size:20;not null"`
	Message      string     `gorm:"column:message;type:text;not null"`
	RawMessage   *string    `gorm:"column:raw_message;type:text"`
	SourceIP     *string    `gorm:"column:source_ip;size:45"`
	SourceProcess *string   `gorm:"column:source_process;size:100"`
	LogTimestamp time.Time  `gorm:"column:log_timestamp;not null;index:idx_device_logs_device_ts,priority:2"`
	CollectedAt  time.Time  `gorm:"column:collected_at;not null"`
	CreatedAt    time.Time  `gorm:"column:created_at;not null"`
}

func (DeviceLog) TableName() string {
	return "device_logs"
}

type DeviceLogWithDevice struct {
	DeviceLog
	DeviceName *string `gorm:"column:device_name"`
	DeviceIP   *string `gorm:"column:device_ip"`
}

// LogParsingRule 对应 log_parsing_rules 表。
//
// TODO(未接通): 该表当前只有 CRUD，没有任何消费方 —— parseLogOutput 与
// ParseSyslogMessage 都不读取它，配置的规则不会影响任何日志的解析结果。
// 日志可读化实际由前端 lib/plain-language 的规则表承担。
type LogParsingRule struct {
	ID              int        `gorm:"primaryKey;autoIncrement"`
	Name            string     `gorm:"column:name;size:100;not null;unique"`
	Description     *string    `gorm:"column:description;type:text"`
	Vendor          string     `gorm:"column:vendor;size:50;not null"`
	DeviceType      *string    `gorm:"column:device_type;size:50"`
	Pattern         string     `gorm:"column:pattern;type:text;not null"`
	LevelMapping    *string    `gorm:"column:level_mapping;type:text"`
	FacilityMapping *string    `gorm:"column:facility_mapping;type:text"`
	IsActive        bool       `gorm:"column:is_active;not null"`
	Priority        int        `gorm:"column:priority;not null"`
	CreatedAt       time.Time  `gorm:"column:created_at;not null"`
	UpdatedAt       time.Time  `gorm:"column:updated_at;not null"`
}

func (LogParsingRule) TableName() string {
	return "log_parsing_rules"
}
