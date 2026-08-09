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
	activeCheckItems := filterEnabledCheckItems(checkItems)
	totalChecks := len(activeCheckItems)
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

	results := h.executeCheckItems(execCtx, baseCtx, insp.ID, device, probeResult, activeCheckItems, defaults.RetryAttempts, func(result inspection.Result, completed int, total int) error {
		executedCount = completed

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
		if err := h.Service.UpdateInspectionStats(baseCtx, insp.ID, total, passedCount, failedCount, warningCount, skippedCount); err != nil {
			executionErr = fmt.Errorf("更新巡检统计失败: %w", err)
			return executionErr
		}

		progress := 0
		if total > 0 {
			progress = int(math.Round(float64(completed) / float64(total) * 100))
		}
		h.broadcastScanProgress(insp.ID, inspection.StatusRunning, progress, map[string]interface{}{
			"completed_checks": completed,
			"total_checks":     total,
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
	if err := h.Service.UpdateInspectionStats(baseCtx, insp.ID, len(results), passedCount, failedCount, warningCount, skippedCount); err != nil {
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
		"completed_checks": len(results),
		"total_checks":     len(results),
	})
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
