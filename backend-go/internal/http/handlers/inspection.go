package handlers

import (
	"context"

	"github.com/labstack/echo/v4"
	"go.uber.org/zap"

	"github.com/your-org/inspect-system/backend-go/internal/devices"
	"github.com/your-org/inspect-system/backend-go/internal/inspection"
	"github.com/your-org/inspect-system/backend-go/internal/reports"
	"github.com/your-org/inspect-system/backend-go/internal/settings"
	"github.com/your-org/inspect-system/backend-go/internal/ws"
)

type InspectionHandler struct {
	Service         *inspection.Service
	Reports         *reports.Service
	Auth            PermissionService
	Settings        *settings.Service // 用于获取用户信息
	DeviceService   *devices.Service
	ProbeService    *devices.ProbeService
	SNMPCollector   SNMPMetricsCollector
	WS              *ws.Manager
	Logger          *zap.Logger
	ReportOutputDir string
}

type SNMPMetricsCollector interface {
	CollectMetrics(
		ctx context.Context,
		ipAddress string,
		vendor string,
		snmpCommunity *string,
		snmpVersion *string,
		snmpPort *int,
		tags interface{},
	) (*devices.SNMPMetrics, error)
}

func (h InspectionHandler) Register(group *echo.Group) {
	group.GET("/inspection", h.ListTasks)
	group.GET("/inspection/", h.ListTasks)
	group.GET("/inspection/tasks", h.ListTasks)
	group.POST("/inspection/tasks", h.CreateTask)
	group.GET("/inspection/tasks/:id", h.GetTask)
	group.GET("/inspection/inspections/:id", h.GetTask)
	group.POST("/inspection/tasks/:id/start", h.StartTask)
	group.POST("/inspection/tasks/:id/cancel", h.CancelTask)
	group.GET("/inspection/tasks/:id/results", h.GetTaskResults)
	group.GET("/inspection/tasks/:id/progress", h.GetTaskProgress)

	// 模板管理 API 端点
	group.GET("/inspection/templates", h.ListTemplates)
	group.POST("/inspection/templates", h.CreateTemplate)
	group.GET("/inspection/templates/:id", h.GetTemplate)
	group.PUT("/inspection/templates/:id", h.UpdateTemplate)
	group.DELETE("/inspection/templates/:id", h.DeleteTemplate)
	group.POST("/inspection/templates/:id/copy", h.CopyTemplate)
	group.GET("/inspection/templates/:id/export", h.ExportTemplate)
	group.POST("/inspection/templates/import", h.ImportTemplate)

	group.GET("/inspection/strategies", h.ListStrategies)
	group.POST("/inspection/strategies", h.CreateStrategy)
	group.GET("/inspection/strategies/:id", h.GetStrategy)
	group.PUT("/inspection/strategies/:id", h.UpdateStrategy)
	group.DELETE("/inspection/strategies/:id", h.DeleteStrategy)
	group.POST("/inspection/strategies/:id/toggle", h.ToggleStrategy)
	group.POST("/inspection/strategies/:id/trigger", h.TriggerStrategy)

	group.GET("/inspection/executions", h.ListExecutions)
	group.GET("/inspection/executions/:id", h.GetExecution)
	group.POST("/inspection/executions/:id/stop", h.StopExecution)
	group.DELETE("/inspection/executions/:id", h.DeleteExecution)

	group.GET("/inspection/results", h.ListResults)
	group.GET("/inspection/results/:id", h.GetResult)
	group.GET("/inspection/devices/:id/history", h.ListDeviceHistory)

	group.GET("/inspection/stats", h.GetStats)
	group.GET("/inspection/statistics", h.GetStats)
	group.GET("/inspection/trends", h.GetTrends)
	group.GET("/inspection/device-distribution", h.GetDeviceDistribution)
	group.GET("/inspection/problem-distribution", h.GetProblemDistribution)
	group.POST("/inspection/analytics/export", h.ExportAnalytics)

	group.POST("/inspection/reports/generate", h.GenerateInspectionReport)
	group.GET("/inspection/reports/:id/status", h.GetInspectionReportStatus)
	group.GET("/inspection/reports/:id/download", h.GetInspectionReportDownload)
}
