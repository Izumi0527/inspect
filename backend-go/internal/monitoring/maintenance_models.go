package monitoring

import (
	"time"

	"gorm.io/datatypes"
)

const (
	MaintenanceModeCollectSilence  = "collect_silence"
	MaintenanceModePauseCollection = "pause_collection"

	MaintenanceScheduleOnce    = "once"
	MaintenanceScheduleWeekly  = "weekly"
	MaintenanceScheduleMonthly = "monthly"

	MaintenanceTargetDevice      = "device"
	MaintenanceTargetDeviceGroup = "device_group"

	DefaultMaintenanceTimezone = "Asia/Shanghai"
)

// MonitorMaintenance 表示计划维护窗口配置。
type MonitorMaintenance struct {
	ID             int64          `gorm:"primaryKey;autoIncrement" json:"id"`
	Name           string         `gorm:"column:name;size:128;not null" json:"name"`
	Description    string         `gorm:"column:description;type:text;default:''" json:"description"`
	Mode           string         `gorm:"column:mode;size:32;not null;default:'collect_silence'" json:"mode"`
	ScheduleType   string         `gorm:"column:schedule_type;size:24;not null;default:'once'" json:"schedule_type"`
	StartTime      time.Time      `gorm:"column:start_time;not null" json:"start_time"`
	EndTime        time.Time      `gorm:"column:end_time;not null" json:"end_time"`
	RecurrenceJSON datatypes.JSON `gorm:"column:recurrence_json;type:jsonb;default:'{}'" json:"recurrence_json"`
	Timezone       string         `gorm:"column:timezone;size:64;not null;default:'Asia/Shanghai'" json:"timezone"`
	Enabled        bool           `gorm:"column:enabled;not null;default:true" json:"enabled"`
	CreatedBy      string         `gorm:"column:created_by;type:varchar(36);default:''" json:"created_by"`
	CreatedAt      time.Time      `gorm:"column:created_at;autoCreateTime" json:"created_at"`
	UpdatedAt      time.Time      `gorm:"column:updated_at;autoUpdateTime" json:"updated_at"`
}

func (MonitorMaintenance) TableName() string {
	return "monitor_maintenances"
}

// MonitorMaintenanceTarget 表示维护窗口关联的设备或设备组目标。
type MonitorMaintenanceTarget struct {
	ID            int64  `gorm:"primaryKey;autoIncrement" json:"id"`
	MaintenanceID int64  `gorm:"column:maintenance_id;not null;index:idx_maint_target_maint" json:"maintenance_id"`
	TargetType    string `gorm:"column:target_type;size:24;not null;index:idx_maint_target_lookup,priority:1" json:"target_type"`
	TargetID      int64  `gorm:"column:target_id;not null;index:idx_maint_target_lookup,priority:2" json:"target_id"`
}

func (MonitorMaintenanceTarget) TableName() string {
	return "monitor_maintenance_targets"
}

// MaintenanceRecurrence 描述周期性维护窗口的调度参数。
type MaintenanceRecurrence struct {
	Weekdays    []int  `json:"weekdays,omitempty"`      // 0=Sunday..6=Saturday
	DaysOfMonth []int  `json:"days_of_month,omitempty"` // 1..31
	StartHM     string `json:"start_hm,omitempty"`      // HH:MM
	EndHM       string `json:"end_hm,omitempty"`        // HH:MM
}

// MaintenanceTargetInput 表示创建/更新维护窗口时传入的目标项。
type MaintenanceTargetInput struct {
	TargetType string `json:"target_type"`
	TargetID   int64  `json:"target_id"`
}

// MaintenanceInput 表示创建/更新维护窗口的强类型请求体。
type MaintenanceInput struct {
	Name         string                   `json:"name"`
	Description  string                   `json:"description"`
	Mode         string                   `json:"mode"`
	ScheduleType string                   `json:"schedule_type"`
	StartTime    *time.Time               `json:"start_time"`
	EndTime      *time.Time               `json:"end_time"`
	Recurrence   *MaintenanceRecurrence   `json:"recurrence,omitempty"`
	Timezone     string                   `json:"timezone"`
	Enabled      *bool                    `json:"enabled"`
	Targets      []MaintenanceTargetInput `json:"targets"`
	DeviceIDs    []int64                  `json:"device_ids,omitempty"`
	GroupIDs     []int64                  `json:"group_ids,omitempty"`
}

// MaintenanceView 表示返回给前端的维护窗口完整视图。
type MaintenanceView struct {
	MonitorMaintenance
	Recurrence MaintenanceRecurrence      `json:"recurrence"`
	Targets    []MonitorMaintenanceTarget `json:"targets"`
	IsActive   bool                       `json:"is_active"`
}

// ActiveMaintenance 表示某台设备当前命中的生效维护窗口。
type ActiveMaintenance struct {
	MaintenanceID     int64     `json:"maintenance_id"`
	Name              string    `json:"name"`
	Mode              string    `json:"mode"`
	ScheduleType      string    `json:"schedule_type"`
	Timezone          string    `json:"timezone"`
	StartTime         time.Time `json:"start_time"`
	EndTime           time.Time `json:"end_time"`
	MatchedTargetType string    `json:"matched_target_type,omitempty"`
	MatchedTargetID   int64     `json:"matched_target_id,omitempty"`
}
