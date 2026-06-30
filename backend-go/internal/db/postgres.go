package db

import (
    "log"
    "os"
    "time"

    "gorm.io/driver/postgres"
    "gorm.io/gorm"
    "gorm.io/gorm/logger"

    "github.com/your-org/inspect-system/backend-go/internal/config"
)

func OpenPostgres(cfg config.Config) (*gorm.DB, error) {
    // GORM 日志级别：开启 SQL 回显时 Info，否则 Warn。
    logLevel := logger.Warn
    if cfg.DatabaseEcho {
        logLevel = logger.Info
    }
    // IgnoreRecordNotFoundError：record not found 是常见的预期情况（如去重"查不到则新建"），
    // 不记录为错误，避免污染日志（例如 SNMP Trap 去重查询每次都打印 record not found）。
    gormConfig := &gorm.Config{
        Logger: logger.New(
            log.New(os.Stdout, "", log.LstdFlags),
            logger.Config{
                SlowThreshold:             200 * time.Millisecond,
                LogLevel:                  logLevel,
                IgnoreRecordNotFoundError: true,
                Colorful:                  false,
            },
        ),
    }

    db, err := gorm.Open(postgres.Open(cfg.DatabaseURL), gormConfig)
    if err != nil {
        return nil, err
    }

    sqlDB, err := db.DB()
    if err != nil {
        return nil, err
    }

    maxOpen := cfg.DatabasePoolSize + cfg.DatabaseMaxOverflow
    if maxOpen > 0 {
        sqlDB.SetMaxOpenConns(maxOpen)
    }
    if cfg.DatabasePoolSize > 0 {
        sqlDB.SetMaxIdleConns(cfg.DatabasePoolSize)
    }
    if cfg.DatabasePoolRecycle > 0 {
        sqlDB.SetConnMaxLifetime(time.Duration(cfg.DatabasePoolRecycle) * time.Second)
    }

    return db, nil
}
