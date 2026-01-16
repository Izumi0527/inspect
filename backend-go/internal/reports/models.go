package reports

import (
	"time"

	"gorm.io/datatypes"
)

type ReportTemplate struct {
	ID           int            `gorm:"column:id;primaryKey"`
	Name         string         `gorm:"column:name"`
	Description  *string        `gorm:"column:description"`
	ReportType   string         `gorm:"column:report_type"`
	Config       datatypes.JSON `gorm:"column:config;type:jsonb"`
	ChartConfigs datatypes.JSON `gorm:"column:chart_configs;type:jsonb"`
	TableConfigs datatypes.JSON `gorm:"column:table_configs;type:jsonb"`
	Theme        *string        `gorm:"column:theme"`
	LogoURL      *string        `gorm:"column:logo_url"`
	HeaderText   *string        `gorm:"column:header_text"`
	FooterText   *string        `gorm:"column:footer_text"`
	IsDefault    bool           `gorm:"column:is_default"`
	IsActive     bool           `gorm:"column:is_active"`
	CreatedBy    *string        `gorm:"column:created_by"`
	CreatedAt    *time.Time     `gorm:"column:created_at"`
	UpdatedAt    *time.Time     `gorm:"column:updated_at"`
}

func (ReportTemplate) TableName() string {
	return "report_templates"
}

type ReportSchedule struct {
	ID            int            `gorm:"column:id;primaryKey"`
	Name          string         `gorm:"column:name"`
	Description   *string        `gorm:"column:description"`
	TemplateID    int            `gorm:"column:template_id"`
	CronExpression string        `gorm:"column:cron_expression"`
	Timezone      *string        `gorm:"column:timezone"`
	DataRange     datatypes.JSON `gorm:"column:data_range;type:jsonb"`
	DeviceFilters datatypes.JSON `gorm:"column:device_filters;type:jsonb"`
	OutputFormats datatypes.JSON `gorm:"column:output_formats;type:jsonb"`
	Recipients    datatypes.JSON `gorm:"column:recipients;type:jsonb"`
	IsActive      bool           `gorm:"column:is_active"`
	LastRun       *time.Time     `gorm:"column:last_run"`
	NextRun       *time.Time     `gorm:"column:next_run"`
	TotalRuns     int            `gorm:"column:total_runs"`
	SuccessRuns   int            `gorm:"column:successful_runs"`
	FailedRuns    int            `gorm:"column:failed_runs"`
	CreatedBy     *string        `gorm:"column:created_by"`
	CreatedAt     *time.Time     `gorm:"column:created_at"`
	UpdatedAt     *time.Time     `gorm:"column:updated_at"`
}

func (ReportSchedule) TableName() string {
	return "report_schedules"
}

type Report struct {
	ID             int            `gorm:"column:id;primaryKey"`
	TemplateID     *int           `gorm:"column:template_id"`
	ScheduleID     *int           `gorm:"column:schedule_id"`
	Title          string         `gorm:"column:title"`
	Description    *string        `gorm:"column:description"`
	ReportType     string         `gorm:"column:report_type"`
	Category       *string        `gorm:"column:category"`
	StartDate      time.Time      `gorm:"column:start_date"`
	EndDate        time.Time      `gorm:"column:end_date"`
	DeviceFilters  datatypes.JSON `gorm:"column:device_filters;type:jsonb"`
	Status         string         `gorm:"column:status"`
	GeneratedBy    *string        `gorm:"column:generated_by"`
	GeneratedAt    *time.Time     `gorm:"column:generated_at"`
	FileFormats    datatypes.JSON `gorm:"column:file_formats;type:jsonb"`
	FilePaths      datatypes.JSON `gorm:"column:file_paths;type:jsonb"`
	FileSizes      datatypes.JSON `gorm:"column:file_sizes;type:jsonb"`
	TotalDevices   int            `gorm:"column:total_devices"`
	DataPoints     int            `gorm:"column:data_points"`
	GenerationTime *int           `gorm:"column:generation_time"`
	ErrorMessage   *string        `gorm:"column:error_message"`
	ErrorDetails   datatypes.JSON `gorm:"column:error_details;type:jsonb"`
	IsPublic       bool           `gorm:"column:is_public"`
	SharedUsers    datatypes.JSON `gorm:"column:shared_users;type:jsonb"`
	CreatedAt      *time.Time     `gorm:"column:created_at"`
	UpdatedAt      *time.Time     `gorm:"column:updated_at"`
}

func (Report) TableName() string {
	return "reports"
}
