package inspection

import (
	"time"

	"gorm.io/datatypes"
)

type Template struct {
	ID          int            `gorm:"column:id;primaryKey"`
	Name        string         `gorm:"column:name"`
	Description *string        `gorm:"column:description"`
	Category    *string        `gorm:"column:category"`
	DeviceTypes datatypes.JSON `gorm:"column:device_types;type:jsonb"`
	CheckItems  datatypes.JSON `gorm:"column:check_items;type:jsonb"`
	IsDefault   bool           `gorm:"column:is_default"`
	IsActive    bool           `gorm:"column:is_active"`
	CreatedAt   *time.Time     `gorm:"column:created_at"`
	UpdatedAt   *time.Time     `gorm:"column:updated_at"`
}

func (Template) TableName() string {
	return "inspection_templates"
}

type Strategy struct {
	ID          int            `gorm:"column:id;primaryKey"`
	Name        string         `gorm:"column:name"`
	Description *string        `gorm:"column:description"`
	Type        string         `gorm:"column:type"`
	Cron        *string        `gorm:"column:cron"`
	Devices     datatypes.JSON `gorm:"column:devices;type:jsonb"`
	Templates   datatypes.JSON `gorm:"column:templates;type:jsonb"`
	Enabled     bool           `gorm:"column:enabled"`
	LastRunTime *time.Time     `gorm:"column:last_run_time"`
	NextRunTime *time.Time     `gorm:"column:next_run_time"`
	CreatedAt   *time.Time     `gorm:"column:created_at"`
	UpdatedAt   *time.Time     `gorm:"column:updated_at"`
}

func (Strategy) TableName() string {
	return "inspection_strategies"
}

type Inspection struct {
	ID           int            `gorm:"column:id;primaryKey"`
	DeviceID     int            `gorm:"column:device_id"`
	TemplateID   *int           `gorm:"column:template_id"`
	ScheduleID   *int           `gorm:"column:schedule_id"`
	Name         *string        `gorm:"column:name"`
	Trigger      string         `gorm:"column:trigger"`
	Status       string         `gorm:"column:status"`
	ScheduledAt  *time.Time     `gorm:"column:scheduled_at"`
	StartedAt    *time.Time     `gorm:"column:started_at"`
	CompletedAt  *time.Time     `gorm:"column:completed_at"`
	Duration     *int           `gorm:"column:duration"`
	TotalChecks  int            `gorm:"column:total_checks"`
	PassedChecks int            `gorm:"column:passed_checks"`
	FailedChecks int            `gorm:"column:failed_checks"`
	WarningChecks int           `gorm:"column:warning_checks"`
	SkippedChecks int           `gorm:"column:skipped_checks"`
	ErrorMessage *string        `gorm:"column:error_message"`
	ErrorDetails datatypes.JSON `gorm:"column:error_details;type:jsonb"`
	Timeout      *int           `gorm:"column:timeout"`
	RetryCount   *int           `gorm:"column:retry_count"`
	MaxRetries   *int           `gorm:"column:max_retries"`
	CreatedBy    *string        `gorm:"column:created_by"`
	CreatedAt    *time.Time     `gorm:"column:created_at"`
	UpdatedAt    *time.Time     `gorm:"column:updated_at"`
}

func (Inspection) TableName() string {
	return "inspections"
}

type Result struct {
	ID              int            `gorm:"column:id;primaryKey"`
	InspectionID    int            `gorm:"column:inspection_id"`
	CheckItemName   string         `gorm:"column:check_item_name"`
	CheckItemType   string         `gorm:"column:check_item_type"`
	CheckItemCategory *string      `gorm:"column:check_item_category"`
	Description     *string        `gorm:"column:description"`
	Command         *string        `gorm:"column:command"`
	Status          string         `gorm:"column:status"`
	ExpectedValue   *string        `gorm:"column:expected_value"`
	ActualValue     *string        `gorm:"column:actual_value"`
	Message         *string        `gorm:"column:message"`
	Details         datatypes.JSON `gorm:"column:details;type:jsonb"`
	ExecutionTime   *int           `gorm:"column:execution_time"`
	StartTime       *time.Time     `gorm:"column:start_time"`
	EndTime         *time.Time     `gorm:"column:end_time"`
	ErrorCode       *string        `gorm:"column:error_code"`
	ErrorMessage    *string        `gorm:"column:error_message"`
	ErrorDetails    datatypes.JSON `gorm:"column:error_details;type:jsonb"`
	Score           *float64       `gorm:"column:score"`
	Weight          *float64       `gorm:"column:weight"`
	CreatedAt       *time.Time     `gorm:"column:created_at"`
}

func (Result) TableName() string {
	return "inspection_results"
}
