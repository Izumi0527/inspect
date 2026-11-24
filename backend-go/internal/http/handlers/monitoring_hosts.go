package handlers

import (
	"errors"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/labstack/echo/v4"

	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
)

// GetEngineHealth 返回采集引擎自身运行健康快照。
func (h MonitoringHandler) GetEngineHealth(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, monitoringReadPermission); err != nil {
		return err
	}
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}

	snap, err := h.Writer.GetEngineHealth(c.Request().Context())
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query engine health")
	}
	return c.JSON(http.StatusOK, snap)
}

// ListMonitoringHosts 返回分页设备监控矩阵，跨模块数据严格执行独立 RBAC 门控。
func (h MonitoringHandler) ListMonitoringHosts(c echo.Context) error {
	user, err := requirePermission(c, h.Auth, monitoringReadPermission)
	if err != nil {
		return err
	}
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}

	permissions, _ := c.Get(authContextPermissionsKey).([]string)
	page, _ := strconv.Atoi(strings.TrimSpace(c.QueryParam("page")))
	pageSize, _ := strconv.Atoi(strings.TrimSpace(c.QueryParam("page_size")))

	var groupID *int
	if rawGroup := strings.TrimSpace(c.QueryParam("group_id")); rawGroup != "" {
		gid, convErr := strconv.Atoi(rawGroup)
		if convErr != nil || gid <= 0 {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid group_id")
		}
		groupID = &gid
	}

	filter := monitoring.HostsMatrixFilter{
		UserID:             user.ID,
		Status:             c.QueryParam("status"),
		GroupID:            groupID,
		PinnedOnly:         parseBoolQuery(c.QueryParam("pinned_only")),
		ProblemOnly:        parseBoolQuery(c.QueryParam("problem_only")),
		Protocol:           c.QueryParam("protocol"),
		Search:             c.QueryParam("search"),
		SortBy:             c.QueryParam("sort_by"),
		SortOrder:          c.QueryParam("sort_order"),
		Page:               page,
		PageSize:           pageSize,
		CanReadAlerts:      hasPermission("alerts:read", permissions),
		CanReadInspections: hasPermission("inspections:read", permissions),
		CanReadLogs:        hasPermission("system:logs", permissions),
	}

	resp, err := h.Writer.QueryHostsMatrix(c.Request().Context(), filter)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query monitoring hosts")
	}
	return c.JSON(http.StatusOK, resp)
}

// GetMonitoringHostDetail 返回单机全景下钻详情，跨模块数据严格执行独立 RBAC 门控。
func (h MonitoringHandler) GetMonitoringHostDetail(c echo.Context) error {
	user, err := requirePermission(c, h.Auth, monitoringReadPermission)
	if err != nil {
		return err
	}
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}

	deviceID, err := strconv.Atoi(c.Param("device_id"))
	if err != nil || deviceID <= 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid device_id")
	}

	permissions, _ := c.Get(authContextPermissionsKey).([]string)
	resp, err := h.Writer.GetHostDetail(
		c.Request().Context(),
		deviceID,
		user.ID,
		hasPermission("alerts:read", permissions),
		hasPermission("inspections:read", permissions),
		hasPermission("system:logs", permissions),
	)
	if err != nil {
		if errors.Is(err, monitoring.ErrDeviceNotFound) {
			return echo.NewHTTPError(http.StatusNotFound, "设备不存在")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query host detail")
	}
	return c.JSON(http.StatusOK, resp)
}

// ListMonitoringPins 返回当前登录用户的星标关注设备池。
func (h MonitoringHandler) ListMonitoringPins(c echo.Context) error {
	user, err := requirePermission(c, h.Auth, monitoringReadPermission)
	if err != nil {
		return err
	}
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}

	resp, err := h.Writer.ListUserPinnedDevices(c.Request().Context(), user.ID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query pinned devices")
	}
	return c.JSON(http.StatusOK, resp)
}

// PinMonitoringDevice 将指定设备加入当前登录用户的星标关注池（上限 50）。
func (h MonitoringHandler) PinMonitoringDevice(c echo.Context) error {
	user, err := requirePermission(c, h.Auth, monitoringReadPermission)
	if err != nil {
		return err
	}
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}

	deviceID, err := strconv.Atoi(c.Param("device_id"))
	if err != nil || deviceID <= 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid device_id")
	}

	if err := h.Writer.PinDeviceForUser(c.Request().Context(), user.ID, deviceID); err != nil {
		switch {
		case errors.Is(err, monitoring.ErrDeviceNotFound):
			return echo.NewHTTPError(http.StatusNotFound, "设备不存在")
		case errors.Is(err, monitoring.ErrPinLimitExceeded):
			return echo.NewHTTPError(http.StatusBadRequest, err.Error())
		default:
			return echo.NewHTTPError(http.StatusInternalServerError, "failed to pin device")
		}
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success":   true,
		"device_id": deviceID,
		"pinned":    true,
	})
}

// UnpinMonitoringDevice 将指定设备从当前登录用户的星标关注池移除。
func (h MonitoringHandler) UnpinMonitoringDevice(c echo.Context) error {
	user, err := requirePermission(c, h.Auth, monitoringReadPermission)
	if err != nil {
		return err
	}
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}

	deviceID, err := strconv.Atoi(c.Param("device_id"))
	if err != nil || deviceID <= 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid device_id")
	}

	if err := h.Writer.UnpinDeviceForUser(c.Request().Context(), user.ID, deviceID); err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to unpin device")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success":   true,
		"device_id": deviceID,
		"pinned":    false,
	})
}

type batchPinDevicesRequest struct {
	Action    string `json:"action"`
	DeviceIDs []int  `json:"device_ids"`
}

// BatchPinMonitoringDevices 批量加入或移出当前登录用户的星标关注池。
func (h MonitoringHandler) BatchPinMonitoringDevices(c echo.Context) error {
	user, err := requirePermission(c, h.Auth, monitoringReadPermission)
	if err != nil {
		return err
	}
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}

	var req batchPinDevicesRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}
	if len(req.DeviceIDs) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "device_ids is required")
	}

	affected, err := h.Writer.BatchPinDevicesForUser(c.Request().Context(), user.ID, req.Action, req.DeviceIDs)
	if err != nil {
		switch {
		case errors.Is(err, monitoring.ErrDeviceNotFound):
			return echo.NewHTTPError(http.StatusNotFound, "设备不存在")
		case errors.Is(err, monitoring.ErrPinLimitExceeded), errors.Is(err, monitoring.ErrInvalidPinAction):
			return echo.NewHTTPError(http.StatusBadRequest, err.Error())
		default:
			return echo.NewHTTPError(http.StatusInternalServerError, "failed to batch update pins")
		}
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success":  true,
		"affected": affected,
	})
}

// GetMonitoringTopN 返回全网 TopN 排行。
func (h MonitoringHandler) GetMonitoringTopN(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, monitoringReadPermission); err != nil {
		return err
	}
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}

	limit, _ := strconv.Atoi(strings.TrimSpace(c.QueryParam("limit")))
	var groupID *int
	if rawGroup := strings.TrimSpace(c.QueryParam("group_id")); rawGroup != "" {
		gid, convErr := strconv.Atoi(rawGroup)
		if convErr != nil || gid <= 0 {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid group_id")
		}
		groupID = &gid
	}

	deviceIDs, err := parseStrictDeviceIDsQueryParam(c.QueryParam("device_ids"), monitoring.MaxTopNDeviceIDs)
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	resp, err := h.Writer.QueryTopN(c.Request().Context(), c.QueryParam("metric"), limit, groupID, deviceIDs...)
	if err != nil {
		if strings.Contains(err.Error(), "unsupported topn metric") || strings.Contains(err.Error(), "device_ids") {
			return echo.NewHTTPError(http.StatusBadRequest, err.Error())
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query topn")
	}
	return c.JSON(http.StatusOK, resp)
}

func parseStrictDeviceIDsQueryParam(raw string, maxCount int) ([]int, error) {
	trimmed := strings.TrimSpace(raw)
	if trimmed == "" {
		return nil, nil
	}
	parts := strings.Split(trimmed, ",")
	seen := make(map[int]struct{}, len(parts))
	out := make([]int, 0, len(parts))
	for _, part := range parts {
		token := strings.TrimSpace(part)
		id, err := strconv.Atoi(token)
		if token == "" || err != nil || id <= 0 {
			return nil, fmt.Errorf("invalid device_ids")
		}
		if _, ok := seen[id]; ok {
			continue
		}
		seen[id] = struct{}{}
		out = append(out, id)
		if maxCount > 0 && len(out) > maxCount {
			return nil, fmt.Errorf("device_ids count exceeds max %d", maxCount)
		}
	}
	return out, nil
}

// GetMonitoringLatestData 基于 device_latest_metrics 分页检索实时指标明细。
func (h MonitoringHandler) GetMonitoringLatestData(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, monitoringReadPermission); err != nil {
		return err
	}
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}

	page, _ := strconv.Atoi(strings.TrimSpace(c.QueryParam("page")))
	pageSize, _ := strconv.Atoi(strings.TrimSpace(c.QueryParam("page_size")))
	var groupID *int
	if rawGroup := strings.TrimSpace(c.QueryParam("group_id")); rawGroup != "" {
		gid, convErr := strconv.Atoi(rawGroup)
		if convErr != nil || gid <= 0 {
			return echo.NewHTTPError(http.StatusBadRequest, "invalid group_id")
		}
		groupID = &gid
	}

	filter := monitoring.LatestDataFilter{
		DeviceIDs:      parseDeviceIDsQueryParam(c.QueryParam("device_ids")),
		GroupID:        groupID,
		ApplicationTag: c.QueryParam("application_tag"),
		Search:         c.QueryParam("search"),
		ChangedOnly:    parseBoolQuery(c.QueryParam("changed_only")),
		AbnormalOnly:   parseBoolQuery(c.QueryParam("abnormal_only")),
		Page:           page,
		PageSize:       pageSize,
	}

	resp, err := h.Writer.QueryLatestData(c.Request().Context(), filter)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query latest data")
	}
	return c.JSON(http.StatusOK, resp)
}

// GetMonitoringAdhocGraphs 返回最多 6 条对齐时间桶的指标对比序列。
func (h MonitoringHandler) GetMonitoringAdhocGraphs(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, monitoringReadPermission); err != nil {
		return err
	}
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}

	var req monitoring.AdhocGraphRequest
	if err := c.Bind(&req); err != nil && !errors.Is(err, io.EOF) {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}
	if len(req.Series) == 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "series is required")
	}
	if len(req.Series) > monitoring.MaxAdhocSeriesCount {
		return echo.NewHTTPError(http.StatusBadRequest, monitoring.ErrTooManyAdhocSeries.Error())
	}

	var startTime, endTime time.Time
	if req.StartTime != nil || req.EndTime != nil {
		var err error
		startTime, endTime, err = resolveTimeRange(req.StartTime, req.EndTime, 24*time.Hour)
		if err != nil {
			return echo.NewHTTPError(http.StatusBadRequest, err.Error())
		}
	} else {
		startTime, endTime = resolveTimeRangeFromString(req.TimeRange, 24*time.Hour)
	}

	resp, err := h.Writer.QueryAdhocGraphs(c.Request().Context(), req.Series, startTime, endTime)
	if err != nil {
		if errors.Is(err, monitoring.ErrTooManyAdhocSeries) || errors.Is(err, monitoring.ErrInvalidAdhocRequest) {
			return echo.NewHTTPError(http.StatusBadRequest, err.Error())
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query adhoc graphs")
	}
	return c.JSON(http.StatusOK, resp)
}

func parseBoolQuery(raw string) bool {
	v := strings.ToLower(strings.TrimSpace(raw))
	return v == "true" || v == "1" || v == "yes"
}
