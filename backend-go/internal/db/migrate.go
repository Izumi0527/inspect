package db

import (
	"fmt"
	"strings"

	"go.uber.org/zap"
	"gorm.io/gorm"

	"github.com/your-org/inspect-system/backend-go/internal/alerts"
	"github.com/your-org/inspect-system/backend-go/internal/config"
	"github.com/your-org/inspect-system/backend-go/internal/dashboard"
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
		&devices.DeviceInterface{},

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

		&dashboard.UserNotificationState{},

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
		metricTables := []string{
			"device_metrics",
			"interface_metrics",
			"system_metrics",
		}
		for _, table := range metricTables {
			// TimescaleDB 要求：任何 UNIQUE/PRIMARY KEY 都必须包含分区列（collected_at）。
			// 旧表常见为仅包含 id 的主键，直接 create_hypertable 会触发 TS103。
			if err := ensureTimescaleCompatibleUniques(db, table, "collected_at", logger); err != nil {
				return err
			}
			if err := ensureHypertable(db, table, "collected_at"); err != nil {
				return err
			}
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

// quoteSQLLiteral 将字符串转换为安全的 SQL 字面量（单引号包裹，并转义内部单引号）。
// 说明：这里的输入来自代码内固定表名/列名，但仍保持严格转义，避免语法错误与潜在隐患。
func quoteSQLLiteral(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "''") + "'"
}

// ensureTimescaleCompatibleUniques 会清理 hypertable 不兼容的唯一约束/索引。
//
// TimescaleDB 规则：任何 UNIQUE/PRIMARY KEY 都必须包含分区列（这里是 collected_at）。
// 若表上存在不包含分区列的唯一约束（最常见是 id 主键），create_hypertable 会报 TS103：
//   ERROR: cannot create a unique index without the column "collected_at" (used in partitioning)
//
// 该函数是幂等的：重复执行不会报错。
func ensureTimescaleCompatibleUniques(db *gorm.DB, table string, timeColumn string, logger *zap.Logger) error {
	if table == "" || timeColumn == "" {
		return fmt.Errorf("invalid hypertable arguments: table=%q timeColumn=%q", table, timeColumn)
	}

	// 使用 DO 块在数据库侧动态枚举并删除不兼容的约束/索引，避免依赖固定命名（如 *_pkey）。
	// - 先删约束（PRIMARY KEY/UNIQUE），其底层索引通常会随约束自动删除
	// - 再兜底删除残留的 UNIQUE 索引（非约束创建的 UNIQUE INDEX）
	stmt := fmt.Sprintf(`
DO $$
DECLARE
    tbl text := %s;
    time_col text := %s;
    tbl_reg regclass;
    r record;
BEGIN
    tbl_reg := to_regclass(tbl);
    IF tbl_reg IS NULL THEN
        RETURN;
    END IF;

    -- 删除不包含分区列的 PRIMARY KEY/UNIQUE 约束
    FOR r IN (
        SELECT c.conname
        FROM pg_constraint c
        WHERE c.conrelid = tbl_reg
          AND c.contype IN ('p','u')
          AND NOT EXISTS (
              SELECT 1
              FROM unnest(c.conkey) AS k(attnum)
              JOIN pg_attribute a
                ON a.attrelid = c.conrelid
               AND a.attnum = k.attnum
              WHERE a.attname = time_col
          )
    ) LOOP
        EXECUTE format('ALTER TABLE %%I DROP CONSTRAINT IF EXISTS %%I;', tbl, r.conname);
    END LOOP;

    -- 删除不包含分区列的 UNIQUE 索引（非约束创建的 UNIQUE INDEX）
    FOR r IN (
        SELECT i.relname AS index_name
        FROM pg_index x
        JOIN pg_class i ON i.oid = x.indexrelid
        WHERE x.indrelid = tbl_reg
          AND x.indisunique
          AND NOT EXISTS (
              SELECT 1
              FROM unnest(x.indkey) AS k(attnum)
              JOIN pg_attribute a
                ON a.attrelid = x.indrelid
               AND a.attnum = k.attnum
              WHERE a.attname = time_col
          )
    ) LOOP
        EXECUTE format('DROP INDEX IF EXISTS %%I;', r.index_name);
    END LOOP;
END $$;
`, quoteSQLLiteral(table), quoteSQLLiteral(timeColumn))

	if err := execSQL(db, stmt); err != nil {
		return fmt.Errorf("ensure timescale compatible uniques failed for %s: %w", table, err)
	}

	if logger != nil {
		logger.Info("ensured timescale compatible uniques",
			zap.String("table", table),
			zap.String("time_column", timeColumn))
	}
	return nil
}

func ensureHypertable(db *gorm.DB, table string, timeColumn string) error {
	query := fmt.Sprintf(
		"SELECT create_hypertable('%s', '%s', if_not_exists => TRUE, migrate_data => TRUE);",
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

	// Ensure id column defaults are bound to sequences.
	defaultStatements := []string{
		`ALTER TABLE device_metrics ALTER COLUMN id SET DEFAULT nextval('device_metrics_id_seq');`,
		`ALTER TABLE interface_metrics ALTER COLUMN id SET DEFAULT nextval('interface_metrics_id_seq');`,
		`ALTER TABLE system_metrics ALTER COLUMN id SET DEFAULT nextval('system_metrics_id_seq');`,
	}
	for _, stmt := range defaultStatements {
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
