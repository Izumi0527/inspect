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
		h.executeInspection(ctx, task, checkItems, h.inspectionDefaults(ctx), nil)
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

	// 执行历史按"执行批次"聚合：一次策略执行（多台设备）展示为一条记录。
	// 状态与日期筛选是"批内各设备取值可能不同"的条件，必须放在批次级 HAVING
	// 而非行级 WHERE——否则会把同一批次截断成部分设备，列表与详情的设备数对不上。
	// 策略筛选（schedule_id）批内取值一致，保留行级 WHERE。
	query := db.WithContext(c.Request().Context()).Model(&inspection.Inspection{})
	if strategyID > 0 {
		query = query.Where("schedule_id = ?", strategyID)
	}

	var having *executionGroupHaving
	if len(statusList) > 0 || startDate != nil || endDate != nil {
		exprParts := make([]string, 0, 3)
		havingArgs := make([]interface{}, 0, len(statusList)+2)
		if len(statusList) > 0 {
			// 批内任一设备处于所选状态即视为命中，返回完整批次
			exprParts = append(exprParts, "bool_or(status IN (?))")
			havingArgs = append(havingArgs, statusList)
		}
		if startDate != nil {
			exprParts = append(exprParts, "MIN(COALESCE(started_at, created_at)) >= ?")
			havingArgs = append(havingArgs, *startDate)
		}
		if endDate != nil {
			exprParts = append(exprParts, "MIN(COALESCE(started_at, created_at)) < ?")
			havingArgs = append(havingArgs, endDate.Add(24*time.Hour))
		}
		having = &executionGroupHaving{
			expr: strings.Join(exprParts, " AND "),
			args: havingArgs,
		}
	}

	groups, total, err := h.queryExecutionGroups(c.Request().Context(), query,
		"start_time DESC, min_id DESC", page, pageSize, having)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load executions")
	}

	// 汇总本页全部记录，批量加载策略名与用户名映射
	allRows := make([]inspection.Inspection, 0, len(groups)*4)
	for _, group := range groups {
		allRows = append(allRows, group.rows...)
	}
	strategyNames := h.loadStrategyNames(c.Request().Context(), allRows)
	userNames := h.loadUserNames(c.Request().Context(), allRows)

	items := make([]map[string]interface{}, 0, len(groups))
	for _, group := range groups {
		items = append(items, buildBatchExecutionResponse(group.rows, strategyNames, userNames))
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

	// 执行 id 既可能是批次 UUID（新批次），也可能是批次代表记录的数字 ID（历史批次）
	idParam := strings.TrimSpace(c.Param("id"))
	if idParam == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid execution id")
	}

	db := h.Service.DB()
	if db == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "database not initialized")
	}

	rows, err := h.resolveExecutionBatchRows(c.Request().Context(), db, idParam)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "执行记录不存在")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load execution")
	}
	if len(rows) == 0 {
		return echo.NewHTTPError(http.StatusNotFound, "执行记录不存在")
	}

	representative := rows[0]

	strategyNames := h.loadStrategyNames(c.Request().Context(), rows)
	userNames := h.loadUserNames(c.Request().Context(), rows)
	resultsByInspection, _ := h.loadResultsMap(c.Request().Context(), rows)
	deviceMap := h.loadDeviceMap(c.Request().Context(), rows)

	// 调试日志
	if h.Logger != nil {
		h.Logger.Info("GetExecution debug",
			zap.String("execution_id", idParam),
			zap.String("batch_id", representative.BatchID),
			zap.Int("batch_size", len(rows)),
			zap.Int("results_count", len(resultsByInspection)),
		)
	}

	response := buildBatchExecutionResponse(rows, strategyNames, userNames)
	response["summary"] = buildBatchExecutionSummary(rows, deviceMap, resultsByInspection)

	return inspectionOK(c, response)
}

// StopExecution 处理 POST /api/v1/inspection/executions/:id/stop 请求
// 停止正在执行的巡检任务（按批次：批内全部运行中/等待中的设备记录一并取消）
func (h InspectionHandler) StopExecution(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "inspection service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "inspections:execute"); err != nil {
		return err
	}

	idParam := strings.TrimSpace(c.Param("id"))
	if idParam == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid execution id")
	}

	db := h.Service.DB()
	if db == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "database not initialized")
	}

	rows, err := h.resolveExecutionBatchRows(c.Request().Context(), db, idParam)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "执行记录不存在")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load execution")
	}

	// 仅取消运行中/等待中的记录；已终态的记录保持原状态。
	// 单条 UPDATE 原子完成（WHERE 带状态过滤），快照后刚好完成的记录不会被误取消。
	cancelMsg := "用户手动取消"
	ids := make([]int, 0, len(rows))
	for _, item := range rows {
		ids = append(ids, item.ID)
	}
	cancelled, err := h.Service.CancelInspectionsByIDs(c.Request().Context(), ids, cancelMsg)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to stop execution")
	}
	if cancelled == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, fmt.Sprintf("无法停止状态为 %s 的任务", aggregateExecutionStatuses(rows)))
	}

	// 以批次对外 id 广播取消事件（与执行历史列表的 id 一致）。
	// 评审 L2：不能直接回显入参 idParam——按历史批次成员行 id 调用时，广播的
	// id 与列表的代表行 id（批内最小 ID）不一致，前端进度匹配会落空。
	broadcastID := executionBatchDisplayID(rows)
	h.broadcastScanProgressRaw(broadcastID, inspection.StatusCancelled, 0, map[string]interface{}{
		"message": cancelMsg,
	})

	return inspectionOKWithMessage(c, "巡检任务已停止", map[string]interface{}{
		"id":     broadcastID,
		"status": inspection.StatusCancelled,
	})
}

// DeleteExecution 处理 DELETE /api/v1/inspection/executions/:id 请求
// 删除巡检执行记录及其相关结果（按批次：批内全部设备记录一并删除）
func (h InspectionHandler) DeleteExecution(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "inspection service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "inspections:delete"); err != nil {
		return err
	}

	idParam := strings.TrimSpace(c.Param("id"))
	if idParam == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid execution id")
	}

	db := h.Service.DB()
	if db == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "database not initialized")
	}

	rows, err := h.resolveExecutionBatchRows(c.Request().Context(), db, idParam)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "执行记录不存在")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to delete execution")
	}

	// 检查状态是否可以删除（不能删除正在执行的任务）
	for _, item := range rows {
		if item.Status == inspection.StatusRunning {
			return echo.NewHTTPError(http.StatusBadRequest, "无法删除正在执行的任务，请先停止任务")
		}
	}

	ids := make([]int, 0, len(rows))
	for _, item := range rows {
		ids = append(ids, item.ID)
	}
	if err := h.Service.DeleteInspectionsByIDs(c.Request().Context(), ids); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "执行记录不存在")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to delete execution")
	}

	return inspectionOKWithMessage(c, "执行记录已删除", map[string]interface{}{
		"id": idParam,
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
