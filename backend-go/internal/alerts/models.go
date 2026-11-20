package alerts

import (
	"time"

	"gorm.io/datatypes"
)

type Alert struct {
	ID                 int        `gorm:"primaryKey;autoIncrement"`
	DeviceID           int        `gorm:"column:device_id;not null"`
	RuleID             *int       `gorm:"column:rule_id"`
	Title              string     `gorm:"column:title;size:500;not null"`
	Message            string     `gorm:"column:message;type:text;not null"`
	Category           string     `gorm:"column:category;size:50;not null"`
	Severity           string     `gorm:"column:severity;size:20;not null"`
	Status             string     `gorm:"column:status;size:20;not null"`
	MetricName         *string    `gorm:"column:metric_name;size:100"`
	CurrentValue       *float64   `gorm:"column:current_value"`
	ThresholdValue     *float64   `gorm:"column:threshold_value"`
	FirstOccurred      *time.Time `gorm:"column:first_occurred"`
	LastOccurred       *time.Time `gorm:"column:last_occurred"`
	AcknowledgedAt     *time.Time `gorm:"column:acknowledged_at"`
	ResolvedAt         *time.Time `gorm:"column:resolved_at"`
	ClosedAt           *time.Time `gorm:"column:closed_at"`
	AcknowledgedBy     *string    `gorm:"column:acknowledged_by"`
	ResolvedBy         *string    `gorm:"column:resolved_by"`
	ResolutionNote     *string    `gorm:"column:resolution_note"`
	OccurrenceCount    *int       `gorm:"column:occurrence_count"`
	NotificationCount  *int       `gorm:"column:notification_count"`
	EscalationLevel    *int       `gorm:"column:escalation_level"`
	ReactivatedAt      *time.Time `gorm:"column:reactivated_at"`
	ReactivatedBy      *string    `gorm:"column:reactivated_by"`
	ReactivationReason *string    `gorm:"column:reactivation_reason"`
	ClosedBy           *string    `gorm:"column:closed_by"`
	SuppressedBy       string     `gorm:"column:suppressed_by;size:32;default:''"`
	SuppressedRefID    *int64     `gorm:"column:suppressed_ref_id"`
	EntityKey          string     `gorm:"column:entity_key;size:128;default:''"`
	SnoozedUntil       *time.Time `gorm:"column:snoozed_until"`
	SnoozedBy          string     `gorm:"column:snoozed_by;type:varchar(36);default:''"`
	SnoozeReason       string     `gorm:"column:snooze_reason;size:256;default:''"`
	CreatedAt          *time.Time `gorm:"column:created_at"`
	UpdatedAt          *time.Time `gorm:"column:updated_at"`
}

func (Alert) TableName() string {
	return "alerts"
}

const (
	ExpressionModeThreshold  = "threshold"
	ExpressionModeHysteresis = "hysteresis"
	ExpressionModeNoData     = "nodata"
	ExpressionModeUptimeDrop = "uptime_drop"
	ExpressionModeIfFlap     = "if_flap"

	DependencyModeNone         = "none"
	DependencyModeLLDPUpstream = "lldp_upstream"
	DependencyModeManualDevice = "manual_device"

	SuppressedByMaintenance = "maintenance"
	SuppressedByDependency  = "dependency"
)

type AlertRule struct {
	ID                  int            `gorm:"primaryKey;autoIncrement"`
	Name                string         `gorm:"column:name;size:255;not null"`
	Description         *string        `gorm:"column:description;type:text"`
	Category            string         `gorm:"column:category;size:50;not null"`
	MetricName          string         `gorm:"column:metric_name;size:100;not null"`
	Operator            string         `gorm:"column:operator;size:10;not null"`
	ThresholdValue      float64        `gorm:"column:threshold_value;not null"`
	Duration            int            `gorm:"column:duration"`
	DeviceTypes         datatypes.JSON `gorm:"column:device_types"`
	DeviceGroups        datatypes.JSON `gorm:"column:device_groups"`
	SpecificDevices     datatypes.JSON `gorm:"column:specific_devices"`
	Severity            string         `gorm:"column:severity;size:20"`
	AutoResolve         *bool          `gorm:"column:auto_resolve"`
	NotificationEnabled *bool          `gorm:"column:notification_enabled"`
	EmailEnabled        *bool          `gorm:"column:email_enabled"`
	WebhookEnabled      *bool          `gorm:"column:webhook_enabled"`
	WebhookURL          *string        `gorm:"column:webhook_url;size:500"`
	EmailRecipients     datatypes.JSON `gorm:"column:email_recipients"`
	CooldownMinutes     *int           `gorm:"column:cooldown_minutes"`
	IsActive            *bool          `gorm:"column:is_active"`
	TemplateID          *int64         `gorm:"column:template_id"`
	ExpressionMode      string         `gorm:"column:expression_mode;size:32;default:'threshold'"`
	RecoveryOperator    string         `gorm:"column:recovery_operator;size:16;default:''"`
	RecoveryThreshold   *float64       `gorm:"column:recovery_threshold"`
	NoDataSeconds       int            `gorm:"column:nodata_seconds;default:0"`
	DependencyMode      string         `gorm:"column:dependency_mode;size:24;default:'none'"`
	DependsOnDeviceID   *int           `gorm:"column:depends_on_device_id"`
	EntityFilterRegex   string         `gorm:"column:entity_filter_regex;size:256;default:''"`
	TagsJSON            datatypes.JSON `gorm:"column:tags_json;type:jsonb;default:'{}'"`
	CreatedBy           *string        `gorm:"column:created_by;size:36"`
	CreatedAt           *time.Time     `gorm:"column:created_at"`
	UpdatedAt           *time.Time     `gorm:"column:updated_at"`
}

func (AlertRule) TableName() string {
	return "alert_rules"
}

// TriggerEvalState 持久化触发器持续时间窗口与滞后恢复状态，确保服务重启后状态不丢失。
type TriggerEvalState struct {
	RuleID          int        `gorm:"column:rule_id;primaryKey;autoIncrement:false"`
	DeviceID        int        `gorm:"column:device_id;primaryKey;autoIncrement:false"`
	EntityKey       string     `gorm:"column:entity_key;size:128;primaryKey;default:''"`
	BreachSince     *time.Time `gorm:"column:breach_since"`
	ConsecutiveHits int        `gorm:"column:consecutive_hits;default:0"`
	IsFiring        bool       `gorm:"column:is_firing;default:false"`
	LastValue       float64    `gorm:"column:last_value;default:0"`
	LastEvalAt      time.Time  `gorm:"column:last_eval_at"`
}

func (TriggerEvalState) TableName() string {
	return "trigger_eval_states"
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
