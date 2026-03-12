package handlers

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/scheduler"
)

type SchedulerHandler struct {
	Service *scheduler.Service
	Auth    PermissionService
}

type schedulerTaskCreateRequest struct {
	Name           string                 `json:"name"`
	TaskType       string                 `json:"task_type"`
	CronExpression string                 `json:"cron_expression"`
	Enabled        *bool                  `json:"enabled,omitempty"`
	Config         map[string]interface{} `json:"config,omitempty"`
}

type schedulerTaskResponse struct {
	ID             string  `json:"id"`
	Name           string  `json:"name"`
	TaskType       string  `json:"task_type"`
	CronExpression string  `json:"cron_expression"`
	Enabled        bool    `json:"enabled"`
	Status         string  `json:"status"`
	Progress       float64 `json:"progress"`
	LastRun        *string `json:"last_run"`
	NextRun        *string `json:"next_run"`
	RunCount       int     `json:"run_count"`
	SuccessCount   int     `json:"success_count"`
	FailureCount   int     `json:"failure_count"`
	ErrorMessage   *string `json:"error_message"`
}

type schedulerStatsResponse struct {
	IsRunning       bool   `json:"is_running"`
	CheckInterval   int    `json:"check_interval"`
	TotalTasks      int    `json:"total_tasks"`
	EnabledTasks    int    `json:"enabled_tasks"`
	RunningTasks    int    `json:"running_tasks"`
	TotalExecutions int    `json:"total_executions"`
	Uptime          string `json:"uptime"`
}

func (h SchedulerHandler) Register(group *echo.Group) {
	group.GET("/scheduler/stats", h.GetStats)
	group.GET("/scheduler/tasks", h.ListTasks)
	group.GET("/scheduler/tasks/:task_id", h.GetTask)
	group.POST("/scheduler/tasks", h.CreateTask)
	group.POST("/scheduler/tasks/:task_id/enable", h.EnableTask)
	group.POST("/scheduler/tasks/:task_id/disable", h.DisableTask)
	group.DELETE("/scheduler/tasks/:task_id", h.DeleteTask)
}

func (h SchedulerHandler) GetStats(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "scheduler service not configured")
	}
	if _, err := requirePermission(c, h.Auth, ""); err != nil {
		return err
	}

	stats, err := h.Service.GetStats(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load scheduler stats")
	}

	return c.JSON(http.StatusOK, schedulerStatsResponse{
		IsRunning:       stats.IsRunning,
		CheckInterval:   stats.CheckInterval,
		TotalTasks:      stats.TotalTasks,
		EnabledTasks:    stats.EnabledTasks,
		RunningTasks:    stats.RunningTasks,
		TotalExecutions: stats.TotalExecutions,
		Uptime:          stats.Uptime,
	})
}

func (h SchedulerHandler) ListTasks(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "scheduler service not configured")
	}
	if _, err := requirePermission(c, h.Auth, ""); err != nil {
		return err
	}

	tasks, err := h.Service.ListTasks(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load tasks")
	}

	response := make([]schedulerTaskResponse, 0, len(tasks))
	for _, task := range tasks {
		response = append(response, buildSchedulerTaskResponse(task))
	}

	return c.JSON(http.StatusOK, response)
}

func (h SchedulerHandler) GetTask(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "scheduler service not configured")
	}
	if _, err := requirePermission(c, h.Auth, ""); err != nil {
		return err
	}

	taskID := strings.TrimSpace(c.Param("task_id"))
	task, err := h.Service.GetTask(c.Request().Context(), taskID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "Task not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load task")
	}

	return c.JSON(http.StatusOK, buildSchedulerTaskResponse(task))
}

func (h SchedulerHandler) CreateTask(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "scheduler service not configured")
	}
	user, err := requirePermission(c, h.Auth, "")
	if err != nil {
		return err
	}
	if user == nil || strings.ToLower(user.Role) != "admin" {
		return echo.NewHTTPError(http.StatusForbidden, "Admin permission required")
	}

	var req schedulerTaskCreateRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}
	if strings.TrimSpace(req.Name) == "" || strings.TrimSpace(req.TaskType) == "" || strings.TrimSpace(req.CronExpression) == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "name, task_type and cron_expression are required")
	}

	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	if req.Config == nil {
		req.Config = map[string]interface{}{}
	}

	task, err := h.Service.CreateTask(c.Request().Context(), scheduler.CreateTaskInput{
		Name:           req.Name,
		TaskType:       req.TaskType,
		CronExpression: req.CronExpression,
		Enabled:        enabled,
		Config:         req.Config,
	})
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	return c.JSON(http.StatusOK, buildSchedulerTaskResponse(task))
}

func (h SchedulerHandler) DeleteTask(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "scheduler service not configured")
	}
	user, err := requirePermission(c, h.Auth, "")
	if err != nil {
		return err
	}
	if user == nil || strings.ToLower(user.Role) != "admin" {
		return echo.NewHTTPError(http.StatusForbidden, "Admin permission required")
	}

	taskID := strings.TrimSpace(c.Param("task_id"))
	if err := h.Service.DeleteTask(c.Request().Context(), taskID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "Task not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to delete task")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "Task deleted successfully",
	})
}

func (h SchedulerHandler) EnableTask(c echo.Context) error {
	return h.setTaskEnabled(c, true, "Task enabled successfully")
}

func (h SchedulerHandler) DisableTask(c echo.Context) error {
	return h.setTaskEnabled(c, false, "Task disabled successfully")
}

func (h SchedulerHandler) setTaskEnabled(c echo.Context, enabled bool, message string) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "scheduler service not configured")
	}
	user, err := requirePermission(c, h.Auth, "")
	if err != nil {
		return err
	}
	if user == nil || strings.ToLower(user.Role) != "admin" {
		return echo.NewHTTPError(http.StatusForbidden, "Admin permission required")
	}

	taskID := strings.TrimSpace(c.Param("task_id"))
	if _, err := h.Service.SetTaskEnabled(c.Request().Context(), taskID, enabled); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "Task not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to update task status")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"message": message,
	})
}

func buildSchedulerTaskResponse(task scheduler.ScheduledTask) schedulerTaskResponse {
	return schedulerTaskResponse{
		ID:             task.ID,
		Name:           task.Name,
		TaskType:       task.TaskType,
		CronExpression: task.CronExpression,
		Enabled:        task.Enabled,
		Status:         task.Status,
		Progress:       task.Progress,
		LastRun:        formatSchedulerTime(task.LastRun),
		NextRun:        formatSchedulerTime(task.NextRun),
		RunCount:       task.RunCount,
		SuccessCount:   task.SuccessCount,
		FailureCount:   task.FailureCount,
		ErrorMessage:   task.ErrorMessage,
	}
}

func formatSchedulerTime(t *time.Time) *string {
	if t == nil {
		return nil
	}
	text := t.UTC().Format(time.RFC3339)
	return &text
}
