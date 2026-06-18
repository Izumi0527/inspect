// Package authcookie 定义认证 Cookie 的共享名称常量。
//
// 供 auth handler（写入 Cookie）、认证中间件与 ws handler（读取 Cookie）共用，
// 既避免魔法字符串散落，也避免 ws 包反向依赖 auth/config 造成循环引用
// （ws -> auth -> settings -> monitoring -> ws）。本包不依赖任何内部包。
package authcookie

const (
	// AccessTokenCookie 承载 access token（httpOnly）。
	AccessTokenCookie = "access_token"
	// RefreshTokenCookie 承载 refresh token（httpOnly，限刷新端点路径）。
	RefreshTokenCookie = "refresh_token"
	// CSRFCookie 承载 double-submit CSRF token（非 httpOnly，供前端读取并回填请求头）。
	CSRFCookie = "csrf_token"
	// CSRFHeader 为 double-submit 校验比对的请求头名。
	CSRFHeader = "X-CSRF-Token"
	// RefreshCookiePath 限定 refresh cookie 仅在刷新端点发送，缩小暴露面。
	RefreshCookiePath = "/api/v1/auth/refresh"
)
