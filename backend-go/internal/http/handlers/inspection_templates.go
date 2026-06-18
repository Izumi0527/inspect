package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math"
	"net/http"
	"strconv"
	"strings"

	"github.com/labstack/echo/v4"

	"github.com/your-org/inspect-system/backend-go/internal/inspection"
)

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

	buf, err := io.ReadAll(src)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "failed to read file")
	}
	if !json.Valid(buf) {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid JSON file")
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

// ============================================================================
// 模板 API 辅助函数
// ============================================================================

// buildTemplateResponse 构建包含所有检查项的详细模板响应
func buildTemplateResponse(template *inspection.Template) map[string]interface{} {
	if template == nil {
		return nil
	}

	// 解析设备类型（兼容两种形态）
	// - 推荐：["router","switch"]
	// - 历史：{"vendors":[...],"device_types":[...]}
	deviceTypes := []string{}
	if len(template.DeviceTypes) > 0 {
		// 1) 优先按 []string 解析
		var types []string
		if err := json.Unmarshal(template.DeviceTypes, &types); err == nil {
			deviceTypes = types
		} else {
			// 2) 回退按对象形态解析
			var cfg inspection.DeviceTypesConfig
			if err2 := json.Unmarshal(template.DeviceTypes, &cfg); err2 == nil {
				deviceTypes = cfg.DeviceTypes
			} else {
				// 3) 最后尝试单值字符串
				var single string
				if err3 := json.Unmarshal(template.DeviceTypes, &single); err3 == nil {
					if strings.TrimSpace(single) != "" {
						deviceTypes = []string{strings.TrimSpace(single)}
					}
				}
			}
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
		"deviceTypes":       deviceTypes, // 驼峰命名供前端使用
		"device_types":      deviceTypes, // 下划线命名保持兼容
		"checkItems":        checkItems,  // 驼峰命名供前端使用
		"check_items":       checkItems,  // 下划线命名保持兼容
		"check_items_count": checkItemsCount,
		"isBuiltIn":         template.IsDefault, // 前端使用 isBuiltIn
		"is_default":        template.IsDefault,
		"isActive":          template.IsActive, // 前端使用 isActive
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
