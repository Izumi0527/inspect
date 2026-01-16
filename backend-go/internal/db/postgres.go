package db

import (
    "time"

    "gorm.io/driver/postgres"
    "gorm.io/gorm"
    "gorm.io/gorm/logger"

    "github.com/your-org/inspect-system/backend-go/internal/config"
)

func OpenPostgres(cfg config.Config) (*gorm.DB, error) {
    gormConfig := &gorm.Config{}
    if cfg.DatabaseEcho {
        gormConfig.Logger = logger.Default.LogMode(logger.Info)
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
