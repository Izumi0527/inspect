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
	if err := inspection.ValidateStrategyTemplateIDs(templates); err != nil {
		if validationErr, ok := err.(*inspection.ValidationError); ok {
			return echo.NewHTTPError(http.StatusBadRequest, validationErr.Message)
		}
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

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
		if validationErr, ok := err.(*inspection.ValidationError); ok {
			return echo.NewHTTPError(http.StatusBadRequest, validationErr.Message)
		}
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
		if err := inspection.ValidateStrategyTemplateIDs(value); err != nil {
			if validationErr, ok := err.(*inspection.ValidationError); ok {
				return echo.NewHTTPError(http.StatusBadRequest, validationErr.Message)
			}
			return echo.NewHTTPError(http.StatusBadRequest, err.Error())
		}
		update.Templates = &value
	}
	if value, ok := readBool(payload, "enabled"); ok {
		update.Enabled = &value
	}

	item, err := h.Service.UpdateStrategy(c.Request().Context(), strategyID, update)
	if err != nil {
		if validationErr, ok := err.(*inspection.ValidationError); ok {
			return echo.NewHTTPError(http.StatusBadRequest, validationErr.Message)
		}
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

// =====================================================================
// 巡检策略触发（手动/定时）与定时调度器
// =====================================================================

var errStrategyNoDevices = errors.New("策略未配置设备")
var errStrategyNoTemplates = errors.New("策略未配置模板")

func (h InspectionHandler) triggerStrategyInspections(ctx context.Context, strategyID int, trigger string, createdBy *string) ([]inspection.Inspection, *int, error) {
	if h.Service == nil {
		return nil, nil, fmt.Errorf("inspection service not configured")
	}

	strategy, err := h.Service.GetStrategy(ctx, strategyID)
	if err != nil {
		return nil, nil, err
	}

	deviceIDs := decodeJSONIntSlice(strategy.Devices)
	if len(deviceIDs) == 0 {
		return nil, nil, errStrategyNoDevices
	}

	templates := decodeJSONIntSlice(strategy.Templates)
	if err := h.Service.ValidateStrategyTemplatesExist(ctx, templates); err != nil {
		if validationErr, ok := err.(*inspection.ValidationError); ok && strings.Contains(validationErr.Field, "templates") {
			return nil, nil, validationErr
		}
		return nil, nil, errStrategyNoTemplates
	}
	templateID := &templates[0]

	suffix := "手动触发"
	if strings.EqualFold(trigger, inspection.TriggerScheduled) {
		suffix = "定时触发"
	}
	name := fmt.Sprintf("%s %s", strategy.Name, suffix)

	// schedule_id 字段当前用于关联巡检策略（inspection_strategies.id），以便执行历史按策略过滤
	inspections, err := h.Service.CreateInspections(ctx, inspection.CreateInspectionInput{
		Name:       name,
		TemplateID: templateID,
		ScheduleID: &strategyID,
		DeviceIDs:  deviceIDs,
		Trigger:    trigger,
		CreatedBy:  createdBy,
	})
	if err != nil {
		return nil, nil, err
	}

	// 异步执行巡检任务
	go h.executeInspectionsAsync(inspections, templateID)
	return inspections, templateID, nil
}

func (h InspectionHandler) StartStrategyScheduler(ctx context.Context) <-chan struct{} {
	done := make(chan struct{})
	if h.Service == nil || h.Service.DB() == nil {
		close(done)
		return done
	}
	if ctx == nil {
		ctx = context.Background()
	}

	ticker := time.NewTicker(30 * time.Second)
	go func() {
		defer close(done)
		defer ticker.Stop()

		// 启动即跑一轮，避免首次等待 ticker
		h.runStrategySchedulerTick(ctx, time.Now().UTC())

		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				h.runStrategySchedulerTick(ctx, time.Now().UTC())
			}
		}
	}()

	return done
}

func (h InspectionHandler) runStrategySchedulerTick(ctx context.Context, now time.Time) {
	h.initializeStrategyNextRunTimes(ctx, now)
	h.triggerDueStrategies(ctx, now)
}

func (h InspectionHandler) initializeStrategyNextRunTimes(ctx context.Context, now time.Time) {
	db := h.Service.DB()
	if db == nil {
		return
	}

	var strategies []inspection.Strategy
	if err := db.WithContext(ctx).
		Where("type = ? AND enabled = ? AND cron IS NOT NULL AND next_run_time IS NULL", inspection.StrategyScheduled, true).
		Find(&strategies).Error; err != nil {
		if h.Logger != nil {
			h.Logger.Warn("failed to list strategies for next_run_time initialization", zap.Error(err))
		}
		return
	}

	for _, strategy := range strategies {
		if strategy.ID <= 0 || strategy.Cron == nil || strings.TrimSpace(*strategy.Cron) == "" {
			continue
		}

		normalizedCron, err := inspection.NormalizeCronExpression(*strategy.Cron)
		if err != nil {
			if h.Logger != nil {
				h.Logger.Warn("failed to normalize cron", zap.Int("strategy_id", strategy.ID), zap.Error(err))
			}
			continue
		}
		next, err := inspection.ComputeNextRunTime(normalizedCron, now)
		if err != nil {
			if h.Logger != nil {
				h.Logger.Warn("failed to compute next_run_time", zap.Int("strategy_id", strategy.ID), zap.Error(err))
			}
			continue
		}

		updates := map[string]interface{}{
			"next_run_time": next,
			"updated_at":    now,
		}
		if err := db.WithContext(ctx).
			Model(&inspection.Strategy{}).
			Where("id = ? AND next_run_time IS NULL", strategy.ID).
			Updates(updates).Error; err != nil {
			if h.Logger != nil {
				h.Logger.Warn("failed to update next_run_time", zap.Int("strategy_id", strategy.ID), zap.Error(err))
			}
		}
	}
}

func (h InspectionHandler) triggerDueStrategies(ctx context.Context, now time.Time) {
	db := h.Service.DB()
	if db == nil {
		return
	}

	var due []inspection.Strategy
	if err := db.WithContext(ctx).
		Where("type = ? AND enabled = ? AND next_run_time <= ?", inspection.StrategyScheduled, true, now).
		Order("next_run_time asc").
		Limit(100).
		Find(&due).Error; err != nil {
		if h.Logger != nil {
			h.Logger.Warn("failed to list due strategies", zap.Error(err))
		}
		return
	}

	for _, strategy := range due {
		claimed, _, err := claimDueStrategy(ctx, db, strategy, now)
		if err != nil {
			if h.Logger != nil {
				h.Logger.Warn("failed to claim due strategy", zap.Int("strategy_id", strategy.ID), zap.Error(err))
			}
			continue
		}
		if !claimed {
			continue
		}

		if _, _, err := h.triggerStrategyInspections(ctx, strategy.ID, inspection.TriggerScheduled, nil); err != nil {
			if h.Logger != nil {
				h.Logger.Error("failed to trigger due strategy", zap.Int("strategy_id", strategy.ID), zap.Error(err))
			}
		}
	}
}

func claimDueStrategy(ctx context.Context, db *gorm.DB, strategy inspection.Strategy, now time.Time) (bool, *time.Time, error) {
	if db == nil {
		return false, nil, fmt.Errorf("db not configured")
	}
	if strategy.ID <= 0 {
		return false, nil, fmt.Errorf("invalid strategy id")
	}
	if strategy.Cron == nil || strings.TrimSpace(*strategy.Cron) == "" {
		return false, nil, fmt.Errorf("cron is required for scheduled strategy")
	}

	normalizedCron, err := inspection.NormalizeCronExpression(*strategy.Cron)
	if err != nil {
		return false, nil, err
	}
	next, err := inspection.ComputeNextRunTime(normalizedCron, now)
	if err != nil {
		return false, nil, err
	}

	updates := map[string]interface{}{
		"last_run_time": now,
		"next_run_time": next,
		"updated_at":    now,
	}

	result := db.WithContext(ctx).
		Model(&inspection.Strategy{}).
		Where("id = ? AND type = ? AND enabled = ? AND next_run_time <= ?", strategy.ID, inspection.StrategyScheduled, true, now).
		Updates(updates)
	if result.Error != nil {
		return false, nil, result.Error
	}
	if result.RowsAffected == 0 {
		return false, nil, nil
	}
	return true, &next, nil
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

	createdBy := ""
	if user != nil {
		createdBy = user.ID
	}
	inspections, _, err := h.triggerStrategyInspections(c.Request().Context(), strategyID, inspection.TriggerManual, stringPtr(createdBy))
	if err != nil {
		if validationErr, ok := err.(*inspection.ValidationError); ok {
			return echo.NewHTTPError(http.StatusBadRequest, validationErr.Message)
		}
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "巡检策略不存在")
		}
		if errors.Is(err, errStrategyNoDevices) {
			return echo.NewHTTPError(http.StatusBadRequest, "策略未配置设备")
		}
		if errors.Is(err, errStrategyNoTemplates) {
			return echo.NewHTTPError(http.StatusBadRequest, "策略未配置模板")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to trigger strategy")
	}

	ids := make([]int, 0, len(inspections))
	for _, item := range inspections {
		ids = append(ids, item.ID)
	}

	return inspectionOKWithMessage(c, "触发策略执行成功", map[string]interface{}{
		"message":        "触发成功，巡检任务已开始执行",
		"inspection_ids": ids,
	})
}
