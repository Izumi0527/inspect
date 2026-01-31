package app

import (
	"context"
	"time"

	"github.com/labstack/echo/v4"
	"github.com/redis/go-redis/v9"
	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/auth"
	"github.com/your-org/inspect-system/backend-go/internal/alerts"
	"github.com/your-org/inspect-system/backend-go/internal/config"
	"github.com/your-org/inspect-system/backend-go/internal/dashboard"
	"github.com/your-org/inspect-system/backend-go/internal/db"
	"github.com/your-org/inspect-system/backend-go/internal/devices"
	"github.com/your-org/inspect-system/backend-go/internal/escalation"
	"github.com/your-org/inspect-system/backend-go/internal/inspection"
	httpserver "github.com/your-org/inspect-system/backend-go/internal/http"
	handlers "github.com/your-org/inspect-system/backend-go/internal/http/handlers"
	"github.com/your-org/inspect-system/backend-go/internal/logger"
	"github.com/your-org/inspect-system/backend-go/internal/logs"
	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
	"github.com/your-org/inspect-system/backend-go/internal/reports"
	redisstore "github.com/your-org/inspect-system/backend-go/internal/redis"
	"github.com/your-org/inspect-system/backend-go/internal/settings"
	"github.com/your-org/inspect-system/backend-go/internal/scheduler"
	"github.com/your-org/inspect-system/backend-go/internal/traffic"
	"github.com/your-org/inspect-system/backend-go/internal/ws"
)

type App struct {
	Config config.Config
	Logger *zap.Logger
	DB     *gorm.DB
	Redis  *redis.Client
	Echo   *echo.Echo
	Scheduler *scheduler.Service
	TrapListener *logs.SNMPTrapListener
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
		return nil, err
	}

	wsManager := ws.NewManager()
	wsHandler := ws.NewHandler(wsManager, log)
	metricsWriter := monitoring.NewMetricsWriter(dbConn, wsManager, log)
	
	// 初始化监控数据缓存
	cacheConfig := monitoring.DefaultCacheConfig()
	metricsCache := monitoring.NewMetricsCache(redisClient, cacheConfig, log)
	metricsWriter.SetCache(metricsCache)
	
	monitoringHandler := handlers.MonitoringHandler{
		Writer:          metricsWriter,
		ReportOutputDir: cfg.ReportOutputDir,
	}

	authService := auth.NewService(dbConn, cfg, log)
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

	alertService := alerts.NewService(dbConn, log)
	alertsHandler := handlers.AlertsHandler{
		Service: alertService,
		Auth:    authService,
	}

	escalationService := escalation.NewService(dbConn, log)
	escalationHandler := handlers.EscalationHandler{
		Service: escalationService,
		Auth:    authService,
	}

	inspectionHandler := handlers.InspectionHandler{
		Service:         inspectionService,
		Reports:         reportService,
		Auth:            authService,
		DeviceService:   deviceService,
		ProbeService:    probeService,
		Logger:          log,
		ReportOutputDir: cfg.ReportsOutputDir,
	}

	settingsService := settings.NewService(dbConn, redisClient, cfg, log)
	settingsHandler := handlers.SettingsHandler{
		Service: settingsService,
		Auth:    authService,
	}

	trafficService := traffic.NewService(dbConn, metricsWriter, log)

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

	logsService := logs.NewService(dbConn, log)
	logsHandler := handlers.LogsHandler{
		Service: logsService,
		Auth:    authService,
	}
	trapListener := logs.NewSNMPTrapListener(logsService, log, cfg.SnmpTrapAddress(), cfg.SnmpTrapEnabled)
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
		Config: cfg,
		Logger: log,
		DB:     dbConn,
		Redis:  redisClient,
		Echo:   server,
		Scheduler: schedulerService,
		TrapListener: trapListener,
	}, nil
}

func (a *App) Start() error {
	address := a.Config.Address()
	if a.Logger != nil {
		// 打印启动横幅
		env := "production"
		if a.Config.Debug {
			env = "development"
		}
		logger.PrintBanner(a.Config.AppVersion, env)
		logger.PrintStartupInfo(a.Logger, a.Config.ServerPort, env)
	}
	return a.Echo.Start(address)
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
