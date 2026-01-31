package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"go.uber.org/zap"
	"gorm.io/datatypes"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/auth"
	"github.com/your-org/inspect-system/backend-go/internal/devices"
	"github.com/your-org/inspect-system/backend-go/internal/inspection"
	"github.com/your-org/inspect-system/backend-go/internal/reports"
)

type InspectionHandler struct {
	Service         *inspection.Service
	Reports         *reports.Service
	Auth            *auth.Service
	DeviceService   *devices.Service
	ProbeService    *devices.ProbeService
	Logger          *zap.Logger
	ReportOutputDir string
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
	group.POST("/inspection/templates/test-oid", h.TestOID)

	group.GET("/inspection/strategies", h.ListStrategies)
	group.POST("/inspection/strategies", h.CreateStrategy)
	group.GET("/inspection/strategies/:id", h.GetStrategy)
	group.PUT("/inspection/strategies/:id", h.UpdateStrategy)
	group.DELETE("/inspection/strategies/:id", h.DeleteStrategy)
	group.POST("/inspection/strategies/:id/toggle", h.ToggleStrategy)
	group.POST("/inspection/strategies/:id/trigger", h.TriggerStrategy)

	group.GET("/inspection/executions", h.ListExecutions)
	group.GET("/inspection/executions/:id", h.GetExecution)

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

// ============================================================================
// 模板管理 API 处理器
// ============================================================================

// ListTemplates 处理 GET /api/v1/templates 请求，支持增强过滤
func (h InspectionHandler) ListTemplates(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "inspection service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "inspections:read"); err != nil {
		return err
	}

	// 解析过滤参数
	filters := inspection.TemplateFilters{
		Vendor:     strings.TrimSpace(c.QueryParam("vendor")),
		DeviceType: strings.TrimSpace(c.QueryParam("device_type")),
		Category:   strings.TrimSpace(c.QueryParam("category")),
		Search:     strings.TrimSpace(c.QueryParam("search")),
	}

	// 解析 is_default 过滤参数
	if isDefaultStr := strings.TrimSpace(c.QueryParam("is_default")); isDefaultStr != "" {
		if isDefault, err := strconv.ParseBool(isDefaultStr); err == nil {
			filters.IsDefault = &isDefault
		}
	}

	// 解析分页参数
	pagination := inspection.Pagination{
		Page:     parseIntWithDefault(c.QueryParam("page"), 1),
		PageSize: parseIntWithDefault(c.QueryParam("page_size"), 20),
		Sort:     strings.TrimSpace(c.QueryParam("sort")),
		Order:    strings.TrimSpace(c.QueryParam("order")),
	}

	// 获取模板列表
	page, err := h.Service.List(c.Request().Context(), filters, pagination)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, fmt.Sprintf("failed to list templates: %v", err))
	}

	// 构建响应
	items := make([]map[string]interface{}, 0, len(page.Items))
	for _, template := range page.Items {
		items = append(items, buildTemplateResponse(template))
	}

	return inspectionOK(c, map[string]interface{}{
		"items":     items,
		"templates": items, // 兼容前端期望的 templates 字段
		"total":     page.Total,
		"page":      page.Page,
		"page_size": page.PageSize,
		"pages":     int(math.Ceil(float64(page.Total) / float64(page.PageSize))),
	})
}

// GetTemplate 处理 GET /api/v1/templates/:id 请求
func (h InspectionHandler) GetTemplate(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "inspection service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "inspections:read"); err != nil {
		return err
	}

	templateID, err := parseIDParam(c, "id")
	if err != nil {
		return err
	}

	template, err := h.Service.GetByID(c.Request().Context(), templateID)
	if err != nil {
		if errors.Is(err, inspection.ErrTemplateNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "模板不存在")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, fmt.Sprintf("failed to get template: %v", err))
	}

	return inspectionOK(c, buildTemplateResponse(template))
}

// CreateTemplate 处理 POST /api/v1/templates 请求
func (h InspectionHandler) CreateTemplate(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "inspection service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "inspections:create"); err != nil {
		return err
	}

	// 解析请求体
	var req map[string]interface{}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}

	// 从请求构建模板对象
	template, err := buildTemplateFromRequest(req)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	// 创建模板
	if err := h.Service.Create(c.Request().Context(), template); err != nil {
		if validationErr, ok := err.(*inspection.ValidationError); ok {
			return echo.NewHTTPError(http.StatusBadRequest, validationErr.Message)
		}
		return echo.NewHTTPError(http.StatusInternalServerError, fmt.Sprintf("failed to create template: %v", err))
	}

	return inspectionOKWithCode(c, http.StatusCreated, "创建模板成功", buildTemplateResponse(template))
}

// UpdateTemplate 处理 PUT /api/v1/templates/:id 请求
func (h InspectionHandler) UpdateTemplate(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "inspection service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "inspections:update"); err != nil {
		return err
	}

	templateID, err := parseIDParam(c, "id")
	if err != nil {
		return err
	}

	// 解析请求体
	var req map[string]interface{}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}

	// 从请求构建模板对象
	template, err := buildTemplateFromRequest(req)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	// 更新模板
	if err := h.Service.Update(c.Request().Context(), templateID, template); err != nil {
		if errors.Is(err, inspection.ErrTemplateNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "模板不存在")
		}
		if errors.Is(err, inspection.ErrCannotModifyBuiltInTemplate) {
			return echo.NewHTTPError(http.StatusForbidden, "不能修改内置模板")
		}
		if validationErr, ok := err.(*inspection.ValidationError); ok {
			return echo.NewHTTPError(http.StatusBadRequest, validationErr.Message)
		}
		return echo.NewHTTPError(http.StatusInternalServerError, fmt.Sprintf("failed to update template: %v", err))
	}

	// 获取更新后的模板
	updated, err := h.Service.GetByID(c.Request().Context(), templateID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to get updated template")
	}

	return inspectionOK(c, buildTemplateResponse(updated))
}

// DeleteTemplate 处理 DELETE /api/v1/templates/:id 请求
func (h InspectionHandler) DeleteTemplate(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "inspection service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "inspections:delete"); err != nil {
		return err
	}

	templateID, err := parseIDParam(c, "id")
	if err != nil {
		return err
	}

	if err := h.Service.Delete(c.Request().Context(), templateID); err != nil {
		if errors.Is(err, inspection.ErrTemplateNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "模板不存在")
		}
		if errors.Is(err, inspection.ErrCannotDeleteBuiltInTemplate) {
			return echo.NewHTTPError(http.StatusForbidden, "不能删除内置模板")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, fmt.Sprintf("failed to delete template: %v", err))
	}

	return inspectionOKWithMessage(c, "模板已删除", map[string]interface{}{"id": templateID})
}

// CopyTemplate 处理 POST /api/v1/templates/:id/copy 请求
func (h InspectionHandler) CopyTemplate(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "inspection service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "inspections:create"); err != nil {
		return err
	}

	templateID, err := parseIDParam(c, "id")
	if err != nil {
		return err
	}

	// 解析请求体获取可选的新名称
	var req map[string]interface{}
	_ = c.Bind(&req)
	newName := readString(req, "name")

	// 复制模板
	copied, err := h.Service.Copy(c.Request().Context(), templateID, newName)
	if err != nil {
		if errors.Is(err, inspection.ErrTemplateNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "模板不存在")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, fmt.Sprintf("failed to copy template: %v", err))
	}

	return inspectionOKWithCode(c, http.StatusCreated, "复制模板成功", buildTemplateResponse(copied))
}

// ExportTemplate 处理 GET /api/v1/templates/:id/export 请求
func (h InspectionHandler) ExportTemplate(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "inspection service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "inspections:read"); err != nil {
		return err
	}

	templateID, err := parseIDParam(c, "id")
	if err != nil {
		return err
	}

	// 导出模板
	data, err := h.Service.Export(c.Request().Context(), templateID)
	if err != nil {
		if errors.Is(err, inspection.ErrTemplateNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "模板不存在")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, fmt.Sprintf("failed to export template: %v", err))
	}

	// 获取模板名称用于文件名
	template, _ := h.Service.GetByID(c.Request().Context(), templateID)
	filename := fmt.Sprintf("template_%d.json", templateID)
	if template != nil {
		filename = fmt.Sprintf("%s.json", strings.ReplaceAll(template.Name, " ", "_"))
	}

	// 设置文件下载响应头
	c.Response().Header().Set("Content-Type", "application/json")
	c.Response().Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%s", filename))

	return c.Blob(http.StatusOK, "application/json", data)
}

// ImportTemplate 处理 POST /api/v1/templates/import 请求
func (h InspectionHandler) ImportTemplate(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "inspection service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "inspections:create"); err != nil {
		return err
	}

	// 从 multipart 表单获取文件
	file, err := c.FormFile("file")
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "file is required")
	}

	// 打开文件
	src, err := file.Open()
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "failed to open file")
	}
	defer src.Close()

	// 读取文件内容
	data, err := json.NewDecoder(src).Token()
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid JSON file")
	}

	// 重新正确读取文件
	src.Close()
	src, _ = file.Open()
	var buf []byte
	buf, err = json.Marshal(data)
	if err != nil {
		// 改为读取原始字节
		src.Close()
		src, _ = file.Open()
		buf = make([]byte, file.Size)
		_, err = src.Read(buf)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, "failed to read file")
		}
	}

	// 解析覆盖参数
	overwrite := false
	if overwriteStr := c.FormValue("overwrite"); overwriteStr != "" {
		overwrite, _ = strconv.ParseBool(overwriteStr)
	}

	// 导入模板
	imported, err := h.Service.Import(c.Request().Context(), buf, overwrite)
	if err != nil {
		if validationErr, ok := err.(*inspection.ValidationError); ok {
			return echo.NewHTTPError(http.StatusBadRequest, validationErr.Message)
		}
		return echo.NewHTTPError(http.StatusInternalServerError, fmt.Sprintf("failed to import template: %v", err))
	}

	return inspectionOKWithCode(c, http.StatusCreated, "导入模板成功", buildTemplateResponse(imported))
}

// TestOID 处理 POST /api/v1/templates/test-oid 请求
func (h InspectionHandler) TestOID(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "inspection service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "inspections:read"); err != nil {
		return err
	}

	// 解析请求体
	var req map[string]interface{}
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid request body")
	}

	deviceID, _ := readInt(req, "device_id", "deviceId")
	oid := readString(req, "oid")

	if deviceID <= 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "device_id is required")
	}
	if strings.TrimSpace(oid) == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "oid is required")
	}

	// TODO: 实现 OID 测试服务
	// 目前返回占位响应
	return inspectionOK(c, map[string]interface{}{
		"success": false,
		"message": "OID 测试服务尚未实现",
		"value":   nil,
		"type":    nil,
	})
}

func (h InspectionHandler) ListStrategies(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "inspection service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "inspections:read"); err != nil {
		return err
	}

	skip := parseIntWithDefault(c.QueryParam("skip"), 0)
	limit := parseIntWithDefault(c.QueryParam("limit"), 20)

	var strategyType *string
	if value := strings.TrimSpace(c.QueryParam("type")); value != "" {
		strategyType = &value
	}

	var enabled *bool
	if value := strings.TrimSpace(c.QueryParam("enabled")); value != "" {
		if parsed, err := strconv.ParseBool(value); err == nil {
			enabled = &parsed
		}
	}

	items, total, err := h.Service.ListStrategies(c.Request().Context(), strategyType, enabled, skip, limit)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load strategies")
	}

	result := make([]map[string]interface{}, 0, len(items))
	for _, item := range items {
		result = append(result, buildStrategyResponse(item))
	}

	return inspectionOK(c, map[string]interface{}{
		"items": result,
		"total": total,
		"pages": calcPages(total, limit),
	})
}

func (h InspectionHandler) GetStrategy(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "inspection service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "inspections:read"); err != nil {
		return err
	}

	strategyID, err := parseIDParam(c, "id")
	if err != nil {
		return err
	}

	item, err := h.Service.GetStrategy(c.Request().Context(), strategyID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "巡检策略不存在")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load strategy")
	}

	return inspectionOK(c, buildStrategyResponse(item))
}

func (h InspectionHandler) CreateStrategy(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "inspection service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "inspections:create"); err != nil {
		return err
	}

	payload := map[string]interface{}{}
	if err := c.Bind(&payload); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	name := readString(payload, "name")
	if name == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "name is required")
	}

	description, _ := readOptionalString(payload, "description")
	strategyType := readString(payload, "type")
	cron, _ := readOptionalString(payload, "cron")
	devices := readIntSlice(payload, "devices", "device_ids", "deviceIds")
	templates := readIntSlice(payload, "templates", "template_ids", "templateIds")

	enabled, ok := readBool(payload, "enabled")
	if !ok {
		enabled = true
	}

	item, err := h.Service.CreateStrategy(c.Request().Context(), inspection.StrategyPayload{
		Name:        name,
		Description: description,
		Type:        strategyType,
		Cron:        cron,
		Devices:     devices,
		Templates:   templates,
		Enabled:     enabled,
	})
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to create strategy")
	}

	return inspectionOKWithCode(c, http.StatusCreated, "创建策略成功", buildStrategyResponse(item))
}

func (h InspectionHandler) UpdateStrategy(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "inspection service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "inspections:update"); err != nil {
		return err
	}

	strategyID, err := parseIDParam(c, "id")
	if err != nil {
		return err
	}

	payload := map[string]interface{}{}
	if err := c.Bind(&payload); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	update := inspection.StrategyUpdate{}
	if value, ok := readOptionalString(payload, "name"); ok {
		update.Name = value
	}
	if value, ok := readOptionalString(payload, "description"); ok {
		update.Description = value
	}
	if value, ok := readOptionalString(payload, "type"); ok {
		update.Type = value
	}
	if value, ok := readOptionalString(payload, "cron"); ok {
		update.Cron = value
	}
	if value, ok := readOptionalIntSlice(payload, "devices", "device_ids", "deviceIds"); ok {
		update.Devices = &value
	}
	if value, ok := readOptionalIntSlice(payload, "templates", "template_ids", "templateIds"); ok {
		update.Templates = &value
	}
	if value, ok := readBool(payload, "enabled"); ok {
		update.Enabled = &value
	}

	item, err := h.Service.UpdateStrategy(c.Request().Context(), strategyID, update)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "巡检策略不存在")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to update strategy")
	}

	return inspectionOK(c, buildStrategyResponse(item))
}

func (h InspectionHandler) DeleteStrategy(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "inspection service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "inspections:delete"); err != nil {
		return err
	}

	strategyID, err := parseIDParam(c, "id")
	if err != nil {
		return err
	}

	if err := h.Service.DeleteStrategy(c.Request().Context(), strategyID); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "巡检策略不存在")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to delete strategy")
	}

	return inspectionOKWithMessage(c, "巡检策略已删除", map[string]interface{}{"id": strategyID})
}

func (h InspectionHandler) ToggleStrategy(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "inspection service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "inspections:update"); err != nil {
		return err
	}

	strategyID, err := parseIDParam(c, "id")
	if err != nil {
		return err
	}

	item, err := h.Service.ToggleStrategy(c.Request().Context(), strategyID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "巡检策略不存在")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to toggle strategy")
	}

	return inspectionOKWithMessage(c, "策略状态已更新", buildStrategyResponse(item))
}

func (h InspectionHandler) TriggerStrategy(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "inspection service not configured")
	}
	user, err := requirePermission(c, h.Auth, "inspections:execute")
	if err != nil {
		return err
	}

	strategyID, err := parseIDParam(c, "id")
	if err != nil {
		return err
	}

	strategy, err := h.Service.GetStrategy(c.Request().Context(), strategyID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "巡检策略不存在")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load strategy")
	}

	deviceIDs := decodeJSONIntSlice(strategy.Devices)
	if len(deviceIDs) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "策略未配置设备")
	}

	templates := decodeJSONIntSlice(strategy.Templates)
	var templateID *int
	if len(templates) > 0 {
		templateID = &templates[0]
	}

	createdBy := ""
	if user != nil {
		createdBy = user.ID
	}
	name := fmt.Sprintf("%s 手动触发", strategy.Name)

	// 注意：手动触发的巡检不关联 schedule_id，因为 schedule_id 外键引用的是 inspection_schedules 表
	// 而不是 inspection_strategies 表
	inspections, err := h.Service.CreateInspections(c.Request().Context(), inspection.CreateInspectionInput{
		Name:       name,
		TemplateID: templateID,
		ScheduleID: nil, // 手动触发不关联计划
		DeviceIDs:  deviceIDs,
		Trigger:    inspection.TriggerManual,
		CreatedBy:  stringPtr(createdBy),
	})
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to trigger strategy")
	}

	ids := make([]int, 0, len(inspections))
	for _, item := range inspections {
		ids = append(ids, item.ID)
	}

	// 异步执行巡检任务
	go h.executeInspectionsAsync(inspections, templateID)

	return inspectionOKWithMessage(c, "触发策略执行成功", map[string]interface{}{
		"message":        "触发成功，巡检任务已开始执行",
		"inspection_ids": ids,
	})
}

// executeInspectionsAsync 异步执行巡检任务
func (h InspectionHandler) executeInspectionsAsync(inspections []inspection.Inspection, templateID *int) {
	ctx := context.Background()

	// 获取模板检查项
	var checkItems []map[string]interface{}
	if templateID != nil {
		template, err := h.Service.GetTemplate(ctx, *templateID)
		if err == nil {
			checkItems = decodeJSONMapSlice(template.CheckItems)
		}
	}

	for _, insp := range inspections {
		h.executeInspection(ctx, insp, checkItems)
	}
}

// executeInspection 执行单个巡检任务
func (h InspectionHandler) executeInspection(ctx context.Context, insp inspection.Inspection, checkItems []map[string]interface{}) {
	// 1. 更新状态为 running
	_, err := h.Service.UpdateInspectionStatus(ctx, insp.ID, inspection.StatusRunning, nil)
	if err != nil {
		if h.Logger != nil {
			h.Logger.Error("failed to update inspection status to running", zap.Int("inspection_id", insp.ID), zap.Error(err))
		}
		return
	}

	// 2. 获取设备信息
	var device *devices.DeviceResponse
	if h.DeviceService != nil {
		device, err = h.DeviceService.GetDeviceByID(ctx, insp.DeviceID)
		if err != nil {
			errMsg := fmt.Sprintf("获取设备信息失败: %v", err)
			h.Service.UpdateInspectionStatus(ctx, insp.ID, inspection.StatusFailed, &errMsg)
			return
		}
	}

	// 3. 执行探测检查
	var probeResult *devices.ProbeResult
	if h.ProbeService != nil && device != nil {
		result, err := h.ProbeService.ProbeDevice(
			ctx,
			device.ID,
			device.IPAddress,
			device.SnmpCommunity,
			device.SnmpVersion,
			device.SnmpPort,
			nil,
			false,
		)
		if err == nil {
			probeResult = &result
		}
	}

	// 4. 执行检查项并生成结果
	results := h.executeCheckItems(ctx, insp.ID, device, probeResult, checkItems)

	// 5. 保存结果
	passedCount := 0
	failedCount := 0
	warningCount := 0
	skippedCount := 0

	for _, result := range results {
		if err := h.Service.SaveInspectionResult(ctx, &result); err != nil {
			if h.Logger != nil {
				h.Logger.Error("failed to save inspection result", zap.Int("inspection_id", insp.ID), zap.Error(err))
			}
		}

		switch result.Status {
		case "pass":
			passedCount++
		case "fail":
			failedCount++
		case "warning":
			warningCount++
		case "skip":
			skippedCount++
		}
	}

	// 6. 更新巡检统计并完成
	h.Service.UpdateInspectionStats(ctx, insp.ID, len(results), passedCount, failedCount, warningCount, skippedCount)
	h.Service.UpdateInspectionStatus(ctx, insp.ID, inspection.StatusCompleted, nil)
}

// executeCheckItems 执行检查项
func (h InspectionHandler) executeCheckItems(ctx context.Context, inspectionID int, device *devices.DeviceResponse, probeResult *devices.ProbeResult, checkItems []map[string]interface{}) []inspection.Result {
	results := make([]inspection.Result, 0)
	now := time.Now().UTC()

	// 如果没有检查项，创建默认的连通性检查
	if len(checkItems) == 0 {
		checkItems = []map[string]interface{}{
			{
				"name":     "ICMP连通性检查",
				"type":     "icmp",
				"category": "connectivity",
			},
			{
				"name":     "SNMP连通性检查",
				"type":     "snmp",
				"category": "connectivity",
			},
		}
	}

	for _, item := range checkItems {
		itemName := readString(item, "name")
		itemType := readString(item, "type")
		itemCategory := readString(item, "category")

		result := inspection.Result{
			InspectionID:      inspectionID,
			CheckItemName:     itemName,
			CheckItemType:     itemType,
			CheckItemCategory: stringPtr(itemCategory),
			StartTime:         &now,
			CreatedAt:         &now,
		}

		// 根据检查类型执行检查
		switch strings.ToLower(itemType) {
		case "icmp", "ping":
			h.executeICMPCheck(&result, probeResult)
		case "snmp":
			h.executeSNMPCheck(&result, probeResult, item)
		default:
			// 其他类型暂时跳过
			result.Status = "skip"
			result.Message = stringPtr("检查类型暂不支持")
		}

		endTime := time.Now().UTC()
		result.EndTime = &endTime
		execTime := int(endTime.Sub(now).Milliseconds())
		result.ExecutionTime = &execTime

		results = append(results, result)
	}

	return results
}

// executeICMPCheck 执行 ICMP 检查
func (h InspectionHandler) executeICMPCheck(result *inspection.Result, probeResult *devices.ProbeResult) {
	if probeResult == nil {
		result.Status = "skip"
		result.Message = stringPtr("无法执行探测")
		return
	}

	if probeResult.IcmpReachable {
		result.Status = "pass"
		result.Message = stringPtr("设备ICMP可达")
		if probeResult.IcmpResponseTime != nil {
			responseTime := fmt.Sprintf("%.2fms", *probeResult.IcmpResponseTime)
			result.ActualValue = &responseTime
		}
	} else {
		result.Status = "fail"
		result.Message = stringPtr("设备ICMP不可达")
		if probeResult.IcmpError != nil {
			result.ErrorMessage = probeResult.IcmpError
		}
	}
}

// executeSNMPCheck 执行 SNMP 检查
func (h InspectionHandler) executeSNMPCheck(result *inspection.Result, probeResult *devices.ProbeResult, checkItem map[string]interface{}) {
	if probeResult == nil {
		result.Status = "skip"
		result.Message = stringPtr("无法执行探测")
		return
	}

	if probeResult.SnmpReachable {
		result.Status = "pass"
		result.Message = stringPtr("SNMP服务正常")
		if probeResult.SnmpSystemInfo != nil {
			result.ActualValue = probeResult.SnmpSystemInfo
		}
		if probeResult.SnmpResponseTime != nil {
			responseTime := fmt.Sprintf("%.2fms", *probeResult.SnmpResponseTime)
			result.ExpectedValue = &responseTime
		}
	} else {
		result.Status = "fail"
		result.Message = stringPtr("SNMP服务不可达")
		if probeResult.SnmpError != nil {
			result.ErrorMessage = probeResult.SnmpError
		}
	}
}

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

	if _, err := h.Service.UpdateInspectionStatus(c.Request().Context(), taskID, inspection.StatusRunning, nil); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "巡检任务不存在")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to start inspection")
	}

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
	if startDate != nil {
		query = query.Where("started_at >= ?", *startDate)
	}
	if endDate != nil {
		query = query.Where("started_at < ?", endDate.Add(24*time.Hour))
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to count executions")
	}

	offset := (page - 1) * pageSize
	rows := make([]inspection.Inspection, 0)
	if err := query.
		Order("COALESCE(started_at, created_at) DESC").
		Offset(offset).
		Limit(pageSize).
		Find(&rows).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load executions")
	}

	strategyNames := h.loadStrategyNames(c.Request().Context(), rows)

	items := make([]map[string]interface{}, 0, len(rows))
	for _, item := range rows {
		strategyName := resolveStrategyName(strategyNames, item.ScheduleID, item.Name)
		items = append(items, buildExecutionResponse(item, strategyName))
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
	results, _ := h.Service.ListResultsByInspectionID(c.Request().Context(), item.ID)
	deviceInfo := h.loadDeviceInfo(c.Request().Context(), item.DeviceID)

	strategyName := resolveStrategyName(strategyNames, item.ScheduleID, item.Name)
	response := buildExecutionResponse(item, strategyName)
	response["summary"] = buildExecutionSummary(item, deviceInfo, results)

	return inspectionOK(c, response)
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

func (h InspectionHandler) GetStats(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "inspection service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "inspections:read"); err != nil {
		return err
	}

	db := h.Service.DB()
	if db == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "database not initialized")
	}

	var totalStrategies int64
	_ = db.WithContext(c.Request().Context()).
		Table("inspection_strategies").
		Count(&totalStrategies).Error

	var activeStrategies int64
	_ = db.WithContext(c.Request().Context()).
		Table("inspection_strategies").
		Where("enabled = ?", true).
		Count(&activeStrategies).Error

	start, end := resolveStatsRange(c.QueryParam("range"))
	previousStart := start.Add(start.Sub(end))
	previousEnd := start

	current := computeStatsSummary(c.Request().Context(), db, start, end)
	previous := computeStatsSummary(c.Request().Context(), db, previousStart, previousEnd)

	data := map[string]interface{}{
		"totalStrategies":  int(totalStrategies),
		"activeStrategies": int(activeStrategies),
		"todayExecutions":  current.TotalExecutions,
		"successRate":      current.SuccessRate,
		"avgScore":         current.AvgScore,
		"changes": map[string]interface{}{
			"executionsChange": pctChange(current.TotalExecutions, previous.TotalExecutions),
			"successRateChange": deltaChange(current.SuccessRate, previous.SuccessRate),
			"avgScoreChange":    deltaChange(current.AvgScore, previous.AvgScore),
			"strategiesChange":  "0.0%",
		},
		"recentExecutions": []interface{}{},
	}

	return inspectionOK(c, data)
}

func (h InspectionHandler) GetTrends(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "inspection service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "inspections:read"); err != nil {
		return err
	}

	period := strings.TrimSpace(c.QueryParam("period"))
	if period == "" {
		period = "week"
	}
	startDate, _ := parseOptionalDate(c.QueryParam("start_date"))
	endDate, _ := parseOptionalDate(c.QueryParam("end_date"))

	start, end := resolveTrendRange(period, startDate, endDate)

	db := h.Service.DB()
	if db == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "database not initialized")
	}

	type trendRow struct {
		Date       time.Time `gorm:"column:date"`
		Executions int       `gorm:"column:executions"`
		Success    int       `gorm:"column:success"`
		Failed     int       `gorm:"column:failed"`
		AvgScore   float64   `gorm:"column:avg_score"`
	}

	dateExpr := "date_trunc('week', created_at)"
	switch period {
	case "day":
		dateExpr = "date_trunc('day', created_at)"
	case "month":
		dateExpr = "date_trunc('month', created_at)"
	}

	rows := make([]trendRow, 0)
	if err := db.WithContext(c.Request().Context()).
		Table("inspections").
		Select(fmt.Sprintf("%s AS date, COUNT(*) AS executions, SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS success, SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed, AVG(CASE WHEN total_checks > 0 THEN passed_checks::float / total_checks * 100 ELSE NULL END) AS avg_score", dateExpr)).
		Where("created_at >= ? AND created_at <= ?", start, end).
		Group("date").
		Order("date").
		Scan(&rows).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load trend data")
	}

	payload := make([]map[string]interface{}, 0, len(rows))
	for _, row := range rows {
		payload = append(payload, map[string]interface{}{
			"date":       row.Date.Format(time.RFC3339),
			"executions": row.Executions,
			"success":    row.Success,
			"failed":     row.Failed,
			"avgScore":   roundFloat(row.AvgScore, 1),
		})
	}

	return inspectionOK(c, payload)
}

func (h InspectionHandler) GetDeviceDistribution(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "inspection service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "inspections:read"); err != nil {
		return err
	}

	db := h.Service.DB()
	if db == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "database not initialized")
	}

	type typeRow struct {
		Type  string `gorm:"column:device_type"`
		Count int    `gorm:"column:count"`
	}
	rows := make([]typeRow, 0)
	if err := db.WithContext(c.Request().Context()).
		Table("devices").
		Select("device_type, COUNT(*) AS count").
		Group("device_type").
		Scan(&rows).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load device distribution")
	}

	colors := []string{"#5470C6", "#91CC75", "#FAC858", "#EE6666", "#73C0DE", "#3BA272", "#FC8452", "#9A60B4", "#EA7CCC"}
	payload := make([]map[string]interface{}, 0, len(rows))
	for i, row := range rows {
		name := strings.TrimSpace(row.Type)
		if name == "" {
			continue
		}
		color := colors[i%len(colors)]
		payload = append(payload, map[string]interface{}{
			"name":  name,
			"value": row.Count,
			"color": color,
		})
	}

	return inspectionOK(c, payload)
}

func (h InspectionHandler) GetProblemDistribution(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "inspection service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "inspections:read"); err != nil {
		return err
	}

	db := h.Service.DB()
	if db == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "database not initialized")
	}

	type row struct {
		Category string `gorm:"column:category"`
		Count    int    `gorm:"column:count"`
	}
	rows := make([]row, 0)
	if err := db.WithContext(c.Request().Context()).
		Table("inspection_results").
		Select("check_item_type AS category, COUNT(*) AS count").
		Where("status IN ?", []string{"fail", "warning"}).
		Group("check_item_type").
		Order("COUNT(*) DESC").
		Scan(&rows).Error; err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load problem distribution")
	}

	categoryNames := map[string]string{
		"connectivity":  "网络连通性",
		"cpu_usage":     "CPU使用率",
		"memory_usage":  "内存使用率",
		"disk_usage":    "磁盘空间",
		"interface_status": "端口状态",
		"temperature":   "温度告警",
		"snmp":          "SNMP检查",
		"ssh":           "SSH检查",
		"http":          "HTTP检查",
		"ping":          "Ping检查",
		"script":        "脚本检查",
	}

	payload := make([]map[string]interface{}, 0, len(rows))
	for _, item := range rows {
		label := categoryNames[item.Category]
		if label == "" {
			label = item.Category
		}
		if strings.TrimSpace(label) == "" {
			label = "其他"
		}
		payload = append(payload, map[string]interface{}{
			"category": label,
			"count":    item.Count,
		})
	}

	return inspectionOK(c, payload)
}

func (h InspectionHandler) ExportAnalytics(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "inspection service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "inspections:read"); err != nil {
		return err
	}
	if h.Reports == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}
	if strings.TrimSpace(h.ReportOutputDir) == "" {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report output not configured")
	}

	period := strings.TrimSpace(c.QueryParam("period"))
	if period == "" {
		period = "week"
	}
	startDate, _ := parseOptionalDate(c.QueryParam("start_date"))
	endDate, _ := parseOptionalDate(c.QueryParam("end_date"))
	start, end := resolveTrendRange(period, startDate, endDate)

	format := strings.ToLower(strings.TrimSpace(c.QueryParam("format_type")))
	if format == "" {
		format = "excel"
	}

	params := map[string]interface{}{
		"dateRange": map[string]interface{}{
			"startDate": start.Format(time.RFC3339),
			"endDate":   end.Format(time.RFC3339),
		},
	}
	paramsJSON, _ := encodeJSON(params)

	report := reports.Report{
		ID:          int(time.Now().Unix()),
		Title:       "统计分析报告",
		ReportType:  "statistics",
		StartDate:   start,
		EndDate:     end,
		DeviceFilters: paramsJSON,
		Status:      "completed",
	}

	filePath, err := reports.GenerateReportFile(c.Request().Context(), h.Reports.DB(), h.ReportOutputDir, report, format)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to export analytics")
	}

	filename := filepath.Base(filePath)
	contentType := reportContentType(filepath.Ext(filename))
	c.Response().Header().Set(echo.HeaderContentType, contentType)
	c.Response().Header().Set(echo.HeaderContentDisposition, fmt.Sprintf("attachment; filename=\"%s\"", filename))
	return c.File(filePath)
}

func (h InspectionHandler) GenerateInspectionReport(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "inspection service not configured")
	}
	if h.Reports == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}
	if strings.TrimSpace(h.ReportOutputDir) == "" {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report output not configured")
	}
	if _, err := requirePermission(c, h.Auth, "inspections:read"); err != nil {
		return err
	}

	payload := map[string]interface{}{}
	if err := c.Bind(&payload); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	taskID, _ := readOptionalInt(payload, "task_id", "taskId")
	deviceIDs := readIntSlice(payload, "device_ids", "deviceIds")
	startDate, _ := readOptionalString(payload, "start_date", "startDate")
	endDate, _ := readOptionalString(payload, "end_date", "endDate")
	format := readString(payload, "format")
	if format == "" {
		format = "pdf"
	}

	start, _ := parseTimeOptional(stringValue(startDate))
	end, _ := parseTimeOptional(stringValue(endDate))
	if start == nil || end == nil {
		now := time.Now().UTC()
		start = ptrTime(now.Add(-24 * time.Hour))
		end = ptrTime(now)
	}

	params := map[string]interface{}{
		"dateRange": map[string]interface{}{
			"startDate": start.Format(time.RFC3339),
			"endDate":   end.Format(time.RFC3339),
		},
	}
	if taskID != nil {
		params["task_id"] = *taskID
	}
	if len(deviceIDs) > 0 {
		params["device_ids"] = deviceIDs
	}
	paramsJSON, _ := encodeJSON(params)

	report := reports.Report{
		Title:         "巡检报告",
		ReportType:    "inspection",
		StartDate:     *start,
		EndDate:       *end,
		DeviceFilters: paramsJSON,
		Status:        "generating",
	}

	if err := h.Reports.CreateReport(c.Request().Context(), &report); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to create report")
	}

	filePath, err := reports.GenerateReportFile(c.Request().Context(), h.Reports.DB(), h.ReportOutputDir, report, format)
	if err != nil {
		_, _ = h.Reports.UpdateReport(c.Request().Context(), report.ID, map[string]interface{}{
			"status":        "failed",
			"error_message": err.Error(),
		})
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to generate report")
	}

	fileFormats, _ := encodeJSON([]string{format})
	filePaths, _ := encodeJSON(map[string]string{format: filePath})

	var fileSize int64
	if info, err := os.Stat(filePath); err == nil {
		fileSize = info.Size()
	}
	fileSizes, _ := encodeJSON(map[string]int64{format: fileSize})

	_, _ = h.Reports.UpdateReport(c.Request().Context(), report.ID, map[string]interface{}{
		"status":       "completed",
		"generated_at": time.Now().UTC(),
		"file_formats": fileFormats,
		"file_paths":   filePaths,
		"file_sizes":   fileSizes,
	})

	downloadURL := buildReportsDownloadURL(filepath.Base(filePath))
	return inspectionOK(c, map[string]interface{}{
		"report_id":    fmt.Sprintf("%d", report.ID),
		"download_url": downloadURL,
	})
}

func (h InspectionHandler) GetInspectionReportStatus(c echo.Context) error {
	if h.Reports == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "inspections:read"); err != nil {
		return err
	}

	reportID, err := parseIDParam(c, "id")
	if err != nil {
		return err
	}

	report, err := h.Reports.GetReport(c.Request().Context(), reportID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "报告不存在")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load report")
	}

	progress := 0
	switch report.Status {
	case "completed":
		progress = 100
	case "generating":
		progress = 50
	case "failed":
		progress = 0
	}

	downloadURL := ""
	if report.Status == "completed" {
		if filePath := resolveReportFilePath(report); filePath != "" {
			downloadURL = buildReportsDownloadURL(filepath.Base(filePath))
		}
	}

	return inspectionOK(c, map[string]interface{}{
		"status":       report.Status,
		"progress":     progress,
		"download_url": downloadURL,
	})
}

func (h InspectionHandler) GetInspectionReportDownload(c echo.Context) error {
	if h.Reports == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}
	if _, err := requirePermission(c, h.Auth, "inspections:read"); err != nil {
		return err
	}

	reportID, err := parseIDParam(c, "id")
	if err != nil {
		return err
	}

	report, err := h.Reports.GetReport(c.Request().Context(), reportID)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "报告不存在")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load report")
	}

	filePath := resolveReportFilePath(report)
	if filePath == "" {
		return echo.NewHTTPError(http.StatusNotFound, "报告文件不存在")
	}

	downloadURL := buildReportsDownloadURL(filepath.Base(filePath))
	return inspectionOK(c, map[string]interface{}{
		"download_url": downloadURL,
	})
}

type statsSummary struct {
	TotalExecutions int
	SuccessRate     float64
	AvgScore        float64
}

type deviceInfo struct {
	ID         int
	Name       string
	DeviceType string
	IPAddress  string
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
	return map[string]interface{}{
		"check_item_id":   fmt.Sprintf("%d", result.ID),
		"check_item_name": result.CheckItemName,
		"check_item_type": result.CheckItemType,
		"status":          normalizeCheckResultStatus(result.Status),
		"actual_value":    result.ActualValue,
		"expected_value":  result.ExpectedValue,
		"message":         result.Message,
		"execution_time":  result.ExecutionTime,
	}
}

func buildExecutionResponse(item inspection.Inspection, strategyName string) map[string]interface{} {
	progress := computeProgress(item)
	totalChecks := resolveTotalChecks(item, nil)
	score := computeScore(totalChecks, resolvePassedChecks(item, nil))

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
			"passedChecks":  resolvePassedChecks(item, nil),
			"failedChecks":  resolveFailedChecks(item, nil),
			"warningChecks": resolveWarningChecks(item, nil),
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
	score := computeScore(totalChecks, passed)
	status := deriveDeviceStatus(item, passed, failed, warning)

	checkResults := buildCheckResults(results)
	deviceResults := []interface{}{}
	if device.ID > 0 {
		deviceResults = append(deviceResults, map[string]interface{}{
			"deviceId":       fmt.Sprintf("%d", device.ID),
			"deviceName":     defaultString(device.Name, "未知设备"),
			"deviceType":     device.DeviceType,
			"status":         status,
			"score":          score,
			"checkResults":   checkResults,
			"executionTime":  defaultIntPtr(item.Duration),
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
	score := computeScore(totalChecks, passed)
	status := deriveDeviceStatus(item, passed, failed, warning)

	checkResults := buildCheckResults(results)
	summary := fmt.Sprintf("Passed %d, Failed %d, Warning %d", passed, failed, warning)
	createdAt := coalesceTime(item.CompletedAt, item.CreatedAt)

	return map[string]interface{}{
		"id":            fmt.Sprintf("%d", item.ID),
		"task_id":       item.ID,
		"execution_id":  item.ID,
		"device_id":     item.DeviceID,
		"device_name":   defaultString(device.Name, "未知设备"),
		"status":        status,
		"score":         score,
		"total_checks":  totalChecks,
		"passed_checks": passed,
		"failed_checks": failed,
		"warning_checks": warning,
		"results":       checkResults,
		"check_results": checkResults,
		"summary":       summary,
		"created_at":    createdAt,
	}
}

func normalizeCheckResultStatus(raw string) string {
	value := strings.ToLower(strings.TrimSpace(raw))
	switch value {
	case "pass", "fail", "warning", "skip":
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

func buildResultStatusFilter(statusList []string) (string, []interface{}) {
	conditions := make([]string, 0, len(statusList))
	args := make([]interface{}, 0)
	for _, raw := range statusList {
		switch strings.ToLower(strings.TrimSpace(raw)) {
		case "success":
			conditions = append(conditions, "(status = ? AND failed_checks = 0 AND warning_checks = 0)")
			args = append(args, inspection.StatusCompleted)
		case "warning":
			conditions = append(conditions, "(status = ? AND warning_checks > 0 AND failed_checks = 0)")
			args = append(args, inspection.StatusCompleted)
		case "error":
			conditions = append(conditions, "(status IN ? OR failed_checks > 0)")
			args = append(args, []string{inspection.StatusFailed, inspection.StatusCancelled, inspection.StatusTimeout})
		case "offline":
			conditions = append(conditions, "(status IN ?)")
			args = append(args, []string{inspection.StatusPending, inspection.StatusRunning})
		}
	}
	return strings.Join(conditions, " OR "), args
}

func resolveStatsRange(value string) (time.Time, time.Time) {
	now := time.Now().UTC()
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "7d":
		return now.Add(-7 * 24 * time.Hour), now
	case "30d":
		return now.Add(-30 * 24 * time.Hour), now
	case "24h":
		return now.Add(-24 * time.Hour), now
	default:
		start := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC)
		return start, start.Add(24 * time.Hour)
	}
}

func computeStatsSummary(ctx context.Context, db *gorm.DB, start time.Time, end time.Time) statsSummary {
	if db == nil {
		return statsSummary{}
	}

	var total int64
	_ = db.WithContext(ctx).
		Table("inspections").
		Where("created_at >= ? AND created_at <= ?", start, end).
		Count(&total).Error

	var success int64
	_ = db.WithContext(ctx).
		Table("inspections").
		Where("created_at >= ? AND created_at <= ? AND status = ?", start, end, inspection.StatusCompleted).
		Count(&success).Error

	type avgRow struct {
		AvgScore float64 `gorm:"column:avg_score"`
	}
	avg := avgRow{}
	_ = db.WithContext(ctx).
		Table("inspections").
		Select("AVG(CASE WHEN total_checks > 0 THEN passed_checks::float / total_checks * 100 ELSE NULL END) AS avg_score").
		Where("created_at >= ? AND created_at <= ? AND status = ?", start, end, inspection.StatusCompleted).
		Scan(&avg).Error

	successRate := 0.0
	if total > 0 {
		successRate = float64(success) / float64(total) * 100
	}

	return statsSummary{
		TotalExecutions: int(total),
		SuccessRate:     roundFloat(successRate, 1),
		AvgScore:        roundFloat(avg.AvgScore, 1),
	}
}

func pctChange(current int, previous int) string {
	if previous == 0 {
		return "0.0%"
	}
	diff := (float64(current-previous) / float64(previous)) * 100
	return fmt.Sprintf("%+.1f%%", diff)
}

func deltaChange(current float64, previous float64) string {
	return fmt.Sprintf("%+.1f%%", current-previous)
}

func roundFloat(value float64, precision int) float64 {
	if precision <= 0 {
		return math.Round(value)
	}
	pow := math.Pow(10, float64(precision))
	return math.Round(value*pow) / pow
}

func resolveTrendRange(period string, start *time.Time, end *time.Time) (time.Time, time.Time) {
	now := time.Now().UTC()
	if end == nil {
		end = &now
	}
	if start == nil {
		switch period {
		case "day":
			value := end.Add(-24 * time.Hour)
			start = &value
		case "month":
			value := end.Add(-30 * 24 * time.Hour)
			start = &value
		default:
			value := end.Add(-7 * 24 * time.Hour)
			start = &value
		}
	}
	return *start, *end
}

func buildReportsDownloadURL(filename string) string {
	return fmt.Sprintf("/api/v1/reports/files/%s", filename)
}

func resolveReportFilePath(report reports.Report) string {
	paths := decodeJSONMap(report.FilePaths)
	if len(paths) == 0 {
		return ""
	}
	formats := decodeJSONStringSlice(report.FileFormats)
	for _, format := range formats {
		if value, ok := paths[format]; ok {
			return fmt.Sprint(value)
		}
	}
	for _, value := range paths {
		return fmt.Sprint(value)
	}
	return ""
}


// ============================================================================
// 模板 API 辅助函数
// ============================================================================

// buildTemplateResponse 构建包含所有检查项的详细模板响应
func buildTemplateResponse(template *inspection.Template) map[string]interface{} {
	if template == nil {
		return nil
	}

	// 解析设备类型 - 应为 []string
	var deviceTypes []string
	if len(template.DeviceTypes) > 0 {
		if err := json.Unmarshal(template.DeviceTypes, &deviceTypes); err != nil {
			// 回退：尝试解析为单值或其他格式
			deviceTypes = []string{}
		}
	}
	if deviceTypes == nil {
		deviceTypes = []string{}
	}

	// 解析检查项
	var checkItems []map[string]interface{}
	if len(template.CheckItems) > 0 {
		if err := json.Unmarshal(template.CheckItems, &checkItems); err != nil {
			checkItems = []map[string]interface{}{}
		}
	}
	if checkItems == nil {
		checkItems = []map[string]interface{}{}
	}

	// 统计检查项数量
	checkItemsCount := len(checkItems)

	response := map[string]interface{}{
		"id":                template.ID,
		"name":              template.Name,
		"description":       defaultStringPtr(template.Description, ""),
		"category":          defaultStringPtr(template.Category, ""),
		"deviceTypes":       deviceTypes,       // 驼峰命名供前端使用
		"device_types":      deviceTypes,       // 下划线命名保持兼容
		"checkItems":        checkItems,        // 驼峰命名供前端使用
		"check_items":       checkItems,        // 下划线命名保持兼容
		"check_items_count": checkItemsCount,
		"isBuiltIn":         template.IsDefault, // 前端使用 isBuiltIn
		"is_default":        template.IsDefault,
		"isActive":          template.IsActive,  // 前端使用 isActive
		"is_active":         template.IsActive,
		"createdAt":         template.CreatedAt,
		"created_at":        template.CreatedAt,
		"updatedAt":         firstTime(template.UpdatedAt, template.CreatedAt),
		"updated_at":        firstTime(template.UpdatedAt, template.CreatedAt),
	}

	return response
}

// buildTemplateFromRequest 从请求数据构建模板对象
func buildTemplateFromRequest(req map[string]interface{}) (*inspection.Template, error) {
	name := readString(req, "name")
	if strings.TrimSpace(name) == "" {
		return nil, fmt.Errorf("name is required")
	}

	template := &inspection.Template{
		Name: name,
	}

	// 可选字段
	if desc, ok := readOptionalString(req, "description"); ok {
		template.Description = desc
	}

	if cat, ok := readOptionalString(req, "category"); ok {
		template.Category = cat
	}

	// 设备类型 - 未提供时默认为空数组
	if deviceTypes, ok := req["device_types"]; ok && deviceTypes != nil {
		deviceTypesJSON, err := json.Marshal(deviceTypes)
		if err != nil {
			return nil, fmt.Errorf("invalid device_types format")
		}
		template.DeviceTypes = deviceTypesJSON
	} else {
		template.DeviceTypes = []byte("[]")
	}

	// 检查项 - 未提供时默认为空数组
	if checkItems, ok := req["check_items"]; ok && checkItems != nil {
		checkItemsJSON, err := json.Marshal(checkItems)
		if err != nil {
			return nil, fmt.Errorf("invalid check_items format")
		}
		template.CheckItems = checkItemsJSON
	} else {
		template.CheckItems = []byte("[]")
	}

	// 布尔字段
	if isDefault, ok := readBool(req, "is_default", "isDefault"); ok {
		template.IsDefault = isDefault
	}

	if isActive, ok := readBool(req, "is_active", "isActive"); ok {
		template.IsActive = isActive
	} else {
		template.IsActive = true // 默认为激活状态
	}

	return template, nil
}
