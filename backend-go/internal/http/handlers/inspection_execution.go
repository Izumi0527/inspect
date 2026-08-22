package handlers

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"sort"
	"strings"
	"sync"
	"time"

	"go.uber.org/zap"
	"gorm.io/datatypes"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/devices"
	"github.com/your-org/inspect-system/backend-go/internal/inspection"
	"github.com/your-org/inspect-system/backend-go/internal/settings"
	"github.com/your-org/inspect-system/backend-go/internal/ws"
)

// inspectionDefaults 读取"通用配置-巡检配置"的全局默认（并发/超时/重试），
// Settings 服务未注入时回退内置默认。
func (h InspectionHandler) inspectionDefaults(ctx context.Context) settings.InspectionDefaults {
	if h.Settings == nil {
		return settings.InspectionDefaults{MaxConcurrent: 10, TimeoutSeconds: 30, RetryAttempts: 3}
	}
	return h.Settings.GetInspectionDefaults(ctx)
}

// executeInspectionsAsync 异步执行巡检任务。
// 多设备任务受"最大并发任务数"（inspection.max_concurrent_tasks）约束并发执行。
func (h InspectionHandler) executeInspectionsAsync(inspections []inspection.Inspection, templateID *int) {
	ctx := context.Background()

	// 获取模板检查项
	var checkItems []map[string]interface{}
	if templateID != nil {
		template, err := h.Service.GetTemplate(ctx, *templateID)
		if err != nil {
			errMsg := "加载巡检模板失败"
			if errors.Is(err, gorm.ErrRecordNotFound) {
				errMsg = "巡检模板不存在"
			}
			for _, insp := range inspections {
				h.markInspectionExecutionFailed(ctx, insp.ID, errMsg, 0, 0)
			}
			return
		}
		checkItems = decodeJSONMapSlice(template.CheckItems)
	}

	defaults := h.inspectionDefaults(ctx)
	limit := make(chan struct{}, defaults.MaxConcurrent)
	var wg sync.WaitGroup
	for _, insp := range inspections {
		insp := insp
		wg.Add(1)
		limit <- struct{}{}
		go func() {
			defer wg.Done()
			defer func() { <-limit }()
			h.executeInspection(ctx, insp, checkItems, defaults)
		}()
	}
	wg.Wait()
}

func (h InspectionHandler) broadcastScanProgress(inspectionID int, status string, progress int, extra map[string]interface{}) {
	if h.WS == nil || inspectionID <= 0 {
		return
	}

	normalizedStatus := strings.ToLower(strings.TrimSpace(status))
	if normalizedStatus == "" {
		normalizedStatus = "unknown"
	}

	if progress < 0 {
		progress = 0
	}
	if progress > 100 {
		progress = 100
	}

	payload := map[string]interface{}{
		"id":        fmt.Sprintf("%d", inspectionID),
		"status":    normalizedStatus,
		"progress":  progress,
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	}

	for key, value := range extra {
		if strings.TrimSpace(key) == "" {
			continue
		}
		payload[key] = value
	}

	_ = h.WS.SendToRoom("scan_progress", ws.Message{
		Type: ws.MessageScanProgress,
		Data: payload,
	})
}

func (h InspectionHandler) isInspectionCancelled(ctx context.Context, inspectionID int) bool {
	if h.Service == nil || inspectionID <= 0 {
		return false
	}

	item, err := h.Service.GetInspection(ctx, inspectionID)
	if err != nil {
		return false
	}

	return strings.EqualFold(item.Status, inspection.StatusCancelled) || strings.EqualFold(item.Status, inspection.StatusTimeout)
}

// filterEnabledCheckItems 返回模板中启用的检查项。
// 不再静默回退默认项：模板未配置/解析为空时返回空切片，由调用方将任务显式判失败，
// 避免"模板未真正生效却照跑一套默认检查"的假象。
func filterEnabledCheckItems(checkItems []map[string]interface{}) []map[string]interface{} {
	filtered := make([]map[string]interface{}, 0, len(checkItems))
	for _, item := range checkItems {
		if enabled, ok := item["enabled"].(bool); ok && !enabled {
			continue
		}
		filtered = append(filtered, item)
	}
	return filtered
}

// checkItemDeviceTypes 读取检查项声明的适用设备类型。
// 返回空切片表示未声明，即适用于全部设备——存量模板与用户自建模板都没有
// 这个字段，缺省必须是"适用"而不是"不适用"，否则升级后所有检查项全部停摆。
func checkItemDeviceTypes(item map[string]interface{}) []string {
	raw, ok := item["device_types"]
	if !ok || raw == nil {
		return nil
	}

	appendValue := func(out []string, value interface{}) []string {
		text, isString := value.(string)
		if !isString {
			return out
		}
		text = strings.ToLower(strings.TrimSpace(text))
		if text == "" {
			return out
		}
		return append(out, text)
	}

	switch list := raw.(type) {
	case []string:
		out := make([]string, 0, len(list))
		for _, v := range list {
			out = appendValue(out, v)
		}
		return out
	case []interface{}:
		// jsonb 反序列化后是 []interface{}，这是实际运行时最常见的形态
		out := make([]string, 0, len(list))
		for _, v := range list {
			out = appendValue(out, v)
		}
		return out
	}
	return nil
}

// buildNotApplicableResult 为「不适用于当前设备类型」的检查项生成一条结果。
//
// 不适用项不做任何采集，但仍要落一条记录：报告需要说清「这台设备没查 PoE 是
// 因为它不是交换机」，而不是让这一项凭空消失——凭空消失会让同一模板在不同
// 设备上的检查项数对不上，读者无从判断是漏查还是不适用。
func buildNotApplicableResult(inspectionID int, item map[string]interface{}, deviceType string) inspection.Result {
	now := time.Now().UTC()
	itemName := readString(item, "name")
	itemType := readString(item, "type")
	itemCategory := readString(item, "category")

	declared := checkItemDeviceTypes(item)
	scope := strings.Join(declared, "、")
	if scope == "" {
		scope = "特定设备类型"
	}
	shown := strings.TrimSpace(deviceType)
	if shown == "" {
		shown = "未知"
	}

	return inspection.Result{
		InspectionID:      inspectionID,
		CheckItemName:     itemName,
		CheckItemType:     itemType,
		CheckItemCategory: stringPtr(itemCategory),
		Status:            inspection.CheckStatusNotApplicable,
		ExpectedValue:     stringPtr(fmt.Sprintf("适用于 %s", scope)),
		Message:           stringPtr(fmt.Sprintf("该检查项适用于 %s，当前设备类型为 %s，未执行", scope, shown)),
		StartTime:         &now,
		EndTime:           &now,
		CreatedAt:         &now,
	}
}

// knownDeviceTypes 是设备档案中合法的设备类型，与 inspection/builtin_templates.go
// 的模板 device_types 对齐。
//
// 只有设备类型确实落在此集合内时才按检查项声明过滤。出现集合外的值说明设备档案
// 数据异常（自动发现尚未归类、手工录入笔误）或系统新增了设备类型而此处漏同步——
// 两种情况都全部执行而非静默跳过：漏检的代价远大于多跑一次采集，且真正不适用的
// 项采不到数据自然会 skip。
var knownDeviceTypes = map[string]bool{
	"switch":   true,
	"router":   true,
	"firewall": true,
	"server":   true,
}

// splitCheckItemsByApplicability 按设备类型把启用的检查项分成可执行与不适用两组。
//
// BGP 只对路由器与防火墙有意义，PoE 只对交换机有意义。不做这层过滤的话，一台
// 交换机跑全面巡检会产出一串采集不到的结果，真正的异常淹没在噪声里。
//
// 两个刻意的宽松取向：
//   - 检查项未声明 device_types 时视为适用全部（向后兼容存量模板）
//   - 设备自身 device_type 缺失或无法识别时全部执行（自动发现尚未归类的设备，
//     漏查一项的代价远大于多跑一次采集，且采不到自然会 skip）
func splitCheckItemsByApplicability(
	checkItems []map[string]interface{},
	deviceType string,
) (applicable []map[string]interface{}, notApplicable []map[string]interface{}) {
	enabled := filterEnabledCheckItems(checkItems)
	normalizedDevice := strings.ToLower(strings.TrimSpace(deviceType))

	applicable = make([]map[string]interface{}, 0, len(enabled))
	notApplicable = make([]map[string]interface{}, 0)

	for _, item := range enabled {
		declared := checkItemDeviceTypes(item)
		if len(declared) == 0 || normalizedDevice == "" || !knownDeviceTypes[normalizedDevice] {
			applicable = append(applicable, item)
			continue
		}

		matched := false
		for _, dt := range declared {
			if dt == normalizedDevice {
				matched = true
				break
			}
		}
		if matched {
			applicable = append(applicable, item)
			continue
		}
		notApplicable = append(notApplicable, item)
	}
	return applicable, notApplicable
}

func (h InspectionHandler) markInspectionExecutionFailed(ctx context.Context, inspectionID int, errMsg string, completedChecks int, totalChecks int) {
	if h.Service == nil || inspectionID <= 0 {
		return
	}
	if strings.TrimSpace(errMsg) == "" {
		errMsg = "巡检执行失败"
	}

	if _, err := h.Service.UpdateInspectionStatus(ctx, inspectionID, inspection.StatusFailed, &errMsg); err != nil {
		if h.Logger != nil {
			h.Logger.Error("failed to update inspection status to failed", zap.Int("inspection_id", inspectionID), zap.Error(err))
		}
		return
	}

	progress := 0
	if totalChecks > 0 {
		progress = int(math.Round(float64(completedChecks) / float64(totalChecks) * 100))
	}
	h.broadcastScanProgress(inspectionID, inspection.StatusFailed, progress, map[string]interface{}{
		"message":          errMsg,
		"completed_checks": completedChecks,
		"total_checks":     totalChecks,
	})
}

// executeInspection 执行单个巡检任务。
// 执行链路（探测/检查项）受任务级 Timeout（缺省为 inspection.default_timeout）约束；
// 状态与结果落库使用 baseCtx，保证执行超时后仍能写回 timeout 状态。
func (h InspectionHandler) executeInspection(baseCtx context.Context, insp inspection.Inspection, checkItems []map[string]interface{}, defaults settings.InspectionDefaults) {
	timeoutSeconds := defaults.TimeoutSeconds
	if insp.Timeout != nil && *insp.Timeout > 0 {
		timeoutSeconds = *insp.Timeout // 任务级配置优先于全局默认
	}
	execCtx, cancelExec := context.WithTimeout(baseCtx, time.Duration(timeoutSeconds)*time.Second)
	defer cancelExec()

	// 1. 更新状态为 running
	_, err := h.Service.UpdateInspectionStatus(baseCtx, insp.ID, inspection.StatusRunning, nil)
	if err != nil {
		if h.Logger != nil {
			h.Logger.Error("failed to update inspection status to running", zap.Int("inspection_id", insp.ID), zap.Error(err))
		}
		return
	}

	// 广播开始执行（进度 0%）
	h.broadcastScanProgress(insp.ID, inspection.StatusRunning, 0, nil)

	// 2. 获取设备信息
	// 必须用 GetDeviceRecord 取完整 Device（含 AfterFind 解密后的明文凭据）：
	// GetDeviceByID 返回对外脱敏的 DeviceResponse，其 SnmpCommunity 恒为 nil，
	// 会导致 SNMP 探测不可达、所有 SNMP 检查项判失败，使整个巡检任务失败。
	var device *devices.Device
	if h.DeviceService != nil {
		record, derr := h.DeviceService.GetDeviceRecord(baseCtx, insp.DeviceID)
		if derr != nil {
			errMsg := fmt.Sprintf("获取设备信息失败: %v", derr)
			h.Service.UpdateInspectionStatus(baseCtx, insp.ID, inspection.StatusFailed, &errMsg)
			h.broadcastScanProgress(insp.ID, inspection.StatusFailed, 0, map[string]interface{}{"message": errMsg})
			return
		}
		device = &record
	}

	// 3. 执行探测检查；探测失败/不可达时按 inspection.retry_attempts 重试（网络抖动容错）
	var probeResult *devices.ProbeResult
	if h.ProbeService != nil && device != nil {
		for attempt := 0; attempt <= defaults.RetryAttempts; attempt++ {
			result, perr := h.ProbeService.ProbeDevice(
				execCtx,
				device.ID,
				device.IPAddress,
				device.SnmpCommunity,
				device.SnmpVersion,
				device.SnmpPort,
				nil,
				false,
			)
			if perr == nil {
				probeResult = &result
				if result.IcmpReachable || result.SnmpReachable {
					break
				}
			}
			if execCtx.Err() != nil {
				break
			}
		}
	}

	// 如果任务已被取消，直接结束
	if h.isInspectionCancelled(baseCtx, insp.ID) {
		h.broadcastScanProgress(insp.ID, inspection.StatusCancelled, 0, nil)
		return
	}

	// 4. 执行检查项并生成结果（实时保存 + 推送进度）
	// 按设备类型分流：BGP 只对路由器/防火墙有意义、PoE 只对交换机有意义，
	// 不适用项不做采集但仍落一条 not_applicable 记录，保证同一模板在不同设备上
	// 的检查项总数一致，读者不必猜是漏查还是不适用。
	// device 在部分调用路径上可能为 nil（设备记录缺失时仍会走到这里），
	// 取不到设备类型就按"不确定就都查"处理，与未知设备类型的口径一致。
	deviceType := ""
	if device != nil {
		deviceType = device.DeviceType
	}
	activeCheckItems, notApplicableItems := splitCheckItemsByApplicability(checkItems, deviceType)
	totalChecks := len(activeCheckItems) + len(notApplicableItems)
	if totalChecks == 0 {
		errMsg := "巡检模板无有效检查项，请检查所选模板的检查项配置"
		h.markInspectionExecutionFailed(baseCtx, insp.ID, errMsg, 0, 0)
		return
	}

	// 初始化总检查数，便于前端/接口计算进度
	if err := h.Service.UpdateInspectionStats(baseCtx, insp.ID, totalChecks, 0, 0, 0, 0); err != nil {
		errMsg := fmt.Sprintf("初始化巡检统计失败: %v", err)
		h.markInspectionExecutionFailed(baseCtx, insp.ID, errMsg, 0, totalChecks)
		return
	}

	// 5. 保存结果
	executedCount := 0
	passedCount := 0
	failedCount := 0
	warningCount := 0
	skippedCount := 0
	var executionErr error

	// 不适用项无需采集，先行落库并计入已完成，进度条不会因它们停顿。
	// 它们不计入 passed/failed/warning/skipped 任何一类——既不是通过也不是失败，
	// 更不是"该查没查成"，统计口径由报告层从明细还原。
	for _, item := range notApplicableItems {
		result := buildNotApplicableResult(insp.ID, item, deviceType)
		if err := h.Service.SaveInspectionResult(baseCtx, &result); err != nil {
			h.markInspectionExecutionFailed(baseCtx, insp.ID, fmt.Sprintf("保存巡检结果失败: %v", err), executedCount, totalChecks)
			return
		}
		executedCount++
	}
	notApplicableCount := executedCount

	results := h.executeCheckItems(execCtx, baseCtx, insp.ID, device, probeResult, activeCheckItems, defaults.RetryAttempts, func(result inspection.Result, completed int, _ int) error {
		// executeCheckItems 只统计自己那批的进度，加回先落库的不适用项才是整体进度。
		// 回调传入的 total 只是可执行项数，一律忽略、改用 totalChecks，
		// 否则进度会停在「可执行项数 / 总项数」而永远到不了 100%。
		executedCount = notApplicableCount + completed

		if err := h.Service.SaveInspectionResult(baseCtx, &result); err != nil {
			executionErr = fmt.Errorf("保存巡检结果失败: %w", err)
			return executionErr
		}

		switch normalizeCheckResultStatus(result.Status) {
		case "pass":
			passedCount++
		case "fail":
			failedCount++
		case "warning":
			warningCount++
		case "skip":
			skippedCount++
		}

		// 实时更新统计与进度
		if err := h.Service.UpdateInspectionStats(baseCtx, insp.ID, totalChecks, passedCount, failedCount, warningCount, skippedCount); err != nil {
			executionErr = fmt.Errorf("更新巡检统计失败: %w", err)
			return executionErr
		}

		progress := 0
		if totalChecks > 0 {
			progress = int(math.Round(float64(executedCount) / float64(totalChecks) * 100))
		}
		h.broadcastScanProgress(insp.ID, inspection.StatusRunning, progress, map[string]interface{}{
			"completed_checks": executedCount,
			"total_checks":     totalChecks,
		})
		return nil
	})

	if executionErr != nil {
		h.markInspectionExecutionFailed(baseCtx, insp.ID, executionErr.Error(), executedCount, totalChecks)
		return
	}

	// 执行超时：写回 timeout 状态（用 baseCtx，不受已超时的 execCtx 影响）
	if errors.Is(execCtx.Err(), context.DeadlineExceeded) && executedCount < totalChecks {
		errMsg := fmt.Sprintf("巡检执行超时（%d 秒），已完成 %d/%d 项检查", timeoutSeconds, executedCount, totalChecks)
		if _, err := h.Service.UpdateInspectionStatus(baseCtx, insp.ID, inspection.StatusTimeout, &errMsg); err != nil && h.Logger != nil {
			h.Logger.Error("failed to update inspection status to timeout", zap.Int("inspection_id", insp.ID), zap.Error(err))
		}
		progress := 0
		if totalChecks > 0 {
			progress = int(math.Round(float64(executedCount) / float64(totalChecks) * 100))
		}
		h.broadcastScanProgress(insp.ID, inspection.StatusTimeout, progress, map[string]interface{}{
			"message":          errMsg,
			"completed_checks": executedCount,
			"total_checks":     totalChecks,
		})
		return
	}

	// 若执行过程中被取消，保留取消状态，不再覆盖为 completed
	if h.isInspectionCancelled(baseCtx, insp.ID) {
		progress := 0
		if totalChecks > 0 {
			progress = int(math.Round(float64(executedCount) / float64(totalChecks) * 100))
		}
		h.broadcastScanProgress(insp.ID, inspection.StatusCancelled, progress, map[string]interface{}{
			"completed_checks": executedCount,
			"total_checks":     totalChecks,
		})
		return
	}

	// 6. 更新巡检统计并完成
	finalTotal := reconcileExecutedTotal(notApplicableCount, len(results))
	if err := h.Service.UpdateInspectionStats(baseCtx, insp.ID, finalTotal, passedCount, failedCount, warningCount, skippedCount); err != nil {
		errMsg := fmt.Sprintf("收口巡检统计失败: %v", err)
		h.markInspectionExecutionFailed(baseCtx, insp.ID, errMsg, executedCount, totalChecks)
		return
	}
	if _, err := h.Service.UpdateInspectionStatus(baseCtx, insp.ID, inspection.StatusCompleted, nil); err != nil {
		if h.Logger != nil {
			h.Logger.Error("failed to update inspection status to completed", zap.Int("inspection_id", insp.ID), zap.Error(err))
		}
		return
	}
	h.broadcastScanProgress(insp.ID, inspection.StatusCompleted, 100, map[string]interface{}{
		"completed_checks": finalTotal,
		"total_checks":     finalTotal,
	})
}

// reconcileExecutedTotal 返回收口时应写回 inspections.total_checks 的值。
//
// 必须把不适用项加回来：executeCheckItems 只返回**可执行那批**的结果，
// 而初始化时写入的总数是「可执行 + 不适用」。收口只写 len(results) 会把正确的
// 总数覆盖成偏小的值——库里 19 条结果、total_checks 却是 18，执行历史显示
// 「通过 11/18」。这行在不适用项引入之前是对的（那时 results 就是全部），
// 分流之后漏改，且它离分流点有一百多行，看不出关联。
//
// 保留「按实际结果数收口」而非直接写 totalChecks，是为了让执行过程中若真有
// 结果缺失时总数如实反映，不虚报没跑过的检查项。
func reconcileExecutedTotal(notApplicableCount, executedResultCount int) int {
	return notApplicableCount + executedResultCount
}

// isRetryableCheckFailure 判定检查结果是否为可重试的执行错误：
// 仅 ErrorMessage 非空的 fail 视为执行错误（连接失败/命令失败等），
// 业务判定失败（阈值超标、期望值不匹配）不重试。
func isRetryableCheckFailure(result inspection.Result) bool {
	return result.Status == "fail" && result.ErrorMessage != nil
}

// executeCheckItems 执行检查项。
// execCtx 约束真实执行（SSH/HTTP 等 I/O），超时/取消即停止后续检查；
// baseCtx 用于取消状态查询等落库读写。ssh/http 检查出现执行错误时按
// retryAttempts 重试（inspection.retry_attempts）。
func (h InspectionHandler) executeCheckItems(
	execCtx context.Context,
	baseCtx context.Context,
	inspectionID int,
	device *devices.Device,
	probeResult *devices.ProbeResult,
	checkItems []map[string]interface{},
	retryAttempts int,
	onResult func(result inspection.Result, completed int, total int) error,
) []inspection.Result {
	results := make([]inspection.Result, 0)
	total := len(checkItems)

	// 采集 SNMP 指标（如果设备支持 SNMP）
	snmpMetrics := collectInspectionSNMPMetrics(execCtx, h.SNMPCollector, device, probeResult, h.Logger)

	for _, item := range checkItems {
		if execCtx.Err() != nil {
			break
		}
		if h.isInspectionCancelled(baseCtx, inspectionID) {
			break
		}

		itemName := readString(item, "name")
		itemType := readString(item, "type")
		itemCategory := readString(item, "category")
		normalizedType := strings.ToLower(itemType)

		runOnce := func() inspection.Result {
			startTime := time.Now().UTC()
			result := inspection.Result{
				InspectionID:      inspectionID,
				CheckItemName:     itemName,
				CheckItemType:     itemType,
				CheckItemCategory: stringPtr(itemCategory),
				StartTime:         &startTime,
				CreatedAt:         &startTime,
			}

			// 根据检查类型执行检查
			switch normalizedType {
			case "icmp", "ping":
				h.executeICMPCheck(&result, probeResult)
			case "snmp":
				h.executeSNMPCheck(&result, probeResult, snmpMetrics, item)
			case "ssh":
				h.executeSSHCheck(execCtx, &result, device, item)
			case "http", "https":
				h.executeHTTPCheck(execCtx, &result, device, item)
			case "script":
				// 出于安全，不在服务器执行任意脚本；如需脚本检查请改用 SSH 命令检查。
				result.Status = "skip"
				result.Message = stringPtr("脚本类型检查出于安全暂不支持，请改用 SSH 命令检查")
			default:
				result.Status = "skip"
				result.Message = stringPtr(fmt.Sprintf("不支持的检查类型: %s", itemType))
			}

			endTime := time.Now().UTC()
			result.EndTime = &endTime
			execTime := int(endTime.Sub(startTime).Milliseconds())
			result.ExecutionTime = &execTime
			return result
		}

		result := runOnce()
		// 仅对 I/O 型检查（ssh/http）的执行错误重试；icmp/snmp 基于任务开始时的
		// 一次性探测数据，重跑不会产生新结果。
		if normalizedType == "ssh" || normalizedType == "http" || normalizedType == "https" {
			for attempt := 0; attempt < retryAttempts && isRetryableCheckFailure(result) && execCtx.Err() == nil; attempt++ {
				result = runOnce()
			}
		}

		results = append(results, result)
		if onResult != nil {
			if err := onResult(result, len(results), total); err != nil {
				if h.Logger != nil {
					h.Logger.Error("inspection check callback failed", zap.Int("inspection_id", inspectionID), zap.Error(err))
				}
				break
			}
		}
	}

	return results
}

func collectInspectionSNMPMetrics(
	ctx context.Context,
	collector SNMPMetricsCollector,
	device *devices.Device,
	probeResult *devices.ProbeResult,
	logger *zap.Logger,
) *devices.SNMPMetrics {
	if collector == nil || device == nil || probeResult == nil || !probeResult.SnmpReachable {
		return nil
	}

	metrics, err := collector.CollectMetrics(
		ctx,
		device.IPAddress,
		device.Vendor,
		device.SnmpCommunity,
		device.SnmpVersion,
		device.SnmpPort,
		device.Tags,
	)
	if err != nil {
		if logger != nil {
			logger.Warn("failed to collect SNMP metrics", zap.Error(err))
		}
		return nil
	}

	return metrics
}

// executeICMPCheck 执行 ICMP 检查
func (h InspectionHandler) executeICMPCheck(result *inspection.Result, probeResult *devices.ProbeResult) {
	result.ExpectedValue = stringPtr("ICMP 可达")
	if probeResult == nil {
		result.Status = "skip"
		result.Message = stringPtr("无法执行探测")
		return
	}

	if probeResult.IcmpReachable {
		result.Status = "pass"
		result.Message = stringPtr("设备ICMP可达")
		if probeResult.IcmpResponseTime != nil {
			responseTime := fmt.Sprintf("%.2fms", *probeResult.IcmpResponseTime)
			result.ActualValue = &responseTime
		}
	} else {
		result.Status = "fail"
		result.Message = stringPtr("设备ICMP不可达")
		if probeResult.IcmpError != nil {
			result.ErrorMessage = probeResult.IcmpError
		}
	}
}

// executeSNMPCheck 执行 SNMP 检查
func (h InspectionHandler) executeSNMPCheck(result *inspection.Result, probeResult *devices.ProbeResult, snmpMetrics *devices.SNMPMetrics, checkItem map[string]interface{}) {
	// 顶层探测失败时尚未进入 metric 分支，参考标准先落"SNMP 响应正常"
	//（此时判定依据正是 SNMP 必须可达）；进入具体 metric 分支后由各
	// checkXxxMetric 覆盖为该指标的合理范围。
	result.ExpectedValue = stringPtr("SNMP 响应正常")
	if probeResult == nil {
		result.Status = "skip"
		result.Message = stringPtr("无法执行探测")
		return
	}

	if !probeResult.SnmpReachable {
		result.Status = "fail"
		result.Message = stringPtr("SNMP服务不可达")
		if probeResult.SnmpError != nil {
			result.ErrorMessage = probeResult.SnmpError
		}
		return
	}

	// 获取配置中的阈值
	config, _ := checkItem["config"].(map[string]interface{})
	threshold, _ := config["threshold"].(map[string]interface{})
	warningThreshold, _ := threshold["warning"].(float64)
	criticalThreshold, _ := threshold["critical"].(float64)

	// 按检查项的 metric 字段分派到具体指标（稳定键，不再依赖中文名称关键词，改名不影响分派）。
	metric := strings.ToLower(strings.TrimSpace(readString(checkItem, "metric")))
	switch metric {
	case "cpu":
		h.checkCPUMetric(result, snmpMetrics, warningThreshold, criticalThreshold)
	case "memory":
		h.checkMemoryMetric(result, snmpMetrics, warningThreshold, criticalThreshold)
	case "temperature":
		h.checkTemperatureMetric(result, snmpMetrics, warningThreshold, criticalThreshold)
	case "uptime":
		h.checkUptimeMetric(result, snmpMetrics)
	case "interface":
		h.checkInterfaceMetric(result, snmpMetrics)
	case "interface_utilization":
		h.checkInterfaceUtilizationMetric(result, snmpMetrics, warningThreshold, criticalThreshold)
	case "interface_errors":
		h.checkInterfaceErrorsMetric(result, snmpMetrics, warningThreshold, criticalThreshold)
	case "interface_discards":
		h.checkInterfaceDiscardsMetric(result, snmpMetrics, warningThreshold, criticalThreshold)
	case "interface_admin_status":
		h.checkInterfaceAdminStatusMetric(result, snmpMetrics)
	case "interface_duplex":
		h.checkInterfaceDuplexMetric(result, snmpMetrics)
	case "fan_status":
		h.checkComponentStatusMetric(result, snmpMetrics, config, "fan", "风扇")
	case "power_status":
		h.checkComponentStatusMetric(result, snmpMetrics, config, "power", "电源")
	case "poe":
		h.checkPoEMetric(result, snmpMetrics, warningThreshold, criticalThreshold)
	case "optical_power":
		h.checkOpticalPowerMetric(result, snmpMetrics, warningThreshold, criticalThreshold)
	case "bgp_peers":
		h.checkBGPPeersMetric(result, snmpMetrics)
	case "firmware_version":
		h.checkFirmwareVersionMetric(result, snmpMetrics)
	case "bandwidth":
		h.checkBandwidthMetric(result, snmpMetrics)
	case "reachable", "system_info":
		// 仅校验 SNMP 可达性与系统信息；实际值为探测响应耗时（仅此分支适用该量纲）
		if probeResult.SnmpResponseTime != nil {
			responseTime := fmt.Sprintf("%.2fms", *probeResult.SnmpResponseTime)
			result.ActualValue = &responseTime
		}
		result.Status = "pass"
		result.Message = stringPtr("SNMP服务正常")
		if probeResult.SnmpSystemInfo != nil && *probeResult.SnmpSystemInfo != "" {
			sysInfo := *probeResult.SnmpSystemInfo
			if len(sysInfo) > 100 {
				sysInfo = sysInfo[:100] + "..."
			}
			msg := fmt.Sprintf("SNMP服务正常 - %s", sysInfo)
			result.Message = &msg
		}
	case "":
		// 旧版模板检查项缺少 metric：显式跳过，不得静默当连通性检查报"通过"
		result.Status = "skip"
		result.Message = stringPtr("检查项未配置采集指标(metric)，无法执行真实采集；请编辑模板重新保存，或改用内置巡检模板")
	default:
		result.Status = "skip"
		result.Message = stringPtr(fmt.Sprintf("未知的 SNMP 指标: %s", metric))
	}
}

// checkCPUMetric 检查 CPU 使用率
func (h InspectionHandler) checkCPUMetric(result *inspection.Result, metrics *devices.SNMPMetrics, warningThreshold, criticalThreshold float64) {
	// 先补齐默认阈值再写入参考标准：无论采集成败，结果里都带判定依据
	if warningThreshold == 0 {
		warningThreshold = 70
	}
	if criticalThreshold == 0 {
		criticalThreshold = 90
	}
	result.ExpectedValue = stringPtr(fmt.Sprintf("< %.0f%%（警告 ≥%.0f%%，故障 ≥%.0f%%）", warningThreshold, warningThreshold, criticalThreshold))

	if metrics == nil || metrics.CPUUsage == nil {
		result.Status = "skip"
		result.Message = stringPtr("无法获取CPU使用率数据")
		return
	}

	cpuUsage := *metrics.CPUUsage
	actualValue := fmt.Sprintf("%.1f%%", cpuUsage)
	result.ActualValue = &actualValue

	if cpuUsage >= criticalThreshold {
		result.Status = "fail"
		msg := fmt.Sprintf("CPU使用率过高: %.1f%% (阈值: %.0f%%)", cpuUsage, criticalThreshold)
		result.Message = &msg
	} else if cpuUsage >= warningThreshold {
		result.Status = "warning"
		msg := fmt.Sprintf("CPU使用率较高: %.1f%% (警告阈值: %.0f%%)", cpuUsage, warningThreshold)
		result.Message = &msg
	} else {
		result.Status = "pass"
		msg := fmt.Sprintf("CPU使用率正常: %.1f%%", cpuUsage)
		result.Message = &msg
	}
}

// checkMemoryMetric 检查内存使用率
func (h InspectionHandler) checkMemoryMetric(result *inspection.Result, metrics *devices.SNMPMetrics, warningThreshold, criticalThreshold float64) {
	if warningThreshold == 0 {
		warningThreshold = 80
	}
	if criticalThreshold == 0 {
		criticalThreshold = 95
	}
	result.ExpectedValue = stringPtr(fmt.Sprintf("< %.0f%%（警告 ≥%.0f%%，故障 ≥%.0f%%）", warningThreshold, warningThreshold, criticalThreshold))

	if metrics == nil || metrics.MemoryUsage == nil {
		result.Status = "skip"
		result.Message = stringPtr("无法获取内存使用率数据")
		return
	}

	memUsage := *metrics.MemoryUsage
	actualValue := fmt.Sprintf("%.1f%%", memUsage)
	result.ActualValue = &actualValue

	if memUsage >= criticalThreshold {
		result.Status = "fail"
		msg := fmt.Sprintf("内存使用率过高: %.1f%% (阈值: %.0f%%)", memUsage, criticalThreshold)
		result.Message = &msg
	} else if memUsage >= warningThreshold {
		result.Status = "warning"
		msg := fmt.Sprintf("内存使用率较高: %.1f%% (警告阈值: %.0f%%)", memUsage, warningThreshold)
		result.Message = &msg
	} else {
		result.Status = "pass"
		msg := fmt.Sprintf("内存使用率正常: %.1f%%", memUsage)
		result.Message = &msg
	}
}

// checkUptimeMetric 检查系统运行时间。
// 运行时间过短通常意味着设备近期发生过（可能非计划的）重启，因此不再
// 无条件通过：不足 24 小时判警告，提示管理员确认重启原因。
func (h InspectionHandler) checkUptimeMetric(result *inspection.Result, metrics *devices.SNMPMetrics) {
	const uptimeWarningSeconds = 24 * 3600
	result.ExpectedValue = stringPtr("≥ 24 小时（过短提示近期重启）")

	if metrics == nil || metrics.Uptime == nil {
		result.Status = "skip"
		result.Message = stringPtr("无法获取系统运行时间数据")
		return
	}

	uptime := *metrics.Uptime
	// 格式化运行时间
	days := uptime / 86400
	hours := (uptime % 86400) / 3600
	minutes := (uptime % 3600) / 60

	var uptimeStr string
	if days > 0 {
		uptimeStr = fmt.Sprintf("%d天%d小时%d分钟", days, hours, minutes)
	} else if hours > 0 {
		uptimeStr = fmt.Sprintf("%d小时%d分钟", hours, minutes)
	} else {
		uptimeStr = fmt.Sprintf("%d分钟", minutes)
	}

	result.ActualValue = &uptimeStr
	if uptime < uptimeWarningSeconds {
		result.Status = "warning"
		msg := fmt.Sprintf("系统运行时间仅 %s，设备可能近期发生过重启，请确认是否为计划内操作", uptimeStr)
		result.Message = &msg
		return
	}
	result.Status = "pass"
	msg := fmt.Sprintf("系统运行时间: %s", uptimeStr)
	result.Message = &msg
}

// checkInterfaceMetric 检查接口状态。
// 优先采用 IfOperStatus（IsUp）统计真实 UP 接口数；旧采集数据或部分设备
// 缺失该字段时回退"有流量计数即视为活跃"的启发式。全部接口 DOWN/无流量
// 时判警告——设备虽可达，但业务口全停很可能是异常。
func (h InspectionHandler) checkInterfaceMetric(result *inspection.Result, metrics *devices.SNMPMetrics) {
	result.ExpectedValue = stringPtr("UP 接口数 ≥ 1")

	if metrics == nil || len(metrics.Interfaces) == 0 {
		result.Status = "skip"
		result.Message = stringPtr("无法获取接口状态数据")
		return
	}

	totalInterfaces := len(metrics.Interfaces)
	upInterfaces := 0
	upKnown := false
	activeByTraffic := 0
	for _, iface := range metrics.Interfaces {
		if iface.IsUp != nil {
			upKnown = true
			if *iface.IsUp {
				upInterfaces++
			}
		}
		if iface.InOctets != nil || iface.OutOctets != nil {
			activeByTraffic++
		}
	}

	active := upInterfaces
	descriptor := "UP"
	if !upKnown {
		active = activeByTraffic
		descriptor = "活跃"
	}

	actualValue := fmt.Sprintf("%d/%d", active, totalInterfaces)
	result.ActualValue = &actualValue
	if active == 0 {
		result.Status = "warning"
		msg := fmt.Sprintf("所有接口均非 %s 状态 (共%d个)，请确认设备业务是否正常", descriptor, totalInterfaces)
		result.Message = &msg
		return
	}
	result.Status = "pass"
	msg := fmt.Sprintf("接口状态正常: %d个%s接口 (共%d个)", active, descriptor, totalInterfaces)
	result.Message = &msg
}

// checkTemperatureMetric 检查温度
func (h InspectionHandler) checkTemperatureMetric(result *inspection.Result, metrics *devices.SNMPMetrics, warningThreshold, criticalThreshold float64) {
	if warningThreshold == 0 {
		warningThreshold = 60
	}
	if criticalThreshold == 0 {
		criticalThreshold = 75
	}
	result.ExpectedValue = stringPtr(fmt.Sprintf("< %.0f°C（警告 ≥%.0f°C，故障 ≥%.0f°C）", warningThreshold, warningThreshold, criticalThreshold))

	if metrics == nil || metrics.Temperature == nil {
		result.Status = "skip"
		result.Message = stringPtr("无法获取温度数据")
		return
	}

	temp := *metrics.Temperature
	actualValue := fmt.Sprintf("%.1f°C", temp)
	result.ActualValue = &actualValue

	if temp >= criticalThreshold {
		result.Status = "fail"
		msg := fmt.Sprintf("设备温度过高: %.1f°C (阈值: %.0f°C)", temp, criticalThreshold)
		result.Message = &msg
	} else if temp >= warningThreshold {
		result.Status = "warning"
		msg := fmt.Sprintf("设备温度较高: %.1f°C (警告阈值: %.0f°C)", temp, warningThreshold)
		result.Message = &msg
	} else {
		result.Status = "pass"
		msg := fmt.Sprintf("设备温度正常: %.1f°C", temp)
		result.Message = &msg
	}
}

// utilizationTopOffenderLimit 高负载接口明细的展示上限：
// 检查结果会进入 PDF 报告的定宽表格，过长会被截断，取前 3 个足以定位。
const utilizationTopOffenderLimit = 3

// interfaceUtilizationEntry 单个接口的利用率快照，取入/出方向中更高的一侧。
type interfaceUtilizationEntry struct {
	Name       string   `json:"name"`
	Direction  string   `json:"direction"` // "入" 或 "出"
	Percent    float64  `json:"percent"`
	SpeedMbps  int64    `json:"speed_mbps"`
	InRateBps  *float64 `json:"in_rate_bps,omitempty"`
	OutRateBps *float64 `json:"out_rate_bps,omitempty"`
	IsUp       *bool    `json:"is_up,omitempty"`
}

// interfaceUtilizationSkipped 无法计算利用率的接口及其原因，
// 与已评估接口一并落库，避免"29 个接口只看到 2 行"造成的困惑。
type interfaceUtilizationSkipped struct {
	Name   string `json:"name"`
	Reason string `json:"reason"`
}

// interfaceUtilizationSummary 全设备接口利用率汇总。
type interfaceUtilizationSummary struct {
	Total        int // 采集到的接口总数
	Evaluated    int // 具备容量与速率样本、可计算利用率的接口数
	Peak         interfaceUtilizationEntry
	OverWarning  int
	OverCritical int
	Entries      []interfaceUtilizationEntry // 全部已评估接口，按利用率降序
	Skipped      []interfaceUtilizationSkipped
	TopOffenders []interfaceUtilizationEntry // 达到警告阈值的接口，最多 utilizationTopOffenderLimit 个（供消息摘要）
}

// interfaceDisplayName 返回接口的可读名称。
// 采集端把 Name 固定写成 "if<索引>"，真实接口名（GigabitEthernet0/0/1 等）在 Description，
// 因此优先取 Description，否则结果里只会出现 "if3" 这类无从定位的编号。
func interfaceDisplayName(iface devices.InterfaceMetrics) string {
	if descr := strings.TrimSpace(iface.Description); descr != "" {
		return descr
	}
	return strings.TrimSpace(iface.Name)
}

// summarizeInterfaceUtilization 逐接口计算带宽利用率并汇总。
// 纯函数（不依赖 handler/DB/网络），便于表驱动测试。
//
// 接口被排除在评估之外的三种情形：
//  1. IsUp 明确为 false —— DOWN 口的利用率无意义，其状态由"接口状态"检查项负责；
//     IsUp 为 nil（旧采集数据未带 ifOperStatus）时不过滤，避免整机漏评估。
//  2. Speed 缺失或非正 —— 没有容量就没有分母（Loopback/NULL 口通常落在这里）。
//  3. InRate 与 OutRate 均缺失 —— 速率由两次 octets 采样差分得出，首轮采集尚无基线。
func summarizeInterfaceUtilization(interfaces []devices.InterfaceMetrics, warning, critical float64) interfaceUtilizationSummary {
	summary := interfaceUtilizationSummary{Total: len(interfaces)}
	entries := make([]interfaceUtilizationEntry, 0, len(interfaces))

	for _, iface := range interfaces {
		name := interfaceDisplayName(iface)
		if iface.IsUp != nil && !*iface.IsUp {
			summary.Skipped = append(summary.Skipped, interfaceUtilizationSkipped{Name: name, Reason: "接口未 UP"})
			continue
		}
		if iface.Speed == nil || *iface.Speed <= 0 {
			summary.Skipped = append(summary.Skipped, interfaceUtilizationSkipped{Name: name, Reason: "无接口容量（未上报速率）"})
			continue
		}
		if iface.InRate == nil && iface.OutRate == nil {
			summary.Skipped = append(summary.Skipped, interfaceUtilizationSkipped{Name: name, Reason: "无速率样本（尚未形成差分基线）"})
			continue
		}

		// Speed 单位为 Mbps，速率单位为 bps
		capacityBps := float64(*iface.Speed) * 1_000_000
		entry := interfaceUtilizationEntry{
			Name:       name,
			Percent:    -1,
			SpeedMbps:  *iface.Speed,
			InRateBps:  iface.InRate,
			OutRateBps: iface.OutRate,
			IsUp:       iface.IsUp,
		}
		for _, sample := range []struct {
			rate      *float64
			direction string
		}{{iface.InRate, "入"}, {iface.OutRate, "出"}} {
			if sample.rate == nil {
				continue
			}
			if util := *sample.rate / capacityBps * 100; util > entry.Percent {
				entry.Percent = util
				entry.Direction = sample.direction
			}
		}
		if entry.Percent < 0 {
			summary.Skipped = append(summary.Skipped, interfaceUtilizationSkipped{Name: name, Reason: "无速率样本（尚未形成差分基线）"})
			continue
		}

		summary.Evaluated++
		entries = append(entries, entry)
		if entry.Percent >= critical {
			summary.OverCritical++
		}
		if entry.Percent >= warning {
			summary.OverWarning++
		}
	}

	if len(entries) == 0 {
		return summary
	}

	sort.SliceStable(entries, func(i, j int) bool { return entries[i].Percent > entries[j].Percent })
	summary.Entries = entries
	summary.Peak = entries[0]
	for _, entry := range entries {
		if entry.Percent < warning || len(summary.TopOffenders) >= utilizationTopOffenderLimit {
			break
		}
		summary.TopOffenders = append(summary.TopOffenders, entry)
	}

	return summary
}

// formatUtilizationOffenders 把高负载接口渲染成 "GE0/0/1 出 92.3%、GE0/0/2 入 78.1%" 形式。
func formatUtilizationOffenders(entries []interfaceUtilizationEntry, total int) string {
	parts := make([]string, 0, len(entries))
	for _, entry := range entries {
		parts = append(parts, fmt.Sprintf("%s %s %.1f%%", entry.Name, entry.Direction, entry.Percent))
	}
	text := strings.Join(parts, "、")
	if total > len(entries) {
		text += fmt.Sprintf(" 等 %d 个", total)
	}
	return text
}

// buildInterfaceUtilizationDetails 把接口利用率汇总序列化进 result.details。
// 已评估接口按利用率降序，未评估接口附原因，消费方（执行详情弹窗、PDF 报告）
// 可直接渲染成完整表格而无需二次计算。
func buildInterfaceUtilizationDetails(summary interfaceUtilizationSummary, warning, critical float64) datatypes.JSON {
	payload := map[string]interface{}{
		"kind":               "interface_utilization",
		"total":              summary.Total,
		"evaluated":          summary.Evaluated,
		"over_warning":       summary.OverWarning,
		"over_critical":      summary.OverCritical,
		"warning_threshold":  warning,
		"critical_threshold": critical,
		"interfaces":         summary.Entries,
		"skipped":            summary.Skipped,
	}
	if summary.Entries == nil {
		payload["interfaces"] = []interfaceUtilizationEntry{}
	}
	if summary.Skipped == nil {
		payload["skipped"] = []interfaceUtilizationSkipped{}
	}

	encoded, err := json.Marshal(payload)
	if err != nil {
		return nil
	}
	return datatypes.JSON(encoded)
}

// thresholdDetailsPayload 生成阈值口径的 details 载荷片段，是所有带阈值检查项的公共部分。
//
// 报告需要说明「本次按什么口径判的」：同一指标在不同模板下阈值可能不同，
// 而 inspection_results 表没有阈值列，只能经 details 透传。
// 传入的必须是补齐默认后**实际生效**的值，写 0 会让报告出现「按 0/0 判定」。
func thresholdDetailsPayload(metric string, warning, critical float64, unit string) map[string]interface{} {
	return map[string]interface{}{
		"metric": metric,
		"threshold": map[string]interface{}{
			"warning":  warning,
			"critical": critical,
			"unit":     unit,
		},
	}
}

// buildThresholdDetails 把阈值口径单独写成一份 details，
// 用于没有逐项明细的检查项；有明细的检查项在自己的载荷里合并同样的字段。
func buildThresholdDetails(metric string, warning, critical float64, unit string) datatypes.JSON {
	payload := thresholdDetailsPayload(metric, warning, critical, unit)
	payload["kind"] = "threshold"

	encoded, err := json.Marshal(payload)
	if err != nil {
		return nil
	}
	return datatypes.JSON(encoded)
}

// 逐行明细的判定词表刻意复用检查结果的状态词（pass / warning / fail / skip），
// 而不是另造一套「正常 / 异常 / 未知」。PDF 的 localizeStatusWord 与前端的
// 状态标签已经能本地化这套词，复用等于零新增映射——每多一套词表，就要在
// PDF 与前端两处各维护一份，且一处漏改就会出现「行判定与整项状态自相矛盾」。
const (
	rowVerdictPass    = "pass"
	rowVerdictWarning = "warning"
	rowVerdictFail    = "fail"
	rowVerdictSkip    = "skip"
)

// rowVerdictRank 给逐行判定排序权重，最坏优先。
// 报告表格在超长时会截断，留下的必须是需要处理的那几行。
func rowVerdictRank(verdict string) int {
	switch verdict {
	case rowVerdictFail:
		return 0
	case rowVerdictWarning:
		return 1
	case rowVerdictSkip:
		return 2
	default:
		return 3
	}
}

// encodeDetailsPayload 把明细载荷编码成 details 列的值。
// 编码失败时返回 nil 而非半截 JSON——写坏的 details 会让报告端解析崩溃，
// 而 nil 只是退回纯文本展示。
func encodeDetailsPayload(payload map[string]interface{}) datatypes.JSON {
	encoded, err := json.Marshal(payload)
	if err != nil {
		return nil
	}
	return datatypes.JSON(encoded)
}

// ---------------------------------------------------------------------------
// 部件状态（风扇 / 电源）
// ---------------------------------------------------------------------------

// 部件状态码的默认映射。
//
// 这是整套检查里最需要谨慎的地方：MIB registry 只记录了 OID 与中文描述
// （「风扇状态」），取值含义无从查证，且华为与 H3C 的编码并不一致。默认值按
// 通用约定取 1=正常、2=异常，但**实际部署应按设备实测校准**，模板 config 的
//
// 关键约束：落在两个集合之外的状态码判 skip，绝不猜。猜成异常会误报；猜成正常
// 更糟——故障设备被报成健康，静默失效直到设备真的挂掉。
var (
	defaultComponentNormalStates   = []float64{1}
	defaultComponentAbnormalStates = []float64{2}
)

// componentStateCodes 从模板 config 读取状态码集合，未配置时返回默认值。
func componentStateCodes(config map[string]interface{}, key string, fallback []float64) []float64 {
	raw, ok := config[key]
	if !ok || raw == nil {
		return fallback
	}
	list, ok := raw.([]interface{})
	if !ok {
		return fallback
	}
	codes := make([]float64, 0, len(list))
	for _, item := range list {
		if value, ok := toFloatValue(item); ok {
			codes = append(codes, value)
		}
	}
	if len(codes) == 0 {
		return fallback
	}
	return codes
}

// toFloatValue 兼容 jsonb 反序列化出的多种数值形态。
func toFloatValue(raw interface{}) (float64, bool) {
	switch v := raw.(type) {
	case float64:
		return v, true
	case float32:
		return float64(v), true
	case int:
		return float64(v), true
	case int64:
		return float64(v), true
	}
	return 0, false
}

func containsFloat(list []float64, want float64) bool {
	for _, v := range list {
		if v == want {
			return true
		}
	}
	return false
}

// componentStatusEntry 是部件状态明细的一行。
// State 保留厂商原始状态码——报告要能展示「码 77」这个事实本身，
// 运维据此才能校准模板配置。
type componentStatusEntry struct {
	Index   string `json:"index"`
	Kind    string `json:"kind"`
	Verdict string `json:"verdict"`
	State   *int64 `json:"state,omitempty"`
}

// componentStatusSummary 单类部件（风扇或电源）的状态汇总。
type componentStatusSummary struct {
	Total           int
	Normal          int
	Abnormal        int
	Unknown         int
	AbnormalIndexes []string
	UnknownCodes    []string
	Entries         []componentStatusEntry
}

// summarizeComponentStatus 按 kind 过滤并逐部件判定状态码。
//
// 必须按 kind 过滤：Components 是所有部件的混合清单，风扇与电源两个检查项
// 共用它。不过滤会让风扇明细里混进电源行，且计数与摘要对不上。
func summarizeComponentStatus(
	components []devices.ComponentStatusMetrics,
	kind string,
	normalStates, abnormalStates []float64,
) componentStatusSummary {
	summary := componentStatusSummary{
		AbnormalIndexes: make([]string, 0),
		UnknownCodes:    make([]string, 0),
	}
	entries := make([]componentStatusEntry, 0, len(components))

	for _, component := range components {
		if component.Kind != kind || component.State == nil {
			continue
		}
		summary.Total++
		state := float64(*component.State)
		entry := componentStatusEntry{Index: component.Index, Kind: component.Kind, State: component.State}

		switch {
		case containsFloat(normalStates, state):
			summary.Normal++
			entry.Verdict = rowVerdictPass
		case containsFloat(abnormalStates, state):
			summary.Abnormal++
			entry.Verdict = rowVerdictFail
			summary.AbnormalIndexes = append(summary.AbnormalIndexes, component.Index)
		default:
			summary.Unknown++
			entry.Verdict = rowVerdictSkip
			summary.UnknownCodes = append(summary.UnknownCodes, fmt.Sprintf("%s(码 %d)", component.Index, *component.State))
		}
		entries = append(entries, entry)
	}

	sort.SliceStable(entries, func(i, j int) bool {
		return rowVerdictRank(entries[i].Verdict) < rowVerdictRank(entries[j].Verdict)
	})
	summary.Entries = entries
	return summary
}

// buildComponentStatusDetails 生成部件状态的逐部件明细载荷。
//
// 载荷同时回显本次生效的状态码集合：只给「码 77，未知」运维无从下手，
// 连同「本次按正常={1}、异常={2} 判的」一起给出，才能据此校准模板配置。
func buildComponentStatusDetails(
	summary componentStatusSummary,
	kind, label string,
	normalStates, abnormalStates []float64,
) datatypes.JSON {
	payload := map[string]interface{}{
		"kind":            "component_status",
		"component_kind":  kind,
		"label":           label,
		"total":           summary.Total,
		"normal":          summary.Normal,
		"abnormal":        summary.Abnormal,
		"unknown":         summary.Unknown,
		"normal_states":   normalStates,
		"abnormal_states": abnormalStates,
		"components":      summary.Entries,
	}
	if summary.Entries == nil {
		payload["components"] = []componentStatusEntry{}
	}
	return encodeDetailsPayload(payload)
}

// checkComponentStatusMetric 是风扇与电源检查的共同实现。
func (h InspectionHandler) checkComponentStatusMetric(
	result *inspection.Result,
	metrics *devices.SNMPMetrics,
	config map[string]interface{},
	kind, label string,
) {
	normalStates := componentStateCodes(config, "normal_states", defaultComponentNormalStates)
	abnormalStates := componentStateCodes(config, "abnormal_states", defaultComponentAbnormalStates)
	result.ExpectedValue = stringPtr(fmt.Sprintf("全部%s状态码应属于正常集合 %v", label, normalStates))

	if metrics == nil || len(metrics.Components) == 0 {
		result.Status = "skip"
		result.Message = stringPtr(fmt.Sprintf("设备未上报%s状态（该厂商或型号可能不支持对应 MIB）", label))
		return
	}

	summary := summarizeComponentStatus(metrics.Components, kind, normalStates, abnormalStates)
	result.Details = buildComponentStatusDetails(summary, kind, label, normalStates, abnormalStates)

	total, normal, abnormal, unknown := summary.Total, summary.Normal, summary.Abnormal, summary.Unknown
	abnormalIndexes, unknownCodes := summary.AbnormalIndexes, summary.UnknownCodes

	if total == 0 {
		result.Status = "skip"
		result.Message = stringPtr(fmt.Sprintf("设备未上报%s状态（该厂商或型号可能不支持对应 MIB）", label))
		return
	}

	actual := fmt.Sprintf("共 %d 个%s：正常 %d，异常 %d，状态码未知 %d", total, label, normal, abnormal, unknown)
	result.ActualValue = &actual

	if abnormal > 0 {
		result.Status = "fail"
		result.Message = stringPtr(fmt.Sprintf("%d 个%s处于异常状态（编号 %s），请现场确认并准备备件",
			abnormal, label, strings.Join(abnormalIndexes, "、")))
		return
	}

	// 全部落在未知码上时不作判定：状态码语义未经实测确认，猜正常等于把故障
	// 设备报成健康。显式判 skip 并给出原始码，让运维据此校准模板配置。
	if normal == 0 && unknown > 0 {
		result.Status = "skip"
		result.Message = stringPtr(fmt.Sprintf(
			"%s状态码不在已知集合内，无法判定：%s；请按设备实际取值在模板中配置 normal_states / abnormal_states",
			label, strings.Join(unknownCodes, "、")))
		return
	}

	result.Status = "pass"
	message := fmt.Sprintf("%d 个%s状态正常", normal, label)
	if unknown > 0 {
		message += fmt.Sprintf("；另有 %d 个状态码未知（%s），未参与判定",
			unknown, strings.Join(unknownCodes, "、"))
	}
	result.Message = stringPtr(message)
}

// ---------------------------------------------------------------------------
// PoE 供电
// ---------------------------------------------------------------------------

// checkPoEMetric 检查 PoE 供电余量。
//
// 分厂商降级：H3C 上报 PSE 剩余保障功率，可直接判定「还能不能再接设备」；
// 华为只上报端口消耗功率、没有系统额定总功率，算不出使用率，此时退化为纯展示
// ——硬判会是无根据的猜测。定位与「带宽吞吐量」项相同。
func (h InspectionHandler) checkPoEMetric(result *inspection.Result, metrics *devices.SNMPMetrics, warning, critical float64) {
	if warning == 0 {
		warning = 30
	}
	if critical == 0 {
		critical = 10
	}
	result.ExpectedValue = stringPtr(fmt.Sprintf("PSE 剩余保障功率 > %gW（警告 <=%gW，故障 <=%gW）", warning, warning, critical))

	if metrics == nil || (len(metrics.PoE.Ports) == 0 && metrics.PoE.RemainingPower == nil) {
		result.Status = "skip"
		result.Message = stringPtr("设备未上报 PoE 供电数据（非 PoE 设备或不支持对应 MIB）")
		return
	}

	totalConsuming := 0.0
	for _, port := range metrics.PoE.Ports {
		if port.ConsumingPower != nil {
			totalConsuming += *port.ConsumingPower
		}
	}

	if metrics.PoE.RemainingPower == nil {
		// 只有端口功率：纯展示
		result.ExpectedValue = stringPtr("仅采集展示（该设备未上报 PSE 剩余保障功率，无法计算供电余量）")
		actual := fmt.Sprintf("%d 个端口在供电，合计消耗 %.1f", len(metrics.PoE.Ports), totalConsuming)
		result.ActualValue = &actual
		result.Status = "pass"
		result.Message = stringPtr(fmt.Sprintf(
			"已采集 %d 个 PoE 端口功率；该设备未上报剩余保障功率，无法判定供电余量，仅作展示", len(metrics.PoE.Ports)))
		return
	}

	remaining := *metrics.PoE.RemainingPower
	unit := metrics.PoE.RemainingUnit
	if unit == "" {
		unit = "W"
	}
	actual := fmt.Sprintf("剩余保障功率 %.1f%s；%d 个端口在供电", remaining, unit, len(metrics.PoE.Ports))
	result.ActualValue = &actual

	switch {
	case remaining <= critical:
		result.Status = "fail"
		result.Message = stringPtr(fmt.Sprintf(
			"PoE 剩余保障功率仅 %.1f%s，已低于故障阈值 %g%s，新接入的 AP 或 IP 话机将无法上电",
			remaining, unit, critical, unit))
	case remaining <= warning:
		result.Status = "warning"
		result.Message = stringPtr(fmt.Sprintf(
			"PoE 剩余保障功率 %.1f%s，低于警告阈值 %g%s，扩容前请评估供电预算",
			remaining, unit, warning, unit))
	default:
		result.Status = "pass"
		result.Message = stringPtr(fmt.Sprintf("PoE 剩余保障功率 %.1f%s，供电余量充足", remaining, unit))
	}
}

// ---------------------------------------------------------------------------
// 光模块光功率
// ---------------------------------------------------------------------------

// opticalModuleEntry 是光模块明细的一行。
//
// 电压与偏置电流不是凑数：收光偏低有链路侧（光纤衰耗、接头脏污）与模块侧
// （激光器老化）两种成因，偏置电流升高而发光下降指向后者。这是「换模块」
// 还是「查光纤」的判断依据，只给一个收光值无从区分。
type opticalModuleEntry struct {
	Index           string   `json:"index"`
	Verdict         string   `json:"verdict"`
	RxPower         float64  `json:"rx_power"`
	RxPowerUnit     string   `json:"rx_power_unit"`
	TxPower         *float64 `json:"tx_power,omitempty"`
	TxPowerUnit     string   `json:"tx_power_unit,omitempty"`
	Voltage         *float64 `json:"voltage,omitempty"`
	VoltageUnit     string   `json:"voltage_unit,omitempty"`
	BiasCurrent     *float64 `json:"bias_current,omitempty"`
	BiasCurrentUnit string   `json:"bias_current_unit,omitempty"`
}

// opticalPowerSummary 光模块收光功率汇总。
type opticalPowerSummary struct {
	Total        int
	Evaluated    int
	OverWarning  int // 低于警告阈值（含低于故障阈值的）
	OverCritical int
	Worst        float64
	WorstName    string
	Entries      []opticalModuleEntry
	Skipped      []interfaceUtilizationSkipped
	Offenders    []string // 供消息摘要，已按最坏优先排序
}

// summarizeOpticalModules 逐模块判定收光功率。
//
// 与其他阈值检查方向相反：光功率越低越危险，判定用「低于阈值告警」。
func summarizeOpticalModules(modules []devices.OpticalTransceiverMetrics, warning, critical float64) opticalPowerSummary {
	summary := opticalPowerSummary{Total: len(modules)}
	entries := make([]opticalModuleEntry, 0, len(modules))

	for _, module := range modules {
		if module.RxPower == nil {
			// 未上报收光的模块必须留痕：直接丢弃会让「采到 8 个只评了 3 个」
			// 在报告里变成「3 个模块均正常」的假全景。
			summary.Skipped = append(summary.Skipped, interfaceUtilizationSkipped{
				Name: module.Index, Reason: "设备未上报收光功率（该模块不支持 DDM 或未插入光纤）",
			})
			continue
		}

		rx := *module.RxPower
		summary.Evaluated++
		if summary.Evaluated == 1 || rx < summary.Worst {
			summary.Worst = rx
			summary.WorstName = module.Index
		}

		verdict := rowVerdictPass
		switch {
		case rx <= critical:
			verdict = rowVerdictFail
			summary.OverCritical++
			summary.OverWarning++
		case rx <= warning:
			verdict = rowVerdictWarning
			summary.OverWarning++
		}

		unit := module.RxPowerUnit
		if unit == "" {
			// 采集端已把各厂商量纲归一到 dBm，缺省时按判定单位补齐，
			// 否则报告里会出现没有单位的裸数字。
			unit = "dBm"
		}
		entries = append(entries, opticalModuleEntry{
			Index: module.Index, Verdict: verdict,
			RxPower: rx, RxPowerUnit: unit,
			TxPower: module.TxPower, TxPowerUnit: module.TxPowerUnit,
			Voltage: module.Voltage, VoltageUnit: module.VoltageUnit,
			BiasCurrent: module.BiasCurrent, BiasCurrentUnit: module.BiasCurrentUnit,
		})
	}

	sort.SliceStable(entries, func(i, j int) bool { return entries[i].RxPower < entries[j].RxPower })
	summary.Entries = entries

	offenders := make([]string, 0, summary.OverWarning)
	for _, entry := range entries {
		if entry.Verdict == rowVerdictPass {
			continue
		}
		offenders = append(offenders, fmt.Sprintf("%s(%.1f%s)", entry.Index, entry.RxPower, entry.RxPowerUnit))
	}
	summary.Offenders = offenders
	return summary
}

// buildOpticalPowerDetails 生成光模块的逐模块明细载荷。
func buildOpticalPowerDetails(summary opticalPowerSummary, warning, critical float64) datatypes.JSON {
	payload := map[string]interface{}{
		"kind":               "optical_power",
		"total":              summary.Total,
		"evaluated":          summary.Evaluated,
		"over_warning":       summary.OverWarning,
		"over_critical":      summary.OverCritical,
		"warning_threshold":  warning,
		"critical_threshold": critical,
		"modules":            summary.Entries,
		"skipped":            summary.Skipped,
	}
	if summary.Entries == nil {
		payload["modules"] = []opticalModuleEntry{}
	}
	if summary.Skipped == nil {
		payload["skipped"] = []interfaceUtilizationSkipped{}
	}
	for key, value := range thresholdDetailsPayload("optical_power", warning, critical, "dBm") {
		payload[key] = value
	}
	return encodeDetailsPayload(payload)
}

// checkOpticalPowerMetric 检查光模块收发光功率。
//
// 与其他阈值检查方向相反：光功率是**越低越危险**，判定用「低于阈值告警」。
// 光衰比错包更早暴露链路劣化，是提前更换光模块的依据。
func (h InspectionHandler) checkOpticalPowerMetric(result *inspection.Result, metrics *devices.SNMPMetrics, warning, critical float64) {
	// 默认区间取通用光模块的可接受下限；不同型号差异较大，模板可覆盖
	if warning == 0 {
		warning = -25
	}
	if critical == 0 {
		critical = -30
	}
	result.ExpectedValue = stringPtr(fmt.Sprintf("收光功率 > %gdBm（警告 <=%gdBm，故障 <=%gdBm）", warning, warning, critical))
	result.Details = buildThresholdDetails("optical_power", warning, critical, "dBm")

	if metrics == nil || len(metrics.OpticalTransceivers) == 0 {
		result.Status = "skip"
		result.Message = stringPtr("设备未上报光模块诊断数据（纯电口设备或不支持 DDM）")
		return
	}

	summary := summarizeOpticalModules(metrics.OpticalTransceivers, warning, critical)
	result.Details = buildOpticalPowerDetails(summary, warning, critical)

	if summary.Evaluated == 0 {
		result.Status = "skip"
		result.Message = stringPtr(fmt.Sprintf("采集到 %d 个光模块，但均未上报收光功率", summary.Total))
		return
	}

	actual := fmt.Sprintf("已评估 %d 个光模块；最低收光 %.1fdBm（%s）；超限 %d 个",
		summary.Evaluated, summary.Worst, summary.WorstName, summary.OverWarning)
	result.ActualValue = &actual

	shown := summary.Offenders
	if len(shown) > utilizationTopOffenderLimit {
		shown = shown[:utilizationTopOffenderLimit]
	}

	switch {
	case summary.OverCritical > 0:
		result.Status = "fail"
		result.Message = stringPtr(fmt.Sprintf(
			"%d 个光模块收光功率低于故障阈值 %gdBm，链路随时可能中断：%s",
			summary.OverCritical, critical, strings.Join(shown, "、")))
	case summary.OverWarning > 0:
		result.Status = "warning"
		result.Message = stringPtr(fmt.Sprintf(
			"%d 个光模块收光功率低于警告阈值 %gdBm，建议排查光纤衰耗或准备更换模块：%s",
			summary.OverWarning, warning, strings.Join(shown, "、")))
	default:
		result.Status = "pass"
		result.Message = stringPtr(fmt.Sprintf("已评估 %d 个光模块，收光功率均在正常区间（最低 %.1fdBm）",
			summary.Evaluated, summary.Worst))
	}
}

// ---------------------------------------------------------------------------
// BGP 邻居
// ---------------------------------------------------------------------------

// bgpEstablishedState 是 BGP FSM 的 established 状态码（RFC 4271）。
const bgpEstablishedState = 6

// bgpFlappingThresholdSeconds 判定「近期震荡」的建立时长下限。
// 会话建立不足一小时，说明它在巡检窗口内刚重建过。
const bgpFlappingThresholdSeconds = 3600

// bgpPeerEntry 是 BGP 邻居明细的一行。
//
// LastError 是排障的起点：「hold timer expired」指向链路质量或设备负载，
// 「authentication failure」指向配置。这条信息只有 BGP MIB 有，
// 丢了就得登设备现查。
type bgpPeerEntry struct {
	Index              string `json:"index"`
	Verdict            string `json:"verdict"`
	State              *int   `json:"state,omitempty"`
	StateLabel         string `json:"state_label,omitempty"`
	EstablishedSeconds *int64 `json:"established_seconds,omitempty"`
	LastError          string `json:"last_error,omitempty"`
}

// bgpPeersSummary BGP 邻居汇总。
type bgpPeersSummary struct {
	Total       int
	Established int
	Down        []string
	Flapping    []string
	Entries     []bgpPeerEntry
}

// summarizeBGPPeers 逐邻居判定状态。
func summarizeBGPPeers(peers []devices.BGPNeighborMetrics) bgpPeersSummary {
	summary := bgpPeersSummary{
		Total:    len(peers),
		Down:     make([]string, 0),
		Flapping: make([]string, 0),
	}
	entries := make([]bgpPeerEntry, 0, len(peers))

	for _, peer := range peers {
		entry := bgpPeerEntry{
			Index: peer.Index, State: peer.State, StateLabel: strings.TrimSpace(peer.StateLabel),
			EstablishedSeconds: peer.EstablishedTime,
		}
		if peer.LastError != nil {
			entry.LastError = strings.TrimSpace(*peer.LastError)
		}

		switch {
		case peer.State == nil:
			// 未上报状态码的邻居不作判定，但要在明细里留一行：
			// total 计了它，清单里却没有会让读者以为报告漏了。
			entry.Verdict = rowVerdictSkip
		case *peer.State != bgpEstablishedState:
			entry.Verdict = rowVerdictFail
			label := entry.StateLabel
			if label == "" {
				label = fmt.Sprintf("状态码 %d", *peer.State)
			}
			summary.Down = append(summary.Down, fmt.Sprintf("%s(%s)", peer.Index, label))
		default:
			summary.Established++
			entry.Verdict = rowVerdictPass
			if peer.EstablishedTime != nil && *peer.EstablishedTime < bgpFlappingThresholdSeconds {
				entry.Verdict = rowVerdictWarning
				summary.Flapping = append(summary.Flapping, fmt.Sprintf("%s(%d 秒)", peer.Index, *peer.EstablishedTime))
			}
		}
		entries = append(entries, entry)
	}

	sort.SliceStable(entries, func(i, j int) bool {
		return rowVerdictRank(entries[i].Verdict) < rowVerdictRank(entries[j].Verdict)
	})
	summary.Entries = entries
	return summary
}

// buildBGPPeersDetails 生成 BGP 邻居的逐邻居明细载荷。
func buildBGPPeersDetails(summary bgpPeersSummary) datatypes.JSON {
	payload := map[string]interface{}{
		"kind":        "bgp_peers",
		"total":       summary.Total,
		"established": summary.Established,
		"down":        len(summary.Down),
		"flapping":    len(summary.Flapping),
		// 「建立时长 120 秒」本身不说明问题，得知道判定线在哪。
		// 报告要能写出「低于 3600 秒视为近期重建」，这个常量必须随载荷下发。
		"flapping_threshold_seconds": bgpFlappingThresholdSeconds,
		"peers":                      summary.Entries,
	}
	if summary.Entries == nil {
		payload["peers"] = []bgpPeerEntry{}
	}
	return encodeDetailsPayload(payload)
}

// checkBGPPeersMetric 检查 BGP 邻居状态。
//
// 两类问题都要抓：非 Established 的邻居直接造成路由黑洞；而 Established 但
// 建立时长很短的邻居说明会话在反复重建——后者更隐蔽，巡检那一刻看着正常，
// 实际一直在震荡。
func (h InspectionHandler) checkBGPPeersMetric(result *inspection.Result, metrics *devices.SNMPMetrics) {
	result.ExpectedValue = stringPtr("全部 BGP 邻居处于 Established 且会话稳定")

	if metrics == nil || len(metrics.BGPPeers) == 0 {
		result.Status = "skip"
		result.Message = stringPtr("设备未上报 BGP 邻居信息（未配置 BGP 或不支持对应 MIB）")
		return
	}

	summary := summarizeBGPPeers(metrics.BGPPeers)
	result.Details = buildBGPPeersDetails(summary)

	total := summary.Total
	down := summary.Down
	flapping := summary.Flapping

	actual := fmt.Sprintf("共 %d 个邻居；未建立 %d 个，近期重建 %d 个", total, len(down), len(flapping))
	result.ActualValue = &actual

	if len(down) > 0 {
		result.Status = "fail"
		result.Message = stringPtr(fmt.Sprintf(
			"%d 个 BGP 邻居未处于 Established，相关路由不可用：%s", len(down), strings.Join(down, "、")))
		return
	}
	if len(flapping) > 0 {
		result.Status = "warning"
		result.Message = stringPtr(fmt.Sprintf(
			"%d 个邻居建立时间不足 1 小时，会话可能在反复重建：%s", len(flapping), strings.Join(flapping, "、")))
		return
	}

	result.Status = "pass"
	result.Message = stringPtr(fmt.Sprintf("%d 个 BGP 邻居均处于 Established 且会话稳定", total))
}

// ---------------------------------------------------------------------------
// 固件版本
// ---------------------------------------------------------------------------

// checkFirmwareVersionMetric 采集设备型号与固件版本。
//
// 恒判 pass，只做展示不做判定：版本是否合规取决于厂商推荐版本列表与安全公告，
// 这些信息不在系统内，硬编码判定规则会很快过期。作用是让巡检报告自带版本清单，
// 便于事后比对。
func (h InspectionHandler) checkFirmwareVersionMetric(result *inspection.Result, metrics *devices.SNMPMetrics) {
	result.ExpectedValue = stringPtr("仅采集展示，不做合规判定")

	if metrics == nil || (metrics.Model == nil && metrics.FirmwareVersion == nil) {
		result.Status = "skip"
		result.Message = stringPtr("未采集到设备型号与固件版本")
		return
	}

	model := "未知"
	if metrics.Model != nil && strings.TrimSpace(*metrics.Model) != "" {
		model = strings.TrimSpace(*metrics.Model)
	}
	version := "未知"
	if metrics.FirmwareVersion != nil && strings.TrimSpace(*metrics.FirmwareVersion) != "" {
		version = strings.TrimSpace(*metrics.FirmwareVersion)
	}

	actual := fmt.Sprintf("%s / %s", model, version)
	result.ActualValue = &actual
	result.Status = "pass"
	result.Message = stringPtr(fmt.Sprintf("型号 %s，固件版本 %s；请对照厂商推荐版本与安全公告自行评估", model, version))
}

// ---------------------------------------------------------------------------
// 接口健康类检查（错包 / 丢弃 / 管理状态 / 双工）
// ---------------------------------------------------------------------------

// interfaceRatioEntry 单个接口的计数器比率明细。
type interfaceRatioEntry struct {
	Name      string  `json:"name"`
	Direction string  `json:"direction"`
	Percent   float64 `json:"percent"`
	Count     uint64  `json:"count"`
	Packets   uint64  `json:"packets"`
}

// interfaceRatioSummary 逐接口计数器比率统计，错包与丢弃共用。
type interfaceRatioSummary struct {
	Total        int
	Evaluated    int
	OverWarning  int
	OverCritical int
	Peak         interfaceRatioEntry
	Entries      []interfaceRatioEntry
	Skipped      []interfaceUtilizationSkipped
}

// summarizeInterfaceCounterRatio 逐接口计算「计数器 / (计数器 + 包数)」的累计比率。
//
// 用累计比率而非采样速率：巡检是周期性体检而非实时监控，「这个口自上电以来错了
// 千分之三」正是体检该给的结论；且累计比率不依赖上次采样基线，首轮就能出结果。
// 代价是历史一次性故障会长期留痕，因此 details 里同时给出原始计数与包数，
// 让读者能自行判断是陈年旧账还是正在恶化。
//
// pick 返回该接口入/出方向的计数器与包数，nil 表示该方向无数据。
func summarizeInterfaceCounterRatio(
	interfaces []devices.InterfaceMetrics,
	warning, critical float64,
	pick func(devices.InterfaceMetrics) (inCount, outCount, inPkts, outPkts *uint64),
) interfaceRatioSummary {
	summary := interfaceRatioSummary{Total: len(interfaces)}
	entries := make([]interfaceRatioEntry, 0, len(interfaces))

	for _, iface := range interfaces {
		name := strings.TrimSpace(iface.Description)
		if name == "" {
			name = strings.TrimSpace(iface.Name)
		}

		inCount, outCount, inPkts, outPkts := pick(iface)
		if inCount == nil && outCount == nil {
			summary.Skipped = append(summary.Skipped, interfaceUtilizationSkipped{Name: name, Reason: "设备未上报该计数器"})
			continue
		}

		best := interfaceRatioEntry{Name: name, Percent: -1}
		evaluate := func(direction string, count, pkts *uint64) {
			if count == nil || pkts == nil {
				return
			}
			total := *count + *pkts
			if total == 0 {
				return
			}
			percent := float64(*count) / float64(total) * 100
			if percent > best.Percent {
				best = interfaceRatioEntry{
					Name: name, Direction: direction, Percent: percent,
					Count: *count, Packets: *pkts,
				}
			}
		}
		evaluate("入", inCount, inPkts)
		evaluate("出", outCount, outPkts)

		if best.Percent < 0 {
			summary.Skipped = append(summary.Skipped, interfaceUtilizationSkipped{Name: name, Reason: "无包计数样本，无法计算比率"})
			continue
		}

		summary.Evaluated++
		entries = append(entries, best)
		if best.Percent >= critical {
			summary.OverCritical++
			summary.OverWarning++
		} else if best.Percent >= warning {
			summary.OverWarning++
		}
		if best.Percent > summary.Peak.Percent {
			summary.Peak = best
		}
	}

	sort.Slice(entries, func(i, j int) bool { return entries[i].Percent > entries[j].Percent })
	summary.Entries = entries
	return summary
}

// buildInterfaceRatioDetails 生成错包/丢弃的逐接口明细载荷。
func buildInterfaceRatioDetails(kind string, summary interfaceRatioSummary, warning, critical float64) datatypes.JSON {
	payload := map[string]interface{}{
		"kind":               kind,
		"total":              summary.Total,
		"evaluated":          summary.Evaluated,
		"over_warning":       summary.OverWarning,
		"over_critical":      summary.OverCritical,
		"warning_threshold":  warning,
		"critical_threshold": critical,
		"interfaces":         summary.Entries,
		"skipped":            summary.Skipped,
	}
	if summary.Entries == nil {
		payload["interfaces"] = []interfaceRatioEntry{}
	}
	if summary.Skipped == nil {
		payload["skipped"] = []interfaceUtilizationSkipped{}
	}
	for key, value := range thresholdDetailsPayload(kind, warning, critical, "%") {
		payload[key] = value
	}

	encoded, err := json.Marshal(payload)
	if err != nil {
		return nil
	}
	return datatypes.JSON(encoded)
}

// checkInterfaceCounterRatio 是错包率与丢弃率检查的共同实现。
func (h InspectionHandler) checkInterfaceCounterRatio(
	result *inspection.Result,
	metrics *devices.SNMPMetrics,
	warningThreshold, criticalThreshold float64,
	kind, label string,
	defaultWarning, defaultCritical float64,
	pick func(devices.InterfaceMetrics) (inCount, outCount, inPkts, outPkts *uint64),
) {
	if warningThreshold == 0 {
		warningThreshold = defaultWarning
	}
	if criticalThreshold == 0 {
		criticalThreshold = defaultCritical
	}
	result.ExpectedValue = stringPtr(fmt.Sprintf("各接口%s < %g%%（警告 >=%g%%，故障 >=%g%%）",
		label, warningThreshold, warningThreshold, criticalThreshold))
	result.Details = buildThresholdDetails(kind, warningThreshold, criticalThreshold, "%")

	if metrics == nil || len(metrics.Interfaces) == 0 {
		result.Status = "skip"
		result.Message = stringPtr("无法获取接口数据")
		return
	}

	summary := summarizeInterfaceCounterRatio(metrics.Interfaces, warningThreshold, criticalThreshold, pick)
	result.Details = buildInterfaceRatioDetails(kind, summary, warningThreshold, criticalThreshold)

	// 一个接口都算不出比率时判 skip 而非 pass：假通过会让持续劣化的链路
	// 在报告里显示「正常」，等业务受影响才被发现。
	if summary.Evaluated == 0 {
		result.Status = "skip"
		result.Message = stringPtr(fmt.Sprintf(
			"采集到 %d 个接口，但均未上报%s计数器或缺少包计数样本，无法计算比率", summary.Total, label))
		return
	}

	actual := fmt.Sprintf("峰值 %.4f%%（%s %s方向）；%d/%d 接口超阈值",
		summary.Peak.Percent, summary.Peak.Name, summary.Peak.Direction, summary.OverWarning, summary.Evaluated)
	result.ActualValue = &actual

	switch {
	case summary.OverCritical > 0:
		result.Status = "fail"
		result.Message = stringPtr(fmt.Sprintf("%d 个接口%s达到故障阈值 %g%%，峰值 %s（%.4f%%）",
			summary.OverCritical, label, criticalThreshold, summary.Peak.Name, summary.Peak.Percent))
	case summary.OverWarning > 0:
		result.Status = "warning"
		result.Message = stringPtr(fmt.Sprintf("%d 个接口%s超过警告阈值 %g%%，峰值 %s（%.4f%%）",
			summary.OverWarning, label, warningThreshold, summary.Peak.Name, summary.Peak.Percent))
	default:
		result.Status = "pass"
		result.Message = stringPtr(fmt.Sprintf("已评估 %d/%d 个接口，%s均在阈值内（峰值 %.4f%%）",
			summary.Evaluated, summary.Total, label, summary.Peak.Percent))
	}
}

// checkInterfaceErrorsMetric 接口错包率。错包指向物理层劣化——光衰、跳线老化、
// 接头氧化、电磁干扰，是这类问题在 SNMP 上的唯一直接证据。
func (h InspectionHandler) checkInterfaceErrorsMetric(result *inspection.Result, metrics *devices.SNMPMetrics, warning, critical float64) {
	h.checkInterfaceCounterRatio(result, metrics, warning, critical, "interface_errors", "错包率", 0.01, 0.1,
		func(iface devices.InterfaceMetrics) (*uint64, *uint64, *uint64, *uint64) {
			return iface.InErrors, iface.OutErrors, iface.InUcastPkts, iface.OutUcastPkts
		})
}

// checkInterfaceDiscardsMetric 接口丢弃率。与错包是两类问题：丢弃指向缓冲区
// 溢出、QoS 队列丢弃或 ACL 拒绝，即拥塞与配置问题。一个口错包为零却大量丢弃，
// 说明线路是好的、该查的是队列与策略——合并成一个指标会让运维去换光模块。
func (h InspectionHandler) checkInterfaceDiscardsMetric(result *inspection.Result, metrics *devices.SNMPMetrics, warning, critical float64) {
	h.checkInterfaceCounterRatio(result, metrics, warning, critical, "interface_discards", "丢弃率", 0.1, 1,
		func(iface devices.InterfaceMetrics) (*uint64, *uint64, *uint64, *uint64) {
			return iface.InDiscards, iface.OutDiscards, iface.InUcastPkts, iface.OutUcastPkts
		})
}

// checkInterfaceAdminStatusMetric 接口管理状态与运行状态的一致性。
//
// admin up 但 oper down 才是真故障；admin down 是运维主动关闭，不该告警。
// 现有「接口状态」检查只看 oper，把人为 shutdown 的端口也报成警告——久而久之
// 运维学会忽略这类告警，真故障也一起被忽略。
func (h InspectionHandler) checkInterfaceAdminStatusMetric(result *inspection.Result, metrics *devices.SNMPMetrics) {
	result.ExpectedValue = stringPtr("管理状态为 up 的接口应同时处于运行状态")

	if metrics == nil || len(metrics.Interfaces) == 0 {
		result.Status = "skip"
		result.Message = stringPtr("无法获取接口数据")
		return
	}

	evaluated, adminDown := 0, 0
	broken := make([]string, 0)
	for _, iface := range metrics.Interfaces {
		if iface.AdminUp == nil {
			continue
		}
		evaluated++
		if !*iface.AdminUp {
			adminDown++
			continue
		}
		if iface.IsUp != nil && !*iface.IsUp {
			name := strings.TrimSpace(iface.Description)
			if name == "" {
				name = strings.TrimSpace(iface.Name)
			}
			broken = append(broken, name)
		}
	}

	if evaluated == 0 {
		result.Status = "skip"
		result.Message = stringPtr("设备未上报接口管理状态（ifAdminStatus），无法区分人为关闭与链路故障")
		return
	}

	actual := fmt.Sprintf("已评估 %d 个接口；异常 %d 个，人为关闭 %d 个", evaluated, len(broken), adminDown)
	result.ActualValue = &actual

	if len(broken) > 0 {
		result.Status = "fail"
		shown := broken
		if len(shown) > utilizationTopOffenderLimit {
			shown = shown[:utilizationTopOffenderLimit]
		}
		result.Message = stringPtr(fmt.Sprintf(
			"%d 个接口配置为启用但实际未运行（链路故障或对端异常）：%s",
			len(broken), strings.Join(shown, "、")))
		return
	}

	result.Status = "pass"
	result.Message = stringPtr(fmt.Sprintf(
		"已启用的接口均正常运行；另有 %d 个接口为人为关闭状态，不计异常", adminDown))
}

// checkInterfaceDuplexMetric 接口双工模式。
//
// 与错包检查互补：错包说「有问题」，双工说「为什么」。千兆口协商成半双工会同时
// 引发大量错包与性能腰斩，两项一起告警时运维就知道该去核对两端速率双工配置。
func (h InspectionHandler) checkInterfaceDuplexMetric(result *inspection.Result, metrics *devices.SNMPMetrics) {
	result.ExpectedValue = stringPtr("速率 >=100Mbps 的在用接口应工作在全双工模式")

	if metrics == nil || len(metrics.Interfaces) == 0 {
		result.Status = "skip"
		result.Message = stringPtr("无法获取接口数据")
		return
	}

	evaluated := 0
	half := make([]string, 0)
	for _, iface := range metrics.Interfaces {
		if iface.DuplexStatus == nil {
			continue
		}
		// 没链路时双工状态无意义，纳入只会产生噪声
		if iface.IsUp != nil && !*iface.IsUp {
			continue
		}
		// 低速端口半双工属正常工作模式，不告警
		if iface.Speed != nil && *iface.Speed < 100 {
			continue
		}
		evaluated++
		if *iface.DuplexStatus == 2 {
			name := strings.TrimSpace(iface.Description)
			if name == "" {
				name = strings.TrimSpace(iface.Name)
			}
			half = append(half, name)
		}
	}

	if evaluated == 0 {
		result.Status = "skip"
		result.Message = stringPtr("设备未上报接口双工模式（dot3StatsDuplexStatus），或无符合条件的在用以太网口")
		return
	}

	actual := fmt.Sprintf("已评估 %d 个接口；半双工 %d 个", evaluated, len(half))
	result.ActualValue = &actual

	if len(half) > 0 {
		result.Status = "warning"
		shown := half
		if len(shown) > utilizationTopOffenderLimit {
			shown = shown[:utilizationTopOffenderLimit]
		}
		result.Message = stringPtr(fmt.Sprintf(
			"%d 个高速接口工作在半双工模式，通常是两端速率/双工协商失败，会引发大量错包与性能下降：%s",
			len(half), strings.Join(shown, "、")))
		return
	}

	result.Status = "pass"
	result.Message = stringPtr(fmt.Sprintf("已评估 %d 个接口，均工作在全双工模式", evaluated))
}

// checkInterfaceUtilizationMetric 检查逐接口带宽利用率。
// 与"带宽吞吐量"分工：本项回答"哪些链路快满了"，带宽项只回答"总共跑了多少流量"。
// 无法计算时判 skip 而非 pass —— 假通过会在链路真拥塞时掩盖问题。
func (h InspectionHandler) checkInterfaceUtilizationMetric(result *inspection.Result, metrics *devices.SNMPMetrics, warningThreshold, criticalThreshold float64) {
	// 先补默认阈值再写参考标准：无论采集成败，结果里都带判定依据
	if warningThreshold == 0 {
		warningThreshold = 70
	}
	if criticalThreshold == 0 {
		criticalThreshold = 90
	}
	result.ExpectedValue = stringPtr(fmt.Sprintf("各接口利用率 < %.0f%%（警告 ≥%.0f%%，故障 ≥%.0f%%）",
		warningThreshold, warningThreshold, criticalThreshold))

	if metrics == nil || len(metrics.Interfaces) == 0 {
		result.Status = "skip"
		result.Message = stringPtr("无法获取接口数据")
		return
	}

	summary := summarizeInterfaceUtilization(metrics.Interfaces, warningThreshold, criticalThreshold)
	// 全量接口明细落 details（jsonb）：前端执行详情与 PDF 报告据此渲染完整表格，
	// ActualValue/Message 只承载摘要，避免长文本撑爆定宽表格。
	result.Details = buildInterfaceUtilizationDetails(summary, warningThreshold, criticalThreshold)

	if summary.Evaluated == 0 {
		result.Status = "skip"
		result.Message = stringPtr(fmt.Sprintf(
			"采集到 %d 个接口，但均缺少速率基线或接口容量，无法计算利用率（设备需被监控采集覆盖 ≥1 轮，且接口需上报 ifHighSpeed/ifSpeed）",
			summary.Total))
		return
	}

	actualValue := fmt.Sprintf("峰值 %.1f%%（%s %s）；%d/%d 接口超阈值",
		summary.Peak.Percent, summary.Peak.Name, summary.Peak.Direction, summary.OverWarning, summary.Evaluated)
	result.ActualValue = &actualValue

	switch {
	case summary.OverCritical > 0:
		result.Status = "fail"
		result.Message = stringPtr(fmt.Sprintf("%d 个接口利用率达到故障阈值 %.0f%%，链路可能拥塞：%s",
			summary.OverCritical, criticalThreshold, formatUtilizationOffenders(summary.TopOffenders, summary.OverWarning)))
	case summary.OverWarning > 0:
		result.Status = "warning"
		result.Message = stringPtr(fmt.Sprintf("%d 个接口利用率超过警告阈值 %.0f%%，请关注流量趋势：%s",
			summary.OverWarning, warningThreshold, formatUtilizationOffenders(summary.TopOffenders, summary.OverWarning)))
	default:
		result.Status = "pass"
		result.Message = stringPtr(fmt.Sprintf("接口利用率正常：已评估 %d/%d 个接口，峰值 %s %s %.1f%%",
			summary.Evaluated, summary.Total, summary.Peak.Name, summary.Peak.Direction, summary.Peak.Percent))
	}
}

// checkBandwidthMetric 采集设备入/出方向总吞吐量。
// 利用率判定已移交 checkInterfaceUtilizationMetric，本项只做速率采集展示，不设阈值。
// 速率由两次 octets 采样差分得出，尚无基线时如实判 skip —— 此前恒 pass 会把
// "还没有基线"报成"0 bps 且通过"。
func (h InspectionHandler) checkBandwidthMetric(result *inspection.Result, metrics *devices.SNMPMetrics) {
	result.ExpectedValue = stringPtr("完成入/出方向流量速率采集")

	if metrics == nil || (metrics.BandwidthIn == nil && metrics.BandwidthOut == nil) {
		result.Status = "skip"
		result.Message = stringPtr("无法获取带宽数据")
		return
	}

	// 采集端恒会写入 BandwidthIn/Out（首轮为 0），因此必须回看接口是否真有速率样本
	hasRateSample := false
	for _, iface := range metrics.Interfaces {
		if iface.InRate != nil || iface.OutRate != nil {
			hasRateSample = true
			break
		}
	}
	if !hasRateSample {
		result.Status = "skip"
		result.Message = stringPtr("尚无流量速率基线（速率由两次采样差分得出，设备需被监控采集覆盖 ≥1 轮）")
		return
	}

	var inBw, outBw float64
	if metrics.BandwidthIn != nil {
		inBw = *metrics.BandwidthIn
	}
	if metrics.BandwidthOut != nil {
		outBw = *metrics.BandwidthOut
	}

	// 格式化带宽显示
	formatBandwidth := func(bps float64) string {
		if bps >= 1_000_000_000 {
			return fmt.Sprintf("%.2f Gbps", bps/1_000_000_000)
		} else if bps >= 1_000_000 {
			return fmt.Sprintf("%.2f Mbps", bps/1_000_000)
		} else if bps >= 1_000 {
			return fmt.Sprintf("%.2f Kbps", bps/1_000)
		}
		return fmt.Sprintf("%.0f bps", bps)
	}

	actualValue := fmt.Sprintf("入: %s, 出: %s", formatBandwidth(inBw), formatBandwidth(outBw))
	result.ActualValue = &actualValue
	result.Status = "pass"
	result.Message = stringPtr(fmt.Sprintf("带宽吞吐量采集成功 - 入站: %s, 出站: %s",
		formatBandwidth(inBw), formatBandwidth(outBw)))
}
