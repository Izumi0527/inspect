package handlers

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v4"
	"gorm.io/datatypes"
)

const (
	maxDevicePageSize       = 200
	maxScanListLimit        = 200
	maxBatchImportDevices   = 1000
	maxBatchDeviceIDs       = 1000
	maxPerformanceRangeDays = 365
	// 批量探测并发上限：避免一次请求拉起过多 ping/SNMP，造成资源瞬时压垮
	maxBatchProbeConcurrent = 50
	defaultProbeConcurrent  = 20
)

func dedupePositiveInts(values []int) []int {
	if len(values) == 0 {
		return []int{}
	}
	seen := make(map[int]struct{}, len(values))
	result := make([]int, 0, len(values))
	for _, value := range values {
		if value <= 0 {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		result = append(result, value)
	}
	return result
}

func parsePageParams(c echo.Context) (int, int) {
	page := parseIntDefault(c.QueryParam("page"), 0)
	pageSize := parseIntDefault(c.QueryParam("page_size"), 0)

	if page > 0 && pageSize > 0 {
		if pageSize > maxDevicePageSize {
			pageSize = maxDevicePageSize
		}
		return page, pageSize
	}

	skip := parseIntDefault(c.QueryParam("skip"), 0)
	limit := parseIntDefault(c.QueryParam("limit"), 100)
	if limit <= 0 {
		limit = 100
	}
	if limit > maxDevicePageSize {
		limit = maxDevicePageSize
	}
	page = skip/limit + 1
	pageSize = limit
	return page, pageSize
}

func parseIntDefault(raw string, fallback int) int {
	value := strings.TrimSpace(raw)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func parseOptionalInt(raw string) *int {
	value := strings.TrimSpace(raw)
	if value == "" {
		return nil
	}
	parsed, err := strconv.Atoi(value)
	if err != nil {
		return nil
	}
	return &parsed
}

func parseBoolDefault(raw string, fallback bool) bool {
	value := strings.TrimSpace(raw)
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return fallback
	}
	return parsed
}

func decodeJSONList(raw datatypes.JSON) []int {
	if len(raw) == 0 {
		return []int{}
	}
	var parsed []int
	if err := json.Unmarshal(raw, &parsed); err == nil {
		return parsed
	}
	return []int{}
}

func decodeJSONMap(raw datatypes.JSON) map[string]interface{} {
	if len(raw) == 0 {
		return map[string]interface{}{}
	}
	var parsed map[string]interface{}
	if err := json.Unmarshal(raw, &parsed); err == nil {
		return parsed
	}
	return map[string]interface{}{}
}

func containsPort(ports []int, port int) bool {
	for _, value := range ports {
		if value == port {
			return true
		}
	}
	return false
}

func ptrString(value string) *string {
	return &value
}

func cloneMap(values map[string]interface{}) map[string]interface{} {
	if len(values) == 0 {
		return map[string]interface{}{}
	}
	result := make(map[string]interface{}, len(values))
	for key, value := range values {
		result[key] = value
	}
	return result
}

func parseTimeRangeParam(raw string) (time.Time, time.Time, error) {
	end := time.Now().UTC()
	value := strings.TrimSpace(raw)
	if value == "" {
		return end.Add(-24 * time.Hour), end, nil
	}

	if len(value) < 2 {
		return time.Time{}, time.Time{}, fmt.Errorf("时间范围无效")
	}

	unit := strings.ToLower(value[len(value)-1:])
	number := strings.TrimSpace(value[:len(value)-1])
	amount, err := strconv.Atoi(number)
	if err != nil || amount <= 0 {
		return time.Time{}, time.Time{}, fmt.Errorf("时间范围无效")
	}

	var duration time.Duration
	switch unit {
	case "m":
		if amount > maxPerformanceRangeDays*24*60 {
			return time.Time{}, time.Time{}, fmt.Errorf("时间范围过大")
		}
		duration = time.Minute
	case "h":
		if amount > maxPerformanceRangeDays*24 {
			return time.Time{}, time.Time{}, fmt.Errorf("时间范围过大")
		}
		duration = time.Hour
	case "d":
		if amount > maxPerformanceRangeDays {
			return time.Time{}, time.Time{}, fmt.Errorf("时间范围过大")
		}
		duration = 24 * time.Hour
	case "w":
		if amount > maxPerformanceRangeDays/7 {
			return time.Time{}, time.Time{}, fmt.Errorf("时间范围过大")
		}
		duration = 7 * 24 * time.Hour
	default:
		return time.Time{}, time.Time{}, fmt.Errorf("时间范围无效")
	}

	start := end.Add(-time.Duration(amount) * duration)
	return start, end, nil
}

