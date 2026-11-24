package monitoring

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	"gorm.io/datatypes"
	"gorm.io/gorm"
)

var (
	ErrMaintenanceNotFound   = errors.New("maintenance window not found")
	ErrMaintenanceValidation = errors.New("invalid maintenance window payload")
)

// IsMaintenanceActiveAt 判断维护窗口在指定时刻 now 是否处于生效期。
// 完整支持 once / weekly / monthly，按显式时区（默认 Asia/Shanghai）计算，并支持跨零点窗口（如 23:00-02:00）。
func IsMaintenanceActiveAt(m MonitorMaintenance, now time.Time) bool {
	if !m.Enabled {
		return false
	}

	tz := strings.TrimSpace(m.Timezone)
	if tz == "" {
		tz = DefaultMaintenanceTimezone
	}
	loc, err := time.LoadLocation(tz)
	if err != nil {
		return false
	}

	switch strings.ToLower(strings.TrimSpace(m.ScheduleType)) {
	case MaintenanceScheduleOnce:
		if m.StartTime.IsZero() || m.EndTime.IsZero() || !m.EndTime.After(m.StartTime) {
			return false
		}
		nowUTC := now.UTC()
		return !nowUTC.Before(m.StartTime.UTC()) && nowUTC.Before(m.EndTime.UTC())

	case MaintenanceScheduleWeekly:
		rec, ok := parseMaintenanceRecurrence(m.RecurrenceJSON)
		if !ok {
			return false
		}
		startMin, endMin, ok := parseHMWindow(rec.StartHM, rec.EndHM)
		if !ok {
			return false
		}
		daySet := make(map[int]bool, len(rec.Weekdays))
		for _, wd := range rec.Weekdays {
			if wd == 7 {
				wd = 0
			}
			if wd >= 0 && wd <= 6 {
				daySet[wd] = true
			}
		}
		if len(daySet) == 0 {
			return false
		}

		nowLocal := now.In(loc)
		curMin := nowLocal.Hour()*60 + nowLocal.Minute()
		if startMin < endMin {
			return daySet[int(nowLocal.Weekday())] && curMin >= startMin && curMin < endMin
		}
		// 跨零点窗口（如 23:00 - 02:00）：当天 startMin..24:00 或 昨天触发延续到今天 00:00..endMin
		if daySet[int(nowLocal.Weekday())] && curMin >= startMin {
			return true
		}
		yesterday := nowLocal.AddDate(0, 0, -1)
		return daySet[int(yesterday.Weekday())] && curMin < endMin

	case MaintenanceScheduleMonthly:
		rec, ok := parseMaintenanceRecurrence(m.RecurrenceJSON)
		if !ok {
			return false
		}
		startMin, endMin, ok := parseHMWindow(rec.StartHM, rec.EndHM)
		if !ok {
			return false
		}
		domSet := make(map[int]bool, len(rec.DaysOfMonth))
		for _, d := range rec.DaysOfMonth {
			if d >= 1 && d <= 31 {
				domSet[d] = true
			}
		}
		if len(domSet) == 0 {
			return false
		}

		nowLocal := now.In(loc)
		curMin := nowLocal.Hour()*60 + nowLocal.Minute()
		if startMin < endMin {
			return domSet[nowLocal.Day()] && curMin >= startMin && curMin < endMin
		}
		if domSet[nowLocal.Day()] && curMin >= startMin {
			return true
		}
		yesterday := nowLocal.AddDate(0, 0, -1)
		return domSet[yesterday.Day()] && curMin < endMin

	default:
		return false
	}
}

func parseMaintenanceRecurrence(raw datatypes.JSON) (MaintenanceRecurrence, bool) {
	var rec MaintenanceRecurrence
	if len(raw) == 0 {
		return rec, false
	}
	if err := json.Unmarshal(raw, &rec); err != nil {
		return rec, false
	}
	return rec, true
}

func parseHM(hm string) (int, bool) {
	parts := strings.Split(strings.TrimSpace(hm), ":")
	if len(parts) != 2 {
		return 0, false
	}
	h, err1 := strconv.Atoi(parts[0])
	m, err2 := strconv.Atoi(parts[1])
	if err1 != nil || err2 != nil || h < 0 || h > 23 || m < 0 || m > 59 {
		return 0, false
	}
	return h*60 + m, true
}

func parseHMWindow(startHM, endHM string) (int, int, bool) {
	s, ok1 := parseHM(startHM)
	e, ok2 := parseHM(endHM)
	if !ok1 || !ok2 || s == e {
		return 0, 0, false
	}
	return s, e, true
}

// GetActiveWindowForDevice 查询单台设备在指定时刻是否处于生效维护窗口（支持直接设备目标与祖先设备组继承）。
func (w *MetricsWriter) GetActiveWindowForDevice(ctx context.Context, deviceID int, groupID *int, now time.Time) (*ActiveMaintenance, error) {
	if w == nil || w.db == nil || deviceID <= 0 {
		return nil, nil
	}

	var windows []MonitorMaintenance
	if err := w.db.WithContext(ctx).
		Table("monitor_maintenances").
		Where("enabled = ?", true).
		Find(&windows).Error; err != nil {
		return nil, err
	}

	activeMap := make(map[int64]MonitorMaintenance)
	activeIDs := make([]int64, 0)
	for _, m := range windows {
		if IsMaintenanceActiveAt(m, now) {
			activeMap[m.ID] = m
			activeIDs = append(activeIDs, m.ID)
		}
	}
	if len(activeIDs) == 0 {
		return nil, nil
	}

	// 若调用方未传入 groupID，尝试从 devices 表兜底读取
	resolvedGroupID := groupID
	if resolvedGroupID == nil {
		var devRow struct {
			GroupID *int `gorm:"column:group_id"`
		}
		if err := w.db.WithContext(ctx).
			Table("devices").
			Select("group_id").
			Where("id = ?", deviceID).
			Take(&devRow).Error; err == nil {
			resolvedGroupID = devRow.GroupID
		}
	}

	ancestorGroupIDs := w.resolveAncestorGroupIDs(ctx, resolvedGroupID)

	var targets []MonitorMaintenanceTarget
	q := w.db.WithContext(ctx).
		Table("monitor_maintenance_targets").
		Where("maintenance_id IN ?", activeIDs)
	if len(ancestorGroupIDs) > 0 {
		q = q.Where("(target_type = ? AND target_id = ?) OR (target_type = ? AND target_id IN ?)",
			MaintenanceTargetDevice, deviceID, MaintenanceTargetDeviceGroup, ancestorGroupIDs)
	} else {
		q = q.Where("target_type = ? AND target_id = ?", MaintenanceTargetDevice, deviceID)
	}
	if err := q.Find(&targets).Error; err != nil {
		return nil, err
	}
	if len(targets) == 0 {
		return nil, nil
	}

	var best *ActiveMaintenance
	for _, t := range targets {
		m, ok := activeMap[t.MaintenanceID]
		if !ok {
			continue
		}
		cand := ActiveMaintenance{
			MaintenanceID:     m.ID,
			Name:              m.Name,
			Mode:              m.Mode,
			ScheduleType:      m.ScheduleType,
			Timezone:          m.Timezone,
			StartTime:         m.StartTime,
			EndTime:           m.EndTime,
			MatchedTargetType: t.TargetType,
			MatchedTargetID:   t.TargetID,
		}
		if best == nil || maintenanceHasHigherPriority(cand, *best) {
			copyCand := cand
			best = &copyCand
		}
	}
	return best, nil
}

// GetActiveMaintenanceMapForDevices 批量返回当前处于维护窗口的设备映射（含祖先分组继承）。
func (w *MetricsWriter) GetActiveMaintenanceMapForDevices(ctx context.Context, now time.Time) (map[int]ActiveMaintenance, error) {
	result := make(map[int]ActiveMaintenance)
	if w == nil || w.db == nil {
		return result, nil
	}

	var windows []MonitorMaintenance
	if err := w.db.WithContext(ctx).
		Table("monitor_maintenances").
		Where("enabled = ?", true).
		Find(&windows).Error; err != nil {
		return result, err
	}

	activeMap := make(map[int64]MonitorMaintenance)
	activeIDs := make([]int64, 0)
	for _, m := range windows {
		if IsMaintenanceActiveAt(m, now) {
			activeMap[m.ID] = m
			activeIDs = append(activeIDs, m.ID)
		}
	}
	if len(activeIDs) == 0 {
		return result, nil
	}

	var targets []MonitorMaintenanceTarget
	if err := w.db.WithContext(ctx).
		Table("monitor_maintenance_targets").
		Where("maintenance_id IN ?", activeIDs).
		Find(&targets).Error; err != nil {
		return result, err
	}
	if len(targets) == 0 {
		return result, nil
	}

	type devGroupRow struct {
		ID      int  `gorm:"column:id"`
		GroupID *int `gorm:"column:group_id"`
	}
	var devs []devGroupRow
	if err := w.db.WithContext(ctx).
		Table("devices").
		Select("id, group_id").
		Where("is_active = ?", true).
		Scan(&devs).Error; err != nil {
		return result, err
	}

	parentMap := w.loadGroupParentMap(ctx)

	targetsByDevice := make(map[int64][]MonitorMaintenanceTarget)
	targetsByGroup := make(map[int64][]MonitorMaintenanceTarget)
	for _, t := range targets {
		switch t.TargetType {
		case MaintenanceTargetDevice:
			targetsByDevice[t.TargetID] = append(targetsByDevice[t.TargetID], t)
		case MaintenanceTargetDeviceGroup:
			targetsByGroup[t.TargetID] = append(targetsByGroup[t.TargetID], t)
		}
	}

	for _, d := range devs {
		var best *ActiveMaintenance
		consider := func(t MonitorMaintenanceTarget) {
			m, ok := activeMap[t.MaintenanceID]
			if !ok {
				return
			}
			cand := ActiveMaintenance{
				MaintenanceID:     m.ID,
				Name:              m.Name,
				Mode:              m.Mode,
				ScheduleType:      m.ScheduleType,
				Timezone:          m.Timezone,
				StartTime:         m.StartTime,
				EndTime:           m.EndTime,
				MatchedTargetType: t.TargetType,
				MatchedTargetID:   t.TargetID,
			}
			if best == nil || maintenanceHasHigherPriority(cand, *best) {
				copyCand := cand
				best = &copyCand
			}
		}

		for _, t := range targetsByDevice[int64(d.ID)] {
			consider(t)
		}
		for _, gid := range walkAncestorsFromMap(d.GroupID, parentMap) {
			for _, t := range targetsByGroup[int64(gid)] {
				consider(t)
			}
		}
		if best != nil {
			result[d.ID] = *best
		}
	}
	return result, nil
}

func maintenanceHasHigherPriority(a, b ActiveMaintenance) bool {
	if a.Mode != b.Mode {
		return a.Mode == MaintenanceModePauseCollection
	}
	if a.MatchedTargetType != b.MatchedTargetType {
		return a.MatchedTargetType == MaintenanceTargetDevice
	}
	return a.MaintenanceID < b.MaintenanceID
}

func (w *MetricsWriter) loadGroupParentMap(ctx context.Context) map[int]*int {
	type groupRow struct {
		ID       int  `gorm:"column:id"`
		ParentID *int `gorm:"column:parent_id"`
	}
	var groups []groupRow
	_ = w.db.WithContext(ctx).Table("device_groups").Select("id, parent_id").Scan(&groups).Error
	parentMap := make(map[int]*int, len(groups))
	for _, g := range groups {
		parentMap[g.ID] = g.ParentID
	}
	return parentMap
}

func (w *MetricsWriter) resolveAncestorGroupIDs(ctx context.Context, groupID *int) []int {
	if groupID == nil || *groupID <= 0 {
		return nil
	}
	return walkAncestorsFromMap(groupID, w.loadGroupParentMap(ctx))
}

func walkAncestorsFromMap(groupID *int, parentMap map[int]*int) []int {
	if groupID == nil || *groupID <= 0 {
		return nil
	}
	visited := make(map[int]bool)
	res := make([]int, 0, 4)
	curr := groupID
	for curr != nil && *curr > 0 {
		if visited[*curr] {
			break
		}
		visited[*curr] = true
		res = append(res, *curr)
		curr = parentMap[*curr]
	}
	return res
}

// ListMaintenances 返回全部维护窗口配置及关联目标。
func (w *MetricsWriter) ListMaintenances(ctx context.Context) ([]MaintenanceView, error) {
	if w == nil || w.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}
	var rows []MonitorMaintenance
	if err := w.db.WithContext(ctx).
		Table("monitor_maintenances").
		Order("id DESC").
		Find(&rows).Error; err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return []MaintenanceView{}, nil
	}

	ids := make([]int64, 0, len(rows))
	for _, r := range rows {
		ids = append(ids, r.ID)
	}
	var targets []MonitorMaintenanceTarget
	_ = w.db.WithContext(ctx).
		Table("monitor_maintenance_targets").
		Where("maintenance_id IN ?", ids).
		Order("id ASC").
		Find(&targets).Error

	targetMap := make(map[int64][]MonitorMaintenanceTarget, len(rows))
	for _, t := range targets {
		targetMap[t.MaintenanceID] = append(targetMap[t.MaintenanceID], t)
	}

	now := time.Now().UTC()
	out := make([]MaintenanceView, 0, len(rows))
	for _, r := range rows {
		rec, _ := parseMaintenanceRecurrence(r.RecurrenceJSON)
		tList := targetMap[r.ID]
		if tList == nil {
			tList = []MonitorMaintenanceTarget{}
		}
		out = append(out, MaintenanceView{
			MonitorMaintenance: r,
			Recurrence:         rec,
			Targets:            tList,
			IsActive:           IsMaintenanceActiveAt(r, now),
		})
	}
	return out, nil
}

// GetMaintenance 返回单条维护窗口详情。
func (w *MetricsWriter) GetMaintenance(ctx context.Context, id int64) (MaintenanceView, error) {
	if w == nil || w.db == nil {
		return MaintenanceView{}, fmt.Errorf("database not initialized")
	}
	var row MonitorMaintenance
	if err := w.db.WithContext(ctx).
		Table("monitor_maintenances").
		Where("id = ?", id).
		Take(&row).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return MaintenanceView{}, ErrMaintenanceNotFound
		}
		return MaintenanceView{}, err
	}
	var targets []MonitorMaintenanceTarget
	_ = w.db.WithContext(ctx).
		Table("monitor_maintenance_targets").
		Where("maintenance_id = ?", id).
		Order("id ASC").
		Find(&targets).Error
	if targets == nil {
		targets = []MonitorMaintenanceTarget{}
	}
	rec, _ := parseMaintenanceRecurrence(row.RecurrenceJSON)
	return MaintenanceView{
		MonitorMaintenance: row,
		Recurrence:         rec,
		Targets:            targets,
		IsActive:           IsMaintenanceActiveAt(row, time.Now().UTC()),
	}, nil
}

// CreateMaintenance 创建计划维护窗口并绑定目标。
func (w *MetricsWriter) CreateMaintenance(ctx context.Context, input MaintenanceInput, createdBy string) (MaintenanceView, error) {
	if w == nil || w.db == nil {
		return MaintenanceView{}, fmt.Errorf("database not initialized")
	}
	model, targets, err := validateAndBuildMaintenance(input, createdBy)
	if err != nil {
		return MaintenanceView{}, err
	}

	err = w.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Table("monitor_maintenances").Create(&model).Error; err != nil {
			return err
		}
		for i := range targets {
			targets[i].MaintenanceID = model.ID
		}
		if len(targets) > 0 {
			if err := tx.Table("monitor_maintenance_targets").Create(&targets).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return MaintenanceView{}, err
	}
	return w.GetMaintenance(ctx, model.ID)
}

// UpdateMaintenance 更新计划维护窗口及关联目标。
func (w *MetricsWriter) UpdateMaintenance(ctx context.Context, id int64, input MaintenanceInput) (MaintenanceView, error) {
	if w == nil || w.db == nil {
		return MaintenanceView{}, fmt.Errorf("database not initialized")
	}
	var existing MonitorMaintenance
	if err := w.db.WithContext(ctx).Table("monitor_maintenances").Where("id = ?", id).Take(&existing).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return MaintenanceView{}, ErrMaintenanceNotFound
		}
		return MaintenanceView{}, err
	}

	model, targets, err := validateAndBuildMaintenance(input, existing.CreatedBy)
	if err != nil {
		return MaintenanceView{}, err
	}
	model.ID = id
	model.CreatedAt = existing.CreatedAt

	err = w.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Table("monitor_maintenances").Where("id = ?", id).Updates(map[string]interface{}{
			"name":            model.Name,
			"description":     model.Description,
			"mode":            model.Mode,
			"schedule_type":   model.ScheduleType,
			"start_time":      model.StartTime,
			"end_time":        model.EndTime,
			"recurrence_json": model.RecurrenceJSON,
			"timezone":        model.Timezone,
			"enabled":         model.Enabled,
			"updated_at":      time.Now().UTC(),
		}).Error; err != nil {
			return err
		}
		if err := tx.Table("monitor_maintenance_targets").Where("maintenance_id = ?", id).Delete(&MonitorMaintenanceTarget{}).Error; err != nil {
			return err
		}
		for i := range targets {
			targets[i].MaintenanceID = id
		}
		if len(targets) > 0 {
			if err := tx.Table("monitor_maintenance_targets").Create(&targets).Error; err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return MaintenanceView{}, err
	}
	return w.GetMaintenance(ctx, id)
}

// DeleteMaintenance 删除计划维护窗口及其关联目标。
func (w *MetricsWriter) DeleteMaintenance(ctx context.Context, id int64) error {
	if w == nil || w.db == nil {
		return fmt.Errorf("database not initialized")
	}
	return w.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		if err := tx.Table("monitor_maintenance_targets").Where("maintenance_id = ?", id).Delete(&MonitorMaintenanceTarget{}).Error; err != nil {
			return err
		}
		res := tx.Table("monitor_maintenances").Where("id = ?", id).Delete(&MonitorMaintenance{})
		if res.Error != nil {
			return res.Error
		}
		if res.RowsAffected == 0 {
			return ErrMaintenanceNotFound
		}
		return nil
	})
}

func validateAndBuildMaintenance(input MaintenanceInput, createdBy string) (MonitorMaintenance, []MonitorMaintenanceTarget, error) {
	name := strings.TrimSpace(input.Name)
	if name == "" || len([]rune(name)) > 128 {
		return MonitorMaintenance{}, nil, fmt.Errorf("%w: name is required and must be <= 128 chars", ErrMaintenanceValidation)
	}
	description := strings.TrimSpace(input.Description)
	if len([]rune(description)) > 256 {
		return MonitorMaintenance{}, nil, fmt.Errorf("%w: description must be <= 256 chars", ErrMaintenanceValidation)
	}

	mode := strings.ToLower(strings.TrimSpace(input.Mode))
	if mode == "" {
		mode = MaintenanceModeCollectSilence
	}
	if mode != MaintenanceModeCollectSilence && mode != MaintenanceModePauseCollection {
		return MonitorMaintenance{}, nil, fmt.Errorf("%w: unsupported mode %q", ErrMaintenanceValidation, input.Mode)
	}

	scheduleType := strings.ToLower(strings.TrimSpace(input.ScheduleType))
	if scheduleType == "" {
		scheduleType = MaintenanceScheduleOnce
	}
	if scheduleType != MaintenanceScheduleOnce && scheduleType != MaintenanceScheduleWeekly && scheduleType != MaintenanceScheduleMonthly {
		return MonitorMaintenance{}, nil, fmt.Errorf("%w: unsupported schedule_type %q", ErrMaintenanceValidation, input.ScheduleType)
	}

	tz := strings.TrimSpace(input.Timezone)
	if tz == "" {
		tz = DefaultMaintenanceTimezone
	}
	if _, err := time.LoadLocation(tz); err != nil {
		return MonitorMaintenance{}, nil, fmt.Errorf("%w: invalid timezone %q", ErrMaintenanceValidation, tz)
	}

	now := time.Now().UTC()
	var startTime, endTime time.Time
	var recJSON []byte

	switch scheduleType {
	case MaintenanceScheduleOnce:
		if input.StartTime == nil || input.EndTime == nil || !input.EndTime.After(*input.StartTime) {
			return MonitorMaintenance{}, nil, fmt.Errorf("%w: once schedule requires valid start_time and end_time (end_time > start_time)", ErrMaintenanceValidation)
		}
		startTime = input.StartTime.UTC()
		endTime = input.EndTime.UTC()
		recJSON = []byte("{}")

	case MaintenanceScheduleWeekly:
		if input.Recurrence == nil || len(input.Recurrence.Weekdays) == 0 {
			return MonitorMaintenance{}, nil, fmt.Errorf("%w: weekly schedule requires weekdays", ErrMaintenanceValidation)
		}
		if _, _, ok := parseHMWindow(input.Recurrence.StartHM, input.Recurrence.EndHM); !ok {
			return MonitorMaintenance{}, nil, fmt.Errorf("%w: weekly schedule requires valid start_hm and end_hm (HH:MM, start != end)", ErrMaintenanceValidation)
		}
		normalizedDays := make([]int, 0, len(input.Recurrence.Weekdays))
		seen := make(map[int]bool)
		for _, wd := range input.Recurrence.Weekdays {
			if wd == 7 {
				wd = 0
			}
			if wd < 0 || wd > 6 {
				return MonitorMaintenance{}, nil, fmt.Errorf("%w: weekday must be in 0..6", ErrMaintenanceValidation)
			}
			if !seen[wd] {
				seen[wd] = true
				normalizedDays = append(normalizedDays, wd)
			}
		}
		rec := MaintenanceRecurrence{
			Weekdays: normalizedDays,
			StartHM:  strings.TrimSpace(input.Recurrence.StartHM),
			EndHM:    strings.TrimSpace(input.Recurrence.EndHM),
		}
		var err error
		recJSON, err = json.Marshal(rec)
		if err != nil {
			return MonitorMaintenance{}, nil, err
		}
		startTime = now
		endTime = now
		if input.StartTime != nil {
			startTime = input.StartTime.UTC()
		}
		if input.EndTime != nil {
			endTime = input.EndTime.UTC()
		}

	case MaintenanceScheduleMonthly:
		if input.Recurrence == nil || len(input.Recurrence.DaysOfMonth) == 0 {
			return MonitorMaintenance{}, nil, fmt.Errorf("%w: monthly schedule requires days_of_month", ErrMaintenanceValidation)
		}
		if _, _, ok := parseHMWindow(input.Recurrence.StartHM, input.Recurrence.EndHM); !ok {
			return MonitorMaintenance{}, nil, fmt.Errorf("%w: monthly schedule requires valid start_hm and end_hm (HH:MM, start != end)", ErrMaintenanceValidation)
		}
		normalizedDOM := make([]int, 0, len(input.Recurrence.DaysOfMonth))
		seen := make(map[int]bool)
		for _, d := range input.Recurrence.DaysOfMonth {
			if d < 1 || d > 31 {
				return MonitorMaintenance{}, nil, fmt.Errorf("%w: days_of_month must be in 1..31", ErrMaintenanceValidation)
			}
			if !seen[d] {
				seen[d] = true
				normalizedDOM = append(normalizedDOM, d)
			}
		}
		rec := MaintenanceRecurrence{
			DaysOfMonth: normalizedDOM,
			StartHM:     strings.TrimSpace(input.Recurrence.StartHM),
			EndHM:       strings.TrimSpace(input.Recurrence.EndHM),
		}
		var err error
		recJSON, err = json.Marshal(rec)
		if err != nil {
			return MonitorMaintenance{}, nil, err
		}
		startTime = now
		endTime = now
		if input.StartTime != nil {
			startTime = input.StartTime.UTC()
		}
		if input.EndTime != nil {
			endTime = input.EndTime.UTC()
		}
	}

	enabled := true
	if input.Enabled != nil {
		enabled = *input.Enabled
	}

	targets := make([]MonitorMaintenanceTarget, 0, len(input.Targets)+len(input.DeviceIDs)+len(input.GroupIDs))
	seenTarget := make(map[string]bool)
	addTarget := func(tType string, tID int64) error {
		tt := strings.ToLower(strings.TrimSpace(tType))
		if tt != MaintenanceTargetDevice && tt != MaintenanceTargetDeviceGroup {
			return fmt.Errorf("%w: unsupported target_type %q", ErrMaintenanceValidation, tType)
		}
		if tID <= 0 {
			return fmt.Errorf("%w: target_id must be > 0", ErrMaintenanceValidation)
		}
		key := fmt.Sprintf("%s:%d", tt, tID)
		if seenTarget[key] {
			return nil
		}
		seenTarget[key] = true
		targets = append(targets, MonitorMaintenanceTarget{
			TargetType: tt,
			TargetID:   tID,
		})
		return nil
	}

	for _, t := range input.Targets {
		if err := addTarget(t.TargetType, t.TargetID); err != nil {
			return MonitorMaintenance{}, nil, err
		}
	}
	for _, did := range input.DeviceIDs {
		if err := addTarget(MaintenanceTargetDevice, did); err != nil {
			return MonitorMaintenance{}, nil, err
		}
	}
	for _, gid := range input.GroupIDs {
		if err := addTarget(MaintenanceTargetDeviceGroup, gid); err != nil {
			return MonitorMaintenance{}, nil, err
		}
	}
	if len(targets) == 0 {
		return MonitorMaintenance{}, nil, fmt.Errorf("%w: at least one target device or device_group is required", ErrMaintenanceValidation)
	}

	return MonitorMaintenance{
		Name:           name,
		Description:    description,
		Mode:           mode,
		ScheduleType:   scheduleType,
		StartTime:      startTime,
		EndTime:        endTime,
		RecurrenceJSON: datatypes.JSON(recJSON),
		Timezone:       tz,
		Enabled:        enabled,
		CreatedBy:      strings.TrimSpace(createdBy),
	}, targets, nil
}
