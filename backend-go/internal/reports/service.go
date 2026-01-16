package reports

import (
	"context"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"go.uber.org/zap"
	"gorm.io/datatypes"
	"gorm.io/gorm"
)

const (
	defaultPageSize = 20
	maxPageSize     = 100
)

type Service struct {
	db     *gorm.DB
	logger *zap.Logger
}

type ListReportsFilter struct {
	ReportType *string
	Status     *string
	CreatedBy  *string
	StartDate  *time.Time
	EndDate    *time.Time
	Page       int
	PageSize   int
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

func (s *Service) ListReports(ctx context.Context, filter ListReportsFilter) ([]Report, int64, error) {
	if s == nil || s.db == nil {
		return nil, 0, fmt.Errorf("database not initialized")
	}

	page := filter.Page
	if page <= 0 {
		page = 1
	}
	pageSize := filter.PageSize
	if pageSize <= 0 {
		pageSize = defaultPageSize
	}
	if pageSize > maxPageSize {
		pageSize = maxPageSize
	}

	query := s.db.WithContext(ctx).Model(&Report{})
	if filter.ReportType != nil && strings.TrimSpace(*filter.ReportType) != "" {
		query = query.Where("report_type = ?", strings.TrimSpace(*filter.ReportType))
	}
	if filter.Status != nil && strings.TrimSpace(*filter.Status) != "" {
		query = query.Where("status = ?", strings.TrimSpace(*filter.Status))
	}
	if filter.CreatedBy != nil && strings.TrimSpace(*filter.CreatedBy) != "" {
		query = query.Where("generated_by = ?", strings.TrimSpace(*filter.CreatedBy))
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

	var reports []Report
	if err := query.Order("created_at desc").
		Offset((page - 1) * pageSize).
		Limit(pageSize).
		Find(&reports).Error; err != nil {
		return nil, 0, err
	}

	return reports, total, nil
}

func (s *Service) GetReport(ctx context.Context, id int) (Report, error) {
	if s == nil || s.db == nil {
		return Report{}, fmt.Errorf("database not initialized")
	}
	var report Report
	if err := s.db.WithContext(ctx).Take(&report, id).Error; err != nil {
		return Report{}, err
	}
	return report, nil
}

func (s *Service) CreateReport(ctx context.Context, report *Report) error {
	if s == nil || s.db == nil {
		return fmt.Errorf("database not initialized")
	}
	if report == nil {
		return fmt.Errorf("report is nil")
	}
	return s.db.WithContext(ctx).Create(report).Error
}

func (s *Service) UpdateReport(ctx context.Context, id int, updates map[string]interface{}) (Report, error) {
	if s == nil || s.db == nil {
		return Report{}, fmt.Errorf("database not initialized")
	}
	if len(updates) == 0 {
		return s.GetReport(ctx, id)
	}

	if err := s.db.WithContext(ctx).Model(&Report{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		return Report{}, err
	}
	return s.GetReport(ctx, id)
}

func (s *Service) DeleteReport(ctx context.Context, id int) error {
	if s == nil || s.db == nil {
		return fmt.Errorf("database not initialized")
	}
	return s.db.WithContext(ctx).Delete(&Report{}, id).Error
}

func (s *Service) ListTemplates(ctx context.Context, reportType *string) ([]ReportTemplate, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	query := s.db.WithContext(ctx).Model(&ReportTemplate{})
	if reportType != nil && strings.TrimSpace(*reportType) != "" {
		query = query.Where("report_type = ?", strings.TrimSpace(*reportType))
	}

	var templates []ReportTemplate
	if err := query.Order("created_at desc").Find(&templates).Error; err != nil {
		return nil, err
	}
	return templates, nil
}

func (s *Service) GetTemplate(ctx context.Context, id int) (ReportTemplate, error) {
	if s == nil || s.db == nil {
		return ReportTemplate{}, fmt.Errorf("database not initialized")
	}
	var template ReportTemplate
	if err := s.db.WithContext(ctx).Take(&template, id).Error; err != nil {
		return ReportTemplate{}, err
	}
	return template, nil
}

func (s *Service) CreateTemplate(ctx context.Context, template *ReportTemplate) error {
	if s == nil || s.db == nil {
		return fmt.Errorf("database not initialized")
	}
	if template == nil {
		return fmt.Errorf("template is nil")
	}
	return s.db.WithContext(ctx).Create(template).Error
}

func (s *Service) UpdateTemplate(ctx context.Context, id int, updates map[string]interface{}) (ReportTemplate, error) {
	if s == nil || s.db == nil {
		return ReportTemplate{}, fmt.Errorf("database not initialized")
	}
	if len(updates) == 0 {
		return s.GetTemplate(ctx, id)
	}
	if err := s.db.WithContext(ctx).Model(&ReportTemplate{}).Where("id = ?", id).Updates(updates).Error; err != nil {
		return ReportTemplate{}, err
	}
	return s.GetTemplate(ctx, id)
}

func (s *Service) DeleteTemplate(ctx context.Context, id int) error {
	if s == nil || s.db == nil {
		return fmt.Errorf("database not initialized")
	}
	return s.db.WithContext(ctx).Delete(&ReportTemplate{}, id).Error
}

func (s *Service) CloneTemplate(ctx context.Context, id int, name string) (ReportTemplate, error) {
	template, err := s.GetTemplate(ctx, id)
	if err != nil {
		return ReportTemplate{}, err
	}
	template.ID = 0
	template.Name = name
	template.CreatedAt = nil
	template.UpdatedAt = nil
	if err := s.CreateTemplate(ctx, &template); err != nil {
		return ReportTemplate{}, err
	}
	return template, nil
}

func (s *Service) ListSchedules(ctx context.Context) ([]ReportSchedule, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}
	var schedules []ReportSchedule
	if err := s.db.WithContext(ctx).Order("created_at desc").Find(&schedules).Error; err != nil {
		return nil, err
	}
	return schedules, nil
}

func (s *Service) GetSchedule(ctx context.Context, id int) (ReportSchedule, error) {
	if s == nil || s.db == nil {
		return ReportSchedule{}, fmt.Errorf("database not initialized")
	}
	var schedule ReportSchedule
	if err := s.db.WithContext(ctx).Take(&schedule, id).Error; err != nil {
		return ReportSchedule{}, err
	}
	return schedule, nil
}

func (s *Service) CreateSchedule(ctx context.Context, schedule *ReportSchedule) error {
	if s == nil || s.db == nil {
		return fmt.Errorf("database not initialized")
	}
	if schedule == nil {
		return fmt.Errorf("schedule is nil")
	}
	return s.db.WithContext(ctx).Create(schedule).Error
}

func (s *Service) DeleteSchedule(ctx context.Context, id int) error {
	if s == nil || s.db == nil {
		return fmt.Errorf("database not initialized")
	}
	return s.db.WithContext(ctx).Delete(&ReportSchedule{}, id).Error
}

func encodeJSON(value interface{}) (datatypes.JSON, error) {
	if value == nil {
		return datatypes.JSON([]byte("null")), nil
	}
	raw, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	return datatypes.JSON(raw), nil
}

func decodeJSONMap(raw datatypes.JSON) map[string]interface{} {
	if len(raw) == 0 {
		return map[string]interface{}{}
	}
	var result map[string]interface{}
	if err := json.Unmarshal(raw, &result); err != nil {
		return map[string]interface{}{}
	}
	return result
}

func decodeJSONArray(raw datatypes.JSON) []interface{} {
	if len(raw) == 0 {
		return []interface{}{}
	}
	var result []interface{}
	if err := json.Unmarshal(raw, &result); err != nil {
		return []interface{}{}
	}
	return result
}

func decodeJSONStringSlice(raw datatypes.JSON) []string {
	if len(raw) == 0 {
		return []string{}
	}
	var result []string
	if err := json.Unmarshal(raw, &result); err != nil {
		return []string{}
	}
	return result
}
