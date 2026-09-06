package handlers

// =====================================================================
// 执行历史批次聚合
//
// 一次巡检策略执行（多台设备）会在 inspections 表产生多条记录（每台设备一条）。
// 本文件提供"按执行批次聚合"的能力：
//   - 新记录：CreateInspections 为同一次调用生成统一的 batch_id；
//   - 历史记录：同一次触发的行由循环外同一个 now 时间戳生成（created_at 精确相同），
//     按 schedule_id + name + created_at 可精确归并，不存在误合并。
//
// 对外暴露的执行 id：
//   - 新批次 → batch_id（UUID 字符串）；
//   - 历史批次 → 回填后为 legacy-<MIN(id)>（见 inspection.Service 的批次回填），
//     回填未执行时为批内 MIN(id) 数字字符串。
//
// WebSocket 进度事件在执行期间同样以 batch_id 作为 id 广播，与列表 id 一致。
// =====================================================================

import (
	"context"
	"fmt"
	"math"
	"sort"
	"strconv"
	"strings"
	"time"

	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/inspection"
)

// executionGroupKeyExpr 执行批次的 SQL 分组键：
// 新记录按 batch_id 分组；历史记录（batch_id 为空）按 策略+名称+精确创建时间 归并。
// 仅使用 Postgres 通用语法（生产与测试环境均为 Postgres）。
const executionGroupKeyExpr = `CASE WHEN batch_id IS NOT NULL AND batch_id <> '' ` +
	`THEN 'b:' || batch_id ` +
	`ELSE 'l:' || COALESCE(CAST(schedule_id AS VARCHAR(255)), '0') || ':' || COALESCE(name, '') || ':' || COALESCE(CAST(created_at AS VARCHAR(255)), '') END`

// executionGroup 一个执行批次的聚合结果（含批内全部原始记录）。
type executionGroup struct {
	// key 分组键（内部使用）
	key string
	// rows 批内全部记录，按 ID 升序
	rows []inspection.Inspection
}

// executionGroupRow 查询行：inspections 记录 + 计算出的分组键。
type executionGroupRow struct {
	inspection.Inspection
	GroupKey string `gorm:"column:group_key"`
}

// executionGroupHaving 批次级过滤条件（HAVING 子句）。
// 状态/日期这类"批内各设备取值可能不同"的过滤必须作用于聚合后的批次而非原始行，
// 否则会把同一批次截断成部分设备，导致列表与详情的设备数自相矛盾。
type executionGroupHaving struct {
	expr string
	args []interface{}
}

// queryExecutionGroups 将已附加过滤条件的 inspections 查询按执行批次分组，
// 返回按 orderExpr 排序并分页后的批次列表与批次总数。
// base 需为 Model(&inspection.Inspection{}) 且已附加 WHERE 条件；
// having 非空时追加到分组后的 HAVING 子句（批次级过滤），行级 WHERE 仍来自 base。
// orderExpr 必须带确定性的 tiebreaker（如 min_id），否则分页边界可能重复/丢失批次。
func (h InspectionHandler) queryExecutionGroups(ctx context.Context, base *gorm.DB, orderExpr string, page int, pageSize int, having *executionGroupHaving) ([]executionGroup, int64, error) {
	if orderExpr == "" {
		orderExpr = "start_time DESC, min_id DESC"
	}

	// 批次总数：对分组键去重计数（子查询包裹，避免 GORM Distinct+Count 的方言差异）。
	// 外层查询必须用 NewDB 会话，否则 base 上已附加的 WHERE 条件会被复制到外层、
	// 与子查询内的条件重复导致参数翻倍。
	sub := base.Session(&gorm.Session{}).
		Select(executionGroupKeyExpr + " AS group_key").
		Group(executionGroupKeyExpr)
	if having != nil {
		sub = sub.Having(having.expr, having.args...)
	}
	var total int64
	if err := base.Session(&gorm.Session{NewDB: true}).
		Table("(?) AS grouped_executions", sub).
		Count(&total).Error; err != nil {
		return nil, 0, err
	}

	// 本页批次键（MIN(id) 作为批次代表 id）
	type groupKeyRow struct {
		GroupKey  string     `gorm:"column:group_key"`
		MinID     int        `gorm:"column:min_id"`
		StartTime *time.Time `gorm:"column:start_time"`
	}
	offset := (page - 1) * pageSize
	keyQuery := base.Session(&gorm.Session{}).
		Select(executionGroupKeyExpr + " AS group_key, MIN(id) AS min_id, MIN(COALESCE(started_at, created_at)) AS start_time").
		Group(executionGroupKeyExpr)
	if having != nil {
		keyQuery = keyQuery.Having(having.expr, having.args...)
	}
	keyRows := make([]groupKeyRow, 0)
	if err := keyQuery.
		Order(orderExpr).
		Offset(offset).
		Limit(pageSize).
		Scan(&keyRows).Error; err != nil {
		return nil, 0, err
	}

	if len(keyRows) == 0 {
		return []executionGroup{}, total, nil
	}

	// 回查本页批次的全部记录行（同时带出分组键，用于在 Go 内归组）
	keys := make([]string, 0, len(keyRows))
	for _, row := range keyRows {
		keys = append(keys, row.GroupKey)
	}
	rowModels := make([]executionGroupRow, 0, len(keys))
	if err := base.Session(&gorm.Session{}).
		Select("*, "+executionGroupKeyExpr+" AS group_key").
		Where(executionGroupKeyExpr+" IN ?", keys).
		Find(&rowModels).Error; err != nil {
		return nil, 0, err
	}

	groupsByKey := make(map[string][]inspection.Inspection, len(keyRows))
	for _, row := range rowModels {
		groupsByKey[row.GroupKey] = append(groupsByKey[row.GroupKey], row.Inspection)
	}
	// 按批次页的排序输出，批内记录按 ID 升序
	ordered := make([]executionGroup, 0, len(keyRows))
	for _, row := range keyRows {
		rows := groupsByKey[row.GroupKey]
		sort.Slice(rows, func(a, b int) bool { return rows[a].ID < rows[b].ID })
		ordered = append(ordered, executionGroup{key: row.GroupKey, rows: rows})
	}
	return ordered, total, nil
}

// resolveExecutionBatchRows 将执行标识（批次 UUID 或批次代表记录的数字 ID）
// 解析为该批次的全部记录（ID 升序）。
func (h InspectionHandler) resolveExecutionBatchRows(ctx context.Context, db *gorm.DB, idParam string) ([]inspection.Inspection, error) {
	idParam = strings.TrimSpace(idParam)
	if idParam == "" {
		return nil, gorm.ErrRecordNotFound
	}

	// 非数字 → 视为批次 UUID 直接查询
	if _, err := strconv.Atoi(idParam); err != nil {
		rows := make([]inspection.Inspection, 0)
		if err := db.WithContext(ctx).
			Where("batch_id = ?", idParam).
			Order("id ASC").
			Find(&rows).Error; err != nil {
			return nil, err
		}
		if len(rows) == 0 {
			return nil, gorm.ErrRecordNotFound
		}
		return rows, nil
	}

	numericID, _ := strconv.Atoi(idParam)
	item, err := h.Service.GetInspection(ctx, numericID)
	if err != nil {
		return nil, err
	}

	rows := make([]inspection.Inspection, 0, 1)
	if item.BatchID != "" {
		// 新批次：按 batch_id 取全部记录
		if err := db.WithContext(ctx).
			Where("batch_id = ?", item.BatchID).
			Order("id ASC").
			Find(&rows).Error; err != nil {
			return nil, err
		}
	} else {
		// 历史记录：同一次触发的行 created_at 精确相同，按键归并
		query := db.WithContext(ctx).
			Where("(batch_id IS NULL OR batch_id = '')").
			Where("COALESCE(schedule_id, 0) = ?", coalesceScheduleID(item.ScheduleID)).
			Where("COALESCE(name, '') = ?", stringValue(item.Name))
		if item.CreatedAt == nil || item.CreatedAt.IsZero() {
			query = query.Where("id = ?", item.ID)
		} else {
			query = query.Where("created_at IS NOT DISTINCT FROM ?", *item.CreatedAt)
		}
		if err := query.Order("id ASC").Find(&rows).Error; err != nil {
			return nil, err
		}
		if len(rows) == 0 {
			rows = append(rows, item)
		}
	}
	return rows, nil
}

// executionBatchDisplayID 返回批次对外暴露的执行 id：
// 新批次为 batch_id（UUID），历史批次为批内最小数字 ID。
func executionBatchDisplayID(rows []inspection.Inspection) string {
	if len(rows) == 0 {
		return ""
	}
	if rows[0].BatchID != "" {
		return rows[0].BatchID
	}
	return fmt.Sprintf("%d", rows[0].ID)
}

// buildBatchExecutionResponse 将一个批次的记录聚合为执行历史列表的单行响应。
// 响应字段结构与单设备版本 buildExecutionResponse 完全一致，仅语义为"整批"。
func buildBatchExecutionResponse(rows []inspection.Inspection, strategyNames map[int]string, userNames map[string]string) map[string]interface{} {
	if len(rows) == 0 {
		// 理论上不会发生（调用方保证非空），兜底空结构
		return map[string]interface{}{
			"id":               "",
			"strategyId":       "",
			"strategy_id":      "",
			"strategyName":     "",
			"triggerType":      inspection.TriggerManual,
			"triggerUser":      "",
			"status":           inspection.StatusPending,
			"progress":         0,
			"totalDevices":     0,
			"completedDevices": 0,
			"startTime":        nil,
			"endTime":          nil,
			"duration":         0,
			"summary": map[string]interface{}{
				"totalChecks":   0,
				"passedChecks":  0,
				"failedChecks":  0,
				"warningChecks": 0,
				"score":         0,
				"deviceResults": []interface{}{},
			},
		}
	}

	representative := rows[0]
	strategyName := resolveStrategyName(strategyNames, representative.ScheduleID, representative.Name)

	triggerType := inspection.TriggerManual
	if strings.EqualFold(representative.Trigger, inspection.TriggerScheduled) {
		triggerType = inspection.TriggerScheduled
	}

	strategyID := ""
	if representative.ScheduleID != nil {
		strategyID = fmt.Sprintf("%d", *representative.ScheduleID)
	}
	if strings.TrimSpace(strategyName) == "" && representative.Name != nil {
		strategyName = *representative.Name
	}

	// 触发用户：批内首个非空 CreatedBy（同批应一致）
	var createdBy *string
	for _, item := range rows {
		if item.CreatedBy != nil && strings.TrimSpace(*item.CreatedBy) != "" {
			createdBy = item.CreatedBy
			break
		}
	}

	status := aggregateExecutionStatuses(rows)
	progress := aggregateBatchProgress(rows, status)

	// 评审 M2：批次未全部终态时不给 endTime——否则"最早完成的设备的完成时间"
	// 会被误读成批次结束时间，duration 也随完成台数增长而非真实批次耗时。
	// 全部终态才取批内最大 completed_at；否则 endTime 为 nil，duration 由
	// aggregateBatchDuration 退化为最大单设备耗时。
	var startTime, endTime *time.Time
	allTerminal := countTerminalDevices(rows) == len(rows)
	for _, item := range rows {
		if current := coalesceTime(item.StartedAt, item.CreatedAt); current != nil && (startTime == nil || current.Before(*startTime)) {
			startTime = current
		}
		if allTerminal && item.CompletedAt != nil && !item.CompletedAt.IsZero() && (endTime == nil || item.CompletedAt.After(*endTime)) {
			endTime = item.CompletedAt
		}
	}

	duration := aggregateBatchDuration(rows, startTime, endTime)

	totalChecks, passed, failed, warning := 0, 0, 0, 0
	for _, item := range rows {
		totalChecks += resolveTotalChecks(item, nil)
		passed += resolvePassedChecks(item, nil)
		failed += resolveFailedChecks(item, nil)
		warning += resolveWarningChecks(item, nil)
	}
	effectiveTotal := passed + failed + warning // 不把 skip 计入分母
	score := computeScore(effectiveTotal, passed)

	return map[string]interface{}{
		"id":               executionBatchDisplayID(rows),
		"strategyId":       strategyID,
		"strategy_id":      strategyID,
		"strategyName":     strategyName,
		"triggerType":      triggerType,
		"triggerUser":      resolveUserName(userNames, createdBy),
		"status":           status,
		"progress":         progress,
		"totalDevices":     len(rows),
		"completedDevices": countTerminalDevices(rows),
		"startTime":        startTime,
		"endTime":          endTime,
		"duration":         duration,
		"summary": map[string]interface{}{
			"totalChecks":   totalChecks,
			"passedChecks":  passed,
			"failedChecks":  failed,
			"warningChecks": warning,
			"score":         score,
			"deviceResults": []interface{}{},
		},
	}
}

// buildBatchExecutionSummary 构建批次详情的 summary：跨设备汇总计数 +
// 逐设备的 deviceResults 数组（前端详情弹窗按此渲染多设备折叠列表）。
func buildBatchExecutionSummary(rows []inspection.Inspection, deviceMap map[int]deviceInfo, resultsByInspection map[int][]inspection.Result) map[string]interface{} {
	totalChecks, passed, failed, warning := 0, 0, 0, 0
	deviceResults := make([]interface{}, 0, len(rows))
	for _, item := range rows {
		results := resultsByInspection[item.ID]
		itemTotal := resolveTotalChecks(item, results)
		itemPassed := resolvePassedChecks(item, results)
		itemFailed := resolveFailedChecks(item, results)
		itemWarning := resolveWarningChecks(item, results)

		totalChecks += itemTotal
		passed += itemPassed
		failed += itemFailed
		warning += itemWarning

		itemEffective := itemPassed + itemFailed + itemWarning
		device := deviceMap[item.DeviceID]
		deviceResults = append(deviceResults, map[string]interface{}{
			// 评审 L1：deviceId 取巡检行自身的 device_id，而非 devices 表映射——
			// 设备被删除后映射为空值，原实现会把 deviceId 输出成 "0"
			"deviceId":      fmt.Sprintf("%d", item.DeviceID),
			"deviceName":    defaultString(device.Name, "未知设备"),
			"deviceType":    device.DeviceType,
			"deviceIp":      device.IPAddress,
			"status":        deriveDeviceStatus(item, itemPassed, itemFailed, itemWarning),
			"score":         float64(computeScore(itemEffective, itemPassed)),
			"checkResults":  buildCheckResults(results),
			"passedChecks":  itemPassed,
			"totalChecks":   itemTotal,
			"executionTime": defaultIntPtr(item.Duration),
		})
	}

	effectiveTotal := passed + failed + warning // 不把 skip 计入分母
	return map[string]interface{}{
		"totalChecks":   totalChecks,
		"passedChecks":  passed,
		"failedChecks":  failed,
		"warningChecks": warning,
		"score":         computeScore(effectiveTotal, passed),
		"deviceResults": deviceResults,
	}
}

// aggregateExecutionStatuses 聚合批次整体状态（批内记录行版），见 aggregateStatusFlags。
func aggregateExecutionStatuses(rows []inspection.Inspection) string {
	statuses := make([]string, 0, len(rows))
	for _, item := range rows {
		statuses = append(statuses, item.Status)
	}
	return aggregateStatusFlags(statuses)
}

// aggregateStatusFlags 状态优先级聚合的纯函数形态：
// 优先级 running > (pending 且存在非 pending) > completed > failed/timeout > cancelled。
// 批内只要还有设备在跑就显示"执行中"；
// 评审 M3：pending 不再无条件优先于其他状态——「部分完成 + 部分排队」的批次
// 实际仍在推进，显示等待中会让前端认为不可停止（无停止按钮），
// 因此只要存在非 pending 状态就显示 running，全部 pending 才是等待中；
// 口径（已与需求方确认 2026-09-05）：部分设备失败、其余完成时整批显示"已完成"，
// 仅全部失败才显示"失败"——失败程度通过评分、通过率与设备详情体现，
// 避免个别设备失败把整批标红放大告警感。
// 供 aggregateExecutionStatuses（行记录版）与 aggregateProgressEvents（进度事件版）复用。
func aggregateStatusFlags(statuses []string) string {
	hasPending, hasRunning, hasCompleted, hasFailed, hasCancelled := false, false, false, false, false
	for _, status := range statuses {
		switch strings.ToLower(strings.TrimSpace(status)) {
		case inspection.StatusRunning:
			hasRunning = true
		case inspection.StatusPending:
			hasPending = true
		case inspection.StatusCompleted:
			hasCompleted = true
		case inspection.StatusFailed, inspection.StatusTimeout:
			hasFailed = true
		case inspection.StatusCancelled:
			hasCancelled = true
		}
	}

	switch {
	case hasRunning:
		return inspection.StatusRunning
	case hasPending && (hasCompleted || hasFailed || hasCancelled):
		// 评审 M3：排队 + 任一已推进状态 → 批次仍在推进
		return inspection.StatusRunning
	case hasPending:
		return inspection.StatusPending
	case hasCompleted:
		return inspection.StatusCompleted
	case hasFailed:
		return inspection.StatusFailed
	case hasCancelled:
		return inspection.StatusCancelled
	default:
		return inspection.StatusPending
	}
}

// aggregateBatchProgress 批次进度：Σ已完成检查项 / Σ总检查项。
// status 为 completed 时恒为 100；无任何检查项统计时退化为完成设备占比。
func aggregateBatchProgress(rows []inspection.Inspection, status string) int {
	if strings.EqualFold(status, inspection.StatusCompleted) {
		return 100
	}

	totalChecks, completedChecks := 0, 0
	for _, item := range rows {
		total := item.TotalChecks
		if total <= 0 {
			total = resolveTotalChecks(item, nil)
		}
		totalChecks += total
		completedChecks += item.PassedChecks + item.FailedChecks + item.WarningChecks + item.SkippedChecks
	}
	if totalChecks <= 0 {
		// 尚无统计：用终态设备占比近似
		total := len(rows)
		if total == 0 {
			return 0
		}
		return int(math.Round(float64(countTerminalDevices(rows)) / float64(total) * 100))
	}
	progress := int(math.Round(float64(completedChecks) / float64(totalChecks) * 100))
	if progress > 100 {
		progress = 100
	}
	return progress
}

// aggregateBatchDuration 批次耗时：优先取末台完成时间 - 首台开始时间；
// 无法计算时取批内最大单设备耗时。
func aggregateBatchDuration(rows []inspection.Inspection, startTime, endTime *time.Time) int {
	if startTime != nil && endTime != nil && endTime.After(*startTime) {
		return int(endTime.Sub(*startTime).Seconds())
	}
	maxDuration := 0
	for _, item := range rows {
		if item.Duration != nil && *item.Duration > maxDuration {
			maxDuration = *item.Duration
		}
	}
	return maxDuration
}

// countTerminalDevices 统计批内已到达终态（完成/失败/取消/超时）的设备数。
func countTerminalDevices(rows []inspection.Inspection) int {
	count := 0
	for _, item := range rows {
		if resolveCompletedDevices(item.Status) > 0 {
			count++
		}
	}
	return count
}

// coalesceScheduleID 将可空的策略 ID 归一为整数（历史归并键用）。
func coalesceScheduleID(scheduleID *int) int {
	if scheduleID == nil {
		return 0
	}
	return *scheduleID
}
