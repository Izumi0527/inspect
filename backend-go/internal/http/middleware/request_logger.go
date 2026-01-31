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
				zap.String("path", c.Request().URL.Path),
				zap.String("query", c.Request().URL.RawQuery),
				zap.String("remote_ip", c.RealIP()),
				zap.Int("status", status),
				zap.Duration("latency", latency),
				zap.Int64("bytes_out", c.Response().Size),
			}
			if requestID != "" {
				fields = append(fields, zap.String("request_id", requestID))
			}

			// 添加错误信息
			if err != nil {
				fields = append(fields, zap.Error(err))
			}

			// 根据状态码选择日志级别
			switch {
			case status >= 500:
				logger.Error("❌ HTTP Request Failed", fields...)
			case status >= 400:
				logger.Warn("⚠️ HTTP Request Warning", fields...)
			case status >= 300:
				logger.Info("↪️ HTTP Redirect", fields...)
			default:
				logger.Info("✅ HTTP Request", fields...)
			}

			return err
		}
	}
}
