package handlers

import (
	"net/http"
	"strconv"

	"github.com/labstack/echo/v4"
)

// GetDeviceSNMPExtensions 返回设备最近一次 SNMP 扩展摘要。
func (h MonitoringHandler) GetDeviceSNMPExtensions(c echo.Context) error {
	if err := h.ensurePermission(c, monitoringReadPermission); err != nil {
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

	resp, err := h.Writer.GetLatestSNMPExtensions(c.Request().Context(), deviceID)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to query snmp extensions")
	}

	return c.JSON(http.StatusOK, resp)
}
