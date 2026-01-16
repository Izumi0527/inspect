package middleware

import (
    "time"

    "github.com/labstack/echo/v4"
    "go.uber.org/zap"
)

func RequestLogger(logger *zap.Logger) echo.MiddlewareFunc {
    return func(next echo.HandlerFunc) echo.HandlerFunc {
        return func(c echo.Context) error {
            start := time.Now()
            err := next(c)

            status := c.Response().Status
            latency := time.Since(start)
            requestID := GetRequestID(c.Request().Context())

            fields := []zap.Field{
                zap.String("method", c.Request().Method),
                zap.String("path", c.Path()),
                zap.String("remote_ip", c.RealIP()),
                zap.Int("status", status),
                zap.Duration("latency", latency),
            }
            if requestID != "" {
                fields = append(fields, zap.String("request_id", requestID))
            }

            switch {
            case status >= 500:
                logger.Error("http_request", fields...)
            case status >= 400:
                logger.Warn("http_request", fields...)
            default:
                logger.Info("http_request", fields...)
            }

            return err
        }
    }
}
