package middleware

import (
	"net/http"

	"github.com/labstack/echo/v4"

	"github.com/your-org/inspect-system/backend-go/internal/auth"
)

// PasswordChangeRequiredType 为“必须先改密”错误的机器可读类型，
// 前端据此区分普通 403（无权限）与“需强制改密”，从而引导跳转改密页。
const PasswordChangeRequiredType = "PasswordChangeRequired"

// EnforcePasswordChange 返回一个全局闸：对已认证、但被标记 force_password_change=true
// 的用户，除豁免端点（改密/查看自身/登出/校验）外，一律拒绝访问业务接口（403）。
//
// 该中间件必须挂在 Authentication 之后（依赖其写入的 c.Get(auth.ContextUserKey)）。
// 公开端点（未写入用户）与豁免端点直接放行。
//
// exemptPaths 为豁免端点的 echo 路由模板集合（含分组前缀，如
// "/api/v1/auth/change-password"）。
func EnforcePasswordChange(exemptPaths map[string]struct{}) echo.MiddlewareFunc {
	return func(next echo.HandlerFunc) echo.HandlerFunc {
		return func(c echo.Context) error {
			if c.Request().Method == http.MethodOptions {
				return next(c)
			}
			if _, ok := exemptPaths[c.Path()]; ok {
				return next(c)
			}

			user, ok := c.Get(auth.ContextUserKey).(*auth.UserRecord)
			if !ok || user == nil {
				// 未认证（公开端点）不在本闸处理范围，交由后续链路。
				return next(c)
			}

			if auth.UserMustChangePassword(user) {
				return c.JSON(http.StatusForbidden, errorResponse{
					Success: false,
					Error: errorDetail{
						Type:    PasswordChangeRequiredType,
						Message: "首次登录或密码已被重置，请先修改密码后再继续操作",
					},
				})
			}

			return next(c)
		}
	}
}
