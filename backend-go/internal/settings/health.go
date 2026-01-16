package settings

import (
	"context"
	"fmt"
	"time"
)

func (s *Service) GetSystemHealth(ctx context.Context) (SystemHealthResponse, error) {
	if !s.isReady() {
		return SystemHealthResponse{}, fmt.Errorf("database not initialized")
	}

	metrics, _ := s.collectMetrics(ctx)

	resources := SystemResourceHealth{
		CPU: ResourceStatus{Status: usageStatus(metrics.CPU.Usage), Usage: metrics.CPU.Usage},
		Memory: ResourceStatus{Status: usageStatus(metrics.Memory.Usage), Usage: metrics.Memory.Usage},
		Disk: ResourceStatus{Status: usageStatus(metrics.Disk.Usage), Usage: metrics.Disk.Usage},
		Database: DatabaseStatus{Status: "normal", Connections: 0},
	}

	if sqlDB, err := s.db.DB(); err == nil {
		stats := sqlDB.Stats()
		resources.Database.Connections = stats.OpenConnections
		if stats.OpenConnections == 0 {
			resources.Database.Status = "warning"
		}
	}

	services := make([]SystemServiceHealth, 0)
	alerts := make([]SystemAlert, 0)
	now := time.Now().UTC()

	services = append(services, SystemServiceHealth{
		Name:      "API",
		Status:    "running",
		Uptime:    int64(time.Since(s.processStart).Seconds()),
		LastCheck: now,
	})

	if err := s.db.WithContext(ctx).Raw("SELECT 1").Error; err != nil {
		message := err.Error()
		services = append(services, SystemServiceHealth{
			Name:      "PostgreSQL",
			Status:    "error",
			Uptime:    0,
			LastCheck: now,
			Details:   &message,
		})
		alerts = append(alerts, SystemAlert{Level: "error", Message: "数据库连接异常", Timestamp: now})
		resources.Database.Status = "critical"
	} else {
		services = append(services, SystemServiceHealth{
			Name:      "PostgreSQL",
			Status:    "running",
			Uptime:    0,
			LastCheck: now,
		})
	}

	if s.redis != nil {
		if err := s.redis.Ping(ctx).Err(); err != nil {
			message := err.Error()
			services = append(services, SystemServiceHealth{
				Name:      "Redis",
				Status:    "error",
				Uptime:    0,
				LastCheck: now,
				Details:   &message,
			})
			alerts = append(alerts, SystemAlert{Level: "warning", Message: "Redis连接异常", Timestamp: now})
		} else {
			services = append(services, SystemServiceHealth{
				Name:      "Redis",
				Status:    "running",
				Uptime:    0,
				LastCheck: now,
			})
		}
	}

	overall := "healthy"
	if resources.CPU.Status == "critical" || resources.Memory.Status == "critical" || resources.Disk.Status == "critical" || resources.Database.Status == "critical" {
		overall = "critical"
	} else if resources.CPU.Status == "warning" || resources.Memory.Status == "warning" || resources.Disk.Status == "warning" || resources.Database.Status == "warning" {
		overall = "warning"
	}
	if len(alerts) > 0 && overall == "healthy" {
		overall = "warning"
	}

	return SystemHealthResponse{
		Overall:   overall,
		Services:  services,
		Resources: resources,
		Alerts:    alerts,
	}, nil
}

func usageStatus(usage float64) string {
	switch {
	case usage >= 90:
		return "critical"
	case usage >= 75:
		return "warning"
	default:
		return "normal"
	}
}
