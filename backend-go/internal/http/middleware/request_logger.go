package middleware

import (
	"net/http"
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
			if err != nil && !c.Response().Committed {
				// 错误响应尚未写出，采用项目 ErrorHandler 的状态码规则。
				// 这里只解析状态，原错误仍交给外层处理，避免重复写响应。
				status = http.StatusInternalServerError
				if httpErr, ok := err.(*echo.HTTPError); ok {
					status = httpErr.Code
				}
			}
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

			// 根据最终 HTTP 状态分级，客户端错误保留为 Warn。
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
