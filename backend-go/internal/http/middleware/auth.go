package middleware

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"

	"github.com/your-org/inspect-system/backend-go/internal/auth"
	"github.com/your-org/inspect-system/backend-go/internal/authcookie"
)

// Authenticator 为认证中间件所需的最小依赖：根据 access token 解析有效用户。
// *auth.Service 满足该接口。
type Authenticator interface {
	GetActiveUserFromToken(ctx context.Context, tokenStr string) (*auth.UserRecord, error)
}

// Authentication 返回一个全局认证中间件：对挂载分组下的非白名单路由强制校验
// Bearer access token，成功后将用户写入 c.Set(auth.ContextUserKey)，供各 handler
// 复用（避免二次校验）；失败统一返回 401（被禁用用户返回 400，与既有语义一致）。
//
// 该中间件只负责“认证”（你是谁），各 handler 仍各自做“授权”（权限点）检查；
// 这样即使将来新增端点漏写授权调用，也不会因缺少全局认证而裸奔。
//
// publicPaths 为公开端点的 echo 路由模板集合（含分组前缀，如
// "/api/v1/auth/login"），命中后跳过认证。
func Authentication(authenticator Authenticator, publicPaths map[string]struct{}) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			// CORS 预检请求由 CORS 中间件处理，这里直接放行。
			if c.Request().Method == http.MethodOptions {
				return next(c)
			}
			// 白名单（公开端点）跳过认证，由对应 handler 自行处理（如子协议/一次性 token）。
			if _, ok := publicPaths[c.Path()]; ok {
				return next(c)
			}

			token, err := accessTokenFromRequest(c)
			if err != nil {
				return err
			}

			user, err := authenticator.GetActiveUserFromToken(c.Request().Context(), token)
			if err != nil {
				if errors.Is(err, auth.ErrUserInactive) {
					return echo.NewHTTPError(http.StatusBadRequest, "用户已被禁用")
				}
				return echo.NewHTTPError(http.StatusUnauthorized, "Could not validate credentials")
			}

			c.Set(auth.ContextUserKey, user)
			return next(c)
		}
	}
}

// accessTokenFromRequest 解析 access token：Cookie 优先（S3 httpOnly cookie 认证），
// fallback Authorization: Bearer（兼容报表一次性 token、非浏览器客户端与过渡期前端）。
func accessTokenFromRequest(c echo.Context) (string, error) {
	if cookie, err := c.Cookie(authcookie.AccessTokenCookie); err == nil {
		if v := strings.TrimSpace(cookie.Value); v != "" {
			return v, nil
		}
	}
	return bearerToken(c)
}

// bearerToken 从 Authorization 头解析 Bearer token。
func bearerToken(c echo.Context) (string, error) {
	header := strings.TrimSpace(c.Request().Header.Get(echo.HeaderAuthorization))
	parts := strings.SplitN(header, " ", 2)
	if len(parts) != 2 || !strings.EqualFold(strings.TrimSpace(parts[0]), "Bearer") {
		return "", echo.NewHTTPError(http.StatusUnauthorized, "缺少或非法的 Authorization 头")
	}

	token := strings.TrimSpace(parts[1])
	if token == "" {
		return "", echo.NewHTTPError(http.StatusUnauthorized, "Invalid authorization token")
	}

	return token, nil
}
