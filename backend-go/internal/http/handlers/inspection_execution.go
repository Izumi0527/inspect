package handlers

import (
	"context"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/devices"
	"github.com/your-org/inspect-system/backend-go/internal/inspection"
	"github.com/your-org/inspect-system/backend-go/internal/ws"
)

// executeInspectionsAsync 异步执行巡检任务
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

	for _, insp := range inspections {
		h.executeInspection(ctx, insp, checkItems)
	}
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

// executeInspection 执行单个巡检任务
func (h InspectionHandler) executeInspection(ctx context.Context, insp inspection.Inspection, checkItems []map[string]interface{}) {
	// 1. 更新状态为 running
	_, err := h.Service.UpdateInspectionStatus(ctx, insp.ID, inspection.StatusRunning, nil)
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
		record, derr := h.DeviceService.GetDeviceRecord(ctx, insp.DeviceID)
		if derr != nil {
			errMsg := fmt.Sprintf("获取设备信息失败: %v", derr)
			h.Service.UpdateInspectionStatus(ctx, insp.ID, inspection.StatusFailed, &errMsg)
			h.broadcastScanProgress(insp.ID, inspection.StatusFailed, 0, map[string]interface{}{"message": errMsg})
			return
		}
		device = &record
	}

	// 3. 执行探测检查
	var probeResult *devices.ProbeResult
	if h.ProbeService != nil && device != nil {
		result, err := h.ProbeService.ProbeDevice(
			ctx,
			device.ID,
			device.IPAddress,
			device.SnmpCommunity,
			device.SnmpVersion,
			device.SnmpPort,
			nil,
			false,
		)
		if err == nil {
			probeResult = &result
		}
	}

	// 如果任务已被取消，直接结束
	if h.isInspectionCancelled(ctx, insp.ID) {
		h.broadcastScanProgress(insp.ID, inspection.StatusCancelled, 0, nil)
		return
	}

	// 4. 执行检查项并生成结果（实时保存 + 推送进度）
	activeCheckItems := filterEnabledCheckItems(checkItems)
	totalChecks := len(activeCheckItems)
	if totalChecks == 0 {
		errMsg := "巡检模板无有效检查项，请检查所选模板的检查项配置"
		h.markInspectionExecutionFailed(ctx, insp.ID, errMsg, 0, 0)
		return
	}

	// 初始化总检查数，便于前端/接口计算进度
	if err := h.Service.UpdateInspectionStats(ctx, insp.ID, totalChecks, 0, 0, 0, 0); err != nil {
		errMsg := fmt.Sprintf("初始化巡检统计失败: %v", err)
		h.markInspectionExecutionFailed(ctx, insp.ID, errMsg, 0, totalChecks)
		return
	}

	// 5. 保存结果
	executedCount := 0
	passedCount := 0
	failedCount := 0
	warningCount := 0
	skippedCount := 0
	var executionErr error

	results := h.executeCheckItems(ctx, insp.ID, device, probeResult, activeCheckItems, func(result inspection.Result, completed int, total int) error {
		executedCount = completed

		if err := h.Service.SaveInspectionResult(ctx, &result); err != nil {
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
		if err := h.Service.UpdateInspectionStats(ctx, insp.ID, total, passedCount, failedCount, warningCount, skippedCount); err != nil {
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
		h.markInspectionExecutionFailed(ctx, insp.ID, executionErr.Error(), executedCount, totalChecks)
		return
	}

	// 若执行过程中被取消，保留取消状态，不再覆盖为 completed
	if h.isInspectionCancelled(ctx, insp.ID) {
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
	if err := h.Service.UpdateInspectionStats(ctx, insp.ID, len(results), passedCount, failedCount, warningCount, skippedCount); err != nil {
		errMsg := fmt.Sprintf("收口巡检统计失败: %v", err)
		h.markInspectionExecutionFailed(ctx, insp.ID, errMsg, executedCount, totalChecks)
		return
	}
	if _, err := h.Service.UpdateInspectionStatus(ctx, insp.ID, inspection.StatusCompleted, nil); err != nil {
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

// executeCheckItems 执行检查项
func (h InspectionHandler) executeCheckItems(
	ctx context.Context,
	inspectionID int,
	device *devices.Device,
	probeResult *devices.ProbeResult,
	checkItems []map[string]interface{},
	onResult func(result inspection.Result, completed int, total int) error,
) []inspection.Result {
	results := make([]inspection.Result, 0)
	total := len(checkItems)

	// 采集 SNMP 指标（如果设备支持 SNMP）
	snmpMetrics := collectInspectionSNMPMetrics(ctx, h.SNMPCollector, device, probeResult, h.Logger)

	for _, item := range checkItems {
		if h.isInspectionCancelled(ctx, inspectionID) {
			break
		}

		itemName := readString(item, "name")
		itemType := readString(item, "type")
		itemCategory := readString(item, "category")

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
		switch strings.ToLower(itemType) {
		case "icmp", "ping":
			h.executeICMPCheck(&result, probeResult)
		case "snmp":
			h.executeSNMPCheck(&result, probeResult, snmpMetrics, item)
		case "ssh":
			h.executeSSHCheck(ctx, &result, device, item)
		case "http", "https":
			h.executeHTTPCheck(ctx, &result, device, item)
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
	if metrics == nil || metrics.CPUUsage == nil {
		result.Status = "skip"
		result.Message = stringPtr("无法获取CPU使用率数据")
		return
	}

	cpuUsage := *metrics.CPUUsage
	actualValue := fmt.Sprintf("%.1f%%", cpuUsage)
	result.ActualValue = &actualValue

	// 设置默认阈值
	if warningThreshold == 0 {
		warningThreshold = 70
	}
	if criticalThreshold == 0 {
		criticalThreshold = 90
	}

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
	if metrics == nil || metrics.MemoryUsage == nil {
		result.Status = "skip"
		result.Message = stringPtr("无法获取内存使用率数据")
		return
	}

	memUsage := *metrics.MemoryUsage
	actualValue := fmt.Sprintf("%.1f%%", memUsage)
	result.ActualValue = &actualValue

	// 设置默认阈值
	if warningThreshold == 0 {
		warningThreshold = 80
	}
	if criticalThreshold == 0 {
		criticalThreshold = 95
	}

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

// checkUptimeMetric 检查系统运行时间
func (h InspectionHandler) checkUptimeMetric(result *inspection.Result, metrics *devices.SNMPMetrics) {
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
	result.Status = "pass"
	msg := fmt.Sprintf("系统运行时间: %s", uptimeStr)
	result.Message = &msg
}

// checkInterfaceMetric 检查接口状态
func (h InspectionHandler) checkInterfaceMetric(result *inspection.Result, metrics *devices.SNMPMetrics) {
	if metrics == nil || len(metrics.Interfaces) == 0 {
		result.Status = "skip"
		result.Message = stringPtr("无法获取接口状态数据")
		return
	}

	totalInterfaces := len(metrics.Interfaces)
	activeInterfaces := 0
	for _, iface := range metrics.Interfaces {
		// 如果有流量数据，认为接口是活跃的
		if iface.InOctets != nil || iface.OutOctets != nil {
			activeInterfaces++
		}
	}

	actualValue := fmt.Sprintf("%d/%d", activeInterfaces, totalInterfaces)
	result.ActualValue = &actualValue
	result.Status = "pass"
	msg := fmt.Sprintf("接口状态正常: %d个活跃接口 (共%d个)", activeInterfaces, totalInterfaces)
	result.Message = &msg
}

// checkTemperatureMetric 检查温度
func (h InspectionHandler) checkTemperatureMetric(result *inspection.Result, metrics *devices.SNMPMetrics, warningThreshold, criticalThreshold float64) {
	if metrics == nil || metrics.Temperature == nil {
		result.Status = "skip"
		result.Message = stringPtr("无法获取温度数据")
		return
	}

	temp := *metrics.Temperature
	actualValue := fmt.Sprintf("%.1f°C", temp)
	result.ActualValue = &actualValue

	// 设置默认阈值
	if warningThreshold == 0 {
		warningThreshold = 60
	}
	if criticalThreshold == 0 {
		criticalThreshold = 75
	}

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

// checkBandwidthMetric 检查带宽使用
func (h InspectionHandler) checkBandwidthMetric(result *inspection.Result, metrics *devices.SNMPMetrics) {
	if metrics == nil || (metrics.BandwidthIn == nil && metrics.BandwidthOut == nil) {
		result.Status = "skip"
		result.Message = stringPtr("无法获取带宽数据")
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
	msg := fmt.Sprintf("带宽使用正常 - 入站: %s, 出站: %s", formatBandwidth(inBw), formatBandwidth(outBw))
	result.Message = &msg
}
