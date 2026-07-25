package handlers

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/inspection"
)

func (h InspectionHandler) ListTasks(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "inspection service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "inspections:read"); err != nil {
		return err
	}

	filter := inspection.InspectionFilter{
		Skip:  parseIntWithDefault(c.QueryParam("skip"), 0),
		Limit: parseIntWithDefault(c.QueryParam("limit"), 20),
	}

	statusParam := strings.TrimSpace(c.QueryParam("status"))
	if statusParam != "" {
		filter.Statuses = splitCommaList(statusParam)
	}

	if value := strings.TrimSpace(c.QueryParam("device_id")); value != "" {
		if parsed, err := strconv.Atoi(value); err == nil && parsed > 0 {
			filter.DeviceID = &parsed
		}
	}
	if value := strings.TrimSpace(c.QueryParam("template_id")); value != "" {
		if parsed, err := strconv.Atoi(value); err == nil && parsed > 0 {
			filter.TemplateID = &parsed
		}
	}
	if value := strings.TrimSpace(c.QueryParam("schedule_id")); value != "" {
		if parsed, err := strconv.Atoi(value); err == nil && parsed > 0 {
			filter.ScheduleID = &parsed
		}
	}

	if start := strings.TrimSpace(c.QueryParam("start_date")); start != "" {
		if parsed, err := parseDate(start); err == nil {
			filter.StartDate = &parsed
		}
	}
	if end := strings.TrimSpace(c.QueryParam("end_date")); end != "" {
		if parsed, err := parseDate(end); err == nil {
			filter.EndDate = &parsed
		}
	}

	inspections, total, err := h.Service.ListInspections(c.Request().Context(), filter)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load inspections")
	}

	resultsByInspection, _ := h.loadResultsMap(c.Request().Context(), inspections)
	templatesByID, _ := h.loadTemplatesMap(c.Request().Context(), inspections)

	tasks := make([]map[string]interface{}, 0, len(inspections))
	for _, item := range inspections {
		var checkItems []map[string]interface{}
		if item.TemplateID != nil {
			checkItems = templatesByID[*item.TemplateID]
		}
		results := resultsByInspection[item.ID]
		tasks = append(tasks, buildTaskResponse(item, checkItems, results))
	}

	return inspectionOK(c, map[string]interface{}{
		"tasks": tasks,
		"total": total,
		"pages": calcPages(total, filter.Limit),
	})
}

func (h InspectionHandler) GetTask(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "inspection service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "inspections:read"); err != nil {
		return err
	}

	taskID, err := parseIDParam(c, "id")
	if err != nil {
		return err
	}

	item, err := h.Service.GetInspection(c.Request().Context(), taskID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "巡检任务不存在")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load inspection")
	}

	var checkItems []map[string]interface{}
	if item.TemplateID != nil {
		if template, err := h.Service.GetTemplate(c.Request().Context(), *item.TemplateID); err == nil {
			checkItems = decodeJSONMapSlice(template.CheckItems)
		}
	}

	results, _ := h.Service.ListResultsByInspectionID(c.Request().Context(), item.ID)
	return inspectionOK(c, buildTaskResponse(item, checkItems, results))
}

func (h InspectionHandler) CreateTask(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "inspection service not configured")
	}
	user, err := requirePermission(c, h.Auth, "inspections:create")
	if err != nil {
		return err
	}

	payload := map[string]interface{}{}
	if err := c.Bind(&payload); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	name := readString(payload, "name")
	templateID, _ := readOptionalInt(payload, "template_id", "templateId")
	deviceIDs := readIntSlice(payload, "device_ids", "deviceIds")

	if len(deviceIDs) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "device_ids is required")
	}

	var scheduledAt *time.Time
	if value, ok := readOptionalString(payload, "scheduled_at", "scheduledAt"); ok {
		if parsed, err := parseTimeValue(*value); err == nil {
			scheduledAt = &parsed
		}
	}

	trigger := inspection.TriggerManual
	if scheduledAt != nil {
		trigger = inspection.TriggerScheduled
	}

	var createdBy *string
	if user != nil && strings.TrimSpace(user.ID) != "" {
		createdBy = &user.ID
	}

	inspections, err := h.Service.CreateInspections(c.Request().Context(), inspection.CreateInspectionInput{
		Name:        name,
		TemplateID:  templateID,
		DeviceIDs:   deviceIDs,
		Trigger:     trigger,
		ScheduledAt: scheduledAt,
		CreatedBy:   createdBy,
	})
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to create inspection")
	}

	if len(inspections) == 0 {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to create inspection")
	}

	createdIDs := make([]int, 0, len(inspections))
	for _, item := range inspections {
		createdIDs = append(createdIDs, item.ID)
	}

	task := buildTaskResponse(inspections[0], nil, nil)
	task["inspection_ids"] = createdIDs

	return inspectionOKWithCode(c, http.StatusCreated, "创建任务成功", task)
}

func (h InspectionHandler) StartTask(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "inspection service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "inspections:execute"); err != nil {
		return err
	}

	taskID, err := parseIDParam(c, "id")
	if err != nil {
		return err
	}

	task, err := h.Service.GetInspection(c.Request().Context(), taskID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "巡检任务不存在")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to start inspection")
	}

	switch {
	case strings.EqualFold(task.Status, inspection.StatusRunning):
		return echo.NewHTTPError(http.StatusConflict, "巡检任务正在执行")
	case strings.EqualFold(task.Status, inspection.StatusCompleted),
		strings.EqualFold(task.Status, inspection.StatusCancelled),
		strings.EqualFold(task.Status, inspection.StatusFailed),
		strings.EqualFold(task.Status, inspection.StatusTimeout):
		return echo.NewHTTPError(http.StatusConflict, "当前任务状态不允许启动")
	}

	var checkItems []map[string]interface{}
	if task.TemplateID != nil {
		template, err := h.Service.GetTemplate(c.Request().Context(), *task.TemplateID)
		if err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return echo.NewHTTPError(http.StatusNotFound, "巡检模板不存在")
			}
			return echo.NewHTTPError(http.StatusInternalServerError, "failed to load inspection template")
		}
		checkItems = decodeJSONMapSlice(template.CheckItems)
	}

	go func() {
		ctx := context.Background()
		h.executeInspection(ctx, task, checkItems, h.inspectionDefaults(ctx))
	}()
	return inspectionOKWithMessage(c, "巡检任务已启动", map[string]interface{}{"id": taskID})
}

func (h InspectionHandler) CancelTask(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "inspection service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "inspections:execute"); err != nil {
		return err
	}

	taskID, err := parseIDParam(c, "id")
	if err != nil {
		return err
	}

	payload := map[string]interface{}{}
	_ = c.Bind(&payload)
	reason := readString(payload, "reason")
	if reason == "" {
		reason = "用户手动取消"
	}

	item, err := h.Service.GetInspection(c.Request().Context(), taskID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "巡检任务不存在")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load inspection")
	}
	if item.Status != inspection.StatusRunning && item.Status != inspection.StatusPending {
		return echo.NewHTTPError(http.StatusBadRequest, fmt.Sprintf("无法取消状态为 %s 的任务", item.Status))
	}

	if _, err := h.Service.UpdateInspectionStatus(c.Request().Context(), taskID, inspection.StatusCancelled, &reason); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "巡检任务不存在")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to cancel inspection")
	}

	return inspectionOKWithMessage(c, "巡检任务已取消", map[string]interface{}{"id": taskID})
}

func (h InspectionHandler) GetTaskResults(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "inspection service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "inspections:read"); err != nil {
		return err
	}

	taskID, err := parseIDParam(c, "id")
	if err != nil {
		return err
	}

	if _, err := h.Service.GetInspection(c.Request().Context(), taskID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "巡检任务不存在")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load inspection")
	}

	results, err := h.Service.ListResultsByInspectionID(c.Request().Context(), taskID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load inspection results")
	}

	payload := make([]map[string]interface{}, 0, len(results))
	for _, item := range results {
		payload = append(payload, buildCheckResultResponse(item))
	}

	return inspectionOK(c, payload)
}

func (h InspectionHandler) GetTaskProgress(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "inspection service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "inspections:read"); err != nil {
		return err
	}

	taskID, err := parseIDParam(c, "id")
	if err != nil {
		return err
	}

	item, err := h.Service.GetInspection(c.Request().Context(), taskID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "巡检任务不存在")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load inspection")
	}

	progress := computeProgress(item)
	return inspectionOK(c, map[string]interface{}{
		"progress": progress,
		"status":   item.Status,
	})
}

func (h InspectionHandler) ListExecutions(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "inspection service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "inspections:read"); err != nil {
		return err
	}

	page := parseIntWithDefault(c.QueryParam("page"), 1)
	pageSize := parseIntWithDefault(c.QueryParam("page_size"), 10)
	if pageSize <= 0 {
		pageSize = 10
	}

	statusList := splitCommaList(c.QueryParam("status"))
	strategyID := parseIntWithDefault(c.QueryParam("strategy_id"), 0)

	startDate, _ := parseOptionalDate(c.QueryParam("start_date"))
	endDate, _ := parseOptionalDate(c.QueryParam("end_date"))

	db := h.Service.DB()
	if db == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "database not initialized")
	}

	query := db.WithContext(c.Request().Context()).Model(&inspection.Inspection{})
	if len(statusList) > 0 {
		query = query.Where("status IN ?", statusList)
	}
	if strategyID > 0 {
		query = query.Where("schedule_id = ?", strategyID)
	}
	executionTimeExpr := "COALESCE(started_at, created_at)"
	if startDate != nil {
		query = query.Where(fmt.Sprintf("%s >= ?", executionTimeExpr), *startDate)
	}
	if endDate != nil {
		query = query.Where(fmt.Sprintf("%s < ?", executionTimeExpr), endDate.Add(24*time.Hour))
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to count executions")
	}

	offset := (page - 1) * pageSize
	rows := make([]inspection.Inspection, 0)
	if err := query.
		Order(fmt.Sprintf("%s DESC", executionTimeExpr)).
		Offset(offset).
		Limit(pageSize).
		Find(&rows).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load executions")
	}

	strategyNames := h.loadStrategyNames(c.Request().Context(), rows)
	userNames := h.loadUserNames(c.Request().Context(), rows)

	items := make([]map[string]interface{}, 0, len(rows))
	for _, item := range rows {
		strategyName := resolveStrategyName(strategyNames, item.ScheduleID, item.Name)
		response := buildExecutionResponse(item, strategyName)
		// 将用户ID转换为用户名
		response["triggerUser"] = resolveUserName(userNames, item.CreatedBy)
		items = append(items, response)
	}

	return inspectionOK(c, map[string]interface{}{
		"items": items,
		"total": total,
		"pages": calcPages(total, pageSize),
	})
}

func (h InspectionHandler) GetExecution(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "inspection service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "inspections:read"); err != nil {
		return err
	}

	executionID, err := parseIDParam(c, "id")
	if err != nil {
		return err
	}

	item, err := h.Service.GetInspection(c.Request().Context(), executionID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "执行记录不存在")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load execution")
	}

	strategyNames := h.loadStrategyNames(c.Request().Context(), []inspection.Inspection{item})
	userNames := h.loadUserNames(c.Request().Context(), []inspection.Inspection{item})
	results, _ := h.Service.ListResultsByInspectionID(c.Request().Context(), item.ID)
	deviceInfo := h.loadDeviceInfo(c.Request().Context(), item.DeviceID)

	// 调试日志
	if h.Logger != nil {
		h.Logger.Info("GetExecution debug",
			zap.Int("execution_id", item.ID),
			zap.Int("device_id", item.DeviceID),
			zap.Int("device_info_id", deviceInfo.ID),
			zap.String("device_name", deviceInfo.Name),
			zap.Int("results_count", len(results)),
		)
	}

	strategyName := resolveStrategyName(strategyNames, item.ScheduleID, item.Name)
	response := buildExecutionResponse(item, strategyName)
	// 将用户ID转换为用户名
	response["triggerUser"] = resolveUserName(userNames, item.CreatedBy)
	response["summary"] = buildExecutionSummary(item, deviceInfo, results)

	return inspectionOK(c, response)
}

// StopExecution 处理 POST /api/v1/inspection/executions/:id/stop 请求
// 停止正在执行的巡检任务
func (h InspectionHandler) StopExecution(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "inspection service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "inspections:execute"); err != nil {
		return err
	}

	executionID, err := parseIDParam(c, "id")
	if err != nil {
		return err
	}

	// 获取执行记录
	item, err := h.Service.GetInspection(c.Request().Context(), executionID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "执行记录不存在")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load execution")
	}

	// 检查状态是否可以停止
	if item.Status != inspection.StatusRunning && item.Status != inspection.StatusPending {
		return echo.NewHTTPError(http.StatusBadRequest, fmt.Sprintf("无法停止状态为 %s 的任务", item.Status))
	}

	// 更新状态为已取消
	cancelMsg := "用户手动取消"
	updated, err := h.Service.UpdateInspectionStatus(c.Request().Context(), executionID, inspection.StatusCancelled, &cancelMsg)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to stop execution")
	}

	h.broadcastScanProgress(executionID, inspection.StatusCancelled, computeProgress(updated), map[string]interface{}{
		"message": cancelMsg,
	})

	return inspectionOKWithMessage(c, "巡检任务已停止", map[string]interface{}{
		"id":     executionID,
		"status": inspection.StatusCancelled,
	})
}

// DeleteExecution 处理 DELETE /api/v1/inspection/executions/:id 请求
// 删除巡检执行记录及其相关结果
func (h InspectionHandler) DeleteExecution(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "inspection service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "inspections:delete"); err != nil {
		return err
	}

	executionID, err := parseIDParam(c, "id")
	if err != nil {
		return err
	}

	// 获取执行记录
	item, err := h.Service.GetInspection(c.Request().Context(), executionID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "执行记录不存在")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load execution")
	}

	// 检查状态是否可以删除（不能删除正在执行的任务）
	if item.Status == inspection.StatusRunning {
		return echo.NewHTTPError(http.StatusBadRequest, "无法删除正在执行的任务，请先停止任务")
	}

	// 删除执行记录（包括相关的结果数据）
	err = h.Service.DeleteInspection(c.Request().Context(), executionID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "执行记录不存在")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to delete execution")
	}

	return inspectionOKWithMessage(c, "执行记录已删除", map[string]interface{}{
		"id": executionID,
	})
}

func (h InspectionHandler) ListResults(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "inspection service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "inspections:read"); err != nil {
		return err
	}

	page := parseIntWithDefault(c.QueryParam("page"), 1)
	pageSize := parseIntWithDefault(c.QueryParam("page_size"), 10)
	if pageSize <= 0 {
		pageSize = 10
	}

	taskID := parseIntWithDefault(c.QueryParam("task_id"), 0)
	deviceID := parseIntWithDefault(c.QueryParam("device_id"), 0)
	statusList := splitCommaList(c.QueryParam("status"))
	startDate, _ := parseOptionalDate(c.QueryParam("start_date"))
	endDate, _ := parseOptionalDate(c.QueryParam("end_date"))

	db := h.Service.DB()
	if db == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "database not initialized")
	}

	query := db.WithContext(c.Request().Context()).Model(&inspection.Inspection{})
	if taskID > 0 {
		query = query.Where("id = ?", taskID)
	}
	if deviceID > 0 {
		query = query.Where("device_id = ?", deviceID)
	}
	if startDate != nil {
		query = query.Where("created_at >= ?", *startDate)
	}
	if endDate != nil {
		query = query.Where("created_at < ?", endDate.Add(24*time.Hour))
	}

	if len(statusList) > 0 {
		condition, args := buildResultStatusFilter(statusList)
		if condition != "" {
			query = query.Where(condition, args...)
		}
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to count results")
	}

	offset := (page - 1) * pageSize
	rows := make([]inspection.Inspection, 0)
	if err := query.Order("created_at desc").Offset(offset).Limit(pageSize).Find(&rows).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load results")
	}

	deviceMap := h.loadDeviceMap(c.Request().Context(), rows)
	resultsMap, _ := h.loadResultsMap(c.Request().Context(), rows)

	payload := make([]map[string]interface{}, 0, len(rows))
	for _, item := range rows {
		device := deviceMap[item.DeviceID]
		payload = append(payload, buildInspectionResultResponse(item, device, resultsMap[item.ID]))
	}

	return inspectionOK(c, map[string]interface{}{
		"results": payload,
		"total":   total,
		"pages":   calcPages(total, pageSize),
	})
}

func (h InspectionHandler) GetResult(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "inspection service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "inspections:read"); err != nil {
		return err
	}

	resultID, err := parseIDParam(c, "id")
	if err != nil {
		return err
	}

	item, err := h.Service.GetInspection(c.Request().Context(), resultID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "巡检结果不存在")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load result")
	}

	results, _ := h.Service.ListResultsByInspectionID(c.Request().Context(), item.ID)
	deviceInfo := h.loadDeviceInfo(c.Request().Context(), item.DeviceID)

	return inspectionOK(c, buildInspectionResultResponse(item, deviceInfo, results))
}

func (h InspectionHandler) ListDeviceHistory(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "inspection service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "inspections:read"); err != nil {
		return err
	}

	deviceID, err := parseIDParam(c, "id")
	if err != nil {
		return err
	}

	limit := parseIntWithDefault(c.QueryParam("limit"), 10)
	if limit <= 0 {
		limit = 10
	}

	db := h.Service.DB()
	if db == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "database not initialized")
	}

	rows := make([]inspection.Inspection, 0)
	if err := db.WithContext(c.Request().Context()).
		Where("device_id = ?", deviceID).
		Order("created_at desc").
		Limit(limit).
		Find(&rows).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load history")
	}

	deviceInfo := h.loadDeviceInfo(c.Request().Context(), deviceID)
	resultsMap, _ := h.loadResultsMap(c.Request().Context(), rows)

	payload := make([]map[string]interface{}, 0, len(rows))
	for _, item := range rows {
		payload = append(payload, buildInspectionResultResponse(item, deviceInfo, resultsMap[item.ID]))
	}

	return inspectionOK(c, payload)
}
