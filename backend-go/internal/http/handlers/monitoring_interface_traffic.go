package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/labstack/echo/v4"
)

// GetDeviceInterfaceTraffic 返回单台设备当前 UP 接口的上行/下行流量时序（监控中心流量卡接口视图）。
// query：start_time/end_time（缺省近 24h）、interface（device_interfaces.name，空 = 全部 UP 接口汇总）。
func (h MonitoringHandler) GetDeviceInterfaceTraffic(c echo.Context) error {
	if _, err := requirePermission(c, h.Auth, monitoringReadPermission); err != nil {
		return err
	}
	if h.Writer == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "metrics writer not configured")
	}

	deviceID, err := strconv.Atoi(c.Param("device_id"))
	if err != nil || deviceID <= 0 {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid device_id")
	}

	exists, err := h.Writer.DeviceExists(c.Request().Context(), deviceID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query device")
	}
	if !exists {
		return echo.NewHTTPError(http.StatusNotFound, "设备不存在")
	}

	startTime, endTime, err := parseHistoryRange(c.QueryParam("start_time"), c.QueryParam("end_time"))
	if err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	result, err := h.Writer.GetDeviceInterfaceTraffic(
		c.Request().Context(),
		deviceID,
		startTime,
		endTime,
		strings.TrimSpace(c.QueryParam("interface")),
	)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query interface traffic")
	}

	return c.JSON(http.StatusOK, result)
}
