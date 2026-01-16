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
