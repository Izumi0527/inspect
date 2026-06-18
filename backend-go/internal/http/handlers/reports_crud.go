package handlers

import (
	"errors"
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"
	"gorm.io/datatypes"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/reports"
)

func (h ReportsHandler) ListReports(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "reports:read"); err != nil {
		return err
	}

	reportType := firstNonEmpty(c.QueryParam("type"), c.QueryParam("report_type"))
	status := strings.TrimSpace(c.QueryParam("status"))
	createdBy := strings.TrimSpace(c.QueryParam("created_by"))
	startDate, _ := parseTimeOptional(c.QueryParam("start_date"))
	endDate, _ := parseTimeOptional(c.QueryParam("end_date"))

	page := parseIntWithDefault(c.QueryParam("page"), 1)
	pageSize := parseIntWithDefault(firstNonEmpty(c.QueryParam("page_size"), c.QueryParam("pageSize")), 20)
	if page < 1 {
		page = 1
	}
	if pageSize <= 0 {
		pageSize = 20
	}
	if pageSize > 100 {
		pageSize = 100
	}

	// status=scheduled：对外语义为“已配置定时，但尚未生成完成”，内部存储为 pending 且 schedule_id 非空。
	// 若仅将 scheduled 映射为 pending，会导致 total/pages 不准确（包含未绑定 schedule 的 pending 报表）。
	if strings.EqualFold(status, "scheduled") {
		db := h.Service.DB()
		if db == nil {
			return echo.NewHTTPError(http.StatusServiceUnavailable, "database not configured")
		}

		query := db.WithContext(c.Request().Context()).Model(&reports.Report{}).
			Where("status = ?", "pending").
			Where("schedule_id IS NOT NULL")

		if strings.TrimSpace(reportType) != "" {
			normalized := normalizeReportType(reportType)
			query = query.Where("report_type = ?", normalized)
		}
		if createdBy != "" {
			query = query.Where("generated_by = ?", createdBy)
		}
		if startDate != nil {
			query = query.Where("created_at >= ?", *startDate)
		}
		if endDate != nil {
			query = query.Where("created_at <= ?", *endDate)
		}

		var total int64
		if err := query.Count(&total).Error; err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "failed to load reports")
		}

		list := make([]reports.Report, 0)
		if err := query.Order("created_at desc").
			Offset((page - 1) * pageSize).
			Limit(pageSize).
			Find(&list).Error; err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "failed to load reports")
		}

		result := make([]map[string]interface{}, 0, len(list))
		for _, item := range list {
			result = append(result, buildReportResponse(item, nil, h.OutputDir))
		}

		pages := 0
		if pageSize > 0 {
			pages = int((total + int64(pageSize) - 1) / int64(pageSize))
		}

		return c.JSON(http.StatusOK, map[string]interface{}{
			"success": true,
			"data": map[string]interface{}{
				"reports": result,
				"total":   total,
				"pages":   pages,
			},
		})
	}

	filter := reports.ListReportsFilter{
		Page:     page,
		PageSize: pageSize,
	}
	if reportType != "" {
		normalized := normalizeReportType(reportType)
		filter.ReportType = &normalized
	}
	if status != "" {
		filter.Status = &status
	}
	if createdBy != "" {
		filter.CreatedBy = &createdBy
	}
	if startDate != nil {
		filter.StartDate = startDate
	}
	if endDate != nil {
		filter.EndDate = endDate
	}

	list, total, err := h.Service.ListReports(c.Request().Context(), filter)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load reports")
	}

	result := make([]map[string]interface{}, 0, len(list))
	for _, item := range list {
		result = append(result, buildReportResponse(item, nil, h.OutputDir))
	}

	pages := 0
	if pageSize > 0 {
		pages = int((total + int64(pageSize) - 1) / int64(pageSize))
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"reports": result,
			"total":   total,
			"pages":   pages,
		},
	})
}

func (h ReportsHandler) GetReport(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "reports:read"); err != nil {
		return err
	}

	reportID, err := parseIDParam(c, "report_id")
	if err != nil {
		return err
	}

	report, err := h.Service.GetReport(c.Request().Context(), reportID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "Report not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load report")
	}

	var schedule *reports.ReportSchedule
	if report.ScheduleID != nil {
		if row, err := h.Service.GetSchedule(c.Request().Context(), *report.ScheduleID); err == nil {
			schedule = &row
		}
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    buildReportResponse(report, schedule, h.OutputDir),
	})
}

func (h ReportsHandler) CreateReport(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}
	user, err := requirePermission(c, h.Auth, "reports:create")
	if err != nil {
		return err
	}

	var req reportCreateRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}
	if strings.TrimSpace(req.Title) == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "title is required")
	}

	reportType := normalizeReportType(req.Type)
	category := normalizeReportCategory(req.Category)
	format := normalizeReportFormat(req.Format)
	startTime, endTime := resolveDateRange(req.Parameters)

	filtersJSON, err := encodeJSON(req.Parameters)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid parameters")
	}

	fileFormats, err := encodeJSON([]string{format})
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to encode format")
	}

	report := reports.Report{
		Title:         req.Title,
		Description:   req.Description,
		ReportType:    reportType,
		Category:      &category,
		StartDate:     startTime,
		EndDate:       endTime,
		DeviceFilters: filtersJSON,
		Status:        "pending",
		FileFormats:   fileFormats,
		FilePaths:     datatypes.JSON([]byte("{}")),
		FileSizes:     datatypes.JSON([]byte("{}")),
	}
	if user != nil {
		report.GeneratedBy = &user.ID
	}

	var schedule *reports.ReportSchedule
	if req.Schedule != nil {
		scheduleRow, err := h.createScheduleForReport(c, req.Title, req.Schedule, reportType, format, req.Parameters)
		if err != nil {
			return err
		}
		report.ScheduleID = &scheduleRow.ID
		report.TemplateID = &scheduleRow.TemplateID
		schedule = &scheduleRow
		report.Status = "pending"
	}

	if err := h.Service.CreateReport(c.Request().Context(), &report); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to create report")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    buildReportResponse(report, schedule, h.OutputDir),
	})
}

func (h ReportsHandler) UpdateReport(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "reports:update"); err != nil {
		return err
	}

	reportID, err := parseIDParam(c, "report_id")
	if err != nil {
		return err
	}

	var req reportUpdateRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	updates := map[string]interface{}{}
	if req.Title != nil {
		updates["title"] = strings.TrimSpace(*req.Title)
	}
	if req.Description != nil {
		updates["description"] = req.Description
	}
	if req.Type != nil {
		updates["report_type"] = normalizeReportType(*req.Type)
	}
	if req.Category != nil {
		updates["category"] = normalizeReportCategory(*req.Category)
	}
	if req.Format != nil {
		format := normalizeReportFormat(*req.Format)
		formatsJSON, err := encodeJSON([]string{format})
		if err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "failed to encode format")
		}
		updates["file_formats"] = formatsJSON
	}
	if req.Status != nil {
		updates["status"] = strings.TrimSpace(*req.Status)
	}
	if req.Parameters != nil {
		startTime, endTime := resolveDateRange(req.Parameters)
		updates["start_date"] = startTime
		updates["end_date"] = endTime
		filtersJSON, err := encodeJSON(req.Parameters)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid parameters")
		}
		updates["device_filters"] = filtersJSON
	}

	report, err := h.Service.UpdateReport(c.Request().Context(), reportID, updates)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "Report not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to update report")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    buildReportResponse(report, nil, h.OutputDir),
	})
}

func (h ReportsHandler) DeleteReport(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "reports:delete"); err != nil {
		return err
	}

	reportID, err := parseIDParam(c, "report_id")
	if err != nil {
		return err
	}

	if err := h.Service.DeleteReport(c.Request().Context(), reportID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "Report not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to delete report")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "Report deleted successfully",
	})
}
