package app

import (
	"context"
	"errors"
	"fmt"
	"net"
	"os"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/alerts"
	"github.com/your-org/inspect-system/backend-go/internal/auth"
	"github.com/your-org/inspect-system/backend-go/internal/config"
	"github.com/your-org/inspect-system/backend-go/internal/dashboard"
	"github.com/your-org/inspect-system/backend-go/internal/db"
	"github.com/your-org/inspect-system/backend-go/internal/devices"
	"github.com/your-org/inspect-system/backend-go/internal/escalation"
	httpserver "github.com/your-org/inspect-system/backend-go/internal/http"
	handlers "github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	"github.com/your-org/inspect-system/backend-go/internal/inspection"
	"github.com/your-org/inspect-system/backend-go/internal/logger"
	"github.com/your-org/inspect-system/backend-go/internal/logs"
	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
	redisstore "github.com/your-org/inspect-system/backend-go/internal/redis"
	"github.com/your-org/inspect-system/backend-go/internal/reports"
	"github.com/your-org/inspect-system/backend-go/internal/scheduler"
	"github.com/your-org/inspect-system/backend-go/internal/settings"
	"github.com/your-org/inspect-system/backend-go/internal/traffic"
	"github.com/your-org/inspect-system/backend-go/internal/ws"
)

// wsAuthAdapter 将 auth.Service 适配为 ws.AccessTokenAuthorizer，避免 ws 包直接依赖 internal/auth 造成循环引用。
type wsAuthAdapter struct {
	Service *auth.Service
}

func (a wsAuthAdapter) AuthorizeAccessToken(ctx context.Context, accessToken string) (string, []string, error) {
	if a.Service == nil {
		return "", nil, ws.ErrPermissionResolveFailed
	}

	user, err := a.Service.GetActiveUserFromToken(ctx, accessToken)
	if err != nil {
		if errors.Is(err, auth.ErrUserInactive) {
			return "", nil, ws.ErrUserInactive
		}
		return "", nil, err
	}

	permissions, err := a.Service.GetPermissionsByRole(ctx, user.Role)
	if err != nil {
		return "", nil, ws.ErrPermissionResolveFailed
	}

	return user.ID, permissions, nil
}

type App struct {
	Config       config.Config
	Logger       *zap.Logger
	DB           *gorm.DB
	Redis        *redis.Client
	Echo         *echo.Echo
	Scheduler    *scheduler.Service
	TrapListener *logs.SNMPTrapListener
	Syslog       *logs.SyslogReceiver

	InspectionSchedulerCancel context.CancelFunc
	InspectionSchedulerDone   <-chan struct{}
}

func New() (*App, error) {
	cfg, err := config.Load()
	if err != nil {
		return nil, err
	}

	log, err := logger.New(cfg)
	if err != nil {
		return nil, err
	}

	dbConn, err := db.OpenPostgres(cfg)
	if err != nil {
		return nil, err
	}

	if err := db.Migrate(dbConn, cfg, log); err != nil {
		return nil, err
	}

	redisClient, err := redisstore.NewClient(cfg)
	if err != nil {
		// 开发/调试环境允许无 Redis 启动：相关功能将自动降级（监控缓存、限流、健康检查等）。
		// 生产环境仍保持“Redis 不可用则启动失败”，避免静默降级造成不可预期行为。
		if cfg.Debug {
			log.Warn("redis_unavailable_continue_without_redis", zap.Error(err))
			redisClient = nil
		} else {
			return nil, err
		}
	}

	wsManager := ws.NewManager()
	authService := auth.NewService(dbConn, cfg, log)
	wsHandler := ws.NewHandlerWithOrigins(wsManager, wsAuthAdapter{Service: authService}, log, cfg.CorsOrigins)
	metricsWriter := monitoring.NewMetricsWriter(dbConn, wsManager, log)

	// 初始化监控数据缓存
	cacheConfig := monitoring.DefaultCacheConfig()
	cacheConfig.Enabled = cfg.MonitoringCacheEnabled
	if cfg.MonitoringCacheTTL > 0 {
		cacheConfig.SystemPerformanceTTL = cfg.MonitoringCacheTTL
		cacheConfig.TemperatureTTL = cfg.MonitoringCacheTTL
		cacheConfig.NetworkTrafficTTL = cfg.MonitoringCacheTTL
	}
	metricsCache := monitoring.NewMetricsCache(redisClient, cacheConfig, log)
	metricsWriter.SetCache(metricsCache)

	monitoringHandler := handlers.MonitoringHandler{
		Writer:          metricsWriter,
		ReportOutputDir: cfg.ReportOutputDir,
		AlertService:    nil, // 稍后在 alertService 创建后注入
	}

	monitoringHandler.Auth = authService
	monitoringHandler.DownloadTokens = handlers.NewReportDownloadTokenStore(redisClient, log)
	monitoringHandler.DownloadTokenTTL = cfg.MonitoringReportDownloadTokenTTL
	monitoringHandler.DownloadTokenMaxUses = cfg.MonitoringReportDownloadTokenMaxUses
	authHandler := handlers.AuthHandler{
		Service: authService,
	}

	inspectionService := inspection.NewService(dbConn, log)

	deviceService := devices.NewService(dbConn, log)
	probeService := devices.NewProbeService(log)
	snmpCollector := devices.NewSNMPCollector(log)
	scanner := devices.NewScanner(dbConn, log, probeService)
	devicesHandler := handlers.DevicesHandler{
		Service:       deviceService,
		Scanner:       scanner,
		Probe:         probeService,
		SNMPCollector: snmpCollector,
		Inspection:    inspectionService,
		Metrics:       metricsWriter,
		Auth:          authService,
	}

	reportService := reports.NewService(dbConn, log)
	reportHandler := handlers.ReportsHandler{
		Service:   reportService,
		Auth:      authService,
		OutputDir: cfg.ReportsOutputDir,
	}

	// 提前创建 settingsService：inspection/scheduler/alerts 通用依赖
	settingsService := settings.NewService(dbConn, redisClient, cfg, log)

	alertService := alerts.NewService(dbConn, log)
	alertEvaluator := alerts.NewEvaluator(dbConn, wsManager, settingsService, log)
	alertsHandler := handlers.AlertsHandler{
		Service: alertService,
		Auth:    authService,
		WS:      wsManager,
	}

	escalationService := escalation.NewService(dbConn, log)
	escalationHandler := handlers.EscalationHandler{
		Service: escalationService,
		Auth:    authService,
	}

	// 将告警服务注入监控中心聚合接口（用于实时告警分区）
	monitoringHandler.AlertService = alertService

	inspectionHandler := handlers.InspectionHandler{
		Service:         inspectionService,
		Reports:         reportService,
		Auth:            authService,
		Settings:        settingsService,
		DeviceService:   deviceService,
		ProbeService:    probeService,
		WS:              wsManager,
		Logger:          log,
		ReportOutputDir: cfg.ReportsOutputDir,
	}

	inspectionSchedulerCtx, inspectionSchedulerCancel := context.WithCancel(context.Background())
	inspectionSchedulerDone := inspectionHandler.StartStrategyScheduler(inspectionSchedulerCtx)

	settingsHandler := handlers.SettingsHandler{
		Service: settingsService,
		Auth:    authService,
	}

	trafficService := traffic.NewService(dbConn, metricsWriter, log)

	logsService := logs.NewService(dbConn, log)

	// 创建 Trap 告警桥接器（scheduler 和 trapListener 都需要）
	trapAlertBridge := alerts.NewTrapAlertBridge(dbConn, wsManager, log)

	// Syslog 告警桥接器（用于日志级别联动告警 + 风暴保护）
	syslogAlertBridge := alerts.NewSyslogAlertBridge(dbConn, redisClient, wsManager, log)

	schedulerService := scheduler.NewService(
		dbConn,
		log,
		deviceService,
		probeService,
		scanner,
		snmpCollector,
		metricsWriter,
		redisClient,
		settingsService,
		trafficService,
		reportService,
		cfg.ReportsOutputDir,
		alertEvaluator,
		trapAlertBridge,
		logsService,
	)
	if err := schedulerService.Start(); err != nil {
		return nil, err
	}
	schedulerHandler := handlers.SchedulerHandler{
		Service: schedulerService,
		Auth:    authService,
	}

	dashboardService := dashboard.NewService(dbConn, alertService, metricsWriter, schedulerService, redisClient, log)
	dashboardHandler := handlers.DashboardHandler{
		Service: dashboardService,
		Auth:    authService,
	}

	syslogReceiver := logs.NewSyslogReceiver(logsService, log)
	syslogReceiver.SetAlertCreator(syslogAlertBridge)

	// 启动时从系统设置中加载 syslog 配置并尽力应用（失败不阻塞主服务启动）。
	{
		syslogCfg := readSyslogConfigFromSettings(context.Background(), settingsService)
		if _, err := syslogReceiver.Apply(context.Background(), syslogCfg); err != nil && log != nil {
			log.Warn("Syslog配置应用失败（将继续启动主服务）", zap.Error(err))
		}
	}

	logsHandler := handlers.LogsHandler{
		Service:  logsService,
		Auth:     authService,
		Settings: settingsService,
		Syslog:   syslogReceiver,
	}
	trapListener := logs.NewSNMPTrapListener(logsService, log, cfg.SnmpTrapAddress(), cfg.SnmpTrapEnabled)
	trapListener.SetAlertCreator(trapAlertBridge)

	if err := trapListener.Start(); err != nil {
		return nil, err
	}

	trafficHandler := handlers.TrafficHandler{
		Service: trafficService,
		Auth:    authService,
	}

	server := httpserver.NewServer(
		cfg,
		log,
		wsHandler,
		&authHandler,
		&monitoringHandler,
		&alertsHandler,
		&escalationHandler,
		&devicesHandler,
		&schedulerHandler,
		&reportHandler,
		&inspectionHandler,
		&settingsHandler,
		&dashboardHandler,
		&logsHandler,
		&trafficHandler,
	)

	return &App{
		Config:                    cfg,
		Logger:                    log,
		DB:                        dbConn,
		Redis:                     redisClient,
		Echo:                      server,
		Scheduler:                 schedulerService,
		TrapListener:              trapListener,
		Syslog:                    syslogReceiver,
		InspectionSchedulerCancel: inspectionSchedulerCancel,
		InspectionSchedulerDone:   inspectionSchedulerDone,
	}, nil
}

func (a *App) Start() error {
	host, port, err := normalizeHostPort(a.Config.ServerHost, a.Config.ServerPort)
	if err != nil {
		return err
	}
	listener, resolvedAddr, err := a.openHTTPListener(host, port)
	if err != nil {
		return err
	}

	resolvedHost, resolvedPort := splitHostPort(resolvedAddr, host, port)
	a.Config.ServerHost = resolvedHost
	a.Config.ServerPort = resolvedPort

	if a.Logger != nil {
		// 打印启动横幅
		env := "production"
		if a.Config.Debug {
			env = "development"
		}
		logger.PrintBanner(a.Config.AppVersion, env)
		logger.PrintStartupInfo(a.Logger, a.Config.ServerPort, env)
	}

	a.Echo.Listener = listener
	return a.Echo.Start(resolvedAddr)
}

func (a *App) Shutdown(ctx context.Context) error {
	shutdownCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	if a.Logger != nil {
		logger.PrintShutdownInfo(a.Logger)
	}

	if err := a.Echo.Shutdown(shutdownCtx); err != nil {
		return err
	}

	if a.Redis != nil {
		_ = a.Redis.Close()
	}
	if a.Scheduler != nil {
		_ = a.Scheduler.Stop(shutdownCtx)
	}
	if a.TrapListener != nil {
		_ = a.TrapListener.Stop(shutdownCtx)
	}
	if a.Syslog != nil {
		_ = a.Syslog.Stop(shutdownCtx)
	}
	if a.InspectionSchedulerCancel != nil {
		a.InspectionSchedulerCancel()
	}
	if a.InspectionSchedulerDone != nil {
		select {
		case <-a.InspectionSchedulerDone:
		case <-shutdownCtx.Done():
			return shutdownCtx.Err()
		}
	}

	if a.DB != nil {
		if sqlDB, err := a.DB.DB(); err == nil {
			_ = sqlDB.Close()
		}
	}

	if a.Logger != nil {
		_ = a.Logger.Sync()
	}

	return nil
}

func normalizeHostPort(host string, port int) (string, int, error) {
	trimmedHost := strings.TrimSpace(host)
	if trimmedHost == "" {
		trimmedHost = "0.0.0.0"
	}
	if port <= 0 || port > 65535 {
		return "", 0, fmt.Errorf("SERVER_PORT 未配置或非法: %d", port)
	}
	return trimmedHost, port, nil
}

func splitHostPort(address, fallbackHost string, fallbackPort int) (string, int) {
	host, portStr, err := net.SplitHostPort(strings.TrimSpace(address))
	if err != nil {
		return fallbackHost, fallbackPort
	}
	port, err := strconv.Atoi(portStr)
	if err != nil || port <= 0 {
		return host, fallbackPort
	}
	return host, port
}

func (a *App) openHTTPListener(host string, port int) (net.Listener, string, error) {
	addr := fmt.Sprintf("%s:%d", host, port)
	listener, err := net.Listen("tcp", addr)
	if err == nil {
		return listener, listener.Addr().String(), nil
	}

	// 开发环境降级：当端口被系统保留（Windows excluded port range）或被占用时，自动选择可用端口继续启动。
	if !a.Config.Debug || !shouldFallbackListenError(err) {
		return nil, "", err
	}

	if a.Logger != nil {
		a.Logger.Warn("http_listen_failed_try_fallback_port",
			zap.String("addr", addr),
			zap.Error(err),
		)
	}

	const maxAttempts = 200
	for i := 1; i <= maxAttempts; i++ {
		candidate := port + i
		if candidate > 65535 {
			break
		}
		candidateAddr := fmt.Sprintf("%s:%d", host, candidate)
		l, listenErr := net.Listen("tcp", candidateAddr)
		if listenErr != nil {
			continue
		}

		if a.Logger != nil {
			a.Logger.Warn("http_listen_fallback_port_selected",
				zap.Int("port", candidate),
				zap.String("addr", candidateAddr),
				zap.String("hint", "请同步更新前端 NEXT_PUBLIC_API_URL / NEXT_PUBLIC_WS_URL，或在 .env 中设置 SERVER_PORT"),
			)
		}

		return l, l.Addr().String(), nil
	}

	return nil, "", err
}

func shouldFallbackListenError(err error) bool {
	// address already in use（跨平台）
	if errors.Is(err, syscall.EADDRINUSE) {
		return true
	}
	// permission denied（跨平台）
	if errors.Is(err, syscall.EACCES) {
		return true
	}

	// Windows: WSAEACCES(10013) / WSAEADDRINUSE(10048) 常见于 excluded port range 或端口占用。
	var opErr *net.OpError
	if errors.As(err, &opErr) {
		var sysErr *os.SyscallError
		if errors.As(opErr.Err, &sysErr) {
			if errno, ok := sysErr.Err.(syscall.Errno); ok {
				if int(errno) == 10013 || int(errno) == 10048 {
					return true
				}
			}
		}
	}

	lower := strings.ToLower(err.Error())
	if strings.Contains(lower, "access permissions") {
		return true
	}
	if strings.Contains(lower, "permission denied") {
		return true
	}
	if strings.Contains(lower, "address already in use") {
		return true
	}
	if strings.Contains(lower, "only one usage of each socket address") {
		return true
	}
	return false
}

type syslogSettingGetter interface {
	GetSetting(ctx context.Context, key string) (*settings.SettingItem, error)
}

func readSyslogConfigFromSettings(ctx context.Context, getter syslogSettingGetter) logs.SyslogConfig {
	// 默认值（与 handler/前端展示保持一致）。
	cfg := logs.SyslogConfig{
		Enabled:               false,
		Protocol:              "both",
		Host:                  "0.0.0.0",
		Port:                  5514,
		MaxMessageBytes:       8192,
		AlertsEnabled:         true,
		AlertsMaxNewPerMinute: 30,
	}
	if getter == nil {
		return cfg
	}

	readString := func(key string) (string, bool) {
		item, err := getter.GetSetting(ctx, key)
		if err != nil || item == nil {
			return "", false
		}
		switch v := item.Value.(type) {
		case string:
			return v, true
		default:
			return fmt.Sprint(v), true
		}
	}
	readBool := func(key string) (bool, bool) {
		item, err := getter.GetSetting(ctx, key)
		if err != nil || item == nil {
			return false, false
		}
		switch v := item.Value.(type) {
		case bool:
			return v, true
		case string:
			trimmed := strings.ToLower(strings.TrimSpace(v))
			if trimmed == "true" {
				return true, true
			}
			if trimmed == "false" {
				return false, true
			}
			return false, false
		case int:
			return v != 0, true
		case int64:
			return v != 0, true
		case float64:
			return v != 0, true
		default:
			return false, false
		}
	}
	readInt := func(key string) (int, bool) {
		item, err := getter.GetSetting(ctx, key)
		if err != nil || item == nil {
			return 0, false
		}
		switch v := item.Value.(type) {
		case int:
			return v, true
		case int64:
			return int(v), true
		case float64:
			return int(v), true
		case string:
			parsed, err := strconv.Atoi(strings.TrimSpace(v))
			if err == nil {
				return parsed, true
			}
			return 0, false
		default:
			return 0, false
		}
	}

	if v, ok := readBool("logs.syslog.enabled"); ok {
		cfg.Enabled = v
	}
	if v, ok := readString("logs.syslog.protocol"); ok {
		value := strings.ToLower(strings.TrimSpace(v))
		if value == "udp" || value == "tcp" || value == "both" {
			cfg.Protocol = value
		}
	}
	if v, ok := readString("logs.syslog.host"); ok {
		if trimmed := strings.TrimSpace(v); trimmed != "" {
			cfg.Host = trimmed
		}
	}
	if v, ok := readInt("logs.syslog.port"); ok {
		if v > 0 && v <= 65535 {
			cfg.Port = v
		}
	}
	if v, ok := readInt("logs.syslog.max_message_bytes"); ok {
		if v >= 256 && v <= 1024*1024 {
			cfg.MaxMessageBytes = v
		}
	}
	if v, ok := readBool("logs.syslog.alerts.enabled"); ok {
		cfg.AlertsEnabled = v
	}
	if v, ok := readInt("logs.syslog.alerts.max_new_per_minute"); ok {
		if v >= 0 && v <= 10000 {
			cfg.AlertsMaxNewPerMinute = v
		}
	}

	return cfg
}
