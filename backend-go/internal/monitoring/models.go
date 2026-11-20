package monitoring

import (
	"time"

	"gorm.io/datatypes"
)

type DeviceMetric struct {
	ID            int64             `gorm:"primaryKey;autoIncrement:false"`
	DeviceID      int               `gorm:"column:device_id;not null"`
	MetricName    string            `gorm:"column:metric_name;size:100;not null"`
	MetricValue   *float64          `gorm:"column:metric_value"`
	MetricUnit    *string           `gorm:"column:metric_unit;size:20"`
	InterfaceName *string           `gorm:"column:interface_name;size:100"`
	Tags          datatypes.JSONMap `gorm:"column:tags;type:jsonb"`
	CollectedAt   time.Time         `gorm:"column:collected_at;not null"`
	CreatedAt     time.Time         `gorm:"column:created_at;autoCreateTime"`
}

func (DeviceMetric) TableName() string {
	return "device_metrics"
}

type InterfaceMetric struct {
	ID            int64             `gorm:"primaryKey;autoIncrement:false"`
	DeviceID      int               `gorm:"column:device_id;not null"`
	InterfaceName string            `gorm:"column:interface_name;size:100;not null"`
	MetricName    string            `gorm:"column:metric_name;size:100;not null"`
	MetricValue   *float64          `gorm:"column:metric_value"`
	MetricUnit    *string           `gorm:"column:metric_unit;size:20"`
	Tags          datatypes.JSONMap `gorm:"column:tags;type:jsonb"`
	CollectedAt   time.Time         `gorm:"column:collected_at;not null"`
	CreatedAt     time.Time         `gorm:"column:created_at;autoCreateTime"`
}

func (InterfaceMetric) TableName() string {
	return "interface_metrics"
}

type SystemMetric struct {
	ID          int64             `gorm:"primaryKey;autoIncrement:false"`
	Host        *string           `gorm:"column:host;size:255"`
	MetricName  string            `gorm:"column:metric_name;size:100;not null"`
	MetricValue *float64          `gorm:"column:metric_value"`
	MetricUnit  *string           `gorm:"column:metric_unit;size:20"`
	Tags        datatypes.JSONMap `gorm:"column:tags;type:jsonb"`
	CollectedAt time.Time         `gorm:"column:collected_at;not null"`
	CreatedAt   time.Time         `gorm:"column:created_at;autoCreateTime"`
}

func (SystemMetric) TableName() string {
	return "system_metrics"
}

// DeviceLatestMetric 存储设备与接口的最新指标快照，避免在时序超表上执行全范围 DISTINCT ON。
type DeviceLatestMetric struct {
	DeviceID       int       `gorm:"column:device_id;type:bigint;primaryKey;autoIncrement:false"`
	MetricName     string    `gorm:"column:metric_name;size:100;primaryKey;index:idx_latest_metrics_metric"`
	InterfaceName  string    `gorm:"column:interface_name;size:100;primaryKey;default:''"`
	ItemKey        string    `gorm:"column:item_key;size:150;not null;default:''"`
	ApplicationTag string    `gorm:"column:application_tag;size:64;not null;default:'';index:idx_latest_metrics_app,priority:1"`
	MetricValue    *float64  `gorm:"column:metric_value"`
	PrevValue      *float64  `gorm:"column:prev_value"`
	RawText        *string   `gorm:"column:raw_text;size:512"`
	MetricUnit     *string   `gorm:"column:metric_unit;size:32"`
	CollectedAt    time.Time `gorm:"column:collected_at;not null;index:idx_latest_metrics_app,priority:2,sort:desc"`
	UpdatedAt      time.Time `gorm:"column:updated_at;not null"`
}

func (DeviceLatestMetric) TableName() string {
	return "device_latest_metrics"
}

// DeviceCollectionState 记录单台设备的采集诊断状态与指数退避熔断窗口（解耦 devices 资产表写锁）。
type DeviceCollectionState struct {
	DeviceID            int        `gorm:"column:device_id;type:bigint;primaryKey;autoIncrement:false"`
	LastErrorCode       string     `gorm:"column:last_error_code;size:32;not null;default:''"`
	LastErrorMessage    string     `gorm:"column:last_error_message;size:256;not null;default:''"`
	ConsecutiveFailures int        `gorm:"column:consecutive_failures;not null;default:0"`
	BackoffUntil        *time.Time `gorm:"column:backoff_until"`
	LastSuccessAt       *time.Time `gorm:"column:last_success_at"`
	LastDurationMS      int        `gorm:"column:last_duration_ms;not null;default:0"`
	UpdatedAt           time.Time  `gorm:"column:updated_at;not null"`
}

func (DeviceCollectionState) TableName() string {
	return "device_collection_states"
}

// UserPinnedDevice 存储用户星标关注的设备池（user_id 对齐 users.id VARCHAR(36) UUID）。
type UserPinnedDevice struct {
	UserID    string    `gorm:"column:user_id;type:varchar(36);primaryKey"`
	DeviceID  int       `gorm:"column:device_id;type:bigint;primaryKey;autoIncrement:false"`
	CreatedAt time.Time `gorm:"column:created_at;not null;autoCreateTime"`
}

func (UserPinnedDevice) TableName() string {
	return "user_pinned_devices"
}
