package alerts

import (
	"time"

	"gorm.io/datatypes"
)

type Alert struct {
	ID               int        `gorm:"primaryKey;autoIncrement"`
	DeviceID         int        `gorm:"column:device_id;not null"`
	RuleID           *int       `gorm:"column:rule_id"`
	Title            string     `gorm:"column:title;size:500;not null"`
	Message          string     `gorm:"column:message;type:text;not null"`
	Category         string     `gorm:"column:category;size:50;not null"`
	Severity         string     `gorm:"column:severity;size:20;not null"`
	Status           string     `gorm:"column:status;size:20;not null"`
	MetricName       *string    `gorm:"column:metric_name;size:100"`
	CurrentValue     *float64   `gorm:"column:current_value"`
	ThresholdValue   *float64   `gorm:"column:threshold_value"`
	FirstOccurred    *time.Time `gorm:"column:first_occurred"`
	LastOccurred     *time.Time `gorm:"column:last_occurred"`
	AcknowledgedAt   *time.Time `gorm:"column:acknowledged_at"`
	ResolvedAt       *time.Time `gorm:"column:resolved_at"`
	ClosedAt         *time.Time `gorm:"column:closed_at"`
	AcknowledgedBy   *string    `gorm:"column:acknowledged_by"`
	ResolvedBy       *string    `gorm:"column:resolved_by"`
	ResolutionNote   *string    `gorm:"column:resolution_note"`
	OccurrenceCount  *int       `gorm:"column:occurrence_count"`
	NotificationCount *int      `gorm:"column:notification_count"`
	EscalationLevel  *int       `gorm:"column:escalation_level"`
	ReactivatedAt    *time.Time `gorm:"column:reactivated_at"`
	ReactivatedBy    *string    `gorm:"column:reactivated_by"`
	ReactivationReason *string  `gorm:"column:reactivation_reason"`
	ClosedBy         *string    `gorm:"column:closed_by"`
	CreatedAt        *time.Time `gorm:"column:created_at"`
	UpdatedAt        *time.Time `gorm:"column:updated_at"`
}

func (Alert) TableName() string {
	return "alerts"
}

type AlertRule struct {
	ID                 int            `gorm:"primaryKey;autoIncrement"`
	Name               string         `gorm:"column:name;size:255;not null"`
	Description        *string        `gorm:"column:description;type:text"`
	Category           string         `gorm:"column:category;size:50;not null"`
	MetricName         string         `gorm:"column:metric_name;size:100;not null"`
	Operator           string         `gorm:"column:operator;size:10;not null"`
	ThresholdValue     float64        `gorm:"column:threshold_value;not null"`
	Duration           int            `gorm:"column:duration"`
	DeviceTypes        datatypes.JSON `gorm:"column:device_types"`
	DeviceGroups       datatypes.JSON `gorm:"column:device_groups"`
	SpecificDevices    datatypes.JSON `gorm:"column:specific_devices"`
	Severity           string         `gorm:"column:severity;size:20"`
	AutoResolve        *bool          `gorm:"column:auto_resolve"`
	NotificationEnabled *bool         `gorm:"column:notification_enabled"`
	EmailEnabled       *bool          `gorm:"column:email_enabled"`
	WebhookEnabled     *bool          `gorm:"column:webhook_enabled"`
	WebhookURL         *string        `gorm:"column:webhook_url;size:500"`
	EmailRecipients    datatypes.JSON `gorm:"column:email_recipients"`
	CooldownMinutes    *int           `gorm:"column:cooldown_minutes"`
	IsActive           *bool          `gorm:"column:is_active"`
	CreatedBy          *string        `gorm:"column:created_by;size:36"`
	CreatedAt          *time.Time     `gorm:"column:created_at"`
	UpdatedAt          *time.Time     `gorm:"column:updated_at"`
}

func (AlertRule) TableName() string {
	return "alert_rules"
}

type AlertOperationHistory struct {
	ID             int            `gorm:"primaryKey;autoIncrement"`
	AlertID        int            `gorm:"column:alert_id;not null"`
	OperationType  string         `gorm:"column:operation_type;size:50;not null"`
	OperatorID     string         `gorm:"column:operator_id;size:36;not null"`
	OperatorName   string         `gorm:"column:operator_name;size:100;not null"`
	OperationTime  time.Time      `gorm:"column:operation_time;not null"`
	Note           *string        `gorm:"column:note"`
	PreviousStatus *string        `gorm:"column:previous_status"`
	NewStatus      *string        `gorm:"column:new_status"`
	Metadata       datatypes.JSON `gorm:"column:metadata"`
}

func (AlertOperationHistory) TableName() string {
	return "alert_operation_history"
}
