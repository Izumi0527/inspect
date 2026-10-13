package main

import (
	"context"
	"errors"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	// 嵌入 IANA 时区库：settings.ResolveLocation 用 time.LoadLocation 解析
	// system.timezone（默认 Asia/Shanghai）来构造查询边界，而 release 镜像是
	// alpine（默认不含 tzdata）。不嵌入的话 LoadLocation 会静默失败回退 UTC，
	// 让「按业务时区切分日/周」的修复在容器里失效。
	_ "time/tzdata"

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
