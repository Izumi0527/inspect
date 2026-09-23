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

	"github.com/your-org/inspect-system/backend-go/internal/ws"
)

const (
	defaultPageSize = 20
	maxPageSize     = 100
)

type Service struct {
	db     *gorm.DB
	logger *zap.Logger
	// notifier 为空时终态不推送（单测/脚本场景），由装配层注入 ws.Manager
	notifier ws.RoomPublisher
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

// WithNotifier 注入通知房间发布器：报表生成成功/失败落库后向 notifications 房间推送变更事件。
func (s *Service) WithNotifier(publisher ws.RoomPublisher) *Service {
	if s != nil {
		s.notifier = publisher
	}
	return s
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

	if status, ok := updates["status"].(string); ok && isTerminalReportStatus(status) {
		ws.PublishNotificationChange(s.notifier, ws.NotificationChange{
			Source: ws.NotificationSourceReport,
			ID:     fmt.Sprintf("%d", id),
			Status: status,
		})
	}
	return s.GetReport(ctx, id)
}

// 与通知中心 buildReportNotifications 的入选状态保持一致：只有这两个状态会成为一条系统消息
func isTerminalReportStatus(status string) bool {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "completed", "failed":
		return true
	default:
		return false
	}
}

func (s *Service) DeleteReport(ctx context.Context, id int) error {
	if s == nil || s.db == nil {
		return fmt.Errorf("database not initialized")
	}
	return s.db.WithContext(ctx).Delete(&Report{}, id).Error
}

// BackfillInspectionReportDeviceIDs 为历史巡检报告回填 device_filters.device_ids（幂等，单条 UPDATE 原子完成）。
//
// 执行历史导出的报告曾只落库 inspection_ids（更早为 task_id），报表列表「参数范围」
// 读取的 device_ids 缺失，整批报告因此显示成「0 个设备」：
//   - 口径：与报告数据源一致，inspection_ids 优先、task_id 兜底，取对应巡检行的设备；
//   - 幂等：仅处理 device_ids 不是数组的巡检报告，重复执行零副作用；
//   - 巡检行已被删除的报告无从推导，保持原样（前端不展示设备数）。
func (s *Service) BackfillInspectionReportDeviceIDs(ctx context.Context) (int64, error) {
	if s == nil || s.db == nil {
		return 0, fmt.Errorf("database not initialized")
	}

	result := s.db.WithContext(ctx).Exec(`
WITH report_scope AS (
    SELECT r.id AS report_id,
           CASE
               WHEN jsonb_typeof(r.device_filters -> 'inspection_ids') = 'array'
                   THEN r.device_filters -> 'inspection_ids'
               WHEN jsonb_typeof(r.device_filters -> 'task_id') = 'number'
                   THEN jsonb_build_array(r.device_filters -> 'task_id')
           END AS inspection_ids
    FROM reports r
    WHERE r.report_type = 'inspection'
      AND jsonb_typeof(r.device_filters -> 'device_ids') IS DISTINCT FROM 'array'
),
report_devices AS (
    SELECT s.report_id,
           jsonb_agg(DISTINCT i.device_id ORDER BY i.device_id) AS device_ids
    FROM report_scope s
    CROSS JOIN LATERAL jsonb_array_elements_text(s.inspection_ids) AS scoped(inspection_id)
    JOIN inspections i ON i.id = scoped.inspection_id::bigint
    WHERE i.device_id > 0
    GROUP BY s.report_id
)
UPDATE reports r
SET device_filters = r.device_filters || jsonb_build_object('device_ids', d.device_ids)
FROM report_devices d
WHERE r.id = d.report_id`)
	if result.Error != nil {
		return 0, result.Error
	}
	return result.RowsAffected, nil
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

// ListTemplateLibrary 返回可复用的报表模板库条目。
//
// 自定义报表配置与报表模板共用 report_templates 表，靠 report_type 区分：
// report_type='custom' 是用户在「自定义报表」页创建的个人配置，由 ListCustomConfigs 负责；
// 其余类型才属于可供复用的模板库。
// 不做这层区分时，模板库会把用户自己的配置当成「可导入的模板」列出来，
// 使「导入模板」退化为「复制自己的配置」。
func (s *Service) ListTemplateLibrary(ctx context.Context) ([]ReportTemplate, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	var templates []ReportTemplate
	if err := s.db.WithContext(ctx).
		Model(&ReportTemplate{}).
		Where("report_type IS NULL OR report_type <> ?", "custom").
		Order("created_at desc").
		Find(&templates).Error; err != nil {
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
