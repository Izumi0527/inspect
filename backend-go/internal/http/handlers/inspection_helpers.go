package handlers

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"gorm.io/datatypes"

	"github.com/your-org/inspect-system/backend-go/internal/inspection"
)

type statsSummary struct {
	TotalExecutions int
	SuccessRate     float64
	AvgScore        float64
}

type deviceInfo struct {
	ID         int    `gorm:"column:id"`
	Name       string `gorm:"column:name"`
	DeviceType string `gorm:"column:device_type"`
	IPAddress  string `gorm:"column:ip_address"`
}

func inspectionOK(c echo.Context, data interface{}) error {
	return inspectionOKWithCode(c, http.StatusOK, "操作成功", data)
}

func inspectionOKWithMessage(c echo.Context, message string, data interface{}) error {
	return inspectionOKWithCode(c, http.StatusOK, message, data)
}

func inspectionOKWithCode(c echo.Context, code int, message string, data interface{}) error {
	if strings.TrimSpace(message) == "" {
		message = "操作成功"
	}
	return c.JSON(http.StatusOK, map[string]interface{}{
		"code":    code,
		"message": message,
		"data":    data,
	})
}

func calcPages(total int64, pageSize int) int {
	if pageSize <= 0 {
		return 0
	}
	return int((total + int64(pageSize) - 1) / int64(pageSize))
}

func splitCommaList(value string) []string {
	if strings.TrimSpace(value) == "" {
		return []string{}
	}
	parts := strings.Split(value, ",")
	result := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed != "" {
			result = append(result, trimmed)
		}
	}
	return result
}

func parseDate(value string) (time.Time, error) {
	return time.Parse("2006-01-02", strings.TrimSpace(value))
}

func parseOptionalDate(value string) (*time.Time, error) {
	if strings.TrimSpace(value) == "" {
		return nil, nil
	}
	parsed, err := parseDate(value)
	if err != nil {
		return nil, err
	}
	return &parsed, nil
}

func readOptionalString(payload map[string]interface{}, keys ...string) (*string, bool) {
	for _, key := range keys {
		if value, ok := payload[key]; ok {
			switch v := value.(type) {
			case string:
				text := strings.TrimSpace(v)
				return &text, true
			case []byte:
				text := strings.TrimSpace(string(v))
				return &text, true
			default:
				text := strings.TrimSpace(fmt.Sprint(v))
				return &text, true
			}
		}
	}
	return nil, false
}

func readOptionalInt(payload map[string]interface{}, keys ...string) (*int, bool) {
	if value, ok := readInt(payload, keys...); ok {
		return &value, true
	}
	return nil, false
}

func readIntSlice(payload map[string]interface{}, keys ...string) []int {
	for _, key := range keys {
		value, ok := payload[key]
		if !ok {
			continue
		}
		switch v := value.(type) {
		case []int:
			return v
		case []interface{}:
			result := make([]int, 0, len(v))
			for _, item := range v {
				switch itemValue := item.(type) {
				case int:
					result = append(result, itemValue)
				case float64:
					result = append(result, int(itemValue))
				case string:
					if parsed, err := strconv.Atoi(strings.TrimSpace(itemValue)); err == nil {
						result = append(result, parsed)
					}
				}
			}
			return result
		case []string:
			result := make([]int, 0, len(v))
			for _, item := range v {
				if parsed, err := strconv.Atoi(strings.TrimSpace(item)); err == nil {
					result = append(result, parsed)
				}
			}
			return result
		}
	}
	return []int{}
}

func readOptionalIntSlice(payload map[string]interface{}, keys ...string) ([]int, bool) {
	for _, key := range keys {
		if _, ok := payload[key]; ok {
			return readIntSlice(payload, key), true
		}
	}
	return nil, false
}

func readOptionalStringSlice(payload map[string]interface{}, keys ...string) ([]string, bool) {
	for _, key := range keys {
		if _, ok := payload[key]; ok {
			return readStringSlice(payload, key), true
		}
	}
	return nil, false
}

func readMapSlice(payload map[string]interface{}, keys ...string) []map[string]interface{} {
	for _, key := range keys {
		if value, ok := payload[key]; ok {
			switch v := value.(type) {
			case []map[string]interface{}:
				return v
			case []interface{}:
				result := make([]map[string]interface{}, 0, len(v))
				for _, item := range v {
					if row, ok := item.(map[string]interface{}); ok {
						result = append(result, row)
					}
				}
				return result
			}
		}
	}
	return []map[string]interface{}{}
}

func readOptionalMapSlice(payload map[string]interface{}, keys ...string) ([]map[string]interface{}, bool) {
	for _, key := range keys {
		if _, ok := payload[key]; ok {
			return readMapSlice(payload, key), true
		}
	}
	return nil, false
}

func stringValue(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func ptrTime(value time.Time) *time.Time {
	if value.IsZero() {
		return nil
	}
	return &value
}

func decodeJSONMapSlice(raw datatypes.JSON) []map[string]interface{} {
	if len(raw) == 0 || string(raw) == "null" {
		return []map[string]interface{}{}
	}
	var result []map[string]interface{}
	if err := json.Unmarshal(raw, &result); err != nil {
		return []map[string]interface{}{}
	}
	return result
}

func decodeJSONIntSlice(raw datatypes.JSON) []int {
	if len(raw) == 0 || string(raw) == "null" {
		return []int{}
	}
	var result []int
	if err := json.Unmarshal(raw, &result); err == nil {
		return result
	}
	var generic []interface{}
	if err := json.Unmarshal(raw, &generic); err != nil {
		return []int{}
	}
	parsed := make([]int, 0, len(generic))
	for _, item := range generic {
		switch value := item.(type) {
		case float64:
			parsed = append(parsed, int(value))
		case int:
			parsed = append(parsed, value)
		case string:
			if num, err := strconv.Atoi(strings.TrimSpace(value)); err == nil {
				parsed = append(parsed, num)
			}
		}
	}
	return parsed
}

func buildStrategyResponse(strategy inspection.Strategy) map[string]interface{} {
	return map[string]interface{}{
		"id":            fmt.Sprintf("%d", strategy.ID),
		"name":          strategy.Name,
		"description":   defaultStringPtr(strategy.Description, ""),
		"type":          strategy.Type,
		"cron":          strategy.Cron,
		"devices":       decodeJSONIntSlice(strategy.Devices),
		"templates":     decodeJSONIntSlice(strategy.Templates),
		"enabled":       strategy.Enabled,
		"created_at":    strategy.CreatedAt,
		"updated_at":    strategy.UpdatedAt,
		"next_run_time": strategy.NextRunTime,
	}
}

func buildTaskResponse(task inspection.Inspection, checkItems []map[string]interface{}, results []inspection.Result) map[string]interface{} {
	response := map[string]interface{}{
		"id":           task.ID,
		"strategy_id":  task.ScheduleID,
		"device_id":    task.DeviceID,
		"template_id":  task.TemplateID,
		"status":       task.Status,
		"progress":     computeProgress(task),
		"started_at":   task.StartedAt,
		"completed_at": task.CompletedAt,
		"check_items":  checkItems,
	}
	if results != nil {
		response["results"] = buildCheckResults(results)
	}
	return response
}

func buildCheckResults(results []inspection.Result) []map[string]interface{} {
	payload := make([]map[string]interface{}, 0, len(results))
	for _, item := range results {
		payload = append(payload, buildCheckResultResponse(item))
	}
	return payload
}

func buildCheckResultResponse(result inspection.Result) map[string]interface{} {
	payload := map[string]interface{}{
		"checkItemId":   fmt.Sprintf("%d", result.ID),
		"checkItemName": result.CheckItemName,
		"checkItemType": result.CheckItemType,
		"status":        normalizeCheckResultStatus(result.Status),
		"actualValue":   result.ActualValue,
		"expectedValue": result.ExpectedValue,
		"message":       result.Message,
		"executionTime": result.ExecutionTime,
	}

	// details 是检查项的结构化明细（如接口利用率逐接口清单）。
	// 原样透传 jsonb，消费方按 details.kind 分派渲染；解析失败则整体省略，
	// 不让一条脏数据影响其余字段。
	if len(result.Details) > 0 {
		var decoded interface{}
		if err := json.Unmarshal(result.Details, &decoded); err == nil {
			payload["details"] = decoded
		}
	}

	return payload
}

func buildExecutionResponse(item inspection.Inspection, strategyName string) map[string]interface{} {
	progress := computeProgress(item)
	totalChecks := resolveTotalChecks(item, nil)
	passed := resolvePassedChecks(item, nil)
	failed := resolveFailedChecks(item, nil)
	warning := resolveWarningChecks(item, nil)
	effectiveTotal := passed + failed + warning // 不把 skip 计入分母
	score := computeScore(effectiveTotal, passed)

	triggerType := inspection.TriggerManual
	if strings.EqualFold(item.Trigger, inspection.TriggerScheduled) {
		triggerType = inspection.TriggerScheduled
	}

	strategyID := ""
	if item.ScheduleID != nil {
		strategyID = fmt.Sprintf("%d", *item.ScheduleID)
	}
	if strings.TrimSpace(strategyName) == "" && item.Name != nil {
		strategyName = *item.Name
	}

	return map[string]interface{}{
		"id":               fmt.Sprintf("%d", item.ID),
		"strategyId":       strategyID,
		"strategy_id":      strategyID,
		"strategyName":     strategyName,
		"triggerType":      triggerType,
		"triggerUser":      item.CreatedBy,
		"status":           item.Status,
		"progress":         progress,
		"totalDevices":     1,
		"completedDevices": resolveCompletedDevices(item.Status),
		"startTime":        coalesceTime(item.StartedAt, item.CreatedAt),
		"endTime":          item.CompletedAt,
		"duration":         item.Duration,
		"summary": map[string]interface{}{
			"totalChecks":   totalChecks,
			"passedChecks":  passed,
			"failedChecks":  failed,
			"warningChecks": warning,
			"score":         score,
			"deviceResults": []interface{}{},
		},
	}
}

func buildExecutionSummary(item inspection.Inspection, device deviceInfo, results []inspection.Result) map[string]interface{} {
	totalChecks := resolveTotalChecks(item, results)
	passed := resolvePassedChecks(item, results)
	failed := resolveFailedChecks(item, results)
	warning := resolveWarningChecks(item, results)
	effectiveTotal := passed + failed + warning // 不把 skip 计入分母
	score := computeScore(effectiveTotal, passed)
	status := deriveDeviceStatus(item, passed, failed, warning)

	checkResults := buildCheckResults(results)
	deviceResults := []interface{}{}
	if device.ID > 0 {
		deviceResults = append(deviceResults, map[string]interface{}{
			"deviceId":      fmt.Sprintf("%d", device.ID),
			"deviceName":    defaultString(device.Name, "未知设备"),
			"deviceType":    device.DeviceType,
			"deviceIp":      device.IPAddress,
			"status":        status,
			"score":         float64(score),
			"checkResults":  checkResults,
			"passedChecks":  passed,
			"totalChecks":   totalChecks,
			"executionTime": defaultIntPtr(item.Duration),
		})
	}

	return map[string]interface{}{
		"totalChecks":   totalChecks,
		"passedChecks":  passed,
		"failedChecks":  failed,
		"warningChecks": warning,
		"score":         score,
		"deviceResults": deviceResults,
	}
}

func buildInspectionResultResponse(item inspection.Inspection, device deviceInfo, results []inspection.Result) map[string]interface{} {
	totalChecks := resolveTotalChecks(item, results)
	passed := resolvePassedChecks(item, results)
	failed := resolveFailedChecks(item, results)
	warning := resolveWarningChecks(item, results)
	effectiveTotal := passed + failed + warning // 不把 skip 计入分母
	score := computeScore(effectiveTotal, passed)
	status := deriveDeviceStatus(item, passed, failed, warning)

	checkResults := buildCheckResults(results)
	summary := fmt.Sprintf("Passed %d, Failed %d, Warning %d", passed, failed, warning)
	createdAt := coalesceTime(item.CompletedAt, item.CreatedAt)

	return map[string]interface{}{
		"id":             fmt.Sprintf("%d", item.ID),
		"task_id":        item.ID,
		"execution_id":   item.ID,
		"device_id":      item.DeviceID,
		"device_name":    defaultString(device.Name, "未知设备"),
		"status":         status,
		"score":          score,
		"total_checks":   totalChecks,
		"passed_checks":  passed,
		"failed_checks":  failed,
		"warning_checks": warning,
		"results":        checkResults,
		"check_results":  checkResults,
		"summary":        summary,
		"created_at":     createdAt,
	}
}

// normalizeCheckResultStatus 归一化检查结果状态，供 API 响应透传。
//
// **与 inspection.normalizeCheckResultStatus 是两份独立实现，新增状态必须同改两处。**
// 历史事故：给 not_applicable 加枚举时只改了 inspection 那份，这份漏改，
// 于是库里存「不适用」、API 吐「失败」——default 分支不报错也无日志，
// 前端徽章显示红色「失败」而消息里写着「未执行」，单元测试全绿也发现不了。
//
// default 仍落 fail 是刻意保留的兜底：出现未登记状态说明写入端有 bug，
// 显示成「失败」促使人去查，显示成「通过」则会把问题藏起来。
func normalizeCheckResultStatus(raw string) string {
	value := strings.ToLower(strings.TrimSpace(raw))
	switch value {
	case "pass", "fail", "warning", "skip", inspection.CheckStatusNotApplicable:
		return value
	case "error":
		return "fail"
	default:
		return "fail"
	}
}

func deriveDeviceStatus(item inspection.Inspection, passed int, failed int, warning int) string {
	if failed > 0 || strings.EqualFold(item.Status, inspection.StatusFailed) || strings.EqualFold(item.Status, inspection.StatusTimeout) {
		return "error"
	}
	if warning > 0 {
		return "warning"
	}
	if strings.EqualFold(item.Status, inspection.StatusCompleted) {
		return "success"
	}
	return "offline"
}

func computeProgress(item inspection.Inspection) int {
	total := item.TotalChecks
	completed := item.PassedChecks + item.FailedChecks + item.WarningChecks + item.SkippedChecks
	progress := 0
	if total > 0 {
		progress = int(math.Round(float64(completed) / float64(total) * 100))
	}
	if strings.EqualFold(item.Status, inspection.StatusCompleted) {
		progress = 100
	}
	return progress
}

func computeScore(total int, passed int) int {
	if total <= 0 {
		return 0
	}
	return int(math.Round(float64(passed) / float64(total) * 100))
}

func resolveTotalChecks(item inspection.Inspection, results []inspection.Result) int {
	if item.TotalChecks > 0 {
		return item.TotalChecks
	}
	if len(results) > 0 {
		return len(results)
	}
	return 0
}

func resolvePassedChecks(item inspection.Inspection, results []inspection.Result) int {
	if item.PassedChecks > 0 {
		return item.PassedChecks
	}
	if len(results) == 0 {
		return 0
	}
	count := 0
	for _, result := range results {
		if normalizeCheckResultStatus(result.Status) == "pass" {
			count++
		}
	}
	return count
}

func resolveFailedChecks(item inspection.Inspection, results []inspection.Result) int {
	if item.FailedChecks > 0 {
		return item.FailedChecks
	}
	if len(results) == 0 {
		return 0
	}
	count := 0
	for _, result := range results {
		if normalizeCheckResultStatus(result.Status) == "fail" {
			count++
		}
	}
	return count
}

func resolveWarningChecks(item inspection.Inspection, results []inspection.Result) int {
	if item.WarningChecks > 0 {
		return item.WarningChecks
	}
	if len(results) == 0 {
		return 0
	}
	count := 0
	for _, result := range results {
		if normalizeCheckResultStatus(result.Status) == "warning" {
			count++
		}
	}
	return count
}

func resolveCompletedDevices(status string) int {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case inspection.StatusCompleted, inspection.StatusFailed, inspection.StatusCancelled, inspection.StatusTimeout:
		return 1
	default:
		return 0
	}
}

func defaultIntPtr(value *int) int {
	if value == nil {
		return 0
	}
	return *value
}

func coalesceTime(primary *time.Time, fallback *time.Time) *time.Time {
	if primary != nil && !primary.IsZero() {
		return primary
	}
	if fallback != nil && !fallback.IsZero() {
		return fallback
	}
	return nil
}

func firstTime(primary *time.Time, fallback *time.Time) *time.Time {
	if primary != nil && !primary.IsZero() {
		return primary
	}
	return fallback
}

func (h InspectionHandler) loadResultsMap(ctx context.Context, inspections []inspection.Inspection) (map[int][]inspection.Result, error) {
	ids := make([]int, 0, len(inspections))
	for _, item := range inspections {
		ids = append(ids, item.ID)
	}
	results, err := h.Service.ListResultsByInspectionIDs(ctx, ids)
	if err != nil {
		return map[int][]inspection.Result{}, err
	}
	resultMap := make(map[int][]inspection.Result)
	for _, row := range results {
		resultMap[row.InspectionID] = append(resultMap[row.InspectionID], row)
	}
	return resultMap, nil
}

// loadUserNames 批量加载用户名映射（用户ID -> 用户名）
func (h InspectionHandler) loadUserNames(ctx context.Context, inspections []inspection.Inspection) map[string]string {
	userNames := make(map[string]string)

	if h.Settings == nil {
		return userNames
	}

	// 收集所有唯一的用户ID
	userIDSet := make(map[string]struct{})
	for _, item := range inspections {
		if item.CreatedBy != nil && strings.TrimSpace(*item.CreatedBy) != "" {
			userIDSet[*item.CreatedBy] = struct{}{}
		}
	}

	// 批量查询用户信息
	for userID := range userIDSet {
		user, err := h.Settings.GetUserByID(ctx, userID)
		if err == nil && user != nil {
			// 优先使用全名，如果没有则使用用户名
			if user.FullName != nil && strings.TrimSpace(*user.FullName) != "" {
				userNames[userID] = *user.FullName
			} else {
				userNames[userID] = user.Username
			}
		}
	}

	return userNames
}

// resolveUserName 根据用户ID获取用户名
func resolveUserName(userNames map[string]string, userID *string) string {
	if userID == nil || strings.TrimSpace(*userID) == "" {
		return ""
	}
	if name, ok := userNames[*userID]; ok {
		return name
	}
	// 如果找不到用户名，返回原始ID（截断显示）
	id := *userID
	if len(id) > 8 {
		return id[:8] + "..."
	}
	return id
}
func (h InspectionHandler) loadTemplatesMap(ctx context.Context, inspections []inspection.Inspection) (map[int][]map[string]interface{}, error) {
	templateIDs := map[int]struct{}{}
	for _, item := range inspections {
		if item.TemplateID != nil {
			templateIDs[*item.TemplateID] = struct{}{}
		}
	}
	result := make(map[int][]map[string]interface{})
	for templateID := range templateIDs {
		template, err := h.Service.GetTemplate(ctx, templateID)
		if err != nil {
			continue
		}
		result[templateID] = decodeJSONMapSlice(template.CheckItems)
	}
	return result, nil
}

func (h InspectionHandler) loadStrategyNames(ctx context.Context, inspections []inspection.Inspection) map[int]string {
	db := h.Service.DB()
	if db == nil {
		return map[int]string{}
	}
	ids := make([]int, 0)
	seen := map[int]struct{}{}
	for _, item := range inspections {
		if item.ScheduleID == nil {
			continue
		}
		if _, ok := seen[*item.ScheduleID]; ok {
			continue
		}
		seen[*item.ScheduleID] = struct{}{}
		ids = append(ids, *item.ScheduleID)
	}
	if len(ids) == 0 {
		return map[int]string{}
	}

	type row struct {
		ID   int    `gorm:"column:id"`
		Name string `gorm:"column:name"`
	}
	rows := make([]row, 0)
	_ = db.WithContext(ctx).
		Table("inspection_strategies").
		Select("id, name").
		Where("id IN ?", ids).
		Scan(&rows).Error

	result := make(map[int]string, len(rows))
	for _, item := range rows {
		result[item.ID] = item.Name
	}
	return result
}

func (h InspectionHandler) loadRecentCompletedExecutions(ctx context.Context, start time.Time, end time.Time, limit int) ([]interface{}, error) {
	db := h.Service.DB()
	if db == nil {
		return nil, fmt.Errorf("database not initialized")
	}
	if limit <= 0 {
		limit = 7
	}

	rows := make([]inspection.Inspection, 0, limit)
	if err := db.WithContext(ctx).
		Where("completed_at IS NOT NULL").
		Where("completed_at >= ? AND completed_at <= ?", start, end).
		Order("completed_at DESC").
		Limit(limit).
		Find(&rows).Error; err != nil {
		return nil, err
	}

	if len(rows) == 0 {
		return []interface{}{}, nil
	}

	strategyNames := h.loadStrategyNames(ctx, rows)
	userNames := h.loadUserNames(ctx, rows)
	items := make([]interface{}, 0, len(rows))
	for _, item := range rows {
		strategyName := resolveStrategyName(strategyNames, item.ScheduleID, item.Name)
		response := buildExecutionResponse(item, strategyName)
		response["triggerUser"] = resolveUserName(userNames, item.CreatedBy)
		items = append(items, response)
	}

	return items, nil
}

func (h InspectionHandler) loadDeviceMap(ctx context.Context, inspections []inspection.Inspection) map[int]deviceInfo {
	db := h.Service.DB()
	if db == nil {
		return map[int]deviceInfo{}
	}
	ids := make([]int, 0, len(inspections))
	seen := map[int]struct{}{}
	for _, item := range inspections {
		if _, ok := seen[item.DeviceID]; ok {
			continue
		}
		seen[item.DeviceID] = struct{}{}
		ids = append(ids, item.DeviceID)
	}
	if len(ids) == 0 {
		return map[int]deviceInfo{}
	}

	rows := make([]deviceInfo, 0)
	_ = db.WithContext(ctx).
		Table("devices").
		Select("id, name, device_type, ip_address").
		Where("id IN ?", ids).
		Scan(&rows).Error

	result := make(map[int]deviceInfo, len(rows))
	for _, row := range rows {
		result[row.ID] = row
	}
	return result
}

func (h InspectionHandler) loadDeviceInfo(ctx context.Context, deviceID int) deviceInfo {
	if deviceID <= 0 {
		return deviceInfo{}
	}
	db := h.Service.DB()
	if db == nil {
		return deviceInfo{}
	}
	row := deviceInfo{}
	_ = db.WithContext(ctx).
		Table("devices").
		Select("id, name, device_type, ip_address").
		Where("id = ?", deviceID).
		Take(&row).Error
	return row
}

func resolveStrategyName(strategyNames map[int]string, scheduleID *int, fallback *string) string {
	if scheduleID != nil {
		if name := strategyNames[*scheduleID]; strings.TrimSpace(name) != "" {
			return name
		}
	}
	if fallback != nil {
		return strings.TrimSpace(*fallback)
	}
	return ""
}
