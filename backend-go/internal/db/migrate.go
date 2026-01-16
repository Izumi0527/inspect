package db

import (
	"fmt"

	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/alerts"
	"github.com/your-org/inspect-system/backend-go/internal/config"
	"github.com/your-org/inspect-system/backend-go/internal/devices"
	"github.com/your-org/inspect-system/backend-go/internal/inspection"
	"github.com/your-org/inspect-system/backend-go/internal/logs"
	"github.com/your-org/inspect-system/backend-go/internal/monitoring"
	"github.com/your-org/inspect-system/backend-go/internal/reports"
	"github.com/your-org/inspect-system/backend-go/internal/scheduler"
	"github.com/your-org/inspect-system/backend-go/internal/settings"
)

func Migrate(db *gorm.DB, cfg config.Config, logger *zap.Logger) error {
	if db == nil {
		return fmt.Errorf("database not initialized")
	}
	if !cfg.DatabaseAutoMigrate {
		if logger != nil {
			logger.Info("database auto-migrate disabled")
		}
		return nil
	}

	if cfg.TimescaleEnabled {
		if err := execSQL(db, `CREATE EXTENSION IF NOT EXISTS "timescaledb";`); err != nil {
			return fmt.Errorf("enable timescaledb extension failed: %w", err)
		}
	}
	if err := execSQL(db, `CREATE EXTENSION IF NOT EXISTS "uuid-ossp";`); err != nil {
		return fmt.Errorf("enable uuid-ossp extension failed: %w", err)
	}

	if err := db.AutoMigrate(
		&settings.SystemSetting{},
		&settings.SystemBackup{},
		&settings.User{},
		&settings.UserSession{},
		&settings.Role{},
		&settings.Permission{},
		&settings.RolePermission{},
		&settings.UserRole{},
		&settings.AuditLog{},

		&devices.Device{},
		&devices.DeviceGroup{},
		&devices.NetworkScan{},
		&devices.DiscoveredDevice{},

		&alerts.Alert{},
		&alerts.AlertRule{},
		&alerts.AlertOperationHistory{},

		&inspection.Template{},
		&inspection.Strategy{},
		&inspection.Inspection{},
		&inspection.Result{},

		&logs.DeviceLog{},
		&logs.LogParsingRule{},

		&reports.ReportTemplate{},
		&reports.ReportSchedule{},
		&reports.Report{},

		&scheduler.ScheduledTask{},
		&scheduler.TaskExecution{},

		&monitoring.DeviceMetric{},
		&monitoring.InterfaceMetric{},
		&monitoring.SystemMetric{},
	); err != nil {
		return fmt.Errorf("auto migrate failed: %w", err)
	}

	if cfg.TimescaleEnabled {
		if err := ensureHypertable(db, "device_metrics", "collected_at"); err != nil {
			return err
		}
		if err := ensureHypertable(db, "interface_metrics", "collected_at"); err != nil {
			return err
		}
		if err := ensureHypertable(db, "system_metrics", "collected_at"); err != nil {
			return err
		}
	}

	if err := ensureMetricIndexes(db); err != nil {
		return err
	}

	if logger != nil {
		logger.Info("database migration completed")
	}

	return nil
}

func ensureHypertable(db *gorm.DB, table string, timeColumn string) error {
	query := fmt.Sprintf(
		"SELECT create_hypertable('%s', '%s', if_not_exists => TRUE);",
		table,
		timeColumn,
	)
	if err := execSQL(db, query); err != nil {
		return fmt.Errorf("create hypertable for %s failed: %w", table, err)
	}
	return nil
}

func ensureMetricIndexes(db *gorm.DB) error {
	// Ensure sequences exist for metric tables
	sequenceStatements := []string{
		`CREATE SEQUENCE IF NOT EXISTS device_metrics_id_seq;`,
		`CREATE SEQUENCE IF NOT EXISTS interface_metrics_id_seq;`,
		`CREATE SEQUENCE IF NOT EXISTS system_metrics_id_seq;`,
	}
	for _, stmt := range sequenceStatements {
		if err := execSQL(db, stmt); err != nil {
			return err
		}
	}

	// Create indexes
	statements := []string{
		`CREATE INDEX IF NOT EXISTS idx_device_metrics_device_metric_time ON device_metrics (device_id, metric_name, collected_at DESC);`,
		`CREATE INDEX IF NOT EXISTS idx_interface_metrics_device_interface_metric_time ON interface_metrics (device_id, interface_name, metric_name, collected_at DESC);`,
		`CREATE INDEX IF NOT EXISTS idx_system_metrics_metric_time ON system_metrics (metric_name, collected_at DESC);`,
	}
	for _, stmt := range statements {
		if err := execSQL(db, stmt); err != nil {
			return err
		}
	}
	return nil
}

func execSQL(db *gorm.DB, sql string) error {
	return db.Exec(sql).Error
}
