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
// 设计要点（双模式安全）：
//   - 安全方法(GET/HEAD/OPTIONS)与豁免端点直接放行；
//   - 仅当请求**携带 csrf cookie** 时才强制校验 X-CSRF-Token == csrf cookie：
//     Cookie 认证会被浏览器自动附带，必须 double-submit 防 CSRF；
//     而 Bearer 前端不带 csrf cookie，其认证头无法被跨站伪造，天然抗 CSRF，故放行。
//
// 因此本中间件在不破坏 Bearer 过渡前端的前提下，对 Cookie 认证强制 CSRF 防护。
func CSRFProtection(exemptPaths map[string]struct{}) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			if isSafeMethod(c.Request().Method) {
				return next(c)
			}
			if _, ok := exemptPaths[c.Path()]; ok {
				return next(c)
			}

			cookie, err := c.Cookie(authcookie.CSRFCookie)
			if err != nil || strings.TrimSpace(cookie.Value) == "" {
				// 无 csrf cookie：非 Cookie 认证（Bearer 前端/非浏览器客户端），放行。
				return next(c)
			}

			header := strings.TrimSpace(c.Request().Header.Get(authcookie.CSRFHeader))
			if header == "" || header != strings.TrimSpace(cookie.Value) {
				return c.JSON(http.StatusForbidden, errorResponse{
					Success: false,
					Error: errorDetail{
						Type:    CSRFErrorType,
						Message: "CSRF 校验失败，请刷新页面后重试",
					},
				})
			}

			return next(c)
		}
	}
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
