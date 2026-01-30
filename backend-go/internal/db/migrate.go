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

	// 迁移非 TimescaleDB hypertable 的表
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
	); err != nil {
		return fmt.Errorf("auto migrate failed: %w", err)
	}

	// 单独处理 TimescaleDB hypertable 表的迁移
	// 对于已存在的 hypertable，跳过 AutoMigrate 以避免 ALTER COLUMN 错误
	if err := migrateMetricTables(db, cfg, logger); err != nil {
		return fmt.Errorf("migrate metric tables failed: %w", err)
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

// migrateMetricTables 处理监控指标表的迁移
// 对于已存在的 TimescaleDB hypertable，跳过 AutoMigrate 以避免 ALTER COLUMN 错误
// TimescaleDB 不支持在启用压缩的 hypertable 上执行 ALTER COLUMN 操作
func migrateMetricTables(db *gorm.DB, cfg config.Config, logger *zap.Logger) error {
	metricModels := []struct {
		model     interface{}
		tableName string
	}{
		{&monitoring.DeviceMetric{}, "device_metrics"},
		{&monitoring.InterfaceMetric{}, "interface_metrics"},
		{&monitoring.SystemMetric{}, "system_metrics"},
	}

	for _, m := range metricModels {
		// 检查表是否已存在
		tableExists := db.Migrator().HasTable(m.model)

		if tableExists && cfg.TimescaleEnabled {
			// 检查是否是 hypertable（可能启用了压缩）
			isHT := isHypertable(db, m.tableName)
			if isHT {
				// 对于已存在的 hypertable，跳过 AutoMigrate
				// 因为 TimescaleDB 不支持在启用压缩的 hypertable 上执行 ALTER COLUMN
				if logger != nil {
					logger.Info("skipping AutoMigrate for existing hypertable (compression may be enabled)",
						zap.String("table", m.tableName))
				}
				continue
			}
		}

		// 对于新表或非 hypertable，执行正常的 AutoMigrate
		if err := db.AutoMigrate(m.model); err != nil {
			return fmt.Errorf("migrate %s failed: %w", m.tableName, err)
		}

		if logger != nil {
			if tableExists {
				logger.Info("migrated existing table", zap.String("table", m.tableName))
			} else {
				logger.Info("created new table", zap.String("table", m.tableName))
			}
		}
	}

	return nil
}

// isHypertable 检查表是否是 TimescaleDB hypertable
func isHypertable(db *gorm.DB, tableName string) bool {
	var count int64
	err := db.Raw(`
		SELECT COUNT(*) FROM timescaledb_information.hypertables 
		WHERE hypertable_name = ?
	`, tableName).Scan(&count).Error
	if err != nil {
		// 如果查询失败（可能 TimescaleDB 未安装），返回 false
		return false
	}
	return count > 0
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
