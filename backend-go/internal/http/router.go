package http

import (
	"github.com/labstack/echo/v4"
	echomw "github.com/labstack/echo/v4/middleware"
	"go.uber.org/zap"

	"github.com/your-org/inspect-system/backend-go/internal/config"
	handlers "github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	mw "github.com/your-org/inspect-system/backend-go/internal/http/middleware"
	"github.com/your-org/inspect-system/backend-go/internal/ws"
)

func NewServer(
	cfg config.Config,
	logger *zap.Logger,
	wsHandler *ws.Handler,
	authHandler *handlers.AuthHandler,
	monitoringHandler *handlers.MonitoringHandler,
	alertsHandler *handlers.AlertsHandler,
	escalationHandler *handlers.EscalationHandler,
	devicesHandler *handlers.DevicesHandler,
	schedulerHandler *handlers.SchedulerHandler,
	reportsHandler *handlers.ReportsHandler,
	inspectionHandler *handlers.InspectionHandler,
	settingsHandler *handlers.SettingsHandler,
	dashboardHandler *handlers.DashboardHandler,
	logsHandler *handlers.LogsHandler,
	trafficHandler *handlers.TrafficHandler,
) *echo.Echo {
	e := echo.New()
	e.HideBanner = true
	
	// 使用带日志的错误处理器
	if logger != nil {
		e.HTTPErrorHandler = mw.ErrorHandlerWithLogger(logger)
	} else {
		e.HTTPErrorHandler = mw.ErrorHandler
	}

	e.Use(echomw.Recover())
	e.Use(mw.RequestTracking)

	if logger != nil {
		e.Use(mw.RequestLogger(logger))
	}

	e.Use(echomw.CORSWithConfig(echomw.CORSConfig{
		AllowOrigins:     cfg.CorsOrigins,
		AllowMethods:     []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"*", "X-Request-ID"},
		AllowCredentials: true,
	}))

	handlers.HealthHandler{Version: cfg.AppVersion}.Register(e)

	api := e.Group("/api/v1")
	// 限制请求体大小，避免批量接口/读取 raw body 被超大 payload 拖垮
	api.Use(echomw.BodyLimit("10M"))
	if authHandler != nil {
		authHandler.Register(api)
	}
	if wsHandler != nil {
		wsHandler.Register(api)
	}
	if monitoringHandler != nil {
		monitoringHandler.Register(api)
	}
	if alertsHandler != nil {
		alertsHandler.Register(api)
	}
	if escalationHandler != nil {
		escalationHandler.Register(api)
	}
	if devicesHandler != nil {
		devicesHandler.Register(api)
	}
	if schedulerHandler != nil {
		schedulerHandler.Register(api)
	}
	if reportsHandler != nil {
		reportsHandler.Register(api)
	}
	if inspectionHandler != nil {
		inspectionHandler.Register(api)
	}
	if settingsHandler != nil {
		settingsHandler.Register(api)
	}
	if dashboardHandler != nil {
		dashboardHandler.Register(api)
	}
	if logsHandler != nil {
		logsHandler.Register(api)
	}
	if trafficHandler != nil {
		trafficHandler.Register(api)
	}

	return e
}
