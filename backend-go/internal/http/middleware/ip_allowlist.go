package middleware

import (
	"context"
	"net/http"

	"github.com/labstack/echo/v4"

	"github.com/your-org/inspect-system/backend-go/internal/settings"
)

// IPNotAllowedType 为“来源 IP 不在白名单”错误的机器可读类型。
const IPNotAllowedType = "IPNotAllowed"

// IPAllowlistPolicy 为 IP 白名单中间件所需的最小依赖：返回当前是否启用及条目列表。
// *settings.Service 满足该接口。
type IPAllowlistPolicy interface {
	IPAllowlist(ctx context.Context) (enabled bool, entries []string)
}

// IPAllowlist 返回一个全局闸：安全策略启用 IP 白名单且列表非空时，来源 IP 未命中任一
// 条目的请求一律 403（含登录端点）。列表为空按未启用处理，避免把所有人锁在门外。
//
// 来源 IP 取 c.RealIP()，其可信度由 echo.IPExtractor 决定（见 router 的配置）。
// 该中间件应挂在 Authentication 之前，使未登录的请求同样受限。
func IPAllowlist(policy IPAllowlistPolicy) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			if c.Request().Method == http.MethodOptions {
				return next(c)
			}

			enabled, entries := policy.IPAllowlist(c.Request().Context())
			if !enabled || len(entries) == 0 {
				return next(c)
			}
			if settings.IPAllowlistPermits(entries, c.RealIP()) {
				return next(c)
			}

			return c.JSON(http.StatusForbidden, errorResponse{
				Success: false,
				Error: errorDetail{
					Type:    IPNotAllowedType,
					Message: "当前访问 IP 不在允许列表中",
				},
			})
		}
	}
}
