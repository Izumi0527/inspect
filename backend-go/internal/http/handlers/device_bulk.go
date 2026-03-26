package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/auth"
	"github.com/your-org/inspect-system/backend-go/internal/devices"
	"github.com/your-org/inspect-system/backend-go/internal/inspection"
)

func (h DevicesHandler) BatchImportDevices(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "device service not configured")
	}
	user, err := requirePermission(c, h.Auth, "devices:create")
	if err != nil {
		return err
	}

	var req devices.DeviceBatchImportRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}
	if len(req.Devices) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "devices is required")
	}
	if len(req.Devices) > maxBatchImportDevices {
		return echo.NewHTTPError(
			http.StatusBadRequest,
			fmt.Sprintf("devices too large (max %d)", maxBatchImportDevices),
		)
	}

	createdBy := ""
	if user != nil {
		createdBy = user.ID
	}

	imported, skipped, err := h.Service.BatchCreateDevices(c.Request().Context(), req.Devices, createdBy, req.SkipDuplicates)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to import devices")
	}

	resp := devices.DeviceBatchImportResponse{
		Message:         fmt.Sprintf("imported %d devices", len(imported)),
		ImportedCount:   len(imported),
		SkippedCount:    len(skipped),
		ImportedDevices: imported,
		SkippedDevices:  skipped,
	}

	return c.JSON(http.StatusOK, resp)
}

func (h DevicesHandler) BatchDeleteDevices(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "device service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "devices:delete"); err != nil {
		return err
	}

	raw, err := io.ReadAll(c.Request().Body)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}
	raw = bytes.TrimSpace(raw)
	if len(raw) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "device_ids is required")
	}

	deviceIDs := make([]int, 0)
	if err := json.Unmarshal(raw, &deviceIDs); err == nil {
		if len(deviceIDs) == 0 {
			return echo.NewHTTPError(http.StatusBadRequest, "device_ids is required")
		}
	} else {
		var req struct {
			DeviceIDs []int `json:"device_ids"`
		}
		var reqCamel struct {
			DeviceIDs []int `json:"deviceIds"`
		}

		if err := json.Unmarshal(raw, &req); err == nil {
			deviceIDs = req.DeviceIDs
		} else if err := json.Unmarshal(raw, &reqCamel); err == nil {
			deviceIDs = reqCamel.DeviceIDs
		} else {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
		}
		if len(deviceIDs) == 0 {
			return echo.NewHTTPError(http.StatusBadRequest, "device_ids is required")
		}
	}

	deviceIDs = dedupePositiveInts(deviceIDs)
	if len(deviceIDs) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "device_ids is required")
	}
	if len(deviceIDs) > maxBatchDeviceIDs {
		return echo.NewHTTPError(http.StatusBadRequest, fmt.Sprintf("device_ids too large (max %d)", maxBatchDeviceIDs))
	}

	deleted := 0
	failed := make([]map[string]interface{}, 0)
	for _, id := range deviceIDs {
		if err := h.Service.DeleteDevice(c.Request().Context(), id); err != nil {
			failed = append(failed, map[string]interface{}{
				"device_id": id,
				"error":     err.Error(),
			})
			continue
		}
		deleted++
	}

	success := len(failed) == 0
	message := fmt.Sprintf("deleted %d devices", deleted)
	if !success {
		message = fmt.Sprintf("deleted %d devices, %d failed", deleted, len(failed))
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success":       success,
		"message":       message,
		"deleted_count": deleted,
		"failed_count":  len(failed),
		"failed_items":  failed,
	})
}

func (h DevicesHandler) BulkAction(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "device service not configured")
	}

	// 先确保请求已登录，避免匿名用户通过 400 响应探测参数校验逻辑。
	if _, err := requirePermission(c, h.Auth, ""); err != nil {
		return err
	}

	payload := map[string]interface{}{}
	if err := c.Bind(&payload); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	action := strings.ToLower(strings.TrimSpace(readStringValue(payload["action"])))
	if action == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "action is required")
	}

	deviceIDs := parseIntListFromPayload(payload["device_ids"])
	if len(deviceIDs) == 0 {
		deviceIDs = parseIntListFromPayload(payload["deviceIds"])
	}
	if len(deviceIDs) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "device_ids is required")
	}

	deviceIDs = dedupePositiveInts(deviceIDs)
	if len(deviceIDs) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "device_ids is required")
	}
	if len(deviceIDs) > maxBatchDeviceIDs {
		return echo.NewHTTPError(http.StatusBadRequest, fmt.Sprintf("device_ids too large (max %d)", maxBatchDeviceIDs))
	}

	ctx := c.Request().Context()

	switch action {
	case "batch_delete":
		// 先校验权限，再做任何 DB 查询，避免未授权请求触发数据库访问
		if _, err := requirePermission(c, h.Auth, "devices:delete"); err != nil {
			return err
		}
		nameMap := h.loadDeviceNameMap(ctx, deviceIDs)
		result := h.executeBulkDelete(ctx, deviceIDs, nameMap)
		return c.JSON(http.StatusOK, buildBulkActionResponse(result))
	case "batch_update":
		if _, err := requirePermission(c, h.Auth, "devices:update"); err != nil {
			return err
		}
		updatesRaw, ok := readUpdatesPayload(payload)
		if !ok {
			return echo.NewHTTPError(http.StatusBadRequest, "updates is required")
		}
		updates := buildDeviceUpdates(updatesRaw)
		if len(updates) == 0 {
			return echo.NewHTTPError(http.StatusBadRequest, "no updates provided")
		}
		nameMap := h.loadDeviceNameMap(ctx, deviceIDs)
		result := h.executeBulkUpdate(ctx, deviceIDs, updates, nameMap, "批量更新完成")
		return c.JSON(http.StatusOK, buildBulkActionResponse(result))
	case "batch_add_group":
		if _, err := requirePermission(c, h.Auth, "devices:update"); err != nil {
			return err
		}
		groupID, ok := toInt(payload["group_id"])
		if !ok {
			groupID, ok = toInt(payload["groupId"])
		}
		if !ok || groupID <= 0 {
			return echo.NewHTTPError(http.StatusBadRequest, "group_id is required")
		}
		nameMap := h.loadDeviceNameMap(ctx, deviceIDs)
		result := h.executeBulkUpdate(ctx, deviceIDs, map[string]interface{}{"group_id": groupID}, nameMap, "批量分组完成")
		return c.JSON(http.StatusOK, buildBulkActionResponse(result))
	case "batch_remove_group":
		if _, err := requirePermission(c, h.Auth, "devices:update"); err != nil {
			return err
		}
		nameMap := h.loadDeviceNameMap(ctx, deviceIDs)
		result := h.executeBulkUpdate(ctx, deviceIDs, map[string]interface{}{"group_id": nil}, nameMap, "批量移除分组完成")
		return c.JSON(http.StatusOK, buildBulkActionResponse(result))
	case "start_inspection":
		user, err := requirePermission(c, h.Auth, "inspections:execute")
		if err != nil {
			return err
		}
		result := h.executeStartInspection(ctx, deviceIDs, payload, user)
		return c.JSON(http.StatusOK, buildBulkActionResponse(result))
	case "batch_config":
		if _, err := requirePermission(c, h.Auth, "devices:update"); err != nil {
			return err
		}
		updatesRaw, ok := readUpdatesPayload(payload)
		if !ok {
			return echo.NewHTTPError(http.StatusBadRequest, "updates is required")
		}
		updates := buildDeviceUpdates(updatesRaw)
		if len(updates) == 0 {
			return echo.NewHTTPError(http.StatusBadRequest, "no updates provided")
		}
		nameMap := h.loadDeviceNameMap(ctx, deviceIDs)
		result := h.executeBulkUpdate(ctx, deviceIDs, updates, nameMap, "批量配置完成")
		return c.JSON(http.StatusOK, buildBulkActionResponse(result))
	default:
		// 即便 action 不支持，也要求已登录，避免匿名探测该接口。
		if _, err := requirePermission(c, h.Auth, ""); err != nil {
			return err
		}
		return echo.NewHTTPError(http.StatusBadRequest, "unsupported action")
	}
}

func (h DevicesHandler) BatchUpdateDevices(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "device service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "devices:update"); err != nil {
		return err
	}

	payload := map[string]interface{}{}
	if err := c.Bind(&payload); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	deviceIDs := parseIntListFromPayload(payload["device_ids"])
	if len(deviceIDs) == 0 {
		deviceIDs = parseIntListFromPayload(payload["deviceIds"])
	}
	if len(deviceIDs) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "device_ids is required")
	}

	deviceIDs = dedupePositiveInts(deviceIDs)
	if len(deviceIDs) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "device_ids is required")
	}
	if len(deviceIDs) > maxBatchDeviceIDs {
		return echo.NewHTTPError(http.StatusBadRequest, fmt.Sprintf("device_ids too large (max %d)", maxBatchDeviceIDs))
	}

	updatesRaw, ok := readUpdatesPayload(payload)
	if !ok {
		return echo.NewHTTPError(http.StatusBadRequest, "updates is required")
	}

	updates := buildDeviceUpdates(updatesRaw)
	if len(updates) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "no updates provided")
	}

	ctx := c.Request().Context()
	nameMap := h.loadDeviceNameMap(ctx, deviceIDs)
	result := h.executeBulkUpdate(ctx, deviceIDs, updates, nameMap, "批量更新完成")

	return c.JSON(http.StatusOK, buildBulkActionResponse(result))
}

type bulkActionResult struct {
	Success   bool
	Processed int
	Failed    int
	Errors    []map[string]interface{}
	Message   string
}

func buildBulkActionResponse(result bulkActionResult) map[string]interface{} {
	message := strings.TrimSpace(result.Message)
	if message == "" {
		message = "操作完成"
	}
	data := map[string]interface{}{
		"success":         result.Success,
		"processed_count": result.Processed,
		"failed_count":    result.Failed,
		"errors":          result.Errors,
		"message":         message,
	}

	return map[string]interface{}{
		"success": result.Success,
		"status":  http.StatusOK,
		"message": message,
		"data":    data,
	}
}

func (h DevicesHandler) executeBulkDelete(
	ctx context.Context,
	deviceIDs []int,
	nameMap map[int]string,
) bulkActionResult {
	processed := 0
	errorsList := make([]map[string]interface{}, 0)

	for _, id := range deviceIDs {
		if err := h.Service.DeleteDevice(ctx, id); err != nil {
			message := err.Error()
			if errors.Is(err, gorm.ErrRecordNotFound) {
				message = "device not found"
			}
			errorsList = append(errorsList, map[string]interface{}{
				"device_id":   id,
				"device_name": nameMap[id],
				"error":       message,
			})
			continue
		}
		processed++
	}

	message := "批量删除完成"
	if len(errorsList) > 0 {
		message = "批量删除部分失败"
	}

	return bulkActionResult{
		Success:   len(errorsList) == 0,
		Processed: processed,
		Failed:    len(errorsList),
		Errors:    errorsList,
		Message:   message,
	}
}

func (h DevicesHandler) executeBulkUpdate(
	ctx context.Context,
	deviceIDs []int,
	updates map[string]interface{},
	nameMap map[int]string,
	message string,
) bulkActionResult {
	processed := 0
	errorsList := make([]map[string]interface{}, 0)

	for _, id := range deviceIDs {
		if id <= 0 {
			continue
		}
		updatePayload := cloneMap(updates)
		if _, err := h.Service.UpdateDevice(ctx, id, updatePayload); err != nil {
			errMessage := err.Error()
			if errors.Is(err, gorm.ErrRecordNotFound) {
				errMessage = "device not found"
			}
			errorsList = append(errorsList, map[string]interface{}{
				"device_id":   id,
				"device_name": nameMap[id],
				"error":       errMessage,
			})
			continue
		}
		processed++
	}

	if strings.TrimSpace(message) == "" {
		message = "批量更新完成"
	}
	if len(errorsList) > 0 {
		message = message + "，部分失败"
	}

	return bulkActionResult{
		Success:   len(errorsList) == 0,
		Processed: processed,
		Failed:    len(errorsList),
		Errors:    errorsList,
		Message:   message,
	}
}

func (h DevicesHandler) executeStartInspection(
	ctx context.Context,
	deviceIDs []int,
	payload map[string]interface{},
	user *auth.UserRecord,
) bulkActionResult {
	if h.Inspection == nil {
		return bulkActionResult{
			Success:   false,
			Processed: 0,
			Failed:    len(deviceIDs),
			Errors:    buildBulkErrors(deviceIDs, nil, "巡检服务未配置"),
			Message:   "巡检服务未配置",
		}
	}

	name := strings.TrimSpace(readStringValue(payload["name"]))
	if name == "" {
		name = "批量巡检"
	}

	var templateID *int
	if value, ok := toInt(payload["template_id"]); ok && value > 0 {
		templateID = &value
	} else if value, ok := toInt(payload["templateId"]); ok && value > 0 {
		templateID = &value
	}

	createdBy := ""
	if user != nil {
		createdBy = user.ID
	}

	inspections, err := h.Inspection.CreateInspections(ctx, inspection.CreateInspectionInput{
		Name:       name,
		TemplateID: templateID,
		DeviceIDs:  deviceIDs,
		Trigger:    inspection.TriggerManual,
		CreatedBy:  stringPtr(createdBy),
	})
	if err != nil {
		return bulkActionResult{
			Success:   false,
			Processed: 0,
			Failed:    len(deviceIDs),
			Errors:    buildBulkErrors(deviceIDs, nil, err.Error()),
			Message:   "巡检任务创建失败",
		}
	}

	return bulkActionResult{
		Success:   true,
		Processed: len(inspections),
		Failed:    0,
		Errors:    []map[string]interface{}{},
		Message:   "巡检任务已创建",
	}
}

func (h DevicesHandler) loadDeviceNameMap(ctx context.Context, deviceIDs []int) map[int]string {
	result := map[int]string{}
	if h.Service == nil || len(deviceIDs) == 0 {
		return result
	}

	rows, err := h.Service.GetDevicesByIDs(ctx, deviceIDs)
	if err != nil {
		return result
	}
	for _, row := range rows {
		if strings.TrimSpace(row.Name) == "" {
			continue
		}
		result[row.ID] = row.Name
	}
	return result
}

func readUpdatesPayload(payload map[string]interface{}) (map[string]interface{}, bool) {
	raw, ok := payload["updates"]
	if !ok {
		return nil, false
	}
	if updates, ok := raw.(map[string]interface{}); ok {
		return updates, true
	}
	return nil, false
}

func buildBulkErrors(deviceIDs []int, nameMap map[int]string, message string) []map[string]interface{} {
	errorsList := make([]map[string]interface{}, 0, len(deviceIDs))
	for _, id := range deviceIDs {
		entry := map[string]interface{}{
			"device_id": id,
			"error":     message,
		}
		if nameMap != nil {
			if name := strings.TrimSpace(nameMap[id]); name != "" {
				entry["device_name"] = name
			}
		}
		errorsList = append(errorsList, entry)
	}
	return errorsList
}
