package scheduler

import (
	"time"

	"gorm.io/datatypes"
)

type TaskType string

const (
	TaskTypeDeviceInspection TaskType = "device_inspection"
	TaskTypeNetworkScan      TaskType = "network_scan"
	TaskTypeDeviceBackup     TaskType = "device_backup"
	TaskTypeSystemHealth     TaskType = "system_health_check"
	TaskTypeDataCleanup      TaskType = "data_cleanup"
	TaskTypeReportGeneration TaskType = "report_generation"
)

type TaskStatus string

const (
	TaskStatusPending   TaskStatus = "pending"
	TaskStatusRunning   TaskStatus = "running"
	TaskStatusCompleted TaskStatus = "completed"
	TaskStatusFailed    TaskStatus = "failed"
	TaskStatusCancelled TaskStatus = "cancelled"
)

type ScheduledTask struct {
	ID            string         `gorm:"column:id;primaryKey"`
	Name          string         `gorm:"column:name"`
	TaskType      string         `gorm:"column:task_type"`
	CronExpression string        `gorm:"column:cron_expression"`
	Enabled       bool           `gorm:"column:enabled"`
	Status        string         `gorm:"column:status"`
	Progress      float64        `gorm:"column:progress"`
	LastRun       *time.Time     `gorm:"column:last_run"`
	NextRun       *time.Time     `gorm:"column:next_run"`
	RunCount      int            `gorm:"column:run_count"`
	SuccessCount  int            `gorm:"column:success_count"`
	FailureCount  int            `gorm:"column:failure_count"`
	ErrorMessage  *string        `gorm:"column:error_message"`
	Config        datatypes.JSON `gorm:"column:config;type:jsonb"`
	CreatedAt     *time.Time     `gorm:"column:created_at"`
	UpdatedAt     *time.Time     `gorm:"column:updated_at"`
}

func (ScheduledTask) TableName() string {
	return "scheduled_tasks"
}

type TaskExecution struct {
	ID          string         `gorm:"column:id;primaryKey"`
	TaskID      string         `gorm:"column:task_id"`
	StartedAt   time.Time      `gorm:"column:started_at"`
	FinishedAt  *time.Time     `gorm:"column:finished_at"`
	Status      string         `gorm:"column:status"`
	Duration    float64        `gorm:"column:duration"`
	Result      datatypes.JSON `gorm:"column:result;type:jsonb"`
	ErrorMessage *string       `gorm:"column:error_message"`
}

func (TaskExecution) TableName() string {
	return "task_executions"
}
