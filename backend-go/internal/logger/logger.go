package logger

import (
    "os"
    "strings"

    "go.uber.org/zap"
    "go.uber.org/zap/zapcore"

    "github.com/your-org/inspect-system/backend-go/internal/config"
)

func New(cfg config.Config) (*zap.Logger, error) {
    level := parseLevel(cfg.LogLevel)
    encoder := buildEncoder(cfg.LogFormat)

    cores := make([]zapcore.Core, 0, 2)

    if cfg.LogToConsole {
        consoleCore := zapcore.NewCore(encoder, zapcore.Lock(os.Stdout), level)
        cores = append(cores, consoleCore)
    }

    if strings.TrimSpace(cfg.LogFile) != "" {
        file, err := os.OpenFile(cfg.LogFile, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
        if err != nil {
            return nil, err
        }
        fileCore := zapcore.NewCore(encoder, zapcore.AddSync(file), level)
        cores = append(cores, fileCore)
    }

    if len(cores) == 0 {
        cores = append(cores, zapcore.NewCore(encoder, zapcore.Lock(os.Stdout), level))
    }

    logger := zap.New(zapcore.NewTee(cores...), zap.AddCaller())
    return logger, nil
}

func buildEncoder(format string) zapcore.Encoder {
    cfg := zap.NewProductionEncoderConfig()
    cfg.EncodeTime = zapcore.ISO8601TimeEncoder

    if strings.EqualFold(format, "json") {
        return zapcore.NewJSONEncoder(cfg)
    }

    return zapcore.NewConsoleEncoder(cfg)
}

func parseLevel(level string) zapcore.Level {
    switch strings.ToLower(strings.TrimSpace(level)) {
    case "debug":
        return zapcore.DebugLevel
    case "warn", "warning":
        return zapcore.WarnLevel
    case "error":
        return zapcore.ErrorLevel
    default:
        return zapcore.InfoLevel
    }
}
