package handlers

import (
	"errors"
	"net/http"
	"os"
	"path/filepath"
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
	startDate, _ := parseTimeOptional(c.QueryParam("start_date"), h.businessLoc(c))
	endDate, _ := parseTimeOptional(c.QueryParam("end_date"), h.businessLoc(c))

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
		attachReportCreatorNames(c.Request().Context(), db, result)

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
	attachReportCreatorNames(c.Request().Context(), h.Service.DB(), result)

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

	data := buildReportResponse(report, schedule, h.OutputDir)
	attachReportCreatorNames(c.Request().Context(), h.Service.DB(), []map[string]interface{}{data})

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    data,
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
	startTime, endTime := resolveDateRange(req.Parameters, h.businessLoc(c))

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
		startTime, endTime := resolveDateRange(req.Parameters, h.businessLoc(c))
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

	// 先取一次行拿到 file_paths，删行成功后再回收落盘文件；不存在的报表按 404 处理。
	report, err := h.Service.GetReport(c.Request().Context(), reportID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "Report not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load report")
	}

	if err := h.Service.DeleteReport(c.Request().Context(), reportID); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to delete report")
	}
	h.removeReportFiles(c, report)

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "Report deleted successfully",
	})
}

// DeleteReportsByType 处理 DELETE /reports?type=<report_type>：一次清空某一类报表。
//
// type 为必填且必须是已知类型。normalizeReportType 会把未知值兜底成 "custom"，
// 若直接沿用，`type=foo` 就会悄悄删掉所有 custom 报表，因此这里对兜底结果显式拒绝。
func (h ReportsHandler) DeleteReportsByType(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "reports:delete"); err != nil {
		return err
	}

	rawType := strings.ToLower(strings.TrimSpace(firstNonEmpty(c.QueryParam("type"), c.QueryParam("report_type"))))
	if rawType == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "type is required")
	}
	reportType := normalizeReportType(rawType)
	if reportType == "custom" && rawType != "custom" {
		return echo.NewHTTPError(http.StatusBadRequest, "unknown report type")
	}

	// 先列出待删行的 file_paths，删行成功后再回收文件：行先删，保证不会留下指向已删文件的记录。
	rows, err := h.Service.ListReportFilesByType(c.Request().Context(), reportType)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load reports")
	}
	deleted, err := h.Service.DeleteReportsByType(c.Request().Context(), reportType)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to delete reports")
	}
	for _, row := range rows {
		h.removeReportFiles(c, row)
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"deleted": deleted,
		},
	})
}

type batchDeleteReportsRequest struct {
	IDs                    []interface{} `json:"ids"`
	ReportIDs              []interface{} `json:"report_ids"`
	ReportIDsCamel         []interface{} `json:"reportIds"`
	SelectAllFiltered      bool          `json:"selectAllFiltered"`
	SelectAllFilteredSnake bool          `json:"select_all_filtered"`
	ExcludeIDs             []interface{} `json:"excludeIds"`
	ExcludeIDsSnake        []interface{} `json:"exclude_ids"`
	Type                   string        `json:"type"`
	ReportType             string        `json:"report_type"`
	Status                 string        `json:"status"`
	Format                 string        `json:"format"`
	Search                 string        `json:"search"`
}

// BatchDeleteReports 处理 POST /api/v1/reports/batch-delete 请求
// 支持显式 IDs 批量删除与全选筛选结果（SelectAllFiltered）两种模式。
func (h ReportsHandler) BatchDeleteReports(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "reports:delete"); err != nil {
		return err
	}

	db := h.Service.DB()
	if db == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "database not configured")
	}

	var req batchDeleteReportsRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	ctx := c.Request().Context()
	selectAllFiltered := req.SelectAllFiltered || req.SelectAllFilteredSnake

	if !selectAllFiltered {
		rawIDs := make([]interface{}, 0, len(req.IDs)+len(req.ReportIDs)+len(req.ReportIDsCamel))
		rawIDs = append(rawIDs, req.IDs...)
		rawIDs = append(rawIDs, req.ReportIDs...)
		rawIDs = append(rawIDs, req.ReportIDsCamel...)

		parsedIDs := parseIntListFromPayload(rawIDs)
		seen := make(map[int]bool, len(parsedIDs))
		targetIDs := make([]int, 0, len(parsedIDs))
		for _, id := range parsedIDs {
			if !seen[id] {
				seen[id] = true
				targetIDs = append(targetIDs, id)
			}
		}
		if len(targetIDs) == 0 {
			return echo.NewHTTPError(http.StatusBadRequest, "未指定要删除的报告")
		}

		var rows []reports.Report
		if err := db.WithContext(ctx).Where("id IN ?", targetIDs).Find(&rows).Error; err != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "failed to load reports")
		}

		result := db.WithContext(ctx).Where("id IN ?", targetIDs).Delete(&reports.Report{})
		if result.Error != nil {
			return echo.NewHTTPError(http.StatusInternalServerError, "failed to delete reports")
		}

		for _, row := range rows {
			h.removeReportFiles(c, row)
		}

		return c.JSON(http.StatusOK, map[string]interface{}{
			"success": true,
			"data": map[string]interface{}{
				"deleted":       result.RowsAffected,
				"deletedCount":  result.RowsAffected,
				"deleted_count": result.RowsAffected,
			},
		})
	}

	// 全选筛选结果模式
	rawExclude := make([]interface{}, 0, len(req.ExcludeIDs)+len(req.ExcludeIDsSnake))
	rawExclude = append(rawExclude, req.ExcludeIDs...)
	rawExclude = append(rawExclude, req.ExcludeIDsSnake...)
	excludeIntIDs := parseIntListFromPayload(rawExclude)

	query := db.WithContext(ctx).Model(&reports.Report{})

	reportType := strings.TrimSpace(firstNonEmpty(req.Type, req.ReportType))
	if reportType != "" && !strings.EqualFold(reportType, "all") {
		query = query.Where("report_type = ?", normalizeReportType(reportType))
	}

	status := strings.TrimSpace(req.Status)
	if strings.EqualFold(status, "scheduled") {
		query = query.Where("status = ? AND schedule_id IS NOT NULL", "pending")
	} else if status != "" && !strings.EqualFold(status, "all") {
		query = query.Where("status = ?", status)
	}

	if len(excludeIntIDs) > 0 {
		query = query.Where("id NOT IN ?", excludeIntIDs)
	}

	var allRows []reports.Report
	if err := query.Find(&allRows).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load reports")
	}

	search := strings.ToLower(strings.TrimSpace(req.Search))
	formatFilter := strings.ToLower(strings.TrimSpace(req.Format))
	if formatFilter == "all" {
		formatFilter = ""
	}

	matchedRows := make([]reports.Report, 0, len(allRows))
	matchedIDs := make([]int, 0, len(allRows))
	for _, row := range allRows {
		if search != "" {
			title := strings.ToLower(row.Title)
			desc := ""
			if row.Description != nil {
				desc = strings.ToLower(*row.Description)
			}
			if !strings.Contains(title, search) && !strings.Contains(desc, search) {
				continue
			}
		}
		if formatFilter != "" {
			rowFormat := strings.ToLower(resolveReportFormat(row))
			if rowFormat != formatFilter {
				continue
			}
		}
		matchedRows = append(matchedRows, row)
		matchedIDs = append(matchedIDs, row.ID)
	}

	if len(matchedIDs) == 0 {
		return c.JSON(http.StatusOK, map[string]interface{}{
			"success": true,
			"data": map[string]interface{}{
				"deleted":       int64(0),
				"deletedCount":  int64(0),
				"deleted_count": int64(0),
			},
		})
	}

	result := db.WithContext(ctx).Where("id IN ?", matchedIDs).Delete(&reports.Report{})
	if result.Error != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to delete reports")
	}

	for _, row := range matchedRows {
		h.removeReportFiles(c, row)
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"deleted":       result.RowsAffected,
			"deletedCount":  result.RowsAffected,
			"deleted_count": result.RowsAffected,
		},
	})
}

// removeReportFiles 回收报表落盘文件（尽力而为）。
//
// file_paths 存的是生成器写下的绝对路径；这里只删位于 OutputDir 之内的文件，
// 与下载接口同一条目录边界守卫，防止脏数据把删除指到目录之外。
// 单个文件删不掉不影响删除请求本身（行已删，最坏只是留下孤儿文件），只记日志。
func (h ReportsHandler) removeReportFiles(c echo.Context, report reports.Report) {
	root := strings.TrimSpace(h.OutputDir)
	if root == "" {
		return
	}
	root = filepath.Clean(root)

	for _, value := range decodeJSONMap(report.FilePaths) {
		raw, ok := value.(string)
		if !ok || strings.TrimSpace(raw) == "" {
			continue
		}
		full := filepath.Clean(raw)
		rel, err := filepath.Rel(root, full)
		if err != nil || rel == "." || rel == ".." || strings.HasPrefix(rel, ".."+string(filepath.Separator)) {
			continue
		}
		if err := os.Remove(full); err != nil && !os.IsNotExist(err) {
			c.Logger().Warnf("remove report file failed: report=%d path=%s err=%v", report.ID, full, err)
		}
	}
}
