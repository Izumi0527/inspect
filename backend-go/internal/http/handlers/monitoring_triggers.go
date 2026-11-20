package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"gorm.io/datatypes"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/alerts"
	"github.com/your-org/inspect-system/backend-go/internal/http/middleware"
)

const maxEntityFilterRegexLen = 256

// ListMonitoringTriggers 列出全部触发器规则（权限对齐 alerts:read）。
func (h MonitoringHandler) ListMonitoringTriggers(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, "alerts:read"); err != nil {
		return err
	}
	if h.Alerts == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "alert service not configured")
	}

	filter := alerts.ListRulesFilter{
		Severity: optionalStringValue(strPtrOrNil(c.QueryParam("severity"))),
		Category: optionalStringValue(strPtrOrNil(c.QueryParam("category"))),
		IsActive: parseOptionalBool(c.QueryParam("is_active")),
	}
	rules, err := h.Alerts.ListRules(c.Request().Context(), filter)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load triggers")
	}

	items := make([]map[string]interface{}, 0, len(rules))
	for _, r := range rules {
		items = append(items, buildTriggerRuleResponse(r))
	}
	return c.JSON(http.StatusOK, map[string]interface{}{"items": items})
}

// CreateMonitoringTrigger 创建触发器规则（权限对齐 alerts:create），校验正则与写时 DAG 防环。
func (h MonitoringHandler) CreateMonitoringTrigger(c echo.Context) error {
	user, err := requirePermission(c, h.Auth, "alerts:create")
	if err != nil {
		return err
	}
	if h.Alerts == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "alert service not configured")
	}

	var payload map[string]interface{}
	if err := c.Bind(&payload); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	rule, err := buildAlertRuleCreate(payload, user)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if err := applyTriggerFieldsOnCreate(&rule, payload); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	if rule.DependencyMode == alerts.DependencyModeManualDevice && rule.DependsOnDeviceID != nil {
		targetDevs := normalizeIntSlice(payload["specific_devices"])
		if err := alerts.ValidateDependencyDAG(c.Request().Context(), h.Alerts.DB(), 0, targetDevs, *rule.DependsOnDeviceID); err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, err.Error())
		}
	}

	if err := h.Alerts.CreateRule(c.Request().Context(), &rule); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to create trigger")
	}

	middleware.SetAuditDetails(c, map[string]interface{}{
		"rule_id":         rule.ID,
		"name":            rule.Name,
		"expression_mode": rule.ExpressionMode,
		"dependency_mode": rule.DependencyMode,
		"severity":        rule.Severity,
	})
	return c.JSON(http.StatusCreated, buildTriggerRuleResponse(rule))
}

// UpdateMonitoringTrigger 更新触发器规则（权限对齐 alerts:update），校验正则与写时 DAG 防环。
func (h MonitoringHandler) UpdateMonitoringTrigger(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, "alerts:update"); err != nil {
		return err
	}
	if h.Alerts == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "alert service not configured")
	}
	id, err := strconv.Atoi(strings.TrimSpace(c.Param("id")))
	if err != nil || id <= 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid trigger id")
	}

	existing, err := h.Alerts.GetRule(c.Request().Context(), id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "trigger not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load trigger")
	}

	var payload map[string]interface{}
	if err := c.Bind(&payload); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	updates, err := buildAlertRuleUpdates(payload)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}
	if err := applyTriggerFieldsOnUpdate(updates, payload); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	depMode := existing.DependencyMode
	if v, ok := updates["dependency_mode"].(string); ok {
		depMode = v
	}
	depDevID := existing.DependsOnDeviceID
	if v, ok := updates["depends_on_device_id"].(*int); ok {
		depDevID = v
	}
	if depMode == alerts.DependencyModeManualDevice && depDevID != nil && *depDevID > 0 {
		var targetDevs []int
		if _, has := payload["specific_devices"]; has {
			targetDevs = normalizeIntSlice(payload["specific_devices"])
		} else if len(existing.SpecificDevices) > 0 {
			_ = json.Unmarshal(existing.SpecificDevices, &targetDevs)
		}
		if err := alerts.ValidateDependencyDAG(c.Request().Context(), h.Alerts.DB(), id, targetDevs, *depDevID); err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, err.Error())
		}
	}

	updated, err := h.Alerts.UpdateRule(c.Request().Context(), id, updates)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to update trigger")
	}

	middleware.SetAuditDetails(c, map[string]interface{}{
		"rule_id":         updated.ID,
		"name":            updated.Name,
		"expression_mode": updated.ExpressionMode,
		"dependency_mode": updated.DependencyMode,
	})
	return c.JSON(http.StatusOK, buildTriggerRuleResponse(updated))
}

// DeleteMonitoringTrigger 删除/停用触发器规则（权限对齐 alerts:delete）。
func (h MonitoringHandler) DeleteMonitoringTrigger(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, "alerts:delete"); err != nil {
		return err
	}
	if h.Alerts == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "alert service not configured")
	}
	id, err := strconv.Atoi(strings.TrimSpace(c.Param("id")))
	if err != nil || id <= 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid trigger id")
	}
	if err := h.Alerts.DeleteRule(c.Request().Context(), id); err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "trigger not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to delete trigger")
	}
	middleware.SetAuditDetails(c, map[string]interface{}{
		"rule_id": id,
		"deleted": true,
	})
	return c.JSON(http.StatusOK, map[string]interface{}{"success": true})
}

// ToggleMonitoringTrigger 切换触发器启停状态（权限对齐 alerts:update）。
func (h MonitoringHandler) ToggleMonitoringTrigger(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, "alerts:update"); err != nil {
		return err
	}
	if h.Alerts == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "alert service not configured")
	}
	id, err := strconv.Atoi(strings.TrimSpace(c.Param("id")))
	if err != nil || id <= 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid trigger id")
	}
	existing, err := h.Alerts.GetRule(c.Request().Context(), id)
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "trigger not found")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load trigger")
	}
	nextActive := true
	if existing.IsActive != nil {
		nextActive = !*existing.IsActive
	}
	updated, err := h.Alerts.UpdateRule(c.Request().Context(), id, map[string]interface{}{
		"is_active":  nextActive,
		"updated_at": time.Now().UTC(),
	})
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to toggle trigger")
	}
	middleware.SetAuditDetails(c, map[string]interface{}{
		"rule_id":   updated.ID,
		"is_active": nextActive,
	})
	return c.JSON(http.StatusOK, buildTriggerRuleResponse(updated))
}

func strPtrOrNil(s string) *string {
	trimmed := strings.TrimSpace(s)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func validateExpressionMode(mode string) (string, error) {
	m := strings.ToLower(strings.TrimSpace(mode))
	if m == "" {
		return alerts.ExpressionModeThreshold, nil
	}
	switch m {
	case alerts.ExpressionModeThreshold,
		alerts.ExpressionModeHysteresis,
		alerts.ExpressionModeNoData,
		alerts.ExpressionModeUptimeDrop,
		alerts.ExpressionModeIfFlap:
		return m, nil
	default:
		return "", errors.New("unsupported expression_mode")
	}
}

func validateDependencyMode(mode string) (string, error) {
	m := strings.ToLower(strings.TrimSpace(mode))
	if m == "" {
		return alerts.DependencyModeNone, nil
	}
	switch m {
	case alerts.DependencyModeNone,
		alerts.DependencyModeLLDPUpstream,
		alerts.DependencyModeManualDevice:
		return m, nil
	default:
		return "", errors.New("unsupported dependency_mode")
	}
}

func validateEntityFilterRegex(raw string) (string, error) {
	trimmed := strings.TrimSpace(raw)
	if len(trimmed) > maxEntityFilterRegexLen {
		return "", errors.New("entity_filter_regex exceeds 256 characters")
	}
	if trimmed != "" {
		if _, err := regexp.Compile(trimmed); err != nil {
			return "", errors.New("invalid entity_filter_regex")
		}
	}
	return trimmed, nil
}

func applyTriggerFieldsOnCreate(rule *alerts.AlertRule, payload map[string]interface{}) error {
	mode, err := validateExpressionMode(readStringValue(payload["expression_mode"]))
	if err != nil {
		return err
	}
	rule.ExpressionMode = mode

	depMode, err := validateDependencyMode(readStringValue(payload["dependency_mode"]))
	if err != nil {
		return err
	}
	rule.DependencyMode = depMode

	regexStr, err := validateEntityFilterRegex(readStringValue(payload["entity_filter_regex"]))
	if err != nil {
		return err
	}
	rule.EntityFilterRegex = regexStr

	if v, ok := toInt(payload["template_id"]); ok && v > 0 {
		id64 := int64(v)
		rule.TemplateID = &id64
	}
	if op := normalizeOperatorValue(readStringValue(payload["recovery_operator"])); op != "" {
		rule.RecoveryOperator = op
	}
	if _, ok := payload["recovery_threshold"]; ok && payload["recovery_threshold"] != nil {
		val := readFloatValue(payload["recovery_threshold"])
		rule.RecoveryThreshold = &val
	}
	if v, ok := toInt(payload["nodata_seconds"]); ok && v >= 0 {
		rule.NoDataSeconds = v
	}
	if v, ok := toInt(payload["depends_on_device_id"]); ok && v > 0 {
		rule.DependsOnDeviceID = &v
	}
	if rawTags, ok := payload["tags_json"]; ok && rawTags != nil {
		encoded, err := json.Marshal(rawTags)
		if err != nil {
			return err
		}
		rule.TagsJSON = datatypes.JSON(encoded)
	}
	return nil
}

func applyTriggerFieldsOnUpdate(updates map[string]interface{}, payload map[string]interface{}) error {
	if _, ok := payload["expression_mode"]; ok {
		mode, err := validateExpressionMode(readStringValue(payload["expression_mode"]))
		if err != nil {
			return err
		}
		updates["expression_mode"] = mode
	}
	if _, ok := payload["dependency_mode"]; ok {
		depMode, err := validateDependencyMode(readStringValue(payload["dependency_mode"]))
		if err != nil {
			return err
		}
		updates["dependency_mode"] = depMode
	}
	if _, ok := payload["entity_filter_regex"]; ok {
		regexStr, err := validateEntityFilterRegex(readStringValue(payload["entity_filter_regex"]))
		if err != nil {
			return err
		}
		updates["entity_filter_regex"] = regexStr
	}
	if _, ok := payload["template_id"]; ok {
		if v, okInt := toInt(payload["template_id"]); okInt && v > 0 {
			id64 := int64(v)
			updates["template_id"] = &id64
		} else {
			updates["template_id"] = nil
		}
	}
	if _, ok := payload["recovery_operator"]; ok {
		updates["recovery_operator"] = normalizeOperatorValue(readStringValue(payload["recovery_operator"]))
	}
	if _, ok := payload["recovery_threshold"]; ok {
		if payload["recovery_threshold"] == nil {
			updates["recovery_threshold"] = nil
		} else {
			val := readFloatValue(payload["recovery_threshold"])
			updates["recovery_threshold"] = &val
		}
	}
	if _, ok := payload["nodata_seconds"]; ok {
		if v, okInt := toInt(payload["nodata_seconds"]); okInt && v >= 0 {
			updates["nodata_seconds"] = v
		}
	}
	if _, ok := payload["depends_on_device_id"]; ok {
		if v, okInt := toInt(payload["depends_on_device_id"]); okInt && v > 0 {
			updates["depends_on_device_id"] = &v
		} else {
			var nilInt *int
			updates["depends_on_device_id"] = nilInt
		}
	}
	if rawTags, ok := payload["tags_json"]; ok && rawTags != nil {
		encoded, err := json.Marshal(rawTags)
		if err != nil {
			return err
		}
		updates["tags_json"] = datatypes.JSON(encoded)
	}
	if len(updates) > 0 {
		updates["updated_at"] = time.Now().UTC()
	}
	return nil
}

func buildTriggerRuleResponse(rule alerts.AlertRule) map[string]interface{} {
	resp := buildAlertRuleResponse(rule)
	exprMode := strings.TrimSpace(rule.ExpressionMode)
	if exprMode == "" {
		exprMode = alerts.ExpressionModeThreshold
	}
	depMode := strings.TrimSpace(rule.DependencyMode)
	if depMode == "" {
		depMode = alerts.DependencyModeNone
	}
	tags := map[string]interface{}{}
	if len(rule.TagsJSON) > 0 {
		_ = json.Unmarshal(rule.TagsJSON, &tags)
	}
	resp["template_id"] = rule.TemplateID
	resp["expression_mode"] = exprMode
	resp["recovery_operator"] = rule.RecoveryOperator
	resp["recovery_threshold"] = rule.RecoveryThreshold
	resp["nodata_seconds"] = rule.NoDataSeconds
	resp["dependency_mode"] = depMode
	resp["depends_on_device_id"] = rule.DependsOnDeviceID
	resp["entity_filter_regex"] = rule.EntityFilterRegex
	resp["tags_json"] = tags
	return resp
}
