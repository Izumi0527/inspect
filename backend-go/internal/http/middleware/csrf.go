package middleware

import (
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"

	"github.com/your-org/inspect-system/backend-go/internal/authcookie"
)

// CSRFErrorType 为 CSRF 校验失败错误的机器可读类型，供前端识别后刷新 token 重试。
const CSRFErrorType = "CSRFTokenInvalid"

// CSRFProtection 返回 double-submit CSRF 校验中间件。
//
// 设计要点（对 Cookie 认证 fail-closed）：
//   - 安全方法(GET/HEAD/OPTIONS)与豁免端点直接放行；
//   - 仅当请求**携带 access_token cookie**（即 Cookie 认证）时强制校验：
//     csrf cookie 与 X-CSRF-Token 必须同时存在且相等，缺失或不匹配一律 403；
//     认证 Cookie 会被浏览器自动附带，必须 double-submit 防 CSRF。
//   - 纯 Bearer/非浏览器客户端不带 access_token cookie，其认证头无法被跨站
//     伪造，天然抗 CSRF，故放行。
//
// 相比以 csrf cookie 是否存在为锚点，这里以 access_token cookie 为锚点，
// 消除了“登录态必然携带 csrf cookie”这一隐式前提，对 Cookie 认证真正 fail-closed。
func CSRFProtection(exemptPaths map[string]struct{}) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			if isSafeMethod(c.Request().Method) {
				return next(c)
			}
			if _, ok := exemptPaths[c.Path()]; ok {
				return next(c)
			}

			// 非 Cookie 认证（无 access_token cookie）：Bearer/非浏览器客户端，放行。
			if _, err := c.Cookie(authcookie.AccessTokenCookie); err != nil {
				return next(c)
			}

			// Cookie 认证：csrf cookie 必须存在且非空。
			csrf, err := c.Cookie(authcookie.CSRFCookie)
			if err != nil || strings.TrimSpace(csrf.Value) == "" {
				return csrfInvalid(c)
			}

			// 请求头必须存在且与 csrf cookie 相等（double-submit）。
			header := strings.TrimSpace(c.Request().Header.Get(authcookie.CSRFHeader))
			if header == "" || header != strings.TrimSpace(csrf.Value) {
				return csrfInvalid(c)
			}

			return next(c)
		}
	}
}

// csrfInvalid 返回统一的 CSRF 校验失败响应（403 + 机器可读类型）。
func csrfInvalid(c echo.Context) error {
	return c.JSON(http.StatusForbidden, errorResponse{
		Success: false,
		Error: errorDetail{
			Type:    CSRFErrorType,
			Message: "CSRF 校验失败，请刷新页面后重试",
		},
	})
}

// isSafeMethod 判断是否为无副作用的安全方法（无需 CSRF 校验）。
func isSafeMethod(method string) bool {
	switch method {
	case http.MethodGet, http.MethodHead, http.MethodOptions:
		return true
	default:
		return false
	}
}
