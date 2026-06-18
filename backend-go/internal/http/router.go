package http

import (
	"github.com/labstack/echo/v4"
	echomw "github.com/labstack/echo/v4/middleware"
	"go.uber.org/zap"

	"github.com/your-org/inspect-system/backend-go/internal/authcookie"
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
		AllowOrigins: cfg.CorsOrigins,
		AllowMethods: []string{"GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"},
		// 显式放行认证与 JSON 请求所需请求头，避免浏览器对 Authorization+通配符组合发出弃用告警。
		AllowHeaders:     []string{"Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With", "X-Request-ID", authcookie.CSRFHeader},
		AllowCredentials: true,
	}))

	handlers.HealthHandler{Version: cfg.AppVersion}.Register(e)

	api := e.Group("/api/v1")
	// 限制请求体大小，避免批量接口/读取 raw body 被超大 payload 拖垮
	api.Use(echomw.BodyLimit("10M"))
	// 全局认证中间件：对非白名单路由强制校验 Bearer token（认证），
	// 各 handler 仍各自做权限点（授权）检查。新增端点即使漏写授权也不会缺失认证。
	if authHandler != nil && authHandler.Service != nil {
		api.Use(mw.Authentication(authHandler.Service, publicAPIPaths()))
		// CSRF（double-submit）：仅对携带 csrf cookie 的状态变更请求强制，兼容 Bearer 过渡前端。
		api.Use(mw.CSRFProtection(csrfExemptPaths()))
		// 强制改密闸：被标记 force_password_change 的用户在改密前不能访问业务端点。
		api.Use(mw.EnforcePasswordChange(forcePasswordChangeExemptPaths()))
	}
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

// publicAPIPaths 列出 /api/v1 下无需 Bearer 认证的公开端点（echo 路由模板，含分组前缀）。
// 这些端点要么是认证引导（登录/刷新），要么使用 Bearer 以外的认证方式：
//   - /api/v1/auth/login        登录引导，无 token
//   - /api/v1/auth/refresh      刷新引导，携带 refresh token（在 body）而非 Bearer access token
//   - /api/v1/ws/:user_id       WebSocket 升级，使用 Sec-WebSocket-Protocol 子协议传递 token
//   - /api/v1/monitoring/reports/download  报表一次性下载 token（在表单），供浏览器直接下载
//
// 其余端点（含 /auth/logout、/auth/me、/auth/profile、/auth/verify 等）一律经全局认证中间件。
func publicAPIPaths() map[string]struct{} {
	return map[string]struct{}{
		"/api/v1/auth/login":                  {},
		"/api/v1/auth/refresh":                {},
		"/api/v1/ws/:user_id":                 {},
		"/api/v1/monitoring/reports/download": {},
	}
}

// forcePasswordChangeExemptPaths 列出“强制改密”用户在完成改密前仍可访问的端点
// （echo 路由模板，含分组前缀）：改密本身、查看自身信息、登出、token 校验。
// 其余 /api/v1 业务端点在用户改密前一律由 EnforcePasswordChange 闸返回 403。
func forcePasswordChangeExemptPaths() map[string]struct{} {
	return map[string]struct{}{
		"/api/v1/auth/change-password": {},
		"/api/v1/auth/me":              {},
		"/api/v1/auth/profile":         {},
		"/api/v1/auth/logout":          {},
		"/api/v1/auth/verify":          {},
	}
}

// csrfExemptPaths 列出豁免 CSRF 校验的端点（echo 路由模板，含分组前缀）：
//   - /auth/login、/auth/refresh：认证引导，请求时尚无 csrf token；refresh 轮换不向攻击者泄露 token；
//   - /monitoring/reports/download：浏览器原生 form POST 触发下载，无法设置自定义请求头，
//     且自带一次性下载 token 防护。
func csrfExemptPaths() map[string]struct{} {
	return map[string]struct{}{
		"/api/v1/auth/login":                  {},
		"/api/v1/auth/refresh":                {},
		"/api/v1/monitoring/reports/download": {},
	}
}
