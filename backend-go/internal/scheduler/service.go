package scheduler

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"github.com/robfig/cron/v3"
	"github.com/shirou/gopsutil/v3/disk"
	"go.uber.org/zap"
	"gorm.io/datatypes"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/alerts"
	"github.com/your-org/inspect-system/backend-go/internal/devices"
	"github.com/your-org/inspect-system/backend-go/internal/logs"
	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
	"github.com/your-org/inspect-system/backend-go/internal/reports"
	"github.com/your-org/inspect-system/backend-go/internal/settings"
	"github.com/your-org/inspect-system/backend-go/internal/traffic"
)

const (
	defaultCheckInterval = 60 * time.Second
	defaultMaxConcurrent = 10
)

type Service struct {
	db              *gorm.DB
	logger          *zap.Logger
	deviceService   *devices.Service
	probeService    *devices.ProbeService
	scanner         *devices.Scanner
	snmpCollector   *devices.SNMPCollector
	metricsWriter   *monitoring.MetricsWriter
	settingsService *settings.Service
	trafficService  *traffic.Service
	reportService   *reports.Service
	alertEvaluator  *alerts.Evaluator
	trapAlertBridge *alerts.TrapAlertBridge
	logsService     *logs.Service
	reportOutputDir string
	redis           *redis.Client
	checkInterval   time.Duration
	maxConcurrent   int
	parser          cron.Parser
	limit           chan struct{}

	mu        sync.Mutex
	running   bool
	cancel    context.CancelFunc
	done      chan struct{}
	startedAt time.Time
}

type CreateTaskInput struct {
	Name           string
	TaskType       string
	CronExpression string
	Enabled        bool
	Config         map[string]interface{}
}

type Stats struct {
	IsRunning       bool
	CheckInterval   int
	TotalTasks      int
	EnabledTasks    int
	RunningTasks    int
	TotalExecutions int
	Uptime          string
}

func NewService(
	db *gorm.DB,
	logger *zap.Logger,
	deviceService *devices.Service,
	probeService *devices.ProbeService,
	scanner *devices.Scanner,
	snmpCollector *devices.SNMPCollector,
	metricsWriter *monitoring.MetricsWriter,
	redis *redis.Client,
	settingsService *settings.Service,
	trafficService *traffic.Service,
	reportService *reports.Service,
	reportOutputDir string,
	alertEvaluator *alerts.Evaluator,
	trapAlertBridge *alerts.TrapAlertBridge,
	logsService *logs.Service,
) *Service {
	parser := cron.NewParser(cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow)
	return &Service{
		db:              db,
		logger:          logger,
		deviceService:   deviceService,
		probeService:    probeService,
		scanner:         scanner,
		snmpCollector:   snmpCollector,
		metricsWriter:   metricsWriter,
		settingsService: settingsService,
		trafficService:  trafficService,
		reportService:   reportService,
		alertEvaluator:  alertEvaluator,
		trapAlertBridge: trapAlertBridge,
		logsService:     logsService,
		reportOutputDir: strings.TrimSpace(reportOutputDir),
		redis:           redis,
		checkInterval:   defaultCheckInterval,
		maxConcurrent:   defaultMaxConcurrent,
		parser:          parser,
		limit:           make(chan struct{}, defaultMaxConcurrent),
	}
}

func (s *Service) Start() error {
	if s == nil || s.db == nil {
		return fmt.Errorf("database not initialized")
	}

	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return nil
	}
	s.mu.Unlock()

	if err := s.ensureDefaultTasks(context.Background()); err != nil {
		return err
	}

	// 重置上次进程异常退出遗留的 running 任务：processDueTasks 的 status<>running
	// 条件会永久跳过僵死任务，导致连通性探测/告警评估等调度静默停摆。
	if err := s.recoverStaleRunningTasks(context.Background()); err != nil && s.logger != nil {
		s.logger.Warn("恢复僵死 running 任务失败", zap.Error(err))
	}

	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return nil
	}

	ctx, cancel := context.WithCancel(context.Background())
	s.running = true
	s.cancel = cancel
	s.done = make(chan struct{})
	s.startedAt = time.Now().UTC()
	s.mu.Unlock()

	go s.run(ctx)
	return nil
}

// recoverStaleRunningTasks 将上次进程中断遗留的 running 任务重置为 pending，
// 避免 processDueTasks（status<>running）永久跳过它们导致调度僵死停摆。
func (s *Service) recoverStaleRunningTasks(ctx context.Context) error {
	if s == nil || s.db == nil {
		return fmt.Errorf("database not initialized")
	}
	result := s.db.WithContext(ctx).
		Model(&ScheduledTask{}).
		Where("status = ?", string(TaskStatusRunning)).
		Updates(map[string]interface{}{
			"status":     string(TaskStatusPending),
			"updated_at": time.Now().UTC(),
		})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected > 0 && s.logger != nil {
		s.logger.Info("已恢复僵死 running 任务", zap.Int64("count", result.RowsAffected))
	}
	return nil
}

func (s *Service) Stop(ctx context.Context) error {
	s.mu.Lock()
	if !s.running {
		s.mu.Unlock()
		return nil
	}
	cancel := s.cancel
	done := s.done
	s.running = false
	s.cancel = nil
	s.mu.Unlock()

	if cancel != nil {
		cancel()
	}
	if done != nil {
		select {
		case <-done:
		case <-ctx.Done():
			return ctx.Err()
		}
	}
	return nil
}

func (s *Service) GetStats(ctx context.Context) (Stats, error) {
	if s == nil || s.db == nil {
		return Stats{}, fmt.Errorf("database not initialized")
	}

	var totalTasks int64
	var enabledTasks int64
	var runningTasks int64
	var totalExecutions int64

	if err := s.db.WithContext(ctx).Model(&ScheduledTask{}).Count(&totalTasks).Error; err != nil {
		return Stats{}, err
	}
	if err := s.db.WithContext(ctx).Model(&ScheduledTask{}).Where("enabled = ?", true).Count(&enabledTasks).Error; err != nil {
		return Stats{}, err
	}
	if err := s.db.WithContext(ctx).Model(&ScheduledTask{}).Where("status = ?", string(TaskStatusRunning)).Count(&runningTasks).Error; err != nil {
		return Stats{}, err
	}
	if err := s.db.WithContext(ctx).Model(&TaskExecution{}).Count(&totalExecutions).Error; err != nil {
		return Stats{}, err
	}

	s.mu.Lock()
	isRunning := s.running
	s.mu.Unlock()

	return Stats{
		IsRunning:       isRunning,
		CheckInterval:   int(s.checkInterval.Seconds()),
		TotalTasks:      int(totalTasks),
		EnabledTasks:    int(enabledTasks),
		RunningTasks:    int(runningTasks),
		TotalExecutions: int(totalExecutions),
		Uptime:          time.Now().UTC().Format(time.RFC3339),
	}, nil
}

func (s *Service) ListTasks(ctx context.Context) ([]ScheduledTask, error) {
	if s == nil || s.db == nil {
		return nil, fmt.Errorf("database not initialized")
	}

	var tasks []ScheduledTask
	if err := s.db.WithContext(ctx).Order("created_at desc").Find(&tasks).Error; err != nil {
		return nil, err
	}
	return tasks, nil
}

func (s *Service) GetTask(ctx context.Context, taskID string) (ScheduledTask, error) {
	var task ScheduledTask
	if s == nil || s.db == nil {
		return task, fmt.Errorf("database not initialized")
	}
	if strings.TrimSpace(taskID) == "" {
		return task, gorm.ErrRecordNotFound
	}

	if err := s.db.WithContext(ctx).Where("id = ?", taskID).Take(&task).Error; err != nil {
		return task, err
	}
	return task, nil
}

func (s *Service) CreateTask(ctx context.Context, input CreateTaskInput) (ScheduledTask, error) {
	var task ScheduledTask
	if s == nil || s.db == nil {
		return task, fmt.Errorf("database not initialized")
	}

	name := strings.TrimSpace(input.Name)
	if name == "" {
		return task, fmt.Errorf("name is required")
	}
	taskType := strings.TrimSpace(input.TaskType)
	if !isValidTaskType(taskType) {
		return task, fmt.Errorf("invalid task_type")
	}
	if !isExecutableTaskType(taskType) {
		return task, fmt.Errorf("任务类型暂不支持")
	}
	cronExpr := strings.TrimSpace(input.CronExpression)
	if cronExpr == "" {
		return task, fmt.Errorf("cron_expression is required")
	}
	nextRun, err := s.nextRun(cronExpr, time.Now().UTC())
	if err != nil {
		return task, fmt.Errorf("invalid cron_expression")
	}

	configJSON := datatypes.JSON([]byte("{}"))
	if input.Config != nil {
		if payload, err := json.Marshal(input.Config); err == nil {
			configJSON = datatypes.JSON(payload)
		}
	}

	now := time.Now().UTC()
	task = ScheduledTask{
		ID:             uuid.NewString(),
		Name:           name,
		TaskType:       taskType,
		CronExpression: cronExpr,
		Enabled:        input.Enabled,
		Status:         string(TaskStatusPending),
		Progress:       0,
		LastRun:        nil,
		NextRun:        &nextRun,
		RunCount:       0,
		SuccessCount:   0,
		FailureCount:   0,
		ErrorMessage:   nil,
		Config:         configJSON,
		CreatedAt:      &now,
		UpdatedAt:      &now,
	}

	if err := s.db.WithContext(ctx).Create(&task).Error; err != nil {
		return task, err
	}
	return task, nil
}

func (s *Service) DeleteTask(ctx context.Context, taskID string) error {
	if s == nil || s.db == nil {
		return fmt.Errorf("database not initialized")
	}
	if strings.TrimSpace(taskID) == "" {
		return gorm.ErrRecordNotFound
	}

	result := s.db.WithContext(ctx).Where("id = ?", taskID).Delete(&ScheduledTask{})
	if result.Error != nil {
		return result.Error
	}
	if result.RowsAffected == 0 {
		return gorm.ErrRecordNotFound
	}
	return nil
}

func (s *Service) SetTaskEnabled(ctx context.Context, taskID string, enabled bool) (ScheduledTask, error) {
	task, err := s.GetTask(ctx, taskID)
	if err != nil {
		return task, err
	}

	updates := map[string]interface{}{
		"enabled":    enabled,
		"updated_at": time.Now().UTC(),
	}
	if enabled {
		if nextRun, err := s.nextRun(task.CronExpression, time.Now().UTC()); err == nil {
			updates["next_run"] = nextRun
		}
	}

	if err := s.db.WithContext(ctx).Model(&ScheduledTask{}).Where("id = ?", taskID).Updates(updates).Error; err != nil {
		return task, err
	}
	return s.GetTask(ctx, taskID)
}

func (s *Service) run(ctx context.Context) {
	ticker := time.NewTicker(s.checkInterval)
	defer ticker.Stop()
	defer close(s.done)

	s.processDueTasks(ctx)

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			s.processDueTasks(ctx)
		}
	}
}

func (s *Service) processDueTasks(ctx context.Context) {
	if s == nil || s.db == nil {
		return
	}

	now := time.Now().UTC()
	var tasks []ScheduledTask
	if err := s.db.WithContext(ctx).
		Where("enabled = ? AND (next_run IS NULL OR next_run <= ?) AND status <> ?", true, now, string(TaskStatusRunning)).
		Find(&tasks).Error; err != nil {
		if s.logger != nil {
			s.logger.Warn("query due tasks failed", zap.Error(err))
		}
		return
	}

	for _, task := range tasks {
		task := task
		s.limit <- struct{}{}
		go func() {
			defer func() { <-s.limit }()
			s.executeTask(ctx, task)
		}()
	}
}

func (s *Service) executeTask(ctx context.Context, task ScheduledTask) {
	startedAt := time.Now().UTC()
	update := map[string]interface{}{
		"status":     string(TaskStatusRunning),
		"progress":   0,
		"last_run":   startedAt,
		"run_count":  gorm.Expr("run_count + 1"),
		"updated_at": startedAt,
	}

	result := s.db.WithContext(ctx).
		Model(&ScheduledTask{}).
		Where("id = ? AND enabled = ? AND status <> ?", task.ID, true, string(TaskStatusRunning)).
		Updates(update)
	if result.Error != nil {
		if s.logger != nil {
			s.logger.Warn("start task failed", zap.Error(result.Error), zap.String("task_id", task.ID))
		}
		return
	}
	if result.RowsAffected == 0 {
		return
	}

	execution := TaskExecution{
		ID:        uuid.NewString(),
		TaskID:    task.ID,
		StartedAt: startedAt,
		Status:    string(TaskStatusRunning),
		Duration:  0,
	}
	if err := s.db.WithContext(ctx).Create(&execution).Error; err != nil && s.logger != nil {
		s.logger.Warn("create task execution failed", zap.Error(err), zap.String("task_id", task.ID))
	}

	var taskResult map[string]interface{}
	var taskErr error
	defer func() {
		if rec := recover(); rec != nil {
			taskErr = fmt.Errorf("task panic")
			if s.logger != nil {
				s.logger.Error("task panic", zap.Any("recover", rec), zap.String("task_id", task.ID))
			}
		}

		s.finishTask(ctx, task, execution, startedAt, taskResult, taskErr)
	}()

	taskResult, taskErr = s.runTask(ctx, task)
}

func (s *Service) finishTask(
	ctx context.Context,
	task ScheduledTask,
	execution TaskExecution,
	startedAt time.Time,
	taskResult map[string]interface{},
	taskErr error,
) {
	finishedAt := time.Now().UTC()
	duration := finishedAt.Sub(startedAt).Seconds()
	status := TaskStatusCompleted
	progress := 100.0
	var errMsg *string

	if taskErr != nil {
		status = TaskStatusFailed
		progress = 0
		msg := taskErr.Error()
		errMsg = &msg
	}

	resultJSON := datatypes.JSON(nil)
	if taskResult != nil {
		if payload, err := json.Marshal(taskResult); err == nil {
			resultJSON = datatypes.JSON(payload)
		}
	}

	execUpdates := map[string]interface{}{
		"finished_at":   finishedAt,
		"status":        string(status),
		"duration":      duration,
		"result":        resultJSON,
		"error_message": errMsg,
	}
	_ = s.db.WithContext(ctx).Model(&TaskExecution{}).Where("id = ?", execution.ID).Updates(execUpdates).Error

	nextRun, err := s.nextRun(task.CronExpression, startedAt)
	var nextRunPtr *time.Time
	if err == nil {
		nextRunPtr = &nextRun
	}

	taskUpdates := map[string]interface{}{
		"status":        string(status),
		"progress":      progress,
		"next_run":      nextRunPtr,
		"updated_at":    finishedAt,
		"error_message": errMsg,
	}
	if status == TaskStatusCompleted {
		taskUpdates["success_count"] = gorm.Expr("success_count + 1")
		taskUpdates["error_message"] = nil
	} else {
		taskUpdates["failure_count"] = gorm.Expr("failure_count + 1")
	}

	_ = s.db.WithContext(ctx).Model(&ScheduledTask{}).Where("id = ?", task.ID).Updates(taskUpdates).Error
}

func (s *Service) runTask(ctx context.Context, task ScheduledTask) (map[string]interface{}, error) {
	switch strings.TrimSpace(task.TaskType) {
	case string(TaskTypeDeviceInspection):
		return s.executeDeviceInspection(ctx, task)
	case string(TaskTypeNetworkScan):
		return s.executeNetworkScan(ctx, task)
	case string(TaskTypeSystemHealth):
		return s.executeSystemHealthCheck(ctx, task)
	case string(TaskTypeDeviceBackup):
		return s.executeDeviceBackup(ctx, task)
	case string(TaskTypeDataCleanup):
		return s.executeDataCleanup(ctx, task)
	case string(TaskTypeReportGeneration):
		return s.executeReportGeneration(ctx, task)
	default:
		return nil, fmt.Errorf("unknown task type")
	}
}

func (s *Service) executeDeviceInspection(ctx context.Context, task ScheduledTask) (map[string]interface{}, error) {
	if s.deviceService == nil || s.probeService == nil {
		return nil, fmt.Errorf("device service not configured")
	}

	config := s.decodeConfig(task.Config)
	checkConnectivity := readBool(config, "check_connectivity", true)
	collectMetrics := readBool(config, "collect_metrics", true)

	if !checkConnectivity && !collectMetrics {
		return map[string]interface{}{
			"total_devices":     0,
			"inspected_count":   0,
			"online_count":      0,
			"offline_count":     0,
			"success_rate":      0.0,
			"metrics_collected": 0,
		}, nil
	}

	devicesList, err := s.deviceService.ListActiveDevices(ctx)
	if err != nil {
		return nil, err
	}

	total := len(devicesList)
	if total == 0 {
		return map[string]interface{}{
			"total_devices":     0,
			"inspected_count":   0,
			"online_count":      0,
			"offline_count":     0,
			"success_rate":      0.0,
			"metrics_collected": 0,
		}, nil
	}

	targets := make([]devices.ProbeTarget, 0, total)
	for _, item := range devicesList {
		targets = append(targets, devices.ProbeTarget{
			ID:            item.ID,
			IPAddress:     item.IPAddress,
			SnmpCommunity: item.SnmpCommunity,
			SnmpVersion:   item.SnmpVersion,
			SnmpPort:      item.SnmpPort,
			Tags:          item.Tags,
		})
	}

	onlineCount := 0
	offlineCount := 0
	inspectedCount := 0
	metricsCollected := 0

	// Step 1: Connectivity check
	if checkConnectivity {
		results := s.probeService.BatchProbeDevices(ctx, targets, s.currentMaxConcurrent(ctx))
		for _, result := range results {
			inspectedCount++
			if result.IcmpReachable {
				onlineCount++
			} else {
				offlineCount++
			}
			status, icmpStatus, snmpStatus := buildProbeStatuses(result)
			_ = s.deviceService.UpdateDeviceProbeStatus(
				ctx,
				result.DeviceID,
				status,
				icmpStatus,
				snmpStatus,
				result.IcmpResponseTime,
				conditionalLastSeen(result),
				&result.ProbedAt,
			)
		}
	}

	// Step 2: Collect detailed SNMP metrics (temperature, bandwidth, etc.)
	if collectMetrics && s.snmpCollector != nil && s.metricsWriter != nil {
		metricsCollected = s.collectDeviceMetrics(ctx, devicesList, task.ID, total)
	}

	// Step 3: Evaluate alert rules against collected metrics
	alertsCreated := 0
	alertsResolved := 0
	if s.alertEvaluator != nil {
		created, resolved, evalErr := s.alertEvaluator.EvaluateAll(ctx)
		if evalErr != nil {
			if s.logger != nil {
				s.logger.Warn("alert evaluation failed", zap.Error(evalErr))
			}
		} else {
			alertsCreated = created
			alertsResolved = resolved
		}
	}

	// Step 4: Collect alarm logs via SSH (trapbuffer + alarm active) and convert to alerts
	trapAlertsCreated := 0
	if s.logsService != nil && s.trapAlertBridge != nil {
		for _, device := range devicesList {
			// 只对有 SSH 凭据的设备采集告警日志
			if device.SshUsername == nil || strings.TrimSpace(*device.SshUsername) == "" {
				continue
			}
			if device.SshPassword == nil || strings.TrimSpace(*device.SshPassword) == "" {
				continue
			}

			// 采集 trapbuffer
			trapCount, trapErr := s.logsService.CollectDeviceLogs(ctx, device.ID, "trap", 200)
			if trapErr != nil {
				if s.logger != nil {
					s.logger.Debug("trap log collection failed",
						zap.Int("device_id", device.ID), zap.Error(trapErr))
				}
			} else if trapCount > 0 {
				if s.logger != nil {
					s.logger.Info("trap logs collected",
						zap.Int("device_id", device.ID), zap.Int("count", trapCount))
				}
			}

			// 采集 alarm active
			alarmCount, alarmErr := s.logsService.CollectDeviceLogs(ctx, device.ID, "alarm", 100)
			if alarmErr != nil {
				if s.logger != nil {
					s.logger.Debug("alarm log collection failed",
						zap.Int("device_id", device.ID), zap.Error(alarmErr))
				}
			} else if alarmCount > 0 {
				if s.logger != nil {
					s.logger.Info("alarm logs collected",
						zap.Int("device_id", device.ID), zap.Int("count", alarmCount))
				}
			}

			// 将采集到的 warning/critical 日志转换为告警
			created := s.convertLogsToAlerts(ctx, device.ID, device.IPAddress)
			trapAlertsCreated += created
		}
	}

	successRate := 0.0
	if total > 0 {
		successRate = float64(onlineCount) / float64(total) * 100
	}

	s.updateTaskProgress(ctx, task.ID, 100)

	return map[string]interface{}{
		"total_devices":       total,
		"inspected_count":     inspectedCount,
		"online_count":        onlineCount,
		"offline_count":       offlineCount,
		"success_rate":        successRate,
		"metrics_collected":   metricsCollected,
		"alerts_created":      alertsCreated + trapAlertsCreated,
		"alerts_resolved":     alertsResolved,
		"trap_alerts_created": trapAlertsCreated,
	}, nil
}

// currentMaxConcurrent 返回批量设备操作（探测/采集/备份）的并发上限。
// 动态读取"通用配置-最大并发任务数"（inspection.max_concurrent_tasks），
// 配置缺失/非法时回退内置默认，改配置无需重启即生效。
func (s *Service) currentMaxConcurrent(ctx context.Context) int {
	if s.settingsService == nil {
		return s.maxConcurrent
	}
	return s.settingsService.GetInspectionDefaults(ctx).MaxConcurrent
}

// collectDeviceMetrics collects detailed SNMP metrics from all devices
func (s *Service) collectDeviceMetrics(ctx context.Context, devicesList []devices.Device, taskID string, total int) int {
	if s.snmpCollector == nil || s.metricsWriter == nil {
		return 0
	}

	collected := 0
	limit := make(chan struct{}, s.currentMaxConcurrent(ctx))
	var wg sync.WaitGroup
	var mu sync.Mutex

	for idx, device := range devicesList {
		device := device
		idx := idx

		wg.Add(1)
		limit <- struct{}{}

		go func() {
			defer wg.Done()
			defer func() { <-limit }()

			// Skip devices without SNMP configuration
			if device.SnmpCommunity == nil || strings.TrimSpace(*device.SnmpCommunity) == "" {
				return
			}

			// Collect metrics via SNMP
			metrics, err := s.snmpCollector.CollectMetrics(
				ctx,
				device.IPAddress,
				device.Vendor,
				device.SnmpCommunity,
				device.SnmpVersion,
				device.SnmpPort,
				device.Tags,
			)
			if err != nil {
				if s.logger != nil {
					s.logger.Debug("SNMP metrics collection failed",
						zap.Int("device_id", device.ID),
						zap.String("ip", device.IPAddress),
						zap.Error(err))
				}
				return
			}

			writeReq := monitoring.BuildSNMPDeviceMetricsRequest(device.ID, metrics)

			if s.logger != nil {
				s.logger.Info("writing device metrics",
					zap.Int("device_id", device.ID),
					zap.Int("metrics_count", len(writeReq.Metrics)),
					zap.Int("interfaces_count", len(writeReq.Interfaces)))
			}

			result, err := s.metricsWriter.WriteDeviceMetrics(ctx, writeReq)
			if err != nil {
				if err == monitoring.ErrNoMetrics {
					if s.logger != nil {
						s.logger.Warn("no metrics to write",
							zap.Int("device_id", device.ID),
							zap.Int("metrics_count", len(writeReq.Metrics)),
							zap.Int("interfaces_count", len(writeReq.Interfaces)))
					}
				} else {
					if s.logger != nil {
						s.logger.Warn("failed to write device metrics",
							zap.Int("device_id", device.ID),
							zap.Error(err))
					}
				}
				return
			}

			mu.Lock()
			collected++
			mu.Unlock()

			if s.logger != nil {
				s.logger.Info("device metrics written successfully",
					zap.Int("device_id", device.ID),
					zap.Int("device_metrics", result.DeviceMetrics),
					zap.Int("interface_metrics", result.InterfaceMetrics),
					zap.Bool("has_cpu", metrics.CPUUsage != nil),
					zap.Bool("has_memory", metrics.MemoryUsage != nil),
					zap.Bool("has_temp", metrics.Temperature != nil),
					zap.Int("interfaces", len(metrics.Interfaces)))
			}
		}()

		// Update progress
		if total > 0 {
			progress := float64(idx+1)/float64(total)*50 + 50 // 50-100% for metrics collection
			s.updateTaskProgress(ctx, taskID, progress)
		}
	}

	wg.Wait()
	return collected
}

// convertLogsToAlerts queries recent warning/critical logs for a device and creates alerts
func (s *Service) convertLogsToAlerts(ctx context.Context, deviceID int, ipAddress string) int {
	if s.trapAlertBridge == nil || s.db == nil {
		return 0
	}

	type logRow struct {
		Level    string `gorm:"column:level"`
		Facility string `gorm:"column:facility"`
		Message  string `gorm:"column:message"`
		Source   string `gorm:"column:source"`
	}

	var recentLogs []logRow
	err := s.db.WithContext(ctx).
		Table("device_logs").
		Select("level, facility, message, source").
		Where("device_id = ? AND level IN ? AND collected_at >= NOW() - INTERVAL '10 minutes'",
			deviceID, []string{"critical", "error", "warning"}).
		Order("collected_at DESC").
		Limit(50).
		Find(&recentLogs).Error
	if err != nil || len(recentLogs) == 0 {
		return 0
	}

	created := 0
	for _, log := range recentLogs {
		alertErr := s.trapAlertBridge.CreateTrapAlert(
			ctx, deviceID, log.Level, log.Facility, log.Message, "", ipAddress,
		)
		if alertErr == nil {
			created++
		}
	}

	return created
}

func (s *Service) executeNetworkScan(ctx context.Context, task ScheduledTask) (map[string]interface{}, error) {
	if s.scanner == nil {
		return nil, fmt.Errorf("scanner not configured")
	}

	config := s.decodeConfig(task.Config)
	networks := readStringSlice(config, "networks")
	if len(networks) == 0 {
		if value, ok := config["target_network"].(string); ok && strings.TrimSpace(value) != "" {
			networks = []string{strings.TrimSpace(value)}
		}
	}
	if len(networks) == 0 {
		return nil, fmt.Errorf("networks is required")
	}

	scanType := readString(config, "scan_type", "ping")
	portScan := readBool(config, "port_scan", false)
	snmpScan := readBool(config, "snmp_scan", false)
	deepScan := readBool(config, "deep_scan", false)

	scanIDs := make([]string, 0, len(networks))
	for idx, network := range networks {
		req := devices.NetworkScanRequest{
			TargetNetwork: network,
			ScanType:      scanType,
			PortScan:      portScan,
			SnmpScan:      snmpScan,
			DeepScan:      deepScan,
		}
		scanID, err := s.scanner.StartScan(ctx, req, nil)
		if err != nil {
			return nil, err
		}
		scanIDs = append(scanIDs, scanID)
		progress := float64(idx+1) / float64(len(networks)) * 100
		s.updateTaskProgress(ctx, task.ID, progress)
	}

	return map[string]interface{}{
		"scan_count": len(scanIDs),
		"scan_ids":   scanIDs,
		"networks":   networks,
		"scan_type":  scanType,
	}, nil
}

func (s *Service) executeSystemHealthCheck(ctx context.Context, task ScheduledTask) (map[string]interface{}, error) {
	config := s.decodeConfig(task.Config)
	healthStatus := map[string]interface{}{}

	if readBool(config, "check_database", true) {
		var marker int
		if err := s.db.WithContext(ctx).Raw("SELECT 1").Scan(&marker).Error; err != nil {
			healthStatus["database"] = fmt.Sprintf("error: %s", err.Error())
		} else {
			healthStatus["database"] = "healthy"
		}
	}

	if readBool(config, "check_redis", true) {
		if s.redis == nil {
			healthStatus["redis"] = "not_configured"
		} else if err := s.redis.Ping(ctx).Err(); err != nil {
			healthStatus["redis"] = fmt.Sprintf("error: %s", err.Error())
		} else {
			healthStatus["redis"] = "healthy"
		}
	}

	if readBoolWithFallback(config, true, "check_disk_space", "checkDiskSpace") {
		path := defaultDiskPath()
		usage, err := disk.Usage(path)
		if err != nil {
			healthStatus["disk_space"] = fmt.Sprintf("error: %s", err.Error())
		} else {
			freeGB := float64(usage.Free) / 1024 / 1024 / 1024
			status := "healthy"
			if freeGB <= 10 {
				status = "low"
			}
			healthStatus["disk_space"] = map[string]interface{}{
				"free_gb": roundFloat(freeGB, 2),
				"status":  status,
			}
		}
	}

	unhealthy := make([]string, 0)
	for key, value := range healthStatus {
		if isUnhealthyValue(value) {
			unhealthy = append(unhealthy, key)
		}
	}

	overall := "healthy"
	if len(unhealthy) > 0 {
		overall = "warning"
	}

	s.updateTaskProgress(ctx, task.ID, 100)

	return map[string]interface{}{
		"health_status":        healthStatus,
		"overall_status":       overall,
		"unhealthy_components": unhealthy,
	}, nil
}

func (s *Service) executeDeviceBackup(ctx context.Context, task ScheduledTask) (map[string]interface{}, error) {
	if s.deviceService == nil {
		return nil, fmt.Errorf("device service not configured")
	}
	if s.settingsService == nil {
		return nil, fmt.Errorf("settings service not configured")
	}

	config := s.decodeConfig(task.Config)
	backupCfg, _ := s.settingsService.GetBackupConfig(ctx)

	backupPath := readStringWithFallback(config, "", "backup_path", "backupPath")
	retentionDays := readIntWithFallback(config, 0, "retention_days", "retentionDays")
	if strings.TrimSpace(backupPath) == "" {
		backupPath = backupCfg.BackupPath
	}
	if retentionDays == 0 {
		retentionDays = backupCfg.RetentionDays
	}
	if strings.TrimSpace(backupPath) == "" {
		backupPath = filepath.ToSlash(filepath.Clean("data/backups"))
	}
	if retentionDays < 0 {
		retentionDays = 0
	}

	timeoutSeconds := readIntWithFallback(config, 60, "timeout_seconds", "timeoutSeconds")
	if timeoutSeconds <= 0 {
		timeoutSeconds = 60
	}
	timeout := time.Duration(timeoutSeconds) * time.Second

	deviceIDs := readIntSliceWithFallback(config, "device_ids", "deviceIds")
	var devicesList []devices.Device
	var err error
	if len(deviceIDs) > 0 {
		devicesList, err = s.deviceService.GetDevicesByIDs(ctx, deviceIDs)
	} else {
		devicesList, err = s.deviceService.ListActiveDevices(ctx)
	}
	if err != nil {
		return nil, err
	}

	targets := make([]deviceBackupTarget, 0, len(devicesList))
	for _, device := range devicesList {
		if strings.TrimSpace(device.IPAddress) == "" {
			continue
		}

		protocol := "ssh"
		if device.CliProtocol != nil && strings.TrimSpace(*device.CliProtocol) != "" {
			protocol = strings.ToLower(strings.TrimSpace(*device.CliProtocol))
		}

		if protocol == "telnet" {
			// Telnet 设备需要用户名和密码
			if device.TelnetUsername == nil || strings.TrimSpace(*device.TelnetUsername) == "" {
				continue
			}
			if device.TelnetPassword == nil || strings.TrimSpace(*device.TelnetPassword) == "" {
				continue
			}
			port := 23
			if device.TelnetPort != nil && *device.TelnetPort > 0 {
				port = *device.TelnetPort
			}
			enablePwd := ""
			if device.EnablePassword != nil {
				enablePwd = *device.EnablePassword
			}
			targets = append(targets, deviceBackupTarget{
				ID:             device.ID,
				Name:           device.Name,
				IPAddress:      device.IPAddress,
				Vendor:         device.Vendor,
				DeviceType:     device.DeviceType,
				CliProtocol:    "telnet",
				TelnetUsername: *device.TelnetUsername,
				TelnetPassword: *device.TelnetPassword,
				TelnetPort:     port,
				EnablePassword: enablePwd,
			})
		} else {
			// SSH 设备（默认）：密码与私钥任一配置即可发起认证（密钥认证设备允许密码为空）
			if device.SshUsername == nil || strings.TrimSpace(*device.SshUsername) == "" {
				continue
			}
			sshPassword := ""
			if device.SshPassword != nil {
				sshPassword = *device.SshPassword
			}
			privateKey, keyPassphrase := device.SSHKeyCredentials()
			if strings.TrimSpace(sshPassword) == "" && strings.TrimSpace(privateKey) == "" {
				continue
			}
			port := 22
			if device.SshPort != nil && *device.SshPort > 0 {
				port = *device.SshPort
			}
			targets = append(targets, deviceBackupTarget{
				ID:               device.ID,
				Name:             device.Name,
				IPAddress:        device.IPAddress,
				Vendor:           device.Vendor,
				DeviceType:       device.DeviceType,
				CliProtocol:      "ssh",
				SshUsername:      *device.SshUsername,
				SshPassword:      sshPassword,
				SshPrivateKey:    privateKey,
				SshKeyPassphrase: keyPassphrase,
				SshPort:          port,
			})
		}
	}

	backupRoot := filepath.Join(backupPath, "device_configs")
	backupDir := filepath.Join(backupRoot, time.Now().UTC().Format("20060102_150405"))
	if err := os.MkdirAll(backupDir, 0o755); err != nil {
		return nil, err
	}

	if len(targets) == 0 {
		s.updateTaskProgress(ctx, task.ID, 100)
		return map[string]interface{}{
			"total_devices":     len(devicesList),
			"eligible_devices":  0,
			"backed_up_devices": 0,
			"failed_devices":    0,
			"backup_location":   backupDir,
			"backup_size_mb":    0,
			"manifest_path":     "",
			"retention_days":    retentionDays,
		}, nil
	}

	items, stats, err := s.performDeviceBackups(ctx, task.ID, targets, backupDir, timeout)
	if err != nil {
		return nil, err
	}

	manifest := deviceBackupManifest{
		GeneratedAt:     time.Now().UTC().Format(time.RFC3339),
		RetentionDays:   retentionDays,
		TotalDevices:    len(devicesList),
		EligibleDevices: len(targets),
		BackedUpDevices: stats.Success,
		FailedDevices:   stats.Failed,
		BackupDir:       backupDir,
		Items:           items,
	}
	manifestPath, manifestErr := writeDeviceBackupManifest(backupDir, manifest)
	if manifestErr != nil && s.logger != nil {
		s.logger.Warn("write device backup manifest failed", zap.Error(manifestErr))
	}

	purged := 0
	if retentionDays > 0 {
		if deleted, cleanupErr := cleanupOldDeviceBackups(backupRoot, retentionDays); cleanupErr == nil {
			purged = deleted
		} else if s.logger != nil {
			s.logger.Warn("cleanup old device backups failed", zap.Error(cleanupErr))
		}
	}

	failedItems := extractFailedDeviceBackups(items)
	backupSizeMB := roundFloat(float64(stats.TotalSize)/(1024*1024), 2)

	s.updateTaskProgress(ctx, task.ID, 100)

	return map[string]interface{}{
		"total_devices":     len(devicesList),
		"eligible_devices":  len(targets),
		"backed_up_devices": stats.Success,
		"failed_devices":    stats.Failed,
		"backup_location":   backupDir,
		"backup_size_mb":    backupSizeMB,
		"backup_size_bytes": stats.TotalSize,
		"manifest_path":     manifestPath,
		"retention_days":    retentionDays,
		"purged_folders":    purged,
		"failed_items":      failedItems,
	}, nil
}

func (s *Service) executeDataCleanup(ctx context.Context, task ScheduledTask) (map[string]interface{}, error) {
	config := s.decodeConfig(task.Config)
	retentionDays := readIntWithFallback(config, 90, "retention_days", "retentionDays")
	if retentionDays <= 0 {
		retentionDays = 90
	}

	cleanupLogs := readBoolWithFallback(config, true, "cleanup_logs", "cleanupLogs", "cleanup_audit_logs")
	cleanupMetrics := readBoolWithFallback(config, true, "cleanup_old_metrics", "cleanupOldMetrics", "cleanup_metrics")

	results := map[string]interface{}{}
	now := time.Now().UTC()
	metricsCutoff := now.AddDate(0, 0, -retentionDays)

	logRetentionDays := retentionDays
	logAutoCleanupEnabled := true
	if s.settingsService != nil {
		if item, err := s.settingsService.GetSetting(ctx, "logs.retention_days"); err == nil && item != nil {
			switch v := item.Value.(type) {
			case int:
				logRetentionDays = v
			case int64:
				logRetentionDays = int(v)
			case float64:
				logRetentionDays = int(v)
			case string:
				if parsed, convErr := strconv.Atoi(strings.TrimSpace(v)); convErr == nil {
					logRetentionDays = parsed
				}
			}
		}
		if item, err := s.settingsService.GetSetting(ctx, "logs.auto_cleanup_enabled"); err == nil && item != nil {
			if v, ok := item.Value.(bool); ok {
				logAutoCleanupEnabled = v
			}
		}
	}
	if logRetentionDays <= 0 {
		logRetentionDays = retentionDays
	}
	if logRetentionDays <= 0 {
		logRetentionDays = 90
	}
	if logRetentionDays > 3650 {
		logRetentionDays = 3650
	}
	logCutoff := now.AddDate(0, 0, -logRetentionDays)

	if cleanupLogs && logAutoCleanupEnabled {
		if s.settingsService == nil {
			return nil, fmt.Errorf("settings service not configured")
		}
		deleted, err := s.settingsService.CleanupAuditLogs(ctx, logCutoff)
		if err != nil {
			return nil, err
		}
		results["audit_logs_deleted"] = deleted

		deviceLogsDeleted, err := s.cleanupDeviceLogs(ctx, logCutoff)
		if err != nil {
			return nil, err
		}
		results["device_logs_deleted"] = deviceLogsDeleted
	}

	if cleanupMetrics {
		if s.trafficService != nil {
			olderThanHours := retentionDays * 24
			deleted, err := s.trafficService.CleanupData(ctx, olderThanHours)
			if err != nil {
				return nil, err
			}
			results["interface_metrics_deleted"] = deleted
		}

		tableResults, err := s.cleanupMetricsTables(ctx, metricsCutoff)
		if err != nil {
			return nil, err
		}
		for key, value := range tableResults {
			results[key] = value
		}
	}

	s.updateTaskProgress(ctx, task.ID, 100)

	return map[string]interface{}{
		"retention_days":            retentionDays,
		"logs_retention_days":       logRetentionDays,
		"logs_auto_cleanup_enabled": logAutoCleanupEnabled,
		"cleanup_results":           results,
	}, nil
}

func (s *Service) executeReportGeneration(ctx context.Context, task ScheduledTask) (map[string]interface{}, error) {
	if s.reportService == nil {
		return nil, fmt.Errorf("report service not configured")
	}
	if strings.TrimSpace(s.reportOutputDir) == "" {
		return nil, fmt.Errorf("report output not configured")
	}

	config := s.decodeConfig(task.Config)
	scheduleIDs := readIntSliceWithFallback(config, "schedule_ids", "scheduleIds")

	query := s.reportService.DB().WithContext(ctx).Model(&reports.ReportSchedule{})
	if len(scheduleIDs) > 0 {
		query = query.Where("id IN ?", scheduleIDs)
	} else {
		query = query.Where("is_active = ?", true)
	}

	var schedules []reports.ReportSchedule
	if err := query.Find(&schedules).Error; err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	due := make([]reports.ReportSchedule, 0, len(schedules))

	for _, schedule := range schedules {
		if !schedule.IsActive {
			continue
		}

		if schedule.NextRun == nil {
			from := now
			if schedule.LastRun != nil && !schedule.LastRun.IsZero() {
				from = *schedule.LastRun
			}
			next, err := nextScheduleRun(schedule.CronExpression, from)
			if err != nil {
				continue
			}
			if next.After(now) {
				_ = s.reportService.DB().WithContext(ctx).
					Model(&reports.ReportSchedule{}).
					Where("id = ?", schedule.ID).
					Updates(map[string]interface{}{
						"next_run":   next,
						"updated_at": now,
					}).Error
				continue
			}
		} else if schedule.NextRun.After(now) {
			continue
		}

		due = append(due, schedule)
	}

	results := make([]map[string]interface{}, 0, len(due))
	failedCount := 0

	for idx, schedule := range due {
		item, err := s.generateReportForSchedule(ctx, schedule)
		if err != nil {
			failedCount++
			item["error"] = err.Error()
		}
		results = append(results, item)

		progress := float64(idx+1) / float64(len(due)) * 100
		s.updateTaskProgress(ctx, task.ID, progress)
	}

	if len(due) == 0 {
		s.updateTaskProgress(ctx, task.ID, 100)
	}

	return map[string]interface{}{
		"total_schedules":   len(schedules),
		"due_schedules":     len(due),
		"generated_count":   len(due) - failedCount,
		"failed_count":      failedCount,
		"generated_reports": results,
	}, nil
}

func (s *Service) updateTaskProgress(ctx context.Context, taskID string, progress float64) {
	if s == nil || s.db == nil {
		return
	}
	if progress < 0 {
		progress = 0
	}
	if progress > 100 {
		progress = 100
	}
	_ = s.db.WithContext(ctx).
		Model(&ScheduledTask{}).
		Where("id = ?", taskID).
		Updates(map[string]interface{}{
			"progress":   progress,
			"updated_at": time.Now().UTC(),
		}).Error
}

func (s *Service) nextRun(expression string, from time.Time) (time.Time, error) {
	if s == nil {
		return time.Time{}, fmt.Errorf("scheduler service not configured")
	}
	schedule, err := s.parser.Parse(expression)
	if err != nil {
		return time.Time{}, err
	}
	return schedule.Next(from), nil
}

type defaultTaskSeed struct {
	ID             string
	Name           string
	TaskType       TaskType
	CronExpression string
	Enabled        bool
	Config         map[string]interface{}
}

func (s *Service) ensureDefaultTasks(ctx context.Context) error {
	if s == nil || s.db == nil {
		return fmt.Errorf("database not initialized")
	}

	seeds := []defaultTaskSeed{
		{
			ID:             "daily_device_inspection",
			Name:           "每日设备巡检",
			TaskType:       TaskTypeDeviceInspection,
			CronExpression: "0 2 * * *",
			Enabled:        true,
			Config: map[string]interface{}{
				"check_connectivity": true,
				"collect_metrics":    true,
				"generate_report":    true,
			},
		},
		{
			ID:             "metrics_collection_5min",
			Name:           "设备指标采集(3分钟)",
			TaskType:       TaskTypeDeviceInspection,
			CronExpression: "*/3 * * * *",
			Enabled:        true,
			Config: map[string]interface{}{
				"check_connectivity": true,
				"collect_metrics":    true,
				"generate_report":    false,
			},
		},
		{
			ID:             "hourly_network_scan",
			Name:           "每小时网络扫描",
			TaskType:       TaskTypeNetworkScan,
			CronExpression: "0 * * * *",
			Enabled:        false,
			Config: map[string]interface{}{
				"networks":  []string{"192.168.1.0/24"},
				"scan_type": "ping",
			},
		},
		{
			ID:             "weekly_system_health",
			Name:           "每周系统健康检查",
			TaskType:       TaskTypeSystemHealth,
			CronExpression: "0 6 * * 0",
			Enabled:        true,
			Config: map[string]interface{}{
				"check_database":   true,
				"check_redis":      true,
				"check_disk_space": true,
			},
		},
		{
			ID:             "monthly_data_cleanup",
			Name:           "每月数据清理",
			TaskType:       TaskTypeDataCleanup,
			CronExpression: "0 1 1 * *",
			Enabled:        true,
			Config: map[string]interface{}{
				"cleanup_logs":        true,
				"cleanup_old_metrics": true,
				"retention_days":      90,
			},
		},
	}

	ids := make([]string, 0, len(seeds))
	names := make([]string, 0, len(seeds))
	for _, seed := range seeds {
		ids = append(ids, seed.ID)
		names = append(names, seed.Name)
	}

	existing := make([]ScheduledTask, 0)
	if err := s.db.WithContext(ctx).
		Where("id IN ? OR name IN ?", ids, names).
		Find(&existing).Error; err != nil {
		return err
	}

	existingIDs := make(map[string]struct{}, len(existing))
	existingNames := make(map[string]struct{}, len(existing))
	for _, item := range existing {
		existingIDs[item.ID] = struct{}{}
		if strings.TrimSpace(item.Name) != "" {
			existingNames[item.Name] = struct{}{}
		}
	}

	now := time.Now().UTC()
	for _, seed := range seeds {
		if _, ok := existingIDs[seed.ID]; ok {
			// 特殊处理：更新 metrics_collection_5min 任务的 cron 表达式
			if seed.ID == "metrics_collection_5min" {
				if err := s.updateMetricsCollectionTask(ctx, seed, now); err != nil {
					if s.logger != nil {
						s.logger.Warn("update metrics collection task failed", zap.Error(err))
					}
				}
			}
			if seed.ID == "hourly_network_scan" {
				if err := s.disableNetworkScanTask(ctx, now); err != nil {
					return err
				}
			}
			continue
		}
		if _, ok := existingNames[seed.Name]; ok {
			if seed.ID == "hourly_network_scan" {
				if err := s.disableNetworkScanTask(ctx, now); err != nil {
					return err
				}
			}
			continue
		}

		config := seed.Config
		if config == nil {
			config = map[string]interface{}{}
		}
		configJSON, err := encodeJSON(config)
		if err != nil {
			configJSON = datatypes.JSON([]byte("{}"))
		}

		nextRun, err := s.nextRun(seed.CronExpression, now)
		if err != nil {
			nextRun = now.Add(time.Hour)
		}

		task := ScheduledTask{
			ID:             seed.ID,
			Name:           seed.Name,
			TaskType:       string(seed.TaskType),
			CronExpression: seed.CronExpression,
			Enabled:        seed.Enabled,
			Status:         string(TaskStatusPending),
			Progress:       0,
			LastRun:        nil,
			NextRun:        &nextRun,
			RunCount:       0,
			SuccessCount:   0,
			FailureCount:   0,
			ErrorMessage:   nil,
			Config:         configJSON,
			CreatedAt:      &now,
			UpdatedAt:      &now,
		}

		if err := s.db.WithContext(ctx).Create(&task).Error; err != nil {
			return err
		}
	}

	return nil
}

func (s *Service) disableNetworkScanTask(ctx context.Context, now time.Time) error {
	updates := map[string]interface{}{
		"enabled":    false,
		"updated_at": now,
	}
	return s.db.WithContext(ctx).
		Model(&ScheduledTask{}).
		Where("id = ? OR name = ?", "hourly_network_scan", "每小时网络扫描").
		Updates(updates).Error
}

func (s *Service) updateMetricsCollectionTask(ctx context.Context, seed defaultTaskSeed, now time.Time) error {
	// 更新指标采集任务的 cron 表达式和名称
	nextRun, err := s.nextRun(seed.CronExpression, now)
	if err != nil {
		nextRun = now.Add(3 * time.Minute)
	}

	// 同步 config（如 check_connectivity 开关）；原实现只更 cron/name，
	// 导致已存在任务的 config 永不更新——离线/恢复探测无法对存量库生效。
	configJSON, encErr := encodeJSON(seed.Config)
	if encErr != nil {
		configJSON = datatypes.JSON([]byte("{}"))
	}
	updates := map[string]interface{}{
		"name":            seed.Name,
		"cron_expression": seed.CronExpression,
		"config":          configJSON,
		"next_run":        nextRun,
		"updated_at":      now,
	}

	return s.db.WithContext(ctx).
		Model(&ScheduledTask{}).
		Where("id = ?", seed.ID).
		Updates(updates).Error
}

func (s *Service) decodeConfig(raw datatypes.JSON) map[string]interface{} {
	if len(raw) == 0 {
		return map[string]interface{}{}
	}
	var cfg map[string]interface{}
	if err := json.Unmarshal(raw, &cfg); err != nil {
		return map[string]interface{}{}
	}
	return cfg
}

func isValidTaskType(taskType string) bool {
	switch strings.TrimSpace(taskType) {
	case string(TaskTypeDeviceInspection),
		string(TaskTypeNetworkScan),
		string(TaskTypeDeviceBackup),
		string(TaskTypeSystemHealth),
		string(TaskTypeDataCleanup),
		string(TaskTypeReportGeneration):
		return true
	default:
		return false
	}
}

func isExecutableTaskType(taskType string) bool {
	switch strings.TrimSpace(taskType) {
	case string(TaskTypeDeviceInspection),
		string(TaskTypeNetworkScan),
		string(TaskTypeSystemHealth),
		string(TaskTypeDeviceBackup),
		string(TaskTypeDataCleanup),
		string(TaskTypeReportGeneration):
		return true
	default:
		return false
	}
}

func readBool(config map[string]interface{}, key string, fallback bool) bool {
	value, ok := config[key]
	if !ok {
		return fallback
	}
	if flag, ok := value.(bool); ok {
		return flag
	}
	return fallback
}

func readString(config map[string]interface{}, key string, fallback string) string {
	value, ok := config[key]
	if !ok {
		return fallback
	}
	if text, ok := value.(string); ok && strings.TrimSpace(text) != "" {
		return strings.TrimSpace(text)
	}
	return fallback
}

func readStringSlice(config map[string]interface{}, key string) []string {
	value, ok := config[key]
	if !ok {
		return []string{}
	}
	rawList, ok := value.([]interface{})
	if !ok {
		return []string{}
	}
	result := make([]string, 0, len(rawList))
	for _, item := range rawList {
		if text, ok := item.(string); ok {
			text = strings.TrimSpace(text)
			if text != "" {
				result = append(result, text)
			}
		}
	}
	return result
}

func readBoolWithFallback(config map[string]interface{}, fallback bool, keys ...string) bool {
	for _, key := range keys {
		value, ok := config[key]
		if !ok {
			continue
		}
		if flag, ok := value.(bool); ok {
			return flag
		}
		if text, ok := value.(string); ok {
			if parsed, err := strconv.ParseBool(strings.TrimSpace(text)); err == nil {
				return parsed
			}
		}
		if number, ok := value.(float64); ok {
			return number != 0
		}
		if number, ok := value.(int); ok {
			return number != 0
		}
		if number, ok := value.(int64); ok {
			return number != 0
		}
	}
	return fallback
}

func readStringWithFallback(config map[string]interface{}, fallback string, keys ...string) string {
	for _, key := range keys {
		value, ok := config[key]
		if !ok {
			continue
		}
		if text, ok := value.(string); ok && strings.TrimSpace(text) != "" {
			return strings.TrimSpace(text)
		}
	}
	return fallback
}

func readIntWithFallback(config map[string]interface{}, fallback int, keys ...string) int {
	for _, key := range keys {
		value, ok := config[key]
		if !ok {
			continue
		}
		switch v := value.(type) {
		case int:
			return v
		case int64:
			return int(v)
		case float64:
			return int(v)
		case string:
			if parsed, err := strconv.Atoi(strings.TrimSpace(v)); err == nil {
				return parsed
			}
		}
	}
	return fallback
}

func readIntSliceWithFallback(config map[string]interface{}, keys ...string) []int {
	for _, key := range keys {
		value, ok := config[key]
		if !ok {
			continue
		}
		rawList, ok := value.([]interface{})
		if !ok {
			continue
		}
		result := make([]int, 0, len(rawList))
		for _, item := range rawList {
			switch v := item.(type) {
			case float64:
				result = append(result, int(v))
			case int:
				result = append(result, v)
			case int64:
				result = append(result, int(v))
			case string:
				if parsed, err := strconv.Atoi(strings.TrimSpace(v)); err == nil {
					result = append(result, parsed)
				}
			}
		}
		if len(result) > 0 {
			return result
		}
	}
	return []int{}
}

func roundFloat(value float64, precision int) float64 {
	if precision < 0 {
		return value
	}
	pow := math.Pow(10, float64(precision))
	return math.Round(value*pow) / pow
}

func nextScheduleRun(expression string, from time.Time) (time.Time, error) {
	parts := strings.Fields(expression)
	if len(parts) == 6 {
		parser := cron.NewParser(cron.Second | cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow)
		schedule, err := parser.Parse(expression)
		if err != nil {
			return time.Time{}, err
		}
		return schedule.Next(from), nil
	}
	if len(parts) == 5 {
		parser := cron.NewParser(cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow)
		schedule, err := parser.Parse(expression)
		if err != nil {
			return time.Time{}, err
		}
		return schedule.Next(from), nil
	}
	return time.Time{}, fmt.Errorf("invalid cron expression")
}

func (s *Service) generateReportForSchedule(ctx context.Context, schedule reports.ReportSchedule) (map[string]interface{}, error) {
	if s.reportService == nil {
		return nil, fmt.Errorf("report service not configured")
	}

	template, err := s.reportService.GetTemplate(ctx, schedule.TemplateID)
	if err != nil {
		_ = s.updateScheduleRun(ctx, schedule.ID, schedule.CronExpression, time.Now().UTC(), false)
		return map[string]interface{}{
			"schedule_id": schedule.ID,
			"status":      "failed",
		}, err
	}

	params := decodeJSONMap(schedule.DeviceFilters)
	for key, value := range decodeJSONMap(schedule.DataRange) {
		params[key] = value
	}
	if len(params) == 0 {
		params = map[string]interface{}{}
	}

	start, end := resolveReportDateRange(params)
	formats := decodeJSONStringSlice(schedule.OutputFormats)
	if len(formats) == 0 {
		formats = []string{"pdf"}
	}
	normalizedFormats := normalizeFormats(formats)

	filtersJSON, err := encodeJSON(params)
	if err != nil {
		_ = s.updateScheduleRun(ctx, schedule.ID, schedule.CronExpression, time.Now().UTC(), false)
		return map[string]interface{}{
			"schedule_id": schedule.ID,
			"status":      "failed",
		}, err
	}
	formatsJSON, err := encodeJSON(normalizedFormats)
	if err != nil {
		_ = s.updateScheduleRun(ctx, schedule.ID, schedule.CronExpression, time.Now().UTC(), false)
		return map[string]interface{}{
			"schedule_id": schedule.ID,
			"status":      "failed",
		}, err
	}

	var report reports.Report
	startedAt := time.Now().UTC()

	pendingReport, err := s.loadPendingReport(ctx, schedule.ID)
	if err != nil {
		_ = s.updateScheduleRun(ctx, schedule.ID, schedule.CronExpression, startedAt, false)
		return map[string]interface{}{
			"schedule_id": schedule.ID,
			"status":      "failed",
		}, err
	}

	if pendingReport != nil {
		updates := map[string]interface{}{
			"title":          schedule.Name,
			"description":    schedule.Description,
			"report_type":    template.ReportType,
			"start_date":     start,
			"end_date":       end,
			"device_filters": filtersJSON,
			"status":         "generating",
			"file_formats":   formatsJSON,
			"file_paths":     datatypes.JSON([]byte("{}")),
			"file_sizes":     datatypes.JSON([]byte("{}")),
			"error_message":  nil,
			"error_details":  datatypes.JSON([]byte("{}")),
			"updated_at":     time.Now().UTC(),
		}
		if pendingReport.TemplateID == nil || *pendingReport.TemplateID != template.ID {
			updates["template_id"] = template.ID
		}
		if schedule.CreatedBy != nil && strings.TrimSpace(*schedule.CreatedBy) != "" {
			updates["generated_by"] = schedule.CreatedBy
		}
		updated, updateErr := s.reportService.UpdateReport(ctx, pendingReport.ID, updates)
		if updateErr != nil {
			_ = s.updateScheduleRun(ctx, schedule.ID, schedule.CronExpression, startedAt, false)
			return map[string]interface{}{
				"schedule_id": schedule.ID,
				"status":      "failed",
			}, updateErr
		}
		report = updated
	} else {
		report = reports.Report{
			TemplateID:    &template.ID,
			ScheduleID:    &schedule.ID,
			Title:         schedule.Name,
			Description:   schedule.Description,
			ReportType:    template.ReportType,
			StartDate:     start,
			EndDate:       end,
			DeviceFilters: filtersJSON,
			Status:        "generating",
			FileFormats:   formatsJSON,
			FilePaths:     datatypes.JSON([]byte("{}")),
			FileSizes:     datatypes.JSON([]byte("{}")),
		}
		if schedule.CreatedBy != nil && strings.TrimSpace(*schedule.CreatedBy) != "" {
			report.GeneratedBy = schedule.CreatedBy
		}

		if err := s.reportService.CreateReport(ctx, &report); err != nil {
			_ = s.updateScheduleRun(ctx, schedule.ID, schedule.CronExpression, startedAt, false)
			return map[string]interface{}{
				"schedule_id": schedule.ID,
				"status":      "failed",
			}, err
		}
	}

	filePaths := map[string]string{}
	fileSizes := map[string]int64{}

	for _, format := range normalizedFormats {
		path, genErr := reports.GenerateReportFile(ctx, s.reportService.DB(), s.reportOutputDir, report, format)
		if genErr != nil {
			_, _ = s.reportService.UpdateReport(ctx, report.ID, map[string]interface{}{
				"status":        "failed",
				"error_message": genErr.Error(),
			})
			_ = s.updateScheduleRun(ctx, schedule.ID, schedule.CronExpression, startedAt, false)
			_ = s.ensurePendingReport(ctx, schedule, template, params, start, end, formatsJSON)
			return map[string]interface{}{
				"schedule_id": schedule.ID,
				"report_id":   report.ID,
				"status":      "failed",
			}, genErr
		}

		filePaths[format] = path
		if info, statErr := os.Stat(path); statErr == nil {
			fileSizes[format] = info.Size()
		}
	}

	pathsJSON, _ := encodeJSON(filePaths)
	sizesJSON, _ := encodeJSON(fileSizes)

	updates := map[string]interface{}{
		"status":       "completed",
		"generated_at": time.Now().UTC(),
		"file_paths":   pathsJSON,
		"file_sizes":   sizesJSON,
	}
	if _, updateErr := s.reportService.UpdateReport(ctx, report.ID, updates); updateErr != nil {
		_ = s.updateScheduleRun(ctx, schedule.ID, schedule.CronExpression, startedAt, false)
		_ = s.ensurePendingReport(ctx, schedule, template, params, start, end, formatsJSON)
		return map[string]interface{}{
			"schedule_id": schedule.ID,
			"report_id":   report.ID,
			"status":      "failed",
		}, updateErr
	}

	_ = s.updateScheduleRun(ctx, schedule.ID, schedule.CronExpression, startedAt, true)
	_ = s.ensurePendingReport(ctx, schedule, template, params, start, end, formatsJSON)

	return map[string]interface{}{
		"schedule_id": schedule.ID,
		"report_id":   report.ID,
		"status":      "completed",
		"formats":     normalizedFormats,
		"file_paths":  filePaths,
		"file_sizes":  fileSizes,
	}, nil
}

func (s *Service) updateScheduleRun(ctx context.Context, scheduleID int, cronExpression string, startedAt time.Time, success bool) error {
	now := time.Now().UTC()
	nextRun, err := nextScheduleRun(strings.TrimSpace(cronExpression), now)
	if err != nil {
		nextRun = time.Time{}
	}

	updates := map[string]interface{}{
		"last_run":   startedAt,
		"updated_at": now,
		"total_runs": gorm.Expr("total_runs + 1"),
	}
	if !nextRun.IsZero() {
		updates["next_run"] = nextRun
	}

	if success {
		updates["successful_runs"] = gorm.Expr("successful_runs + 1")
	} else {
		updates["failed_runs"] = gorm.Expr("failed_runs + 1")
	}

	return s.reportService.DB().WithContext(ctx).
		Model(&reports.ReportSchedule{}).
		Where("id = ?", scheduleID).
		Updates(updates).Error
}

func decodeJSONMap(raw datatypes.JSON) map[string]interface{} {
	if len(raw) == 0 {
		return map[string]interface{}{}
	}
	var result map[string]interface{}
	if err := json.Unmarshal(raw, &result); err != nil {
		return map[string]interface{}{}
	}
	if result == nil {
		return map[string]interface{}{}
	}
	return result
}

func decodeJSONStringSlice(raw datatypes.JSON) []string {
	if len(raw) == 0 {
		return []string{}
	}
	var result []string
	if err := json.Unmarshal(raw, &result); err != nil {
		return []string{}
	}
	return result
}

func encodeJSON(value interface{}) (datatypes.JSON, error) {
	if value == nil {
		return datatypes.JSON([]byte("null")), nil
	}
	raw, err := json.Marshal(value)
	if err != nil {
		return nil, err
	}
	return datatypes.JSON(raw), nil
}

func resolveReportDateRange(params map[string]interface{}) (time.Time, time.Time) {
	if params != nil {
		if value, ok := params["dateRange"].(map[string]interface{}); ok {
			start, end := parseRange(value)
			if !start.IsZero() && !end.IsZero() {
				return start, end
			}
		}
		if value, ok := params["date_range"].(map[string]interface{}); ok {
			start, end := parseRange(value)
			if !start.IsZero() && !end.IsZero() {
				return start, end
			}
		}
	}
	now := time.Now().UTC()
	return now.Add(-24 * time.Hour), now
}

func parseRange(value map[string]interface{}) (time.Time, time.Time) {
	startStr := fmt.Sprint(value["startDate"])
	if startStr == "" {
		startStr = fmt.Sprint(value["start_date"])
	}
	endStr := fmt.Sprint(value["endDate"])
	if endStr == "" {
		endStr = fmt.Sprint(value["end_date"])
	}
	start, _ := parseTimeOptional(startStr)
	end, _ := parseTimeOptional(endStr)
	if start != nil && end != nil {
		return *start, *end
	}
	return time.Time{}, time.Time{}
}

func parseTimeOptional(value string) (*time.Time, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return nil, nil
	}
	if parsed, err := time.Parse(time.RFC3339, value); err == nil {
		return &parsed, nil
	}
	if parsed, err := time.Parse(time.RFC3339Nano, value); err == nil {
		return &parsed, nil
	}
	if parsed, err := time.Parse("2006-01-02 15:04:05", value); err == nil {
		return &parsed, nil
	}
	if parsed, err := time.Parse("2006-01-02", value); err == nil {
		return &parsed, nil
	}
	return nil, fmt.Errorf("invalid time format")
}

func normalizeFormats(formats []string) []string {
	result := make([]string, 0, len(formats))
	seen := map[string]struct{}{}
	for _, format := range formats {
		normalized := normalizeReportFormat(format)
		if _, ok := seen[normalized]; ok {
			continue
		}
		seen[normalized] = struct{}{}
		result = append(result, normalized)
	}
	if len(result) == 0 {
		return []string{"pdf"}
	}
	return result
}

func normalizeReportFormat(value string) string {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "pdf", "excel", "word", "html":
		return strings.ToLower(strings.TrimSpace(value))
	case "xlsx":
		return "excel"
	case "docx":
		return "word"
	default:
		return "pdf"
	}
}

func isUnhealthyValue(value interface{}) bool {
	if text, ok := value.(string); ok {
		lower := strings.ToLower(text)
		if strings.Contains(lower, "error") || strings.Contains(lower, "disconnected") {
			return true
		}
		if strings.Contains(lower, "not_configured") {
			return true
		}
	}
	return false
}

func buildProbeStatuses(result devices.ProbeResult) (string, string, string) {
	status := "offline"
	icmpStatus := "offline"
	if result.IcmpReachable {
		status = "online"
		icmpStatus = "online"
	}

	snmpStatus := "failed"
	if result.SnmpReachable {
		snmpStatus = "success"
	} else if result.SnmpError != nil && strings.Contains(strings.ToLower(*result.SnmpError), "not configured") {
		snmpStatus = "not_configured"
	}

	return status, icmpStatus, snmpStatus
}

func conditionalLastSeen(result devices.ProbeResult) *time.Time {
	if result.IcmpReachable {
		t := result.ProbedAt
		return &t
	}
	return nil
}

func defaultDiskPath() string {
	if runtime.GOOS == "windows" {
		drive := strings.TrimSpace(os.Getenv("SystemDrive"))
		if drive == "" {
			drive = "C:"
		}
		return drive + "\\"
	}
	return "/"
}
