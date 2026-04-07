package inspection

import (
	"context"
	"encoding/json"
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
	db        *gorm.DB
	logger    *zap.Logger
	validator TemplateValidator
}

// TemplateService defines the interface for template management operations
type TemplateService interface {
	// Basic CRUD operations
	List(ctx context.Context, filters TemplateFilters, pagination Pagination) (*TemplatePage, error)
	GetByID(ctx context.Context, id int) (*Template, error)
	Create(ctx context.Context, template *Template) error
	Update(ctx context.Context, id int, template *Template) error
	Delete(ctx context.Context, id int) error

	// Advanced operations
	Copy(ctx context.Context, id int, newName string) (*Template, error)
	Export(ctx context.Context, id int) ([]byte, error)
	Import(ctx context.Context, data []byte, overwrite bool) (*Template, error)

	// Validation
	Validate(ctx context.Context, template *Template) error
}

// TemplateFilters defines filter criteria for template queries
type TemplateFilters struct {
	Vendor     string
	DeviceType string
	Category   string
	IsDefault  *bool
	Search     string
}

// Pagination defines pagination parameters
type Pagination struct {
	Page     int
	PageSize int
	Sort     string
	Order    string
}

// TemplatePage represents a paginated list of templates
type TemplatePage struct {
	Items    []*Template
	Total    int64
	Page     int
	PageSize int
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
	service := &Service{
		db:     db,
		logger: logger,
	}
	// Initialize validator with the service
	service.validator = NewTemplateValidator(service)
	return service
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
	if err := ValidateStrategyTemplateIDs(payload.Templates); err != nil {
		return Strategy{}, err
	}

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
	strategyType := normalizeStrategyType(payload.Type)

	var cronPtr *string
	if strategyType == StrategyScheduled && payload.Cron != nil {
		cronText := strings.TrimSpace(*payload.Cron)
		if cronText != "" {
			cronPtr = &cronText
		}
	}

	var nextRun *time.Time
	if strategyType == StrategyScheduled && payload.Enabled {
		if cronPtr == nil {
			return Strategy{}, fmt.Errorf("cron is required for scheduled strategy")
		}
		normalizedCron, err := NormalizeCronExpression(*cronPtr)
		if err != nil {
			return Strategy{}, err
		}
		next, err := ComputeNextRunTime(normalizedCron, now)
		if err != nil {
			return Strategy{}, err
		}
		nextRun = &next
	}

	strategy := Strategy{
		Name:        name,
		Description: payload.Description,
		Type:        strategyType,
		Cron:        cronPtr, // manual 策略忽略 cron
		Devices:     devicesJSON,
		Templates:   templatesJSON,
		Enabled:     payload.Enabled,
		NextRunTime: nextRun,
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

	current, err := s.GetStrategy(ctx, id)
	if err != nil {
		return Strategy{}, err
	}

	now := time.Now().UTC()
	updates := map[string]interface{}{
		"updated_at": now,
	}

	if payload.Name != nil {
		updates["name"] = strings.TrimSpace(*payload.Name)
	}
	if payload.Description != nil {
		updates["description"] = *payload.Description
	}

	strategyType := current.Type
	if payload.Type != nil {
		strategyType = normalizeStrategyType(*payload.Type)
		updates["type"] = strategyType
	}

	enabled := current.Enabled
	if payload.Enabled != nil {
		enabled = *payload.Enabled
		updates["enabled"] = enabled
	}

	cronPtr := current.Cron
	if payload.Cron != nil {
		cronText := strings.TrimSpace(*payload.Cron)
		if cronText == "" {
			cronPtr = nil
			updates["cron"] = nil
		} else {
			cronPtr = &cronText
			updates["cron"] = cronText
		}
	}
	if payload.Devices != nil {
		if devicesJSON, err := encodeJSON(*payload.Devices); err == nil {
			updates["devices"] = devicesJSON
		} else {
			return Strategy{}, err
		}
	}
	if payload.Templates != nil {
		if err := ValidateStrategyTemplateIDs(*payload.Templates); err != nil {
			return Strategy{}, err
		}
		if templatesJSON, err := encodeJSON(*payload.Templates); err == nil {
			updates["templates"] = templatesJSON
		} else {
			return Strategy{}, err
		}
	}

	currentTemplates := decodeIntSlice(current.Templates)
	if payload.Templates == nil {
		if err := ValidateStrategyTemplateIDs(currentTemplates); err != nil {
			return Strategy{}, err
		}
	}

	// 仅在 cron/type/enabled 发生变化时维护 next_run_time，避免无关字段更新导致 next_run_time 漂移
	if payload.Type != nil || payload.Cron != nil || payload.Enabled != nil {
		if strategyType == StrategyManual {
			cronPtr = nil
			updates["cron"] = nil
			updates["next_run_time"] = nil
		} else if !enabled {
			updates["next_run_time"] = nil
		} else {
			if cronPtr == nil || strings.TrimSpace(*cronPtr) == "" {
				return Strategy{}, fmt.Errorf("cron is required for scheduled strategy")
			}
			normalizedCron, err := NormalizeCronExpression(*cronPtr)
			if err != nil {
				return Strategy{}, err
			}
			next, err := ComputeNextRunTime(normalizedCron, now)
			if err != nil {
				return Strategy{}, err
			}
			updates["next_run_time"] = next
		}
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
	now := time.Now().UTC()
	updates := map[string]interface{}{
		"enabled":    enabled,
		"updated_at": now,
	}

	if !enabled {
		updates["next_run_time"] = nil
	} else if strings.EqualFold(strategy.Type, StrategyScheduled) {
		if strategy.Cron == nil || strings.TrimSpace(*strategy.Cron) == "" {
			return Strategy{}, fmt.Errorf("cron is required for scheduled strategy")
		}
		normalizedCron, err := NormalizeCronExpression(*strategy.Cron)
		if err != nil {
			return Strategy{}, err
		}
		next, err := ComputeNextRunTime(normalizedCron, now)
		if err != nil {
			return Strategy{}, err
		}
		updates["next_run_time"] = next
	} else {
		updates["next_run_time"] = nil
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
		query = query.Where("created_at < ?", filter.EndDate.Add(24*time.Hour))
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

// DeleteInspection 删除巡检执行记录及其相关的结果数据
func (s *Service) DeleteInspection(ctx context.Context, id int) error {
	if s == nil || s.db == nil {
		return fmt.Errorf("database not initialized")
	}

	// 使用事务确保数据一致性
	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		// 首先删除相关的巡检结果
		if err := tx.Where("inspection_id = ?", id).Delete(&Result{}).Error; err != nil {
			return fmt.Errorf("failed to delete inspection results: %w", err)
		}

		// 然后删除巡检记录本身
		result := tx.Delete(&Inspection{}, id)
		if result.Error != nil {
			return fmt.Errorf("failed to delete inspection: %w", result.Error)
		}
		if result.RowsAffected == 0 {
			return gorm.ErrRecordNotFound
		}

		return nil
	})
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

// ============================================================================
// TemplateService Implementation
// ============================================================================

// List retrieves templates with filtering and pagination
// Validates: Requirements 13.1, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6
func (s *Service) List(ctx context.Context, filters TemplateFilters, pagination Pagination) (*TemplatePage, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	// Normalize pagination
	if pagination.Page <= 0 {
		pagination.Page = 1
	}
	if pagination.PageSize <= 0 {
		pagination.PageSize = defaultLimit
	}
	if pagination.PageSize > maxLimit {
		pagination.PageSize = maxLimit
	}
	if pagination.Sort == "" {
		pagination.Sort = "created_at"
	}
	if pagination.Order == "" {
		pagination.Order = "desc"
	}

	// 白名单验证排序字段，防止 SQL 注入
	allowedSortFields := map[string]bool{
		"name": true, "category": true, "created_at": true, "updated_at": true,
		"is_default": true, "is_active": true,
	}
	if !allowedSortFields[pagination.Sort] {
		pagination.Sort = "created_at"
	}
	if pagination.Order != "asc" && pagination.Order != "desc" {
		pagination.Order = "desc"
	}

	// Build query
	query := s.db.WithContext(ctx).Model(&Template{})

	// Apply filters
	if filters.Vendor != "" {
		// Vendor 搜索：
		// 1) 兼容旧逻辑：在 name 或 description 中模糊匹配关键词
		// 2) 兼容内置模板：device_types 可能为对象，包含 vendors 数组
		vendor := strings.TrimSpace(filters.Vendor)
		if vendor != "" {
			vendorPattern := "%" + vendor + "%"
			vendorJSON := fmt.Sprintf(`["%s"]`, vendor)
			query = query.Where(
				"(name ILIKE ? OR description ILIKE ? OR COALESCE(device_types->'vendors','[]'::jsonb) @> ?)",
				vendorPattern,
				vendorPattern,
				vendorJSON,
			)
		}
	}

	if filters.DeviceType != "" {
		// device_types 兼容两种存储形态：
		// - 推荐：["router","switch"]
		// - 历史：{"vendors":[...],"device_types":[...]}
		deviceType := strings.TrimSpace(filters.DeviceType)
		if deviceType != "" {
			filterJSON := fmt.Sprintf(`["%s"]`, deviceType)
			query = query.Where(
				`((jsonb_typeof(device_types) = 'array' AND device_types @> ?) OR (jsonb_typeof(device_types) = 'object' AND COALESCE(device_types->'device_types','[]'::jsonb) @> ?))`,
				filterJSON,
				filterJSON,
			)
		}
	}

	if filters.Category != "" {
		query = query.Where("category = ?", filters.Category)
	}

	if filters.IsDefault != nil {
		query = query.Where("is_default = ?", *filters.IsDefault)
	}

	if filters.Search != "" {
		searchPattern := "%" + filters.Search + "%"
		query = query.Where("name ILIKE ? OR description ILIKE ?", searchPattern, searchPattern)
	}

	// Count total
	var total int64
	if err := query.Count(&total).Error; err != nil {
		return nil, fmt.Errorf("failed to count templates: %w", err)
	}

	// Apply sorting and pagination
	orderClause := fmt.Sprintf("%s %s", pagination.Sort, pagination.Order)
	offset := (pagination.Page - 1) * pagination.PageSize

	var templates []*Template
	if err := query.Order(orderClause).
		Offset(offset).
		Limit(pagination.PageSize).
		Find(&templates).Error; err != nil {
		return nil, fmt.Errorf("failed to list templates: %w", err)
	}

	return &TemplatePage{
		Items:    templates,
		Total:    total,
		Page:     pagination.Page,
		PageSize: pagination.PageSize,
	}, nil
}

// GetByID retrieves a template by ID
// Validates: Requirement 13.2
func (s *Service) GetByID(ctx context.Context, id int) (*Template, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	var template Template
	if err := s.db.WithContext(ctx).Where("id = ?", id).First(&template).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			return nil, ErrTemplateNotFound
		}
		return nil, fmt.Errorf("failed to get template: %w", err)
	}

	return &template, nil
}

// Create creates a new template
// Validates: Requirements 13.3, 12.1, 12.2, 12.3, 12.4, 12.5, 12.6
func (s *Service) Create(ctx context.Context, template *Template) error {
	if s == nil || s.db == nil {
		return fmt.Errorf("database not initialized")
	}

	// Validate template
	if err := s.Validate(ctx, template); err != nil {
		return err
	}

	// Set timestamps
	now := time.Now().UTC()
	template.CreatedAt = &now
	template.UpdatedAt = &now

	// Create template
	if err := s.db.WithContext(ctx).Create(template).Error; err != nil {
		return fmt.Errorf("failed to create template: %w", err)
	}

	return nil
}

// Update updates an existing template
// Validates: Requirements 13.4, 13.9
func (s *Service) Update(ctx context.Context, id int, template *Template) error {
	if s == nil || s.db == nil {
		return fmt.Errorf("database not initialized")
	}

	// Get existing template
	existing, err := s.GetByID(ctx, id)
	if err != nil {
		return err
	}

	// Check if template can be modified (built-in template protection)
	if err := CanModifyTemplate(existing); err != nil {
		return err
	}

	// Validate template
	if err := s.Validate(ctx, template); err != nil {
		return err
	}

	// Update timestamp
	now := time.Now().UTC()

	// 使用 map 更新以确保零值布尔字段（IsDefault=false, IsActive=false）也能被正确更新
	// GORM 的 Updates(struct) 会跳过零值字段
	updates := map[string]interface{}{
		"name":         template.Name,
		"description":  template.Description,
		"category":     template.Category,
		"device_types": template.DeviceTypes,
		"check_items":  template.CheckItems,
		"is_default":   template.IsDefault,
		"is_active":    template.IsActive,
		"updated_at":   &now,
	}

	if err := s.db.WithContext(ctx).Model(&Template{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		return fmt.Errorf("failed to update template: %w", err)
	}

	return nil
}

// Delete deletes a template
// Validates: Requirements 13.5, 13.9
func (s *Service) Delete(ctx context.Context, id int) error {
	if s == nil || s.db == nil {
		return fmt.Errorf("database not initialized")
	}

	// Get existing template
	existing, err := s.GetByID(ctx, id)
	if err != nil {
		return err
	}

	// Check if template can be deleted (built-in template protection)
	if err := CanDeleteTemplate(existing); err != nil {
		return err
	}

	// Delete template
	result := s.db.WithContext(ctx).Delete(&Template{}, id)
	if result.Error != nil {
		return fmt.Errorf("failed to delete template: %w", result.Error)
	}

	if result.RowsAffected == 0 {
		return ErrTemplateNotFound
	}

	return nil
}

// Copy creates a copy of an existing template
// Validates: Requirements 13.6, 10.1, 10.2, 10.3, 10.4
func (s *Service) Copy(ctx context.Context, id int, newName string) (*Template, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	// Get source template
	source, err := s.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	// Create new template
	newTemplate := &Template{
		Name:        newName,
		Description: source.Description,
		Category:    source.Category,
		DeviceTypes: source.DeviceTypes,
		CheckItems:  source.CheckItems,
		IsDefault:   false, // Copied templates are never built-in
		IsActive:    true,
	}

	// If no name provided, add suffix
	if strings.TrimSpace(newName) == "" {
		newTemplate.Name = source.Name + "（副本）"
	}

	// Create the copy
	if err := s.Create(ctx, newTemplate); err != nil {
		return nil, fmt.Errorf("failed to copy template: %w", err)
	}

	return newTemplate, nil
}

// Export exports a template as JSON
// Validates: Requirement 13.8
func (s *Service) Export(ctx context.Context, id int) ([]byte, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	// Get template
	template, err := s.GetByID(ctx, id)
	if err != nil {
		return nil, err
	}

	// Marshal to JSON
	data, err := json.MarshalIndent(template, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("failed to export template: %w", err)
	}

	return data, nil
}

// Import imports a template from JSON
// Validates: Requirements 13.7, 11.1, 11.2, 11.3, 11.4
func (s *Service) Import(ctx context.Context, data []byte, overwrite bool) (*Template, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	// Parse JSON
	var template Template
	if err := json.Unmarshal(data, &template); err != nil {
		return nil, &ValidationError{
			Field:   "json",
			Message: "导入文件格式无效",
			Err:     ErrInvalidImportFormat,
		}
	}

	// Validate template
	if err := s.Validate(ctx, &template); err != nil {
		return nil, &ValidationError{
			Field:   "template",
			Message: "导入数据验证失败",
			Err:     ErrImportValidationFailed,
		}
	}

	// Check for name conflict
	var existing Template
	err := s.db.WithContext(ctx).Where("name = ?", template.Name).First(&existing).Error
	if err == nil {
		// Name exists
		if !overwrite {
			return nil, &ValidationError{
				Field:   "name",
				Message: fmt.Sprintf("模板名称 '%s' 已存在", template.Name),
				Err:     ErrDuplicateTemplateName,
			}
		}
		// Overwrite existing template
		template.ID = existing.ID
		if err := s.Update(ctx, existing.ID, &template); err != nil {
			return nil, err
		}
		return &template, nil
	} else if err != gorm.ErrRecordNotFound {
		return nil, fmt.Errorf("failed to check for existing template: %w", err)
	}

	// Create new template
	template.ID = 0 // Reset ID for new record
	template.IsDefault = false // Imported templates are never built-in
	if err := s.Create(ctx, &template); err != nil {
		return nil, err
	}

	return &template, nil
}

// Validate validates a template
// Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.5, 12.6
func (s *Service) Validate(ctx context.Context, template *Template) error {
	if s == nil || s.validator == nil {
		return fmt.Errorf("validator not initialized")
	}

	return s.validator.ValidateTemplate(ctx, template)
}


// SaveInspectionResult 保存巡检结果
func (s *Service) SaveInspectionResult(ctx context.Context, result *Result) error {
	if s == nil || s.db == nil {
		return fmt.Errorf("database not initialized")
	}

	now := time.Now().UTC()
	if result.CreatedAt == nil {
		result.CreatedAt = &now
	}

	if err := s.db.WithContext(ctx).Create(result).Error; err != nil {
		return fmt.Errorf("failed to save inspection result: %w", err)
	}

	return nil
}

// UpdateInspectionStats 更新巡检统计信息
func (s *Service) UpdateInspectionStats(ctx context.Context, inspectionID int, totalChecks, passedChecks, failedChecks, warningChecks, skippedChecks int) error {
	if s == nil || s.db == nil {
		return fmt.Errorf("database not initialized")
	}

	updates := map[string]interface{}{
		"total_checks":   totalChecks,
		"passed_checks":  passedChecks,
		"failed_checks":  failedChecks,
		"warning_checks": warningChecks,
		"skipped_checks": skippedChecks,
		"updated_at":     time.Now().UTC(),
	}

	if err := s.db.WithContext(ctx).Model(&Inspection{}).Where("id = ?", inspectionID).Updates(updates).Error; err != nil {
		return fmt.Errorf("failed to update inspection stats: %w", err)
	}

	return nil
}
