package handlers

import (
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"

	"github.com/your-org/inspect-system/backend-go/internal/escalation"
)

type EscalationHandler struct {
	Service *escalation.Service
	Auth    PermissionService
}

func (h EscalationHandler) Register(group *echo.Group) {
	group.GET("/escalation/rules", h.ListRules)
	group.POST("/escalation/rules", h.CreateRule)
	group.PUT("/escalation/rules/:rule_id", h.UpdateRule)
	group.DELETE("/escalation/rules/:rule_id", h.DeleteRule)
	group.GET("/escalation/status/:alert_id", h.GetStatus)
	group.POST("/escalation/cancel/:alert_id", h.CancelEscalation)
	group.GET("/escalation/statistics", h.GetStatistics)
	group.POST("/escalation/test/:alert_id", h.TestEscalation)
}

func (h EscalationHandler) ListRules(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, "alerts:read"); err != nil {
		return err
	}
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "escalation service not configured")
	}

	rules, err := h.Service.ListRules(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load escalation rules")
	}

	return c.JSON(http.StatusOK, rules)
}

func (h EscalationHandler) CreateRule(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, "alerts:update"); err != nil {
		return err
	}
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "escalation service not configured")
	}

	var req escalation.RuleRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	rule, err := h.Service.CreateRule(c.Request().Context(), req)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	return c.JSON(http.StatusOK, rule)
}

func (h EscalationHandler) UpdateRule(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, "alerts:update"); err != nil {
		return err
	}
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "escalation service not configured")
	}

	ruleID := strings.TrimSpace(c.Param("rule_id"))
	if ruleID == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "rule_id is required")
	}

	var req escalation.RuleRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}

	rule, err := h.Service.UpdateRule(c.Request().Context(), ruleID, req)
	if err != nil {
		if errors.Is(err, escalation.ErrRuleNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "升级规则不存在")
		}
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	return c.JSON(http.StatusOK, rule)
}

func (h EscalationHandler) DeleteRule(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, "alerts:update"); err != nil {
		return err
	}
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "escalation service not configured")
	}

	ruleID := strings.TrimSpace(c.Param("rule_id"))
	if ruleID == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "rule_id is required")
	}

	if err := h.Service.DeleteRule(c.Request().Context(), ruleID); err != nil {
		if errors.Is(err, escalation.ErrRuleNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "升级规则不存在")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to delete escalation rule")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"message": "升级规则已删除",
		"rule_id": ruleID,
	})
}

func (h EscalationHandler) GetStatus(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, "alerts:read"); err != nil {
		return err
	}
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "escalation service not configured")
	}

	alertID := strings.TrimSpace(c.Param("alert_id"))
	if alertID == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "alert_id is required")
	}

	status, err := h.Service.GetEscalationStatus(c.Request().Context(), alertID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to get escalation status")
	}

	return c.JSON(http.StatusOK, status)
}

func (h EscalationHandler) CancelEscalation(c echo.Context) error {
	user, err := requirePermission(c, h.Auth, "alerts:update")
	if err != nil {
		return err
	}
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "escalation service not configured")
	}

	alertID := strings.TrimSpace(c.Param("alert_id"))
	if alertID == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "alert_id is required")
	}

	reason := strings.TrimSpace(c.QueryParam("reason"))
	if reason == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "reason is required")
	}

	annotatedReason := reason
	if user != nil && strings.TrimSpace(user.Username) != "" {
		annotatedReason = fmt.Sprintf("%s (用户: %s)", reason, strings.TrimSpace(user.Username))
	}

	success, err := h.Service.CancelEscalation(c.Request().Context(), alertID, annotatedReason)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to cancel escalation")
	}
	if !success {
		return echo.NewHTTPError(http.StatusNotFound, "未找到活跃的告警升级")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"message":  "告警升级已取消",
		"alert_id": alertID,
	})
}

func (h EscalationHandler) GetStatistics(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, "alerts:read"); err != nil {
		return err
	}
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "escalation service not configured")
	}

	stats, err := h.Service.GetStatistics(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load escalation statistics")
	}

	return c.JSON(http.StatusOK, stats)
}

func (h EscalationHandler) TestEscalation(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, "alerts:update"); err != nil {
		return err
	}
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "escalation service not configured")
	}

	alertID := strings.TrimSpace(c.Param("alert_id"))
	if alertID == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "alert_id is required")
	}

	escalationID, created, err := h.Service.CreateTestEscalation(c.Request().Context(), alertID)
	if err != nil {
		if errors.Is(err, escalation.ErrAlertNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "告警不存在")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to create test escalation")
	}

	if !created {
		return c.JSON(http.StatusOK, map[string]interface{}{
			"message":  "未找到匹配的升级规则或升级已存在",
			"alert_id": alertID,
		})
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"message":       "测试升级已创建",
		"alert_id":      alertID,
		"escalation_id": escalationID,
	})
}
