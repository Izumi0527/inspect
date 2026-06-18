package handlers

import (
	"context"
	"errors"
	"net/http"
	"strings"

	"github.com/labstack/echo/v4"

	"github.com/your-org/inspect-system/backend-go/internal/auth"
)

// PasswordChanger 为自助改密所需的最小依赖：写入新密码（含策略校验、清除强制改密标志、登出会话）。
// *settings.Service 满足该接口。
type PasswordChanger interface {
	ChangePassword(ctx context.Context, userID string, newPassword string) error
}

type AuthHandler struct {
	Service  *auth.Service
	Settings PasswordChanger
}

type loginRequest struct {
	Username   string `json:"username"`
	Password   string `json:"password"`
	RememberMe *bool  `json:"remember_me,omitempty"`
}

type loginResponse struct {
	AccessToken  string       `json:"access_token"`
	RefreshToken string       `json:"refresh_token"`
	TokenType    string       `json:"token_type"`
	ExpiresIn    int          `json:"expires_in"`
	User         auth.UserInfo `json:"user"`
}

type refreshTokenRequest struct {
	RefreshToken string `json:"refresh_token"`
}

func (h AuthHandler) Register(group *echo.Group) {
	group.POST("/auth/login", h.Login)
	group.POST("/auth/refresh", h.RefreshToken)
	group.POST("/auth/logout", h.Logout)
	group.POST("/auth/change-password", h.ChangeOwnPassword)
	group.GET("/auth/me", h.Me)
	group.GET("/auth/profile", h.Profile)
	group.GET("/auth/verify", h.Verify)
}

func (h AuthHandler) Login(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "auth service not configured")
	}

	var req loginRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}
	if strings.TrimSpace(req.Username) == "" || strings.TrimSpace(req.Password) == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "username and password are required")
	}

	user, err := h.Service.AuthenticateUser(c.Request().Context(), req.Username, req.Password)
	if err != nil {
		if errors.Is(err, auth.ErrUserLocked) {
			return echo.NewHTTPError(http.StatusLocked, "账号已锁定，请稍后重试")
		}
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to authenticate user")
	}
	if user == nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "用户名或密码错误")
	}

	rememberMe := req.RememberMe != nil && *req.RememberMe
	accessToken, refreshToken, expiresIn, err := h.Service.IssueTokensWithSession(
		c.Request().Context(),
		user,
		rememberMe,
		c.RealIP(),
		c.Request().UserAgent(),
	)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to create session tokens")
	}

	userInfo, err := h.Service.BuildUserInfo(c.Request().Context(), user)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to build user info")
	}

	_ = h.Service.UpdateLastLogin(c.Request().Context(), user.ID, c.RealIP())

	return c.JSON(http.StatusOK, loginResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		TokenType:    "bearer",
		ExpiresIn:    expiresIn,
		User:         userInfo,
	})
}

func (h AuthHandler) RefreshToken(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "auth service not configured")
	}

	var req refreshTokenRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}
	if strings.TrimSpace(req.RefreshToken) == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "refresh_token is required")
	}

	accessToken, refreshToken, expiresIn, user, err := h.Service.RefreshTokensWithSession(c.Request().Context(), req.RefreshToken)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "刷新令牌无效或已过期")
	}

	userInfo, err := h.Service.BuildUserInfo(c.Request().Context(), user)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to build user info")
	}

	return c.JSON(http.StatusOK, loginResponse{
		AccessToken:  accessToken,
		RefreshToken: refreshToken,
		TokenType:    "bearer",
		ExpiresIn:    expiresIn,
		User:         userInfo,
	})
}

func (h AuthHandler) Logout(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "auth service not configured")
	}

	token, err := readBearerToken(c)
	if err != nil {
		return err
	}
	_ = h.Service.LogoutSession(c.Request().Context(), token)

	return c.JSON(http.StatusOK, map[string]interface{}{
		"message": "登出成功",
	})
}

func (h AuthHandler) Me(c echo.Context) error {
	return h.profileResponse(c)
}

func (h AuthHandler) Profile(c echo.Context) error {
	return h.profileResponse(c)
}

type changeOwnPasswordRequest struct {
	CurrentPassword string `json:"current_password"`
	NewPassword     string `json:"new_password"`
}

// ChangeOwnPassword 自助改密：校验旧口令后写入新口令。
// 复用 settings 的改密逻辑（密码策略校验、清除 force_password_change、按策略登出会话）。
// 这是“强制改密”用户被全局闸拦截后唯一可访问的写入口（见 middleware.EnforcePasswordChange 豁免名单）。
// 改密成功后会按安全策略登出所有会话，当前 token 随即失效，前端需引导重新登录。
func (h AuthHandler) ChangeOwnPassword(c echo.Context) error {
	if h.Service == nil || h.Settings == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "auth service not configured")
	}

	user, err := h.requireActiveUser(c)
	if err != nil {
		return err
	}

	var req changeOwnPasswordRequest
	if err := c.Bind(&req); err != nil {
		return echo.NewHTTPError(http.StatusBadRequest, "invalid payload")
	}
	if strings.TrimSpace(req.CurrentPassword) == "" || strings.TrimSpace(req.NewPassword) == "" {
		return echo.NewHTTPError(http.StatusBadRequest, "current_password and new_password are required")
	}
	if !h.Service.PasswordMatches(user, req.CurrentPassword) {
		return echo.NewHTTPError(http.StatusBadRequest, "当前密码不正确")
	}
	if req.NewPassword == req.CurrentPassword {
		return echo.NewHTTPError(http.StatusBadRequest, "新密码不能与当前密码相同")
	}

	if err := h.Settings.ChangePassword(c.Request().Context(), user.ID, req.NewPassword); err != nil {
		// 最常见的失败为新密码不满足密码策略，归类为客户端可纠正错误（400）。
		return echo.NewHTTPError(http.StatusBadRequest, err.Error())
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"success": true,
		"message": "密码修改成功，请使用新密码重新登录",
	})
}

func (h AuthHandler) Verify(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "auth service not configured")
	}

	token, err := readBearerToken(c)
	if err != nil {
		return err
	}

	user, err := h.Service.GetActiveUserFromToken(c.Request().Context(), token)
	if err != nil {
		return echo.NewHTTPError(http.StatusUnauthorized, "Could not validate credentials")
	}

	return c.JSON(http.StatusOK, map[string]interface{}{
		"valid": true,
		"user": map[string]interface{}{
			"id":       user.ID,
			"username": user.Username,
			"role":     user.Role,
		},
	})
}

func (h AuthHandler) profileResponse(c echo.Context) error {
	if h.Service == nil {
		return echo.NewHTTPError(http.StatusServiceUnavailable, "auth service not configured")
	}

	user, err := h.requireActiveUser(c)
	if err != nil {
		return err
	}

	info, err := h.Service.BuildUserInfo(c.Request().Context(), user)
	if err != nil {
		return echo.NewHTTPError(http.StatusInternalServerError, "failed to build user info")
	}

	return c.JSON(http.StatusOK, info)
}

func (h AuthHandler) requireActiveUser(c echo.Context) (*auth.UserRecord, error) {
	token, err := readBearerToken(c)
	if err != nil {
		return nil, err
	}

	user, err := h.Service.GetActiveUserFromToken(c.Request().Context(), token)
	if err != nil {
		if errors.Is(err, auth.ErrUserInactive) {
			return nil, echo.NewHTTPError(http.StatusBadRequest, "用户已被禁用")
		}
		return nil, echo.NewHTTPError(http.StatusUnauthorized, "Could not validate credentials")
	}

	return user, nil
}

func readBearerToken(c echo.Context) (string, error) {
	raw := strings.TrimSpace(c.Request().Header.Get("Authorization"))
	if raw == "" {
		return "", echo.NewHTTPError(http.StatusUnauthorized, "Authorization header missing")
	}

	parts := strings.Fields(raw)
	if len(parts) != 2 || !strings.EqualFold(parts[0], "Bearer") {
		return "", echo.NewHTTPError(http.StatusUnauthorized, "Invalid authorization header")
	}

	token := strings.TrimSpace(parts[1])
	if token == "" {
		return "", echo.NewHTTPError(http.StatusUnauthorized, "Invalid authorization token")
	}

	return token, nil
}

func authUserActive(user *auth.UserRecord) bool {
	if user == nil {
		return false
	}
	if user.IsActive == nil {
		return true
	}
	return *user.IsActive
}
