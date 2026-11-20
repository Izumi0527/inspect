package handlers

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/labstack/echo/v4"

	"github.com/your-org/inspect-system/backend-go/internal/devices"
	"github.com/your-org/inspect-system/backend-go/internal/http/middleware"
	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
)

func parsePositiveIDParam(c echo.Context, param string) (int64, error) {
	id, err := strconv.ParseInt(strings.TrimSpace(c.Param(param)), 10, 64)
	if err != nil || id <= 0 {
		return 0, echo.NewHTTPError(http.StatusBadRequest, "invalid "+param)
	}
	return id, nil
}

func mapTemplateServiceError(err error) error {
	switch {
	case errors.Is(err, monitoring.ErrTemplateNotFound),
		errors.Is(err, monitoring.ErrTemplateItemNotFound),
		errors.Is(err, monitoring.ErrLLDRuleNotFound),
		errors.Is(err, monitoring.ErrDeviceNotFound):
		return echo.NewHTTPError(http.StatusNotFound, err.Error())
	case errors.Is(err, monitoring.ErrBuiltinTemplateImmutable):
		return echo.NewHTTPError(http.StatusForbidden, err.Error())
	case errors.Is(err, monitoring.ErrTemplateValidation),
		errors.Is(err, monitoring.ErrForbiddenTargetIP),
		errors.Is(err, monitoring.ErrInvalidTargetIP):
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	default:
		return echo.NewHTTPError(http.StatusInternalServerError, "internal monitoring template error")
	}
}

// ListMonitoringTemplates 返回全部监控方案列表。
func (h MonitoringHandler) ListMonitoringTemplates(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, monitoringReadPermission); err != nil {
		return err
	}
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}
	items, err := h.Writer.ListMonitorTemplates(c.Request().Context())
	if err != nil {
		return mapTemplateServiceError(err)
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"items": items})
}

// GetMonitoringTemplate 返回单个监控方案详情。
func (h MonitoringHandler) GetMonitoringTemplate(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, monitoringReadPermission); err != nil {
		return err
	}
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}
	id, err := parsePositiveIDParam(c, "id")
	if err != nil {
		return err
	}
	tpl, err := h.Writer.GetMonitorTemplate(c.Request().Context(), id)
	if err != nil {
		return mapTemplateServiceError(err)
	}
	return c.JSON(http.StatusOK, tpl)
}

// CreateMonitoringTemplate 创建自定义监控方案。
func (h MonitoringHandler) CreateMonitoringTemplate(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, monitoringControlPermission); err != nil {
		return err
	}
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}
	var req monitoring.CreateTemplateInput
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}
	tpl, err := h.Writer.CreateMonitorTemplate(c.Request().Context(), req)
	if err != nil {
		return mapTemplateServiceError(err)
	}
	middleware.SetAuditDetails(c, map[string]interface{}{
		"template_id": tpl.ID,
		"code":        tpl.Code,
		"name":        tpl.Name,
	})
	return c.JSON(http.StatusCreated, tpl)
}

// UpdateMonitoringTemplate 更新自定义监控方案。
func (h MonitoringHandler) UpdateMonitoringTemplate(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, monitoringControlPermission); err != nil {
		return err
	}
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}
	id, err := parsePositiveIDParam(c, "id")
	if err != nil {
		return err
	}
	var req monitoring.CreateTemplateInput
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}
	tpl, err := h.Writer.UpdateMonitorTemplate(c.Request().Context(), id, req)
	if err != nil {
		return mapTemplateServiceError(err)
	}
	middleware.SetAuditDetails(c, map[string]interface{}{
		"template_id": tpl.ID,
		"name":        tpl.Name,
	})
	return c.JSON(http.StatusOK, tpl)
}

// DeleteMonitoringTemplate 删除自定义监控方案。
func (h MonitoringHandler) DeleteMonitoringTemplate(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, monitoringControlPermission); err != nil {
		return err
	}
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}
	id, err := parsePositiveIDParam(c, "id")
	if err != nil {
		return err
	}
	if err := h.Writer.DeleteMonitorTemplate(c.Request().Context(), id); err != nil {
		return mapTemplateServiceError(err)
	}
	middleware.SetAuditDetails(c, map[string]interface{}{
		"template_id": id,
		"deleted":     true,
	})
	return c.JSON(http.StatusOK, map[string]interface{}{"success": true})
}

// CloneMonitoringTemplate 克隆监控方案（含内置方案）为可编辑副本。
func (h MonitoringHandler) CloneMonitoringTemplate(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, monitoringControlPermission); err != nil {
		return err
	}
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}
	id, err := parsePositiveIDParam(c, "id")
	if err != nil {
		return err
	}
	var req struct {
		Name string `json:"name"`
	}
	_ = c.Bind(&req)
	cloned, err := h.Writer.CloneMonitorTemplate(c.Request().Context(), id, req.Name)
	if err != nil {
		return mapTemplateServiceError(err)
	}
	middleware.SetAuditDetails(c, map[string]interface{}{
		"source_template_id": id,
		"cloned_template_id": cloned.ID,
		"name":               cloned.Name,
	})
	return c.JSON(http.StatusCreated, cloned)
}

// UpdateMonitoringTemplateBindings 更新监控方案的设备组绑定与单台设备绑定/微调。
func (h MonitoringHandler) UpdateMonitoringTemplateBindings(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, monitoringControlPermission); err != nil {
		return err
	}
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}
	id, err := parsePositiveIDParam(c, "id")
	if err != nil {
		return err
	}
	var req monitoring.TemplateBindingsInput
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}
	if err := h.Writer.UpdateTemplateBindings(c.Request().Context(), id, req); err != nil {
		return mapTemplateServiceError(err)
	}
	middleware.SetAuditDetails(c, map[string]interface{}{
		"template_id":     id,
		"group_ids":       req.GroupIDs,
		"device_ids":      req.DeviceIDs,
		"clear_overrides": req.ClearOverrides,
	})
	return c.JSON(http.StatusOK, map[string]interface{}{"success": true})
}

// ListMonitoringTemplateItems 返回监控方案下的采集指标列表。
func (h MonitoringHandler) ListMonitoringTemplateItems(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, monitoringReadPermission); err != nil {
		return err
	}
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}
	id, err := parsePositiveIDParam(c, "id")
	if err != nil {
		return err
	}
	items, err := h.Writer.ListTemplateItems(c.Request().Context(), id)
	if err != nil {
		return mapTemplateServiceError(err)
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"items": items})
}

// CreateMonitoringTemplateItem 在自定义监控方案下创建采集指标。
func (h MonitoringHandler) CreateMonitoringTemplateItem(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, monitoringControlPermission); err != nil {
		return err
	}
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}
	id, err := parsePositiveIDParam(c, "id")
	if err != nil {
		return err
	}
	var req monitoring.MonitorItemInput
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}
	item, err := h.Writer.CreateTemplateItem(c.Request().Context(), id, req)
	if err != nil {
		return mapTemplateServiceError(err)
	}
	middleware.SetAuditDetails(c, map[string]interface{}{
		"template_id": id,
		"item_id":     item.ID,
		"item_key":    item.ItemKey,
		"protocol":    item.Protocol,
	})
	return c.JSON(http.StatusCreated, item)
}

// UpdateMonitoringTemplateItem 更新采集指标。
func (h MonitoringHandler) UpdateMonitoringTemplateItem(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, monitoringControlPermission); err != nil {
		return err
	}
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}
	id, err := parsePositiveIDParam(c, "id")
	if err != nil {
		return err
	}
	itemID, err := parsePositiveIDParam(c, "item_id")
	if err != nil {
		return err
	}
	var req monitoring.MonitorItemInput
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}
	item, err := h.Writer.UpdateTemplateItem(c.Request().Context(), id, itemID, req)
	if err != nil {
		return mapTemplateServiceError(err)
	}
	middleware.SetAuditDetails(c, map[string]interface{}{
		"template_id": id,
		"item_id":     item.ID,
		"item_key":    item.ItemKey,
		"protocol":    item.Protocol,
	})
	return c.JSON(http.StatusOK, item)
}

// DeleteMonitoringTemplateItem 删除采集指标。
func (h MonitoringHandler) DeleteMonitoringTemplateItem(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, monitoringControlPermission); err != nil {
		return err
	}
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}
	id, err := parsePositiveIDParam(c, "id")
	if err != nil {
		return err
	}
	itemID, err := parsePositiveIDParam(c, "item_id")
	if err != nil {
		return err
	}
	if err := h.Writer.DeleteTemplateItem(c.Request().Context(), id, itemID); err != nil {
		return mapTemplateServiceError(err)
	}
	middleware.SetAuditDetails(c, map[string]interface{}{
		"template_id": id,
		"item_id":     itemID,
		"deleted":     true,
	})
	return c.JSON(http.StatusOK, map[string]interface{}{"success": true})
}

// ListMonitoringTemplateLLDRules 返回自动识别规则列表。
func (h MonitoringHandler) ListMonitoringTemplateLLDRules(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, monitoringReadPermission); err != nil {
		return err
	}
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}
	id, err := parsePositiveIDParam(c, "id")
	if err != nil {
		return err
	}
	rules, err := h.Writer.ListTemplateLLDRules(c.Request().Context(), id)
	if err != nil {
		return mapTemplateServiceError(err)
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"items": rules})
}

// CreateMonitoringTemplateLLDRule 创建自动识别规则。
func (h MonitoringHandler) CreateMonitoringTemplateLLDRule(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, monitoringControlPermission); err != nil {
		return err
	}
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}
	id, err := parsePositiveIDParam(c, "id")
	if err != nil {
		return err
	}
	var req monitoring.MonitorLLDRuleInput
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}
	rule, err := h.Writer.CreateTemplateLLDRule(c.Request().Context(), id, req)
	if err != nil {
		return mapTemplateServiceError(err)
	}
	middleware.SetAuditDetails(c, map[string]interface{}{
		"template_id": id,
		"rule_id":     rule.ID,
		"rule_key":    rule.RuleKey,
	})
	return c.JSON(http.StatusCreated, rule)
}

// UpdateMonitoringTemplateLLDRule 更新自动识别规则。
func (h MonitoringHandler) UpdateMonitoringTemplateLLDRule(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, monitoringControlPermission); err != nil {
		return err
	}
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}
	id, err := parsePositiveIDParam(c, "id")
	if err != nil {
		return err
	}
	ruleID, err := parsePositiveIDParam(c, "rule_id")
	if err != nil {
		return err
	}
	var req monitoring.MonitorLLDRuleInput
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}
	rule, err := h.Writer.UpdateTemplateLLDRule(c.Request().Context(), id, ruleID, req)
	if err != nil {
		return mapTemplateServiceError(err)
	}
	middleware.SetAuditDetails(c, map[string]interface{}{
		"template_id": id,
		"rule_id":     rule.ID,
		"rule_key":    rule.RuleKey,
	})
	return c.JSON(http.StatusOK, rule)
}

// DeleteMonitoringTemplateLLDRule 删除自动识别规则。
func (h MonitoringHandler) DeleteMonitoringTemplateLLDRule(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, monitoringControlPermission); err != nil {
		return err
	}
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}
	id, err := parsePositiveIDParam(c, "id")
	if err != nil {
		return err
	}
	ruleID, err := parsePositiveIDParam(c, "rule_id")
	if err != nil {
		return err
	}
	if err := h.Writer.DeleteTemplateLLDRule(c.Request().Context(), id, ruleID); err != nil {
		return mapTemplateServiceError(err)
	}
	middleware.SetAuditDetails(c, map[string]interface{}{
		"template_id": id,
		"rule_id":     ruleID,
		"deleted":     true,
	})
	return c.JSON(http.StatusOK, map[string]interface{}{"success": true})
}

// PreviewMonitoringTemplateLLDRule 预览自动识别规则命中与排除结果。
func (h MonitoringHandler) PreviewMonitoringTemplateLLDRule(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, monitoringReadPermission); err != nil {
		return err
	}
	var req monitoring.LLDPreviewRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}
	res, err := monitoring.PreviewLLDRule(req)
	if err != nil {
		return mapTemplateServiceError(err)
	}
	return c.JSON(http.StatusOK, res)
}

// TestMonitoringItemRequest 在线测试单个自定义监控项请求。
type TestMonitoringItemRequest struct {
	DeviceID int                         `json:"device_id"`
	Item     monitoring.MonitorItemInput `json:"item"`
	Prev     *monitoring.PrevSample      `json:"prev,omitempty"`
}

// TestMonitoringItem 在线测试单个自定义采集项（强制校验 monitoring:control 与 device_id 存在性）。
func (h MonitoringHandler) TestMonitoringItem(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, monitoringControlPermission); err != nil {
		return err
	}
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}
	var req TestMonitoringItemRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}
	if req.DeviceID <= 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid device_id")
	}

	res, err := h.Writer.TestCustomMonitorItem(c.Request().Context(), req.DeviceID, req.Item, req.Prev)
	if err != nil {
		return mapTemplateServiceError(err)
	}

	// 审计摘要严格脱敏：仅记录 device_id、item_key 与 protocol，严禁记录 SNMP 凭据。
	middleware.SetAuditDetails(c, map[string]interface{}{
		"device_id":   req.DeviceID,
		"item_key":    req.Item.ItemKey,
		"protocol":    req.Item.Protocol,
		"duration_ms": res.DurationMS,
	})
	return c.JSON(http.StatusOK, res)
}

var _ = devices.Device{}
