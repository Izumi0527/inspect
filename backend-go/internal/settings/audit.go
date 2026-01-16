package settings

import (
	"context"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"
)

type AuditQuery struct {
	Page      int
	PageSize  int
	UserID    string
	Action    string
	Status    string
	Resource  string
	Search    string
	Keyword   string
	StartTime *time.Time
	EndTime   *time.Time
}

func (s *Service) ListAuditLogs(ctx context.Context, query AuditQuery) (AuditLogListResponse, error) {
	if !s.isReady() {
		return AuditLogListResponse{}, fmt.Errorf("database not initialized")
	}

	page := query.Page
	if page <= 0 {
		page = 1
	}
	pageSize := query.PageSize
	if pageSize <= 0 {
		pageSize = 50
	}

	filters, args := buildAuditFilters(query)

	countSQL := "SELECT COUNT(*) FROM audit_logs l"
	if filters != "" {
		countSQL += " WHERE " + filters
	}

	var total int64
	if err := s.db.WithContext(ctx).Raw(countSQL, args...).Scan(&total).Error; err != nil {
		return AuditLogListResponse{}, err
	}

	querySQL := `
		SELECT l.id, l.user_id, u.username, l.action, l.resource_type, l.resource_id,
		       l.description, l.details, l.ip_address, l.user_agent, l.status,
		       l.error_message, l.created_at
		FROM audit_logs l
		LEFT JOIN users u ON u.id = l.user_id`
	if filters != "" {
		querySQL += " WHERE " + filters
	}
	querySQL += " ORDER BY l.created_at DESC LIMIT ? OFFSET ?"

	args = append(args, pageSize, (page-1)*pageSize)

	rows := make([]struct {
		ID           string
		UserID       *string
		Username     *string
		Action       string
		ResourceType string
		ResourceID   *string
		Description  string
		Details      []byte
		IPAddress    *string
		UserAgent    *string
		Status       string
		ErrorMessage *string
		CreatedAt    *time.Time
	}, 0)

	if err := s.db.WithContext(ctx).Raw(querySQL, args...).Scan(&rows).Error; err != nil {
		return AuditLogListResponse{}, err
	}

	items := make([]AuditLogItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, buildAuditItem(row))
	}

	return AuditLogListResponse{
		Items:    items,
		Total:    int(total),
		Page:     page,
		PageSize: pageSize,
	}, nil
}

func (s *Service) GetAuditLog(ctx context.Context, logID string) (*AuditLogItem, error) {
	if !s.isReady() {
		return nil, fmt.Errorf("database not initialized")
	}
	id := strings.TrimSpace(logID)
	if id == "" {
		return nil, gorm.ErrRecordNotFound
	}

	querySQL := `
		SELECT l.id, l.user_id, u.username, l.action, l.resource_type, l.resource_id,
		       l.description, l.details, l.ip_address, l.user_agent, l.status,
		       l.error_message, l.created_at
		FROM audit_logs l
		LEFT JOIN users u ON u.id = l.user_id
		WHERE l.id = ?`

	row := struct {
		ID           string
		UserID       *string
		Username     *string
		Action       string
		ResourceType string
		ResourceID   *string
		Description  string
		Details      []byte
		IPAddress    *string
		UserAgent    *string
		Status       string
		ErrorMessage *string
		CreatedAt    *time.Time
	}{}

	if err := s.db.WithContext(ctx).Raw(querySQL, id).Scan(&row).Error; err != nil {
		return nil, err
	}
	if row.ID == "" {
		return nil, gorm.ErrRecordNotFound
	}

	item := buildAuditItem(row)
	return &item, nil
}

func (s *Service) CleanupAuditLogs(ctx context.Context, before time.Time) (int64, error) {
	if !s.isReady() {
		return 0, fmt.Errorf("database not initialized")
	}

	result := s.db.WithContext(ctx).Where("created_at < ?", before).Delete(&AuditLog{})
	if result.Error != nil {
		return 0, result.Error
	}
	return result.RowsAffected, nil
}

func (s *Service) GetAuditStats(ctx context.Context) (AuditStatsResponse, error) {
	if !s.isReady() {
		return AuditStatsResponse{}, fmt.Errorf("database not initialized")
	}

	now := time.Now().UTC()
	stats := AuditStatsResponse{
		LogsByAction:       map[string]int{},
		LogsByStatus:       map[string]int{},
		LogsByResourceType: map[string]int{},
		TopActiveUsers:     []map[string]interface{}{},
		TopActions:         []map[string]interface{}{},
	}

	stats.TotalLogs = s.countAuditLogs(ctx, "", nil)
	stats.LogsToday = s.countAuditLogs(ctx, "created_at >= ?", []interface{}{startOfDay(now)})
	stats.LogsThisWeek = s.countAuditLogs(ctx, "created_at >= ?", []interface{}{startOfWeek(now)})
	stats.LogsThisMonth = s.countAuditLogs(ctx, "created_at >= ?", []interface{}{startOfMonth(now)})

	stats.LogsByAction = s.groupAuditCounts(ctx, "action")
	stats.LogsByStatus = s.groupAuditCounts(ctx, "status")
	stats.LogsByResourceType = s.groupAuditCounts(ctx, "resource_type")

	stats.TopActiveUsers = s.topAuditUsers(ctx)
	stats.TopActions = s.topAuditActions(ctx)

	failed := s.countAuditLogs(ctx, "status <> ?", []interface{}{ "success" })
	stats.FailedOperationsCount = failed
	if stats.TotalLogs > 0 {
		stats.FailedOperationsRate = float64(failed) / float64(stats.TotalLogs) * 100
	}

	return stats, nil
}

func (s *Service) QueryAuditLogs(ctx context.Context, query AuditQuery) ([]AuditLogItem, error) {
	if !s.isReady() {
		return nil, fmt.Errorf("database not initialized")
	}

	filters, args := buildAuditFilters(query)
	querySQL := `
		SELECT l.id, l.user_id, u.username, l.action, l.resource_type, l.resource_id,
		       l.description, l.details, l.ip_address, l.user_agent, l.status,
		       l.error_message, l.created_at
		FROM audit_logs l
		LEFT JOIN users u ON u.id = l.user_id`
	if filters != "" {
		querySQL += " WHERE " + filters
	}
	querySQL += " ORDER BY l.created_at DESC"

	rows := make([]struct {
		ID           string
		UserID       *string
		Username     *string
		Action       string
		ResourceType string
		ResourceID   *string
		Description  string
		Details      []byte
		IPAddress    *string
		UserAgent    *string
		Status       string
		ErrorMessage *string
		CreatedAt    *time.Time
	}, 0)

	if err := s.db.WithContext(ctx).Raw(querySQL, args...).Scan(&rows).Error; err != nil {
		return nil, err
	}

	items := make([]AuditLogItem, 0, len(rows))
	for _, row := range rows {
		items = append(items, buildAuditItem(row))
	}

	return items, nil
}

func buildAuditFilters(query AuditQuery) (string, []interface{}) {
	filters := make([]string, 0)
	args := make([]interface{}, 0)

	if query.UserID != "" {
		filters = append(filters, "l.user_id = ?")
		args = append(args, query.UserID)
	}
	if query.Action != "" {
		filters = append(filters, "l.action = ?")
		args = append(args, query.Action)
	}
	if query.Status != "" {
		filters = append(filters, "l.status = ?")
		args = append(args, query.Status)
	}
	resource := strings.TrimSpace(query.Resource)
	if resource != "" {
		filters = append(filters, "l.resource_type = ?")
		args = append(args, resource)
	}
	search := strings.TrimSpace(query.Search)
	if search == "" {
		search = strings.TrimSpace(query.Keyword)
	}
	if search != "" {
		filters = append(filters, "(l.description ILIKE ? OR l.resource_type ILIKE ?)")
		pattern := "%%" + search + "%%"
		args = append(args, pattern, pattern)
	}
	if query.StartTime != nil {
		filters = append(filters, "l.created_at >= ?")
		args = append(args, *query.StartTime)
	}
	if query.EndTime != nil {
		filters = append(filters, "l.created_at <= ?")
		args = append(args, *query.EndTime)
	}

	return strings.Join(filters, " AND "), args
}

func buildAuditItem(row struct {
	ID           string
	UserID       *string
	Username     *string
	Action       string
	ResourceType string
	ResourceID   *string
	Description  string
	Details      []byte
	IPAddress    *string
	UserAgent    *string
	Status       string
	ErrorMessage *string
	CreatedAt    *time.Time
}) AuditLogItem {
	item := AuditLogItem{
		ID:           row.ID,
		UserID:       row.UserID,
		UserIDCamel:  row.UserID,
		Username:     row.Username,
		Action:       row.Action,
		ResourceType: row.ResourceType,
		ResourceID:   row.ResourceID,
		Description:  row.Description,
		Details:      row.Description,
		IPAddress:    row.IPAddress,
		UserAgent:    row.UserAgent,
		Status:       row.Status,
		ErrorMessage: row.ErrorMessage,
		CreatedAt:    row.CreatedAt,
		Resource:     row.ResourceType,
		Method:       "",
		Path:         "",
		IP:           safeString(row.IPAddress),
		Timestamp:    row.CreatedAt,
		Duration:     0,
	}

	if len(row.Details) > 0 {
		item.Details = string(row.Details)
	}

	return item
}

func (s *Service) countAuditLogs(ctx context.Context, where string, args []interface{}) int {
	var count int64
	query := s.db.WithContext(ctx).Model(&AuditLog{})
	if where != "" {
		query = query.Where(where, args...)
	}
	_ = query.Count(&count).Error
	return int(count)
}

func (s *Service) groupAuditCounts(ctx context.Context, column string) map[string]int {
	rows := make([]struct {
		Key   string
		Count int
	}, 0)

	query := fmt.Sprintf("SELECT %s as key, COUNT(*) as count FROM audit_logs GROUP BY %s", column, column)
	_ = s.db.WithContext(ctx).Raw(query).Scan(&rows).Error

	result := make(map[string]int)
	for _, row := range rows {
		if strings.TrimSpace(row.Key) == "" {
			continue
		}
		result[row.Key] = row.Count
	}
	return result
}

func (s *Service) topAuditUsers(ctx context.Context) []map[string]interface{} {
	rows := make([]struct {
		UserID   *string
		Username *string
		Count    int
	}, 0)

	query := `
		SELECT l.user_id, u.username, COUNT(*) as count
		FROM audit_logs l
		LEFT JOIN users u ON u.id = l.user_id
		GROUP BY l.user_id, u.username
		ORDER BY count DESC
		LIMIT 5`
	_ = s.db.WithContext(ctx).Raw(query).Scan(&rows).Error

	result := make([]map[string]interface{}, 0, len(rows))
	for _, row := range rows {
		result = append(result, map[string]interface{}{
			"user_id":  row.UserID,
			"username": safeString(row.Username),
			"count":    row.Count,
		})
	}
	return result
}

func (s *Service) topAuditActions(ctx context.Context) []map[string]interface{} {
	rows := make([]struct {
		Action string
		Count  int
	}, 0)

	query := `
		SELECT action, COUNT(*) as count
		FROM audit_logs
		GROUP BY action
		ORDER BY count DESC
		LIMIT 5`
	_ = s.db.WithContext(ctx).Raw(query).Scan(&rows).Error

	result := make([]map[string]interface{}, 0, len(rows))
	for _, row := range rows {
		if strings.TrimSpace(row.Action) == "" {
			continue
		}
		result = append(result, map[string]interface{}{
			"action": row.Action,
			"count":  row.Count,
		})
	}
	return result
}
