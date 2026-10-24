package handlers

import (
	"time"

	"github.com/labstack/echo/v4"

	"github.com/your-org/inspect-system/backend-go/internal/reports"
	"github.com/your-org/inspect-system/backend-go/internal/settings"
)

type ReportsHandler struct {
	Service   *reports.Service
	Auth      PermissionService
	OutputDir string
	// Settings 提供业务时区（system.timezone）：趋势/统计的日/周/月分桶与日期范围
	// 按本地口径切分。允许为 nil（测试/降级场景），ResolveLocation 对 nil receiver 安全。
	Settings *settings.Service
}

// businessTZ 返回业务时区名（system.timezone），供 SQL 的 AT TIME ZONE 使用。
func (h ReportsHandler) businessTZ(c echo.Context) string {
	return h.Settings.ResolveLocation(c.Request().Context()).String()
}

// businessLoc 返回业务时区（*time.Location），供日期参数解析使用。
func (h ReportsHandler) businessLoc(c echo.Context) *time.Location {
	return h.Settings.ResolveLocation(c.Request().Context())
}

func (h ReportsHandler) Register(group *echo.Group) {
	group.GET("/reports", h.ListReports)
	group.GET("/reports/", h.ListReports)
	group.GET("/reports/:report_id", h.GetReport)
	group.POST("/reports", h.CreateReport)
	group.PUT("/reports/:report_id", h.UpdateReport)
	group.DELETE("/reports/:report_id", h.DeleteReport)
	group.DELETE("/reports", h.DeleteReportsByType)
	group.POST("/reports/batch-delete", h.BatchDeleteReports)
	group.POST("/reports/:report_id/generate", h.GenerateReport)
	group.POST("/reports/:report_id/rerender/pdf", h.RerenderReportPDF)
	group.POST("/reports/:report_id/clone", h.CloneReport)
	group.GET("/reports/:report_id/download", h.DownloadReport)
	group.GET("/reports/:report_id/preview", h.PreviewReport)

	group.POST("/reports/generate", h.GenerateReportFromRequest)

	group.GET("/reports/stats", h.GetReportStats)
	group.POST("/reports/stats/usage", h.GetUsageAnalysis)
	group.GET("/reports/stats/performance", h.GetPerformanceMetrics)

	group.POST("/reports/trends/analysis", h.GetTrendAnalysis)
	group.POST("/reports/trends/generate", h.GenerateTrendReport)
	group.POST("/reports/trends/predictions", h.GetTrendPredictions)
	group.POST("/reports/trends/anomalies", h.GetTrendAnomalies)

	group.POST("/reports/statistics/data", h.GetStatisticsData)
	group.POST("/reports/statistics/kpi", h.GetStatisticsKPI)
	group.POST("/reports/statistics/rankings", h.GetStatisticsRankings)
	group.POST("/reports/statistics/generate", h.GenerateStatisticsReport)
	group.GET("/reports/statistics/devices", h.GetDeviceStatistics)
	group.GET("/reports/statistics/alerts", h.GetAlertStatistics)
	group.GET("/reports/statistics/inspections", h.GetInspectionStatistics)

	group.POST("/reports/inspection/generate", h.GenerateInspectionReport)
	group.POST("/reports/inspection/data", h.GetInspectionReportData)
	group.POST("/reports/inspection/compare", h.CompareInspectionReports)

	group.GET("/reports/templates", h.ListTemplates)
	group.GET("/reports/templates/:template_id", h.GetTemplate)
	group.POST("/reports/templates", h.CreateTemplate)
	group.PUT("/reports/templates/:template_id", h.UpdateTemplate)
	group.DELETE("/reports/templates/:template_id", h.DeleteTemplate)
	group.POST("/reports/templates/:template_id/clone", h.CloneTemplate)

	group.POST("/reports/export/excel", h.ExportExcel)
	group.POST("/reports/export/word", h.ExportWord)

	group.GET("/reports/scheduled", h.ListScheduledReports)
	group.POST("/reports/scheduled", h.CreateScheduledReport)
	group.DELETE("/reports/scheduled/:report_id", h.DeleteScheduledReport)

	group.GET("/reports/files/:filename", h.DownloadReportFile)
}

type reportScheduleRequest struct {
	Enabled    *bool    `json:"enabled"`
	Frequency  string   `json:"frequency"`
	DayOfWeek  *int     `json:"dayOfWeek"`
	DayOfMonth *int     `json:"dayOfMonth"`
	Time       string   `json:"time"`
	Recipients []string `json:"recipients"`
}

type reportCreateRequest struct {
	Title       string                 `json:"title"`
	Description *string                `json:"description"`
	Type        string                 `json:"type"`
	Category    string                 `json:"category"`
	Format      string                 `json:"format"`
	Parameters  map[string]interface{} `json:"parameters"`
	Schedule    *reportScheduleRequest `json:"schedule"`
}

type reportGenerateRequest struct {
	Name           string                 `json:"name"`
	ReportType     string                 `json:"report_type"`
	StartTime      string                 `json:"start_time"`
	EndTime        string                 `json:"end_time"`
	DeviceIDs      []int                  `json:"device_ids"`
	IncludeCharts  *bool                  `json:"include_charts"`
	IncludeDetails *bool                  `json:"include_details"`
	CustomConfig   map[string]interface{} `json:"custom_config"`
	Format         string                 `json:"format"`
	Category       string                 `json:"category"`
}

type reportUpdateRequest struct {
	Title       *string                `json:"title"`
	Description *string                `json:"description"`
	Type        *string                `json:"type"`
	Category    *string                `json:"category"`
	Format      *string                `json:"format"`
	Status      *string                `json:"status"`
	Parameters  map[string]interface{} `json:"parameters"`
}

type reportTemplateRequest struct {
	Name        string                   `json:"name"`
	Description *string                  `json:"description"`
	Type        string                   `json:"type"`
	ReportType  *string                  `json:"report_type"`
	Sections    []map[string]interface{} `json:"sections"`
	Styles      map[string]interface{}   `json:"styles"`
	Config      map[string]interface{}   `json:"config"`
}
