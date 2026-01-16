package main

import (
    "context"
    "errors"
    "log"
    "net/http"
    "os"
    "os/signal"
    "syscall"

    "go.uber.org/zap"

    "github.com/your-org/inspect-system/backend-go/internal/app"
)

func main() {
    application, err := app.New()
    if err != nil {
        log.Fatalf("failed to initialize app: %v", err)
    }

    go func() {
        if err := application.Start(); err != nil && !errors.Is(err, http.ErrServerClosed) {
            application.Logger.Fatal("server stopped", zap.Error(err))
        }
    }()

    quit := make(chan os.Signal, 1)
    signal.Notify(quit, os.Interrupt, syscall.SIGTERM)
    <-quit

    if err := application.Shutdown(context.Background()); err != nil {
        log.Printf("shutdown error: %v", err)
    }
}
