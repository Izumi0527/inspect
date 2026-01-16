package settings

import (
	"context"
	"fmt"
	"math"
	"os"
	"path/filepath"
	"runtime"
	"time"

	"github.com/shirou/gopsutil/v3/cpu"
	"github.com/shirou/gopsutil/v3/disk"
	"github.com/shirou/gopsutil/v3/host"
	"github.com/shirou/gopsutil/v3/mem"
	"github.com/shirou/gopsutil/v3/net"
	"gorm.io/datatypes"
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
			BytesReceived:  netBytesRecv,
			BytesSent:      netBytesSent,
			PacketsReceived: netPacketsRecv,
			PacketsSent:    netPacketsSent,
		},
	}, nil
}

func (s *Service) collectServiceHealth(ctx context.Context) []ServiceHealth {
	services := make([]ServiceHealth, 0)
	checkTime := time.Now().UTC()

	services = append(services, ServiceHealth{
		Name:         "API",
		Status:       "healthy",
		ResponseTime: 1,
		Uptime:       int64(time.Since(s.processStart).Seconds()),
		LastCheck:    checkTime,
	})

	dbStatus := "healthy"
	if err := s.db.WithContext(ctx).Raw("SELECT 1").Error; err != nil {
		message := err.Error()
		services = append(services, ServiceHealth{
			Name:         "PostgreSQL",
			Status:       "unhealthy",
			ResponseTime: 0,
			Uptime:       0,
			LastCheck:    checkTime,
			ErrorMessage: &message,
		})
		return services
	}
	services = append(services, ServiceHealth{
		Name:         "PostgreSQL",
		Status:       dbStatus,
		ResponseTime: 5,
		Uptime:       0,
		LastCheck:    checkTime,
	})

	if s.redis != nil {
		if err := s.redis.Ping(ctx).Err(); err != nil {
			message := err.Error()
			services = append(services, ServiceHealth{
				Name:         "Redis",
				Status:       "unhealthy",
				ResponseTime: 0,
				Uptime:       0,
				LastCheck:    checkTime,
				ErrorMessage: &message,
			})
		} else {
			services = append(services, ServiceHealth{
				Name:         "Redis",
				Status:       "healthy",
				ResponseTime: 2,
				Uptime:       0,
				LastCheck:    checkTime,
			})
		}
	}

	return services
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

	for _, item := range items {
		value := item.Value
		unit := item.Unit
		host := hostname
		_ = s.db.WithContext(ctx).Table("system_metrics").Create(map[string]interface{}{
			"host":         host,
			"metric_name":  item.Name,
			"metric_value": value,
			"metric_unit":  unit,
			"tags":         datatypes.JSONMap{},
			"collected_at": now,
		}).Error
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
