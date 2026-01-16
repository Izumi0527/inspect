package main

import (
    "fmt"
    "os"

    "go.uber.org/zap"

    "github.com/your-org/inspect-system/backend-go/internal/config"
    "github.com/your-org/inspect-system/backend-go/internal/db"
    "github.com/your-org/inspect-system/backend-go/internal/logger"
)

func main() {
    cfg, err := config.Load()
    if err != nil {
        fmt.Fprintf(os.Stderr, "failed to load config: %v\n", err)
        os.Exit(1)
    }

    log, err := logger.New(cfg)
    if err != nil {
        fmt.Fprintf(os.Stderr, "failed to initialize logger: %v\n", err)
        os.Exit(1)
    }
    defer func() {
        _ = log.Sync()
    }()

    database, err := db.OpenPostgres(cfg)
    if err != nil {
        log.Error("failed to open database", zap.Error(err))
        os.Exit(1)
    }

    if err := db.Migrate(database, cfg, log); err != nil {
        log.Error("database migration failed", zap.Error(err))
        os.Exit(1)
    }

    log.Info("database migration completed")
}
