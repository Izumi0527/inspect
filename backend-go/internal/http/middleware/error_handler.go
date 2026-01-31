package middleware

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"
	"go.uber.org/zap"
)

type errorDetail struct {
	Type    string      `json:"type"`
	Message string      `json:"message"`
	Details interface{} `json:"details,omitempty"`
}

type errorResponse struct {
	Success bool        `json:"success"`
	Error   errorDetail `json:"error"`
}

// ErrorHandlerWithLogger 创建带日志的错误处理器
func ErrorHandlerWithLogger(logger *zap.Logger) func(err error, c echo.Context) {
	return func(err error, c echo.Context) {
		if c.Response().Committed {
			return
		}

		code := http.StatusInternalServerError
		errorType := "InternalServerError"
		message := "服务器内部错误"

		if httpErr, ok := err.(*echo.HTTPError); ok {
			code = httpErr.Code
			errorType = "HTTPException"
			if msg := toString(httpErr.Message); strings.TrimSpace(msg) != "" {
				message = msg
			} else if httpErr.Message != nil {
				message = fmt.Sprint(httpErr.Message)
			} else if statusText := http.StatusText(code); statusText != "" {
				message = statusText
			}
		}

		// 记录错误日志
		if logger != nil {
			fields := []zap.Field{
				zap.Int("status_code", code),
				zap.String("error_type", errorType),
				zap.String("message", message),
				zap.String("method", c.Request().Method),
				zap.String("path", c.Request().URL.Path),
				zap.String("remote_ip", c.RealIP()),
				zap.Error(err),
			}

			if code >= 500 {
				logger.Error("🔥 Server Error", fields...)
			} else if code >= 400 {
				logger.Warn("⚠️ Client Error", fields...)
			}
		}

		response := errorResponse{
			Success: false,
			Error: errorDetail{
				Type:    errorType,
				Message: message,
			},
		}

		_ = c.JSON(code, response)
	}
}

// ErrorHandler 默认错误处理器（无日志）
func ErrorHandler(err error, c echo.Context) {
	if c.Response().Committed {
		return
	}

	code := http.StatusInternalServerError
	errorType := "InternalServerError"
	message := "服务器内部错误"

	if httpErr, ok := err.(*echo.HTTPError); ok {
		code = httpErr.Code
		errorType = "HTTPException"
		if msg := toString(httpErr.Message); strings.TrimSpace(msg) != "" {
			message = msg
		} else if httpErr.Message != nil {
			message = fmt.Sprint(httpErr.Message)
		} else if statusText := http.StatusText(code); statusText != "" {
			message = statusText
		}
	}

	response := errorResponse{
		Success: false,
		Error: errorDetail{
			Type:    errorType,
			Message: message,
		},
	}

	_ = c.JSON(code, response)
}

func toString(value interface{}) string {
	switch v := value.(type) {
	case string:
		return v
	case error:
		return v.Error()
	default:
		return ""
	}
}
