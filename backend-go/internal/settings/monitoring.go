package settings

import (
	"context"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/net"
	"go.uber.org/zap"
	"gorm.io/datatypes"

	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
)

func (s *Service) GetCurrentMetrics(ctx context.Context) (MonitoringResponse, error) {
	if !s.isReady() {
		return MonitoringResponse{}, fmt.Errorf("database not initialized")
	}

	metrics, err := s.collectMetrics(ctx)
	if err != nil {
		return MonitoringResponse{}, err
	}

	services := s.collectServiceHealth(ctx)
	system := s.collectSystemInfo(ctx)
	response := MonitoringResponse{
		Metrics:   metrics,
		Services:  services,
		System:    system,
		Timestamp: time.Now().UTC(),
	}

	s.storeMetrics(ctx, metrics, system.Hostname)

	return response, nil
}

func (s *Service) GetMetricHistory(ctx context.Context, hours int) (MetricHistory, error) {
	if !s.isReady() {
		return MetricHistory{}, fmt.Errorf("database not initialized")
	}
	if hours <= 0 {
		hours = 24
	}

	since := time.Now().UTC().Add(-time.Duration(hours) * time.Hour)
	rows := make([]struct {
		MetricName  string
		MetricValue *float64
		CollectedAt time.Time
	}, 0)

	query := `
		SELECT metric_name, metric_value, collected_at
		FROM system_metrics
		WHERE collected_at >= ? AND metric_name IN ('cpu_usage', 'memory_usage', 'disk_usage')
		ORDER BY collected_at ASC`

	if err := s.db.WithContext(ctx).Raw(query, since).Scan(&rows).Error; err != nil {
		return MetricHistory{}, err
	}

	history := MetricHistory{
		CPU:    []MetricDataPoint{},
		Memory: []MetricDataPoint{},
		Disk:   []MetricDataPoint{},
	}

	for _, row := range rows {
		if row.MetricValue == nil {
			continue
		}
		point := MetricDataPoint{Timestamp: row.CollectedAt, Value: *row.MetricValue}
		switch row.MetricName {
		case "cpu_usage":
			history.CPU = append(history.CPU, point)
		case "memory_usage":
			history.Memory = append(history.Memory, point)
		case "disk_usage":
			history.Disk = append(history.Disk, point)
		}
	}

	return history, nil
}

func (s *Service) collectMetrics(ctx context.Context) (MonitoringMetrics, error) {
	cpuUsage := 0.0
	cpuCores := 0
	cpuTemp := (*float64)(nil)
	var loadAvg []float64

	if percentages, err := cpu.PercentWithContext(ctx, 0, false); err == nil && len(percentages) > 0 {
		cpuUsage = percentages[0]
	}
	if cores, err := cpu.CountsWithContext(ctx, true); err == nil {
		cpuCores = cores
	}
	if temps, err := host.SensorsTemperaturesWithContext(ctx); err == nil {
		if len(temps) > 0 {
			value := temps[0].Temperature
			cpuTemp = &value
		}
	}
	// LoadAvg is not available on Windows
	// if runtime.GOOS != "windows" {
	// 	if load, err := host.LoadAvgWithContext(ctx); err == nil {
	// 		loadAvg = []float64{load.Load1, load.Load5, load.Load15}
	// 	}
	// }

	memTotal := int64(0)
	memUsed := int64(0)
	memFree := int64(0)
	memUsage := 0.0
	if memStat, err := mem.VirtualMemoryWithContext(ctx); err == nil {
		memTotal = int64(memStat.Total)
		memUsed = int64(memStat.Used)
		memFree = int64(memStat.Available)
		memUsage = memStat.UsedPercent
	}

	diskPath := rootPath()
	diskTotal := int64(0)
	diskUsed := int64(0)
	diskFree := int64(0)
	diskUsage := 0.0
	if diskStat, err := disk.UsageWithContext(ctx, diskPath); err == nil {
		diskTotal = int64(diskStat.Total)
		diskUsed = int64(diskStat.Used)
		diskFree = int64(diskStat.Free)
		diskUsage = diskStat.UsedPercent
	}

	netBytesRecv := uint64(0)
	netBytesSent := uint64(0)
	netPacketsRecv := uint64(0)
	netPacketsSent := uint64(0)
	if netStats, err := net.IOCountersWithContext(ctx, false); err == nil && len(netStats) > 0 {
		netBytesRecv = netStats[0].BytesRecv
		netBytesSent = netStats[0].BytesSent
		netPacketsRecv = netStats[0].PacketsRecv
		netPacketsSent = netStats[0].PacketsSent
	}

	return MonitoringMetrics{
		CPU: CPUMetrics{
			Usage:       roundFloat(cpuUsage, 1),
			Cores:       cpuCores,
			Temperature: cpuTemp,
			LoadAverage: loadAvg,
		},
		Memory: MemoryMetrics{
			Total: memTotal,
			Used:  memUsed,
			Free:  memFree,
			Usage: roundFloat(memUsage, 1),
		},
		Disk: DiskMetrics{
			Total: diskTotal,
			Used:  diskUsed,
			Free:  diskFree,
			Usage: roundFloat(diskUsage, 1),
		},
		Network: NetworkMetrics{
			BytesReceived:   netBytesRecv,
			BytesSent:       netBytesSent,
			PacketsReceived: netPacketsRecv,
			PacketsSent:     netPacketsSent,
		},
	}, nil
}

func (s *Service) collectServiceHealth(ctx context.Context) []ServiceHealth {
	services := make([]ServiceHealth, 0)
	checkTime := time.Now().UTC()
	apiUptime := normalizeUptimeSeconds(int64(time.Since(s.processStart).Seconds()))

	services = append(services, ServiceHealth{
		Name:         "API",
		Status:       "healthy",
		ResponseTime: 1,
		Uptime:       apiUptime,
		LastCheck:    checkTime,
	})

	dbStatus := "healthy"
	if err := s.db.WithContext(ctx).Raw("SELECT 1").Error; err != nil {
		message := err.Error()
		services = append(services, ServiceHealth{
			Name:         "PostgreSQL",
			Status:       "unhealthy",
			ResponseTime: 0,
			Uptime:       nil,
			LastCheck:    checkTime,
			ErrorMessage: &message,
		})
		return services
	}
	postgresUptime, err := s.queryPostgresUptimeSeconds(ctx)
	if err != nil {
		postgresUptime = nil
	}
	services = append(services, ServiceHealth{
		Name:         "PostgreSQL",
		Status:       dbStatus,
		ResponseTime: 5,
		Uptime:       postgresUptime,
		LastCheck:    checkTime,
	})

	if s.redis != nil {
		if err := s.redis.Ping(ctx).Err(); err != nil {
			message := err.Error()
			services = append(services, ServiceHealth{
				Name:         "Redis",
				Status:       "unhealthy",
				ResponseTime: 0,
				Uptime:       nil,
				LastCheck:    checkTime,
				ErrorMessage: &message,
			})
		} else {
			redisUptime, err := s.queryRedisUptimeSeconds(ctx)
			if err != nil {
				redisUptime = nil
			}
			services = append(services, ServiceHealth{
				Name:         "Redis",
				Status:       "healthy",
				ResponseTime: 2,
				Uptime:       redisUptime,
				LastCheck:    checkTime,
			})
		}
	}

	return services
}

func (s *Service) queryPostgresUptimeSeconds(ctx context.Context) (*int64, error) {
	row := struct {
		Uptime *int64 `gorm:"column:uptime"`
	}{}
	query := "SELECT EXTRACT(EPOCH FROM (NOW() - pg_postmaster_start_time()))::bigint AS uptime"
	if err := s.db.WithContext(ctx).Raw(query).Scan(&row).Error; err != nil {
		return nil, err
	}
	return normalizeUptimePointer(row.Uptime), nil
}

func (s *Service) queryRedisUptimeSeconds(ctx context.Context) (*int64, error) {
	if s.redis == nil {
		return nil, nil
	}
	info, err := s.redis.Info(ctx, "server").Result()
	if err != nil {
		return nil, err
	}
	return parseRedisUptimeSeconds(info)
}

func parseRedisUptimeSeconds(info string) (*int64, error) {
	lines := strings.Split(info, "\n")
	for _, line := range lines {
		text := strings.TrimSpace(line)
		if !strings.HasPrefix(text, "uptime_in_seconds:") {
			continue
		}
		rawValue := strings.TrimSpace(strings.TrimPrefix(text, "uptime_in_seconds:"))
		if rawValue == "" {
			return nil, fmt.Errorf("redis uptime_in_seconds is empty")
		}
		seconds, err := strconv.ParseInt(rawValue, 10, 64)
		if err != nil {
			return nil, fmt.Errorf("parse redis uptime_in_seconds failed: %w", err)
		}
		return normalizeUptimeSeconds(seconds), nil
	}
	return nil, fmt.Errorf("redis uptime_in_seconds not found")
}

func normalizeUptimePointer(value *int64) *int64 {
	if value == nil {
		return nil
	}
	return normalizeUptimeSeconds(*value)
}

func normalizeUptimeSeconds(value int64) *int64 {
	if value < 0 {
		return nil
	}
	normalized := value
	return &normalized
}

func (s *Service) collectSystemInfo(ctx context.Context) SystemInfo {
	hostname := "unknown"
	platformName := runtime.GOOS
	osVersion := ""
	nodeVersion := runtime.Version()
	uptime := int64(0)

	if info, err := host.InfoWithContext(ctx); err == nil {
		hostname = info.Hostname
		if info.Platform != "" {
			platformName = info.Platform
		}
		osVersion = info.PlatformVersion
		uptime = int64(info.Uptime)
	}

	processUptime := int64(time.Since(s.processStart).Seconds())

	return SystemInfo{
		Hostname:      hostname,
		Platform:      platformName,
		OSVersion:     osVersion,
		NodeVersion:   nodeVersion,
		Uptime:        uptime,
		ProcessUptime: processUptime,
	}
}

func (s *Service) storeMetrics(ctx context.Context, metrics MonitoringMetrics, hostname string) {
	if !s.isReady() {
		return
	}

	now := time.Now().UTC()
	items := []struct {
		Name  string
		Value float64
		Unit  string
	}{
		{Name: "cpu_usage", Value: metrics.CPU.Usage, Unit: "percent"},
		{Name: "memory_usage", Value: metrics.Memory.Usage, Unit: "percent"},
		{Name: "disk_usage", Value: metrics.Disk.Usage, Unit: "percent"},
	}

	records := make([]monitoring.SystemMetric, 0, len(items))
	for _, item := range items {
		value := item.Value
		unit := item.Unit
		host := hostname
		records = append(records, monitoring.SystemMetric{
			Host:        &host,
			MetricName:  item.Name,
			MetricValue: &value,
			MetricUnit:  &unit,
			Tags:        datatypes.JSONMap{},
			CollectedAt: now,
			CreatedAt:   now,
		})
	}

	if err := monitoring.InsertSystemMetricsRaw(s.db.WithContext(ctx), records); err != nil && s.logger != nil {
		s.logger.Warn(
			"store_settings_metrics_failed",
			zap.String("host", hostname),
			zap.Int("metrics_count", len(records)),
			zap.Error(err),
		)
	}
}

func rootPath() string {
	if runtime.GOOS == "windows" {
		if drive := os.Getenv("SystemDrive"); drive != "" {
			return drive + "\\"
		}
		return filepath.VolumeName("C:\\") + "\\"
	}
	return "/"
}

type diskUsageStat struct {
	Used  int64
	Total int64
}

func diskUsage(path string) (diskUsageStat, error) {
	stat, err := disk.Usage(path)
	if err != nil {
		return diskUsageStat{}, err
	}
	return diskUsageStat{Used: int64(stat.Used), Total: int64(stat.Total)}, nil
}

func roundFloat(value float64, decimals int) float64 {
	factor := math.Pow(10, float64(decimals))
	return math.Round(value*factor) / factor
}
