package inspection

import (
	"context"
	"fmt"
	"math"
	"strings"
	"time"

	"go.uber.org/zap"
	"gorm.io/gorm"
)

const (
	defaultLimit = 20
	maxLimit     = 100
)

type Service struct {
	db     *gorm.DB
	logger *zap.Logger
}

type TemplatePayload struct {
	Name        string
	Description *string
	Category    *string
	DeviceTypes []string
	CheckItems  []map[string]interface{}
	IsDefault   bool
	IsActive    bool
}

type TemplateUpdate struct {
	Name        *string
	Description *string
	Category    *string
	DeviceTypes *[]string
	CheckItems  *[]map[string]interface{}
	IsDefault   *bool
	IsActive    *bool
}

type StrategyPayload struct {
	Name        string
	Description *string
	Type        string
	Cron        *string
	Devices     []int
	Templates   []int
	Enabled     bool
}

type StrategyUpdate struct {
	Name        *string
	Description *string
	Type        *string
	Cron        *string
	Devices     *[]int
	Templates   *[]int
	Enabled     *bool
}

type InspectionFilter struct {
	Statuses   []string
	DeviceID   *int
	TemplateID *int
	ScheduleID *int
	StartDate  *time.Time
	EndDate    *time.Time
	Skip       int
	Limit      int
	OrderBy    string
	OrderDesc  bool
}

type CreateInspectionInput struct {
	Name        string
	TemplateID  *int
	ScheduleID  *int
	DeviceIDs   []int
	Trigger     string
	ScheduledAt *time.Time
	CreatedBy   *string
}

func NewService(db *gorm.DB, logger *zap.Logger) *Service {
	return &Service{
		db:     db,
		logger: logger,
	}
}

func (s *Service) DB() *gorm.DB {
	if s == nil {
		return nil
	}
	return s.db
}

func (s *Service) ListTemplates(ctx context.Context, deviceType string, skip int, limit int) ([]Template, int64, error) {
	if s == nil || s.db == nil {
		return nil, 0, fmt.Errorf("database not initialized")
	}

	skip = normalizeSkip(skip)
	limit = normalizeLimit(limit)

	query := s.db.WithContext(ctx).Model(&Template{})
	if strings.TrimSpace(deviceType) != "" {
		filterJSON, err := encodeJSON([]string{strings.TrimSpace(deviceType)})
		if err == nil {
			query = query.Where("device_types @> ?", filterJSON)
		}
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	templates := make([]Template, 0)
	if err := query.Order("created_at desc").
		Offset(skip).
		Limit(limit).
		Find(&templates).Error; err != nil {
		return nil, 0, err
	}

	return templates, total, nil
}

func (s *Service) GetTemplate(ctx context.Context, id int) (Template, error) {
	if s == nil || s.db == nil {
		return Template{}, fmt.Errorf("database not initialized")
	}
	var template Template
	if err := s.db.WithContext(ctx).Where("id = ?", id).Take(&template).Error; err != nil {
		return Template{}, err
	}
	return template, nil
}

func (s *Service) CreateTemplate(ctx context.Context, payload TemplatePayload) (Template, error) {
	if s == nil || s.db == nil {
		return Template{}, fmt.Errorf("database not initialized")
	}

	name := strings.TrimSpace(payload.Name)
	if name == "" {
		return Template{}, fmt.Errorf("name is required")
	}

	deviceTypesJSON, err := encodeJSON(payload.DeviceTypes)
	if err != nil {
		return Template{}, err
	}
	checkItemsJSON, err := encodeJSON(payload.CheckItems)
	if err != nil {
		return Template{}, err
	}

	now := time.Now().UTC()
	template := Template{
		Name:        name,
		Description: payload.Description,
		Category:    payload.Category,
		DeviceTypes: deviceTypesJSON,
		CheckItems:  checkItemsJSON,
		IsDefault:   payload.IsDefault,
		IsActive:    payload.IsActive,
		CreatedAt:   &now,
		UpdatedAt:   &now,
	}

	if err := s.db.WithContext(ctx).Create(&template).Error; err != nil {
		return Template{}, err
	}
	return template, nil
}

func (s *Service) UpdateTemplate(ctx context.Context, id int, payload TemplateUpdate) (Template, error) {
	if s == nil || s.db == nil {
		return Template{}, fmt.Errorf("database not initialized")
	}

	updates := map[string]interface{}{
		"updated_at": time.Now().UTC(),
	}
	if payload.Name != nil {
		updates["name"] = strings.TrimSpace(*payload.Name)
	}
	if payload.Description != nil {
		updates["description"] = *payload.Description
	}
	if payload.Category != nil {
		updates["category"] = *payload.Category
	}
	if payload.DeviceTypes != nil {
		if deviceTypesJSON, err := encodeJSON(*payload.DeviceTypes); err == nil {
			updates["device_types"] = deviceTypesJSON
		} else {
			return Template{}, err
		}
	}
	if payload.CheckItems != nil {
		if checkItemsJSON, err := encodeJSON(*payload.CheckItems); err == nil {
			updates["check_items"] = checkItemsJSON
		} else {
			return Template{}, err
		}
	}
	if payload.IsDefault != nil {
		updates["is_default"] = *payload.IsDefault
	}
	if payload.IsActive != nil {
		updates["is_active"] = *payload.IsActive
	}

	if err := s.db.WithContext(ctx).Model(&Template{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		return Template{}, err
	}
	return s.GetTemplate(ctx, id)
}

func (s *Service) DeleteTemplate(ctx context.Context, id int) error {
	if s == nil || s.db == nil {
		return fmt.Errorf("database not initialized")
	}
	result := s.db.WithContext(ctx).Delete(&Template{}, id)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func (s *Service) ListStrategies(ctx context.Context, filterType *string, enabled *bool, skip int, limit int) ([]Strategy, int64, error) {
	if s == nil || s.db == nil {
		return nil, 0, fmt.Errorf("database not initialized")
	}

	skip = normalizeSkip(skip)
	limit = normalizeLimit(limit)

	query := s.db.WithContext(ctx).Model(&Strategy{})
	if filterType != nil && strings.TrimSpace(*filterType) != "" {
		query = query.Where("type = ?", normalizeStrategyType(*filterType))
	}
	if enabled != nil {
		query = query.Where("enabled = ?", *enabled)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	strategies := make([]Strategy, 0)
	if err := query.Order("created_at desc").Offset(skip).Limit(limit).Find(&strategies).Error; err != nil {
		return nil, 0, err
	}
	return strategies, total, nil
}

func (s *Service) GetStrategy(ctx context.Context, id int) (Strategy, error) {
	if s == nil || s.db == nil {
		return Strategy{}, fmt.Errorf("database not initialized")
	}
	var strategy Strategy
	if err := s.db.WithContext(ctx).Where("id = ?", id).Take(&strategy).Error; err != nil {
		return Strategy{}, err
	}
	return strategy, nil
}

func (s *Service) CreateStrategy(ctx context.Context, payload StrategyPayload) (Strategy, error) {
	if s == nil || s.db == nil {
		return Strategy{}, fmt.Errorf("database not initialized")
	}

	name := strings.TrimSpace(payload.Name)
	if name == "" {
		return Strategy{}, fmt.Errorf("name is required")
	}

	devicesJSON, err := encodeJSON(payload.Devices)
	if err != nil {
		return Strategy{}, err
	}
	templatesJSON, err := encodeJSON(payload.Templates)
	if err != nil {
		return Strategy{}, err
	}

	now := time.Now().UTC()
	strategy := Strategy{
		Name:        name,
		Description: payload.Description,
		Type:        normalizeStrategyType(payload.Type),
		Cron:        payload.Cron,
		Devices:     devicesJSON,
		Templates:   templatesJSON,
		Enabled:     payload.Enabled,
		CreatedAt:   &now,
		UpdatedAt:   &now,
	}

	if err := s.db.WithContext(ctx).Create(&strategy).Error; err != nil {
		return Strategy{}, err
	}
	return strategy, nil
}

func (s *Service) UpdateStrategy(ctx context.Context, id int, payload StrategyUpdate) (Strategy, error) {
	if s == nil || s.db == nil {
		return Strategy{}, fmt.Errorf("database not initialized")
	}

	updates := map[string]interface{}{
		"updated_at": time.Now().UTC(),
	}
	if payload.Name != nil {
		updates["name"] = strings.TrimSpace(*payload.Name)
	}
	if payload.Description != nil {
		updates["description"] = *payload.Description
	}
	if payload.Type != nil {
		updates["type"] = normalizeStrategyType(*payload.Type)
	}
	if payload.Cron != nil {
		updates["cron"] = *payload.Cron
	}
	if payload.Devices != nil {
		if devicesJSON, err := encodeJSON(*payload.Devices); err == nil {
			updates["devices"] = devicesJSON
		} else {
			return Strategy{}, err
		}
	}
	if payload.Templates != nil {
		if templatesJSON, err := encodeJSON(*payload.Templates); err == nil {
			updates["templates"] = templatesJSON
		} else {
			return Strategy{}, err
		}
	}
	if payload.Enabled != nil {
		updates["enabled"] = *payload.Enabled
	}

	if err := s.db.WithContext(ctx).Model(&Strategy{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		return Strategy{}, err
	}
	return s.GetStrategy(ctx, id)
}

func (s *Service) DeleteStrategy(ctx context.Context, id int) error {
	if s == nil || s.db == nil {
		return fmt.Errorf("database not initialized")
	}
	result := s.db.WithContext(ctx).Delete(&Strategy{}, id)
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func (s *Service) ToggleStrategy(ctx context.Context, id int) (Strategy, error) {
	strategy, err := s.GetStrategy(ctx, id)
	if err != nil {
		return Strategy{}, err
	}
	enabled := !strategy.Enabled
	updates := map[string]interface{}{
		"enabled":    enabled,
		"updated_at": time.Now().UTC(),
	}
	if err := s.db.WithContext(ctx).Model(&Strategy{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		return Strategy{}, err
	}
	return s.GetStrategy(ctx, id)
}

func (s *Service) CreateInspections(ctx context.Context, payload CreateInspectionInput) ([]Inspection, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	if len(payload.DeviceIDs) == 0 {
		return nil, fmt.Errorf("device_ids is required")
	}

	trigger := normalizeTrigger(payload.Trigger)
	now := time.Now().UTC()
	name := strings.TrimSpace(payload.Name)

	inspections := make([]Inspection, 0, len(payload.DeviceIDs))
	for _, deviceID := range payload.DeviceIDs {
		if deviceID <= 0 {
			continue
		}
		item := Inspection{
			DeviceID:    deviceID,
			TemplateID:  payload.TemplateID,
			ScheduleID:  payload.ScheduleID,
			Name:        &name,
			Trigger:     trigger,
			Status:      StatusPending,
			ScheduledAt: payload.ScheduledAt,
			CreatedBy:   payload.CreatedBy,
			CreatedAt:   &now,
			UpdatedAt:   &now,
		}
		if err := s.db.WithContext(ctx).Create(&item).Error; err != nil {
			return nil, err
		}
		inspections = append(inspections, item)
	}

	if len(inspections) == 0 {
		return nil, fmt.Errorf("device_ids is required")
	}

	return inspections, nil
}

func (s *Service) ListInspections(ctx context.Context, filter InspectionFilter) ([]Inspection, int64, error) {
	if s == nil || s.db == nil {
		return nil, 0, fmt.Errorf("database not initialized")
	}

	filter.Skip = normalizeSkip(filter.Skip)
	filter.Limit = normalizeLimit(filter.Limit)

	query := s.db.WithContext(ctx).Model(&Inspection{})
	if len(filter.Statuses) > 0 {
		query = query.Where("status IN ?", filter.Statuses)
	}
	if filter.DeviceID != nil {
		query = query.Where("device_id = ?", *filter.DeviceID)
	}
	if filter.TemplateID != nil {
		query = query.Where("template_id = ?", *filter.TemplateID)
	}
	if filter.ScheduleID != nil {
		query = query.Where("schedule_id = ?", *filter.ScheduleID)
	}
	if filter.StartDate != nil {
		query = query.Where("created_at >= ?", *filter.StartDate)
	}
	if filter.EndDate != nil {
		query = query.Where("created_at <= ?", *filter.EndDate)
	}

	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, 0, err
	}

	orderBy := "created_at"
	if strings.TrimSpace(filter.OrderBy) != "" {
		orderBy = filter.OrderBy
	}
	if filter.OrderDesc {
		orderBy = fmt.Sprintf("%s desc", orderBy)
	}

	inspections := make([]Inspection, 0)
	if err := query.Order(orderBy).
		Offset(filter.Skip).
		Limit(filter.Limit).
		Find(&inspections).Error; err != nil {
		return nil, 0, err
	}

	return inspections, total, nil
}

func (s *Service) GetInspection(ctx context.Context, id int) (Inspection, error) {
	if s == nil || s.db == nil {
		return Inspection{}, fmt.Errorf("database not initialized")
	}
	var inspection Inspection
	if err := s.db.WithContext(ctx).Where("id = ?", id).Take(&inspection).Error; err != nil {
		return Inspection{}, err
	}
	return inspection, nil
}

func (s *Service) UpdateInspectionStatus(ctx context.Context, id int, status string, errorMessage *string) (Inspection, error) {
	if s == nil || s.db == nil {
		return Inspection{}, fmt.Errorf("database not initialized")
	}

	status = normalizeInspectionStatus(status)
	inspection, err := s.GetInspection(ctx, id)
	if err != nil {
		return Inspection{}, err
	}

	now := time.Now().UTC()
	updates := map[string]interface{}{
		"status":     status,
		"updated_at": now,
	}

	if status == StatusRunning && inspection.StartedAt == nil {
		updates["started_at"] = now
	}

	if status == StatusCompleted || status == StatusFailed || status == StatusCancelled || status == StatusTimeout {
		if inspection.CompletedAt == nil {
			updates["completed_at"] = now
		}
		if inspection.StartedAt != nil {
			duration := int(math.Round(now.Sub(*inspection.StartedAt).Seconds()))
			if duration < 0 {
				duration = 0
			}
			updates["duration"] = duration
		}
	}

	if errorMessage != nil {
		updates["error_message"] = errorMessage
	}

	if err := s.db.WithContext(ctx).Model(&Inspection{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		return Inspection{}, err
	}

	return s.GetInspection(ctx, id)
}

func (s *Service) ListResultsByInspectionIDs(ctx context.Context, inspectionIDs []int) ([]Result, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}
	if len(inspectionIDs) == 0 {
		return []Result{}, nil
	}
	results := make([]Result, 0)
	if err := s.db.WithContext(ctx).
		Model(&Result{}).
		Where("inspection_id IN ?", inspectionIDs).
		Order("inspection_id, id").
		Find(&results).Error; err != nil {
		return nil, err
	}
	return results, nil
}

func (s *Service) ListResultsByInspectionID(ctx context.Context, inspectionID int) ([]Result, error) {
	return s.ListResultsByInspectionIDs(ctx, []int{inspectionID})
}

func normalizeLimit(limit int) int {
	if limit <= 0 {
		return defaultLimit
	}
	if limit > maxLimit {
		return maxLimit
	}
	return limit
}

func normalizeSkip(skip int) int {
	if skip < 0 {
		return 0
	}
	return skip
}
