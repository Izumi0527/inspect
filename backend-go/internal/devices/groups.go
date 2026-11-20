package devices

import (
	"context"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"go.uber.org/zap"
	"gorm.io/gorm"
)

const (
	maxDeviceGroupDepth      = 3
	maxDeviceGroupNameLength = 100
	deviceGroupTreeLockKey   = 7842101
)

// lockDeviceGroupTree 在 PostgreSQL 事务内申请事务级咨询锁，串行化分组树拓扑写操作，
// 防止并发移动/删除在 READ COMMITTED 隔离级下同时通过环路与深度检查导致树成环或超 3 级。
func lockDeviceGroupTree(tx *gorm.DB) error {
	if tx == nil || tx.Dialector == nil || tx.Dialector.Name() != "postgres" {
		return nil
	}
	return tx.Exec("SELECT pg_advisory_xact_lock(?)", deviceGroupTreeLockKey).Error
}

var (
	// ErrGroupValidation 表示分组请求参数或层级约束非法（对应 HTTP 400）。
	ErrGroupValidation = errors.New("invalid device group request")
	// ErrGroupConflict 表示分组名称冲突（对应 HTTP 409）。
	ErrGroupConflict = errors.New("device group conflict")
	// ErrGroupNotEmpty 表示分组下仍存在设备或子分组且拒绝删除（对应 HTTP 409）。
	ErrGroupNotEmpty = errors.New("device group is not empty")
)

type deviceGroupRow struct {
	ID          int        `gorm:"column:id"`
	Name        string     `gorm:"column:name"`
	Description *string    `gorm:"column:description"`
	ParentID    *int       `gorm:"column:parent_id"`
	IsActive    bool       `gorm:"column:is_active"`
	CreatedAt   *time.Time `gorm:"column:created_at"`
	UpdatedAt   *time.Time `gorm:"column:updated_at"`
	DeviceCount int        `gorm:"column:device_count"`
	OnlineCount int        `gorm:"column:online_count"`
}

type groupTreeNode struct {
	ID       int  `gorm:"column:id"`
	ParentID *int `gorm:"column:parent_id"`
}

type groupTree struct {
	parents  map[int]*int
	children map[int][]int
}

// GetDeviceGroups 返回设备分组及统计（默认不附带告警数，避免无权限上下文误透出告警）。
func (s *Service) GetDeviceGroups(ctx context.Context) ([]DeviceGroupResponse, error) {
	return s.ListGroupTreeWithStats(ctx, false)
}

// ListGroupTreeWithStats 返回全部设备分组的树形属性与实时统计。
// includeAlerts 为 false 时不查询告警表，统一返回 alert_count=0 且 alerts_limited_by_permission=true。
func (s *Service) ListGroupTreeWithStats(ctx context.Context, includeAlerts bool) ([]DeviceGroupResponse, error) {
	if s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	rows := make([]deviceGroupRow, 0)
	query := `
        SELECT g.id, g.name, g.description, g.parent_id,
               COALESCE(g.is_active, true) AS is_active,
               g.created_at, g.updated_at,
               COUNT(d.id) AS device_count,
               COALESCE(SUM(CASE WHEN d.status = 'online' THEN 1 ELSE 0 END), 0) AS online_count
        FROM device_groups g
        LEFT JOIN devices d ON d.group_id = g.id
        GROUP BY g.id
        ORDER BY g.name`

	if err := s.db.WithContext(ctx).Raw(query).Scan(&rows).Error; err != nil {
		return nil, err
	}

	alertCounts := map[int]int{}
	if includeAlerts && len(rows) > 0 {
		loaded, err := s.loadGroupAlertCounts(ctx)
		if err != nil {
			if s.logger != nil {
				s.logger.Warn("load device group alert counts failed", zap.Error(err))
			}
		} else {
			alertCounts = loaded
		}
	}

	result := make([]DeviceGroupResponse, 0, len(rows))
	for _, item := range rows {
		result = append(result, buildDeviceGroupResponse(item, alertCounts[item.ID], !includeAlerts))
	}
	return result, nil
}

// GetGroupWithStats 返回指定分组及其实时统计，用于创建/更新后的详情回显。
func (s *Service) GetGroupWithStats(ctx context.Context, groupID int, includeAlerts bool) (*DeviceGroupResponse, error) {
	if s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	var row deviceGroupRow
	query := `
        SELECT g.id, g.name, g.description, g.parent_id,
               COALESCE(g.is_active, true) AS is_active,
               g.created_at, g.updated_at,
               COUNT(d.id) AS device_count,
               COALESCE(SUM(CASE WHEN d.status = 'online' THEN 1 ELSE 0 END), 0) AS online_count
        FROM device_groups g
        LEFT JOIN devices d ON d.group_id = g.id
        WHERE g.id = ?
        GROUP BY g.id`

	if err := s.db.WithContext(ctx).Raw(query, groupID).Scan(&row).Error; err != nil {
		return nil, err
	}
	if row.ID == 0 {
		return nil, gorm.ErrRecordNotFound
	}

	alertCount := 0
	if includeAlerts {
		loaded, err := s.loadGroupAlertCounts(ctx, groupID)
		if err != nil {
			if s.logger != nil {
				s.logger.Warn("load single group alert count failed", zap.Int("group_id", groupID), zap.Error(err))
			}
		} else {
			alertCount = loaded[groupID]
		}
	}

	resp := buildDeviceGroupResponse(row, alertCount, !includeAlerts)
	return &resp, nil
}

// CreateGroup 创建设备分组：校验名称非空唯一、父级存在且深度不超过 3 级，
// 可选在同一事务中将指定 device_ids 归入新建分组。
func (s *Service) CreateGroup(ctx context.Context, req DeviceGroupCreateRequest) (*DeviceGroupResponse, error) {
	if s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		return nil, fmt.Errorf("%w: 分组名称不能为空", ErrGroupValidation)
	}
	if utf8.RuneCountInString(name) > maxDeviceGroupNameLength {
		return nil, fmt.Errorf("%w: 分组名称长度不能超过 %d 个字符", ErrGroupValidation, maxDeviceGroupNameLength)
	}
	if req.ParentID != nil && *req.ParentID <= 0 {
		return nil, fmt.Errorf("%w: parent_id 必须为正整数", ErrGroupValidation)
	}

	deviceIDs, err := normalizeGroupDeviceIDs(req.DeviceIDs)
	if err != nil {
		return nil, err
	}

	var createdID int
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := lockDeviceGroupTree(tx); err != nil {
			return err
		}
		exists, err := checkGroupNameExists(tx, name, 0)
		if err != nil {
			return err
		}
		if exists {
			return fmt.Errorf("%w: 分组名称 %q 已存在", ErrGroupConflict, name)
		}

		if req.ParentID != nil {
			tree, err := loadGroupTree(tx)
			if err != nil {
				return err
			}
			if _, ok := tree.parents[*req.ParentID]; !ok {
				return fmt.Errorf("%w: 父分组不存在", ErrGroupValidation)
			}
			if computeGroupDepth(tree.parents, *req.ParentID) >= maxDeviceGroupDepth {
				return fmt.Errorf("%w: 设备分组层级深度不能超过 %d 级", ErrGroupValidation, maxDeviceGroupDepth)
			}
		}

		if len(deviceIDs) > 0 {
			var foundCount int64
			if err := tx.Table("devices").Where("id IN ?", deviceIDs).Count(&foundCount).Error; err != nil {
				return err
			}
			if foundCount != int64(len(deviceIDs)) {
				return fmt.Errorf("%w: 部分指定的设备不存在", ErrGroupValidation)
			}
		}

		now := time.Now().UTC()
		isActive := true
		if req.IsActive != nil {
			isActive = *req.IsActive
		}
		group := DeviceGroup{
			Name:        name,
			Description: trimOptionalGroupString(req.Description),
			ParentID:    req.ParentID,
			IsActive:    &isActive,
			CreatedAt:   &now,
			UpdatedAt:   &now,
		}
		if err := tx.Create(&group).Error; err != nil {
			if isGroupUniqueViolation(err) {
				return fmt.Errorf("%w: 分组名称 %q 已存在", ErrGroupConflict, name)
			}
			return err
		}
		createdID = group.ID

		if len(deviceIDs) > 0 {
			if err := tx.Table("devices").Where("id IN ?", deviceIDs).Updates(map[string]interface{}{
				"group_id":   createdID,
				"updated_at": now,
			}).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	return s.GetGroupWithStats(ctx, createdID, false)
}

// UpdateGroup 更新设备分组名称、描述、启用状态或父级关系。
// 调整父级时执行 DFS 环路检测，并严格校验 newParentDepth + subtreeHeight(groupID) <= 3。
func (s *Service) UpdateGroup(ctx context.Context, groupID int, req DeviceGroupUpdateRequest) (*DeviceGroupResponse, error) {
	if s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}
	if groupID <= 0 {
		return nil, fmt.Errorf("%w: 无效的 group_id", ErrGroupValidation)
	}

	err := s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := lockDeviceGroupTree(tx); err != nil {
			return err
		}
		var existing DeviceGroup
		if err := tx.Table("device_groups").Where("id = ?", groupID).Take(&existing).Error; err != nil {
			return err
		}

		updates, err := buildGroupUpdates(tx, groupID, req)
		if err != nil {
			return err
		}
		if len(updates) == 0 {
			return fmt.Errorf("%w: 未提供可更新字段", ErrGroupValidation)
		}

		updates["updated_at"] = time.Now().UTC()
		if err := tx.Table("device_groups").Where("id = ?", groupID).Updates(updates).Error; err != nil {
			if isGroupUniqueViolation(err) {
				return fmt.Errorf("%w: 分组名称已存在", ErrGroupConflict)
			}
			return err
		}
		return nil
	})
	if err != nil {
		return nil, err
	}

	return s.GetGroupWithStats(ctx, groupID, false)
}

func buildGroupUpdates(tx *gorm.DB, groupID int, req DeviceGroupUpdateRequest) (map[string]interface{}, error) {
	updates := map[string]interface{}{}

	if req.Name != nil {
		name := strings.TrimSpace(*req.Name)
		if name == "" {
			return nil, fmt.Errorf("%w: 分组名称不能为空", ErrGroupValidation)
		}
		if utf8.RuneCountInString(name) > maxDeviceGroupNameLength {
			return nil, fmt.Errorf("%w: 分组名称长度不能超过 %d 个字符", ErrGroupValidation, maxDeviceGroupNameLength)
		}
		exists, err := checkGroupNameExists(tx, name, groupID)
		if err != nil {
			return nil, err
		}
		if exists {
			return nil, fmt.Errorf("%w: 分组名称 %q 已存在", ErrGroupConflict, name)
		}
		updates["name"] = name
	}

	if req.Description.Set {
		updates["description"] = trimOptionalGroupString(req.Description.Value)
	}
	if req.IsActive != nil {
		updates["is_active"] = *req.IsActive
	}

	if req.ParentID.Set {
		if err := validateGroupReparent(tx, groupID, req.ParentID.Value); err != nil {
			return nil, err
		}
		updates["parent_id"] = req.ParentID.Value
	}

	return updates, nil
}

func validateGroupReparent(tx *gorm.DB, groupID int, newParentID *int) error {
	if newParentID != nil {
		if *newParentID <= 0 {
			return fmt.Errorf("%w: parent_id 必须为正整数", ErrGroupValidation)
		}
		if *newParentID == groupID {
			return fmt.Errorf("%w: 不能将分组设为自身的父分组", ErrGroupValidation)
		}
	}

	tree, err := loadGroupTree(tx)
	if err != nil {
		return err
	}

	newParentDepth := 0
	if newParentID != nil {
		if _, ok := tree.parents[*newParentID]; !ok {
			return fmt.Errorf("%w: 父分组不存在", ErrGroupValidation)
		}
		if isDescendantDFS(tree.children, groupID, *newParentID) {
			return fmt.Errorf("%w: 不能将父分组移动到自身后代分组下（存在环路）", ErrGroupValidation)
		}
		newParentDepth = computeGroupDepth(tree.parents, *newParentID)
	}

	subtreeHeight := computeSubtreeHeightDFS(tree.children, groupID)
	if newParentDepth+subtreeHeight > maxDeviceGroupDepth {
		return fmt.Errorf("%w: 移动后树深度将超过 %d 级限制", ErrGroupValidation, maxDeviceGroupDepth)
	}
	return nil
}

// DeleteGroup 删除设备分组。onNonEmpty 支持 "reject"（默认）与 "unassign"：
//   - reject: 组内存在设备或子分组时返回 ErrGroupNotEmpty (409)
//   - unassign: 事务内清空组内设备归属、将直接子分组 parent_id 上提至被删组的 parent_id，
//     并按表存在探测安全清理 template_group_bindings / monitor_maintenance_targets / alert_rules 引用。
func (s *Service) DeleteGroup(ctx context.Context, groupID int, onNonEmpty string) error {
	if s.db == nil {
		return fmt.Errorf("database not initialized")
	}
	if groupID <= 0 {
		return fmt.Errorf("%w: 无效的 group_id", ErrGroupValidation)
	}

	policy := strings.ToLower(strings.TrimSpace(onNonEmpty))
	if policy == "" {
		policy = "reject"
	}
	if policy != "reject" && policy != "unassign" {
		return fmt.Errorf("%w: on_non_empty 仅支持 reject 或 unassign", ErrGroupValidation)
	}

	return s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := lockDeviceGroupTree(tx); err != nil {
			return err
		}
		var existing DeviceGroup
		if err := tx.Table("device_groups").Where("id = ?", groupID).Take(&existing).Error; err != nil {
			return err
		}

		var deviceCount, childCount int64
		if err := tx.Table("devices").Where("group_id = ?", groupID).Count(&deviceCount).Error; err != nil {
			return err
		}
		if err := tx.Table("device_groups").Where("parent_id = ?", groupID).Count(&childCount).Error; err != nil {
			return err
		}

		if (deviceCount > 0 || childCount > 0) && policy == "reject" {
			return fmt.Errorf("%w: 分组下仍有 %d 台设备与 %d 个子分组", ErrGroupNotEmpty, deviceCount, childCount)
		}

		now := time.Now().UTC()
		if policy == "unassign" {
			if err := tx.Table("devices").Where("group_id = ?", groupID).Updates(map[string]interface{}{
				"group_id":   nil,
				"updated_at": now,
			}).Error; err != nil {
				return err
			}
			if err := tx.Table("device_groups").Where("parent_id = ?", groupID).Updates(map[string]interface{}{
				"parent_id":  existing.ParentID,
				"updated_at": now,
			}).Error; err != nil {
				return err
			}
		}

		if err := cleanupDeletedGroupReferences(tx, groupID); err != nil {
			return err
		}

		return tx.Table("device_groups").Where("id = ?", groupID).Delete(&DeviceGroup{}).Error
	})
}

func cleanupDeletedGroupReferences(tx *gorm.DB, groupID int) error {
	present, err := existingTables(tx, []string{
		"template_group_bindings",
		"monitor_maintenance_targets",
		"alert_rules",
	})
	if err != nil {
		return fmt.Errorf("探测分组关联表失败: %w", err)
	}

	if present["template_group_bindings"] {
		if err := tx.Exec("DELETE FROM template_group_bindings WHERE group_id = ?", groupID).Error; err != nil {
			return fmt.Errorf("清理模板分组绑定失败: %w", err)
		}
	}
	if present["monitor_maintenance_targets"] {
		if err := tx.Exec(
			"DELETE FROM monitor_maintenance_targets WHERE target_type = ? AND target_id = ?",
			"device_group", groupID,
		).Error; err != nil {
			return fmt.Errorf("清理维护期分组目标失败: %w", err)
		}
	}
	if present["alert_rules"] {
		if err := pruneGroupFromAlertRules(tx, groupID); err != nil {
			return fmt.Errorf("清理告警规则中的分组引用失败: %w", err)
		}
	}
	return nil
}

func pruneGroupFromAlertRules(tx *gorm.DB, groupID int) error {
	groupIDText := strconv.Itoa(groupID)
	return tx.Exec(`UPDATE alert_rules AS r SET device_groups = COALESCE((`+
		`SELECT jsonb_agg(e.value ORDER BY e.ord) FROM jsonb_array_elements(r.device_groups::jsonb) WITH ORDINALITY AS e(value, ord) `+
		`WHERE (e.value #>> '{}') <> ?), '[]'::jsonb) `+
		`WHERE r.device_groups IS NOT NULL AND jsonb_typeof(r.device_groups::jsonb) = 'array' `+
		`AND EXISTS (SELECT 1 FROM jsonb_array_elements(r.device_groups::jsonb) AS e WHERE (e.value #>> '{}') = ?)`,
		groupIDText, groupIDText).Error
}

func (s *Service) loadGroupAlertCounts(ctx context.Context, groupIDs ...int) (map[int]int, error) {
	type alertRow struct {
		GroupID    int `gorm:"column:group_id"`
		AlertCount int `gorm:"column:alert_count"`
	}
	rows := make([]alertRow, 0)
	query := s.db.WithContext(ctx).
		Table("alerts a").
		Select("d.group_id, COUNT(a.id) AS alert_count").
		Joins("JOIN devices d ON d.id = a.device_id").
		Where("d.group_id IS NOT NULL AND a.status IN ?", []string{"open", "acknowledged"})
	if len(groupIDs) > 0 {
		query = query.Where("d.group_id IN ?", groupIDs)
	}
	if err := query.Group("d.group_id").Scan(&rows).Error; err != nil {
		return nil, err
	}

	result := make(map[int]int, len(rows))
	for _, row := range rows {
		result[row.GroupID] = row.AlertCount
	}
	return result, nil
}

func buildDeviceGroupResponse(row deviceGroupRow, alertCount int, alertsLimited bool) DeviceGroupResponse {
	createdAt := time.Now().UTC()
	if row.CreatedAt != nil {
		createdAt = *row.CreatedAt
	}
	if alertsLimited {
		alertCount = 0
	}
	return DeviceGroupResponse{
		ID:                        row.ID,
		Name:                      row.Name,
		Description:               row.Description,
		ParentID:                  row.ParentID,
		IsActive:                  row.IsActive,
		DeviceCount:               row.DeviceCount,
		OnlineCount:               row.OnlineCount,
		AlertCount:                alertCount,
		AlertsLimitedByPermission: alertsLimited,
		CreatedAt:                 createdAt,
		UpdatedAt:                 row.UpdatedAt,
	}
}

func checkGroupNameExists(tx *gorm.DB, name string, excludeID int) (bool, error) {
	var count int64
	query := tx.Table("device_groups").Where("name = ?", name)
	if excludeID > 0 {
		query = query.Where("id != ?", excludeID)
	}
	if err := query.Count(&count).Error; err != nil {
		return false, err
	}
	return count > 0, nil
}

func loadGroupTree(tx *gorm.DB) (groupTree, error) {
	rows := make([]groupTreeNode, 0)
	if err := tx.Table("device_groups").Select("id, parent_id").Scan(&rows).Error; err != nil {
		return groupTree{}, err
	}
	tree := groupTree{
		parents:  make(map[int]*int, len(rows)),
		children: make(map[int][]int, len(rows)),
	}
	for _, row := range rows {
		tree.parents[row.ID] = row.ParentID
		if row.ParentID != nil {
			tree.children[*row.ParentID] = append(tree.children[*row.ParentID], row.ID)
		}
	}
	return tree, nil
}

func computeGroupDepth(parents map[int]*int, groupID int) int {
	depth := 0
	visited := make(map[int]struct{})
	curr := &groupID
	for curr != nil {
		if _, seen := visited[*curr]; seen {
			break
		}
		visited[*curr] = struct{}{}
		parent, exists := parents[*curr]
		if !exists {
			break
		}
		depth++
		curr = parent
	}
	return depth
}

func isDescendantDFS(children map[int][]int, rootID, targetID int) bool {
	stack := append([]int{}, children[rootID]...)
	visited := map[int]struct{}{rootID: {}}
	for len(stack) > 0 {
		curr := stack[len(stack)-1]
		stack = stack[:len(stack)-1]
		if curr == targetID {
			return true
		}
		if _, seen := visited[curr]; seen {
			continue
		}
		visited[curr] = struct{}{}
		stack = append(stack, children[curr]...)
	}
	return false
}

func computeSubtreeHeightDFS(children map[int][]int, rootID int) int {
	return subtreeHeightRec(children, rootID, map[int]struct{}{})
}

func subtreeHeightRec(children map[int][]int, nodeID int, visited map[int]struct{}) int {
	if _, seen := visited[nodeID]; seen {
		return 0
	}
	visited[nodeID] = struct{}{}
	maxChild := 0
	for _, childID := range children[nodeID] {
		h := subtreeHeightRec(children, childID, visited)
		if h > maxChild {
			maxChild = h
		}
	}
	return 1 + maxChild
}

func normalizeGroupDeviceIDs(raw []int) ([]int, error) {
	if len(raw) == 0 {
		return nil, nil
	}
	seen := make(map[int]struct{}, len(raw))
	out := make([]int, 0, len(raw))
	for _, id := range raw {
		if id <= 0 {
			return nil, fmt.Errorf("%w: device_ids 必须全部为正整数", ErrGroupValidation)
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
	}
	return out, nil
}

func trimOptionalGroupString(raw *string) *string {
	if raw == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*raw)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func isGroupUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	if errors.Is(err, gorm.ErrDuplicatedKey) {
		return true
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "duplicate key") || strings.Contains(msg, "23505")
}

// existingTables 批量探测候选表名是否存在于当前 schema，用于在渐进迁移阶段
// 安全跳过尚未创建的后续阶段表（如 Phase 1~3 的扩展表与多态目标表）。
func existingTables(db *gorm.DB, candidates []string) (map[string]bool, error) {
	result := make(map[string]bool, len(candidates))
	if db == nil || len(candidates) == 0 {
		return result, nil
	}
	found := make([]string, 0, len(candidates))
	if err := db.Raw(
		"SELECT table_name FROM information_schema.tables WHERE table_schema = current_schema() AND table_name IN ?",
		candidates,
	).Scan(&found).Error; err != nil {
		return nil, err
	}
	for _, name := range found {
		result[name] = true
	}
	return result, nil
}
