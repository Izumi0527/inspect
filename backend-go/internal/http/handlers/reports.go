package handlers

import (
	"github.com/labstack/echo/v4"

	"github.com/your-org/inspect-system/backend-go/internal/reports"
)

type ReportsHandler struct {
	Service   *reports.Service
	Auth      PermissionService
	OutputDir string
}

func (h ReportsHandler) Register(group *echo.Group) {
	group.GET("/reports", h.ListReports)
	group.GET("/reports/", h.ListReports)
	group.GET("/reports/:report_id", h.GetReport)
	group.POST("/reports", h.CreateReport)
	group.PUT("/reports/:report_id", h.UpdateReport)
	group.DELETE("/reports/:report_id", h.DeleteReport)
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

	group.GET("/reports/custom/configs", h.ListCustomConfigs)
	group.GET("/reports/custom/configs/:config_id", h.GetCustomConfig)
	group.POST("/reports/custom/configs", h.CreateCustomConfig)
	group.PUT("/reports/custom/configs/:config_id", h.UpdateCustomConfig)
	group.DELETE("/reports/custom/configs/:config_id", h.DeleteCustomConfig)
	group.POST("/reports/custom/configs/:config_id/generate", h.GenerateFromCustomConfig)
	group.POST("/reports/custom/configs/:config_id/preview", h.PreviewCustomConfig)

	group.GET("/reports/templates", h.ListTemplates)
	group.GET("/reports/templates/:template_id", h.GetTemplate)
	group.POST("/reports/templates", h.CreateTemplate)
	group.PUT("/reports/templates/:template_id", h.UpdateTemplate)
	group.DELETE("/reports/templates/:template_id", h.DeleteTemplate)
	group.POST("/reports/templates/:template_id/clone", h.CloneTemplate)

	group.POST("/reports/export/excel", h.ExportExcel)
	group.POST("/reports/export/pdf", h.ExportPDF)
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

type customConfigRequest struct {
	Name        string                   `json:"name"`
	Description *string                  `json:"description"`
	Template    map[string]interface{}   `json:"template"`
	Parameters  map[string]interface{}   `json:"parameters"`
	Charts      []map[string]interface{} `json:"charts"`
	Tables      []map[string]interface{} `json:"tables"`
	Filters     []map[string]interface{} `json:"filters"`
	Layout      map[string]interface{}   `json:"layout"`
}
