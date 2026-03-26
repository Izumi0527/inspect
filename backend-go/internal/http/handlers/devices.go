package handlers

import (
	"github.com/labstack/echo/v4"

	"github.com/your-org/inspect-system/backend-go/internal/devices"
	"github.com/your-org/inspect-system/backend-go/internal/inspection"
	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
)

// DevicesHandler 设备管理 HTTP 处理器
type DevicesHandler struct {
	Service       *devices.Service
	Scanner       *devices.Scanner
	Probe         *devices.ProbeService
	SNMPCollector *devices.SNMPCollector
	Inspection    *inspection.Service
	Metrics       *monitoring.MetricsWriter
	Auth          PermissionService
}

// Register 注册所有设备相关路由
func (h DevicesHandler) Register(group *echo.Group) {
	// CRUD（device_crud.go）
	group.GET("/devices", h.GetDevices)
	group.POST("/devices", h.CreateDevice)
	group.GET("/devices/:device_id", h.GetDevice)
	group.PUT("/devices/:device_id", h.UpdateDevice)
	group.DELETE("/devices/:device_id", h.DeleteDevice)
	group.GET("/devices/groups", h.GetDeviceGroups)
	group.GET("/devices/search", h.SearchDevices)
	group.GET("/devices/statistics", h.GetDeviceStatistics)

	// 扫描（device_scan.go）
	group.POST("/devices/scan", h.StartNetworkScan)
	group.GET("/devices/scan/:scan_id", h.GetScanResult)
	group.GET("/devices/scan/:scan_id/devices", h.GetScanDevices)
	group.GET("/devices/scans", h.GetScanList)
	group.DELETE("/devices/scan/:scan_id", h.StopScan)
	group.POST("/devices/scan/:scan_id/import", h.ImportScanDevices)

	// 批量操作（device_bulk.go）
	group.POST("/devices/batch-import", h.BatchImportDevices)
	group.POST("/devices/batch-delete", h.BatchDeleteDevices)
	group.POST("/devices/bulk-action", h.BulkAction)
	group.POST("/devices/batch-update", h.BatchUpdateDevices)

	// 探测与指标（device_probe.go）
	group.POST("/devices/:device_id/health-check", h.HealthCheckDevice)
	group.GET("/devices/:device_id/performance", h.GetDevicePerformance)
	group.POST("/devices/:device_id/probe", h.ProbeDevice)
	group.POST("/devices/:device_id/collect-metrics", h.CollectDeviceMetrics)
	group.POST("/devices/batch-probe", h.BatchProbeDevices)
	group.POST("/devices/batch-collect-metrics", h.BatchCollectMetrics)
}
