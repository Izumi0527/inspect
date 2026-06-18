package handlers

import (
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
)

func (h ReportsHandler) GenerateInspectionReport(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, "reports:create"); err != nil {
		return err
	}
	return h.GenerateReportFromRequest(c)
}

func (h ReportsHandler) GetInspectionReportData(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, "reports:read"); err != nil {
		return err
	}
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}

	db := h.Service.DB()
	if db == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "database not configured")
	}

	payload := map[string]interface{}{}
	_ = c.Bind(&payload)

	filters := parseInspectionReportFilters(payload)
	ctx := c.Request().Context()

	rows, err := loadInspectionRows(ctx, db, filters)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load inspections")
	}

	summary, latestByDevice, latestTimes := summarizeInspectionRows(rows)
	if len(filters.DeviceIDs) > 0 {
		summary.TotalDevices = len(filters.DeviceIDs)
	}

	deviceIDs := make([]int, 0, len(latestByDevice))
	inspectionIDs := make([]int, 0, len(latestByDevice))
	for deviceID, row := range latestByDevice {
		deviceIDs = append(deviceIDs, deviceID)
		inspectionIDs = append(inspectionIDs, row.ID)
	}
	if len(deviceIDs) == 0 && len(filters.DeviceIDs) > 0 {
		deviceIDs = filters.DeviceIDs
	}

	deviceInfo, err := loadInspectionDeviceInfo(ctx, db, deviceIDs)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load devices")
	}

	resultsByInspection, err := loadInspectionResults(ctx, db, inspectionIDs)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load inspection results")
	}

	availabilityMap, _ := queryDeviceAvailability(ctx, db, filters.Start, filters.End, deviceIDs)
	responseStats, err := queryMetricSummary(ctx, db, "response_time", filters.Start, filters.End, deviceIDs)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load response metrics")
	}
	cpuStats, err := queryMetricSummary(ctx, db, "cpu_usage", filters.Start, filters.End, deviceIDs)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load cpu metrics")
	}
	memoryStats, err := queryMetricSummary(ctx, db, "memory_usage", filters.Start, filters.End, deviceIDs)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load memory metrics")
	}
	diskStats, err := queryMetricSummary(ctx, db, "disk_usage", filters.Start, filters.End, deviceIDs)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load disk metrics")
	}
	utilStats, err := queryMetricSummary(ctx, db, "bandwidth_utilization", filters.Start, filters.End, deviceIDs)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load utilization metrics")
	}
	inboundStats, err := queryMetricSummaryFallback(ctx, db, []string{"bandwidth_in", "network_bytes_in", "throughput_in"}, filters.Start, filters.End, deviceIDs)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load inbound metrics")
	}
	outboundStats, err := queryMetricSummaryFallback(ctx, db, []string{"bandwidth_out", "network_bytes_out", "throughput_out"}, filters.Start, filters.End, deviceIDs)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load outbound metrics")
	}

	avgScore, err := queryInspectionAverageScore(ctx, db, filters)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load inspection scores")
	}

	successRate := 0.0
	if summary.TotalChecks > 0 {
		successRate = float64(summary.PassedChecks) / float64(summary.TotalChecks) * 100
	}

	deviceResults := make([]map[string]interface{}, 0, len(deviceIDs))
	sort.Ints(deviceIDs)
	for _, deviceID := range deviceIDs {
		info, ok := deviceInfo[deviceID]
		if !ok {
			continue
		}
		row, hasInspection := latestByDevice[deviceID]
		inspectedAt := latestTimes[deviceID]
		results := []inspectionResultRow{}
		if hasInspection {
			results = resultsByInspection[row.ID]
		}

		totalChecks := int(row.TotalChecks.Int64)
		passedChecks := int(row.PassedChecks.Int64)
		failedChecks := int(row.FailedChecks.Int64)
		warningChecks := int(row.WarningChecks.Int64)
		if totalChecks == 0 && len(results) > 0 {
			for _, item := range results {
				totalChecks++
				switch strings.ToLower(strings.TrimSpace(item.Status)) {
				case "pass":
					passedChecks++
				case "warning":
					warningChecks++
				default:
					failedChecks++
				}
			}
		}
		score := 0.0
		if totalChecks > 0 {
			score = float64(passedChecks) / float64(totalChecks) * 100
		}

		availability := availabilityMap[deviceID]
		if availability == 0 {
			availability = fallbackAvailability(info.Status)
		}

		responseAvg := responseStats[deviceID].Avg
		if responseAvg == 0 && info.ResponseTime.Valid {
			responseAvg = info.ResponseTime.Float64
		}

		cpuCurrent := valueOrFallback(info.CPUUsage, cpuStats[deviceID].Avg)
		cpuAverage := cpuStats[deviceID].Avg
		cpuPeak := cpuStats[deviceID].Max
		memoryCurrent := valueOrFallback(info.MemoryUsage, memoryStats[deviceID].Avg)
		memoryAverage := memoryStats[deviceID].Avg
		memoryPeak := memoryStats[deviceID].Max

		diskPercent := diskStats[deviceID].Avg
		diskTotal := 0.0
		if diskPercent > 0 {
			diskTotal = 100
		}

		inbound := inboundStats[deviceID].Avg / 1_000_000.0
		outbound := outboundStats[deviceID].Avg / 1_000_000.0
		utilization := utilStats[deviceID].Avg

		groupName := strings.TrimSpace(info.GroupName.String)
		if groupName == "" {
			groupName = "未分组"
		}

		lastCheckTime := ""
		if !inspectedAt.IsZero() {
			lastCheckTime = inspectedAt.Format(time.RFC3339)
		}

		deviceResults = append(deviceResults, map[string]interface{}{
			"device_id":         deviceID,
			"device_name":       info.Name,
			"device_type":       info.DeviceType,
			"device_group":      groupName,
			"status":            normalizeDeviceStatus(info.Status),
			"total_checks":      totalChecks,
			"passed_checks":     passedChecks,
			"failed_checks":     failedChecks,
			"warning_checks":    warningChecks,
			"score":             roundFloat(score, 2),
			"uptime":            roundFloat(availability, 2),
			"avg_response_time": roundFloat(responseAvg, 2),
			"last_check_time":   lastCheckTime,
			"issues":            buildInspectionIssues(results),
			"performance_metrics": map[string]interface{}{
				"cpu": map[string]interface{}{
					"current": roundFloat(cpuCurrent, 2),
					"average": roundFloat(cpuAverage, 2),
					"peak":    roundFloat(cpuPeak, 2),
				},
				"memory": map[string]interface{}{
					"current": roundFloat(memoryCurrent, 2),
					"average": roundFloat(memoryAverage, 2),
					"peak":    roundFloat(memoryPeak, 2),
				},
				"disk_space": map[string]interface{}{
					"used":       roundFloat(diskPercent, 2),
					"total":      roundFloat(diskTotal, 2),
					"percentage": roundFloat(diskPercent, 2),
				},
				"network_traffic": map[string]interface{}{
					"inbound":     roundFloat(inbound, 2),
					"outbound":    roundFloat(outbound, 2),
					"utilization": roundFloat(utilization, 2),
				},
			},
		})
	}

	executionTrends, err := buildExecutionTrends(ctx, db, filters)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load execution trends")
	}

	problemAnalysis, err := buildProblemAnalysis(ctx, db, filters)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to load problem analysis")
	}

	data := map[string]interface{}{
		"summary": map[string]interface{}{
			"total_devices":    summary.TotalDevices,
			"total_executions": summary.TotalExecutions,
			"total_checks":     summary.TotalChecks,
			"passed_checks":    summary.PassedChecks,
			"failed_checks":    summary.FailedChecks,
			"warning_checks":   summary.WarningChecks,
			"avg_score":        roundFloat(avgScore, 2),
			"success_rate":     roundFloat(successRate, 2),
		},
		"device_results":   deviceResults,
		"execution_trends": executionTrends,
		"problem_analysis": problemAnalysis,
		"recommendations":  []map[string]interface{}{},
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data":    data,
	})
}

func (h ReportsHandler) CompareInspectionReports(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, "reports:read"); err != nil {
		return err
	}
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "report service not configured")
	}

	db := h.Service.DB()
	if db == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "database not configured")
	}

	payload := map[string]interface{}{}
	_ = c.Bind(&payload)

	filters := parseInspectionReportFilters(payload)
	if len(filters.DeviceIDs) == 0 {
		deviceIDs := parseIntSlice(payload["deviceIds"])
		if len(deviceIDs) == 0 {
			deviceIDs = parseIntSlice(payload["devices"])
		}
		filters.DeviceIDs = uniqueIntSlice(deviceIDs)
	}

	devices, comparisons, err := buildInspectionComparisonData(c.Request().Context(), db, filters)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to compare inspection reports")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"data": map[string]interface{}{
			"devices":     devices,
			"comparisons": comparisons,
			"differences": comparisons,
		},
	})
}
